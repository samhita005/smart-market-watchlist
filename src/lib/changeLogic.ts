import type { MeaningfulChange, ChangeSeverity } from "./types";

// What counts as a "meaningful" change?
// We use percentage moved since the user's last visit, with three tiers:
//   MAJOR: >= 5%   — genuinely significant, always surface
//   MODERATE: >= 2% — worth noting, surface in the changes panel
//   MINOR: < 2%    — noise, only show if an alert was crossed
const MAJOR_THRESHOLD = 5;
const MODERATE_THRESHOLD = 2;

export function classifyChange(pctChange: number): ChangeSeverity {
  const abs = Math.abs(pctChange);
  if (abs >= MAJOR_THRESHOLD) return "major";
  if (abs >= MODERATE_THRESHOLD) return "moderate";
  if (abs > 0.01) return "minor";
  return "none";
}

export function severityRank(s: ChangeSeverity): number {
  switch (s) {
    case "major": return 3;
    case "moderate": return 2;
    case "minor": return 1;
    case "none": return 0;
  }
}

export function sortChanges(changes: MeaningfulChange[]): MeaningfulChange[] {
  return [...changes].sort((a, b) => {
    // Alert hits first, then severity, then absolute % change
    const aAlert = a.alertHit ? 1 : 0;
    const bAlert = b.alertHit ? 1 : 0;
    if (aAlert !== bAlert) return bAlert - aAlert;
    const rankDiff = severityRank(b.severity) - severityRank(a.severity);
    if (rankDiff !== 0) return rankDiff;
    return Math.abs(b.pctChange) - Math.abs(a.pctChange);
  });
}

export function formatPrice(n: number): string {
  return n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function formatPct(n: number): string {
  const sign = n >= 0 ? "+" : "";
  return `${sign}${n.toFixed(2)}%`;
}

export function formatChange(n: number): string {
  const sign = n >= 0 ? "+" : "";
  return `${sign}${n.toFixed(2)}`;
}

export function formatRelativeTime(iso: string | null): string {
  if (!iso) return "never";
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diffMs = now - then;
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMs / 3600000);
  const diffDay = Math.floor(diffMs / 86400000);

  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDay === 1) return "1 day ago";
  return `${diffDay} days ago`;
}

export function daysBetween(iso: string | null): number | null {
  if (!iso) return null;
  const then = new Date(iso).getTime();
  const now = Date.now();
  return Math.floor((now - then) / 86400000);
}
