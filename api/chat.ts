import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { convertToModelMessages, streamText, tool, type UIMessage } from "ai";
import { z } from "zod";

const BACKEND_URL = process.env["GIZMO_BACKEND_URL"];
const API_KEY = process.env["AI_GATEWAY_API_KEY"];
const MODEL = "google/gemini-3.6-flash";

const gateway = createOpenAICompatible({
  name: "vercel-ai-gateway",
  baseURL: "https://ai-gateway.vercel.sh/v1",
  ...(API_KEY ? { apiKey: API_KEY } : {}),
});

const PAIRS = ["BTC", "ETH", "SOL", "XRP", "DOGE", "HYPE"] as const;
type Symbol = (typeof PAIRS)[number];
const pair = (symbol: Symbol) => `${symbol}-USDT-SWAP`;

const SYSTEM = `You are GIZMO, a trading intelligence agent running inside its own terminal workspace.
Voice: concise, technical, calm, lightly playful. Never hype.

GIZMO covers BTC, ETH, SOL, XRP, DOGE, and HYPE. The backend is the sole source of truth for live market and lead-lag numbers.

NON-NEGOTIABLE:
- For any question about current price, market state, signals, z-score, correlation, lag, leadership, or recent recorded data, use the appropriate tool first.
- Never invent, estimate, or substitute market numbers. Only state values returned by a tool.
- Clearly distinguish live measurements from your interpretation.
- A backend/tool failure must be reported as a failure, never as a calm or neutral market.
- Never claim to execute trades, move funds, or connect wallets.
- Use the conversation history to understand follow-ups such as "why?", "what about SOL?", and "is it leading anything?".
- Stay within GIZMO's six-pair market intelligence scope.
- When explaining a measurement, reason from the returned evidence rather than repeating a fixed template. Vary natural wording while preserving factual claims.`;

async function backend(path: string, init?: RequestInit) {
  if (!BACKEND_URL) throw new Error("GIZMO_BACKEND_URL is not configured in Vercel");
  const response = await fetch(new URL(path, `${BACKEND_URL.replace(/\/$/, "")}/`), init);
  const text = await response.text();
  let data: unknown;
  try { data = JSON.parse(text); } catch { data = { error: text || `Backend returned HTTP ${response.status}` }; }
  if (!response.ok) throw new Error(typeof data === "object" && data && "error" in data ? String((data as { error: unknown }).error) : `Backend returned HTTP ${response.status}`);
  if (data && typeof data === "object" && "error" in data && (data as { error?: unknown })["error"]) throw new Error(String((data as { error: unknown })["error"]));
  return data;
}

const tools = {
  getSignals: tool({
    description: "Current factual lead-lag measurements for all six tracked pairs.",
    inputSchema: z.object({}),
    execute: () => backend("/api/tools/signals"),
  }),
  getMarketData: tool({
    description: "Current factual market data for one tracked pair.",
    inputSchema: z.object({ pair: z.enum(PAIRS) }),
    execute: ({ pair: symbol }) => backend(`/api/tools/market?pair=${encodeURIComponent(pair(symbol))}`),
  }),
  getLeadLagChartData: tool({
    description: "Current factual lead-lag chart measurements calculated by the existing backend engine.",
    inputSchema: z.object({ pair: z.enum(PAIRS) }),
    execute: ({ pair: symbol }) => backend(`/api/tools/leadlag-chart?pair=${encodeURIComponent(pair(symbol))}`),
  }),
  getHistory: tool({
    description: "Past recorded lead-lag observations. Do not call records an exact time window unless timestamps establish it.",
    inputSchema: z.object({ limit: z.number().min(1).max(50).default(20), pair: z.enum(PAIRS).optional() }),
    execute: async ({ limit, pair: symbol }) => {
      const data = await backend(`/api/tools/history?limit=${limit}`);
      if (!symbol || !Array.isArray(data)) return data;
      return data.filter((item: unknown) => {
        if (!item || typeof item !== "object") return false;
        const record = item as Record<string, unknown>;
        const value = record["pair"] ?? record["instId"] ?? record["symbol"];
        return value === symbol || value === pair(symbol);
      });
    },
  }),
};

export default async function handler(request: Request) {
  if (request.method !== "POST") return new Response("Method Not Allowed", { status: 405 });
  try {
    const body = await request.json() as { messages?: UIMessage[]; marketContext?: { market?: string | null } | null };
    const uiMessages = body.messages ?? [];
    const selectedMarket = body.marketContext?.market ?? null;
    const context = selectedMarket ? `The user currently has ${selectedMarket} selected in the UI.` : "";
    const messages = await convertToModelMessages(uiMessages);
    const result = streamText({
      model: gateway.chatModel(MODEL),
      system: `${SYSTEM}\n${context}`,
      messages,
      tools,
      stopWhen: ({ steps }) => steps.length >= 5,
    });
    return result.toUIMessageStreamResponse();
  } catch (error) {
    console.error("GIZMO deployed chat error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "GIZMO chat failed" }), {
      status: 503,
      headers: { "content-type": "application/json" },
    });
  }
}
