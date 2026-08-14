import { createFileRoute } from "@tanstack/react-router";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { streamText, tool, convertToModelMessages, type UIMessage } from "ai";
import { z } from "zod";
import path from "node:path";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);

import { GIZMO_MODEL, GIZMO_SYSTEM_PROMPT } from "@/lib/gizmo/config";

const gateway = createOpenAICompatible({
  name: "vercel-ai-gateway",
  baseURL: "https://ai-gateway.vercel.sh/v1",
  apiKey: process.env.AI_GATEWAY_API_KEY,
});

const model = gateway.chatModel(GIZMO_MODEL);

const ENGINE_TOOLS_DIR =
  process.env.GIZMO_ENGINE_PATH ??
  "/Users/mac/.openclaw/workspace/skills/leadlag/tools";

const { getSignals } = require(path.join(ENGINE_TOOLS_DIR, "signal-tool"));
const { getMarketData } = require(path.join(ENGINE_TOOLS_DIR, "market-tool"));
const { getHistory } = require(path.join(ENGINE_TOOLS_DIR, "history-tool"));
const { addMonitor, getMonitored } = require(path.join(ENGINE_TOOLS_DIR, "monitor-tool"));

const tools = {
  getSignals: tool({
    description:
      "Get current lead-lag signals for all tracked pairs (BTC, ETH, SOL, XRP, DOGE, HYPE). Returns real z-scores, direction, and confidence computed from live OKX data. Use this whenever the user asks about signals, deviations, or what's happening in the market.",
    inputSchema: z.object({}),
    execute: async () => {
      const data = await getSignals();
      if (data.error) return { error: true, message: `Engine error: ${data.error}` };
      return data;
    },
  }),
  getMarketData: tool({
    description: "Get current price, 24h volume, high/low, and change for a specific pair.",
    inputSchema: z.object({ pair: z.enum(["BTC", "ETH", "SOL", "XRP", "DOGE", "HYPE"]) }),
    execute: async ({ pair }) => {
      const data = await getMarketData(`${pair}-USDT-SWAP`);
      if (!data || data.error) return { error: true, message: `Could not fetch market data for ${pair}` };
      return data;
    },
  }),
  getHistory: tool({
    description: "Get past recorded signals, most recent first.",
    inputSchema: z.object({
      limit: z.number().min(1).max(50).default(10),
      pair: z.enum(["BTC", "ETH", "SOL", "XRP", "DOGE", "HYPE"]).optional(),
    }),
    execute: async ({ limit, pair }) => {
      const data = await getHistory(limit, pair ? `${pair}-USDT-SWAP` : null);
      if (data.error) return { error: true, message: data.error };
      return data;
    },
  }),
  monitorPair: tool({
    description: "Add a pair to the watchlist.",
    inputSchema: z.object({ pair: z.enum(["BTC", "ETH", "SOL", "XRP", "DOGE", "HYPE"]) }),
    execute: async ({ pair }) => addMonitor(`${pair}-USDT-SWAP`),
  }),
  getMonitoredPairs: tool({
    description: "Get the list of pairs currently on the watchlist.",
    inputSchema: z.object({}),
    execute: async () => getMonitored(),
  }),
};

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = (await request.json()) as { messages: UIMessage[] };
          const result = streamText({
            model,
            system: GIZMO_SYSTEM_PROMPT,
            messages: convertToModelMessages(body.messages),
            tools,
            stopWhen: ({ steps }) => steps.length >= 5,
          });
          return result.toUIMessageStreamResponse();
        } catch (err) {
          console.error("GIZMO chat error:", err);
          return new Response("Server error", { status: 500 });
        }
      },
    },
  },
});