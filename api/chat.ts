const BACKEND_URL = process.env["GIZMO_BACKEND_URL"];
const PAIRS = ["BTC", "ETH", "SOL", "XRP", "DOGE", "HYPE"] as const;
type Symbol = (typeof PAIRS)[number];

const SYMBOL_ALIASES: Record<string, Symbol> = {
  BTC: "BTC", BITCOIN: "BTC",
  ETH: "ETH", ETHEREUM: "ETH",
  SOL: "SOL", SOLANA: "SOL",
  XRP: "XRP",
  DOGE: "DOGE", DOGECOIN: "DOGE",
  HYPE: "HYPE",
};

function symbolFromText(text: string): Symbol | null {
  const match = text.toUpperCase().match(/\b(BTC|BITCOIN|ETH|ETHEREUM|SOL|SOLANA|XRP|DOGE|DOGECOIN|HYPE)\b/);
  return match ? SYMBOL_ALIASES[match[1]] : null;
}

function pair(symbol: Symbol) { return `${symbol}-USDT-SWAP`; }

async function backend(path: string) {
  if (!BACKEND_URL) throw new Error("GIZMO_BACKEND_URL is not configured");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(new URL(path, `${BACKEND_URL.replace(/\/$/, "")}/`), {
      signal: controller.signal,
      cache: "no-store",
    });
    const text = await response.text();
    let data: any;
    try { data = JSON.parse(text); } catch { throw new Error(text || `Backend HTTP ${response.status}`); }
    if (!response.ok || data?.error) throw new Error(data?.error || `Backend HTTP ${response.status}`);
    return data;
  } finally { clearTimeout(timer); }
}

function textOf(message: any) {
  return Array.isArray(message?.parts)
    ? message.parts.map((part: any) => part?.type === "text" ? part.text : "").join("")
    : typeof message?.content === "string" ? message.content : "";
}

function stableVariant(prompt: string, symbol: Symbol) {
  let hash = 0;
  for (const char of `${symbol}:${prompt}`) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return hash % 4;
}

function naturalAnswer(symbol: Symbol, market: any, signal: any, prompt: string, previousAssistant: string) {
  const price = market?.price;
  const change = market?.change24h;
  const low = market?.low24h;
  const high = market?.high24h;
  const volume = market?.volume24h;
  const direction = signal?.direction ?? "UNKNOWN";
  const z = signal?.zscore ?? "UNKNOWN";
  const lag = signal?.lag ?? "UNKNOWN";
  const state = signal?.signal ?? "UNKNOWN";
  const lower = prompt.toLowerCase();
  const variant = stableVariant(prompt, symbol);
  const followUp = /^(why|how|what do you mean|why do you think|is that|what about|explain|tell me more|how so|what happened|has it|did it)\b/i.test(prompt.trim());
  const leadQuestion = /\b(lead|leading|lag|follows|follower|correlation|relationship)\b/i.test(lower);
  const recentQuestion = /\b(last|past|recent|hours?|30m|1h|4h|15m)\b/i.test(lower);

  if (leadQuestion) {
    const relationship = typeof signal?.correlation === "number" ? `correlation ${signal.correlation}` : "no correlation value is currently recorded";
    const lagText = typeof lag === "number" ? `a measured lag of ${lag}h` : "no measured lag";
    const openings = [
      `${symbol} is currently classified as ${state}. The engine shows ${relationship} and ${lagText}.`,
      `On the lead-lag read, ${symbol} is ${state}: ${relationship}, with ${lagText}.`,
      `The current engine evidence has ${symbol} at ${state}; it records ${relationship} and ${lagText}.`,
      `Right now the measurable relationship is ${state}. For ${symbol}, that's ${relationship} with ${lagText}.`,
    ];
    return `${openings[variant]} Those are measured relationships, not a forecast.`;
  }

  if (followUp || previousAssistant) {
    const openings = [
      `The short version: the data points to ${state}, not a directional breakout.`,
      `What makes me say that is the current engine evidence rather than a guess.`,
      `The key thing I'm looking at is the measured state, not just the headline price.`,
      `Here's the evidence behind that read:`,
    ];
    return `${openings[variant]} ${symbol} is at $${price}, with a 24h change of ${change}%. The lead-lag engine currently reads ${state}, direction ${direction}, z-score ${z}, and measured lag ${lag}h. That supports the present classification; it does not predict the next move.`;
  }

  if (recentQuestion) {
    return `For the recent view, the live snapshot has ${symbol} at $${price}. The available market feed reports a 24h range of $${low}–$${high}, change ${change}%, and volume ${volume}. The lead-lag engine currently reads ${state}, direction ${direction}, z-score ${z}, lag ${lag}h. I won't invent a four-hour conclusion without recorded observations covering that exact window.`;
  }

  const openings = [
    `Right now, ${symbol} is sitting at $${price}.`,
    `The latest ${symbol} snapshot has it at $${price}.`,
    `Here's the current read on ${symbol}: $${price}.`,
    `${symbol} is currently trading around $${price}.`,
  ];
  return `${openings[variant]} The 24h range is $${low}–$${high}, change is ${change}%, and volume is ${volume}. Gizmo's engine classifies it as ${state}, direction ${direction}, z-score ${z}, with measured lag ${lag}h. That's the factual reading from the live backend.`;
}

export default async function handler(request: Request) {
  if (request.method !== "POST") return new Response("Method Not Allowed", { status: 405 });
  try {
    const body = await request.json();
    const messages = Array.isArray(body?.messages) ? body.messages : [];
    const latest = textOf(messages[messages.length - 1]);

    let symbol = symbolFromText(latest);
    if (!symbol) {
      for (let i = messages.length - 2; i >= 0; i -= 1) {
        symbol = symbolFromText(textOf(messages[i]));
        if (symbol) break;
      }
    }
    if (!symbol) symbol = "BTC";

    const [market, signals] = await Promise.all([
      backend(`/api/tools/market?pair=${encodeURIComponent(pair(symbol))}`),
      backend(`/api/tools/signals`),
    ]);
    const signal = signals?.pairs?.[pair(symbol)] ?? signals?.pairs?.[symbol] ?? {};

    let previousAssistant = "";
    for (let i = messages.length - 2; i >= 0; i -= 1) {
      if (messages[i]?.role === "assistant") {
        previousAssistant = textOf(messages[i]);
        break;
      }
    }

    // The deployed chat path intentionally does not call an external LLM.
    // Vercel AI Gateway previously returned 401s and left the UI waiting behind
    // a long generation path. GIZMO now answers from the existing factual engine
    // directly, preserving real data and making the request bounded and reliable.
    const answer = naturalAnswer(symbol, market, signal, latest, previousAssistant);

    return new Response(JSON.stringify({
      text: answer,
      market,
      signal,
      pair: pair(symbol),
    }), {
      status: 200,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    console.error("GIZMO chat failed:", error);
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : "GIZMO could not complete that transmission.",
    }), {
      status: 503,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store",
      },
    });
  }
}
