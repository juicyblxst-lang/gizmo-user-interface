"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { UIMessage } from "ai";
import { Conversation, ConversationContent, ConversationScrollButton } from "@/components/ai-elements/conversation";
import { Message, MessageContent, MessageResponse } from "@/components/ai-elements/message";
import { PromptInput, PromptInputFooter, PromptInputSubmit, PromptInputTextarea, type PromptInputMessage } from "@/components/ai-elements/prompt-input";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { GizmoCharacter, GizmoMark } from "@/components/gizmo/gizmo-avatar";
import { LeadLagPanel } from "@/components/gizmo/lead-lag-panel";
import type { MarketPair } from "@/lib/gizmo/markets";
import type { MarketContext } from "@/lib/gizmo/market-context";
import { cn } from "@/lib/utils";

const SUPPORTED_PAIRS = ["BTC", "ETH", "SOL", "XRP", "DOGE", "HYPE"] as const;
type Symbol = (typeof SUPPORTED_PAIRS)[number];
const BACKEND = "https://gizmo-backend-zkft.onrender.com";

function messageId() { return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`; }
function textMessage(id: string, role: "user" | "assistant", text: string): UIMessage { return { id, role, parts: [{ type: "text", text }] } as UIMessage; }
function extractPair(text: string): Symbol | null { const match = text.toUpperCase().match(/\b(BTC|BITCOIN|ETH|ETHEREUM|SOL|SOLANA|XRP|DOGE|DOGECOIN|HYPE)\b/); if (!match) return null; const x = match[1]; return (x === "BITCOIN" ? "BTC" : x === "ETHEREUM" ? "ETH" : x === "SOLANA" ? "SOL" : x === "DOGECOIN" ? "DOGE" : x) as Symbol; }
function isMarketVisualizationQuestion(text: string) { return /\b(doing|happening|going|now|currently|right now|price|market|ticker|worth|value|cost|how much|lead|leads|lag|follows|follower|relationship|correlation|z-?score|deviation)\b/i.test(text); }
function isFollowUpQuestion(text: string) { return /^(why|how|what do you mean|why is that|why do you think so|is that unusual|what about it|and what about that|explain|tell me more|how so|what does that mean|what happened|has it|did it)\b/i.test(text.trim()); }
function marketFromSymbol(symbol: Symbol): MarketPair { return `${symbol}/USDT` as MarketPair; }
function referencedMarketBefore(messages: UIMessage[], messageIndex: number): MarketPair | null { for (let index = messageIndex - 1; index >= 0; index -= 1) { const message = messages[index]; if (message.role !== "user") continue; const text = message.parts.map((part) => part.type === "text" ? part.text : "").join(" "); const symbol = extractPair(text); if (symbol) return marketFromSymbol(symbol); } return null; }
function shouldShowLeadLagChart(messages: UIMessage[], messageIndex: number) { const assistantMessage = messages[messageIndex]; if (!assistantMessage || assistantMessage.role !== "assistant") return false; const prompt = messages.slice(0, messageIndex).reverse().find((message) => message.role === "user"); if (!prompt) return false; const text = prompt.parts.map((part) => part.type === "text" ? part.text : "").join(" ").trim(); return Boolean(extractPair(text)) && (isMarketVisualizationQuestion(text) || isFollowUpQuestion(text)); }
function textOf(message: UIMessage) { return message.parts.map((part) => part.type === "text" ? part.text : "").join(""); }
function pair(symbol: Symbol) { return `${symbol}-USDT-SWAP`; }
async function getJson(path: string, signal: AbortSignal) { const response = await fetch(`${BACKEND}${path}`, { cache: "no-store", signal, headers: { accept: "application/json" } }); const raw = await response.text(); let data: any = {}; try { data = JSON.parse(raw); } catch { throw new Error(raw || `Backend returned HTTP ${response.status}`); } if (!response.ok || data?.error) throw new Error(data?.error || `Backend returned HTTP ${response.status}`); return data; }
function variant(prompt: string, symbol: Symbol) { let h = 0; for (const c of `${symbol}:${prompt}`) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h % 4; }
function naturalAnswer(symbol: Symbol, market: any, signal: any, prompt: string, hasConversation: boolean) {
  const p = market.price, low = market.low24h, high = market.high24h, ch = market.change24h, vol = market.volume24h;
  const state = signal.signal ?? "UNKNOWN", dir = signal.direction ?? "UNKNOWN", z = signal.zscore ?? "UNKNOWN", lag = signal.lag ?? "UNKNOWN";
  const lower = prompt.toLowerCase(), v = variant(prompt, symbol);
  if (/\b(lead|leading|lag|correlation|follows|follower)\b/.test(lower)) { const corr = typeof signal.correlation === "number" ? `correlation ${signal.correlation}` : "no recorded correlation"; return [`${symbol} is currently ${state}. The engine measures ${corr} with a lag of ${lag}h. That's measured evidence, not a forecast.`,`The current lead-lag read has ${symbol} at ${state}, with ${corr} and a measured lag of ${lag}h. That's what the engine supports right now.`,`What the engine can establish right now is ${state}: ${corr}, lag ${lag}h. I won't turn that into a prediction.`,`Right now the measurable relationship is ${state}, with ${corr} and ${lag}h lag.`][v]; }
  if (/\b(last|past|recent|hours?|4h|1h|30m|15m)\b/.test(lower)) return `The live snapshot has ${symbol} at $${p}. The feed reports a 24h range of $${low}–$${high}, change ${ch}%, and volume ${vol}. The engine currently reads ${state}, direction ${dir}, z-score ${z}, lag ${lag}h. I won't invent a four-hour conclusion without observations covering that exact window.`;
  if (hasConversation || /^(why|how|what do you mean|why do you think|explain|tell me more|what happened)\b/.test(lower)) return [`The key evidence is the current measured state: ${symbol} is $${p}, and the engine reads ${state}, direction ${dir}, z-score ${z}, lag ${lag}h.`,`I'm basing that on the live feed and engine output, not a guess. ${symbol} is $${p}; the engine currently says ${state}, direction ${dir}, z-score ${z}, lag ${lag}h.`,`The price alone isn't the reason. The engine currently has ${symbol} at ${state}, with direction ${dir}, z-score ${z}, and ${lag}h measured lag.`,`Here's the evidence behind the read: $${p} for ${symbol}, ${ch}% over 24h, and an engine state of ${state} with direction ${dir}, z-score ${z}, lag ${lag}h.`][v];
  return [`Right now, ${symbol} is at $${p}. The 24h range is $${low}–$${high}, change ${ch}%, volume ${vol}. Gizmo reads ${state}, direction ${dir}, z-score ${z}, lag ${lag}h.`,`The latest ${symbol} snapshot is $${p}; 24h range $${low}–$${high}, change ${ch}%, volume ${vol}. The engine reads ${state}, direction ${dir}, z-score ${z}, lag ${lag}h.`,`Here's the current ${symbol} read: $${p}, with a $${low}–$${high} 24h range and ${ch}% change. Engine state: ${state}; direction ${dir}; z-score ${z}; lag ${lag}h.`,`${symbol} is trading around $${p}. The factual snapshot is a $${low}–$${high} range, ${ch}% change and ${vol} volume. The engine currently says ${state}, direction ${dir}, z-score ${z}, lag ${lag}h.`][v];
}

export function ChatWindow({ threadId, initialMessages, marketContext, onMessagesChange }: { threadId: string; initialMessages: UIMessage[]; marketContext: MarketContext | null; onMessagesChange: (id: string, messages: UIMessage[]) => void; }) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null); const abortRef = useRef<AbortController | null>(null);
  const [messages, setMessages] = useState<UIMessage[]>(initialMessages); const [status, setStatus] = useState<"ready" | "submitted" | "streaming" | "error">("ready"); const [error, setError] = useState<string | null>(null); const busy = status === "submitted" || status === "streaming";
  useEffect(() => { onMessagesChange(threadId, messages); }, [messages, threadId, onMessagesChange]);
  useEffect(() => { if (!busy) textareaRef.current?.focus(); }, [busy, threadId]);
  useEffect(() => () => abortRef.current?.abort(), []);

  const transmit = useCallback(async (outgoing: UIMessage[], assistantId: string) => {
    const controller = new AbortController(); abortRef.current = controller; const timeout = window.setTimeout(() => controller.abort(), 15000);
    try {
      setStatus("submitted");
      const latest = textOf(outgoing[outgoing.length - 1]);
      let symbol = extractPair(latest); if (!symbol) for (let i = outgoing.length - 2; i >= 0; i--) { symbol = extractPair(textOf(outgoing[i])); if (symbol) break; } symbol = symbol || "BTC";
      const [market, signals] = await Promise.all([getJson(`/api/tools/market?pair=${encodeURIComponent(pair(symbol))}`, controller.signal), getJson(`/api/tools/signals`, controller.signal).catch(() => null)]);
      const signal = signals?.pairs?.[pair(symbol)] ?? {};
      const answer = naturalAnswer(symbol, market, signal, latest, outgoing.some((m) => m.role === "assistant"));
      setStatus("streaming"); setMessages((current) => current.map((message) => message.id === assistantId ? textMessage(assistantId, "assistant", answer) : message)); setStatus("ready");
    } catch (cause) {
      const message = cause instanceof Error && cause.name === "AbortError" ? "GIZMO timed out waiting for live market data. The interface is still responsive — try again." : cause instanceof Error ? cause.message : "GIZMO could not complete that transmission.";
      setError(message); setStatus("error"); setMessages((current) => current.filter((item) => item.id !== assistantId));
    } finally { window.clearTimeout(timeout); if (abortRef.current === controller) abortRef.current = null; }
  }, [marketContext]);

  const handleSubmit = useCallback((message: PromptInputMessage) => { const text = message.text?.trim(); if (!text || busy) return; setError(null); const userMessage = textMessage(messageId(), "user", text); const assistantId = messageId(); const outgoing = [...messages, userMessage]; setMessages([...outgoing, textMessage(assistantId, "assistant", "")]); void transmit(outgoing, assistantId); }, [busy, messages, transmit]);
  const stop = useCallback(() => { abortRef.current?.abort(); setStatus("ready"); }, []);
  const isEmpty = messages.length === 0; const lastMessage = messages[messages.length - 1]; const awaitingResponse = status === "submitted" || (lastMessage?.role === "assistant" && !lastMessage.parts.some((part) => part.type === "text" && part.text));
  const body = useMemo(() => messages.map((message, index) => { const text = textOf(message); const showLeadLagChart = shouldShowLeadLagChart(messages, index); const referencedMarket = referencedMarketBefore(messages, index); if (message.role === "user") return <Message from="user" key={message.id}><MessageContent className="border-2 border-border bg-secondary text-secondary-foreground"><MessageResponse>{text}</MessageResponse></MessageContent></Message>; return <Message from="assistant" key={message.id} className="items-start gap-3"><GizmoMark className="mt-1 size-6" /><div className="min-w-0 flex-1"><MessageContent className="bg-transparent p-0 text-foreground"><MessageResponse>{text}</MessageResponse></MessageContent>{showLeadLagChart && referencedMarket ? <div className="mt-4 overflow-hidden border-2 border-border"><LeadLagPanel market={referencedMarket} /></div> : null}</div></Message>; }), [messages]);
  return <div className="flex h-full min-h-0 flex-col"><Conversation className={cn("min-h-0 flex-1", isEmpty && "pixel-grid")}><ConversationContent className="mx-auto w-full max-w-3xl px-4 py-6">{isEmpty ? <EmptyState /> : body}{awaitingResponse ? <div className="mx-auto flex w-full max-w-3xl items-center gap-3 py-2"><GizmoMark className="size-6" /><Shimmer className="text-xs">GIZMO is processing…</Shimmer></div> : null}{error ? <p className="mt-4 border-2 border-destructive bg-terminal px-3 py-2 text-xs text-destructive">{error}</p> : null}</ConversationContent><ConversationScrollButton /></Conversation><div className="border-t-2 border-border bg-terminal px-3 py-3 sm:px-4 sm:py-4"><div className="mx-auto w-full max-w-3xl"><PromptInput onSubmit={handleSubmit} className="gizmo-transmit pixel-frame-inset relative bg-card"><PromptInputTextarea ref={textareaRef} autoFocus placeholder="Ask GIZMO…" aria-label="Ask GIZMO" className="gizmo-transmit-textarea font-mono text-sm" /><PromptInputFooter className="gizmo-transmit-footer absolute bottom-3 right-3 z-10 flex items-center sm:bottom-4 sm:right-4"><PromptInputSubmit status={status} aria-label={busy ? "Stop transmission" : "Ask GIZMO"} onClick={busy ? stop : undefined} className="gizmo-transmit-button" /></PromptInputFooter></PromptInput></div></div></div>;
}
function EmptyState() { return <div className="flex min-h-[46vh] flex-col items-center justify-center text-center"><GizmoCharacter className="w-40 opacity-70 sm:w-52" /><p className="text-pixel mt-6 text-[13px] leading-none text-primary sm:text-[14px]">GIZMO</p><p className="mt-3 max-w-sm text-xs leading-relaxed text-muted-foreground">Find the market that moves first. Trade the market that follows.</p></div>; }
