import { X } from "lucide-react";

export function AboutPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 px-4 py-6" role="presentation" onMouseDown={onClose}>
      <div role="dialog" aria-modal="true" aria-labelledby="about-gizmo-title" className="pixel-frame flex max-h-[90dvh] w-full max-w-3xl flex-col bg-terminal" onMouseDown={(event) => event.stopPropagation()}>
        <div className="flex shrink-0 items-center justify-between border-b-2 border-border px-3 py-2">
          <h2 id="about-gizmo-title" className="text-pixel text-[10px] text-primary">GIZMO — ABOUT</h2>
          <button type="button" onClick={onClose} aria-label="Close about" className="pixel-frame-inset flex size-7 cursor-pointer items-center justify-center bg-secondary text-primary hover:bg-primary hover:text-primary-foreground"><X className="size-3.5" /></button>
        </div>
        <div className="overflow-y-auto px-5 py-5 text-xs leading-relaxed text-muted-foreground sm:px-7">
          <section><h3 className="text-sm font-semibold text-foreground">What is Gizmo?</h3><p className="mt-2">Gizmo is an AI-powered lead-lag analyst for crypto markets.</p><p className="mt-3">Gizmo analyzes relationships between six crypto assets:</p><p className="mt-2 text-foreground">Bitcoin (BTC), Ethereum (ETH), Solana (SOL), Hyperliquid (HYPE), Dogecoin (DOGE), and XRP.</p><p className="mt-3">Instead of analyzing each asset independently, Gizmo studies how their market movements relate to one another. It looks for situations where one asset appears to move ahead of another, measures the historical relationship between them, and identifies when that relationship deviates from its expected behavior.</p><p className="mt-3">The purpose is to help users discover and understand potential lead-lag and mean-reversion setups using quantitative data rather than relying solely on visual chart analysis.</p></section>
          <section className="mt-7"><h3 className="text-sm font-semibold text-foreground">What Gizmo analyzes</h3><p className="mt-2">Gizmo’s analysis includes:</p><ul className="mt-2 list-disc space-y-1 pl-5"><li>Lead/follower relationships</li><li>Lag between asset movements</li><li>Correlation</li><li>Regression</li><li>Alpha and beta</li><li>Residuals</li><li>Rolling residual statistics</li><li>Z-scores</li><li>Statistical deviations</li><li>Historical signals</li><li>Backtested behavior</li></ul><p className="mt-3">For example, Gizmo can investigate a relationship such as <span className="text-foreground">BTC → SOL</span>, <span className="text-foreground">ETH → HYPE</span>, or <span className="text-foreground">BTC → XRP</span>. The system determines whether a measurable historical relationship exists rather than assuming that one asset always leads another.</p></section>
          <section className="mt-7"><h3 className="text-sm font-semibold text-foreground">What Gizmo is looking for</h3><p className="mt-2">The central idea is lead-lag deviation.</p><p className="mt-3">If one asset historically tends to move before another, Gizmo can measure whether the follower is currently behaving differently from what the historical relationship would suggest.</p><p className="mt-3">A sufficiently unusual deviation can become a potential mean-reversion setup.</p><p className="mt-3">Gizmo does not claim that the relationship must revert. It provides the statistical evidence and context so the user can evaluate the situation themselves.</p></section>
          <section className="mt-7"><h3 className="text-sm font-semibold text-foreground">Gizmo’s role</h3><p className="mt-2">Gizmo is designed to:</p><p className="mt-3 text-base text-primary">Analyze → Detect → Explain</p><p className="mt-3">It does not execute trades. It does not make trading decisions for the user. It provides quantitative market intelligence and explains what the data is showing.</p></section>
        </div>
      </div>
    </div>
  );
}
