export const runtime = "nodejs";
export const maxDuration = 30;

const BACKEND_URL = (process.env["GIZMO_BACKEND_URL"] || "https://gizmo-backend-zkft.onrender.com").replace(/\/$/, "");

export default async function handler(request: Request) {
  if (request.method !== "GET") return new Response("Method Not Allowed", { status: 405 });

  const url = new URL(request.url);
  const pair = url.searchParams.get("pair") || "SOL-USDT-SWAP";
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25000);

  try {
    const response = await fetch(`${BACKEND_URL}/api/tools/leadlag-chart?pair=${encodeURIComponent(pair)}`, {
      signal: controller.signal,
      cache: "no-store",
      headers: { accept: "application/json" },
    });
    const body = await response.text();
    return new Response(body, {
      status: response.status,
      headers: {
        "content-type": response.headers.get("content-type") || "application/json; charset=utf-8",
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Lead-lag backend unavailable" }), {
      status: 503,
      headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
    });
  } finally {
    clearTimeout(timer);
  }
}
