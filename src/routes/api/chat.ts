import { createFileRoute } from "@tanstack/react-router";

type MarketContext = {
  market: string;
  timeframe: "1m" | "5m" | "15m" | "1h" | "4h" | "1d";
};

type ChatRequest = {
  messages?: unknown[];
  marketContext?: MarketContext | null;
};

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = (await request.json().catch(() => ({}))) as ChatRequest;

          const marketContext = body.marketContext ?? null;

          console.log("GIZMO request", {
            marketContext,
            messages: body.messages,
          });

          const response = {
            messages: [
              {
                id: `gizmo-${Date.now()}`,
                role: "assistant",
                parts: [
                  {
                    type: "text",
                    text: marketContext
                      ? `GIZMO context received: ${marketContext.market} · ${marketContext.timeframe}`
                      : "GIZMO stub response.",
                  },
                ],
                createdAt: Date.now(),
              },
            ],
          };

          return new Response(JSON.stringify(response), {
            status: 200,
            headers: {
              "content-type": "application/json",
            },
          });
        } catch (err) {
          console.error("GIZMO chat error:", err);

          return new Response("Server error", {
            status: 500,
          });
        }
      },
    },
  },
});