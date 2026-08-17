import { createFileRoute } from "@tanstack/react-router";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { generateText, type UIMessage } from "ai";
import { GIZMO_MODEL, GIZMO_SYSTEM_PROMPT } from "@/lib/gizmo/config";

const gateway = createOpenAICompatible({
  name: "vercel-ai-gateway",
  baseURL: "https://ai-gateway.vercel.sh/v1",
  apiKey: process.env.AI_GATEWAY_API_KEY,
});

const model = gateway.chatModel(GIZMO_MODEL);

async function backendRequest(messages: UIMessage[]) {
  const base = process.env.GIZMO_BACKEND_URL;
  if (!base) throw new Error("GIZMO_BACKEND_URL is not configured on Vercel");
  const response = await fetch(new URL("/api/agent/chat", `${base.replace(/\/$/, "")}/`), {
    method: "POST",
    headers: { "content-type": "application/json" },
    cache: "no-store",
    body: JSON.stringify({ messages }),
  });
  const text = await response.text();
  let data: any = {};
  try { data = JSON.parse(text); } catch { throw new Error(text || `Gizmo backend returned HTTP ${response.status}`); }
  if (!response.ok) throw new Error(data?.error || `Gizmo backend returned HTTP ${response.status}`);
  return data;
}

function textOf(message: UIMessage) {
  return message.parts.map((part) => part.type === "text" ? part.text : "").join("");
}

export const Route = createFileRoute("/api/workspace-chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = await request.json() as { messages?: UIMessage[] };
          const messages = Array.isArray(body.messages) ? body.messages : [];
          const intelligence = await backendRequest(messages);

          if (intelligence?.handled && typeof intelligence.response === "string") {
            return Response.json({ text: intelligence.response, source: "workspace-intelligence", context: intelligence.context ?? null });
          }

          const promptMessages = messages.map((message) => ({
            role: message.role as "user" | "assistant",
            content: textOf(message),
          }));
          const result = await generateText({
            model,
            system: `${GIZMO_SYSTEM_PROMPT}\n\nThe verified workspace intelligence bridge handles live market and lead-lag questions. For this fallback, do not invent live numbers or claim to have live market access.`,
            messages: promptMessages,
          });
          return Response.json({ text: result.text, source: "model-fallback", context: null });
        } catch (error) {
          console.error("GIZMO workspace chat error:", error);
          return Response.json({ error: error instanceof Error ? error.message : "GIZMO chat failed" }, { status: 503 });
        }
      },
    },
  },
});
