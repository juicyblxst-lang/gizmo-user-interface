import { useCallback, useEffect, useState } from "react";
import { Menu, X } from "lucide-react";
import { ChatWindow } from "@/components/gizmo/chat-window";
import { GizmoMark } from "@/components/gizmo/gizmo-avatar";
import { ThreadList } from "@/components/gizmo/thread-list";
import { AboutPanel } from "@/components/gizmo/about-panel";
import { DocsPanel } from "@/components/gizmo/docs-panel";
import { GIZMO_NAME, GIZMO_VERSION } from "@/lib/gizmo/config";
import { useThreads } from "@/lib/gizmo/use-threads";
import { cn } from "@/lib/utils";
import type { MarketContext } from "@/lib/gizmo/market-context";
import { MarketChart } from "@/components/gizmo/market-chart";
import { LeadLagPanel } from "@/components/gizmo/lead-lag-panel";

export function Workspace({ threadId }: { threadId: string }) {
  const { threads, ensureThread, createThread, deleteThread, saveMessages } = useThreads();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [marketContext, setMarketContext] = useState<MarketContext | null>(null);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [docsOpen, setDocsOpen] = useState(false);
  useEffect(() => { ensureThread(threadId); }, [ensureThread, threadId]);
  const active = threads.find((t) => t.id === threadId);
  const go = useCallback((path: string) => { window.history.pushState({}, "", path); window.dispatchEvent(new PopStateEvent("popstate")); }, []);
  const handleCreate = useCallback(() => { const id = createThread(); setMarketContext(null); setMobileNavOpen(false); go(`/c/${encodeURIComponent(id)}`); }, [createThread, go]);
  const handleDelete = useCallback((id: string) => { deleteThread(id); if (id === threadId) go("/"); }, [deleteThread, go, threadId]);
  const handleOpenAbout = useCallback(() => { setDocsOpen(false); setAboutOpen(true); }, []);
  const handleOpenDocs = useCallback(() => { setAboutOpen(false); setDocsOpen(true); }, []);
  return <div className="flex h-dvh flex-col bg-background">
    <header className="flex items-center justify-between gap-3 border-b-2 border-border bg-terminal px-3 py-2 sm:px-4"><div className="flex items-center gap-3"><button type="button" aria-label="Toggle sessions" onClick={() => setMobileNavOpen((o) => !o)} className="pixel-frame-inset flex size-8 items-center justify-center bg-secondary text-primary md:hidden">{mobileNavOpen ? <X className="size-4" /> : <Menu className="size-4" />}</button><div className="flex items-center gap-2"><GizmoMark className="size-7" /><h1 className="text-pixel text-[12px] leading-none text-primary">{GIZMO_NAME}</h1></div></div><span className="text-pixel hidden text-[8px] text-muted-foreground sm:inline">{GIZMO_VERSION}</span></header>
    <div className="relative flex min-h-0 flex-1">
      <aside className={cn("absolute inset-y-0 left-0 z-50 w-64 border-r-2 border-border bg-sidebar transition-transform md:relative md:block md:translate-x-0", mobileNavOpen ? "translate-x-0" : "-translate-x-full")}><ThreadList threads={threads} activeId={threadId} onCreate={handleCreate} onDelete={handleDelete} onNavigate={() => setMobileNavOpen(false)} selectedMarket={marketContext?.market ?? null} onSelectMarket={(market) => { setMarketContext({ market, timeframe: "1h" }); setMobileNavOpen(false); }} onOpenAbout={handleOpenAbout} onOpenDocs={handleOpenDocs} /></aside>
      {mobileNavOpen ? <button type="button" aria-label="Close sessions" onClick={() => setMobileNavOpen(false)} className="absolute inset-0 z-40 bg-background/60 md:hidden" /> : null}
      <main className="min-h-0 min-w-0 flex-1 overflow-hidden">{marketContext ? <div className="flex h-full min-h-0 flex-col overflow-auto"><div className="min-h-[55%] shrink-0"><MarketChart market={marketContext.market} onClose={() => setMarketContext(null)} /></div><LeadLagPanel market={marketContext.market} /></div> : <ChatWindow key={threadId} threadId={threadId} initialMessages={active?.messages ?? []} marketContext={marketContext} onMessagesChange={saveMessages} />}</main>
    </div>
    <AboutPanel open={aboutOpen} onClose={() => setAboutOpen(false)} /><DocsPanel open={docsOpen} onClose={() => setDocsOpen(false)} />
  </div>;
}
