import { createFileRoute } from "@tanstack/react-router";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { convertToModelMessages, createUIMessageStream, createUIMessageStreamResponse, generateId, streamText, tool, type UIMessage } from "ai";
import { z } from "zod";
import { GIZMO_MODEL, GIZMO_SYSTEM_PROMPT } from "@/lib/gizmo/config";

const gateway = createOpenAICompatible({ name: "vercel-ai-gateway", baseURL: "https://ai-gateway.vercel.sh/v1", apiKey: process.env.AI_GATEWAY_API_KEY });
const model = gateway.chatModel(GIZMO_MODEL);
const SUPPORTED_PAIRS = ["BTC", "ETH", "SOL", "XRP", "DOGE", "HYPE"] as const;
type Symbol = (typeof SUPPORTED_PAIRS)[number];
const pair = (symbol: Symbol) => `${symbol}-USDT-SWAP`;

async function backendRequest(path: string, init?: RequestInit) {
  const base = process.env.GIZMO_BACKEND_URL;
  if (!base) throw new Error("GIZMO_BACKEND_URL is not configured");
  const response = await fetch(new URL(path, `${base.replace(/\/$/, "")}/`), init);
  const text = await response.text();
  let data: unknown;
  try { data = JSON.parse(text); } catch { data = { error: text || `Backend returned HTTP ${response.status}` }; }
  if (!response.ok) {
    const message = typeof data === "object" && data && "error" in data ? String((data as { error: unknown }).error) : `Backend returned HTTP ${response.status}`;
    throw new Error(message);
  }
  if (data && typeof data === "object" && "error" in data && (data as { error?: unknown }).error) throw new Error(String((data as { error: unknown }).error));
  return data;
}

const tools = {
  getSignals: tool({ description: "Get current lead-lag signals for all tracked pairs.", inputSchema: z.object({}), execute: async () => backendRequest("/api/tools/signals") }),
  getMarketData: tool({ description: "Get current live market data for one supported asset.", inputSchema: z.object({ pair: z.enum(SUPPORTED_PAIRS) }), execute: async ({ pair: symbol }) => backendRequest(`/api/tools/market?pair=${encodeURIComponent(pair(symbol))}`) }),
  getLeadLagAnalysis: tool({
    description: "Get factual current lead-lag measurements from Gizmo. BTC is the engine leader. Never infer an unreturned relationship.",
    inputSchema: z.object({ pair: z.enum(SUPPORTED_PAIRS).optional() }),
    execute: async ({ pair: symbol }) => {
      const data = await backendRequest("/api/tools/signals");
      const pairs = data && typeof data === "object" && "pairs" in data ? (data as { pairs?: Record<string, Record<string, unknown>> }).pairs ?? {} : {};
      const selected = symbol ? Object.entries(pairs).filter(([key]) => key.startsWith(`${symbol}-`)) : Object.entries(pairs);
      return { engine: "Gizmo lead-lag engine", leaderModel: "BTC", measurements: selected.map(([key, value]) => ({ pair: key, leader: "BTC", follower: key.replace("-USDT-SWAP", ""), lagHours: value.lag ?? null, correlation: value.correlation ?? null, zscore: value.zscore ?? null, direction: value.direction ?? "NEUTRAL", signal: value.signal ?? "NO_DATA", price: value.price ?? null })), note: "Measurements come from the existing backend engine." };
    },
  }),
  getHistory: tool({
    description: "Get past recorded signals, most recent first.",
    inputSchema: z.object({ limit: z.number().min(1).max(50).default(10), pair: z.enum(SUPPORTED_PAIRS).optional() }),
    execute: async ({ limit, pair: symbol }) => {
      const data = await backendRequest(`/api/tools/history?limit=${limit}`);
      if (!symbol || !Array.isArray(data)) return data;
      const backendPair = pair(symbol);
      return data.filter((item: unknown) => {
        if (!item || typeof item !== "object") return false;
        const record = item as Record<string, unknown>;
        const value = record.pair ?? record.instId ?? record.symbol;
        return value === symbol || value === backendPair;
      });
    },
  }),
  monitorPair: tool({ description: "Add a pair to the backend watchlist.", inputSchema: z.object({ pair: z.enum(SUPPORTED_PAIRS) }), execute: async ({ pair: symbol }) => backendRequest("/api/tools/monitor", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ pair: pair(symbol) }) }) }),
};

function extractPair(text: string): Symbol | null {
  const match = text.toUpperCase().match(/\b(BTC|ETH|SOL|XRP|DOGE|HYPE)\b/);
  return match ? (match[1] as Symbol) : null;
}
function extractLastReferencedPair(messages: UIMessage[], selectedMarket: string | null): Symbol | null {
  for (const message of [...messages].reverse()) {
    const text = message.parts.map((part) => part.type === "text" ? part.text : "").join(" ");
    const found = extractPair(text);
    if (found) return found;
  }
  return extractPair(selectedMarket ?? "");
}
function isLiveMarketQuestion(text: string) { return /\b(doing|happening|going|now|currently|right now|price|market|ticker|worth|value|cost|how much)\b/i.test(text); }
function isAboutMarketQuestion(text: string) { return /^\s*(and\s+)?what\s+about\s+(BTC|ETH|SOL|XRP|DOGE|HYPE)\b/i.test(text); }
function isSignalsQuestion(text: string) { return /\b(signal|signals|z-?score|lead.?lag|leader|follower|deviation|mean.?reversion)\b/i.test(text); }
function isFollowUp(text: string) { return /^(why|how|what do you mean|why is that|why do you think so|is that unusual|what about it|and what about that|explain|tell me more|how so|what does that mean)\b/i.test(text.trim()); }
function isRecentHistoryQuestion(text: string) { return /\b(last|past|previous|recent)\b.*\b(\d+\s*(minutes?|hours?|days?)|hour|hours|day|days)\b/i.test(text) || /\b(\d+\s*(minutes?|hours?|days?))\b/i.test(text); }
function isRelationshipQuestion(text: string) { return /\b(relationship|lead.?lag|leads?|follows?|lag|correlation|correlated|between|relative to)\b/i.test(text); }

function makeStreamResponse(responseText: string, originalMessages: UIMessage[]) {
  const stream = createUIMessageStream({ originalMessages, generateId, execute: ({ writer }) => { const textId = generateId(); writer.write({ type: "text-start", id: textId }); writer.write({ type: "text-delta", id: textId, delta: responseText }); writer.write({ type: "text-end", id: textId }); } });
  return createUIMessageStreamResponse({ stream });
}
function money(value: number, symbol: Symbol) { return `$${value.toLocaleString(undefined, { maximumFractionDigits: symbol === "BTC" ? 2 : 6 })}`; }
function volume(value: number) { return `$${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}`; }

function conversationSeed(messages: UIMessage[], text: string) {
  const source = `${messages.filter((message) => message.role === "user").length}:${text}:${messages.slice(-4).map((message) => message.parts.map((part) => part.type === "text" ? part.text : "").join(" ")).join("|")}`;
  let hash = 2166136261;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function pick<T>(items: T[], seed: number) {
  return items[seed % items.length];
}

async function getEvidence(symbol: Symbol) {
  const [market, signals] = await Promise.all([backendRequest(`/api/tools/market?pair=${encodeURIComponent(pair(symbol))}`), backendRequest("/api/tools/signals")]);
  const record = signals && typeof signals === "object" && "pairs" in signals ? (signals as { pairs?: Record<string, Record<string, unknown>> }).pairs?.[pair(symbol)] : undefined;
  return { market: market as { price?: number; volume24h?: number; high24h?: number; low24h?: number; change24h?: number }, record };
}

function dynamicMarketOpening(symbol: Symbol, change: number, direction: string, signal: string, zscore: number, seed: number) {
  if (Math.abs(change) < 0.05 && direction === "NEUTRAL") {
    return pick([
      `${symbol} is pretty quiet right now.`,
      `Nothing dramatic is showing up in the latest ${symbol} snapshot.`,
      `${symbol} isn't giving a strong directional read at the moment.`,
      `The latest ${symbol} read is fairly flat.`,
      `At the moment, ${symbol} looks more balanced than directional.`,
      `The ${symbol} tape looks relatively calm on the 24h view.`,
    ], seed);
  }
  if (change > 1) {
    return pick([
      `${symbol} is leaning higher right now.`,
      `${symbol} has a bit of upside pressure showing.`,
      `The latest ${symbol} snapshot is tilted positive.`,
      `${symbol} is pushing higher on the current 24h read.`,
      `There's some strength showing up in ${symbol} at the moment.`,
      `${symbol} is holding a positive tone on the current snapshot.`,
    ], seed);
  }
  if (change < -1) {
    return pick([
      `${symbol} is under some pressure today.`,
      `${symbol} is leaning lower on the current 24h read.`,
      `The latest ${symbol} snapshot is tilted negative.`,
      `${symbol} is showing some downside pressure right now.`,
      `There's some weakness showing up in ${symbol} at the moment.`,
      `${symbol} has a softer tone on the current snapshot.`,
    ], seed);
  }
  return pick([
    `${symbol} is moving, but nothing looks especially extreme on the 24h snapshot.`,
    `${symbol} is active, though the current move isn't particularly stretched.`,
    `The latest ${symbol} read is modest rather than aggressive.`,
    `${symbol} has a mild move on the board, not a major deviation.`,
    `There's movement in ${symbol}, but the current numbers aren't flashing an extreme read.`,
    `${symbol} is moving without a strong statistical push behind it right now.`,
  ], seed);
}

async function answerLiveMarketQuestion(text: string, selectedMarket: string | null, conversationMessages: UIMessage[]) {
  const symbol = extractPair(text) ?? extractPair(selectedMarket ?? "") ?? "BTC";
  const { market, record } = await getEvidence(symbol);
  const price = Number(market.price ?? 0), vol = Number(market.volume24h ?? 0), high = Number(market.high24h ?? 0), low = Number(market.low24h ?? 0), change = Number(market.change24h ?? 0);
  const direction = String(record?.direction ?? "NEUTRAL"), signal = String(record?.signal ?? "UNKNOWN"), zscore = Number(record?.zscore ?? 0);
  const lag = record?.lag == null ? null : Number(record.lag), correlation = record?.correlation == null ? null : Number(record.correlation);
  const seed = conversationSeed(conversationMessages, text);
  const contextLine = pick([
    `The 24h change is ${change.toFixed(2)}%, so the price action itself is fairly ${Math.abs(change) < 0.05 ? "flat" : change > 0 ? "firm" : "soft"}.`,
    `On the price side, the 24h move is ${change.toFixed(2)}%.`,
    `The market snapshot has BTC-independent price data at ${change.toFixed(2)}% over 24h.`,
  ], seed + 1).replace("BTC-independent", symbol);
  const leadLagLine = pick([
    `Gizmo reads ${signal} / ${direction}, with a z-score of ${zscore.toFixed(2)}.`,
    `The engine currently has it at ${signal} with ${direction} direction and a ${zscore.toFixed(2)} z-score.`,
    `From the lead-lag engine: ${signal}, ${direction}, z-score ${zscore.toFixed(2)}.`,
  ], seed + 2);
  const relationship = `Lead-lag context: ${signal}, ${direction}, z-score ${zscore.toFixed(2)}${lag == null ? "" : `, measured lag ${lag}h`}${correlation == null ? "" : `, correlation ${correlation.toFixed(3)}`}.`;
  return [dynamicMarketOpening(symbol, change, direction, signal, zscore, seed), contextLine, `Price ${money(price, symbol)} · 24h range ${money(low, symbol)}–${money(high, symbol)} · volume ${volume(vol)}.`, leadLagLine, relationship].join("\n");
}

async function answerSignalsQuestion(text: string) {
  const symbol = extractPair(text); const data = await backendRequest("/api/tools/signals");
  if (!data || typeof data !== "object") return "Gizmo couldn't read the current signal state.";
  const pairs = (data as { pairs?: Record<string, Record<string, unknown>> }).pairs ?? {};
  const entries = Object.entries(pairs).filter(([key]) => !symbol || key.startsWith(`${symbol}-`));
  if (!entries.length) return "Gizmo has no signal data for that market right now.";
  return entries.map(([key, value]) => `${key.replace("-USDT-SWAP", "")}: ${String(value.signal ?? "UNKNOWN")}, ${String(value.direction ?? "NEUTRAL")}, z-score ${Number(value.zscore ?? 0).toFixed(2)}${value.lag == null ? "" : `, lag ${Number(value.lag)}h`}${value.correlation == null ? "" : `, correlation ${Number(value.correlation).toFixed(3)}`}.`).join("\n");
}

async function answerRelationshipQuestion(text: string) {
  const mentions = [...text.toUpperCase().matchAll(/\b(BTC|ETH|SOL|XRP|DOGE|HYPE)\b/g)].map((m) => m[1] as Symbol); const unique = [...new Set(mentions)];
  const data = await backendRequest("/api/tools/signals"); const pairs = data && typeof data === "object" && "pairs" in data ? (data as { pairs?: Record<string, Record<string, unknown>> }).pairs ?? {} : {};
  if (unique.length >= 2 && !unique.includes("BTC")) return `The current Gizmo engine does not claim a direct ${unique[0]} → ${unique[1]} relationship. Its measured model currently uses BTC as leader; I won't manufacture another relationship.`;
  const follower = unique.find((s) => s !== "BTC") ?? "SOL"; const value = pairs[pair(follower)]; if (!value) return `Gizmo has no current lead-lag measurement for BTC → ${follower}.`;
  return [`BTC → ${follower} is the current measured relationship.`, `Lag: ${value.lag ?? "N/A"}h · correlation: ${value.correlation ?? "N/A"} · z-score: ${value.zscore ?? "N/A"}.`, `Signal: ${value.signal ?? "N/A"} · direction: ${value.direction ?? "N/A"}.`, "Those are engine measurements, not a promise that the relationship will persist or revert."].join("\n");
}

async function answerFollowUpQuestion(text: string, symbol: Symbol, conversationMessages: UIMessage[]) {
  const { market, record } = await getEvidence(symbol);
  const price = Number(market.price ?? 0), change = Number(market.change24h ?? 0), vol = Number(market.volume24h ?? 0), zscore = Number(record?.zscore ?? 0), direction = String(record?.direction ?? "NEUTRAL"), signal = String(record?.signal ?? "UNKNOWN"), lag = record?.lag == null ? null : Number(record.lag), correlation = record?.correlation == null ? null : Number(record?.correlation);
  if (/\b(unusual|normal|odd|extreme)\b/i.test(text)) return `${symbol} is currently at a z-score of ${zscore.toFixed(2)} with ${direction} direction and ${signal} status. That is not an extreme deviation in the current engine snapshot. A z-score describes the modeled residual; it does not predict the next price move.`;
  const seed = conversationSeed(conversationMessages, text);
  const openings = [
    "Yeah — here's the part that matters.",
    "The reason is in the numbers.",
    "That's coming from the live snapshot, not a guess.",
    "Here's how I'd read the evidence.",
    "The useful clue is the relationship data.",
    "Right — the short version is that the measurements are doing the talking here.",
    "That's a fair question. The current evidence points here:",
    "Looking at the same snapshot, here's why I said that:",
  ];
  const opening = pick(openings, seed);
  const evidence = pick([
    `${symbol} is at ${money(price, symbol)}, ${change >= 0 ? "up" : "down"} ${Math.abs(change).toFixed(2)}% over 24h, with ${volume(vol)} traded in that window.`,
    `The live read has ${symbol} at ${money(price, symbol)} with a ${change.toFixed(2)}% 24h move and ${volume(vol)} in 24h volume.`,
    `Right now the snapshot is ${money(price, symbol)} for ${symbol}; the 24h move is ${change.toFixed(2)}% and volume is ${volume(vol)}.`,
  ], seed + 1);
  const engine = pick([
    `Gizmo currently reads ${signal} / ${direction}, z-score ${zscore.toFixed(2)}${lag == null ? "" : `, lag ${lag}h`}${correlation == null ? "" : `, correlation ${correlation.toFixed(3)}`}.`,
    `The engine is showing ${signal} with ${direction} direction; z-score ${zscore.toFixed(2)}${lag == null ? "" : ` and measured lag ${lag}h`}${correlation == null ? "" : `, with correlation ${correlation.toFixed(3)}`}.`,
    `The lead-lag measurements are ${signal} / ${direction}, z-score ${zscore.toFixed(2)}${lag == null ? "" : `, lag ${lag}h`}${correlation == null ? "" : `, correlation ${correlation.toFixed(3)}`}.`,
  ], seed + 2);
  const close = pick([
    "So the earlier read is based on those measurements. They describe what the engine sees now; they don't guarantee what happens next.",
    "That supports the current read, but it isn't a prediction of the next move.",
    "So I'm reading the present evidence, not claiming that the next candle has to follow it.",
    "That's why I'd call the current state neutral rather than force a directional story onto the data.",
  ], seed + 3);
  return [opening, evidence, engine, close].join("\n");
}

async function answerRecentHistoryQuestion(symbol: Symbol) {
  const data = await backendRequest("/api/tools/history?limit=50");
  if (!Array.isArray(data) || !data.length) return `I don't have enough recorded ${symbol} signal history to make a factual time-window claim yet. The live endpoint is available, but that isn't the same as a historical series.`;
  const records = data.filter((item: unknown) => { if (!item || typeof item !== "object") return false; const r = item as Record<string, unknown>; const v = r.pair ?? r.instId ?? r.symbol; return v === symbol || v === pair(symbol); });
  return records.length ? `Gizmo has ${records.length} recorded ${symbol} signal observations available. I can summarize those records, but I won't call them the exact last four hours unless their timestamps establish that window.` : `Gizmo has recorded history, but none of the available records are for ${symbol}.`;
}

export const Route = createFileRoute("/api/chat")({ server: { handlers: { POST: async ({ request }) => {
  try {
    const body = await request.json() as { messages: UIMessage[]; marketContext?: { market?: string | null } | null };
    const selectedMarket = body.marketContext?.market ?? null;
    const lastUserMessage = [...body.messages].reverse().find((message) => message.role === "user");
    const userText = lastUserMessage?.parts.map((part) => part.type === "text" ? part.text : "").join(" ").trim() ?? "";
    const contextPair = extractLastReferencedPair(body.messages, selectedMarket);
    const hasExplicitPair = !!extractPair(userText);
    const evidencePair = contextPair ?? (selectedMarket ? extractPair(selectedMarket) : null);

    if (isRelationshipQuestion(userText) && (hasExplicitPair || contextPair)) return makeStreamResponse(await answerRelationshipQuestion(userText), body.messages);
    if (hasExplicitPair && isRecentHistoryQuestion(userText)) return makeStreamResponse(await answerRecentHistoryQuestion(extractPair(userText)!), body.messages);
    if (hasExplicitPair && (isLiveMarketQuestion(userText) || isSignalsQuestion(userText) || isAboutMarketQuestion(userText))) return makeStreamResponse(isSignalsQuestion(userText) ? await answerSignalsQuestion(userText) : await answerLiveMarketQuestion(userText, selectedMarket, body.messages), body.messages);
    if (evidencePair && isFollowUp(userText)) return makeStreamResponse(await answerFollowUpQuestion(userText, evidencePair, body.messages), body.messages);

    const messages = await convertToModelMessages(body.messages);
    const contextPrompt = [GIZMO_SYSTEM_PROMPT, selectedMarket ? `The user currently has ${selectedMarket} selected in the UI. Treat it as active context when their request is ambiguous.` : "", evidencePair ? `The current conversation is about ${evidencePair}.` : ""].filter(Boolean).join("\n\n");
    const result = streamText({ model, system: contextPrompt, messages, tools, stopWhen: ({ steps }) => steps.length >= 5 });
    return result.toUIMessageStreamResponse();
  } catch (error) {
    console.error("GIZMO chat error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Server error" }), { status: 503, headers: { "content-type": "application/json" } });
  }
} } } });
