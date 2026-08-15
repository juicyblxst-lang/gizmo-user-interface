import { createFileRoute } from "@tanstack/react-router";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  generateId,
  streamText,
  tool,
  type UIMessage,
} from "ai";
import { z } from "zod";
import { GIZMO_MODEL, GIZMO_SYSTEM_PROMPT } from "@/lib/gizmo/config";

const gateway = createOpenAICompatible({
  name: "vercel-ai-gateway",
  baseURL: "https://ai-gateway.vercel.sh/v1",
  apiKey: process.env.AI_GATEWAY_API_KEY,
});

const model = gateway.chatModel(GIZMO_MODEL);

const SUPPORTED_PAIRS = ["BTC", "ETH", "SOL", "XRP", "DOGE", "HYPE"] as const;
type Symbol = (typeof SUPPORTED_PAIRS)[number];
const pair = (symbol: Symbol) => `${symbol}-USDT-SWAP`;

async function backendRequest(path: string, init?: RequestInit) {
  const base = process.env.GIZMO_BACKEND_URL;
  if (!base) throw new Error("GIZMO_BACKEND_URL is not configured");

  const response = await fetch(new URL(path, `${base.replace(/\/$/, "")}/`), init);
  const text = await response.text();
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    data = { error: text || `Backend returned HTTP ${response.status}` };
  }

  if (!response.ok) {
    const message = typeof data === "object" && data && "error" in data
      ? String((data as { error: unknown }).error)
      : `Backend returned HTTP ${response.status}`;
    throw new Error(message);
  }

  return data;
}

const tools = {
  getSignals: tool({
    description: "Get current lead-lag signals for all tracked pairs.",
    inputSchema: z.object({}),
    execute: async () => backendRequest("/api/tools/signals"),
  }),

  getMarketData: tool({
    description: "Get current price, 24h volume, high/low, and change for a specific pair.",
    inputSchema: z.object({ pair: z.enum(SUPPORTED_PAIRS) }),
    execute: async ({ pair: symbol }) => backendRequest(`/api/tools/market?pair=${encodeURIComponent(pair(symbol))}`),
  }),

  getHistory: tool({
    description: "Get past recorded signals, most recent first. Optionally filter to one pair.",
    inputSchema: z.object({
      limit: z.number().min(1).max(50).default(10),
      pair: z.enum(SUPPORTED_PAIRS).optional(),
    }),
    execute: async ({ limit, pair: symbol }) => {
      const data = await backendRequest(`/api/tools/history?limit=${limit}`);
      if (!symbol || !Array.isArray(data)) return data;

      const backendPair = pair(symbol);
      return data.filter((item: unknown) => {
        if (!item || typeof item !== "object") return false;
        const record = item as Record<string, unknown>;
        const value = record.pair ?? record.instId ?? record.symbol;
        return value === symbol || value === backendPair;
      });
    },
  }),

  monitorPair: tool({
    description: "Add a pair to the backend watchlist.",
    inputSchema: z.object({ pair: z.enum(SUPPORTED_PAIRS) }),
    execute: async ({ pair: symbol }) => backendRequest("/api/tools/monitor", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ pair: pair(symbol) }),
    }),
  }),
};

function extractPair(text: string): Symbol | null {
  const match = text.toUpperCase().match(/\b(BTC|ETH|SOL|XRP|DOGE|HYPE)\b/);
  return match ? (match[1] as Symbol) : null;
}

function isLiveMarketQuestion(text: string) {
  const lower = text.toLowerCase();
  return /\b(doing|happening|going|now|currently|right now|price|market|ticker|worth|value|cost|how much)\b/.test(lower);
}

function isSignalsQuestion(text: string) {
  return /\b(signal|signals|z-?score|lead.?lag|leader|follower|deviation|mean.?reversion)\b/i.test(text);
}

async function answerLiveMarketQuestion(text: string, selectedMarket: string | null) {
  const symbol = extractPair(text) ?? extractPair(selectedMarket ?? "") ?? "BTC";
  const [market, signals] = await Promise.all([
    backendRequest(`/api/tools/market?pair=${encodeURIComponent(pair(symbol))}`),
    backendRequest("/api/tools/signals"),
  ]);

  const record = signals && typeof signals === "object" && "pairs" in signals
    ? (signals as { pairs?: Record<string, Record<string, unknown>> }).pairs?.[pair(symbol)]
    : undefined;

  const price = Number((market as { price?: number }).price ?? 0);
  const volume = Number((market as { volume24h?: number }).volume24h ?? 0);
  const high = Number((market as { high24h?: number }).high24h ?? 0);
  const low = Number((market as { low24h?: number }).low24h ?? 0);
  const change = Number((market as { change24h?: number }).change24h ?? 0);
  const direction = String(record?.direction ?? "NEUTRAL");
  const zscore = Number(record?.zscore ?? 0);
  const lag = Number(record?.lag ?? 0);
  const correlation = record?.correlation == null ? null : Number(record.correlation);

  const lines = [
    `BTC` === symbol ? `BTC is currently trading at $${price.toLocaleString(undefined, { maximumFractionDigits: 2 })}.` : `${symbol} is currently trading at $${price.toLocaleString(undefined, { maximumFractionDigits: 6 })}.`,
    `24h range: $${low.toLocaleString(undefined, { maximumFractionDigits: 6 })} – $${high.toLocaleString(undefined, { maximumFractionDigits: 6 })}.`,
    `24h change: ${change.toFixed(2)}%. Volume: $${volume.toLocaleString(undefined, { maximumFractionDigits: 0 })}.`,
    `Gizmo signal state: ${String(record?.signal ?? "UNKNOWN")}; direction ${direction}; z-score ${zscore.toFixed(2)}${lag ? `; estimated lag ${lag}h` : ""}${correlation == null ? "" : `; correlation ${correlation.toFixed(3)}`}.`,
  ];

  return lines.join("\n");
}

async function answerSignalsQuestion(text: string) {
  const symbol = extractPair(text);
  const data = await backendRequest("/api/tools/signals");
  if (!data || typeof data !== "object") return "Gizmo could not read the current signal state.";

  const pairs = (data as { pairs?: Record<string, Record<string, unknown>> }).pairs ?? {};
  const entries = Object.entries(pairs).filter(([key]) => !symbol || key.startsWith(`${symbol}-`));
  if (entries.length === 0) return "Gizmo has no signal data for that market right now.";

  return entries.map(([key, value]) => {
    const z = Number(value.zscore ?? 0);
    const direction = String(value.direction ?? "NEUTRAL");
    const signal = String(value.signal ?? "UNKNOWN");
    return `${key.replace("-USDT-SWAP", "")}: ${signal}, ${direction}, z-score ${z.toFixed(2)}.`;
  }).join("\n");
}

function directMarketIntent(text: string, selectedMarket: string | null) {
  const pairSymbol = extractPair(text) ?? extractPair(selectedMarket ?? "");
  return pairSymbol && (isLiveMarketQuestion(text) || isSignalsQuestion(text));
}

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = (await request.json()) as {
            messages: UIMessage[];
            marketContext?: { market?: string | null } | null;
          };
          const selectedMarket = body.marketContext?.market ?? null;
          const lastUserMessage = [...body.messages].reverse().find((message) => message.role === "user");
          const userText = lastUserMessage?.parts
            .map((part) => (part.type === "text" ? part.text : ""))
            .join(" ")
            .trim() ?? "";

          // Live market questions use Gizmo's existing backend tools directly.
          // This avoids requiring an external LLM gateway just to retrieve factual market data.
          if (directMarketIntent(userText, selectedMarket)) {
            const responseText = isSignalsQuestion(userText)
              ? await answerSignalsQuestion(userText)
              : await answerLiveMarketQuestion(userText, selectedMarket);

            const stream = createUIMessageStream({
              originalMessages: body.messages,
              generateId,
              execute: ({ writer }) => {
                const textId = generateId();
                writer.write({ type: "text-start", id: textId });
                writer.write({ type: "text-delta", id: textId, delta: responseText });
                writer.write({ type: "text-end", id: textId });
              },
            });

            return createUIMessageStreamResponse({ stream });
          }

          const messages = await convertToModelMessages(body.messages);
          const contextPrompt = selectedMarket
            ? `${GIZMO_SYSTEM_PROMPT}\n\nThe user currently has ${selectedMarket} selected in the UI. Treat that as the active market context when their request is ambiguous, but still call the relevant live tool before stating any market data.`
            : GIZMO_SYSTEM_PROMPT;

          const result = streamText({
            model,
            system: contextPrompt,
            messages,
            tools,
            stopWhen: ({ steps }) => steps.length >= 5,
          });

          return result.toUIMessageStreamResponse();
        } catch (error) {
          console.error("GIZMO chat error:", error);
          return new Response(JSON.stringify({
            error: error instanceof Error ? error.message : "Server error",
          }), {
            status: 503,
            headers: { "content-type": "application/json" },
          });
        }
      },
    },
  },
});
