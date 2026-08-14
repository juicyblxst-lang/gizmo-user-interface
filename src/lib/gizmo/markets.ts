export const MARKET_PAIRS = [
  "BTC/USDT",
  "ETH/USDT",
  "SOL/USDT",
  "HYPE/USDT",
  "DOGE/USDT",
  "XRP/USDT",
] as const;

export type MarketPair = (typeof MARKET_PAIRS)[number];

// Alias for compatibility with components importing `MARKETS` (e.g. thread-list.tsx)
export const MARKETS = MARKET_PAIRS;