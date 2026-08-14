"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { useEffect, useMemo, useRef } from "react";

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
import { StatusIndicator, type GizmoStatus } from "@/components/gizmo/status-indicator";
import { cn } from "@/lib/utils";
import type { MarketContext } from "@/lib/gizmo/market-context";

const transport = new DefaultChatTransport({ api: "/api/chat" });

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

  const { messages, sendMessage, status, error, stop } = useChat({
    id: threadId,
    messages: initialMessages,
    transport,
  });

  const busy = status === "submitted" || status === "streaming";

  const gizmoStatus: GizmoStatus = error
    ? "error"
    : status === "submitted"
      ? "thinking"
      : status === "streaming"
        ? "streaming"
        : "idle";

  useEffect(() => {
    onMessagesChange(threadId, messages);
  }, [messages, threadId, onMessagesChange]);



  useEffect(() => {
    if (!busy) textareaRef.current?.focus();
  }, [busy, threadId]);

  const isEmpty = messages.length === 0;

  const handleSubmit = (message: PromptInputMessage) => {
    const text = message.text?.trim();
    if (!text || busy) return;

    void sendMessage({
      text,
      body: {
        marketContext,
      },
    });
  };

  const lastMessage = messages[messages.length - 1];
  const awaitingFirstToken = status === "submitted" || (lastMessage?.role === "user" && busy);

  const body = useMemo(
    () =>
      messages.map((message) => {
        const text = message.parts
          .map((part) => (part.type === "text" ? part.text : ""))
          .join("");

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
            <MessageContent className="bg-transparent p-0 text-foreground">
              <MessageResponse>{text}</MessageResponse>
            </MessageContent>
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
              Link failure — GIZMO could not complete that transmission. Try again.
            </p>
          ) : null}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      <div className="border-t-2 border-border bg-terminal px-4 py-3">
        <div className="mx-auto w-full max-w-3xl">
          <PromptInput onSubmit={handleSubmit} className="pixel-frame-inset bg-card">
            <PromptInputTextarea
              ref={textareaRef}
              autoFocus
              placeholder="Ask GIZMO…"
              className="font-mono text-sm"
            />
            <PromptInputFooter className="items-center justify-between border-t-2 border-input px-2 py-1.5">
              <StatusIndicator status={gizmoStatus} className="border-0 bg-transparent px-0" />
              <PromptInputSubmit
                status={status}
                onClick={busy ? () => void stop() : undefined}
                className="border-2 border-border bg-primary text-primary-foreground hover:bg-accent hover:text-accent-foreground"
              />
            </PromptInputFooter>
          </PromptInput>
          <p className="mt-2 text-[10px] text-muted-foreground">
            GIZMO will not fabricate live data.
          </p>
        </div>
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex min-h-[46vh] flex-col items-center justify-center text-center">
      <GizmoCharacter className="w-40 opacity-70 sm:w-52" />
      <p className="text-pixel mt-6 text-[11px] text-primary">GIZMO</p>
      <p className="mt-3 max-w-sm text-xs leading-relaxed text-muted-foreground">
        Find the market that moves first. Trade the market that follows.
      </p>
    </div>
  );
}