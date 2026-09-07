import { supabase } from "./supabase";
import type { MarketDataResponse, PriceSnapshot, Stock } from "./types";

const FUNCTION_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/market-data`;

async function getAuthHeaders(): Promise<Record<string, string>> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    apikey: import.meta.env.VITE_SUPABASE_ANON_KEY as string,
  };
  if (session?.access_token) {
    headers["Authorization"] = `Bearer ${session.access_token}`;
  }
  return headers;
}

export async function advanceMarket(): Promise<{ updated: number; date: string }> {
  const res = await fetch(FUNCTION_URL, {
    method: "POST",
    headers: await getAuthHeaders(),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Failed to advance market (${res.status})`);
  }
  return res.json();
}

export async function fetchMarketData(stockIds: string[]): Promise<MarketDataResponse> {
  const params = stockIds.length > 0 ? `?stock_ids=${stockIds.join(",")}` : "";
  const res = await fetch(`${FUNCTION_URL}${params}`, {
    method: "GET",
    headers: await getAuthHeaders(),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Failed to fetch market data (${res.status})`);
  }
  return res.json();
}

export async function fetchAllStocks(): Promise<Stock[]> {
  const { data, error } = await supabase
    .from("stocks")
    .select("*")
    .order("ticker", { ascending: true });
  if (error) throw error;
  return (data || []).map((s) => ({
    ...s,
    last_price: Number(s.last_price),
    last_price_change: Number(s.last_price_change),
    last_price_change_pct: Number(s.last_price_change_pct),
  }));
}

export async function fetchHistory(stockId: string, days = 30): Promise<PriceSnapshot[]> {
  const { data, error } = await supabase
    .from("price_snapshots")
    .select("close, change, change_pct, recorded_at")
    .eq("stock_id", stockId)
    .order("recorded_at", { ascending: true })
    .limit(days);
  if (error) throw error;
  return (data || []).map((s) => ({
    date: s.recorded_at,
    close: Number(s.close),
    change: Number(s.change),
    change_pct: Number(s.change_pct),
  }));
}
