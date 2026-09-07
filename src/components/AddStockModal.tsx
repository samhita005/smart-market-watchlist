import { useState, useMemo } from "react";
import { Search, Plus, X, Check } from "lucide-react";
import type { Stock } from "@/lib/types";
import { formatPrice, formatPct } from "@/lib/changeLogic";

interface AddStockModalProps {
  allStocks: Stock[];
  watchlistStockIds: Set<string>;
  onAdd: (stockId: string) => void;
  onClose: () => void;
}

export function AddStockModal({ allStocks, watchlistStockIds, onAdd, onClose }: AddStockModalProps) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    if (!query.trim()) return allStocks;
    const q = query.toLowerCase();
    return allStocks.filter(
      (s) =>
        s.ticker.toLowerCase().includes(q) ||
        s.name.toLowerCase().includes(q) ||
        (s.sector || "").toLowerCase().includes(q)
    );
  }, [query, allStocks]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[10vh] px-4 bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg bg-slate-900 rounded-2xl border border-slate-800 shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-slate-800">
          <h2 className="text-lg font-semibold text-white">Add to Watchlist</h2>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4">
          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input
              autoFocus
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by ticker, name, or sector..."
              className="w-full pl-10 pr-4 py-2.5 bg-slate-800/50 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-colors"
            />
          </div>

          <div className="max-h-[50vh] overflow-y-auto space-y-1">
            {filtered.length === 0 && (
              <p className="text-center text-slate-500 py-8 text-sm">No stocks found</p>
            )}
            {filtered.map((stock) => {
              const inList = watchlistStockIds.has(stock.id);
              const up = stock.last_price_change_pct >= 0;
              return (
                <div
                  key={stock.id}
                  className="flex items-center justify-between px-3 py-2.5 rounded-lg hover:bg-slate-800/50 transition-colors group"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="flex-shrink-0 w-12 text-sm font-bold text-white">
                      {stock.ticker}
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm text-slate-300 truncate">{stock.name}</div>
                      <div className="text-xs text-slate-500">{stock.sector}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 flex-shrink-0">
                    <div className="text-right">
                      <div className="text-sm font-medium text-white">
                        ${formatPrice(stock.last_price)}
                      </div>
                      <div className={`text-xs font-medium ${up ? "text-emerald-400" : "text-red-400"}`}>
                        {formatPct(stock.last_price_change_pct)}
                      </div>
                    </div>
                    {inList ? (
                      <div className="flex items-center gap-1 text-emerald-400 text-xs w-20 justify-center">
                        <Check className="w-4 h-4" /> In list
                      </div>
                    ) : (
                      <button
                        onClick={() => onAdd(stock.id)}
                        className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20 rounded-lg transition-colors w-20 justify-center"
                      >
                        <Plus className="w-4 h-4" /> Add
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
