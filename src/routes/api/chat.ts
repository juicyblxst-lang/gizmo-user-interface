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

  if (data && typeof data === "object" && "error" in data && (data as { error?: unknown }).error) {
    throw new Error(String((data as { error: unknown }).error));
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
    description: "Get current live market data for one supported asset.",
    inputSchema: z.object({ pair: z.enum(SUPPORTED_PAIRS) }),
    execute: async ({ pair: symbol }) => backendRequest(`/api/tools/market?pair=${encodeURIComponent(pair(symbol))}`),
  }),

  getLeadLagAnalysis: tool({
    description: "Get the factual current lead-lag measurements available from Gizmo. The current engine measures BTC as the leader against the other five supported assets. Never infer a lead-lag relationship that is not present in the returned data.",
    inputSchema: z.object({ pair: z.enum(SUPPORTED_PAIRS).optional() }),
    execute: async ({ pair: symbol }) => {
      const data = await backendRequest("/api/tools/signals");
      const pairs = data && typeof data === "object" && "pairs" in data
        ? (data as { pairs?: Record<string, Record<string, unknown>> }).pairs ?? {}
        : {};

      const selected = symbol
        ? Object.entries(pairs).filter(([key]) => key.startsWith(`${symbol}-`))
        : Object.entries(pairs);

      return {
        engine: "Gizmo lead-lag engine",
        leaderModel: "BTC",
        measurements: selected.map(([key, value]) => ({
          pair: key,
          leader: key.startsWith("BTC-") ? "BTC" : "BTC",
          follower: key.replace("-USDT-SWAP", ""),
          lagHours: value.lag ?? null,
          correlation: value.correlation ?? null,
          zscore: value.zscore ?? null,
          direction: value.direction ?? "NEUTRAL",
          signal: value.signal ?? "NO_DATA",
          price: value.price ?? null,
        })),
        note: "These are measurements produced by the existing backend engine; no relationship is inferred by the UI.",
      };
    },
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

function extractLastReferencedPair(messages: UIMessage[], selectedMarket: string | null): Symbol | null {
  for (const message of [...messages].reverse()) {
    const text = message.parts
      .map((part) => (part.type === "text" ? part.text : ""))
      .join(" ");
    const found = extractPair(text);
    if (found) return found;
  }
  return extractPair(selectedMarket ?? "");
}

function isLiveMarketQuestion(text: string) {
  return /\b(doing|happening|going|now|currently|right now|price|market|ticker|worth|value|cost|how much)\b/i.test(text);
}

function isSignalsQuestion(text: string) {
  return /\b(signal|signals|z-?score|lead.?lag|leader|follower|deviation|mean.?reversion)\b/i.test(text);
}

function isFollowUp(text: string) {
  return /^(why|how|what do you mean|why is that|why do you think so|is that unusual|what about it|and what about that|explain|tell me more|how so|what does that mean)\b/i.test(text.trim());
}

function isRelationshipQuestion(text: string) {
  return /\b(relationship|lead.?lag|leads?|follows?|lag|correlation|correlated|between|relative to)\b/i.test(text);
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

  return [
    `${symbol} is currently trading at $${price.toLocaleString(undefined, { maximumFractionDigits: symbol === "BTC" ? 2 : 6 })}.`,
    `24h range: $${low.toLocaleString(undefined, { maximumFractionDigits: 6 })} – $${high.toLocaleString(undefined, { maximumFractionDigits: 6 })}.`,
    `24h change: ${change.toFixed(2)}%. Volume: $${volume.toLocaleString(undefined, { maximumFractionDigits: 0 })}.`,
    `Gizmo signal state: ${String(record?.signal ?? "UNKNOWN")}; direction ${direction}; z-score ${zscore.toFixed(2)}${lag ? `; estimated lag ${lag}h` : ""}${correlation == null ? "" : `; correlation ${correlation.toFixed(3)}`}.`,
  ].join("\n");
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
    const lag = value.lag == null ? null : Number(value.lag);
    const correlation = value.correlation == null ? null : Number(value.correlation);
    return `${key.replace("-USDT-SWAP", "")}: ${signal}, ${direction}, z-score ${z.toFixed(2)}${lag == null ? "" : `, lag ${lag}h`}${correlation == null ? "" : `, correlation ${correlation.toFixed(3)}`}.`;
  }).join("\n");
}

async function answerRelationshipQuestion(text: string) {
  const mentions = [...text.toUpperCase().matchAll(/\b(BTC|ETH|SOL|XRP|DOGE|HYPE)\b/g)].map((match) => match[1] as Symbol);
  const unique = [...new Set(mentions)];
  const data = await backendRequest("/api/tools/signals");
  const pairs = data && typeof data === "object" && "pairs" in data
    ? (data as { pairs?: Record<string, Record<string, unknown>> }).pairs ?? {}
    : {};

  if (unique.length >= 2 && !unique.includes("BTC")) {
    return `The current Gizmo signal engine does not claim a direct ${unique[0]}/${unique[1]} lead-lag relationship. Its current quantitative model uses BTC as the leader and measures BTC against the other supported assets. I won't invent a ${unique[0]} → ${unique[1]} relationship.`;
  }

  const follower = unique.find((symbol) => symbol !== "BTC") ?? "SOL";
  const value = pairs[pair(follower)];
  if (!value) return `Gizmo has no current lead-lag measurement available for BTC → ${follower}.`;

  return [
    `Current measured relationship: BTC → ${follower}.`,
    `Estimated lag: ${value.lag ?? "N/A"} hours.`,
    `Correlation: ${value.correlation ?? "N/A"}.`,
    `Current z-score: ${value.zscore ?? "N/A"}.`,
    `Signal state: ${value.signal ?? "N/A"}; direction: ${value.direction ?? "N/A"}.`,
    "These values are measurements from the Gizmo engine, not a prediction that the relationship will persist or revert.",
  ].join("\n");
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
          const contextPair = extractLastReferencedPair(body.messages, selectedMarket);
          const hasExplicitPair = !!extractPair(userText);

          if (isRelationshipQuestion(userText) && (hasExplicitPair || contextPair)) {
            const responseText = await answerRelationshipQuestion(userText || `relationship with ${contextPair}`);
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

          if (hasExplicitPair && (isLiveMarketQuestion(userText) || isSignalsQuestion(userText))) {
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

          // Follow-ups retain the last referenced asset and receive fresh evidence.
          // The model is then responsible for explaining that evidence in context.
          const evidencePair = contextPair ?? (selectedMarket ? extractPair(selectedMarket) : null);
          let verifiedContext = "";
          if (evidencePair && isFollowUp(userText)) {
            const [market, signals] = await Promise.all([
              backendRequest(`/api/tools/market?pair=${encodeURIComponent(pair(evidencePair))}`),
              backendRequest("/api/tools/signals"),
            ]);
            verifiedContext = [
              `CONVERSATION SUBJECT: ${evidencePair}`,
              "FRESH VERIFIED MARKET EVIDENCE:",
              JSON.stringify(market),
              "FRESH VERIFIED SIGNAL EVIDENCE:",
              JSON.stringify(signals),
              "Use this evidence to answer the follow-up. Explain reasoning, but do not invent facts or numbers. If the evidence does not support a conclusion, say so.",
            ].join("\n");
          }

          const messages = await convertToModelMessages(body.messages);
          const contextPrompt = [
            GIZMO_SYSTEM_PROMPT,
            selectedMarket ? `The user currently has ${selectedMarket} selected in the UI. Treat it as active context when their request is ambiguous.` : "",
            verifiedContext,
          ].filter(Boolean).join("\n\n");

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
