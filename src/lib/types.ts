export interface Stock {
  id: string;
  ticker: string;
  name: string;
  sector: string | null;
  last_price: number;
  last_price_change: number;
  last_price_change_pct: number;
  last_updated: string | null;
  created_at: string;
}

export interface PriceSnapshot {
  date: string;
  close: number;
  change: number;
  change_pct: number;
}

export interface WatchlistItem {
  id: string;
  user_id: string;
  stock_id: string;
  added_at: string;
  note: string | null;
  alert_above: number | null;
  alert_below: number | null;
  last_visited_at: string | null;
}

export interface WatchlistRow extends WatchlistItem {
  stock: Stock;
}

export interface UserLastSeen {
  id: string;
  user_id: string;
  last_seen_at: string;
}

export type ChangeSeverity = "major" | "moderate" | "minor" | "none";

export interface MeaningfulChange {
  stock: Stock;
  watchlistItem: WatchlistItem;
  priceThen: number | null;
  priceNow: number;
  absChange: number;
  pctChange: number;
  severity: ChangeSeverity;
  crossedAbove: boolean;
  crossedBelow: boolean;
  alertHit: "above" | "below" | null;
  daysSinceVisited: number | null;
}

export interface MarketDataResponse {
  stocks: Stock[];
  history: Record<string, PriceSnapshot[]>;
}
