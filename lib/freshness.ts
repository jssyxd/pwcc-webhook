/**
 * v3.77.0 — Data freshness state machine
 *
 * Single source of truth for how the dashboard judges whether the data it's
 * displaying is trustworthy. Designed per GPT-5.4 review: real snapshot age
 * (not fetch recency), explicit badge taxonomy, source-level breakdown, and
 * server/client build-mismatch detection.
 */

export type FreshnessState =
  | 'LIVE' // data <30s old, all sources LIVE, builds match
  | 'DEGRADED' // 30s–2m old OR one source DEGRADED/STALE
  | 'STALE' // >2m old OR multiple sources STALE
  | 'DISCONNECTED' // no successful fetch in >60s
  | 'VERSION_MISMATCH' // client build != server build

export type SourceId = 'openmeteo' | 'metar' | 'wu' | 'polymarket'
export type SourceStatus = 'LIVE' | 'DEGRADED' | 'STALE' | 'UNKNOWN'

export interface SourceInfo {
  last_ok_at: string | null // ISO timestamp of most recent successful write/read
  age_seconds: number | null
  status: SourceStatus
  // v3.77.8: optional pointer to the slowest specific reporter (e.g. which
  // city/airport/station is dragging the source age up). Lets the bar say
  // "metar 39m · slowest: London EGLL 2h ago" instead of anonymous "39m".
  slowest_context?: string | null
}

export interface FreshnessPayload {
  server_build: string
  response_generated_at: string
  snapshot_at: string // when the cached snapshot was built
  oldest_component_updated_at: string | null // min(forecast_current.updated_at) across all rows
  source_status: Record<SourceId, SourceInfo>
}

// Thresholds (seconds). v3.77.10: calibrated for the actual cadence of the
// underlying data — weather models refresh 4x/day (every 6h), cron writes
// every 15 min. A 30-second LIVE window makes sense for a stock ticker, not a
// weather dashboard. Every minute between snapshot rebuilds, the old 30s/120s
// thresholds forced the bar amber, creating constant false alarm fatigue.
//
// New thresholds: LIVE covers the normal 10-min operating window; DEGRADED is
// worth-noticing-but-not-alarming; STALE is actually broken.
//
// DISCONNECTED is a transport-reachability signal, not a dataset-health signal.
export const THRESHOLDS = {
  // Snapshot-age thresholds used for overall state
  live_max: 600, // 10 min — comfortably above cron cadence + network jitter
  degraded_max: 1800, // 30 min — 2x cron cadence; anything past this is broken
  // Per-source freshness
  source_live_max: 60 * 20, // 20 min — cron writes every 15 min, this is 1.3x
  source_degraded_max: 60 * 45, // 45 min — 3x cron cadence
  // Client-disconnect threshold. Must comfortably exceed the slowest
  // successful-fetch cadence (60s full-interval) so that one missed 15s poll
  // plus network jitter does not flip the bar red.
  disconnect_seconds: 90,
} as const

export interface ClientInputs {
  payload: FreshnessPayload | null
  clientBuild: string
  lastFetchOkAt: number | null // Date.now() of last successful fetch
  now?: number // override for testing
}

export interface ClientDecision {
  state: FreshnessState
  reason: string
  snapshot_age_seconds: number | null
  sources: Record<SourceId, SourceInfo>
  server_build: string | null
  client_build: string
  build_mismatch: boolean
}

/**
 * Derive the current badge state from server payload + client-side context.
 * Precedence: VERSION_MISMATCH > DISCONNECTED > STALE > DEGRADED > LIVE.
 */
export function deriveFreshnessState(input: ClientInputs): ClientDecision {
  const now = input.now ?? Date.now()
  const clientBuild = input.clientBuild

  // No payload yet — client hasn't fetched successfully or is disconnected
  if (!input.payload) {
    const lastOkMsAgo = input.lastFetchOkAt ? (now - input.lastFetchOkAt) / 1000 : Infinity
    return {
      state: 'DISCONNECTED',
      reason: isFinite(lastOkMsAgo)
        ? `No fresh data: last successful fetch ${Math.round(lastOkMsAgo)}s ago`
        : 'No fresh data: client has never fetched successfully',
      snapshot_age_seconds: null,
      sources: emptySources(),
      server_build: null,
      client_build: clientBuild,
      build_mismatch: false,
    }
  }

  const p = input.payload
  const buildMismatch = !!p.server_build && !!clientBuild && p.server_build !== clientBuild

  // Version mismatch wins all other signals — operator must hard-reload
  if (buildMismatch) {
    return {
      state: 'VERSION_MISMATCH',
      reason: `Client build ${clientBuild} does not match server build ${p.server_build}. Hard reload (Cmd+Shift+R) required.`,
      snapshot_age_seconds: ageSeconds(p.snapshot_at, now),
      sources: p.source_status,
      server_build: p.server_build,
      client_build: clientBuild,
      build_mismatch: true,
    }
  }

  // Client-side disconnection: even if payload exists, if client hasn't succeeded
  // in reaching the server recently, the displayed data may be frozen in memory.
  if (input.lastFetchOkAt !== null) {
    const clientAgeSec = (now - input.lastFetchOkAt) / 1000
    if (clientAgeSec > THRESHOLDS.disconnect_seconds) {
      return {
        state: 'DISCONNECTED',
        reason: `Last successful server fetch ${Math.round(clientAgeSec)}s ago — client may be offline or server unreachable`,
        snapshot_age_seconds: ageSeconds(p.snapshot_at, now),
        sources: p.source_status,
        server_build: p.server_build,
        client_build: clientBuild,
        build_mismatch: false,
      }
    }
  }

  const snapAge = ageSeconds(p.snapshot_at, now) ?? Infinity

  // Count source-level badness
  const staleSources: string[] = []
  const degradedSources: string[] = []
  for (const [id, info] of Object.entries(p.source_status)) {
    if (info.status === 'STALE') staleSources.push(id)
    else if (info.status === 'DEGRADED') degradedSources.push(id)
  }

  // STALE: snapshot too old, OR 2+ sources stale
  if (snapAge > THRESHOLDS.degraded_max || staleSources.length >= 2) {
    return {
      state: 'STALE',
      reason:
        snapAge > THRESHOLDS.degraded_max
          ? `Snapshot ${Math.round(snapAge)}s old (threshold ${THRESHOLDS.degraded_max}s)`
          : `${staleSources.length} sources stale: ${staleSources.join(', ')}`,
      snapshot_age_seconds: snapAge,
      sources: p.source_status,
      server_build: p.server_build,
      client_build: clientBuild,
      build_mismatch: false,
    }
  }

  // DEGRADED: moderate staleness or any source degraded/stale
  if (snapAge > THRESHOLDS.live_max || staleSources.length >= 1 || degradedSources.length >= 1) {
    const parts: string[] = []
    if (snapAge > THRESHOLDS.live_max) parts.push(`snapshot ${Math.round(snapAge)}s old`)
    if (staleSources.length) parts.push(`${staleSources.join(',')} stale`)
    if (degradedSources.length) parts.push(`${degradedSources.join(',')} degraded`)
    return {
      state: 'DEGRADED',
      reason: parts.join(' · '),
      snapshot_age_seconds: snapAge,
      sources: p.source_status,
      server_build: p.server_build,
      client_build: clientBuild,
      build_mismatch: false,
    }
  }

  return {
    state: 'LIVE',
    reason: `Snapshot ${Math.round(snapAge)}s old · all sources live · builds match`,
    snapshot_age_seconds: snapAge,
    sources: p.source_status,
    server_build: p.server_build,
    client_build: clientBuild,
    build_mismatch: false,
  }
}

function ageSeconds(iso: string | null, now: number): number | null {
  if (!iso) return null
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return null
  return (now - t) / 1000
}

function emptySources(): Record<SourceId, SourceInfo> {
  const empty: SourceInfo = { last_ok_at: null, age_seconds: null, status: 'UNKNOWN' }
  return { openmeteo: empty, metar: empty, wu: empty, polymarket: empty }
}

/**
 * Compute per-source status from a timestamp.
 * Used server-side when building the freshness payload.
 */
export function computeSourceStatus(lastOkAtIso: string | null, now: number = Date.now()): SourceInfo {
  if (!lastOkAtIso) return { last_ok_at: null, age_seconds: null, status: 'UNKNOWN' }
  const age = ageSeconds(lastOkAtIso, now)
  if (age === null) return { last_ok_at: lastOkAtIso, age_seconds: null, status: 'UNKNOWN' }
  let status: SourceStatus
  if (age <= THRESHOLDS.source_live_max) status = 'LIVE'
  else if (age <= THRESHOLDS.source_degraded_max) status = 'DEGRADED'
  else status = 'STALE'
  return { last_ok_at: lastOkAtIso, age_seconds: age, status }
}

/**
 * Returns true if trade-action buttons should be disabled for this state.
 *
 * v3.7.11: Trading is NEVER disabled by STALE or DISCONNECTED.
 *
 * Rationale: Weather forecast models update 4x/day (Z00/Z06/Z12/Z18). Data
 * that is technically "stale" by dashboard thresholds (>30 min) may still be
 * the most recent model run available — models don't update every 15 min.
 * Blocking trades on stale data is more harmful than allowing the operator to
 * judge freshness themselves using the model-schedule chip and DB write age
 * badges. The operator is the authority on when to trust the displayed data.
 *
 * VERSION_MISMATCH is the only state that warrants a hard disable: the client
 * is running a different code version than the server, meaning UI logic and
 * API responses may be structurally incompatible. A hard reload is required.
 *
 * STALE / DISCONNECTED: informational only. Operator decides. UI shows the
 * model schedule chip and last-known-good DB write timestamps as context.
 */
export function shouldDisableTradeActions(state: FreshnessState): boolean {
  return state === 'VERSION_MISMATCH'
}
