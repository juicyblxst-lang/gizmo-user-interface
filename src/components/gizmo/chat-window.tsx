"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { UIMessage } from "ai";

import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import { Message, MessageContent, MessageResponse } from "@/components/ai-elements/message";
import {
  PromptInput,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
  type PromptInputMessage,
} from "@/components/ai-elements/prompt-input";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { GizmoCharacter, GizmoMark } from "@/components/gizmo/gizmo-avatar";
import { LeadLagPanel } from "@/components/gizmo/lead-lag-panel";
import type { MarketPair } from "@/lib/gizmo/markets";
import type { MarketContext } from "@/lib/gizmo/market-context";
import { cn } from "@/lib/utils";

const SUPPORTED_PAIRS = ["BTC", "ETH", "SOL", "XRP", "DOGE", "HYPE"] as const;
type Symbol = (typeof SUPPORTED_PAIRS)[number];

function messageId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function textMessage(id: string, role: "user" | "assistant", text: string): UIMessage {
  return {
    id,
    role,
    parts: [{ type: "text", text }],
  } as UIMessage;
}

function extractPair(text: string): Symbol | null {
  const match = text.toUpperCase().match(/\b(BTC|ETH|SOL|XRP|DOGE|HYPE)\b/);
  return match ? (match[1] as Symbol) : null;
}

function isMarketVisualizationQuestion(text: string) {
  return /\b(doing|happening|going|now|currently|right now|price|market|ticker|worth|value|cost|how much|lead|leads|lag|follows|follower|relationship|correlation|z-?score|deviation)\b/i.test(text);
}

function isFollowUpQuestion(text: string) {
  return /^(why|how|what do you mean|why is that|why do you think so|is that unusual|what about it|and what about that|explain|tell me more|how so|what does that mean|what happened|has it|did it)\b/i.test(text.trim());
}

function marketFromSymbol(symbol: Symbol): MarketPair {
  return `${symbol}/USDT` as MarketPair;
}

function referencedMarketBefore(messages: UIMessage[], messageIndex: number): MarketPair | null {
  for (let index = messageIndex - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.role !== "user") continue;
    const text = message.parts
      .map((part) => (part.type === "text" ? part.text : ""))
      .join(" ");
    const symbol = extractPair(text);
    if (symbol) return marketFromSymbol(symbol);
  }
  return null;
}

function shouldShowLeadLagChart(messages: UIMessage[], messageIndex: number) {
  const assistantMessage = messages[messageIndex];
  if (!assistantMessage || assistantMessage.role !== "assistant") return false;
  const prompt = messages
    .slice(0, messageIndex)
    .reverse()
    .find((message) => message.role === "user");
  if (!prompt) return false;
  const text = prompt.parts
    .map((part) => (part.type === "text" ? part.text : ""))
    .join(" ")
    .trim();
  return Boolean(extractPair(text)) && (isMarketVisualizationQuestion(text) || isFollowUpQuestion(text));
}

function parseStreamChunk(raw: string): { delta?: string; error?: string } | null {
  try {
    const event = JSON.parse(raw) as Record<string, unknown>;
    if (event.type === "text-delta" && typeof event.delta === "string") {
      return { delta: event.delta };
    }
    if (event.type === "error") {
      return { error: typeof event.errorText === "string" ? event.errorText : "GIZMO could not complete that transmission." };
    }
  } catch {
    // Ignore non-JSON stream lines.
  }
  return null;
}

export function ChatWindow({
  threadId,
  initialMessages,
  marketContext,
  onMessagesChange,
}: {
  threadId: string;
  initialMessages: UIMessage[];
  marketContext: MarketContext | null;
  onMessagesChange: (id: string, messages: UIMessage[]) => void;
}) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [messages, setMessages] = useState<UIMessage[]>(initialMessages);
  const [status, setStatus] = useState<"ready" | "submitted" | "streaming" | "error">("ready");
  const [error, setError] = useState<string | null>(null);

  const busy = status === "submitted" || status === "streaming";

  useEffect(() => {
    onMessagesChange(threadId, messages);
  }, [messages, threadId, onMessagesChange]);

  useEffect(() => {
    if (!busy) textareaRef.current?.focus();
  }, [busy, threadId]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const updateAssistantText = useCallback((id: string, text: string) => {
    setMessages((current) =>
      current.map((message) =>
        message.id === id
          ? textMessage(id, "assistant", text)
          : message,
      ),
    );
  }, []);

  const transmit = useCallback(async (outgoing: UIMessage[], assistantId: string) => {
    const controller = new AbortController();
    abortRef.current = controller;
    const timeout = window.setTimeout(() => controller.abort(), 15000);

    try {
      setStatus("submitted");
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ messages: outgoing, marketContext }),
        signal: controller.signal,
      });

      if (!response.ok) {
        let detail = "GIZMO could not complete that transmission.";
        try {
          const data = (await response.json()) as { error?: string };
          if (data.error) detail = data.error;
        } catch {
          // Keep the friendly fallback.
        }
        throw new Error(detail);
      }

      if (!response.body) throw new Error("GIZMO returned an empty transmission.");

      setStatus("streaming");
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let assistantText = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data:")) continue;
          const parsed = parseStreamChunk(line.slice(5).trim());
          if (!parsed) continue;
          if (parsed.error) throw new Error(parsed.error);
          if (parsed.delta) {
            assistantText += parsed.delta;
            updateAssistantText(assistantId, assistantText);
          }
        }
      }

      if (!assistantText.trim()) {
        throw new Error("GIZMO returned no text. Try the question again.");
      }
      setStatus("ready");
    } catch (cause) {
      const message = cause instanceof Error && cause.name === "AbortError"
        ? "GIZMO timed out waiting for the backend. The interface is still responsive — try again."
        : cause instanceof Error
          ? cause.message
          : "GIZMO could not complete that transmission.";
      setError(message);
      setStatus("error");
      setMessages((current) => current.filter((item) => item.id !== assistantId));
    } finally {
      window.clearTimeout(timeout);
      if (abortRef.current === controller) abortRef.current = null;
    }
  }, [marketContext, updateAssistantText]);

  const handleSubmit = useCallback((message: PromptInputMessage) => {
    const text = message.text?.trim();
    if (!text || busy) return;

    setError(null);
    const userMessage = textMessage(messageId(), "user", text);
    const assistantId = messageId();
    const assistantMessage = textMessage(assistantId, "assistant", "");
    const outgoing = [...messages, userMessage];

    setMessages([...outgoing, assistantMessage]);
    void transmit(outgoing, assistantId);
  }, [busy, messages, transmit]);

  const stop = useCallback(() => {
    abortRef.current?.abort();
    setStatus("ready");
  }, []);

  const isEmpty = messages.length === 0;
  const lastMessage = messages[messages.length - 1];
  const awaitingFirstToken = status === "submitted" || (lastMessage?.role === "assistant" && !lastMessage.parts.some((part) => part.type === "text" && part.text));

  const body = useMemo(
    () =>
      messages.map((message, index) => {
        const text = message.parts
          .map((part) => (part.type === "text" ? part.text : ""))
          .join("");
        const showLeadLagChart = shouldShowLeadLagChart(messages, index);
        const referencedMarket = referencedMarketBefore(messages, index);

        if (message.role === "user") {
          return (
            <Message from="user" key={message.id}>
              <MessageContent className="border-2 border-border bg-secondary text-secondary-foreground">
                <MessageResponse>{text}</MessageResponse>
              </MessageContent>
            </Message>
          );
        }

        return (
          <Message from="assistant" key={message.id} className="items-start gap-3">
            <GizmoMark className="mt-1 size-6" />
            <div className="min-w-0 flex-1">
              <MessageContent className="bg-transparent p-0 text-foreground">
                <MessageResponse>{text}</MessageResponse>
              </MessageContent>
              {showLeadLagChart && referencedMarket ? (
                <div className="mt-4 overflow-hidden border-2 border-border">
                  <LeadLagPanel market={referencedMarket} />
                </div>
              ) : null}
            </div>
          </Message>
        );
      }),
    [messages],
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <Conversation className={cn("min-h-0 flex-1", isEmpty && "pixel-grid")}>
        <ConversationContent className="mx-auto w-full max-w-3xl px-4 py-6">
          {isEmpty ? <EmptyState /> : body}

          {awaitingFirstToken ? (
            <div className="mx-auto flex w-full max-w-3xl items-center gap-3 py-2">
              <GizmoMark className="size-6" />
              <Shimmer className="text-xs">GIZMO is processing…</Shimmer>
            </div>
          ) : null}

          {error ? (
            <p className="mt-4 border-2 border-destructive bg-terminal px-3 py-2 text-xs text-destructive">
              {error}
            </p>
          ) : null}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      <div className="border-t-2 border-border bg-terminal px-3 py-3 sm:px-4 sm:py-4">
        <div className="mx-auto w-full max-w-3xl">
          <PromptInput onSubmit={handleSubmit} className="gizmo-transmit pixel-frame-inset relative bg-card">
            <PromptInputTextarea
              ref={textareaRef}
              autoFocus
              placeholder="Ask GIZMO…"
              aria-label="Ask GIZMO"
              className="gizmo-transmit-textarea font-mono text-sm"
            />
            <PromptInputFooter className="gizmo-transmit-footer absolute bottom-3 right-3 z-10 flex items-center sm:bottom-4 sm:right-4">
              <PromptInputSubmit
                status={status}
                aria-label={busy ? "Stop transmission" : "Ask GIZMO"}
                onClick={busy ? stop : undefined}
                className="gizmo-transmit-button"
              />
            </PromptInputFooter>
          </PromptInput>
        </div>
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex min-h-[46vh] flex-col items-center justify-center text-center">
      <GizmoCharacter className="w-40 opacity-70 sm:w-52" />
      <p className="text-pixel mt-6 text-[13px] leading-none text-primary sm:text-[14px]">GIZMO</p>
      <p className="mt-3 max-w-sm text-xs leading-relaxed text-muted-foreground">
        Find the market that moves first. Trade the market that follows.
      </p>
    </div>
  );
}
