import { useState, useEffect, useMemo } from "react";
import { X, Save, Bell, Trash2, Clock } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { fetchHistory } from "@/lib/api";
import type { Stock, WatchlistItem, PriceSnapshot } from "@/lib/types";
import { formatPrice, formatPct, formatChange, formatRelativeTime } from "@/lib/changeLogic";
import { Sparkline } from "./Sparkline";

interface StockDetailDrawerProps {
  stock: Stock;
  item: WatchlistItem | null;
  userId: string;
  onClose: () => void;
  onRemove: (itemId: string) => void;
  onUpdate: (updates: Partial<WatchlistItem>) => void;
}

export function StockDetailDrawer({
  stock,
  item,
  userId,
  onClose,
  onRemove,
  onUpdate,
}: StockDetailDrawerProps) {
  const [history, setHistory] = useState<PriceSnapshot[]>([]);
  const [note, setNote] = useState(item?.note || "");
  const [alertAbove, setAlertAbove] = useState(
    item?.alert_above != null ? String(item.alert_above) : ""
  );
  const [alertBelow, setAlertBelow] = useState(
    item?.alert_below != null ? String(item.alert_below) : ""
  );
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setNote(item?.note || "");
    setAlertAbove(item?.alert_above != null ? String(item.alert_above) : "");
    setAlertBelow(item?.alert_below != null ? String(item.alert_below) : "");
  }, [item]);

  useEffect(() => {
    fetchHistory(stock.id, 90).then(setHistory).catch(() => {});
  }, [stock.id]);

  // Mark as visited
  useEffect(() => {
    if (item) {
      supabase
        .from("watchlist_items")
        .update({ last_visited_at: new Date().toISOString() })
        .eq("id", item.id)
        .then(() => {
          onUpdate({ last_visited_at: new Date().toISOString() });
        });
    }
  }, [item?.id]);

  const sparkData = useMemo(() => history.map((h) => h.close), [history]);

  const chartData = useMemo(() => {
    if (history.length < 2) return null;
    const width = 520;
    const height = 200;
    const min = Math.min(...history.map((h) => h.close));
    const max = Math.max(...history.map((h) => h.close));
    const range = max - min || 1;
    const step = width / (history.length - 1);
    const points = history
      .map((h, i) => {
        const x = i * step;
        const y = height - ((h.close - min) / range) * height;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");
    const areaPoints = `0,${height} ${points} ${width},${height}`;
    const isPositive = history[history.length - 1].close >= history[0].close;
    const color = isPositive ? "#10b981" : "#ef4444";
    return { points, areaPoints, width, height, color, min, max };
  }, [history]);

  const handleSave = async () => {
    if (!item) return;
    setSaving(true);
    const updates: Record<string, unknown> = {
      note: note.trim() || null,
      alert_above: alertAbove.trim() ? parseFloat(alertAbove) : null,
      alert_below: alertBelow.trim() ? parseFloat(alertBelow) : null,
    };
    const { error } = await supabase.from("watchlist_items").update(updates).eq("id", item.id);
    setSaving(false);
    if (!error) {
      setSaved(true);
      onUpdate(updates as Partial<WatchlistItem>);
      setTimeout(() => setSaved(false), 2000);
    }
  };

  const handleRemove = async () => {
    if (!item) return;
    await supabase.from("watchlist_items").delete().eq("id", item.id);
    onRemove(item.id);
  };

  const up = stock.last_price_change_pct >= 0;
  const high90 = history.length ? Math.max(...history.map((h) => h.close)) : stock.last_price;
  const low90 = history.length ? Math.min(...history.map((h) => h.close)) : stock.last_price;

  return (
    <div
      className="fixed inset-0 z-40 flex justify-end bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl h-full bg-slate-900 border-l border-slate-800 overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 z-10 bg-slate-900/95 backdrop-blur border-b border-slate-800 px-6 py-4">
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-3">
                <h2 className="text-2xl font-bold text-white">{stock.ticker}</h2>
                <span className={`text-sm font-medium px-2 py-0.5 rounded ${up ? "bg-emerald-500/15 text-emerald-400" : "bg-red-500/15 text-red-400"}`}>
                  {formatPct(stock.last_price_change_pct)}
                </span>
              </div>
              <p className="text-slate-400 text-sm mt-0.5">{stock.name}</p>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="px-6 py-5 space-y-6">
          {/* Price + Chart */}
          <div>
            <div className="flex items-baseline gap-3 mb-3">
              <span className="text-3xl font-bold text-white">${formatPrice(stock.last_price)}</span>
              <span className={`text-base font-medium ${up ? "text-emerald-400" : "text-red-400"}`}>
                {formatChange(stock.last_price_change)} today
              </span>
            </div>

            {chartData ? (
              <svg viewBox={`0 0 ${chartData.width} ${chartData.height}`} className="w-full h-48">
                <polygon points={chartData.areaPoints} fill={chartData.color} opacity={0.1} />
                <polyline
                  points={chartData.points}
                  fill="none"
                  stroke={chartData.color}
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            ) : (
              <div className="w-full h-48 bg-slate-800/30 rounded-lg flex items-center justify-center text-slate-500 text-sm">
                Loading chart...
              </div>
            )}

            <div className="grid grid-cols-3 gap-3 mt-4">
              <div className="bg-slate-800/30 rounded-lg px-4 py-3">
                <div className="text-xs text-slate-500 mb-0.5">90-Day High</div>
                <div className="text-sm font-medium text-white">${formatPrice(high90)}</div>
              </div>
              <div className="bg-slate-800/30 rounded-lg px-4 py-3">
                <div className="text-xs text-slate-500 mb-0.5">90-Day Low</div>
                <div className="text-sm font-medium text-white">${formatPrice(low90)}</div>
              </div>
              <div className="bg-slate-800/30 rounded-lg px-4 py-3">
                <div className="text-xs text-slate-500 mb-0.5">Last Visited</div>
                <div className="text-sm font-medium text-white flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {formatRelativeTime(item?.last_visited_at || null)}
                </div>
              </div>
            </div>
          </div>

          {/* Alert thresholds */}
          {item && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Bell className="w-4 h-4 text-amber-400" />
                <h3 className="text-sm font-semibold text-white">Price Alerts</h3>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Alert above $</label>
                  <input
                    type="number"
                    step="0.01"
                    value={alertAbove}
                    onChange={(e) => setAlertAbove(e.target.value)}
                    placeholder="No upper alert"
                    className="w-full px-3 py-2 bg-slate-800/50 border border-slate-700 rounded-lg text-white text-sm placeholder-slate-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Alert below $</label>
                  <input
                    type="number"
                    step="0.01"
                    value={alertBelow}
                    onChange={(e) => setAlertBelow(e.target.value)}
                    placeholder="No lower alert"
                    className="w-full px-3 py-2 bg-slate-800/50 border border-slate-700 rounded-lg text-white text-sm placeholder-slate-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-colors"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Note */}
          {item && (
            <div>
              <h3 className="text-sm font-semibold text-white mb-2">Note</h3>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={4}
                placeholder="Add a note about this stock..."
                className="w-full px-3 py-2 bg-slate-800/50 border border-slate-700 rounded-lg text-white text-sm placeholder-slate-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-colors resize-none"
              />
            </div>
          )}

          {/* Actions */}
          {item && (
            <div className="flex items-center gap-3 pt-2">
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-2 px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
              >
                <Save className="w-4 h-4" />
                {saving ? "Saving..." : saved ? "Saved!" : "Save Changes"}
              </button>
              <button
                onClick={handleRemove}
                className="flex items-center gap-2 px-4 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 text-sm font-medium rounded-lg transition-colors"
              >
                <Trash2 className="w-4 h-4" />
                Remove
              </button>
            </div>
          )}

          {!item && (
            <div className="text-center text-slate-500 text-sm py-4">
              Add this stock to your watchlist to set alerts and notes.
            </div>
          )}

          {/* History table */}
          {history.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-white mb-2">Price History</h3>
              <div className="max-h-48 overflow-y-auto rounded-lg border border-slate-800">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-slate-800/80">
                    <tr className="text-left text-xs text-slate-400">
                      <th className="px-3 py-2 font-medium">Date</th>
                      <th className="px-3 py-2 font-medium text-right">Close</th>
                      <th className="px-3 py-2 font-medium text-right">Change</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...history].reverse().slice(0, 20).map((h) => (
                      <tr key={h.date} className="border-t border-slate-800/50">
                        <td className="px-3 py-2 text-slate-300">{h.date}</td>
                        <td className="px-3 py-2 text-right text-white">${formatPrice(h.close)}</td>
                        <td className={`px-3 py-2 text-right font-medium ${h.change_pct >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                          {formatPct(h.change_pct)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
