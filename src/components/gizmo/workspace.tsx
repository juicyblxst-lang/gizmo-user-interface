"use client";

import { useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { Menu, X } from "lucide-react";

import { ChatWindow } from "@/components/gizmo/chat-window";
import { GizmoMark } from "@/components/gizmo/gizmo-avatar";
import { ThreadList } from "@/components/gizmo/thread-list";
import { GIZMO_NAME, GIZMO_VERSION } from "@/lib/gizmo/config";
import { useThreads } from "@/lib/gizmo/use-threads";
import { cn } from "@/lib/utils";
import type { MarketContext } from "@/lib/gizmo/market-context";
import { MarketChart } from "@/components/gizmo/market-chart";

export function Workspace({ threadId }: { threadId: string }) {
  const navigate = useNavigate();
  const { threads, ensureThread, createThread, deleteThread, saveMessages } = useThreads();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [marketContext, setMarketContext] = useState<MarketContext | null>(null);

  useEffect(() => {
    ensureThread(threadId);
  }, [ensureThread, threadId]);

  const active = threads.find((t) => t.id === threadId);

  useEffect(() => {
    // debug: confirm Workspace mounts
    // eslint-disable-next-line no-console
    console.log("Workspace mounted", { threadId, active: !!active });
  }, [threadId, active]);

  const debugInfo = { threadId, threadsCount: threads.length, active: !!active };

  const handleCreate = useCallback(() => {
    const id = createThread();
    setMobileNavOpen(false);
    void navigate({ to: "/c/$threadId", params: { threadId: id } });
  }, [createThread, navigate]);

  const handleDelete = useCallback(
    (id: string) => {
      deleteThread(id);
      if (id !== threadId) return;
      void navigate({ to: "/" });
    },
    [deleteThread, navigate, threadId],
  );

  return (
    <div
      className="flex h-dvh flex-col bg-background"
      style={{ outline: "3px solid rgba(255,0,0,0.9)" }}
    >
      <div
        style={{
          position: "fixed",
          left: 12,
          top: 12,
          zIndex: 9999,
          padding: "6px 10px",
          background: "#000",
          color: "#0ff",
          borderRadius: 6,
          fontFamily: "monospace",
          fontSize: 12,
        }}
        data-testid="debug-overlay"
      >
        DEBUG: Workspace loaded — {JSON.stringify(debugInfo)}
      </div>
      <header className="flex items-center justify-between gap-3 border-b-2 border-border bg-terminal px-3 py-2 sm:px-4">
        <div className="flex items-center gap-3">
          <button
            type="button"
            aria-label="Toggle sessions"
            onClick={() => setMobileNavOpen((o) => !o)}
            className="pixel-frame-inset flex size-8 items-center justify-center bg-secondary text-primary md:hidden"
          >
            {mobileNavOpen ? <X className="size-4" /> : <Menu className="size-4" />}
          </button>

          <div className="flex items-center gap-2">
            <GizmoMark className="size-7" />
            <h1 className="text-pixel text-[12px] leading-none text-primary">{GIZMO_NAME}</h1>
          </div>

          <p className="mt-1.5 text-[10px] text-muted-foreground" />
        </div>

        <span className="text-pixel hidden text-[8px] text-muted-foreground sm:inline">
          {GIZMO_VERSION}
        </span>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside
          className={cn(
            "w-64 shrink-0 border-r-2 border-border md:block",
            mobileNavOpen
              ? "absolute inset-y-[57px] left-0 z-20 block w-64 shadow-lg"
              : "hidden",
          )}
        >
          <ThreadList
            threads={threads}
            activeId={threadId}
            onCreate={handleCreate}
            onDelete={handleDelete}
            onNavigate={() => setMobileNavOpen(false)}
            selectedMarket={marketContext?.market ?? null}
            onSelectMarket={(market) => {
              setMarketContext({
                market,
                timeframe: "15m",
              });
              setMobileNavOpen(false);
            }}
          />
        </aside>

        <main className="min-h-0 min-w-0 flex-1">
          {marketContext ? (
            <MarketChart
              market={marketContext.market}
              timeframe={marketContext.timeframe}
              onTimeframeChange={(timeframe) =>
                setMarketContext((current) =>
                  current
                    ? {
                        ...current,
                        timeframe,
                      }
                    : current,
                )
              }
              onClose={() => setMarketContext(null)}
            />
          ) : (
            <ChatWindow
              key={threadId}
              threadId={threadId}
              initialMessages={active?.messages ?? []}
              marketContext={marketContext}
              onMessagesChange={saveMessages}
            />
          )}
        </main>
      </div>
    </div>
  );
}