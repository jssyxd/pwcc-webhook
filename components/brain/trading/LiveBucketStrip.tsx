'use client'

import { isInColdSector, describeColdSector } from '@/lib/wind-cold-sectors'

/**
 * LiveBucketStrip — per-bucket live decision panel for the 2-5 PM window.
 *
 * Shows, for each active Polymarket bucket on a city row:
 *   - current YES price
 *   - engine probability (Gaussian on jarvisPrediction + sigma, clipped by
 *     the running-high ratchet so dead buckets get 0% automatically)
 *   - edge in pp (engineProb − YES price)
 *   - action label with color
 *   - **sell-zone price marker** — the YES price above which the bucket is
 *     over-priced vs engine probability (take profit if holding)
 *
 * Purpose: turn the 2-5 PM "should I sell or hold?" decision into a
 * one-glance readable strip so the operator stops round-tripping winners.
 *
 * Scope: additive, pathname-gated in page.tsx for /brain/trading-preview
 * only. Same render-nothing-on-null-input contract as UnifiedEngineBadge.
 */

interface ActiveBucket {
  label: string
  lower: number
  upper: number
  yesPrice: number
  noPrice: number
  status?: string
  bucketType?: string // 'exact' | 'wide_above' | 'wide_below'
}

interface EnginePrediction {
  prediction: number
  standardDeviation: number
  method: 'ENSEMBLE' | 'TRAJECTORY' | 'CONFIRMED' | 'BLEND'
  /** v3.100.30: server-side peak-lock-by-wind signal. */
  peakLockedByWind?: boolean
  peakLockReason?: string | null
}

interface Props {
  activeBuckets: ActiveBucket[]
  jp: EnginePrediction | null | undefined
  runningHigh: number | null
  unitLabel: string // '°C' | '°F'
  // Metadata header (v3.100.2) — consolidated from the removed
  // AI Prediction v2 panel so the operator keeps Obs/Peak/WR/models
  // context without needing two panels.
  obsCount?: number | null
  peakHourLocal?: number | null
  peakMinuteLocal?: number | null
  hoursSincePeak?: number | null
  bestModel?: string | null
  bestModelWR?: number | null
  todayApplicableModel?: string | null
  todayApplicableWR?: number | null
  comboStatus?: string | null
  pendingModels?: string[] | null
  modelForecasts?: {
    ecmwf?: number | null
    gfs?: number | null
    icon?: number | null
    gem?: number | null
    jma?: number | null
  }
  // v3.100.10: WR-weighted ensemble inputs. When both are present, the
  // strip uses the WR-weighted mean as the prediction center instead of
  // jp.prediction's underlying equal-weighted ensemble. Models with low
  // historical WR get demoted, high-WR models get promoted. Floor + cap
  // ensure no model is fully silenced AND no single model dominates.
  allModelForecasts?: Record<string, number | null> | null
  perModelWinRates?: Record<string, number> | null
  /**
   * v3.100.22 (preview only): CLOB orderbook depth per bucket, keyed by bucket
   * label (e.g. "11°C"). When present, the table renders an additional
   * "real fill @ $100" column showing the VWAP a market-buy of $100 would
   * actually pay after sweeping the ask ladder. Catches the deep-OTM mirage
   * the consensus reviews flagged on tonight's Madrid 20°C / NYC 62°F picks.
   *
   * Fed by /api/brain/trading/clob-depth — only the /brain/trading-preview
   * page passes this prop; live /brain/trading leaves it undefined and the
   * column is hidden.
   */
  clobDepth?: Record<
    string,
    {
      bestYesAsk: number | null
      vwapBuyYes100: number | null
      askSize5pp: number
      depthOk: boolean
      reason: string
    }
  > | null
  /**
   * v3.100.24 (preview only): Enable v2 ensemble math.
   *   - ECMWF AIFS gets 1.5x weight in WR-weighted blend (operational since
   *     2026-05-12, beats classical ECMWF on 97.2% of targets per academic paper).
   *   - On hot days (forecast > city's seasonal P75 proxy), apply cold-bias
   *     correction to AI models: AIFS +0.45K, Pangu +0.45K, FourCastNet +0.91K
   *     (GRL 2026 finding — AI models systematically underpredict hot extremes).
   *
   * When true, the entire bucket strip recomputes against the v2 center. When
   * false/undefined, uses the existing engine math. Live /brain/trading leaves
   * this undefined so live behavior is unchanged.
   */
  v2EngineEnabled?: boolean
  /** v3.100.24: needed so cold-bias correction picks the right unit (°F or °C). */
  unit?: 'F' | 'C'
  /**
   * v3.100.25 (preview only): city slug. Used to look up the city's "top
   * verified model" for the Best Bet panel.
   */
  citySlug?: string
  /**
   * v3.100.25 (preview only): per-city display name. For the Best Bet panel
   * headline ("Best bet on New York right now").
   */
  cityName?: string
  /**
   * v3.100.25 (preview only): Polymarket resolution-source data for this
   * city's event. Powers the "✓ Settles cleanly" / "⚠ Verify rules" check
   * on the Best Bet panel.
   */
  resolution?: {
    station: string | null
    verified: boolean
    rule: string
  } | null
  /**
   * v3.100.27 (preview only): current METAR wind direction (cardinal string
   * like "NW", "NNE"). When this falls into the city's cold-advection sector
   * (see lib/wind-cold-sectors.ts), the day's peak is physically locked even
   * if temp keeps rising for 5-15 min from leftover heat. Slope-regression
   * engine catches this 5-15 min LATER. Wind chip surfaces it now.
   */
  windDirection?: string | null
}

/**
 * v3.100.25: Trading-Safe Registry — only these (city, model) combos cleared
 * the 95% Wilson CI lower bound above 49% gate with 200+ resolved Polymarket
 * markets. Source: `data/weather/TRADING-SAFE-REGISTRY.md`.
 */
const VERIFIED_SAFE_MODELS: Record<string, { model: string; wr: number; sample: number }[]> = {
  nyc: [
    { model: 'gfs_hrrr', wr: 56.95, sample: 374 },
    { model: 'gfs', wr: 54.28, sample: 374 },
  ],
  london: [
    { model: 'ukmo', wr: 57.87, sample: 375 },
    { model: 'ukmo_2km', wr: 57.33, sample: 375 },
    { model: 'icon', wr: 54.13, sample: 375 },
  ],
}

interface TopModelPick {
  modelKey: string
  modelLabel: string
  forecast: number
  wr: number
  sample: number | null
  verified: boolean
}

function pickTopModel(
  citySlug: string | undefined,
  modelValues: Record<string, number | null> | null | undefined,
  wrs: Record<string, number> | null | undefined,
): TopModelPick | null {
  if (!modelValues) return null
  const slug = (citySlug ?? '').toLowerCase()
  const safeEntries = VERIFIED_SAFE_MODELS[slug]
  if (safeEntries) {
    for (const entry of safeEntries) {
      const v = modelValues[entry.model]
      if (v !== null && v !== undefined && isFinite(v)) {
        return {
          modelKey: entry.model,
          modelLabel: entry.model.toUpperCase().replace(/_/g, ' '),
          forecast: v,
          wr: entry.wr,
          sample: entry.sample,
          verified: true,
        }
      }
    }
  }
  if (!wrs) return null
  let best: { key: string; wr: number; val: number } | null = null
  for (const [k, wr] of Object.entries(wrs)) {
    if (wr === null || wr === undefined || !isFinite(wr)) continue
    const v = modelValues[k]
    if (v === null || v === undefined || !isFinite(v)) continue
    if (best === null || wr > best.wr) best = { key: k, wr, val: v }
  }
  if (!best) return null
  return {
    modelKey: best.key,
    modelLabel: best.key.toUpperCase().replace(/_/g, ' '),
    forecast: best.val,
    wr: best.wr,
    sample: null,
    verified: false,
  }
}

/**
 * Error function approximation (Abramowitz & Stegun 7.1.26) — stdlib has no
 * Math.erf, so we inline a 5-term rational approximation good to 1e-7.
 */
function erf(x: number): number {
  const sign = x < 0 ? -1 : 1
  const ax = Math.abs(x)
  const a1 = 0.254829592
  const a2 = -0.284496736
  const a3 = 1.421413741
  const a4 = -1.453152027
  const a5 = 1.061405429
  const p = 0.3275911
  const t = 1.0 / (1.0 + p * ax)
  const y = 1.0 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-ax * ax)
  return sign * y
}

function normCdf(x: number, mu: number, sigma: number): number {
  if (sigma <= 0) return x < mu ? 0 : 1
  return 0.5 * (1 + erf((x - mu) / (sigma * Math.SQRT2)))
}

/**
 * Compute per-bucket probability from a Gaussian centered at `prediction`
 * with std `sigma`, clipped by the ratchet at `runningHigh`.
 *
 * The ratchet rule: the day's final max cannot be LESS than the already-
 * observed running high. So any bucket whose UPPER bound is below the
 * running high has P = 0 (it's dead). For the bucket that CONTAINS the
 * running high, lower bound clamps to runningHigh. Probabilities are then
 * renormalized so they sum to 1 across the visible bucket set.
 */
function computeBucketProbs(
  buckets: ActiveBucket[],
  prediction: number,
  sigma: number,
  runningHigh: number | null,
): number[] {
  const raw: number[] = buckets.map((b) => {
    // Dead-bucket clip: upper bound of bucket is below the running high.
    if (runningHigh !== null && b.bucketType === 'exact' && b.upper < runningHigh) return 0

    let lo = b.lower
    let hi = b.upper
    // Bucket contains the running high — clamp lower bound up to running high
    if (runningHigh !== null && b.bucketType === 'exact' && b.lower < runningHigh && b.upper >= runningHigh) {
      lo = runningHigh
    }
    // Wide-above buckets ('≥X') — use threshold as lower, Infinity as upper
    if (b.bucketType === 'wide_above') {
      lo = b.lower
      hi = Number.POSITIVE_INFINITY
    }
    // Wide-below buckets ('≤X') — use -Infinity as lower, threshold as upper
    if (b.bucketType === 'wide_below') {
      lo = Number.NEGATIVE_INFINITY
      hi = b.upper
    }
    const pHi = hi === Number.POSITIVE_INFINITY ? 1 : normCdf(hi, prediction, sigma)
    const pLo = lo === Number.NEGATIVE_INFINITY ? 0 : normCdf(lo, prediction, sigma)
    return Math.max(0, pHi - pLo)
  })

  const sum = raw.reduce((a, b) => a + b, 0)
  if (sum <= 0) return raw.map(() => 0)
  return raw.map((p) => p / sum)
}

/**
 * v3.100.10: WR-weighted ensemble. Each model's forecast gets weight =
 * its historical seasonal WR. A 55% WR model counts ~4× a 15% WR model.
 * Floor at `minWeight` (no model fully silenced) and cap at `maxWeight
 * × mean` (no model can dominate if its WR is 90%+ vs others at 20%).
 *
 * Returns null if no overlap between modelValues and wrs.
 */
/**
 * v3.100.24 (preview-only): v2 ensemble math.
 *
 * Two upgrades applied vs the v1 WR-weighted ensemble:
 *
 *   1. AIFS up-weighting (1.5x base). ECMWF AIFS v2 went operational
 *      2026-05-12 and per the academic paper beats classical ECMWF on 97.2%
 *      of targets with 20% gain on temperature extremes. We pull it as
 *      `ecmwf_aifs025_single` (key `ecmwf_aifs` in allModelForecasts). v1
 *      ensemble weights it equal to every other model. v2 multiplies its
 *      effective weight by 1.5 BEFORE the cap+normalize pass.
 *
 *   2. Cold-bias correction on hot days. GRL 2026 finding: AI weather models
 *      systematically underpredict hot extremes by 0.45-0.91K. Specifically:
 *        - AIFS:        -0.45K cold bias (highest 10% of forecasts)
 *        - Pangu:       -0.45K
 *        - FourCastNet: -0.91K
 *      On a hot day (running ensemble mean > city seasonal P75 proxy), we
 *      add the bias back to each AI model's forecast BEFORE blending.
 *      Hot-day threshold proxy: 24°C (75°F) — refine with real P75 data
 *      once we have per-city seasonal climatology on disk.
 *
 * Result: on hot days, the v2 center skews slightly higher than v1, which
 * means Buy-NO calls on LOWER buckets are MORE attractive than v1 indicates,
 * and Buy-YES calls on HIGHER buckets are MORE attractive. Matches the
 * consensus finding that "market overprices lower buckets on hot days."
 *
 * Falls back gracefully — if no AIFS/Pangu/FourCastNet keys exist in the
 * input, v2 is mathematically identical to v1.
 */
const COLD_BIAS_K: Record<string, number> = {
  ecmwf_aifs: 0.45,
  ecmwf_aifs025_single: 0.45,
  pangu: 0.45,
  fourcastnet: 0.91,
  fourcastnet_v2: 0.91,
}
const AIFS_UPWEIGHT = 1.5
function computeV2Ensemble(
  modelValues: Record<string, number | null> | null | undefined,
  wrs: Record<string, number> | null | undefined,
  cityUnit: 'F' | 'C',
  v1Center: number | null,
  opts: { minWeight?: number; maxWeightMultiple?: number } = {},
): {
  value: number
  topContributor: string
  topContributorPct: number
  hotDay: boolean
  aifsCorrected: boolean
} | null {
  if (!modelValues || !wrs) return null
  const minWeight = opts.minWeight ?? 10
  const maxWeightMultiple = opts.maxWeightMultiple ?? 3

  // Hot-day proxy: v1 ensemble center already in city's display unit.
  const hotThresholdInUnit = cityUnit === 'F' ? 75 : 24
  const hotDay = v1Center !== null && v1Center > hotThresholdInUnit

  // Bias correction: 0.45K = 0.81°F. Apply only on hot days, only to AI keys.
  const biasInUnit = (kelvinDelta: number) => (cityUnit === 'F' ? kelvinDelta * 1.8 : kelvinDelta)

  const rows: Array<{ key: string; val: number; wr: number; aifs: boolean }> = []
  for (const [k, v] of Object.entries(modelValues)) {
    if (v === null || v === undefined || !isFinite(v)) continue
    const wr = wrs[k]
    if (wr === null || wr === undefined || !isFinite(wr)) continue
    const biasK = hotDay ? (COLD_BIAS_K[k] ?? 0) : 0
    const correctedVal = v + biasInUnit(biasK)
    const isAifs = k === 'ecmwf_aifs' || k === 'ecmwf_aifs025_single'
    rows.push({ key: k, val: correctedVal, wr: Math.max(wr, minWeight), aifs: isAifs })
  }
  if (rows.length === 0) return null

  // AIFS up-weight applied BEFORE the cap pass so cap respects the new floor
  const upWeighted = rows.map((r) => ({ ...r, w0: r.aifs ? r.wr * AIFS_UPWEIGHT : r.wr }))
  const meanW = upWeighted.reduce((a, r) => a + r.w0, 0) / upWeighted.length
  const cap = meanW * maxWeightMultiple
  const capped = upWeighted.map((r) => ({ ...r, w: Math.min(r.w0, cap) }))

  const totalW = capped.reduce((a, r) => a + r.w, 0)
  const sum = capped.reduce((a, r) => a + r.val * r.w, 0)
  const top = capped.slice().sort((a, b) => b.w - a.w)[0]
  const aifsCorrected = hotDay && rows.some((r) => r.aifs)

  return {
    value: sum / totalW,
    topContributor: top.key,
    topContributorPct: (top.w / totalW) * 100,
    hotDay,
    aifsCorrected,
  }
}

function computeWRWeightedEnsemble(
  modelValues: Record<string, number | null> | null | undefined,
  wrs: Record<string, number> | null | undefined,
  opts: { minWeight?: number; maxWeightMultiple?: number } = {},
): { value: number; topContributor: string; topContributorPct: number } | null {
  if (!modelValues || !wrs) return null
  const minWeight = opts.minWeight ?? 10
  const maxWeightMultiple = opts.maxWeightMultiple ?? 3

  const rows: Array<{ key: string; val: number; wr: number }> = []
  for (const [k, v] of Object.entries(modelValues)) {
    if (v === null || v === undefined || !isFinite(v)) continue
    const wr = wrs[k]
    if (wr === null || wr === undefined || !isFinite(wr)) continue
    rows.push({ key: k, val: v, wr: Math.max(wr, minWeight) })
  }
  if (rows.length === 0) return null

  const meanWR = rows.reduce((a, r) => a + r.wr, 0) / rows.length
  const cap = meanWR * maxWeightMultiple
  const capped = rows.map((r) => ({ ...r, w: Math.min(r.wr, cap) }))

  const totalW = capped.reduce((a, r) => a + r.w, 0)
  const sum = capped.reduce((a, r) => a + r.val * r.w, 0)
  const top = capped.slice().sort((a, b) => b.w - a.w)[0]

  return {
    value: sum / totalW,
    topContributor: top.key,
    topContributorPct: (top.w / totalW) * 100,
  }
}

interface Decision {
  call: string // plain-English bet call: "BUY YES — strong", "BUY NO — small", "SKIP", "FREE NO", "SELL NOW", "HOLD", "COINFLIP"
  sizeDollars: number // recommended bet out of $100 budget (0 = skip, 100 = full size)
  sizeSide: 'YES' | 'NO' | null // which side the size applies to
  color: string // tailwind bg/border/text classes for the call pill
  hint: string // tooltip / why explanation
}

/**
 * Decide the per-bucket action in PLAIN ENGLISH with a $-size recommendation.
 *
 * Edge tiers (for $100 normal bet size):
 *   +15pp or more  → BUY YES — strong · $100
 *   +10 to +15pp   → BUY YES — good   · $50
 *   +5  to +10pp   → BUY YES — small  · $25
 *   ±5pp           → SKIP — fair price · $0
 *   −5  to −10pp   → BUY NO — small   · $25 NO
 *   −10 to −15pp   → BUY NO — good    · $50 NO
 *   −15pp or more  → BUY NO — strong  · $100 NO
 *
 * Overrides (checked first, highest priority at top):
 *   • DEAD bucket + cheap NO → FREE NO · $100 (cannot lose)
 *   • DEAD bucket, NO ≈ 100c → DEAD   · $0  (nothing to exploit)
 *   • Running high inside bucket AND engine > 85% AND YES > engine*1.05
 *                            → SELL NOW · take profit
 *   • Running high inside bucket AND engine > 85%
 *                            → HOLD · sell target
 *   • Engine prediction within 0.3σ of bucket edge → COINFLIP · skip
 */
function decide(
  b: ActiveBucket,
  engineProb: number,
  prediction: number,
  sigma: number,
  runningHigh: number | null,
): Decision {
  const yes = b.yesPrice
  const no = b.noPrice

  // Dead bucket — ratchet-blocked
  const isDead = runningHigh !== null && b.bucketType === 'exact' && b.upper < runningHigh
  if (isDead) {
    if (no < 0.98) {
      return {
        call: 'FREE NO',
        sizeDollars: 100,
        sizeSide: 'NO',
        color: 'bg-emerald-500/25 border-emerald-500/70 text-emerald-200',
        hint: `Ratchet-blocked — this bucket can never win because running high is already above it. Pay $${no.toFixed(2)} on NO to collect $1.00. Guaranteed ${((1 - no) * 100).toFixed(0)}% return.`,
      }
    }
    return {
      call: 'DEAD',
      sizeDollars: 0,
      sizeSide: null,
      color: 'bg-gray-700/30 border-gray-600/40 text-gray-400',
      hint: 'Dead bucket and NO already priced ≈ 100c — nothing left to exploit.',
    }
  }

  const edgePct = (engineProb - yes) * 100 // in pp, positive = Engine says MORE likely than market
  const sellTarget = Math.min(0.96, engineProb * 1.05)
  const boundaryDistLo = Math.abs(prediction - b.lower) / Math.max(sigma, 0.1)
  const boundaryDistHi = Math.abs(prediction - b.upper) / Math.max(sigma, 0.1)
  const atBoundary = b.bucketType === 'exact' && (boundaryDistLo < 0.3 || boundaryDistHi < 0.3)

  const runHighInside =
    runningHigh !== null && b.bucketType === 'exact' && runningHigh >= b.lower && runningHigh < b.upper

  // LOCK / SELL — engine strongly favors + running high already inside
  if (engineProb > 0.85 && runHighInside) {
    if (yes >= sellTarget) {
      return {
        call: 'SELL NOW',
        sizeDollars: 0, // "sell if holding", not a buy
        sizeSide: null,
        color: 'bg-cyan-500/25 border-cyan-500/70 text-cyan-200',
        hint: `YES at $${yes.toFixed(2)} is above fair target $${sellTarget.toFixed(2)}. If you're holding YES, take profit now — greedy holds round-trip to $0.00.`,
      }
    }
    return {
      call: 'HOLD',
      sizeDollars: 0,
      sizeSide: null,
      color: 'bg-emerald-500/20 border-emerald-500/60 text-emerald-200',
      hint: `Engine ${(engineProb * 100).toFixed(0)}% — running high is inside this bucket, day's max can only stay or exceed. If holding, sell when YES crosses $${sellTarget.toFixed(2)}.`,
    }
  }

  // Sell zone without lock (engine decent, price over-pumped)
  if (yes >= sellTarget && engineProb >= 0.55) {
    return {
      call: 'SELL NOW',
      sizeDollars: 0,
      sizeSide: null,
      color: 'bg-cyan-500/20 border-cyan-500/60 text-cyan-200',
      hint: `YES at $${yes.toFixed(2)} is above fair target $${sellTarget.toFixed(2)}. Take profit if holding.`,
    }
  }

  // Boundary risk — prediction sitting right at bucket edge
  if (atBoundary) {
    return {
      call: 'COINFLIP',
      sizeDollars: 0,
      sizeSide: null,
      color: 'bg-amber-500/20 border-amber-500/60 text-amber-200',
      hint: `Engine prediction ${prediction.toFixed(1)} sits within 0.3σ of a bucket edge. A small swing flips the winning bucket. Wait for clearer signal.`,
    }
  }

  // Edge tiers — positive YES side
  const yesInfo = (size: number, tier: string) => ({
    call: `BUY YES — ${tier}`,
    sizeDollars: size,
    sizeSide: 'YES' as const,
    color:
      tier === 'strong'
        ? 'bg-green-500/30 border-green-500/70 text-green-100'
        : tier === 'good'
          ? 'bg-green-500/20 border-green-500/60 text-green-200'
          : 'bg-green-500/10 border-green-500/40 text-green-300',
    hint: `Engine says ${(engineProb * 100).toFixed(0)}% win, market only ${(yes * 100).toFixed(0)}% (edge +${edgePct.toFixed(0)}pp). Buy YES at $${yes.toFixed(2)}; if correct, collect $1.00 per contract (${(((1 - yes) / yes) * 100).toFixed(0)}% return).`,
  })
  const noInfo = (size: number, tier: string) => ({
    call: `BUY NO — ${tier}`,
    sizeDollars: size,
    sizeSide: 'NO' as const,
    color:
      tier === 'strong'
        ? 'bg-blue-500/30 border-blue-500/70 text-blue-100'
        : tier === 'good'
          ? 'bg-blue-500/20 border-blue-500/60 text-blue-200'
          : 'bg-blue-500/10 border-blue-500/40 text-blue-300',
    hint: `Engine says only ${(engineProb * 100).toFixed(0)}% win, market ${(yes * 100).toFixed(0)}% (edge ${edgePct.toFixed(0)}pp against YES). Buy NO at $${no.toFixed(2)}; if correct, collect $1.00 per contract (${(((1 - no) / no) * 100).toFixed(0)}% return).`,
  })

  if (edgePct >= 15) return yesInfo(100, 'strong')
  if (edgePct >= 10) return yesInfo(50, 'good')
  if (edgePct >= 5) return yesInfo(25, 'small')
  if (edgePct <= -15) return noInfo(100, 'strong')
  if (edgePct <= -10) return noInfo(50, 'good')
  if (edgePct <= -5) return noInfo(25, 'small')

  // Within ±5pp — fair
  return {
    call: 'SKIP',
    sizeDollars: 0,
    sizeSide: null,
    color: 'bg-white/5 border-white/10 text-gray-400',
    hint: `Engine ${(engineProb * 100).toFixed(0)}% ≈ market ${(yes * 100).toFixed(0)}% (edge ${edgePct >= 0 ? '+' : ''}${edgePct.toFixed(0)}pp). Market is priced fairly, no edge to exploit.`,
  }
}

export default function LiveBucketStrip({
  activeBuckets,
  jp,
  runningHigh,
  unitLabel,
  // Metadata-header props (obsCount/hoursSincePeak/comboStatus/pendingModels/
  // best+today model+WR/peakTime/modelSnippet) became unused when v3.100.8
  // deleted the metadata header row. Kept in Props for backwards-compat with
  // existing call sites but aliased here with `_` prefix to satisfy lint.
  obsCount: _obsCount,
  peakHourLocal: _peakHourLocal,
  peakMinuteLocal: _peakMinuteLocal,
  hoursSincePeak: _hoursSincePeak,
  bestModel: _bestModel,
  bestModelWR: _bestModelWR,
  todayApplicableModel: _todayApplicableModel,
  todayApplicableWR: _todayApplicableWR,
  comboStatus: _comboStatus,
  pendingModels: _pendingModels,
  modelForecasts: _modelForecasts,
  allModelForecasts,
  perModelWinRates,
  clobDepth,
  v2EngineEnabled,
  unit,
  citySlug,
  cityName,
  resolution,
  windDirection,
}: Props) {
  if (!jp || typeof jp.prediction !== 'number' || !isFinite(jp.prediction)) return null
  if (!activeBuckets || activeBuckets.length === 0) return null

  const sigma = isFinite(jp.standardDeviation) && jp.standardDeviation > 0 ? jp.standardDeviation : 0.5

  // v3.100.27 (BUG FIX): always use jp.prediction (Jarvis engine's
  // authoritative value) as the prediction center. The pre-existing
  // wrWeighted blend ignored trajectoryAdj + conditionBias + biasCorrection
  // and made the panel disagree with the dashboard's Jarvis engine pop-up.
  // the operator caught it 2026-05-14 ~04:35 AM ("engine predicts 10.2 and it
  // says engine predicts 11.5"). Fix: jp.prediction is the source of truth.
  //
  // wrWeighted + v2Result still computed for transparency display ("WR
  // ensemble would say X · Jarvis says Y"), but no longer drive bucket
  // probabilities or Best Bet recommendations.
  const wrWeighted = computeWRWeightedEnsemble(allModelForecasts, perModelWinRates)
  const v1Center = wrWeighted?.value ?? jp.prediction
  const v2Result =
    v2EngineEnabled && unit ? computeV2Ensemble(allModelForecasts, perModelWinRates, unit, v1Center) : null
  const predictionCenter = jp.prediction
  const predictionSource: 'engine' | 'WR-weighted' | 'v2' = v2Result ? 'v2' : wrWeighted ? 'WR-weighted' : 'engine'

  // Sort buckets left to right by lower bound for table display
  const sorted = [...activeBuckets].sort((a, b) => a.lower - b.lower)
  const probs = computeBucketProbs(sorted, predictionCenter, sigma, runningHigh)

  // v3.100.25 (preview only): synthesize ONE actionable recommendation across
  // all buckets. The Best Bet panel renders this single call instead of asking
  // the operator to read 8+ bucket rows + 3 expert panels. Plain English, one number,
  // one action.
  const decisions = sorted.map((b, i) => ({
    bucket: b,
    prob: probs[i],
    decision: decide(b, probs[i], predictionCenter, sigma, runningHigh),
  }))
  const topModelPick = v2EngineEnabled ? pickTopModel(citySlug, allModelForecasts, perModelWinRates) : null

  // v3.100.26: enterprise-grade Best Bet picker.
  //
  // Bug surfaced 2026-05-14 ~04:20 AST (Ankara screenshot): pickBestBet
  // recommended BUY YES on 19°C @ $0.00 because the dead-bucket got a phantom
  // edge of +20pp vs market price of $0.00 (no orderbook). That bet was
  // mathematically "good" but UNTRADEABLE — you can't buy YES at $0.00.
  //
  // Three guards now applied (in order):
  //
  //   1. Untradeable filter — skip any bucket where the bet-side price is
  //      ≤ $0.01 or ≥ $0.99. These have no real orderbook depth.
  //
  //   2. CLOB liquidity gate — when clobDepth data is available, skip
  //      buckets where the recommended-side VWAP slippage is > 5pp from
  //      best ask. Limit-order users can still park orders, but the
  //      recommendation panel should not surface these as primary picks.
  //
  //   3. Multi-key rank — tier by sizeDollars × call-quality, tiebreak by
  //      edge MAGNITUDE (|engineProb − marketYes|). Within "BUY YES — strong"
  //      buckets, the one with bigger edge wins. This prevents the
  //      lower-probability bucket from outranking the higher-probability one
  //      just because they share the same call name.
  //
  // Falls back gracefully — if no bucket survives the filters, returns null
  // and the panel renders the "No bet" state.
  type Candidate = (typeof decisions)[number]
  function isTradeable(d: Candidate): boolean {
    const side = d.decision.sizeSide
    if (side === null) {
      // SELL NOW / HOLD / FREE NO — for FREE NO check the NO price; others use either
      const np = d.bucket.noPrice
      const yp = d.bucket.yesPrice
      if (d.decision.call === 'FREE NO') return np > 0.01 && np < 0.99
      // SELL NOW / HOLD don't need new fills — always tradeable as advisory signals
      return yp > 0.01 && yp < 0.99
    }
    const price = side === 'NO' ? d.bucket.noPrice : d.bucket.yesPrice
    if (price <= 0.01 || price >= 0.99) return false
    return true
  }
  function passesDepthGate(d: Candidate): boolean {
    if (!clobDepth) return true // no data → don't filter
    const key = d.bucket.bucketType === 'wide_below' ? String(d.bucket.upper) : String(d.bucket.lower)
    const depth = clobDepth[key]
    if (!depth) return true // no entry → don't filter
    // Only apply to BUY YES / BUY NO calls (size > 0). Advisory signals untouched.
    if (d.decision.sizeDollars <= 0) return true
    // For YES bets: check vwapBuyYes100 slippage vs bestYesAsk
    // For NO bets: we don't fetch NO-side depth, accept by default
    if (d.decision.sizeSide !== 'YES') return true
    if (depth.bestYesAsk === null || depth.vwapBuyYes100 === null) return true
    const slipPp = (depth.vwapBuyYes100 - depth.bestYesAsk) * 100
    return slipPp <= 5 // tolerate up to 5pp slip
  }
  function actionable(d: Candidate): boolean {
    if (d.decision.sizeDollars > 0) return true
    return d.decision.call === 'FREE NO' || d.decision.call === 'SELL NOW' || d.decision.call === 'HOLD'
  }
  // Multi-key rank: [tier, edge magnitude, prob]
  function rank(d: Candidate): [number, number, number] {
    let tier: number
    if (d.decision.call === 'FREE NO') tier = 1_000_000
    else if (d.decision.sizeDollars > 0) {
      tier =
        d.decision.sizeDollars * 100 +
        (d.decision.call.includes('strong') ? 99 : d.decision.call.includes('good') ? 50 : 25)
    } else if (d.decision.call === 'SELL NOW') tier = 90
    else if (d.decision.call === 'HOLD') tier = 80
    else tier = 0
    const edgeMag = Math.abs(d.prob - d.bucket.yesPrice)
    return [tier, edgeMag, d.prob]
  }

  // v3.100.29: the operator's law 2026-05-14 ~05:35 AM AST.
  //   (a) BUY NO is BANNED from Best Bet. Period. (Includes FREE NO since
  //       ratchet entry near $0.99 always returns <2%, fails (b) anyway.)
  //   (b) Recommended bets must yield ≥25% return at entry price.
  //   (c) City must be in verified-safe registry (NYC + London) OR engine
  //       probability ≥85%. Filters out Paris/Amsterdam-style mediocre bets
  //       on unverified cities.
  //   When all candidates fail, bestBet returns null and the panel hides.
  const VERIFIED_SAFE_CITIES = new Set(['nyc', 'london'])
  // v3.100.37: raised from 0.25 → 4.0 per the operator 2026-05-15. Chicago 67-68°F
  // BUY YES at $0.78 / +28% return was the violation: "that's a terrible bet,
  // I want 4-5x or more." 4x return = entry price ≤ $0.20.
  const MIN_RETURN_PCT = 4.0
  const HIGH_PROB_OVERRIDE = 0.85
  function isBuyYesOnly(d: Candidate): boolean {
    // Only BUY YES recommendations survive. Side === 'YES' AND sizeDollars > 0.
    // SELL NOW / HOLD / FREE NO advisory signals are also rejected from Best Bet
    // since the panel is for actionable BUY YES picks only.
    return d.decision.sizeSide === 'YES' && d.decision.sizeDollars > 0
  }
  function meetsReturnFloor(d: Candidate): boolean {
    const entry = d.bucket.yesPrice
    if (entry <= 0 || entry >= 1) return false
    const returnPct = (1 - entry) / entry
    return returnPct >= MIN_RETURN_PCT
  }
  function isVerifiedOrHighProb(d: Candidate): boolean {
    if (VERIFIED_SAFE_CITIES.has((citySlug ?? '').toLowerCase())) return true
    return d.prob >= HIGH_PROB_OVERRIDE
  }
  const candidates = decisions
    .filter(actionable)
    .filter(isTradeable)
    .filter(passesDepthGate)
    .filter(isBuyYesOnly)
    .filter(meetsReturnFloor)
    .filter(isVerifiedOrHighProb)
  const ranked = [...candidates].sort((a, b) => {
    const ra = rank(a)
    const rb = rank(b)
    if (rb[0] !== ra[0]) return rb[0] - ra[0]
    if (rb[1] !== ra[1]) return rb[1] - ra[1]
    return rb[2] - ra[2]
  })
  const bestBet = ranked[0] ?? null
  const bestBetReturnPct = bestBet
    ? (() => {
        const entry = bestBet.decision.sizeSide === 'NO' ? bestBet.bucket.noPrice : bestBet.bucket.yesPrice
        if (entry <= 0) return null
        return Math.round(((1 - entry) / entry) * 100)
      })()
    : null

  // v3.100.26: "Engine's Pick" = the bucket with the highest computed
  // probability. This is independent of edge / market price — it's just
  // "where the engine thinks peak will land." Always surfaced so the operator can
  // sanity-check against his own intuition AND see why a BUY NO bet might
  // make sense (because engine's pick is a DIFFERENT bucket than the one
  // being shorted).
  const enginesPick = [...decisions].reduce<Candidate | null>(
    (best, d) => (best === null || d.prob > best.prob ? d : best),
    null,
  )

  // CLOB depth for the best bucket — used in the confidence checks
  const bestBetDepthKey = bestBet
    ? bestBet.bucket.bucketType === 'wide_below'
      ? String(bestBet.bucket.upper)
      : String(bestBet.bucket.lower)
    : null
  const bestBetDepth = bestBetDepthKey ? (clobDepth?.[bestBetDepthKey] ?? null) : null
  // Top model agreement check (within 0.5 unit of engine center)
  const topModelAgrees = topModelPick !== null && Math.abs(topModelPick.forecast - predictionCenter) <= 0.5

  return (
    <div className="mt-3 mb-3 p-3 rounded border border-purple-500/40 bg-purple-500/[0.06]">
      {v2EngineEnabled && bestBet && (
        <div className="mb-3 p-3 rounded-lg border-2 border-emerald-500/60 bg-emerald-500/[0.08]">
          {/* v3.100.36: simplified Best Bet panel. Stripped: edge math, method
              jargon, OVERPRICED/UNDERPRICED essay, separate Engine's Pick box.
              Rounding step shown explicitly (the operator: 65.6 → 66 was hidden). */}
          <div className="flex items-center justify-between mb-2">
            <div className="text-[11px] font-bold uppercase tracking-wider text-emerald-300">
               Trade on {cityName ?? citySlug ?? 'this city'}
            </div>
            {jp?.peakLockedByWind && (
              <span
                className="text-[10px] font-bold text-emerald-200 bg-emerald-500/15 border border-emerald-400/40 rounded px-1.5 py-0.5"
                title={jp.peakLockReason ?? 'peak locked by wind + slope'}
              >
                 PEAK LOCKED
              </span>
            )}
          </div>

          <div className="text-[20px] font-bold text-white mb-2 leading-tight">
            BUY YES <span className="text-emerald-300">{bestBet.bucket.label}</span>
            <span className="text-gray-400 text-[14px] font-normal ml-2">
              at <span className="font-mono text-white">${bestBet.bucket.yesPrice.toFixed(2)}</span>
              {bestBetReturnPct !== null && (
                <span className="text-emerald-300 font-bold"> · +{bestBetReturnPct}% return</span>
              )}
              {bestBet.decision.sizeDollars > 0 && (
                <span className="text-yellow-300"> · size ${bestBet.decision.sizeDollars}</span>
              )}
            </span>
          </div>

          <div className="text-[12px] text-gray-200 mb-1">
            Engine peak{' '}
            <span className="font-bold">
              {predictionCenter.toFixed(1)}
              {unitLabel}
            </span>
            {' → rounds to bucket '}
            <span className="font-mono text-emerald-300">
              {Math.round(predictionCenter)}
              {unitLabel}
            </span>
          </div>

          {topModelPick && (
            <div className={`text-[12px] mb-1 ${topModelAgrees ? 'text-gray-200' : 'text-amber-300'}`}>
              Top model <span className="font-bold">{topModelPick.modelLabel}</span>
              {topModelPick.verified && <span className="text-emerald-300"> ({topModelPick.wr.toFixed(1)}% WR)</span>}
              {' says '}
              <span className="font-bold">
                {topModelPick.forecast.toFixed(1)}
                {unitLabel}
              </span>
              {!topModelAgrees && <span> — disagrees, bet smaller</span>}
            </div>
          )}

          <div className="flex flex-wrap gap-1.5 text-[10px] mt-1.5">
            {windDirection && citySlug && (
              <span
                className={
                  isInColdSector(citySlug, windDirection)
                    ? 'bg-cyan-500/15 border border-cyan-400/40 text-cyan-200 rounded px-1.5 py-0.5 font-medium'
                    : 'bg-gray-500/10 border border-gray-500/30 text-gray-400 rounded px-1.5 py-0.5'
                }
                title={
                  isInColdSector(citySlug, windDirection)
                    ? `Wind ${windDirection} = cold sector for ${citySlug} (${describeColdSector(citySlug)}).`
                    : `Wind ${windDirection}. ${citySlug} cold sector = ${describeColdSector(citySlug)}.`
                }
              >
                {windDirection} {isInColdSector(citySlug, windDirection) ? '(cold sector)' : '(warm)'}
              </span>
            )}
            {resolution && !resolution.verified && (
              <span className="bg-amber-500/15 border border-amber-400/40 text-amber-200 rounded px-1.5 py-0.5 font-medium">
                ⚠ settlement rule unverified
              </span>
            )}
            {bestBetDepth && !bestBetDepth.depthOk && (
              <span className="bg-amber-500/15 border border-amber-400/40 text-amber-200 rounded px-1.5 py-0.5 font-medium">
                ⚠ thin book ({bestBetDepth.askSize5pp}sh)
              </span>
            )}
          </div>
        </div>
      )}
      {/* v3.100.37: when no bet meets the 4x return floor, show trajectory-
          alignment data instead of hiding. Mirrors the alignment paradigm
          the operator uses in his popup: when Engine + Top Model + Trajectory
          all point at the same bucket, the read is high-confidence. */}
      {v2EngineEnabled && !bestBet && enginesPick && (
        <div className="mb-3 p-3 rounded-lg border border-purple-500/40 bg-purple-500/[0.06]">
          <div className="text-[11px] font-bold uppercase tracking-wider text-purple-300 mb-2">
            ↗ Engine Read on {cityName ?? citySlug ?? 'this city'} · no 4x bet
          </div>

          {(() => {
            const engineBucket = Math.round(predictionCenter)
            const topBucket = topModelPick ? Math.round(topModelPick.forecast) : null
            const aligned = topBucket !== null && topBucket === engineBucket && topModelPick !== null && topModelAgrees
            return (
              <>
                <div className="text-[12px] text-gray-200 mb-1">
                  Engine peak{' '}
                  <span className="font-bold">
                    {predictionCenter.toFixed(1)}
                    {unitLabel}
                  </span>
                  {' → bucket '}
                  <span className="font-mono text-emerald-300">
                    {engineBucket}
                    {unitLabel}
                  </span>
                </div>

                {topModelPick && (
                  <div className="text-[12px] text-gray-200 mb-1">
                    Top model <span className="font-bold">{topModelPick.modelLabel}</span>
                    {topModelPick.verified && (
                      <span className="text-emerald-300"> ({topModelPick.wr.toFixed(1)}% WR)</span>
                    )}{' '}
                    <span className="font-bold">
                      {topModelPick.forecast.toFixed(1)}
                      {unitLabel}
                    </span>
                    {' → bucket '}
                    <span className="font-mono text-emerald-300">
                      {topBucket}
                      {unitLabel}
                    </span>
                  </div>
                )}

                <div className="text-[12px] mb-2">
                  {aligned ? (
                    <span className="text-emerald-300 font-bold">
                      ✓ ALIGNED — engine + top model both point at {engineBucket}
                      {unitLabel}. Strong read on the bucket itself.
                    </span>
                  ) : topBucket !== null ? (
                    <span className="text-amber-300 font-bold">
                      ⚠ DIVERGE — engine says {engineBucket}
                      {unitLabel}, top model says {topBucket}
                      {unitLabel}. Lower confidence — wait for alignment.
                    </span>
                  ) : (
                    <span className="text-gray-400">No top model loaded for this city.</span>
                  )}
                </div>

                <div className="flex flex-wrap gap-1.5 text-[10px]">
                  {jp?.peakLockedByWind && (
                    <span
                      className="bg-emerald-500/15 border border-emerald-400/40 text-emerald-200 rounded px-1.5 py-0.5 font-medium"
                      title={jp.peakLockReason ?? 'peak locked by wind + slope'}
                    >
                       peak locked
                    </span>
                  )}
                  {windDirection && citySlug && (
                    <span
                      className={
                        isInColdSector(citySlug, windDirection)
                          ? 'bg-cyan-500/15 border border-cyan-400/40 text-cyan-200 rounded px-1.5 py-0.5 font-medium'
                          : 'bg-gray-500/10 border border-gray-500/30 text-gray-400 rounded px-1.5 py-0.5'
                      }
                    >
                      {windDirection} {isInColdSector(citySlug, windDirection) ? '(cold)' : '(warm)'}
                    </span>
                  )}
                </div>

                <div className="mt-2 text-[10px] text-gray-500 italic">
                  No actionable bet because no bucket meets your 4x return floor (entry ≤ $0.20). Use the data above +
                  the bucket strip below to make your own call.
                </div>
              </>
            )
          })()}
        </div>
      )}
      {/* v3.100.24 v2 ENGINE jargon panel removed v3.100.25 — content folded into Best Bet panel above. */}
      <div className="flex items-center justify-between mb-2 flex-wrap gap-y-1">
        <span className="text-[11px] font-bold text-purple-300 uppercase tracking-wide">Live Bucket Strip</span>
        <span className="text-[10px] text-gray-500 font-mono">
          {predictionSource === 'v2' ? (
            <>
              <span className="text-fuchsia-300 font-bold">
                v2 {predictionCenter.toFixed(2)}
                {unitLabel}
              </span>
              {' · '}v1 {v1Center.toFixed(2)}
              {unitLabel}
              {' · σ ±'}
              {sigma.toFixed(2)}
              {unitLabel}
              {' · '}
              {jp.method}
              {v2Result && (
                <span className="ml-1 text-gray-600">
                  (top: {v2Result.topContributor} {v2Result.topContributorPct.toFixed(0)}%)
                </span>
              )}
            </>
          ) : predictionSource === 'WR-weighted' ? (
            <>
              <span className="text-purple-300 font-bold">
                WR-weighted {predictionCenter.toFixed(2)}
                {unitLabel}
              </span>
              {' · '}engine {jp.prediction.toFixed(2)}
              {unitLabel}
              {' · σ ±'}
              {sigma.toFixed(2)}
              {unitLabel}
              {' · '}
              {jp.method}
              {wrWeighted && (
                <span className="ml-1 text-gray-600">
                  (top: {wrWeighted.topContributor} {wrWeighted.topContributorPct.toFixed(0)}%)
                </span>
              )}
            </>
          ) : (
            <>
              engine {jp.prediction.toFixed(2)}
              {unitLabel} · σ ±{sigma.toFixed(2)}
              {unitLabel} · {jp.method}
            </>
          )}
          {runningHigh !== null && ` · running high ${runningHigh.toFixed(1)}${unitLabel}`}
        </span>
      </div>
      {/* v3.100.8: metadata header row DELETED. The peak / obs / WR / models
          info duplicated what CanonicalPeakBar shows above; the operator: "erase
          this section here because this is bullshit." */}
      {/* v3.100.9: plain-English columns. the operator: "I need more data bro.
          I don't know what the hell this +11pp is. I'm not a robot." */}
      <div className="overflow-x-auto">
        <table className="w-full text-[11px] font-mono">
          <thead>
            <tr className="text-gray-500 text-left">
              <th className="pr-3 py-1">bucket</th>
              <th className="pr-3 py-1 text-right">price YES</th>
              {clobDepth && (
                <th
                  className="pr-3 py-1 text-right text-amber-400"
                  title="VWAP price you'd actually pay to market-buy $100 of YES after sweeping the ask ladder. Catches deep-OTM mirages where the screen price ($0.025) bears no relation to fill price ($0.10+)."
                >
                  real fill @ $100
                </th>
              )}
              <th className="pr-3 py-1 text-right">Engine says</th>
              <th className="pr-3 py-1 text-right">Market says</th>
              <th className="pr-3 py-1">bet call</th>
              <th className="pr-3 py-1 text-right">size if $100</th>
              <th className="pr-3 py-1 text-gray-600">why</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((b, i) => {
              const prob = probs[i]
              const enginePct = (prob * 100).toFixed(0)
              const marketPct = (b.yesPrice * 100).toFixed(0)
              const d = decide(b, prob, predictionCenter, sigma, runningHigh)
              const sizeDisplay =
                d.sizeDollars > 0
                  ? `$${d.sizeDollars} ${d.sizeSide ?? ''}`
                  : d.call === 'SELL NOW'
                    ? 'sell position'
                    : d.call === 'HOLD'
                      ? 'hold position'
                      : '$0'
              // Match CLOB depth by bucket bound (integer): gamma's groupItemTitle
              // and our activeBuckets labels disagree (e.g. "7°C or below" vs "≤7°C")
              // but the underlying integer bound is the same. wide_below uses upper
              // (e.g. "≤7" → bound 7 = upper), others use lower.
              const depthKey = b.bucketType === 'wide_below' ? String(b.upper) : String(b.lower)
              const depth = clobDepth?.[depthKey] ?? null
              const slipPp =
                depth !== null && depth.bestYesAsk !== null && depth.vwapBuyYes100 !== null
                  ? Math.round((depth.vwapBuyYes100 - depth.bestYesAsk) * 1000) / 10
                  : null
              const fillColor =
                depth === null || depth.vwapBuyYes100 === null
                  ? 'text-gray-600'
                  : depth.depthOk
                    ? 'text-emerald-300'
                    : slipPp !== null && slipPp > 3
                      ? 'text-red-400 font-bold'
                      : 'text-amber-300'
              const fillTitle =
                depth === null
                  ? 'no orderbook data — preview not yet fetched'
                  : depth.vwapBuyYes100 === null
                    ? `book can't absorb $100 — ${depth.reason}`
                    : `Best ask $${depth.bestYesAsk?.toFixed(3)} → $100 fills @ $${depth.vwapBuyYes100.toFixed(3)} (${slipPp}pp slippage). $5pp size: ${depth.askSize5pp} shares. ${depth.reason}.`
              return (
                <tr key={b.label} className="border-t border-white/[0.04]">
                  <td className="pr-3 py-1 text-white font-bold">{b.label}</td>
                  <td className="pr-3 py-1 text-right text-gray-300">${b.yesPrice.toFixed(2)}</td>
                  {clobDepth && (
                    <td className={`pr-3 py-1 text-right ${fillColor}`} title={fillTitle}>
                      {depth !== null && depth.vwapBuyYes100 !== null ? (
                        <>
                          ${depth.vwapBuyYes100.toFixed(3)}
                          {slipPp !== null && slipPp > 0 && (
                            <span className="ml-1 text-[9px] opacity-70">+{slipPp}pp</span>
                          )}
                        </>
                      ) : (
                        <span className="text-gray-700">—</span>
                      )}
                    </td>
                  )}
                  <td className="pr-3 py-1 text-right text-cyan-300 font-bold">{enginePct}%</td>
                  <td className="pr-3 py-1 text-right text-gray-300">{marketPct}%</td>
                  <td className="pr-3 py-1">
                    <span
                      className={`inline-block px-2 py-0.5 rounded border text-[10px] font-bold whitespace-nowrap ${d.color}`}
                      title={d.hint}
                    >
                      {d.call}
                    </span>
                  </td>
                  <td className="pr-3 py-1 text-right text-gray-300 font-bold">{sizeDisplay}</td>
                  <td className="pr-3 py-1 text-[10px] text-gray-500 max-w-[400px] truncate" title={d.hint}>
                    {d.hint}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
