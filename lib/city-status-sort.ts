/**
 * city-status-sort — shared city-list sort utility (v3.77.20)
 *
 * Single source of truth for the LIVE > SLEEP > LOCKED status-grouped sort
 * that renders on every city list across the dashboard.
 *
 * Previously lived inline in `app/brain/trading/page.tsx` (v3.77.15). Extracted
 * here so the weather-data page and any future city list can call the same
 * comparator and guarantee identical behaviour.
 *
 * ─── Classification rules (enforced in this order — do NOT reorder) ──────────
 *
 * 1. `tradeBlocked === true`                                  → LOCKED (2).
 *    Hard override: a blocked city is never LIVE, even if liveMarkets > 0.
 *    Strict === guards against a truthy-but-not-true upstream value.
 *
 * 2. `typeof liveMarkets === 'number' && liveMarkets > 0`    → LIVE (0).
 *    Strict type check prevents null/undefined from silently reading as truthy.
 *
 * 3. Everything else (0, null, undefined, NaN, missing field) → SLEEP (1).
 *
 * ─── Sort keys ───────────────────────────────────────────────────────────────
 *
 * Primary key: status group (LIVE=0 < SLEEP=1 < LOCKED=2).
 * Secondary key: CITY_ORDER — canonical static index from CITY_IDS.
 *
 * Within each group positions are fixed and never bounce between polls.
 * Cities legitimately reorder only when their market state changes — that is
 * the intended behaviour (e.g. a city moving from LOCKED → LIVE at market
 * open, or LIVE → SLEEP at market close).
 */

import { CITY_IDS } from '@/lib/weather-cities'

export type CityStatusGroup = 0 | 1 | 2

/**
 * Canonical city ordering — `CITY_ORDER[slug]` returns that slug's index in
 * `CITY_IDS`. Unknown slugs fall back to `999` via the `??` nullish coalesce
 * in the comparator, placing them last within their group.
 */
export const CITY_ORDER: Record<string, number> = Object.fromEntries(
  CITY_IDS.map((id, i) => [id, i])
)

/**
 * Map a city record to its display group. Accepts any object with optional
 * `tradeBlocked` and `liveMarkets` fields — a deliberately loose shape so
 * both `WUCityIntel` (trading page) and `LiveCityIntel` (weather-data page)
 * satisfy it without extra casts.
 */
export function cityStatusGroup(c: {
  tradeBlocked?: boolean
  liveMarkets?: number | null
}): CityStatusGroup {
  if (c.tradeBlocked === true) return 2
  if (typeof c.liveMarkets === 'number' && c.liveMarkets > 0) return 0
  return 1
}

/**
 * Comparator for `Array.prototype.sort` that orders cities LIVE → SLEEP → LOCKED,
 * with canonical CITY_ORDER as the tiebreaker. Modern JS engines (V8,
 * SpiderMonkey, JavaScriptCore) all use Timsort which is stable, so entries
 * that tie on both keys preserve their input order.
 *
 * Callers should always spread the source array (`[...cities].sort(...)`) to
 * avoid mutating React state or props.
 */
export function compareCitiesByStatus<
  T extends { tradeBlocked?: boolean; liveMarkets?: number | null; city: string },
>(a: T, b: T): number {
  const ga = cityStatusGroup(a)
  const gb = cityStatusGroup(b)
  if (ga !== gb) return ga - gb
  return (CITY_ORDER[a.city] ?? 999) - (CITY_ORDER[b.city] ?? 999)
}
