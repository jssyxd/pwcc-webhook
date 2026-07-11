/**
 * Phase 02.15 — DEAD Sniper GUARANTEED NO alerts (buyNoSafe tier system).
 *
 * Three-tier model based on METAR_RELIABILITY audit (route.ts ~line 6590):
 *   1. GUARANTEED — buyNoSafe=true cities, ceiling breached. Free money.
 *   2. RISKY — buyNoSafe=false (audited), ceiling breached. WU may resolve lower.
 *   3. UNAUDITED — no audit data, ceiling breached. Use with caution.
 *
 * the operator: "We are not predicting the weather. We are pointing out the obvious."
 */

/** Audit status for a city's METAR reliability data. */
export type AuditStatus = 'full' | 'partial' | 'unaudited'

/** Kill tier — how confident is the NO signal. */
export type KillTier = 'guaranteed' | 'risky' | 'unaudited'

/** Approaching tier — how confident is the approaching signal. */
export type ApproachingTier = 'approaching' | 'international_watch' | 'unaudited_watch'

/**
 * Single confirmed NO alert. The running high has already crossed the
 * bucket ceiling. For buyNoSafe cities this is guaranteed money.
 * For others, WU may (rarely) resolve lower — shown with warning.
 */
export interface DeadSniperBucket {
  /** City slug (kebab-case). */
  city: string
  /** Human-friendly city name. */
  cityDisplayName: string
  /** Polymarket bucket label — e.g. "between 65-66°F" / "≤20°C". */
  bucketLabel: string
  /** Lower bound in native unit, null for wide-below buckets. */
  bucketLo: number | null
  /** Upper bound (kill threshold) in native unit. */
  bucketHi: number | null
  /** Temperature unit for this city. */
  bucketUnit: 'F' | 'C'
  /** Current intraday running max — already above the ceiling. */
  runningHigh: number
  /** How far above the ceiling the running high is (always >= 0). */
  exceededByDeg: number
  /** Current NO price on Polymarket (always < 0.95 on emitted buckets). */
  currentNoPrice: number
  /** Guaranteed profit per share: $1.00 - noPrice. */
  edgePerShare: number
  /** Direct Polymarket event URL. */
  polymarketUrl: string
  /** METAR freshness. */
  metarObservationStatus: 'fresh' | 'stale' | 'unknown'
  /** Age of the backing METAR observation in seconds, or null. */
  metarAgeSeconds: number | null
  /** ISO timestamp of the last METAR observation, or null. */
  runningHighObservedAt: string | null
  /** Kill tier: guaranteed (buyNoSafe), risky (audited, WU may go lower), unaudited. */
  tier: KillTier
  /** Whether WU has NEVER resolved lower than ASOS for this city. */
  buyNoSafe: boolean
  /** Audit completeness: full (727+ days), partial (30 days), unaudited (0). */
  auditStatus: AuditStatus
  /** Days of METAR vs WU comparison data. */
  auditDays: number
  /** Warning message for non-guaranteed kills. Null for guaranteed. */
  warningMessage: string | null
}

/**
 * Per-city METAR refresh cadence info.
 */
export interface DeadSniperCityMetarStatus {
  city: string
  cityDisplayName: string
  lastObsAtIso: string | null
  nextExpectedAtIso: string | null
  intervalMinutes: number | null
  ageMinutes: number | null
  status: 'fresh' | 'stale' | 'unknown'
}

/**
 * APPROACHING bucket — temp is within striking distance of the ceiling
 * and still climbing. Not guaranteed yet, but watch this.
 */
export interface DeadSniperApproaching {
  city: string
  cityDisplayName: string
  bucketLabel: string
  bucketHi: number
  bucketUnit: 'F' | 'C'
  runningHigh: number
  /** Degrees remaining until the ceiling is breached. */
  degreesAway: number
  /** Current NO price on Polymarket. */
  currentNoPrice: number
  /** Potential profit per share if it crosses. */
  potentialEdge: number
  /** Is the temp still climbing? */
  stillClimbing: boolean
  /** Trend description. */
  trendLabel: string
  /** When the next METAR observation is expected (ISO). */
  nextMetarAtIso: string | null
  /** Minutes until next METAR update. */
  minutesUntilNextMetar: number | null
  polymarketUrl: string
  /** Approaching tier: approaching (buyNoSafe), international_watch (audited unsafe), unaudited_watch. */
  tier: ApproachingTier
  /** Whether WU has NEVER resolved lower than ASOS for this city. */
  buyNoSafe: boolean
  /** Audit completeness. */
  auditStatus: AuditStatus
  /** Days of audit data. */
  auditDays: number
  /** ASOS leads WU by N minutes (snipe window). Null if unknown. */
  leadTimeMins: number | null
  /** Warning for non-buyNoSafe cities. */
  warningMessage: string | null
}

/**
 * Response shape for `GET /api/brain/dead-sniper`.
 *
 * Phase 02.15: buyNoSafe-aware tier model:
 *   1. guaranteedNOs[] — buyNoSafe=true, ceiling breached. BUY NO.
 *   2. riskyNOs[] — buyNoSafe=false or unaudited, ceiling breached. With warning.
 *   3. approaching[] — buyNoSafe=true, temp climbing toward ceiling. WATCH.
 *   4. internationalWatch[] — audited buyNoSafe=false, temp approaching. HIGHER RISK.
 *   5. unauditedApproaching[] — unaudited cities, temp approaching. CAUTION.
 *   6. fullyRepricedCount — dead but bots ate the edge.
 */
export interface DeadSniperResponse {
  /** Server-side generation timestamp, ISO. */
  generatedAt: string
  /** 'stale' when any city's METAR is older than the threshold. */
  staleness: 'fresh' | 'stale'
  /** buyNoSafe=true approaching — temp climbing toward ceiling. WATCH. */
  approaching: DeadSniperApproaching[]
  /** Audited buyNoSafe=false approaching — WU may resolve lower. HIGHER RISK. */
  internationalWatch: DeadSniperApproaching[]
  /** Unaudited cities approaching — no audit data. CAUTION. */
  unauditedApproaching: DeadSniperApproaching[]
  /** buyNoSafe=true confirmed kills — ceiling breached, guaranteed money. */
  guaranteedNOs: DeadSniperBucket[]
  /** Non-guaranteed kills — audited unsafe or unaudited, with warnings. */
  riskyNOs: DeadSniperBucket[]
  /** Number of confirmed dead buckets where NO >= $0.95 (no edge left). */
  fullyRepricedCount: number
  /** Roll-up for the panel header. */
  summary: {
    totalGuaranteedNOs: number
    totalRiskyNOs: number
    totalApproaching: number
    totalInternationalWatch: number
    totalUnauditedApproaching: number
    totalEdgeUsd: number
    citiesWithEdge: number
  }
  /** Per-city METAR refresh cadence + freshness. */
  cityMetarStatus?: DeadSniperCityMetarStatus[]
}
