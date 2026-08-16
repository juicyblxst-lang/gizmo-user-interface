const BACKEND_URL = process.env["GIZMO_BACKEND_URL"];
const API_KEY = process.env["AI_GATEWAY_API_KEY"];
const MODEL = "google/gemini-3.6-flash";
const PAIRS = ["BTC", "ETH", "SOL", "XRP", "DOGE", "HYPE"] as const;
type Symbol = (typeof PAIRS)[number];

const SYSTEM = `You are GIZMO, a trading intelligence agent. Be concise, natural, technical and calm. Never hype.
GIZMO covers BTC, ETH, SOL, XRP, DOGE and HYPE.
The market evidence supplied to you is factual backend output. Never invent or alter numbers.
Use conversation history for follow-ups such as why, what about SOL, and is it leading anything.
Explain what the measurements mean rather than repeating a fixed template. Vary your wording naturally.
Clearly separate measured facts from interpretation. Never claim a prediction is a fact.`;

function symbolFromText(text: string): Symbol | null {
  const match = text.toUpperCase().match(/\\b(BTC|ETH|SOL|XRP|DOGE|HYPE)\\b/);
  return match ? (match[1] as Symbol) : null;
}

function pair(symbol: Symbol) { return `${symbol}-USDT-SWAP`; }

async function backend(path: string) {
  if (!BACKEND_URL) throw new Error("GIZMO_BACKEND_URL is not configured");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 9000);
  try {
    const response = await fetch(new URL(path, `${BACKEND_URL.replace(/\\/$/, "")}/`), { signal: controller.signal, cache: "no-store" });
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

function fallback(symbol: Symbol, market: any, signal: any, prompt: string) {
  const price = market?.price;
  const change = market?.change24h;
  const direction = signal?.direction ?? "UNKNOWN";
  const z = signal?.zscore;
  const lag = signal?.lag;
  const state = signal?.signal ?? "UNKNOWN";
  if (/why|how|think|explain/i.test(prompt)) {
    return `The reason is in the current measurements: ${symbol} is at $${price}, with a 24h change of ${change}%. The lead-lag engine has it marked ${state}, direction ${direction}, z-score ${z}, and measured lag ${lag}h. That supports the classification; it does not by itself predict the next move.`;
  }
  return `${symbol} is at $${price}. The 24h change is ${change}%, and the current 24h range is $${market?.low24h}–$${market?.high24h}. Gizmo currently reads ${state}, direction ${direction}, z-score ${z}, with measured lag ${lag}h. That's the live backend reading right now.`;
}

export default async function handler(request: Request) {
  if (request.method !== "POST") return new Response("Method Not Allowed", { status: 405 });
  try {
    const body = await request.json();
    const messages = Array.isArray(body?.messages) ? body.messages : [];
    const latest = textOf(messages[messages.length - 1]);
    let symbol = symbolFromText(latest);
    if (!symbol) {
      for (let i = messages.length - 2; i >= 0; i--) {
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
    const evidence = JSON.stringify({ pair: pair(symbol), market, signal });

    let answer: string;
    if (API_KEY) {
      const aiController = new AbortController();
      const aiTimer = setTimeout(() => aiController.abort(), 12000);
      try {
        const history = messages.slice(-12).map((message: any) => ({
          role: message.role === "assistant" ? "assistant" : "user",
          content: textOf(message),
        })).filter((message: any) => message.content);
        const response = await fetch("https://ai-gateway.vercel.sh/v1/chat/completions", {
          method: "POST",
          headers: { "content-type": "application/json", authorization: `Bearer ${API_KEY}` },
          body: JSON.stringify({ model: MODEL, temperature: 0.75, messages: [
            { role: "system", content: SYSTEM },
            { role: "system", content: `Fresh backend evidence for this turn: ${evidence}` },
            ...history,
          ] }),
          signal: aiController.signal,
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data?.error?.message || `AI gateway HTTP ${response.status}`);
        answer = data?.choices?.[0]?.message?.content?.trim();
        if (!answer) throw new Error("AI gateway returned no answer");
      } catch (error) {
        console.error("GIZMO AI generation failed; using factual fallback:", error);
        answer = fallback(symbol, market, signal, latest);
      } finally { clearTimeout(aiTimer); }
    } else {
      answer = fallback(symbol, market, signal, latest);
    }

    return new Response(JSON.stringify({ text: answer, market, signal, pair: pair(symbol) }), {
      status: 200,
      headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
    });
  } catch (error) {
    console.error("GIZMO chat failed:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "GIZMO could not complete that transmission." }), {
      status: 503,
      headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
    });
  }
}
