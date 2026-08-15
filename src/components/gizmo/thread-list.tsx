import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { ChevronDown, ChevronRight, Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { GizmoThread } from "@/lib/gizmo/types";
import { MARKETS, type MarketPair } from "@/lib/gizmo/markets";
import { AboutPanel } from "@/components/gizmo/about-panel";

export function ThreadList({ threads, activeId, onCreate, onDelete, onNavigate, selectedMarket, onSelectMarket }: {
  threads: GizmoThread[];
  activeId: string;
  onCreate: () => void;
  onDelete: (id: string) => void;
  onNavigate?: () => void;
  selectedMarket: MarketPair | null;
  onSelectMarket: (market: MarketPair) => void;
}) {
  const [marketsOpen, setMarketsOpen] = useState(true);
  const [resourcesOpen, setResourcesOpen] = useState(true);
  const [aboutOpen, setAboutOpen] = useState(false);

  return (
    <div className="flex h-full flex-col bg-sidebar">
      <div className="flex items-center justify-between border-b-2 border-sidebar-border px-3 py-3">
        <span className="text-pixel text-[9px] uppercase text-muted-foreground">Sessions</span>
        <button type="button" onClick={onCreate} aria-label="New session" className="flex size-7 cursor-pointer items-center justify-center bg-secondary text-primary transition-colors hover:bg-primary hover:text-primary-foreground">
          <Plus className="size-4" />
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto p-2">
        {threads.length === 0 ? (
          <p className="px-2 py-4 text-xs text-muted-foreground">No sessions yet.</p>
        ) : (
          <ul className="space-y-1">
            {threads.map((thread) => {
              const active = thread.id === activeId;
              return (
                <li key={thread.id} className={cn("group flex items-center gap-1 border-2 border-transparent px-1", active && "border-border bg-sidebar-accent")}>
                  <Link to="/c/$threadId" params={{ threadId: thread.id }} onClick={onNavigate} className={cn("min-w-0 flex-1 truncate px-2 py-2 text-left text-xs", active ? "text-foreground" : "text-muted-foreground hover:text-foreground")}>
                    <span className="mr-2 text-primary">{active ? ">" : "·"}</span>
                    {thread.title}
                  </Link>
                  <button type="button" aria-label={`Delete ${thread.title}`} onClick={() => onDelete(thread.id)} className="flex size-6 shrink-0 items-center justify-center text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:text-destructive focus-visible:opacity-100">
                    <X className="size-3.5" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </nav>

      <div className="mt-4 border-t-2 border-sidebar-border px-2 pt-3">
        <button type="button" onClick={() => setMarketsOpen((open) => !open)} className="flex w-full items-center justify-between px-2 py-1 text-left" aria-expanded={marketsOpen}>
          <span className="text-pixel text-[9px] text-muted-foreground">Markets</span>
          {marketsOpen ? <ChevronDown className="size-3 text-muted-foreground" /> : <ChevronRight className="size-3 text-muted-foreground" />}
        </button>
        {marketsOpen && (
          <ul className="mt-1 space-y-0.5">
            {MARKETS.map((market) => {
              const selected = market === selectedMarket;
              return (
                <li key={market}>
                  <button type="button" onClick={() => onSelectMarket(market)} className={cn("flex w-full items-center px-2 py-1.5 text-left text-xs", selected ? "bg-sidebar-accent text-foreground" : "text-muted-foreground hover:text-foreground")}>
                    <span className="mr-2 text-primary">{selected ? ">" : "·"}</span>
                    {market}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="mt-4 border-t-2 border-sidebar-border px-2 pt-3">
        <button type="button" onClick={() => setResourcesOpen((open) => !open)} className="flex w-full items-center justify-between px-2 py-1 text-left" aria-expanded={resourcesOpen}>
          <span className="text-pixel text-[9px] text-muted-foreground">Resources</span>
          {resourcesOpen ? <ChevronDown className="size-3 text-muted-foreground" /> : <ChevronRight className="size-3 text-muted-foreground" />}
        </button>
        {resourcesOpen && (
          <div className="mt-1 space-y-0.5">
            <ResourcePlaceholder label="DOCS" />
            <ResourcePlaceholder label="TELEGRAM" />
            <ResourcePlaceholder label="X" />
            <button type="button" onClick={() => setAboutOpen(true)} className="flex w-full items-center px-2 py-1.5 text-left text-xs text-muted-foreground hover:text-foreground">
              <span className="mr-2 text-primary">·</span>
              ABOUT
            </button>
          </div>
        )}
      </div>

      <div className="border-t-2 border-sidebar-border px-3 py-3">
        <p className="text-[10px] leading-relaxed text-muted-foreground">Sessions are stored locally in this browser.</p>
      </div>

      <AboutPanel open={aboutOpen} onClose={() => setAboutOpen(false)} />
    </div>
  );
}

function ResourcePlaceholder({ label }: { label: string }) {
  return (
    <span aria-disabled="true" title={`${label} destination has not been configured yet`} className="flex w-full cursor-default items-center px-2 py-1.5 text-xs text-muted-foreground">
      <span className="mr-2 text-primary">·</span>
      {label}
    </span>
  );
}
