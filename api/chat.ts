export const runtime = "nodejs";
export const maxDuration = 15;

const BACKEND_URL = (process.env["GIZMO_BACKEND_URL"] || "https://gizmo-backend-zkft.onrender.com").replace(/\/$/, "");
const PAIRS = ["BTC", "ETH", "SOL", "XRP", "DOGE", "HYPE"] as const;
type Symbol = (typeof PAIRS)[number];
const SYMBOL_ALIASES: Record<string, Symbol> = { BTC: "BTC", BITCOIN: "BTC", ETH: "ETH", ETHEREUM: "ETH", SOL: "SOL", SOLANA: "SOL", XRP: "XRP", DOGE: "DOGE", DOGECOIN: "DOGE", HYPE: "HYPE" };

function symbolFromText(text: string): Symbol | null {
  const match = text.toUpperCase().match(/\b(BTC|BITCOIN|ETH|ETHEREUM|SOL|SOLANA|XRP|DOGE|DOGECOIN|HYPE)\b/);
  return match ? SYMBOL_ALIASES[match[1] ?? ""] ?? null : null;
}
function pair(symbol: Symbol) { return `${symbol}-USDT-SWAP`; }
function textOf(message: any) { return Array.isArray(message?.parts) ? message.parts.map((part: any) => part?.type === "text" ? part.text : "").join("") : typeof message?.content === "string" ? message.content : ""; }
function isMarketQuestion(text: string) { return /\b(btc|bitcoin|eth|ethereum|sol|solana|xrp|doge|dogecoin|hype|market|price|lead|lag|correlation|signal|z-?score|doing|happening|going|now|currently|right now)\b/i.test(text); }

async function marketData(symbol: Symbol) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(`${BACKEND_URL}/api/tools/market?pair=${encodeURIComponent(pair(symbol))}`, { signal: controller.signal, cache: "no-store", headers: { accept: "application/json" } });
    const raw = await response.text();
    let data: any;
    try { data = JSON.parse(raw); } catch { throw new Error(raw || `Render HTTP ${response.status}`); }
    if (!response.ok || data?.error) throw new Error(data?.error || `Render HTTP ${response.status}`);
    return data;
  } finally { clearTimeout(timer); }
}

function answer(symbol: Symbol, market: any) {
  return `Right now, ${symbol} is at $${market?.price}. The live feed shows a 24h range of $${market?.low24h}–$${market?.high24h}, ${market?.change24h}% change, and ${market?.volume24h} volume. The lead-lag chart below uses Gizmo's existing intelligence engine for the measured relationship data.`;
}

export default async function handler(request: Request) {
  if (request.method !== "POST") return new Response("Method Not Allowed", { status: 405 });
  try {
    const body = await request.json();
    const messages = Array.isArray(body?.messages) ? body.messages : [];
    const latest = textOf(messages[messages.length - 1]);
    if (!isMarketQuestion(latest)) {
      return Response.json({ text: "Hey — I'm GIZMO. Ask me about BTC, ETH, SOL, XRP, DOGE, HYPE, or the lead-lag relationships between them." });
    }
    let symbol = symbolFromText(latest);
    if (!symbol) for (let i = messages.length - 2; i >= 0; i -= 1) { symbol = symbolFromText(textOf(messages[i])); if (symbol) break; }
    if (!symbol) symbol = "BTC";
    const market = await marketData(symbol);
    return Response.json({ text: answer(symbol, market), market, pair: pair(symbol), signalAvailable: false }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    console.error("GIZMO chat failed:", error);
    return Response.json({ error: error instanceof Error ? error.message : "GIZMO could not complete that transmission." }, { status: 503, headers: { "cache-control": "no-store" } });
  }
}
