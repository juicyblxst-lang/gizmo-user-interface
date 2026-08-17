import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import type { MarketPair } from "@/lib/gizmo/markets";

type Candle = { t: number; o: number; c: number; h: number; l: number; v: number };
type Ticker = { last: number; ts: number };
type Timeframe = "5m" | "15m" | "30m" | "1H" | "4H" | "1D";

const OKX_REST = "https://www.okx.com/api/v5/market";
const OKX_WS = "wss://ws.okx.com:8443/ws/v5/public";
const LIVE_GREEN = "#22c55e";
const LIVE_RED = "#ef4444";

const TIMEFRAMES: Array<{ value: Timeframe; label: string; channel: string; bar: string }> = [
  { value: "5m", label: "5 MIN", channel: "candle5m", bar: "5m" },
  { value: "15m", label: "15 MIN", channel: "candle15m", bar: "15m" },
  { value: "30m", label: "30 MIN", channel: "candle30m", bar: "30m" },
  { value: "1H", label: "1 HOUR", channel: "candle1H", bar: "1H" },
  { value: "4H", label: "4 HOURS", channel: "candle4H", bar: "4H" },
  { value: "1D", label: "1 DAY", channel: "candle1D", bar: "1D" },
];

function instIdFromPair(market: MarketPair) { return `${market.split("/")[0]}-USDT-SWAP`; }
function formatPrice(price: number) { if (!Number.isFinite(price)) return "—"; if (price >= 1000) return price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }); if (price >= 1) return price.toFixed(2); return price.toFixed(4); }
function formatVolume(volume: number) { if (volume >= 1_000_000) return `${(volume / 1_000_000).toFixed(2)}M`; if (volume >= 1_000) return `${(volume / 1_000).toFixed(1)}K`; return volume.toFixed(0); }
function parseCandle(row: unknown[]): Candle | null {
  if (row.length < 6) return null;
  const t = Number(row[0]); const o = Number(row[1]); const h = Number(row[2]); const l = Number(row[3]); const c = Number(row[4]); const v = Number(row[5]);
  return [t, o, h, l, c, v].every(Number.isFinite) ? { t, o, h, l, c, v } : null;
}
function mergeCandle(previous: Candle[], incoming: Candle) { const next = [...previous]; const index = next.findIndex((candle) => candle.t === incoming.t); if (index >= 0) next[index] = incoming; else next.push(incoming); return next.sort((a, b) => a.t - b.t).slice(-80); }

export function MarketChart({ market, onClose }: { market: MarketPair; onClose: () => void }) {
  const [timeframe, setTimeframe] = useState<Timeframe>("1H");
  const [candles, setCandles] = useState<Candle[]>([]);
  const [livePrice, setLivePrice] = useState<number | null>(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState(false);
  const [source, setSource] = useState("CONNECTING");
  const instId = instIdFromPair(market);
  const timeframeConfig = TIMEFRAMES.find((item) => item.value === timeframe) ?? TIMEFRAMES[3]!;

  useEffect(() => {
    let socket: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
    let pollTimer: ReturnType<typeof setInterval> | undefined;
    let disposed = false;
    const applyTicker = (ticker: Ticker) => {
      if (!Number.isFinite(ticker.last) || disposed) return;
      setLivePrice(ticker.last);
      setCandles((previous) => {
        const latest = previous.at(-1);
        if (!latest) return previous;
        return mergeCandle(previous, { ...latest, c: ticker.last, h: Math.max(latest.h, ticker.last), l: Math.min(latest.l, ticker.last) });
      });
    };
    const loadHistory = async () => {
      try {
        const response = await fetch(`${OKX_REST}/candles?instId=${encodeURIComponent(instId)}&bar=${encodeURIComponent(timeframeConfig.bar)}&limit=80`, { cache: "no-store" });
        if (!response.ok) throw new Error(`OKX HTTP ${response.status}`);
        const payload = await response.json() as { code?: string; data?: unknown[][] };
        if (payload.code !== "0" || !Array.isArray(payload.data)) throw new Error("Invalid OKX candle response");
        const history = payload.data.map(parseCandle).filter((c): c is Candle => c !== null).sort((a, b) => a.t - b.t).slice(-80);
        const latest = history.at(-1);
        if (!disposed && latest) { setCandles(history); setLivePrice(latest.c); setError(false); }
      } catch { if (!disposed) setError(true); }
    };
    const pollTicker = async () => {
      try {
        const response = await fetch(`${OKX_REST}/ticker?instId=${encodeURIComponent(instId)}`, { cache: "no-store" });
        if (!response.ok) return;
        const payload = await response.json() as { code?: string; data?: Array<Record<string, string>> };
        const ticker = payload.data?.[0];
        if (payload.code !== "0" || !ticker) return;
        const price = Number(ticker["last"]); const ts = Number(ticker["ts"]) || Date.now();
        if (Number.isFinite(price)) applyTicker({ last: price, ts });
      } catch { /* WebSocket remains the primary live stream. */ }
    };
    const connect = () => {
      if (disposed) return;
      setSource("CONNECTING"); socket = new WebSocket(OKX_WS);
      socket.onopen = () => { if (disposed || !socket) return; setConnected(true); setError(false); setSource("OKX LIVE"); socket.send(JSON.stringify({ op: "subscribe", args: [{ channel: timeframeConfig.channel, instId }, { channel: "tickers", instId }] })); };
      socket.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data) as { event?: string; arg?: { channel?: string }; data?: unknown[][] };
          if (message.event || !message.data) return;
          if (message.arg?.channel === "tickers") { const row = message.data[0] as string[] | undefined; if (row) { const price = Number(row[1]); const ts = Number(row[3]) || Date.now(); if (Number.isFinite(price)) applyTicker({ last: price, ts }); } return; }
          if (message.arg?.channel === timeframeConfig.channel) { for (const row of message.data) { const incoming = parseCandle(row); if (incoming && !disposed) { setCandles((previous) => mergeCandle(previous, incoming)); setLivePrice(incoming.c); } } }
        } catch { if (!disposed) setError(true); }
      };
      socket.onerror = () => { if (!disposed) { setConnected(false); setError(true); setSource("RECONNECTING"); } };
      socket.onclose = () => { if (!disposed) { setConnected(false); setSource("RECONNECTING"); reconnectTimer = setTimeout(connect, 1500); } };
    };
    setCandles([]); setLivePrice(null); setConnected(false); setError(false); setSource("CONNECTING"); void loadHistory(); void pollTicker(); connect(); pollTimer = setInterval(() => void pollTicker(), 2000);
    return () => { disposed = true; if (reconnectTimer) clearTimeout(reconnectTimer); if (pollTimer) clearInterval(pollTimer); socket?.close(); };
  }, [instId, timeframeConfig.bar, timeframeConfig.channel]);

  const chart = useMemo(() => {
    if (!candles.length) return null;
    const width = 1000; const height = 420; const padding = { top: 24, right: 78, bottom: 32, left: 16 }; const chartWidth = width - padding.left - padding.right; const chartHeight = height - padding.top - padding.bottom;
    const minPrice = Math.min(...candles.map((c) => c.l)); const maxPrice = Math.max(...candles.map((c) => c.h)); const range = maxPrice - minPrice || maxPrice * 0.001 || 1; const xStep = chartWidth / Math.max(candles.length - 1, 1); const candleWidth = Math.max(4, Math.min(11, xStep * 0.64)); const y = (price: number) => padding.top + ((maxPrice - price) / range) * chartHeight; const x = (index: number) => padding.left + index * xStep;
    return { width, height, padding, chartWidth, chartHeight, minPrice, maxPrice, candleWidth, x, y };
  }, [candles]);
  const latest = candles.at(-1); const previous = candles.at(-2); const displayPrice = livePrice ?? latest?.c ?? null; const priceChange = latest && previous ? latest.c - previous.c : 0; const priceChangePercent = latest && previous && previous.c !== 0 ? (priceChange / previous.c) * 100 : 0;

  return <div className="flex h-full min-h-0 flex-col bg-background">
    <div className="flex items-center justify-between border-b-2 border-border bg-terminal px-4 py-2"><div className="flex items-center gap-3"><span className="text-pixel text-[10px] text-primary">{market}</span><span className="text-[10px] text-muted-foreground">LIVE MARKET WORKSPACE</span><span className="flex items-center gap-1.5 text-[9px] text-muted-foreground"><span className={`size-1.5 rounded-full ${connected ? "animate-pulse" : ""}`} style={{ backgroundColor: connected ? LIVE_GREEN : "#737373" }} />{source}</span></div><button type="button" onClick={onClose} aria-label={`Close ${market} market view`} className="pixel-frame-inset flex size-7 cursor-pointer items-center justify-center bg-secondary text-primary transition-colors hover:bg-primary hover:text-primary-foreground"><X className="size-3.5" /></button></div>
    <div className="pixel-grid min-h-0 flex-1 overflow-auto p-4"><div className="mx-auto w-full max-w-5xl"><div className="pixel-frame bg-terminal"><div className="flex flex-wrap items-center justify-between gap-3 border-b-2 border-border px-3 py-2"><div className="flex flex-wrap items-center gap-3"><span className="text-xs text-foreground">{market}</span>{displayPrice !== null && <span className="text-xs font-semibold" style={{ color: latest && displayPrice >= latest.o ? LIVE_GREEN : LIVE_RED }}>${formatPrice(displayPrice)}</span>}{latest && <span className="text-[9px]" style={{ color: priceChange >= 0 ? LIVE_GREEN : LIVE_RED }}>{priceChange >= 0 ? "+" : ""}{priceChangePercent.toFixed(2)}%</span>}</div><div className="flex items-center gap-2"><label htmlFor={`timeframe-${market.replace("/", "-")}`} className="text-[9px] text-muted-foreground">TIMEFRAME</label><select id={`timeframe-${market.replace("/", "-")}`} value={timeframe} onChange={(event) => setTimeframe(event.target.value as Timeframe)} className="pixel-frame-inset cursor-pointer bg-background px-2 py-1 text-[9px] text-primary outline-none hover:bg-secondary focus:ring-1 focus:ring-primary" aria-label={`${market} chart timeframe`}>{TIMEFRAMES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select><span className="text-[9px] text-muted-foreground">{timeframe} · {candles.length} CANDLES · OKX</span></div></div>
      {chart && candles.length > 1 ? <div className="p-3"><div className="relative w-full overflow-hidden"><svg viewBox={`0 0 ${chart.width} ${chart.height}`} className="block h-auto w-full" preserveAspectRatio="none" role="img" aria-label={`${market} live ${timeframe} candlestick chart`}>{[0, 0.25, 0.5, 0.75, 1].map((position) => { const price = chart.maxPrice - (chart.maxPrice - chart.minPrice) * position; const yPosition = chart.padding.top + chart.chartHeight * position; return <g key={position}><line x1={chart.padding.left} x2={chart.width - chart.padding.right} y1={yPosition} y2={yPosition} stroke="currentColor" strokeOpacity="0.12" strokeDasharray="3 5" /><text x={chart.width - chart.padding.right + 8} y={yPosition + 3} fill="currentColor" fillOpacity="0.55" fontSize="10">{formatPrice(price)}</text></g>; })}{candles.map((candle) => { const candleX = chart.x(candles.indexOf(candle)); const openY = chart.y(candle.o); const closeY = chart.y(candle.c); const highY = chart.y(candle.h); const lowY = chart.y(candle.l); const bullish = candle.c >= candle.o; const candleColor = bullish ? LIVE_GREEN : LIVE_RED; const bodyTop = Math.min(openY, closeY); const bodyHeight = Math.max(2, Math.abs(closeY - openY)); return <g key={candle.t}><line x1={candleX} x2={candleX} y1={highY} y2={lowY} stroke={candleColor} strokeWidth="1.5" /><rect x={candleX - chart.candleWidth / 2} y={bodyTop} width={chart.candleWidth} height={bodyHeight} fill={candleColor} fillOpacity="0.88" stroke={candleColor} strokeWidth="1" /></g>; })}{displayPrice !== null && <line x1={chart.padding.left} x2={chart.width - chart.padding.right} y1={chart.y(displayPrice)} y2={chart.y(displayPrice)} stroke={latest && displayPrice >= latest.o ? LIVE_GREEN : LIVE_RED} strokeOpacity="0.8" strokeDasharray="5 4" />}</svg></div><div className="mt-2 flex items-center justify-between border-t border-border pt-2 text-[9px] text-muted-foreground"><span>VOLUME {formatVolume(latest?.v ?? 0)}</span><span>{latest ? new Date(latest.t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "—"}</span><span className="flex items-center gap-1.5" style={{ color: connected ? LIVE_GREEN : LIVE_RED }}><span className="size-1.5 animate-pulse rounded-full" style={{ backgroundColor: connected ? LIVE_GREEN : LIVE_RED }} />LIVE TICK</span></div></div> : <div className="flex min-h-[420px] items-center justify-center"><div className="text-center"><p className="text-pixel text-[9px] text-primary">{error ? "RECONNECTING TO MARKET" : "LOADING MARKET"}</p><p className="mt-3 text-xs text-muted-foreground">{error ? "The live feed will reconnect automatically…" : `Loading ${market} ${timeframe} candles…`}</p></div></div>}
    </div></div></div>
  </div>;
}
