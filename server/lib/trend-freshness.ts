/** Strict date parsing for current trend intelligence. Undated sources are never presented as live trends. */
export const TREND_FRESHNESS_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Convert ISO dates, human-readable dates, and search-engine relative ages into ISO timestamps. */
export function normalizeTrendPublishedAt(value: unknown, now = Date.now()): string | undefined {
  const raw = String(value ?? '').trim();
  if (!raw) return undefined;
  const lower = raw.toLowerCase();
  if (/^(today|just now|moments ago)$/.test(lower)) return new Date(now).toISOString();
  if (lower === 'yesterday') return new Date(now - DAY_MS).toISOString();
  const relative = lower.match(/^(?:about\s+)?(\d+(?:\.\d+)?)\s*(minutes?|mins?|hours?|hrs?|days?|weeks?|months?|years?)\s*(?:ago|old)?$/);
  if (relative) {
    const amount = Number(relative[1]);
    const unit = relative[2];
    const multiplier = /^(?:minute|min)/.test(unit) ? 60_000
      : /^(?:hour|hr)/.test(unit) ? 60 * 60_000
      : /^day/.test(unit) ? DAY_MS
      : /^week/.test(unit) ? 7 * DAY_MS
      : /^month/.test(unit) ? 30 * DAY_MS
      : 365 * DAY_MS;
    if (!Number.isFinite(amount) || amount < 0) return undefined;
    return new Date(now - amount * multiplier).toISOString();
  }
  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : undefined;
}

export function isRecentTrendSource(value: unknown, now = Date.now(), maxDays = TREND_FRESHNESS_DAYS): boolean {
  const normalized = normalizeTrendPublishedAt(value, now);
  if (!normalized) return false;
  const age = now - Date.parse(normalized);
  return age >= -DAY_MS && age <= Math.max(1, maxDays) * DAY_MS;
}
