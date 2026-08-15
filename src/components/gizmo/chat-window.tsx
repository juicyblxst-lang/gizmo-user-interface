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
import type { MarketContext } from "@/lib/gizmo/market-context";
import { cn } from "@/lib/utils";

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
                onClick={busy ? () => void stop() : undefined}
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
      <p className="text-pixel mt-6 text-[15px] text-primary sm:text-[17px]">GIZMO</p>
      <p className="mt-3 max-w-sm text-xs leading-relaxed text-muted-foreground">
        Find the market that moves first. Trade the market that follows.
      </p>
    </div>
  );
}
