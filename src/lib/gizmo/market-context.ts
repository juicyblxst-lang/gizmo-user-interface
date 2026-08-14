import type { MarketPair } from "@/lib/gizmo/markets";

export type MarketTimeframe = "1m" | "5m" | "15m" | "1h" | "4h" | "1d";

export type MarketContext = {
  market: MarketPair;
  timeframe: MarketTimeframe;
};