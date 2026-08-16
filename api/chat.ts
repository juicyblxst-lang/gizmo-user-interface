export const runtime = "nodejs";
export const maxDuration = 60;

const BACKEND_URL = (process.env["GIZMO_BACKEND_URL"] || "https://gizmo-backend-zkft.onrender.com").replace(/\/$/, "");
const PAIRS = ["BTC", "ETH", "SOL", "XRP", "DOGE", "HYPE"] as const;
type Symbol = (typeof PAIRS)[number];
const SYMBOL_ALIASES: Record<string, Symbol> = { BTC: "BTC", BITCOIN: "BTC", ETH: "ETH", ETHEREUM: "ETH", SOL: "SOL", SOLANA: "SOL", XRP: "XRP", DOGE: "DOGE", DOGECOIN: "DOGE", HYPE: "HYPE" };

function symbolFromText(text: string): Symbol | null {
  const match = text.toUpperCase().match(/\b(BTC|BITCOIN|ETH|ETHEREUM|SOL|SOLANA|XRP|DOGE|DOGECOIN|HYPE)\b/);
  if (!match) return null;
  return SYMBOL_ALIASES[match[1] ?? ""] ?? null;
}
function pair(symbol: Symbol) { return `${symbol}-USDT-SWAP`; }
function textOf(message: any) { return Array.isArray(message?.parts) ? message.parts.map((part: any) => part?.type === "text" ? part.text : "").join("") : typeof message?.content === "string" ? message.content : ""; }

async function backend(path: string, timeoutMs: number, retries = 1) {
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(`${BACKEND_URL}${path}`, { signal: controller.signal, cache: "no-store", headers: { accept: "application/json" } });
      const raw = await response.text();
      let data: any;
      try { data = JSON.parse(raw); } catch { throw new Error(raw || `Backend HTTP ${response.status}`); }
      if (!response.ok || data?.error) throw new Error(data?.error || `Backend HTTP ${response.status}`);
      return data;
    } catch (error) {
      lastError = error instanceof Error && error.name === "AbortError" ? new Error(`Render request timed out after ${timeoutMs / 1000}s`) : error;
      if (attempt < retries) await new Promise((resolve) => setTimeout(resolve, 500));
    } finally { clearTimeout(timer); }
  }
  throw lastError instanceof Error ? lastError : new Error("Render request failed");
}

function stableVariant(prompt: string, symbol: Symbol) { let hash = 0; for (const char of `${symbol}:${prompt}`) hash = (hash * 31 + char.charCodeAt(0)) >>> 0; return hash % 4; }
function naturalAnswer(symbol: Symbol, market: any, signal: any, prompt: string, hasConversation: boolean) {
  const price = market?.price, change = market?.change24h, low = market?.low24h, high = market?.high24h, volume = market?.volume24h;
  const direction = signal?.direction ?? "UNKNOWN", z = signal?.zscore ?? "UNKNOWN", lag = signal?.lag ?? "UNKNOWN", state = signal?.signal ?? "UNKNOWN";
  const lower = prompt.toLowerCase(), variant = stableVariant(prompt, symbol);
  const leadQuestion = /\b(lead|leading|lag|follows|follower|correlation|relationship|signal|signals|z-?score)\b/i.test(lower);
  const recentQuestion = /\b(last|past|recent|hours?|30m|1h|4h|15m)\b/i.test(lower);
  const followUp = hasConversation || /^(why|how|what do you mean|why do you think|is that|what about|explain|tell me more|how so|what happened|has it|did it)\b/i.test(prompt.trim());
  if (leadQuestion) {
    const correlation = typeof signal?.correlation === "number" ? `correlation ${signal.correlation}` : "no correlation value is currently recorded";
    const lagText = typeof signal?.lag === "number" ? `a measured lag of ${lag}h` : "no measured lag is currently recorded";
    return [`${symbol} is currently classified as ${state}. The engine shows ${correlation} and ${lagText}. Those are measured relationships, not a forecast.`,`The current lead-lag read has ${symbol} at ${state}, with ${correlation} and a measured lag of ${lag}h. That's the engine evidence right now.`,`What the engine can establish right now is ${state}: ${correlation}, lag ${lag}h. I won't turn that into a prediction.`,`Right now the measurable relationship is ${state}, with ${correlation} and ${lag}h lag.`][variant];
  }
  if (recentQuestion) return `For the recent view, the live snapshot has ${symbol} at $${price}. The available market feed reports a 24h range of $${low}–$${high}, change ${change}%, and volume ${volume}. The lead-lag engine currently reads ${state}, direction ${direction}, z-score ${z}, lag ${lag}h. I won't invent a four-hour conclusion without recorded observations covering that exact window.`;
  if (followUp) return [`The short version: the live data points to ${state}. ${symbol} is at $${price}, with a 24h change of ${change}%. The engine reads direction ${direction}, z-score ${z}, and measured lag ${lag}h.`,`What makes me say that is the current engine evidence rather than a guess. ${symbol} is at $${price}; the engine has it at ${state}, direction ${direction}, z-score ${z}, lag ${lag}h.`,`The key thing I'm looking at is the measured state, not just the headline price. ${symbol} is $${price}, and the engine currently reports ${state}, direction ${direction}, z-score ${z}, lag ${lag}h.`,`Here's the evidence behind that read: ${symbol} is $${price}, the 24h change is ${change}%, and the engine currently says ${state} with direction ${direction}, z-score ${z}, lag ${lag}h.`][variant];
  return [`Right now, ${symbol} is sitting at $${price}. The 24h range is $${low}–$${high}, change is ${change}%, and volume is ${volume}. Gizmo's engine classifies it as ${state}, direction ${direction}, z-score ${z}, with measured lag ${lag}h.`,`The latest ${symbol} snapshot has it at $${price}. Over 24h it's ranged from $${low} to $${high}, with ${change}% change and ${volume} volume. The engine currently reads ${state}, direction ${direction}, z-score ${z}, lag ${lag}h.`,`Here's the current read on ${symbol}: $${price}. The live feed shows a $${low}–$${high} 24h range and ${change}% change. The lead-lag engine has it at ${state}, direction ${direction}, z-score ${z}, lag ${lag}h.`,` ${symbol} is currently trading around $${price}. The factual snapshot is a $${low}–$${high} range, ${change}% change and ${volume} volume. Gizmo's engine reads ${state}, direction ${direction}, z-score ${z}, measured lag ${lag}h.`][variant].trim();
}

export default async function handler(request: Request) {
  if (request.method !== "POST") return new Response("Method Not Allowed", { status: 405 });
  try {
    const body = await request.json();
    const messages = Array.isArray(body?.messages) ? body.messages : [];
    const latest = textOf(messages[messages.length - 1]);
    let symbol = symbolFromText(latest);
    if (!symbol) for (let i = messages.length - 2; i >= 0; i -= 1) { symbol = symbolFromText(textOf(messages[i])); if (symbol) break; }
    if (!symbol) symbol = "BTC";

    const market = await backend(`/api/tools/market?pair=${encodeURIComponent(pair(symbol))}`, 12000, 2);
    let signals: any = null;
    try {
      signals = await backend("/api/tools/signals", 25000, 1);
    } catch (error) {
      console.warn("GIZMO signal refresh unavailable; returning live market evidence:", error);
    }

    const signal = signals?.pairs?.[pair(symbol)] ?? signals?.pairs?.[symbol] ?? {};
    const hasConversation = messages.some((message: any) => message?.role === "assistant");
    const answer = naturalAnswer(symbol, market, signal, latest, hasConversation);
    return new Response(JSON.stringify({ text: answer, market, signal, pair: pair(symbol), signalAvailable: Boolean(signals) }), { status: 200, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
  } catch (error) {
    console.error("GIZMO chat failed:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "GIZMO could not complete that transmission." }), { status: 503, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
  }
}
