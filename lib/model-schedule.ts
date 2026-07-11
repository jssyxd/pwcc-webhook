/**
 * lib/model-schedule.ts — Model-refresh-aware schedule utilities
 *
 * Weather forecasting models update 4x/day at Z00/Z06/Z12/Z18 UTC.
 * Open-Meteo typically publishes a run ~3 hours after its reference time.
 *
 * Publication lags (conservative, matches Open-Meteo latency):
 *   Z00 → available ~03:00 UTC (03h lag)
 *   Z06 → available ~09:00 UTC (03h lag)
 *   Z12 → available ~15:00 UTC (03h lag)
 *   Z18 → available ~21:00 UTC (03h lag)
 *
 * These utilities let the UI answer "which model run is actually available
 * right now, and when is the next one?" without guessing or hardcoding.
 */

/** UTC hours at which each model run's data becomes available on Open-Meteo */
const PUBLICATION_HOURS_UTC = [3, 9, 15, 21] as const

/** UTC hours at which each model run is generated (Z00, Z06, Z12, Z18) */
const RUN_HOURS_UTC = [0, 6, 12, 18] as const

/** Publication lag in hours (Open-Meteo typically publishes ~3h after Z-time) */
const PUBLICATION_LAG_HOURS = 3

/**
 * Return the ISO 8601 string for the most recently available model run,
 * accounting for the ~3h publication lag.
 *
 * Example: if now=2026-04-15T04:00:00Z, the Z00 run became available at
 * 03:00 UTC today, so lastModelRunIso = "2026-04-15T00:00:00.000Z"
 *
 * Example: if now=2026-04-15T02:30:00Z, the Z00 run is not yet published
 * (pub at 03:00 UTC), so lastModelRunIso = Z18 of 2026-04-14 =
 * "2026-04-14T18:00:00.000Z"
 */
export function lastModelRunIso(now?: Date): string {
  const ts = (now ?? new Date()).getTime()
  const nowMs = ts

  // Walk publication times backwards to find the most recent available run
  // Check today + yesterday to handle wrap-around near midnight
  for (let dayOffset = 0; dayOffset <= 1; dayOffset++) {
    const baseDay = new Date(nowMs - dayOffset * 86400 * 1000)
    const datePrefix = baseDay.toISOString().slice(0, 10) // YYYY-MM-DD

    // Check publication hours in reverse order (most recent first)
    for (let i = PUBLICATION_HOURS_UTC.length - 1; i >= 0; i--) {
      const pubHourUtc = PUBLICATION_HOURS_UTC[i]
      const runHourUtc = RUN_HOURS_UTC[i]

      // Publication time: same day as run, pubHourUtc UTC
      const pubMs = Date.parse(`${datePrefix}T${String(pubHourUtc).padStart(2, '0')}:00:00.000Z`)
      if (nowMs >= pubMs) {
        // This run is available — return its reference Z-time
        return `${datePrefix}T${String(runHourUtc).padStart(2, '0')}:00:00.000Z`
      }
    }
  }

  // Fallback (should never reach here under normal conditions):
  // Return Z18 of two days ago as an extremely conservative fallback
  const twoDaysAgo = new Date(nowMs - 2 * 86400 * 1000)
  return `${twoDaysAgo.toISOString().slice(0, 10)}T18:00:00.000Z`
}

/**
 * Return the ISO 8601 string for the next expected model run publication.
 *
 * This is the first publication time in the future (not yet available).
 */
export function nextModelRunIso(now?: Date): string {
  const ts = (now ?? new Date()).getTime()
  const nowMs = ts

  // Check today + tomorrow
  for (let dayOffset = 0; dayOffset <= 1; dayOffset++) {
    const baseDay = new Date(nowMs + dayOffset * 86400 * 1000)
    const datePrefix = baseDay.toISOString().slice(0, 10)

    for (let i = 0; i < PUBLICATION_HOURS_UTC.length; i++) {
      const pubHourUtc = PUBLICATION_HOURS_UTC[i]
      const runHourUtc = RUN_HOURS_UTC[i]

      const pubMs = Date.parse(`${datePrefix}T${String(pubHourUtc).padStart(2, '0')}:00:00.000Z`)
      if (nowMs < pubMs) {
        // This is the next publication — return the run's reference Z-time
        return `${datePrefix}T${String(runHourUtc).padStart(2, '0')}:00:00.000Z`
      }
    }
  }

  // Fallback: Z00 of day after tomorrow
  const dayAfterTomorrow = new Date(nowMs + 2 * 86400 * 1000)
  return `${dayAfterTomorrow.toISOString().slice(0, 10)}T00:00:00.000Z`
}

/**
 * Return how many minutes until the next model run becomes available.
 * Always >= 0.
 */
export function nextModelRunMinutesAway(now?: Date): number {
  const ts = (now ?? new Date()).getTime()
  const nextRunMs = Date.parse(nextModelRunIso(now))
  const diffMs = Math.max(0, nextRunMs - ts + PUBLICATION_LAG_HOURS * 60 * 60 * 1000)
  return Math.round(diffMs / 60000)
}

/**
 * Returns true if the given `updatedAt` ISO timestamp is >= the last available
 * model run's reference time. This indicates the data was written AFTER the
 * most recent model run became available — i.e., the data IS fresh for this run.
 *
 * Note: a cron that runs every 15 min will write within 15 min of the
 * publication time. Use a small tolerance: updatedAt just needs to be >= the
 * PUBLICATION time (not the run time) to be considered fresh.
 */
export function isFreshForModelRun(updatedAt: string, now?: Date): boolean {
  const updatedMs = Date.parse(updatedAt)
  if (Number.isNaN(updatedMs)) return false

  const lastRunIso = lastModelRunIso(now)
  const lastRunMs = Date.parse(lastRunIso)
  const lastPubMs = lastRunMs + PUBLICATION_LAG_HOURS * 60 * 60 * 1000

  // Fresh if the data was written at or after the last publication time
  return updatedMs >= lastPubMs
}

/**
 * Format a run ISO string as "Z18", "Z00", etc.
 * Extracts the hour from the ISO timestamp and formats it as Z-time label.
 */
export function formatModelRunLabel(runIso: string): string {
  const d = new Date(runIso)
  if (Number.isNaN(d.getTime())) return 'Z??'
  const hourUtc = d.getUTCHours()
  return `Z${String(hourUtc).padStart(2, '0')}`
}
