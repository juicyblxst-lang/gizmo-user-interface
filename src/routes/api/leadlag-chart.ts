import { createFileRoute } from "@tanstack/react-router";

const SUPPORTED_PAIRS = ["BTC", "ETH", "SOL", "XRP", "DOGE", "HYPE"] as const;
type Symbol = (typeof SUPPORTED_PAIRS)[number];

function isSupportedPair(value: string): value is Symbol {
  return SUPPORTED_PAIRS.includes(value as Symbol);
}

async function backendRequest(path: string) {
  const base = process.env.GIZMO_BACKEND_URL;
  if (!base) throw new Error("GIZMO_BACKEND_URL is not configured");

  const response = await fetch(new URL(path, `${base.replace(/\/$/, "")}/`), {
    cache: "no-store",
  });
  const text = await response.text();

  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    data = { error: text || `Backend returned HTTP ${response.status}` };
  }

  if (!response.ok) {
    const message =
      typeof data === "object" && data && "error" in data
        ? String((data as { error: unknown }).error)
        : `Backend returned HTTP ${response.status}`;
    throw new Error(message);
  }

  return data;
}

export const Route = createFileRoute("/api/leadlag-chart")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const url = new URL(request.url);
          const rawPair = url.searchParams.get("pair") ?? "SOL-USDT-SWAP";
          const symbol = rawPair.replace(/-USDT-SWAP$/i, "").toUpperCase();

          if (!isSupportedPair(symbol)) {
            return Response.json({ error: "Unsupported pair" }, { status: 400 });
          }

          const data = await backendRequest(
            `/api/tools/leadlag-chart?pair=${encodeURIComponent(`${symbol}-USDT-SWAP`)}`,
          );

          return Response.json(data, {
            headers: {
              "cache-control": "no-store, max-age=0",
            },
          });
        } catch (error) {
          return Response.json(
            { error: error instanceof Error ? error.message : "Lead-lag data unavailable" },
            { status: 503 },
          );
        }
      },
    },
  },
});
