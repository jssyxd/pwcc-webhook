/**
 * Phase 02.17.26 — Signal drift detection for the Weather Intelligence panel.
 *
 * Pure functions only. The React side owns the refs/state; this module owns
 * the comparison math so it can be unit-tested without mounting a component.
 *
 * project law 2026-04-11: real money depends on the trader spotting when a
 * city's signal changes between polls (new best model, new bucket, or a
 * currentWR jump). False positives and missed drifts are both unacceptable,
 * so every trigger has a precise, deterministic rule.
 */

export interface SignalSnapshot {
  bestSingleModel: string | null
  bestSingleWR: number | null
  currentWR: number | null
  method: 'CONSENSUS' | 'SINGLE_MODEL' | 'TIGHT_SPREAD' | null
  modelsAgreeing: string[] // canonicalized (sorted) BEFORE storing
  agreedBucket: string | null
  label: string | null
  ts: number // ms epoch when this snapshot was observed
}

export type DriftTrigger = 'BEST_MODEL' | 'BUCKET' | 'METHOD' | 'WR' | 'MODELS_SET'

export interface DriftEvent {
  prev: SignalSnapshot
  curr: SignalSnapshot
  triggeredAt: number // ms epoch
  triggers: DriftTrigger[]
}

export const WR_THRESHOLD_PP = 3
export const BANNER_TTL_MS = 5 * 60 * 1000 // 5 minutes

/**
 * Build a canonical SignalSnapshot from whatever the weather-intel endpoint
 * returns on `city.dynamicSignal`. Always sorts modelsAgreeing so a reordered
 * array doesn't produce a false-positive drift.
 */
export function makeSnapshot(
  ds:
    | {
        bestSingleModel?: string | null
        bestSingleWR?: number | null
        currentWR?: number | null
        method?: string | null
        modelsAgreeing?: unknown
        agreedBucket?: string | null
        label?: string | null
      }
    | null
    | undefined,
  ts: number,
): SignalSnapshot | null {
  if (!ds) return null
  const method = ds.method
  // Only accept known method values; anything else becomes null so the
  // comparison can't trigger on a freeform string drift.
  const validMethod: SignalSnapshot['method'] =
    method === 'CONSENSUS' || method === 'SINGLE_MODEL' || method === 'TIGHT_SPREAD' ? method : null
  // Harden numeric fields: `Number.isFinite` rejects NaN, ±Infinity, and
  // non-number types. `typeof x === 'number'` would accept NaN which then
  // poisons Math.abs() in diffSnapshots() with a `NaN >= 3` false-negative.
  const finiteOrNull = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)
  // Sanitize modelsAgreeing: coerce to string-only array, dedupe, sort.
  // Upstream is typed as string[] but is JSON from an HTTP boundary, so a
  // malformed payload (numbers, objects, null entries) can reach here and
  // `join(',')` would then coerce them into surprising strings.
  const rawModels: unknown = ds.modelsAgreeing
  const sanitizedModels: string[] = Array.isArray(rawModels)
    ? Array.from(new Set(rawModels.filter((m): m is string => typeof m === 'string'))).sort()
    : []
  return {
    bestSingleModel: typeof ds.bestSingleModel === 'string' ? ds.bestSingleModel : null,
    bestSingleWR: finiteOrNull(ds.bestSingleWR),
    currentWR: finiteOrNull(ds.currentWR),
    method: validMethod,
    modelsAgreeing: sanitizedModels,
    agreedBucket: typeof ds.agreedBucket === 'string' ? ds.agreedBucket : null,
    label: typeof ds.label === 'string' ? ds.label : null,
    ts,
  }
}

/**
 * Compare two snapshots and return the list of triggers fired. Empty array
 * means "no drift". Treats a null→value transition as a drift (the signal
 * became valid); treats value→null as a drift (the signal became invalid).
 */
export function diffSnapshots(prev: SignalSnapshot, curr: SignalSnapshot): DriftTrigger[] {
  const triggers: DriftTrigger[] = []
  if (prev.bestSingleModel !== curr.bestSingleModel) triggers.push('BEST_MODEL')
  if (prev.agreedBucket !== curr.agreedBucket) triggers.push('BUCKET')
  if (prev.method !== curr.method) triggers.push('METHOD')
  // Raw-WR threshold: abs delta >= 3pp. Null on either side counts as a drift
  // only if the other side is a number (value appeared / disappeared).
  if (prev.currentWR !== null && curr.currentWR !== null) {
    if (Math.abs(curr.currentWR - prev.currentWR) >= WR_THRESHOLD_PP) triggers.push('WR')
  } else if (prev.currentWR !== curr.currentWR) {
    // null → value or value → null transition
    triggers.push('WR')
  }
  // Both arrays are already sorted+deduped by makeSnapshot. Compare as joined
  // strings — simpler and allocation-free enough for the 41-city loop.
  if (prev.modelsAgreeing.join(',') !== curr.modelsAgreeing.join(',')) triggers.push('MODELS_SET')
  return triggers
}

/**
 * Color classification for a drift event. Amber for WR drops >= 5pp, green
 * for WR rises >= 5pp, blue for everything else (bucket/method/best-model
 * moves without a big WR swing).
 */
export type DriftColor = 'amber' | 'green' | 'blue'

export function classifyDrift(event: DriftEvent): DriftColor {
  const { prev, curr } = event
  if (prev.currentWR !== null && curr.currentWR !== null) {
    const delta = curr.currentWR - prev.currentWR
    if (delta <= -5) return 'amber'
    if (delta >= 5) return 'green'
  }
  return 'blue'
}

/** Human-readable "47s ago" / "1m ago" / "3m ago". Caps at 5 minutes. */
export function formatAge(ms: number): string {
  if (ms < 0) return 'just now'
  if (ms < 60_000) return `${Math.floor(ms / 1000)}s ago`
  return `${Math.floor(ms / 60_000)}m ago`
}

/**
 * Build the banner headline. Always leads with the most-trader-actionable
 * trigger: WR > BUCKET > BEST_MODEL > METHOD > MODELS_SET. Includes the
 * previous and current states so the trader can reconcile visually.
 */
export function formatBannerText(event: DriftEvent, nowMs: number): string {
  const { prev, curr, triggers } = event
  const age = formatAge(nowMs - event.triggeredAt)
  const prevWR = prev.currentWR !== null ? `${Math.round(prev.currentWR)}%` : '—'
  const currWR = curr.currentWR !== null ? `${Math.round(curr.currentWR)}%` : '—'
  const prevBucket = prev.agreedBucket ?? '—'
  const currBucket = curr.agreedBucket ?? '—'

  if (triggers.includes('WR')) {
    return `SIGNAL CHANGED: was ${prevWR} (bet ${prevBucket}), now ${currWR} (bet ${currBucket}) — ${age}`
  }
  if (triggers.includes('BUCKET')) {
    return `BUCKET MOVED: was ${prevBucket} (${prevWR}), now ${currBucket} (${currWR}) — ${age}`
  }
  if (triggers.includes('BEST_MODEL')) {
    return `BEST MODEL CHANGED: was ${prev.bestSingleModel ?? '—'} (${prevBucket}), now ${curr.bestSingleModel ?? '—'} (${currBucket}) — ${age}`
  }
  if (triggers.includes('METHOD')) {
    return `METHOD CHANGED: was ${prev.method ?? '—'} (${prevBucket}), now ${curr.method ?? '—'} (${currBucket}) — ${age}`
  }
  if (triggers.includes('MODELS_SET')) {
    return `MODEL SET CHANGED: was ${prev.modelsAgreeing.join('+') || '—'}, now ${curr.modelsAgreeing.join('+') || '—'} — ${age}`
  }
  return `SIGNAL CHANGED — ${age}`
}

/**
 * Prune expired banners (> BANNER_TTL_MS old). Returns a new record if
 * anything changed, otherwise returns the same reference for cheap
 * referential-equality skips in React.
 */
export function pruneExpired(banners: Record<string, DriftEvent>, nowMs: number): Record<string, DriftEvent> {
  let changed = false
  const out: Record<string, DriftEvent> = {}
  for (const [slug, b] of Object.entries(banners)) {
    if (nowMs - b.triggeredAt < BANNER_TTL_MS) {
      out[slug] = b
    } else {
      changed = true
    }
  }
  return changed ? out : banners
}
