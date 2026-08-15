import { createFileRoute } from "@tanstack/react-router";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { convertToModelMessages, streamText, tool, type UIMessage } from "ai";
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

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = (await request.json()) as {
            messages: UIMessage[];
            marketContext?: { market?: string | null } | null;
          };
          const messages = await convertToModelMessages(body.messages);

          const selectedMarket = body.marketContext?.market ?? null;
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
