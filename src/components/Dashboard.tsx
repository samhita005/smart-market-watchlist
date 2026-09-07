import { useState, useEffect, useCallback, useMemo } from "react";
import { Plus, TrendingUp, LogOut, RefreshCw, Bell, StickyNote, ArrowUp, ArrowDown } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { fetchAllStocks, fetchMarketData, advanceMarket } from "@/lib/api";
import type { Stock, WatchlistRow, PriceSnapshot, MeaningfulChange } from "@/lib/types";
import { classifyChange, formatPrice, formatPct, formatChange, formatRelativeTime, daysBetween } from "@/lib/changeLogic";
import { Sparkline } from "./Sparkline";
import { AddStockModal } from "./AddStockModal";
import { StockDetailDrawer } from "./StockDetailDrawer";
import { ChangesPanel } from "./ChangesPanel";

export function Dashboard() {
  const { user, signOut } = useAuth();
  const [allStocks, setAllStocks] = useState<Stock[]>([]);
  const [watchlist, setWatchlist] = useState<WatchlistRow[]>([]);
  const [historyMap, setHistoryMap] = useState<Record<string, PriceSnapshot[]>>({});
  const [lastSeenAt, setLastSeenAt] = useState<string | null>(null);
  const [lastSeenId, setLastSeenId] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedStockId, setSelectedStockId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<"ticker" | "price" | "change" | "severity">("severity");

  // Initial load
  const loadData = useCallback(async () => {
    try {
      setError(null);
      const [stocks, wlResult, seenResult] = await Promise.all([
        fetchAllStocks(),
        supabase
          .from("watchlist_items")
          .select("*, stock:stocks(*)")
          .order("added_at", { ascending: true }),
        supabase.from("user_last_seen").select("*").maybeSingle(),
      ]);

      setAllStocks(stocks);

      const wlRows: WatchlistRow[] = (wlResult.data || []).map((r) => ({
        ...r,
        stock: {
          ...r.stock,
          last_price: Number(r.stock.last_price),
          last_price_change: Number(r.stock.last_price_change),
          last_price_change_pct: Number(r.stock.last_price_change_pct),
        },
      }));
      setWatchlist(wlRows);

      if (seenResult.data) {
        setLastSeenAt(seenResult.data.last_seen_at);
        setLastSeenId(seenResult.data.id);
      }

      // Fetch history for watchlist stocks
      if (wlRows.length > 0) {
        const stockIds = wlRows.map((w) => w.stock_id);
        const marketData = await fetchMarketData(stockIds);
        setHistoryMap(marketData.history);
      }

      setLoading(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load data");
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Compute meaningful changes since last visit
  const changes: MeaningfulChange[] = useMemo(() => {
    if (!lastSeenAt) return [];
    const seenTime = new Date(lastSeenAt).getTime();

    return watchlist.map((item) => {
      const stock = item.stock;
      const history = historyMap[stock.id] || [];

      // Find the price closest to (but before) the last-seen time
      const seenDateStr = new Date(seenTime).toISOString().slice(0, 10);
      const beforeSeen = history.filter((h) => h.date <= seenDateStr);
      const priceThen = beforeSeen.length > 0 ? beforeSeen[beforeSeen.length - 1].close : null;

      const priceNow = stock.last_price;
      const absChange = priceThen != null ? priceNow - priceThen : stock.last_price_change;
      const pctChange = priceThen != null
        ? ((priceNow - priceThen) / priceThen) * 100
        : stock.last_price_change_pct;

      const severity = classifyChange(pctChange);

      // Check if alert thresholds were crossed
      let alertHit: "above" | "below" | null = null;
      if (item.alert_above != null && priceNow >= item.alert_above) {
        if (priceThen == null || priceThen < item.alert_above) alertHit = "above";
      }
      if (item.alert_below != null && priceNow <= item.alert_below) {
        if (priceThen == null || priceThen > item.alert_below) alertHit = "below";
      }

      const dsv = daysBetween(item.last_visited_at);

      return {
        stock,
        watchlistItem: item,
        priceThen,
        priceNow,
        absChange,
        pctChange,
        severity,
        crossedAbove: false,
        crossedBelow: false,
        alertHit,
        daysSinceVisited: dsv,
      };
    }).filter((c) => c.severity !== "none" || c.alertHit !== null);
  }, [watchlist, historyMap, lastSeenAt]);

  const handleAddStock = async (stockId: string) => {
    const { error } = await supabase
      .from("watchlist_items")
      .insert({ stock_id: stockId, user_id: user?.id });
    if (error) {
      setError(error.message);
      return;
    }
    await loadData();
  };

  const handleRemoveStock = async (_itemId: string) => {
    setSelectedStockId(null);
    await loadData();
  };

  const handleUpdateItem = (stockId: string, updates: Partial<WatchlistRow>) => {
    setWatchlist((prev) =>
      prev.map((w) => (w.stock_id === stockId ? { ...w, ...updates } : w))
    );
  };

  const handleAdvanceMarket = async () => {
    setRefreshing(true);
    try {
      await advanceMarket();
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to refresh market");
    }
    setRefreshing(false);
  };

  const handleDismissChanges = async () => {
    const now = new Date().toISOString();
    if (lastSeenId) {
      await supabase.from("user_last_seen").update({ last_seen_at: now }).eq("id", lastSeenId);
    } else {
      await supabase.from("user_last_seen").insert({ last_seen_at: now, user_id: user?.id });
    }
    setLastSeenAt(now);
  };

  const selectedStock = useMemo(() => {
    if (!selectedStockId) return null;
    const stock = allStocks.find((s) => s.id === selectedStockId);
    if (!stock) return null;
    const item = watchlist.find((w) => w.stock_id === selectedStockId);
    return { stock, item: item || null };
  }, [selectedStockId, allStocks, watchlist]);

  const watchlistStockIds = useMemo(
    () => new Set(watchlist.map((w) => w.stock_id)),
    [watchlist]
  );

  const sortedWatchlist = useMemo(() => {
    const sorted = [...watchlist];
    switch (sortBy) {
      case "ticker":
        sorted.sort((a, b) => a.stock.ticker.localeCompare(b.stock.ticker));
        break;
      case "price":
        sorted.sort((a, b) => b.stock.last_price - a.stock.last_price);
        break;
      case "change":
        sorted.sort((a, b) => Math.abs(b.stock.last_price_change_pct) - Math.abs(a.stock.last_price_change_pct));
        break;
      case "severity": {
        const changeMap = new Map(changes.map((c) => [c.stock.id, c]));
        sorted.sort((a, b) => {
          const ca = changeMap.get(a.stock_id);
          const cb = changeMap.get(b.stock_id);
          const sa = ca ? (ca.alertHit ? 4 : ca.severity === "major" ? 3 : ca.severity === "moderate" ? 2 : 1) : 0;
          const sb = cb ? (cb.alertHit ? 4 : cb.severity === "major" ? 3 : cb.severity === "moderate" ? 2 : 1) : 0;
          return sb - sa;
        });
        break;
      }
    }
    return sorted;
  }, [watchlist, sortBy, changes]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="flex items-center gap-3 text-slate-400">
          <RefreshCw className="w-5 h-5 animate-spin" />
          <span>Loading your watchlist...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-slate-950/90 backdrop-blur-lg border-b border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-500 to-blue-600 flex items-center justify-center shadow-lg shadow-emerald-500/20">
              <TrendingUp className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-base font-bold text-white tracking-tight">MarketLens</h1>
              <p className="text-xs text-slate-500">{watchlist.length} stocks tracked</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleAdvanceMarket}
              disabled={refreshing}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-slate-300 hover:text-white bg-slate-800/50 hover:bg-slate-800 rounded-lg transition-colors"
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
              <span className="hidden sm:inline">Refresh Market</span>
            </button>
            <button
              onClick={() => setShowAddModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-emerald-500 hover:bg-emerald-400 rounded-lg transition-colors shadow-lg shadow-emerald-500/20"
            >
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">Add Stock</span>
            </button>
            <button
              onClick={signOut}
              className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
              title="Sign out"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        {error && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-sm text-red-400">
            {error}
          </div>
        )}

        {/* Changes Since Last Visit */}
        <ChangesPanel
          changes={changes}
          lastSeenAt={lastSeenAt}
          onStockClick={setSelectedStockId}
          onDismiss={handleDismissChanges}
        />

        {/* Watchlist Table */}
        <div className="bg-slate-900/50 border border-slate-800 rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
            <h2 className="text-base font-semibold text-white">Your Watchlist</h2>
            <div className="flex items-center gap-1 text-xs">
              <span className="text-slate-500 mr-1">Sort:</span>
              {(["severity", "ticker", "price", "change"] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setSortBy(s)}
                  className={`px-2 py-1 rounded-md transition-colors capitalize ${
                    sortBy === s
                      ? "bg-slate-700 text-white"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          {sortedWatchlist.length === 0 ? (
            <div className="px-5 py-16 text-center">
              <p className="text-slate-400 mb-2">Your watchlist is empty</p>
              <p className="text-sm text-slate-500 mb-4">Add stocks to start tracking what matters.</p>
              <button
                onClick={() => setShowAddModal(true)}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-emerald-500 hover:bg-emerald-400 rounded-lg transition-colors"
              >
                <Plus className="w-4 h-4" /> Add your first stock
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="text-left text-xs text-slate-500 border-b border-slate-800/50">
                    <th className="px-5 py-2.5 font-medium">Ticker</th>
                    <th className="px-3 py-2.5 font-medium text-right">Price</th>
                    <th className="px-3 py-2.5 font-medium text-right hidden sm:table-cell">Today's Change</th>
                    <th className="px-3 py-2.5 font-medium hidden md:table-cell">30-Day Trend</th>
                    <th className="px-3 py-2.5 font-medium hidden lg:table-cell">Alerts</th>
                    <th className="px-3 py-2.5 font-medium hidden lg:table-cell">Note</th>
                    <th className="px-5 py-2.5 font-medium text-right">Last Visited</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedWatchlist.map((row) => {
                    const stock = row.stock;
                    const up = stock.last_price_change_pct >= 0;
                    const spark = (historyMap[stock.id] || []).map((h) => h.close);
                    const change = changes.find((c) => c.stock.id === stock.id);
                    const hasAlert = change?.alertHit != null;

                    return (
                      <tr
                        key={row.id}
                        onClick={() => setSelectedStockId(stock.id)}
                        className="border-b border-slate-800/30 hover:bg-slate-800/30 cursor-pointer transition-colors group"
                      >
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-white text-sm">{stock.ticker}</span>
                            {hasAlert && (
                              <span className="flex items-center justify-center w-5 h-5 rounded bg-rose-500/15 text-rose-400">
                                <Bell className="w-3 h-3" />
                              </span>
                            )}
                            {change?.severity === "major" && !hasAlert && (
                              <span className="text-xs text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded font-medium">
                                Major
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-slate-500 truncate max-w-[160px]">{stock.name}</div>
                        </td>
                        <td className="px-3 py-3 text-right">
                          <span className="text-sm font-medium text-white">${formatPrice(stock.last_price)}</span>
                        </td>
                        <td className="px-3 py-3 text-right hidden sm:table-cell">
                          <div className={`text-sm font-medium ${up ? "text-emerald-400" : "text-red-400"}`}>
                            {formatPct(stock.last_price_change_pct)}
                          </div>
                          <div className={`text-xs ${up ? "text-emerald-400/70" : "text-red-400/70"}`}>
                            {formatChange(stock.last_price_change)}
                          </div>
                        </td>
                        <td className="px-3 py-3 hidden md:table-cell">
                          <Sparkline data={spark} positive={up} />
                        </td>
                        <td className="px-3 py-3 hidden lg:table-cell">
                          <div className="flex items-center gap-2">
                            {row.alert_above != null && (
                              <span className="flex items-center gap-0.5 text-xs text-emerald-400/80 bg-emerald-500/10 px-1.5 py-0.5 rounded">
                                <ArrowUp className="w-3 h-3" />${formatPrice(row.alert_above)}
                              </span>
                            )}
                            {row.alert_below != null && (
                              <span className="flex items-center gap-0.5 text-xs text-red-400/80 bg-red-500/10 px-1.5 py-0.5 rounded">
                                <ArrowDown className="w-3 h-3" />${formatPrice(row.alert_below)}
                              </span>
                            )}
                            {row.alert_above == null && row.alert_below == null && (
                              <span className="text-xs text-slate-600">—</span>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-3 hidden lg:table-cell max-w-[120px]">
                          {row.note ? (
                            <div className="flex items-center gap-1 text-xs text-slate-400 truncate">
                              <StickyNote className="w-3 h-3 flex-shrink-0 text-amber-400/70" />
                              <span className="truncate">{row.note}</span>
                            </div>
                          ) : (
                            <span className="text-xs text-slate-600">—</span>
                          )}
                        </td>
                        <td className="px-5 py-3 text-right">
                          <span className="text-xs text-slate-500">{formatRelativeTime(row.last_visited_at)}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>

      {/* Modals */}
      {showAddModal && (
        <AddStockModal
          allStocks={allStocks}
          watchlistStockIds={watchlistStockIds}
          onAdd={handleAddStock}
          onClose={() => setShowAddModal(false)}
        />
      )}

      {selectedStock && (
        <StockDetailDrawer
          stock={selectedStock.stock}
          item={selectedStock.item}
          userId={user?.id || ""}
          onClose={() => setSelectedStockId(null)}
          onRemove={handleRemoveStock}
          onUpdate={(updates) => handleUpdateItem(selectedStock.stock.id, updates)}
        />
      )}
    </div>
  );
}
