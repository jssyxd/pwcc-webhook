/**
 * Wilson score confidence interval for a binomial proportion.
 *
 * More reliable than the normal-approximation interval at small n — which is
 * exactly the regime we care about here (per-model Polymarket bucket hit
 * rates with n in the 20-100 range).
 *
 * https://en.wikipedia.org/wiki/Binomial_proportion_confidence_interval#Wilson_score_interval
 *
 * Returns lo/hi as percentages (0-100). `center` is the Wilson-adjusted
 * midpoint, which is NOT p̂ = hits/n — it's pulled toward 0.5 at small n.
 */

export interface WilsonCI {
  /** lower bound, percentage [0, 100] */
  lo: number
  /** upper bound, percentage [0, 100] */
  hi: number
  /** Wilson-adjusted midpoint, percentage [0, 100] */
  center: number
  /** half-width in percentage points */
  half: number
}

export function wilsonCI(hits: number, n: number, z: number = 1.96): WilsonCI {
  if (n <= 0 || !Number.isFinite(hits) || !Number.isFinite(n)) {
    return { lo: 0, hi: 0, center: 0, half: 0 }
  }
  const p = hits / n
  const denom = 1 + (z * z) / n
  const centerFrac = (p + (z * z) / (2 * n)) / denom
  const halfFrac = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / denom
  const lo = Math.max(0, centerFrac - halfFrac) * 100
  const hi = Math.min(1, centerFrac + halfFrac) * 100
  return { lo, hi, center: centerFrac * 100, half: halfFrac * 100 }
}

/**
 * Sample-size regime for per-model WR display.
 *
 *  - "hidden": n < 20 — hide the WR, show "insufficient sample (n=X)"
 *  - "ci-band": 20 ≤ n < 50 — show WR with visible CI band
 *  - "full":   n ≥ 50 — show WR, CI available on hover
 */
export type WRDisplayRegime = 'hidden' | 'ci-band' | 'full'

export function wrRegime(n: number): WRDisplayRegime {
  if (!Number.isFinite(n) || n < 20) return 'hidden'
  if (n < 50) return 'ci-band'
  return 'full'
}

/**
 * Is the BEST model actually distinguishable from the runner-up?
 *
 * Returns true when the runner-up's CI overlaps the leader's CI by MORE than
 * 50% of the leader's CI width. In that case the "BEST" claim is not
 * statistically meaningful — we should suppress the badge on the UI.
 *
 * Both inputs must carry {hits, attempts}.
 */
export function bestIsDistinguishable(
  leader: { hits: number; attempts: number },
  runnerUp: { hits: number; attempts: number } | null,
): boolean {
  if (!runnerUp) return true
  const l = wilsonCI(leader.hits, leader.attempts)
  const r = wilsonCI(runnerUp.hits, runnerUp.attempts)
  if (l.hi <= l.lo) return true // degenerate
  // Overlap = max(0, min(l.hi, r.hi) - max(l.lo, r.lo))
  const overlap = Math.max(0, Math.min(l.hi, r.hi) - Math.max(l.lo, r.lo))
  const leaderWidth = l.hi - l.lo
  if (leaderWidth <= 0) return true
  // If the overlap consumes more than 50% of the leader's width, the
  // runner-up's CI swallows most of the leader's — not distinguishable.
  return overlap / leaderWidth < 0.5
}
