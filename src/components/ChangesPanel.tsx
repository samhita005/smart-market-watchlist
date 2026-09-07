import { AlertTriangle, TrendingUp, TrendingDown, Bell, Eye } from "lucide-react";
import type { MeaningfulChange } from "@/lib/types";
import { formatPrice, formatPct, formatRelativeTime } from "@/lib/changeLogic";
import { sortChanges } from "@/lib/changeLogic";

interface ChangesPanelProps {
  changes: MeaningfulChange[];
  lastSeenAt: string | null;
  onStockClick: (stockId: string) => void;
  onDismiss: () => void;
}

export function ChangesPanel({ changes, lastSeenAt, onStockClick, onDismiss }: ChangesPanelProps) {
  const sorted = sortChanges(changes);
  const majorCount = sorted.filter((c) => c.severity === "major").length;
  const moderateCount = sorted.filter((c) => c.severity === "moderate").length;
  const alertCount = sorted.filter((c) => c.alertHit).length;

  if (sorted.length === 0) {
    return (
      <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center">
            <Eye className="w-5 h-5 text-emerald-400" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-white">Nothing Worth Your Attention</h2>
            <p className="text-sm text-slate-400">
              Since you last checked {formatRelativeTime(lastSeenAt)}, no stock moved meaningfully.
            </p>
          </div>
        </div>
        <button
          onClick={onDismiss}
          className="text-sm text-slate-500 hover:text-slate-300 transition-colors"
        >
          Mark as seen
        </button>
      </div>
    );
  }

  return (
    <div className="bg-slate-900/50 border border-slate-800 rounded-2xl overflow-hidden">
      <div className="p-5 border-b border-slate-800">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center">
              <AlertTriangle className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-white">What Changed Since You Last Checked</h2>
              <p className="text-sm text-slate-400">
                {formatRelativeTime(lastSeenAt)} ·{" "}
                {majorCount > 0 && <span className="text-amber-400">{majorCount} major </span>}
                {moderateCount > 0 && <span className="text-slate-300">{moderateCount} moderate</span>}
                {alertCount > 0 && <span className="text-rose-400"> · {alertCount} alert{alertCount > 1 ? "s" : ""} triggered</span>}
              </p>
            </div>
          </div>
          <button
            onClick={onDismiss}
            className="text-sm text-slate-500 hover:text-slate-300 transition-colors whitespace-nowrap"
          >
            Mark all seen
          </button>
        </div>
      </div>

      <div className="divide-y divide-slate-800/50">
        {sorted.map((change) => {
          const up = change.pctChange >= 0;
          const Icon = up ? TrendingUp : TrendingDown;
          const sevColor =
            change.severity === "major"
              ? "bg-amber-500/15 text-amber-400 border-amber-500/30"
              : change.severity === "moderate"
                ? "bg-blue-500/15 text-blue-400 border-blue-500/30"
                : "bg-slate-700/30 text-slate-400 border-slate-600/30";

          return (
            <button
              key={change.stock.id}
              onClick={() => onStockClick(change.stock.id)}
              className="w-full flex items-center gap-4 px-5 py-3 hover:bg-slate-800/30 transition-colors text-left group"
            >
              <div className={`flex-shrink-0 w-9 h-9 rounded-lg flex items-center justify-center border ${sevColor}`}>
                <Icon className="w-4 h-4" />
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-white text-sm">{change.stock.ticker}</span>
                  {change.alertHit && (
                    <span className="flex items-center gap-1 text-xs text-rose-400 bg-rose-500/10 px-1.5 py-0.5 rounded">
                      <Bell className="w-3 h-3" />
                      {change.alertHit === "above" ? "Above" : "Below"} alert
                    </span>
                  )}
                  {change.severity === "major" && (
                    <span className="text-xs text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded font-medium">
                      Major
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-500 truncate">{change.stock.name}</p>
              </div>

              <div className="flex-shrink-0 text-right">
                {change.priceThen != null && (
                  <div className="text-xs text-slate-500">
                    ${formatPrice(change.priceThen)} → ${formatPrice(change.priceNow)}
                  </div>
                )}
                <div className={`text-sm font-semibold ${up ? "text-emerald-400" : "text-red-400"}`}>
                  {formatPct(change.pctChange)}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
