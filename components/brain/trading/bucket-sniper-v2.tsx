'use client'

/**
 * Bucket Sniper V2
 * Phase 02.19 (2026-04-16): MIN_WR raised back to 35 per the operator's directive:
 * "only want the best". If a city's top model can't clear 35% WR, it doesn't
 * get a signal — no consolation plays. We also pick the MAXIMUM WR across the
 * available fields (bestNwpSingleWR vs bestModelWR) so we always surface the
 * strongest edge on the card, not the "proxy" number when a higher one exists.
 *
 * Criteria:
 *   1. City top-model WR >= 35% (max of bestNwpSingleWR, bestModelWR)
 *   2. Model predicts a specific bucket
 *   3. That bucket is on Polymarket at < 20¢
 *   4. Tiered: PENNY (<5¢), VALUE (<10¢), OPPORTUNITY (<20¢)
 *   5. Sorted by edge (WR/price) descending
 */

import { useState } from 'react'
import GlassCard from '@/components/brain/shared/GlassCard'
import { wilsonCI } from '@/lib/wilson-ci'

// ─── Icons (inline SVG, lucide-style stroke) ───────────────────────────────

type IconProps = { className?: string }

function Icon({ className, children }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {children}
    </svg>
  )
}
const IconTarget = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="10" />
    <circle cx="12" cy="12" r="6" />
    <circle cx="12" cy="12" r="2" />
  </Icon>
)
const IconZap = (p: IconProps) => (
  <Icon {...p}>
    <path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z" />
  </Icon>
)
const IconSparkle = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M5.6 18.4l2.8-2.8M15.6 8.4l2.8-2.8" />
  </Icon>
)
const IconTrend = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3 17l6-6 4 4 8-8" />
    <path d="M14 7h7v7" />
  </Icon>
)
const IconCoin = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v10M9 9.5c0-1 1.3-1.8 3-1.8s3 .8 3 1.8-1.3 1.7-3 1.7-3 .7-3 1.7 1.3 1.8 3 1.8 3-.8 3-1.8" />
  </Icon>
)
const IconArrow = (p: IconProps) => (
  <Icon {...p}>
    <path d="M5 12h14M13 5l7 7-7 7" />
  </Icon>
)
const IconShield = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6l8-3z" />
    <path d="M9 12l2 2 4-4" />
  </Icon>
)

// ─── Types ───

interface ActiveBucket {
  label: string
  lower: number
  upper: number
  yesPrice: number
}

interface TomorrowForecast {
  best: number | null
  model: string
  [key: string]: number | null | string
}

interface PennyBid {
  bucket: string
  lower: number
  upper: number
  currentYesPrice: number | null
  isTargetBucket: boolean
  probability: number | null
  // v3.97.2 FIX 2 — true when forecastHigh within 0.3° of a bucket edge.
  // Warns the bucket-assignment is coin-flip and probability isn't trustworthy.
  boundaryCoinFlip?: boolean
  boundaryCoinFlipReason?: string | null
}

interface PennyBidCity {
  city: string
  bids: PennyBid[]
  forecastHigh: number | null
}

interface CityData {
  city: string
  unit: 'F' | 'C'
  bestNwpSingleWR: number | null
  bestNwpModel: string | null
  bestModelWR: number | null
  bestModel: string | null
  ensemble: number | null
  bestModelTemp: number | null
  activeBuckets: ActiveBucket[] | null
  tomorrowForecast: TomorrowForecast | null
  polymarketUrl: string | null
  localHour: number | null
  tier: string | null
  // v3.99.61 — sample-size stats so the sniper can suppress cards whose
  // BEST model has insufficient attempts (n<20). Maps short model keys
  // to { rate, hits, attempts }. May be null for cities without ground
  // truth (e.g. OBSERVATORY cities).
  perModelWinRateStats?: Record<string, { rate: number; hits: number; attempts: number }> | null
  // v3.99.44: ENS freshness — ensStale when the bucket_probs distribution
  // is older than 90 minutes and no longer reflects intraday drift.
  ensStale?: boolean
  ensAgeMinutes?: number | null
  dynamicSignal?: {
    confidence?: string
    modelsAgreeing?: string[]
    compositeConfidence?: number
    targetBucketNum?: number | null
    // v3.99.83 — card/popup WR reconciliation (HK incident 2026-04-20)
    currentWR?: number
    consensusWR?: number | null
    bestSingleModel?: string | null
    bestSingleWR?: number | null
  } | null
  // v3.99.77 — combo sample size (days the combo fired in backtest). Used by
  // the n<20 filter for COMBO strategies, which bypass perModelWinRateStats
  // (Beijing 42.4% bug: comboDays=33 was shown as WR with no n-traceability).
  comboDays?: number | null
  bestCombo?: string | null
  // v3.99.78 — today-applicable model/WR. Use these for live decisions
  // instead of bestModel/bestModelWR. When the configured combo is FIRING
  // today, they match the historical combo. When combo is PENDING or in
  // DISAGREEMENT, they fall back to the single-model (singleModel/singleWR).
  todayApplicableModel?: string | null
  todayApplicableWR?: number | null
  comboHistoricalWR?: number | null
  comboStatus?: 'NO_COMBO' | 'FIRING' | 'PENDING' | 'DISAGREEMENT' | 'INACTIVE'
  comboNotFiringReason?: string | null
  pendingModels?: string[]
  isAggregateWR?: boolean
}

interface WeatherIntel {
  cities: CityData[]
  pennyBidBoard?: { cities: PennyBidCity[] }
}

// ─── Sniper opportunity ───

type SniperTier = 'PENNY' | 'VALUE' | 'OPPORTUNITY'

interface SniperOpp {
  city: string
  unit: 'F' | 'C'
  model: string
  winRate: number
  forecast: number
  bucket: string
  priceCents: number
  payout: number
  edge: number
  polymarketUrl: string
  tier: SniperTier
  day: 'today' | 'tomorrow'
  cityTier: string | null
  confidence: string
  modelsAgreeing: string[]
  allBuckets: { label: string; price: number; isTarget: boolean }[]
  boundaryCoinFlip?: boolean
  boundaryCoinFlipReason?: string | null
  ensStale?: boolean
  ensAgeMinutes?: number | null
  winRateAttempts?: number | null
  winRateHits?: number | null
  // v3.99.79 — PENDING combo visual state. When the configured combo is
  // awaiting a late model publication (e.g. BOM at 21:30 AST), we still
  // render the card using the single-model fallback WR (todayApplicableWR)
  // AND flag it with an amber chip listing the pending members. the operator sees
  // the card is on-deck, not invisible.
  comboStatus?: 'NO_COMBO' | 'FIRING' | 'PENDING' | 'DISAGREEMENT' | 'INACTIVE'
  pendingModels?: string[]
  comboHistoricalWR?: number | null
}

// ─── Constants ───

// Phase 02.19 (2026-04-16): raised to 35 per the operator. Only surface plays where
// the top model has a real edge. Sub-35% cities = no signal, no consolation.
const MIN_WR = 35

// Phase 02.20 (2026-04-16): flag emoji per city for at-a-glance geography.
// Covers all 41 trading cities. Fallback globe if unknown.
const CITY_FLAG: Record<string, string> = {
  nyc: '🇺🇸',
  chicago: '🇺🇸',
  miami: '🇺🇸',
  dallas: '🇺🇸',
  atlanta: '🇺🇸',
  seattle: '🇺🇸',
  denver: '🇺🇸',
  austin: '🇺🇸',
  houston: '🇺🇸',
  'los-angeles': '🇺🇸',
  'san-francisco': '🇺🇸',
  toronto: '🇨🇦',
  'mexico-city': '🇲🇽',
  'panama-city': '🇵🇦',
  'buenos-aires': '🇦🇷',
  'sao-paulo': '🇧🇷',
  london: '🇬🇧',
  paris: '🇫🇷',
  madrid: '🇪🇸',
  milan: '🇮🇹',
  munich: '🇩🇪',
  amsterdam: '🇳🇱',
  warsaw: '🇵🇱',
  helsinki: '🇫🇮',
  ankara: '🇹🇷',
  seoul: '🇰🇷',
  busan: '🇰🇷',
  tokyo: '🇯🇵',
  taipei: '🇹🇼',
  'hong-kong': '🇭🇰',
  beijing: '🇨🇳',
  shanghai: '🇨🇳',
  shenzhen: '🇨🇳',
  chongqing: '🇨🇳',
  chengdu: '🇨🇳',
  wuhan: '🇨🇳',
  singapore: '🇸🇬',
  'kuala-lumpur': '🇲🇾',
  jakarta: '🇮🇩',
  lucknow: '🇮🇳',
  wellington: '🇳🇿',
}
function flagFor(slug: string): string {
  return CITY_FLAG[slug] ?? '🌐'
}
const MAX_PRICE = 0.2
const PENNY_CUTOFF = 0.05
const VALUE_CUTOFF = 0.1

function classifyTier(price: number): SniperTier {
  if (price < PENNY_CUTOFF) return 'PENNY'
  if (price < VALUE_CUTOFF) return 'VALUE'
  return 'OPPORTUNITY'
}

type TierToken = {
  cardBg: string // full card background wash (saturated tier tint)
  gradient: string // top-to-bottom subtle wash layered over cardBg
  border: string
  ring: string
  text: string // tier-colored text (WCAG-safe on dark)
  accent: string // solid bg for the top accent bar
  chipBg: string
  btnFill: string // CTA background (gradient, punchy)
  btnBorder: string
  btnText: string
  label: string
  Icon: (p: IconProps) => JSX.Element
  emoji: string
}

// v3.99.76 (2026-04-19): Color swap per the operator — PENNY now amber (bright yellow),
// OPPORTUNITY now emerald (green). VALUE stays cyan. Emojis intentionally NOT
// swapped — the operator wants color-only swap.
const TIER_CONFIG: Record<SniperTier, TierToken> = {
  PENNY: {
    cardBg: 'bg-amber-950/50',
    gradient: 'from-amber-500/25 via-amber-500/10 to-amber-950/40',
    border: 'border-amber-400/60',
    ring: 'shadow-[0_0_0_1px_rgba(251,191,36,0.25),0_25px_70px_-15px_rgba(251,191,36,0.35)]',
    text: 'text-amber-200',
    accent: 'bg-gradient-to-r from-amber-400 to-amber-300',
    chipBg: 'bg-amber-500/20',
    btnFill: 'bg-gradient-to-r from-amber-500 to-amber-400',
    btnBorder: 'border-amber-300/70',
    btnText: 'text-amber-950',
    label: 'PENNY',
    Icon: IconSparkle,
    emoji: '💰',
  },
  VALUE: {
    cardBg: 'bg-cyan-950/50',
    gradient: 'from-cyan-500/30 via-cyan-500/10 to-cyan-950/40',
    border: 'border-cyan-400/60',
    ring: 'shadow-[0_0_0_1px_rgba(34,211,238,0.28),0_25px_70px_-15px_rgba(34,211,238,0.4)]',
    text: 'text-cyan-200',
    accent: 'bg-gradient-to-r from-cyan-400 to-cyan-300',
    chipBg: 'bg-cyan-500/20',
    btnFill: 'bg-gradient-to-r from-cyan-500 to-cyan-400',
    btnBorder: 'border-cyan-300/70',
    btnText: 'text-cyan-950',
    label: 'VALUE',
    Icon: IconTarget,
    emoji: '🎯',
  },
  OPPORTUNITY: {
    cardBg: 'bg-emerald-950/50',
    gradient: 'from-emerald-500/30 via-emerald-500/10 to-emerald-950/40',
    border: 'border-emerald-400/60',
    ring: 'shadow-[0_0_0_1px_rgba(16,185,129,0.3),0_25px_70px_-15px_rgba(16,185,129,0.45)]',
    text: 'text-emerald-300',
    accent: 'bg-gradient-to-r from-emerald-400 to-emerald-300',
    chipBg: 'bg-emerald-500/20',
    btnFill: 'bg-gradient-to-r from-emerald-500 to-emerald-400',
    btnBorder: 'border-emerald-300/70',
    btnText: 'text-emerald-950',
    label: 'OPPORTUNITY',
    Icon: IconZap,
    emoji: '⚡',
  },
}

// ─── Bucket matching ───

function forecastToBucket(temp: number, unit: 'F' | 'C'): number {
  // v3.99.41: half-up for both units (see route.ts marketBucket docblock).
  // Keeps client-side display bucket in sync with server-side API bucket.
  void unit
  return Math.round(temp)
}

function findMatchingBucket(buckets: ActiveBucket[], forecastTemp: number, unit: 'F' | 'C'): ActiveBucket | null {
  const targetInt = forecastToBucket(forecastTemp, unit)
  return (
    buckets.find((b) => targetInt >= Math.ceil(b.lower) && targetInt <= Math.floor(b.upper)) ??
    buckets.find((b) => forecastTemp >= b.lower && forecastTemp <= b.upper) ??
    null
  )
}

// ─── Compute opportunities ───

function computeOpportunities(data: WeatherIntel): SniperOpp[] {
  const opps: SniperOpp[] = []

  for (const c of data.cities) {
    // v3.99.78 — Today-applicable WR precedence (consensus-reviewed):
    //   1. todayApplicableModel / todayApplicableWR (server-side resolved,
    //      handles FIRING vs PENDING vs DISAGREEMENT)
    //   2. bestNwpSingleWR (single-model fallback for older API payloads)
    //   3. max(bestModelWR, bestNwpSingleWR) (legacy path for backward compat)
    //
    // v3.99.79 — PENDING no longer suppresses. The server-side resolver
    // already falls back todayApplicableWR to the single-model when the
    // combo isn't fully firing, so the card surfaces the single-model WR
    // naturally. We render a visible amber chip listing pendingModels so
    // the operator knows the combo is on-deck, not invisible. When the pending
    // member publishes on the next cron run and the combo flips to
    // FIRING, todayApplicableWR jumps to the combo rate automatically.

    // v3.99.83 — WR precedence updated after HK incident (2026-04-20):
    //   1. dynamicSignal.currentWR — LIVE consensus WR from today's actual
    //      models agreeing on today's bucket. This is what the popup shows.
    //      The card must match the popup — previously the card used the
    //      historical strategy-overlay WR (61.54% for HK) while the popup
    //      showed the live consensus WR (43.94%). Card wins trust via agreement.
    //   2. todayApplicableWR — server-resolved fallback when no dynamicSignal.
    //   3. Legacy Math.max — for pre-v3.99.78 API payloads.
    const ds = c.dynamicSignal
    const confidence = ds?.confidence ?? 'LOW'
    const modelsAgreeing = ds?.modelsAgreeing ?? []
    let wr: number
    let model: string
    if (ds && typeof ds.currentWR === 'number' && ds.currentWR > 0) {
      // Prefer the LIVE consensus WR from the dynamic signal — same number the
      // popup renders. Model label follows whoever is currently agreeing.
      wr = ds.currentWR
      if (modelsAgreeing.length >= 2) {
        model = modelsAgreeing.join('+')
      } else {
        model = ds.bestSingleModel ?? c.todayApplicableModel ?? c.bestModel ?? 'unknown'
      }
    } else if (c.todayApplicableWR !== null && c.todayApplicableWR !== undefined) {
      wr = c.todayApplicableWR
      model = c.todayApplicableModel ?? 'unknown'
    } else {
      const nwpWR = c.bestNwpSingleWR ?? 0
      const fullWR = c.bestModelWR ?? 0
      wr = Math.max(nwpWR, fullWR)
      model =
        fullWR >= nwpWR ? (c.bestModel ?? c.bestNwpModel ?? 'unknown') : (c.bestNwpModel ?? c.bestModel ?? 'unknown')
    }
    if (wr < MIN_WR) continue

    // v3.99.61/77 — sample-size filter.
    // Single-model path: use perModelWinRateStats.
    // COMBO path (bestModel='COMBO' or contains '+'): use comboDays as n.
    // Beijing bug regression: perModelWinRateStats['COMBO'] is always null,
    // so without the COMBO-aware check the filter silently passes any combo
    // regardless of sample size.
    const isCombo = model === 'COMBO' || model.includes('+')
    const modelStat = c.perModelWinRateStats?.[model] ?? null
    const comboN = isCombo ? (c.comboDays ?? 0) : 0
    if (modelStat && modelStat.attempts > 0 && modelStat.attempts < 20) continue
    if (isCombo && comboN > 0 && comboN < 20) continue

    // Phase 02.20.1 (2026-04-16): suppress card when a signal exists but is
    // LOW-confidence. project law: only show bets he should actually take.
    if (ds && ds.confidence === 'LOW') continue

    // Phase 02.17.23: Dead-duck filter — don't show "today" plays for cities
    // where the market is effectively resolved (nighttime = peak has happened).
    // localHour >= 22 OR < 6 means it's late night, peak is over, market is dead.
    const localHour = c.localHour ?? 12
    const isMarketDead = localHour >= 22 || localHour < 6

    // ── TODAY ── (skip if market is dead)
    //
    // Phase 02.20.1 (2026-04-16): bucket selection MUST align with the signal's
    // canonical targetBucketNum. Previously this code used `bestModelTemp` to
    // pick a bucket from activeBuckets independently, which could disagree
    // with the Model Intelligence popup (e.g. Helsinki sniper showed 11°C
    // while the popup said 14°C). If the signal publishes a targetBucketNum
    // we use it directly. Otherwise fall back to bestModelTemp lookup for
    // cities that have no signal at all.
    const targetBucketNum = ds?.targetBucketNum ?? null
    const todayTemp = c.bestModelTemp ?? c.ensemble
    const lookupTemp = targetBucketNum !== null ? targetBucketNum : todayTemp
    if (!isMarketDead && lookupTemp !== null && lookupTemp !== undefined && c.activeBuckets?.length) {
      const match = findMatchingBucket(c.activeBuckets, lookupTemp, c.unit as 'F' | 'C')
      if (match && match.yesPrice > 0.005 && match.yesPrice < MAX_PRICE) {
        const allBuckets = c.activeBuckets
          .filter((b) => b.yesPrice > 0.005 && b.yesPrice < 0.95)
          .map((b) => ({
            label: b.label,
            price: Math.round(b.yesPrice * 100),
            isTarget: b.label === match.label,
          }))
        opps.push({
          city: c.city,
          unit: c.unit as 'F' | 'C',
          model,
          winRate: wr,
          forecast: todayTemp ?? lookupTemp,
          bucket: match.label,
          priceCents: Math.round(match.yesPrice * 100 * 10) / 10,
          payout: Math.round((1 / match.yesPrice) * 10) / 10,
          edge: Math.round((wr / 100 / match.yesPrice) * 10) / 10,
          polymarketUrl: c.polymarketUrl ?? '',
          tier: classifyTier(match.yesPrice),
          day: 'today',
          cityTier: c.tier,
          confidence,
          modelsAgreeing,
          allBuckets,
          ensStale: c.ensStale,
          ensAgeMinutes: c.ensAgeMinutes,
          winRateAttempts: isCombo ? (c.comboDays ?? null) : (modelStat?.attempts ?? null),
          winRateHits: isCombo
            ? c.comboDays !== null && c.comboDays !== undefined
              ? Math.round((wr / 100) * c.comboDays)
              : null
            : (modelStat?.hits ?? null),
          comboStatus: c.comboStatus,
          pendingModels: c.pendingModels,
          comboHistoricalWR: c.comboHistoricalWR,
        })
      }
    }

    // ── TOMORROW ──
    const tmrwTemp = c.tomorrowForecast?.best
    if (tmrwTemp !== null && tmrwTemp !== undefined) {
      const pbc = data.pennyBidBoard?.cities?.find((p) => p.city === c.city)
      if (pbc?.bids?.length) {
        const targetBid =
          pbc.bids.find((b) => b.isTargetBucket && b.currentYesPrice !== null) ??
          pbc.bids.find((b) => b.currentYesPrice !== null && tmrwTemp >= b.lower && tmrwTemp <= b.upper)
        if (targetBid?.currentYesPrice && targetBid.currentYesPrice > 0.005 && targetBid.currentYesPrice < MAX_PRICE) {
          const allBuckets = pbc.bids
            .filter((b) => b.currentYesPrice !== null && b.currentYesPrice > 0.005)
            .map((b) => ({
              label: b.bucket,
              price: Math.round((b.currentYesPrice ?? 0) * 100),
              isTarget: b.bucket === targetBid.bucket,
            }))
          opps.push({
            city: c.city,
            unit: c.unit as 'F' | 'C',
            model,
            winRate: wr,
            forecast: tmrwTemp,
            bucket: targetBid.bucket,
            priceCents: Math.round(targetBid.currentYesPrice * 100 * 10) / 10,
            payout: Math.round((1 / targetBid.currentYesPrice) * 10) / 10,
            edge: Math.round((wr / 100 / targetBid.currentYesPrice) * 10) / 10,
            polymarketUrl: c.polymarketUrl?.replace(/on-[a-z]+-\d+-\d+/, `on-april-11-2026`) ?? '',
            tier: classifyTier(targetBid.currentYesPrice),
            day: 'tomorrow',
            cityTier: c.tier,
            confidence,
            modelsAgreeing,
            allBuckets,
            boundaryCoinFlip: targetBid.boundaryCoinFlip ?? false,
            boundaryCoinFlipReason: targetBid.boundaryCoinFlipReason ?? null,
            ensStale: c.ensStale,
            ensAgeMinutes: c.ensAgeMinutes,
            winRateAttempts: modelStat?.attempts ?? null,
            winRateHits: modelStat?.hits ?? null,
          })
        }
      }
    }
  }

  opps.sort((a, b) => b.edge - a.edge)
  return opps
}

// ─── Component ───

export default function BucketSniperV2({ weatherIntel }: { weatherIntel: WeatherIntel | null }) {
  const [activeDay, setActiveDay] = useState<'tomorrow' | 'today'>('tomorrow')

  if (!weatherIntel) return null

  const opps = computeOpportunities(weatherIntel)
  const todayOpps = opps.filter((o) => o.day === 'today')
  const tmrwOpps = opps.filter((o) => o.day === 'tomorrow')
  const activeOpps = activeDay === 'tomorrow' ? tmrwOpps : todayOpps
  const totalCount = opps.length

  return (
    <GlassCard className="p-4 md:p-6" delay={0.35}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <h3 className="text-lg font-bold text-white tracking-tight">Bucket Sniper</h3>
          {totalCount > 0 && (
            <span className="text-xs font-mono bg-green-500/20 text-green-400 px-2.5 py-1 rounded-full border border-green-500/30">
              {totalCount} live
            </span>
          )}
        </div>

        {/* Day toggle — show actual dates (project law 2026-04-16) */}
        <div className="flex items-center gap-1 bg-white/5 rounded-lg p-0.5 border border-white/10">
          {(() => {
            const todayDate = new Date().toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
              timeZone: 'America/Puerto_Rico',
            })
            const tmrwDate = new Date(Date.now() + 86400000).toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
              timeZone: 'America/Puerto_Rico',
            })
            return (
              <>
                <button
                  onClick={() => setActiveDay('tomorrow')}
                  className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all ${
                    activeDay === 'tomorrow'
                      ? 'bg-purple-500/30 text-purple-300 border border-purple-500/40'
                      : 'text-gray-500 hover:text-gray-300'
                  }`}
                >
                  {tmrwDate} ({tmrwOpps.length})
                </button>
                <button
                  onClick={() => setActiveDay('today')}
                  className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all ${
                    activeDay === 'today'
                      ? 'bg-blue-500/30 text-blue-300 border border-blue-500/40'
                      : 'text-gray-500 hover:text-gray-300'
                  }`}
                >
                  {todayDate} ({todayOpps.length})
                </button>
              </>
            )
          })()}
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-5 mb-5 text-[10px] uppercase tracking-[0.12em] text-gray-500 border-b border-white/[0.06] pb-3">
        <span className="flex items-center gap-1.5">
          <IconShield className="h-3 w-3 text-gray-400" />
          <span className="font-semibold text-gray-300">WR &ge; {MIN_WR}%</span>
        </span>
        <span className="h-3 w-px bg-white/10" />
        <span className="flex items-center gap-1.5 text-amber-300">
          <span aria-hidden>💰</span> Penny &lt; 5&cent;
        </span>
        <span className="flex items-center gap-1.5 text-cyan-300">
          <span aria-hidden>🎯</span> Value &lt; 10&cent;
        </span>
        <span className="flex items-center gap-1.5 text-emerald-300">
          <span aria-hidden>⚡</span> Opportunity &lt; 20&cent;
        </span>
      </div>

      {/* Cards grid */}
      {activeOpps.length === 0 ? (
        <div className="text-center py-12 text-gray-500 text-sm">
          No {activeDay} sniper plays. Waiting for cheap buckets in high-WR cities.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {activeOpps.map((o) => (
            <SniperCard key={`${o.city}-${o.day}`} opp={o} />
          ))}
        </div>
      )}
    </GlassCard>
  )
}

// ─── Card ───

function SniperCard({ opp }: { opp: SniperOpp }) {
  const t = TIER_CONFIG[opp.tier]
  const unitLabel = opp.unit === 'F' ? '°F' : '°C'
  const cityDisplay = opp.city.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
  const wrTone =
    opp.winRate >= 55
      ? 'text-emerald-300'
      : opp.winRate >= 45
        ? 'text-cyan-300'
        : opp.winRate >= 38
          ? 'text-white'
          : 'text-gray-200'
  const edgeTone = opp.edge >= 8 ? 'text-emerald-300' : opp.edge >= 5 ? 'text-cyan-300' : 'text-amber-300'
  const confTone =
    opp.confidence === 'HIGH'
      ? 'border-emerald-400/40 bg-emerald-500/10 text-emerald-300'
      : opp.confidence === 'MEDIUM'
        ? 'border-amber-400/40 bg-amber-500/10 text-amber-300'
        : 'border-white/10 bg-white/5 text-gray-400'

  return (
    <div
      className={`group relative overflow-hidden rounded-2xl border-2 ${t.border} ${t.cardBg} backdrop-blur-xl transition-all duration-300 hover:-translate-y-0.5 ${t.ring}`}
    >
      {/* Saturated tier gradient wash */}
      <div className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${t.gradient}`} />
      {/* Top accent bar — thicker + gradient */}
      <div className={`absolute inset-x-0 top-0 h-1 ${t.accent}`} />

      <div className="relative p-5">
        {/* Header: City + city-tier + sniper-tier */}
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span aria-hidden className="text-xl leading-none drop-shadow-sm">
                {flagFor(opp.city)}
              </span>
              <h4 className="text-base font-semibold text-white tracking-tight truncate">{cityDisplay}</h4>
              {opp.cityTier && (
                <span
                  className={`inline-flex h-5 min-w-[20px] items-center justify-center rounded-md px-1.5 text-[10px] font-bold tracking-wide ${
                    opp.cityTier === 'S'
                      ? 'bg-amber-400/15 text-amber-300 ring-1 ring-amber-400/30'
                      : opp.cityTier === 'A'
                        ? 'bg-emerald-400/15 text-emerald-300 ring-1 ring-emerald-400/30'
                        : 'bg-white/5 text-gray-400 ring-1 ring-white/10'
                  }`}
                >
                  {opp.cityTier}
                </span>
              )}
            </div>
            <p className="mt-0.5 text-[11px] text-gray-500">
              <span className="text-gray-300 font-medium">{opp.model}</span> forecasts{' '}
              <span className="text-gray-200 font-mono">
                {opp.forecast.toFixed(1)}
                {unitLabel}
              </span>
            </p>
          </div>

          <span
            className={`inline-flex items-center gap-1.5 rounded-full border ${t.border} ${t.chipBg} px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.1em] ${t.text}`}
          >
            <span aria-hidden className="text-[11px] leading-none">
              {t.emoji}
            </span>
            {t.label}
          </span>
        </div>

        {/* Hero: target bucket */}
        <div className={`relative rounded-xl border border-white/[0.06] bg-black/40 px-4 py-5 mb-4`}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] uppercase tracking-[0.14em] text-gray-500 font-medium">Target bucket</span>
            <span className="inline-flex items-center gap-1 text-[10px] text-gray-500">
              <IconTarget className="h-3 w-3" />
              {opp.day === 'today' ? 'Today' : 'Tomorrow'}
            </span>
          </div>
          <div className={`text-[28px] leading-none font-semibold tracking-tight ${t.text}`}>{opp.bucket}</div>
          {opp.boundaryCoinFlip && (
            <div
              className="mt-2 rounded-md border border-amber-700 bg-amber-950/50 px-3 py-1.5 text-[11px] text-amber-200"
              title={opp.boundaryCoinFlipReason ?? undefined}
            >
              ⚠️ BOUNDARY COIN-FLIP — forecast within 0.3° of bucket edge. Tiny variance flips buckets. Win rate not
              trustworthy.
            </div>
          )}
        </div>

        {/* Stat trio */}
        <div className="grid grid-cols-3 gap-2 mb-4">
          <StatCell
            icon={<IconTrend className="h-3.5 w-3.5" />}
            label="Win Rate"
            value={(() => {
              // v3.99.61 — attach Wilson CI band when 20 ≤ n < 50. n<20 would have
              // been suppressed upstream in computeOpportunities, so if we're here
              // with very-low attempts, we show the CI band anyway so the reader
              // sees how wide the interval is.
              const n = opp.winRateAttempts
              const h = opp.winRateHits
              if (n === null || n === undefined || h === null || h === undefined || n < 20) {
                return `${opp.winRate.toFixed(1)}%`
              }
              if (n >= 50) return `${opp.winRate.toFixed(1)}%`
              const ci = wilsonCI(h, n)
              return `${opp.winRate.toFixed(1)}% [${ci.lo.toFixed(0)}–${ci.hi.toFixed(0)}] n=${n}`
            })()}
            tone={wrTone}
          />
          <StatCell
            icon={<IconCoin className="h-3.5 w-3.5" />}
            label="Price"
            value={`${opp.priceCents < 1 ? opp.priceCents.toFixed(1) : Math.round(opp.priceCents)}¢`}
            tone={t.text}
          />
          <StatCell
            icon={<IconZap className="h-3.5 w-3.5" />}
            label="Payout"
            value={`${opp.payout}x`}
            tone="text-white"
          />
        </div>

        {/* Edge + Confidence row */}
        <div className="flex items-center justify-between mb-4 text-[11px]">
          <span className="inline-flex items-center gap-1.5 text-gray-400">
            <span className="uppercase tracking-[0.12em] text-gray-500">Edge</span>
            <span className={`font-semibold font-mono ${edgeTone}`}>{opp.edge}x</span>
          </span>
          <span className="inline-flex items-center gap-2">
            <span
              className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${confTone}`}
            >
              <IconShield className="h-3 w-3" />
              {opp.confidence}
            </span>
            {opp.modelsAgreeing.length >= 2 && (
              <span className="text-[10px] text-gray-500">{opp.modelsAgreeing.length} models agree</span>
            )}
            {opp.ensStale && (
              <span
                className="inline-flex items-center gap-1 rounded-md border border-orange-400/40 bg-orange-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-orange-300"
                title={`ENS bucket distribution is ${opp.ensAgeMinutes ?? '>90'}m old. Treat probabilities as stale.`}
              >
                ENS stale ({opp.ensAgeMinutes ?? '90+'}m)
              </span>
            )}
            {/* v3.99.79 — PENDING combo chip. The configured combo is waiting
                on at least one member to publish today's forecast. The card's
                WR is the single-model fallback; when the pending member(s)
                arrive and the combo fires, the WR will jump to the combo
                rate on the next refresh. */}
            {opp.comboStatus === 'PENDING' && opp.pendingModels && opp.pendingModels.length > 0 && (
              <span
                className="inline-flex items-center gap-1 rounded-md border border-amber-400/40 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-300"
                title={
                  opp.comboHistoricalWR !== null && opp.comboHistoricalWR !== undefined
                    ? `Combo pending ${opp.pendingModels.join(', ')}. Historical combo WR ${opp.comboHistoricalWR.toFixed(1)}% — will activate once all members publish.`
                    : `Combo pending ${opp.pendingModels.join(', ')}.`
                }
              >
                ⏳ PENDING {opp.pendingModels.join(', ').toUpperCase()}
              </span>
            )}
            {/* v3.99.79 — DISAGREEMENT combo chip. All members have data but
                predict different buckets. Card shows the single-model
                fallback only; historical combo WR is NOT applicable today. */}
            {opp.comboStatus === 'DISAGREEMENT' && (
              <span
                className="inline-flex items-center gap-1 rounded-md border border-gray-400/40 bg-gray-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-gray-300"
                title={
                  opp.comboHistoricalWR !== null && opp.comboHistoricalWR !== undefined
                    ? `Combo members disagree today. Historical combo WR ${opp.comboHistoricalWR.toFixed(1)}% NOT applicable — showing single-model WR instead.`
                    : 'Combo members disagree today.'
                }
              >
                COMBO SPLIT
              </span>
            )}
          </span>
        </div>

        {/* Bucket chips */}
        {opp.allBuckets.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-4">
            {opp.allBuckets.slice(0, 7).map((b) => (
              <span
                key={b.label}
                className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-mono ${
                  b.isTarget
                    ? `${t.text} ${t.chipBg} ring-1 ring-inset ${t.border} font-semibold`
                    : b.price <= 5
                      ? 'text-emerald-400/80 bg-emerald-500/[0.06] ring-1 ring-inset ring-emerald-400/10'
                      : 'text-gray-400 bg-white/[0.03] ring-1 ring-inset ring-white/[0.06]'
                }`}
              >
                {b.label}
                <span className="text-gray-500 font-normal">·</span>
                {b.price}¢
              </span>
            ))}
          </div>
        )}

        {/* CTA */}
        {opp.polymarketUrl && (
          <a
            href={opp.polymarketUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={`group/btn relative flex w-full items-center justify-center gap-2 rounded-lg border ${t.btnBorder} ${t.btnFill} px-4 py-2.5 text-xs font-bold uppercase tracking-[0.12em] ${t.btnText} shadow-lg shadow-black/30 transition-all hover:brightness-110 hover:-translate-y-px active:translate-y-0`}
            aria-label={`Open ${cityDisplay} ${opp.bucket} bucket on Polymarket`}
          >
            <span>Open on Polymarket</span>
            <IconArrow className="h-3.5 w-3.5 transition-transform group-hover/btn:translate-x-0.5" />
          </a>
        )}
      </div>
    </div>
  )
}

function StatCell({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: string; tone: string }) {
  return (
    <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-2.5 py-2">
      <div className="flex items-center gap-1 text-[9px] uppercase tracking-[0.14em] text-gray-500 font-medium">
        <span className="text-gray-500">{icon}</span>
        {label}
      </div>
      <div className={`mt-1 text-[17px] leading-none font-semibold font-mono ${tone}`}>{value}</div>
    </div>
  )
}
