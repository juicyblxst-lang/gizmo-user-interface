export const MARKET_PAIRS = [
  "BTC/USDT",
  "ETH/USDT",
  "SOL/USDT",
  "HYPE/USDT",
  "DOGE/USDT",
  "SUI/USDT",
] as const;

export type MarketPair = (typeof MARKET_PAIRS)[number];