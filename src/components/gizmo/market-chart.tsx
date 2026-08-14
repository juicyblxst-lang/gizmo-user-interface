import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import type { MarketPair } from "@/lib/gizmo/markets";

type Candle = { t: number; o: number; c: number; h: number; l: number; v: number };

const WS_URL = "wss://ws.okx.com:8443/ws/v5/public";

function instIdFromPair(market: MarketPair) {
  const base = market.split("/")[0];
  return `${base}-USDT-SWAP`;
}

function formatPrice(price: number) {
  if (!Number.isFinite(price)) return "—";
  if (price >= 1000) return price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (price >= 1) return price.toFixed(2);
  return price.toFixed(4);
}

function formatVolume(volume: number) {
  if (volume >= 1_000_000) return `${(volume / 1_000_000).toFixed(2)}M`;
  if (volume >= 1_000) return `${(volume / 1_000).toFixed(1)}K`;
  return volume.toFixed(0);
}

export function MarketChart({ market, onClose }: { market: MarketPair; onClose: () => void }) {
  const [candles, setCandles] = useState<Candle[]>([]);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState(false);

  const instId = instIdFromPair(market);

  useEffect(() => {
    let socket: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
    let disposed = false;

    const connect = () => {
      if (disposed) return;
      socket = new WebSocket(WS_URL);

      socket.onopen = () => {
        if (disposed || !socket) return;
        setConnected(true);
        setError(false);
        socket.send(JSON.stringify({
          op: "subscribe",
          args: [{ channel: "candle1H", instId }],
        }));
      };

      socket.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          if (message.event) return;
          if (message.arg?.channel !== "candle1H" || !message.data) return;

          for (const row of message.data) {
            const incoming: Candle = {
              t: Number(row[0]),
              o: parseFloat(row[1]),
              h: parseFloat(row[2]),
              l: parseFloat(row[3]),
              c: parseFloat(row[4]),
              v: parseFloat(row[5]),
            };
            if (!Number.isFinite(incoming.c)) continue;

            setCandles((previous) => {
              const next = [...previous];
              const idx = next.findIndex((c) => c.t === incoming.t);
              if (idx >= 0) next[idx] = incoming;
              else next.push(incoming);
              return next.sort((a, b) => a.t - b.t).slice(-80);
            });
          }
        } catch {
          setError(true);
        }
      };

      socket.onerror = () => { setConnected(false); setError(true); };
      socket.onclose = () => {
        setConnected(false);
        if (!disposed) reconnectTimer = setTimeout(connect, 1500);
      };
    };

    setCandles([]);
    setConnected(false);
    setError(false);
    connect();

    return () => {
      disposed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (socket) socket.close();
    };
  }, [instId]);

  const chart = useMemo(() => {
    if (!candles.length) return null;
    const width = 1000, height = 420;
    const padding = { top: 24, right: 72, bottom: 32, left: 16 };
    const chartWidth = width - padding.left - padding.right;
    const chartHeight = height - padding.top - padding.bottom;
    const lows = candles.map((c) => c.l);
    const highs = candles.map((c) => c.h);
    const minPrice = Math.min(...lows);
    const maxPrice = Math.max(...highs);
    const range = maxPrice - minPrice || maxPrice * 0.001 || 1;
    const xStep = chartWidth / Math.max(candles.length - 1, 1);
    const candleWidth = Math.max(3, Math.min(10, xStep * 0.62));
    const y = (price: number) => padding.top + ((maxPrice - price) / range) * chartHeight;
    const x = (index: number) => padding.left + index * xStep;
    return { width, height, padding, chartWidth, chartHeight, minPrice, maxPrice, xStep, candleWidth, x, y };
  }, [candles]);

  const latest = candles[candles.length - 1];
  const previous = candles[candles.length - 2];
  const priceChange = latest && previous ? latest.c - previous.c : 0;
  const priceChangePercent = latest && previous && previous.c !== 0 ? (priceChange / previous.c) * 100 : 0;

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <div className="flex items-center justify-between border-b-2 border-border bg-terminal px-4 py-2">
        <div className="flex items-center gap-3">
          <span className="text-pixel text-[10px] text-primary">{market}</span>
          <span className="text-[10px] text-muted-foreground">LIVE MARKET WORKSPACE</span>
          <span className="flex items-center gap-1.5 text-[9px] text-muted-foreground">
            <span className={`size-1.5 rounded-full ${connected ? "bg-primary" : "bg-muted-foreground"}`} />
            {connected ? "LIVE" : "CONNECTING"}
          </span>
        </div>
        <button type="button" onClick={onClose} aria-label={`Close ${market} market view`}
          className="pixel-frame-inset flex size-7 items-center justify-center bg-secondary text-primary transition-colors hover:bg-primary hover:text-primary-foreground">
          <X className="size-3.5" />
        </button>
      </div>

      <div className="pixel-grid min-h-0 flex-1 overflow-auto p-4">
        <div className="mx-auto w-full max-w-5xl">
          <div className="pixel-frame bg-terminal">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b-2 border-border px-3 py-2">
              <div className="flex items-center gap-3">
                <span className="text-xs text-foreground">{market}</span>
                {latest && <span className="text-xs text-primary">${formatPrice(latest.c)}</span>}
                {latest && (
                  <span className={`text-[9px] ${priceChange >= 0 ? "text-primary" : "text-destructive"}`}>
                    {priceChange >= 0 ? "+" : ""}{priceChangePercent.toFixed(2)}%
                  </span>
                )}
              </div>
              <div className="text-[9px] text-muted-foreground">1H · {candles.length} CANDLES · OKX</div>
            </div>

            {chart && candles.length > 1 ? (
              <div className="p-3">
                <div className="relative w-full overflow-hidden">
                  <svg viewBox={`0 0 ${chart.width} ${chart.height}`} className="block h-auto w-full"
                    preserveAspectRatio="none" role="img" aria-label={`${market} live one hour candlestick chart`}>
                    {[0, 0.25, 0.5, 0.75, 1].map((position) => {
                      const price = chart.maxPrice - (chart.maxPrice - chart.minPrice) * position;
                      const yPosition = chart.padding.top + chart.chartHeight * position;
                      return (
                        <g key={position}>
                          <line x1={chart.padding.left} x2={chart.width - chart.padding.right}
                            y1={yPosition} y2={yPosition} stroke="currentColor" strokeOpacity="0.12" strokeDasharray="3 5" />
                          <text x={chart.width - chart.padding.right + 8} y={yPosition + 3}
                            fill="currentColor" fillOpacity="0.55" fontSize="10">{formatPrice(price)}</text>
                        </g>
                      );
                    })}
                    {candles.map((candle, index) => {
                      const candleX = chart.x(index);
                      const openY = chart.y(candle.o);
                      const closeY = chart.y(candle.c);
                      const highY = chart.y(candle.h);
                      const lowY = chart.y(candle.l);
                      const bullish = candle.c >= candle.o;
                      const bodyTop = Math.min(openY, closeY);
                      const bodyHeight = Math.max(2, Math.abs(closeY - openY));
                      return (
                        <g key={candle.t}>
                          <line x1={candleX} x2={candleX} y1={highY} y2={lowY}
                            stroke="currentColor" strokeOpacity="0.75" strokeWidth="1" />
                          <rect x={candleX - chart.candleWidth / 2} y={bodyTop}
                            width={chart.candleWidth} height={bodyHeight}
                            fill="currentColor" fillOpacity={bullish ? 0.85 : 0.28}
                            stroke="currentColor" strokeWidth="1" />
                        </g>
                      );
                    })}
                    {latest && (
                      <line x1={chart.padding.left} x2={chart.width - chart.padding.right}
                        y1={chart.y(latest.c)} y2={chart.y(latest.c)}
                        stroke="currentColor" strokeOpacity="0.7" strokeDasharray="5 4" />
                    )}
                  </svg>
                </div>
                <div className="mt-2 flex items-center justify-between border-t border-border pt-2 text-[9px] text-muted-foreground">
                  <span>VOLUME {formatVolume(latest?.v ?? 0)}</span>
                  <span>{latest ? new Date(latest.t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "—"}</span>
                </div>
              </div>
            ) : (
              <div className="flex min-h-[420px] items-center justify-center">
                <div className="text-center">
                  <p className="text-pixel text-[9px] text-primary">{error ? "RECONNECTING TO MARKET" : "CONNECTING TO MARKET"}</p>
                  <p className="mt-3 text-xs text-muted-foreground">{error ? "The live feed will reconnect automatically…" : "Waiting for live market data…"}</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}