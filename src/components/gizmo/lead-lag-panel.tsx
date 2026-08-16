import { useEffect, useMemo, useState } from "react";
import type { MarketPair } from "@/lib/gizmo/markets";

type Point = { timestamp: number; leaderCumulativeReturn: number; followerCumulativeReturn: number };
type Analysis = { available: boolean; leader: string; follower: string; lagHours?: number; correlation?: number; alpha?: number; beta?: number; zscore?: number; series?: Point[]; reason?: string; };

const COLORS = { leader: "#22d3ee", follower: "#a7f3d0" };
function instId(market: MarketPair) { return `${market.split("/")[0]}-USDT-SWAP`; }
function pct(value: number) { return `${(value * 100).toFixed(2)}%`; }

export function LeadLagPanel({ market }: { market: MarketPair }) {
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const id = instId(market);

  useEffect(() => {
    let disposed = false;
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 20000);
    setLoading(true); setError(false); setAnalysis(null);
    fetch(`/api/leadlag-chart?pair=${encodeURIComponent(id)}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => { if (!response.ok) throw new Error("Lead-lag data unavailable"); return response.json() as Promise<Analysis>; })
      .then((data) => { if (!disposed) setAnalysis(data); })
      .catch(() => { if (!disposed) setError(true); })
      .finally(() => { window.clearTimeout(timer); if (!disposed) setLoading(false); });
    return () => { disposed = true; controller.abort(); window.clearTimeout(timer); };
  }, [id]);

  const chart = useMemo(() => {
    const series = analysis?.series ?? [];
    if (series.length < 2) return null;
    const width = 1000, height = 220, pad = { top: 16, right: 12, bottom: 24, left: 42 };
    const values = series.flatMap((p) => [p.leaderCumulativeReturn, p.followerCumulativeReturn]);
    const min = Math.min(...values), max = Math.max(...values), range = max - min || 0.001;
    const x = (i: number) => pad.left + (i / (series.length - 1)) * (width - pad.left - pad.right);
    const y = (v: number) => pad.top + ((max - v) / range) * (height - pad.top - pad.bottom);
    const path = (key: "leaderCumulativeReturn" | "followerCumulativeReturn") => series.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p[key]).toFixed(1)}`).join(" ");
    return { width, height, x, y, path, min, max };
  }, [analysis]);

  return <section className="border-t-2 border-border bg-terminal px-4 py-3">
    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
      <div><span className="text-pixel text-[9px] text-primary">LEAD-LAG ANALYSIS</span><span className="ml-2 text-[9px] text-muted-foreground">ENGINE EVIDENCE · 1H</span></div>
      {analysis?.available && <div className="flex flex-wrap gap-3 text-[9px] text-muted-foreground"><span style={{ color: COLORS.leader }}>BTC LEADER</span><span style={{ color: COLORS.follower }}>{analysis.follower} FOLLOWER</span></div>}
    </div>
    {loading ? <div className="py-6 text-center text-[9px] text-muted-foreground">CALCULATING FROM LIVE ENGINE DATA…</div> : error ? <div className="py-6 text-center text-[9px] text-muted-foreground">LEAD-LAG DATA UNAVAILABLE</div> : !analysis?.available ? <div className="py-5 text-center text-[9px] text-muted-foreground">{analysis?.reason ?? "No measurable relationship available."}</div> : <>
      <div className="mb-2 flex flex-wrap gap-4 text-[9px] text-muted-foreground"><span>LAG <b className="text-primary">{analysis.lagHours}H</b></span><span>CORRELATION <b className="text-primary">{analysis.correlation?.toFixed(3)}</b></span><span>BETA <b className="text-primary">{analysis.beta?.toFixed(4)}</b></span><span>Z-SCORE <b className="text-primary">{analysis.zscore?.toFixed(2)}</b></span></div>
      {chart && <svg viewBox={`0 0 ${chart.width} ${chart.height}`} className="block h-44 w-full" role="img" aria-label={`BTC lead and ${analysis.follower} follower cumulative hourly log returns with ${analysis.lagHours} hour measured lag`}>
        {[0, .5, 1].map((p) => <line key={p} x1="42" x2="988" y1={16 + p * 180} y2={16 + p * 180} stroke="currentColor" strokeOpacity=".1" strokeDasharray="3 5" />)}
        <path d={chart.path("leaderCumulativeReturn")} fill="none" stroke={COLORS.leader} strokeWidth="2" />
        <path d={chart.path("followerCumulativeReturn")} fill="none" stroke={COLORS.follower} strokeWidth="2" />
        <text x="4" y="22" fill="currentColor" fillOpacity=".5" fontSize="9">{pct(chart.max)}</text>
        <text x="4" y="202" fill="currentColor" fillOpacity=".5" fontSize="9">{pct(chart.min)}</text>
      </svg>}
      <div className="mt-1 text-[8px] text-muted-foreground">BTC returns are aligned against {analysis.follower} returns at the engine-selected lag. This visualization uses the same log returns, 1–24H lag search, Pearson correlation and regression as the signal engine.</div>
    </>}
  </section>;
}
