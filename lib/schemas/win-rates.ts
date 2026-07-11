/**
 * Zod schema for `data/weather/polymarket_asos_ground_truth_v1.json`.
 *
 * Phase 02.9 (v3.57.0) — structural fix for the dashboard win rate corruption
 * documented in `data/weather/KMA-FORENSIC-VERDICT.md`.
 *
 * Why this file exists
 * --------------------
 * Before Phase 02.9, `app/api/brain/trading/route.ts` carried hand-edited
 * `BEST_MODELS` / `ACTUAL_BUCKET_WIN_RATES` / `BEST_FORECAST_MODEL` constants
 * that drifted from the underlying win-rate file every time someone touched
 * them. The forensic audit found 11 cities oversold on KMA (Ankara: dashboard
 * 23.3% / real 0.0%) and London oversold on both KMA and ECMWF.
 *
 * The structural fix (per GPT-5.4 superior review 2026-04-07 14:36 AST):
 * eliminate hand-typed constants entirely. `route.ts` now imports the
 * verified ground truth JSON, schema-parses it at module load, and derives
 * its lookup tables from the result. This file is the schema.
 *
 * Contracts enforced here
 * -----------------------
 *  1. The 12 model keys are exactly: bom, cma, ecmwf, gem, gfs, graphcast,
 *     icon, jma, kma, knmi, mf, ukmo. No more, no fewer, no aliases.
 *  2. Every (city, model) cell has integer `{hits, attempts}` for all three
 *     methodologies (`pm_bucket`, `asos_exact`, `asos_within1`). The `rate`
 *     field is informational and recomputed at module load — it must be
 *     within 0.01 of `100 * hits / attempts` if both are non-null.
 *  3. `_lineage` is required and includes `generated_at`, `forecast_source`,
 *     `forecast_chunks`, `pm_cities`, and `asos_cities`.
 *  4. Hong Kong is EXPECTED to be missing from `per_city_model` because it
 *     resolves from HKO Observatory, not ASOS. The schema does NOT require
 *     all 41 dashboard cities — that join is enforced by `lib/weather-cities.ts`
 *     via `dataQualityStatus: 'unverified'` for hong-kong.
 *
 * Deterministic ranking (Rule 2 from GPT-5.4 review)
 * --------------------------------------------------
 * `pickBestModel()` and `rankModels()` apply a stable, deterministic order:
 * higher rate first, then more attempts (more data wins ties), then model
 * name ascending. This makes snapshots reproducible regardless of input
 * insertion order.
 *
 * Sample-size threshold (Rule 3 from GPT-5.4 review)
 * --------------------------------------------------
 * `MIN_ATTEMPTS_FOR_TRUST = 100`. A cell with fewer attempts is marked
 * `isInsufficient: true` and excluded from `pickBestModel()`. This prevents
 * `1/1 = 100%` garbage from beating `200/731 = 27.4%`.
 *
 * Per-city KMA gate (Rule 7 from the handoff prompt)
 * --------------------------------------------------
 * `shouldZeroKmaWeight(city)` returns `true` only when `kma.asos_exact` has
 * < 100 attempts OR a < 5% rate. This is the Ankara-style "model literally
 * never wins" gate. It is NOT a global KMA disable.
 */

import { z } from 'zod'

// ─── Constants ─────────────────────────────────────────────────────────────

/**
 * The 28 model keys present in the verified ground truth file.
 * Authoritative source: `scripts/polymarket_asos_backtest.py` MODELS_SHORT + MODELS_LONG.
 * If you need to add a model, update both the script AND this enum, then
 * regenerate the JSON.
 *
 * v3.83.1: Expanded from 12 → 28 to include 7 new globals + 9 regionals
 * from v3.79.1 backfill. Regional keys are optional per city (not every city
 * has coverage for every regional model).
 */
export const GROUND_TRUTH_MODEL_KEYS = [
  'bom',
  'cma',
  'ecmwf',
  'gem',
  'gfs',
  'graphcast',
  'icon',
  'jma',
  'kma',
  'knmi',
  'mf',
  'ukmo',
  // v3.83.1: 7 new global models
  'ecmwf_aifs',
  'gfs_hrrr',
  'gem_hrdps',
  'metno',
  'dmi',
  'arpege_world',
  'jma_gsm',
  // v3.83.1: 9 regional high-res models (optional per city)
  'arome_fr',
  'arome_hd',
  'arpege_eu',
  'ukmo_2km',
  'icon_d2',
  'icon_eu',
  'harmonie_nl',
  'harmonie_eu',
  'metno_nordic',
] as const

export type GroundTruthModelKey = (typeof GROUND_TRUTH_MODEL_KEYS)[number]

/**
 * Mapping from ground-truth short keys → uppercase display labels used by
 * `BEST_MODELS.singleModel` in route.ts. Stable since Phase 02.7 PLAN-05.
 *
 * `mf` → `MF` (NOT `METEOFRANCE`) and `graphcast` → `GraphCast` (mixed case)
 * are deliberate — they match the existing route.ts expectations and the
 * regression anchors in `__tests__/unit/trading-constants-drift.test.ts`.
 */
export const MODEL_KEY_TO_DISPLAY: Record<GroundTruthModelKey, string> = {
  bom: 'BOM',
  cma: 'CMA',
  ecmwf: 'ECMWF',
  gem: 'GEM',
  gfs: 'GFS',
  graphcast: 'GCAST',
  icon: 'ICON',
  jma: 'JMA',
  kma: 'KMA',
  knmi: 'KNMI',
  mf: 'MF',
  ukmo: 'UKMO',
  ecmwf_aifs: 'AIFS',
  gfs_hrrr: 'HRRR',
  gem_hrdps: 'HRDPS',
  metno: 'METNO',
  dmi: 'DMI',
  arpege_world: 'ARPW',
  jma_gsm: 'JGSM',
  arome_fr: 'AROME',
  arome_hd: 'AMHD',
  arpege_eu: 'ARPE',
  ukmo_2km: 'UK2k',
  icon_d2: 'ICD2',
  icon_eu: 'ICEU',
  harmonie_nl: 'HRNL',
  harmonie_eu: 'HREU',
  metno_nordic: 'NORD',
}

/**
 * Minimum sample size before a (city, model) cell counts toward
 * `singleModel` selection. Below this threshold the cell is flagged
 * `isInsufficient: true` and excluded from `pickBestModel()`.
 *
 * Phase 02.7 PLAN-05 already used 500 days for fair-sample top-1 selection;
 * 100 attempts is the WEAKER floor for "this number means anything at all"
 * vs the STRONGER 500-day floor for "we trust this enough to size against".
 * Both gates are layered: the 500-day rule is checked separately when
 * picking `singleModel`, the 100-attempt rule is the schema-level minimum.
 */
export const MIN_ATTEMPTS_FOR_TRUST = 100

/**
 * Per-city KMA "model literally never wins" gate (Rule 7 / Ankara case).
 * If KMA's `asos_exact.rate < KMA_DEAD_RATE_PCT` AND attempts >= MIN_ATTEMPTS,
 * the trading code zeros KMA's contribution for that city.
 */
export const KMA_DEAD_RATE_PCT = 5.0

// ─── Cell-level schemas ───────────────────────────────────────────────────

/**
 * One methodology cell: integer hits + attempts, plus an informational
 * pre-rounded rate (recomputed at module load). `attempts` must be a
 * non-negative integer. `hits` must be in [0, attempts].
 *
 * `rate` may be null when attempts == 0 (the script writes null in that
 * case). When non-null it must round-trip within 0.01 percentage points of
 * `100 * hits / attempts` — this catches manual edits that changed `hits`
 * without re-running the script.
 */
const cellSchema = z
  .object({
    hits: z.number().int().nonnegative(),
    attempts: z.number().int().nonnegative(),
    rate: z.number().nullable(),
  })
  .superRefine((cell, ctx) => {
    if (cell.hits > cell.attempts) {
      ctx.addIssue({
        code: 'custom',
        message: `cell.hits (${cell.hits}) > cell.attempts (${cell.attempts}) — impossible`,
      })
      return
    }
    if (cell.attempts === 0) {
      // rate may be null or 0 — both are acceptable for empty cells
      if (cell.rate !== null && cell.rate !== 0) {
        ctx.addIssue({
          code: 'custom',
          message: `cell.attempts == 0 but rate=${cell.rate} (expected null or 0)`,
        })
      }
      return
    }
    if (cell.rate === null) return // null rate on non-empty cell is allowed (script can choose to omit)
    const computed = (100 * cell.hits) / cell.attempts
    if (Math.abs(computed - cell.rate) > 0.01) {
      ctx.addIssue({
        code: 'custom',
        message: `cell.rate=${cell.rate} disagrees with computed ${computed.toFixed(4)} for ${cell.hits}/${cell.attempts} (Δ > 0.01) — re-run scripts/polymarket_asos_backtest.py to regenerate`,
      })
    }
  })

export type GroundTruthCell = z.infer<typeof cellSchema>

const modelEntrySchema = z.object({
  pm_bucket: cellSchema,
  asos_exact: cellSchema,
  asos_within1: cellSchema,
})

export type GroundTruthModelEntry = z.infer<typeof modelEntrySchema>

/**
 * Per-city map: 12 original model keys are required. 16 new models
 * (v3.83.1) are optional because regional coverage varies by city.
 * buildVerifiedView() iterates all GROUND_TRUTH_MODEL_KEYS but skips
 * any key that is undefined for a given city.
 */
const cityModelMapSchema = z
  .object({
    bom: modelEntrySchema,
    cma: modelEntrySchema,
    ecmwf: modelEntrySchema,
    gem: modelEntrySchema,
    gfs: modelEntrySchema,
    graphcast: modelEntrySchema,
    icon: modelEntrySchema,
    jma: modelEntrySchema,
    kma: modelEntrySchema,
    knmi: modelEntrySchema,
    mf: modelEntrySchema,
    ukmo: modelEntrySchema,
    ecmwf_aifs: modelEntrySchema.optional(),
    gfs_hrrr: modelEntrySchema.optional(),
    gem_hrdps: modelEntrySchema.optional(),
    metno: modelEntrySchema.optional(),
    dmi: modelEntrySchema.optional(),
    arpege_world: modelEntrySchema.optional(),
    jma_gsm: modelEntrySchema.optional(),
    arome_fr: modelEntrySchema.optional(),
    arome_hd: modelEntrySchema.optional(),
    arpege_eu: modelEntrySchema.optional(),
    ukmo_2km: modelEntrySchema.optional(),
    icon_d2: modelEntrySchema.optional(),
    icon_eu: modelEntrySchema.optional(),
    harmonie_nl: modelEntrySchema.optional(),
    harmonie_eu: modelEntrySchema.optional(),
    metno_nordic: modelEntrySchema.optional(),
  })
  .passthrough()

export type GroundTruthCityModelMap = z.infer<typeof cityModelMapSchema>

const lineageSchema = z
  .object({
    generated_at: z.string().min(1),
    forecast_source: z.string().min(1),
    forecast_chunks: z.number().int().nonnegative(),
    pm_cities: z.array(z.string().min(1)),
    asos_cities: z.array(z.string().min(1)),
    /** Optional SHA256 of the generator script for provenance — recommended so
     * the regen CI gate (`__tests__/unit/ground-truth-regen.test.ts`) can detect
     * when the committed JSON drifts from the current script output. */
    script_sha256: z
      .string()
      .regex(/^[0-9a-f]{64}$/)
      .optional(),
    /** Optional free-form provenance notes for surgical patches (e.g. the
     * Phase 02.9 ankara unit fix). Lets us bump generated_at and document why
     * without needing to store full diffs in the JSON. */
    patch_notes: z.array(z.string().min(1)).optional(),
    // v3.79.2: additional lineage metadata for new model additions is stored
    // under the key "v3.79.2_new_models" (dot-separated, not a valid JS
    // identifier). .passthrough() below allows it through without explicit
    // schema definition.
  })
  .passthrough()

export type GroundTruthLineage = z.infer<typeof lineageSchema>

/**
 * Top-level schema. `per_city_model` keys are city slugs (kebab-case). The
 * schema validates each value with `cityModelMapSchema`. We do NOT enforce a
 * fixed set of city slugs at the schema level because the JSON is generated
 * by the Python script and the dashboard's city set evolves. The route.ts
 * consumer is the join authority — it iterates `STATION_REGISTRY` and looks
 * up each city in this map, marking misses as `dataQualityStatus: 'unverified'`.
 *
 * `superRefine` checks structural invariants the field-level schemas can't:
 *
 *   1. `_lineage.asos_cities` must equal `Object.keys(per_city_model).sort()`
 *      — guarantees the lineage block isn't a stale copy.
 *   2. Every PM city in `_lineage.pm_cities` must appear in `per_city_model`.
 *   3. No duplicate city slugs.
 */
export const winRatesSchema = z
  .object({
    _lineage: lineageSchema,
    per_city_model: z.record(z.string().min(1), cityModelMapSchema),
  })
  .strict()
  .superRefine((data, ctx) => {
    const cityKeys = Object.keys(data.per_city_model)
    const cityKeySet = new Set(cityKeys)
    if (cityKeys.length !== cityKeySet.size) {
      ctx.addIssue({
        code: 'custom',
        message: 'duplicate city keys in per_city_model',
      })
    }
    const lineageAsos = [...data._lineage.asos_cities].sort()
    const actualAsos = [...cityKeys].sort()
    if (JSON.stringify(lineageAsos) !== JSON.stringify(actualAsos)) {
      ctx.addIssue({
        code: 'custom',
        message:
          `_lineage.asos_cities (${lineageAsos.length}) does not match per_city_model keys (${actualAsos.length}) — ` +
          `lineage may be stale. Re-run scripts/polymarket_asos_backtest.py to regenerate.`,
      })
    }
    for (const pmCity of data._lineage.pm_cities) {
      if (!cityKeySet.has(pmCity)) {
        ctx.addIssue({
          code: 'custom',
          message: `_lineage.pm_cities includes '${pmCity}' but it is missing from per_city_model`,
        })
      }
    }
  })

export type WinRatesGroundTruth = z.infer<typeof winRatesSchema>

// ─── Derived view types (post-parse, used by route.ts) ────────────────────

/**
 * One model's verified per-city rates after schema parse + hit-rate
 * derivation. `rate*Pct` are recomputed from integers (NOT read from the
 * file's `rate` field) so downstream consumers get a single deterministic
 * source of truth.
 */
export interface VerifiedModelRates {
  model: GroundTruthModelKey
  /** Polymarket bucket-resolution hit rate (14 cities only). */
  pmBucketRatePct: number | null
  pmBucketHits: number
  pmBucketAttempts: number
  /** ASOS exact-integer-match hit rate (the dashboard's authoritative methodology). */
  asosExactRatePct: number | null
  asosExactHits: number
  asosExactAttempts: number
  /** ASOS within ±1°int hit rate (more lenient cousin). */
  asosWithin1RatePct: number | null
  asosWithin1Hits: number
  asosWithin1Attempts: number
  /** True when `asos_exact.attempts < MIN_ATTEMPTS_FOR_TRUST`. */
  isInsufficient: boolean
}

export interface VerifiedCityRates {
  city: string
  models: Record<GroundTruthModelKey, VerifiedModelRates>
}

/**
 * Derive a `VerifiedModelRates` from a raw cell entry. `asosExactRate` is
 * the canonical "win rate" used by trading logic (matches the existing
 * exact-integer-match methodology of the dashboard).
 */
export function deriveModelRates(model: GroundTruthModelKey, entry: GroundTruthModelEntry): VerifiedModelRates {
  const rateOf = (cell: GroundTruthCell): number | null =>
    cell.attempts > 0 ? (100 * cell.hits) / cell.attempts : null
  return {
    model,
    pmBucketRatePct: rateOf(entry.pm_bucket),
    pmBucketHits: entry.pm_bucket.hits,
    pmBucketAttempts: entry.pm_bucket.attempts,
    asosExactRatePct: rateOf(entry.asos_exact),
    asosExactHits: entry.asos_exact.hits,
    asosExactAttempts: entry.asos_exact.attempts,
    asosWithin1RatePct: rateOf(entry.asos_within1),
    asosWithin1Hits: entry.asos_within1.hits,
    asosWithin1Attempts: entry.asos_within1.attempts,
    isInsufficient: entry.asos_exact.attempts < MIN_ATTEMPTS_FOR_TRUST,
  }
}

export function buildVerifiedView(parsed: WinRatesGroundTruth): Record<string, VerifiedCityRates> {
  const out: Record<string, VerifiedCityRates> = {}
  for (const [city, modelMap] of Object.entries(parsed.per_city_model)) {
    const models = {} as Record<GroundTruthModelKey, VerifiedModelRates>
    for (const key of GROUND_TRUTH_MODEL_KEYS) {
      const entry = (modelMap as Record<string, GroundTruthModelEntry | undefined>)[key]
      if (entry) {
        models[key] = deriveModelRates(key, entry)
      } else {
        models[key] = {
          model: key,
          pmBucketRatePct: null,
          pmBucketHits: 0,
          pmBucketAttempts: 0,
          asosExactRatePct: null,
          asosExactHits: 0,
          asosExactAttempts: 0,
          asosWithin1RatePct: null,
          asosWithin1Hits: 0,
          asosWithin1Attempts: 0,
          isInsufficient: true,
        }
      }
    }
    out[city] = { city, models }
  }
  return out
}

// ─── Deterministic ranking (Rule 2 from GPT-5.4 review) ───────────────────

/**
 * Sort models for a city by `asos_exact` win rate descending, then by
 * `attempts` descending (more data wins ties), then by model key
 * ascending. Excludes insufficient-sample cells. Stable across machines
 * because every tie-break is fully ordered.
 */
export function rankModels(city: VerifiedCityRates): VerifiedModelRates[] {
  return Object.values(city.models)
    .filter((m) => !m.isInsufficient && m.asosExactRatePct !== null)
    .sort((a, b) => {
      const rateA = a.asosExactRatePct ?? -Infinity
      const rateB = b.asosExactRatePct ?? -Infinity
      if (rateB !== rateA) return rateB - rateA
      if (b.asosExactAttempts !== a.asosExactAttempts) return b.asosExactAttempts - a.asosExactAttempts
      return a.model.localeCompare(b.model)
    })
}

/**
 * Pick the top-ranked model for a city. Returns null when every cell is
 * insufficient (small-sample-only city — should never happen with the
 * current ASOS dataset where minimum is 402, but we handle it for safety).
 */
export function pickBestModel(city: VerifiedCityRates): VerifiedModelRates | null {
  const ranked = rankModels(city)
  return ranked[0] ?? null
}

// ─── Per-city KMA gate (Rule 7 from the handoff prompt) ───────────────────

/**
 * Returns true when the trading code should zero KMA's contribution for
 * this city. Two conditions trigger the gate:
 *
 *   1. `kma.asos_exact.attempts < MIN_ATTEMPTS_FOR_TRUST` — too little data
 *      to trust any signal.
 *   2. `kma.asos_exact.rate < KMA_DEAD_RATE_PCT` — the Ankara case where
 *      KMA literally never lands the right bucket.
 *
 * NOT a global KMA disable. Other cities keep KMA at normal weight.
 *
 * IMPORTANT (Rule 5 from GPT-5.4 review): this function reads ONLY the raw
 * KMA cell. It does NOT consult any derived ranking, quarantine flag, or
 * trading-policy state. That keeps the gate decoupled from any feedback
 * loop where ranking → quarantine → ranking.
 */
export function shouldZeroKmaWeight(city: VerifiedCityRates): boolean {
  const kma = city.models.kma
  if (kma.asosExactAttempts < MIN_ATTEMPTS_FOR_TRUST) return true
  if (kma.asosExactRatePct === null) return true
  return kma.asosExactRatePct < KMA_DEAD_RATE_PCT
}

// ─── Phase 02.12 cycle 6: sample-size-aware top pick ─────────────────────

/**
 * Minimum attempts a model must have to be the #1 single-model pick WITHOUT
 * a statistical significance check. This is the "fair sample" floor used
 * across the codebase to distinguish models with roughly 2 years of backing
 * data (500-730 attempts) from KMA, which Open-Meteo only started archiving
 * in early 2025 and which has ~406 attempts for every city.
 *
 * This is NOT a hard ban on small-sample models. A model below this floor
 * can still be the #1 pick IF its lead over the top fair-sample model is
 * statistically significant under `twoProportionPValue()` at alpha = 0.05.
 */
export const MIN_FAIR_SAMPLE_FOR_TOP_PICK = 500

/**
 * Two-tailed alpha for the small-sample significance fallback. At 0.05,
 * a small-sample model must have < 5% chance of its "lead" being noise
 * for us to prefer it over a fair-sample alternative.
 */
export const SMALL_SAMPLE_SIGNIFICANCE_ALPHA = 0.05

/**
 * Error function approximation (Abramowitz & Stegun 7.1.26, max error
 * 1.5e-7). Used to compute the standard normal CDF for the 2-proportion
 * z-test. Pure numeric helper; not exported — internal to this module.
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
  const t = 1 / (1 + p * ax)
  const y = 1 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-ax * ax)
  return sign * y
}

/** Standard normal CDF: Phi(x) = 0.5 * (1 + erf(x / sqrt(2))). */
function normalCdf(x: number): number {
  return 0.5 * (1 + erf(x / Math.SQRT2))
}

/**
 * Two-tailed p-value for a 2-proportion z-test using pooled variance.
 * Returns 1 when either sample is empty or variance collapses (degenerate).
 *
 * Formula:
 *   p_pool = (h1 + h2) / (n1 + n2)
 *   se = sqrt(p_pool * (1 - p_pool) * (1/n1 + 1/n2))
 *   z = (p1 - p2) / se
 *   p = 2 * (1 - Phi(|z|))
 *
 * Exported so the regression test can cross-verify against hand-computed
 * values for the Wellington / Madrid / Shenzhen anchors.
 */
export function twoProportionPValue(hits1: number, n1: number, hits2: number, n2: number): number {
  if (n1 <= 0 || n2 <= 0) return 1
  const p1 = hits1 / n1
  const p2 = hits2 / n2
  const pooledP = (hits1 + hits2) / (n1 + n2)
  const pooledVar = pooledP * (1 - pooledP) * (1 / n1 + 1 / n2)
  if (pooledVar <= 0) return 1
  const z = (p1 - p2) / Math.sqrt(pooledVar)
  return 2 * (1 - normalCdf(Math.abs(z)))
}

/**
 * Phase 02.12 cycle 6 — sample-size-aware top pick.
 *
 * Wraps rankModels() with a 2-proportion z-test fallback: if the top-
 * ranked model has fewer than MIN_FAIR_SAMPLE_FOR_TOP_PICK attempts AND
 * its lead over the top fair-sample model is NOT statistically significant
 * at SMALL_SAMPLE_SIGNIFICANCE_ALPHA, the fair-sample model becomes the
 * pick. Otherwise ranked[0] stays as the pick.
 *
 * Why this exists
 * ---------------
 * Open-Meteo started archiving `kma_seamless` in early 2025, so KMA has
 * ~406 days of attempts for every city in our archive while other models
 * have 500-730. On 3 cities (madrid, shenzhen, wellington) KMA's small-
 * sample point estimate edges out the next model's large-sample estimate
 * by an amount that is within noise (p > 0.05). A 2-proportion z-test
 * correctly identifies these as ties and prefers the well-sampled runner-
 * up because more data = more robust out-of-sample behavior.
 *
 * This replaces the hand-wavy "subtract 3pp from KMA" rule that used to
 * live in the Phase 02.11 CLAUDE.md notes. Now it is encoded in the code,
 * auditable, and testable.
 *
 * Important scope note
 * --------------------
 * This affects ONLY single-model top selection (BEST_MODELS.singleModel
 * and BEST_FORECAST_MODEL in route.ts). Strategy combos (bestCombo /
 * comboWR in `data/weather/asos_strategy_overlay_v1.json`) measure a
 * different question — "given that both models agreed on the same bucket,
 * how often was the agreement correct?" — and continue to include small-
 * sample models like KMA where they form the best pair.
 *
 * The picker takes a pre-filtered ranked list (the caller applies the
 * kmaDead gate / etc. first) so the two concerns compose cleanly.
 */
export function pickBestSignificantModelFromRanked(ranked: readonly VerifiedModelRates[]): VerifiedModelRates | null {
  if (ranked.length === 0) return null
  const top = ranked[0]
  // If the top model already has a fair sample, keep it.
  if (top.asosExactAttempts >= MIN_FAIR_SAMPLE_FOR_TOP_PICK) return top
  // Find the top model with a fair sample (if any).
  const fairAlternative = ranked.find((m) => m.asosExactAttempts >= MIN_FAIR_SAMPLE_FOR_TOP_PICK)
  if (!fairAlternative) return top
  // Two-proportion z-test: is the small-sample model's lead significant?
  const pValue = twoProportionPValue(
    top.asosExactHits,
    top.asosExactAttempts,
    fairAlternative.asosExactHits,
    fairAlternative.asosExactAttempts,
  )
  // If NOT significant (p > alpha), prefer the fair-sample alternative.
  if (pValue > SMALL_SAMPLE_SIGNIFICANCE_ALPHA) return fairAlternative
  return top
}
