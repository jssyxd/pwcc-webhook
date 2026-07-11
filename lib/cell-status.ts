/**
 * v3.76.0 Layer 5 — fail-loud cell status resolver
 *
 * Pure function. Given cell context, returns either a value OR a badge.
 * Never returns silent blank / dash. Every cell on the trading dashboard
 * either shows a number or tells the user WHY it cannot.
 *
 * Designed per GPT-5.4 review: column-aware, explicit precedence, deterministic
 * bounds (no seasonality), tooltip-friendly.
 */

export type CellType = 'model_forecast' | 'metar_observation' | 'polymarket_bucket' | 'ensemble' | 'wu_current'

export type BadgeCode =
  | 'AWAITING_FIRST_RUN'
  | 'SOURCE_FETCH_FAILED'
  | 'NO_MARKET'
  | 'STATION_DELAYED'
  | 'STALE_CRON'
  | 'OUT_OF_RANGE'

export interface Badge {
  code: BadgeCode
  label: string
  color: 'blue' | 'amber' | 'red' | 'gray'
  tooltip: string
}

export interface CellStatus {
  value: number | null
  badge: Badge | null
}

export interface CellInput {
  value: number | null
  unit: 'C' | 'F'
  updatedAt?: string | null
  lastObsTime?: string | null
  stationIntervalMin?: number // per-station METAR cadence (default 30)
  cronCadenceMin?: number // cron schedule (default 15)
  cityHasMarket?: boolean // Polymarket market exists for this city?
  fetchFailed?: boolean // most recent fetch raised error
  // v3.76.4: when live value is null, show this fallback with STATION_DELAYED badge
  // instead of bare AWAITING_DATA. Lets operator see the last-known reading
  // while the station is slow instead of a blank screen.
  fallbackValue?: number | null
}

// Hard physical bounds. Deterministic, not seasonal.
const PHYS_MIN_C = -60
const PHYS_MAX_C = 60
const PHYS_MIN_F = -76
const PHYS_MAX_F = 140

// What badges are allowed for each column type. If resolver computes a badge
// not in the column's allow-list, it degrades to null (fall back to value or
// AWAITING_FIRST_RUN).
const COLUMN_ALLOWED: Record<CellType, Set<BadgeCode>> = {
  model_forecast: new Set(['OUT_OF_RANGE', 'STALE_CRON', 'SOURCE_FETCH_FAILED', 'AWAITING_FIRST_RUN']),
  metar_observation: new Set(['OUT_OF_RANGE', 'STATION_DELAYED', 'AWAITING_FIRST_RUN']),
  polymarket_bucket: new Set(['NO_MARKET', 'STALE_CRON', 'AWAITING_FIRST_RUN']),
  ensemble: new Set(['OUT_OF_RANGE', 'STALE_CRON', 'AWAITING_FIRST_RUN']),
  wu_current: new Set(['OUT_OF_RANGE', 'STATION_DELAYED', 'AWAITING_FIRST_RUN']),
}

// Precedence, highest to lowest. Higher-precedence badges win collisions.
const PRECEDENCE: BadgeCode[] = [
  'OUT_OF_RANGE',
  'NO_MARKET',
  'STATION_DELAYED',
  'STALE_CRON',
  'SOURCE_FETCH_FAILED',
  'AWAITING_FIRST_RUN',
]

function minutesSince(iso: string | null | undefined): number | null {
  if (!iso) return null
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return null
  return Math.round((Date.now() - t) / 60000)
}

function makeBadge(code: BadgeCode, input: CellInput): Badge {
  const ageMin = minutesSince(input.updatedAt)
  const obsAgeMin = minutesSince(input.lastObsTime)
  switch (code) {
    case 'OUT_OF_RANGE':
      return {
        code,
        label: 'OUT OF RANGE',
        color: 'red',
        tooltip: `Value ${input.value} violates physical bounds for ${input.unit} city. If you see this, forecast_current has tampered data — report immediately.`,
      }
    case 'NO_MARKET':
      return {
        code,
        label: 'NO MARKET',
        color: 'gray',
        tooltip:
          'No Polymarket market for this city. 14 of 41 cities have markets — the rest are monitored for context only.',
      }
    case 'STATION_DELAYED':
      return {
        code,
        label: `STATION DELAYED${obsAgeMin !== null ? ` ${obsAgeMin}min` : ''}`,
        color: 'amber',
        tooltip: `Last observation ${obsAgeMin ?? '?'} min ago. Expected cadence ${input.stationIntervalMin ?? 30} min. Station may be reporting slowly.`,
      }
    case 'STALE_CRON':
      return {
        code,
        label: `STALE ${ageMin ?? '?'}min`,
        color: 'amber',
        tooltip: `forecast_current.updated_at was ${ageMin ?? '?'} min ago. Expected within ${(input.cronCadenceMin ?? 15) * 2} min. Cron may be delayed.`,
      }
    case 'SOURCE_FETCH_FAILED':
      return {
        code,
        label: 'FETCH FAILED',
        color: 'amber',
        tooltip: 'Upstream Open-Meteo fetch failed on the last cron attempt. Will retry on next cycle.',
      }
    case 'AWAITING_FIRST_RUN':
      return {
        code,
        label: 'AWAITING DATA',
        color: 'blue',
        tooltip: 'Cron has not written this (city, model, target_date) yet. Auto-clears on next cron run.',
      }
  }
}

export function resolveCellStatus(cellType: CellType, input: CellInput): CellStatus {
  const allowed = COLUMN_ALLOWED[cellType]
  const candidates: BadgeCode[] = []

  // Evaluate all possible badges, then filter by column + precedence.
  if (input.value !== null && input.value !== undefined) {
    const physMin = input.unit === 'F' ? PHYS_MIN_F : PHYS_MIN_C
    const physMax = input.unit === 'F' ? PHYS_MAX_F : PHYS_MAX_C
    if (input.value < physMin || input.value > physMax) candidates.push('OUT_OF_RANGE')
  }

  if (cellType === 'polymarket_bucket' && input.cityHasMarket === false) {
    candidates.push('NO_MARKET')
  }

  if (cellType === 'metar_observation' || cellType === 'wu_current') {
    const obsAge = minutesSince(input.lastObsTime)
    const threshold = input.stationIntervalMin ?? 30
    // Station counts as delayed if last obs older than 2× expected cadence OR >45min for typical 30min stations
    if (obsAge !== null && obsAge > threshold * 2) {
      candidates.push('STATION_DELAYED')
    }
  }

  const cronAge = minutesSince(input.updatedAt)
  const cronThreshold = (input.cronCadenceMin ?? 15) * 2
  if (cronAge !== null && cronAge > cronThreshold) {
    candidates.push('STALE_CRON')
  }

  if (input.fetchFailed) candidates.push('SOURCE_FETCH_FAILED')

  if (input.value === null || input.value === undefined) {
    // v3.76.4: if we have a fallback last-known value for an observation column,
    // prefer STATION_DELAYED over AWAITING_FIRST_RUN so the operator sees the
    // cached reading + staleness badge instead of a blank "awaiting data".
    if (
      (cellType === 'metar_observation' || cellType === 'wu_current') &&
      input.fallbackValue !== null &&
      input.fallbackValue !== undefined
    ) {
      candidates.push('STATION_DELAYED')
    } else {
      candidates.push('AWAITING_FIRST_RUN')
    }
  }

  // Pick highest-precedence badge that's allowed for this column
  for (const code of PRECEDENCE) {
    if (candidates.includes(code) && allowed.has(code)) {
      // For STATION_DELAYED with fallback, return the fallback value alongside badge
      // so the renderer can show both. StatusCell shows badge but also receives value.
      const fallback = code === 'STATION_DELAYED' && input.value === null ? (input.fallbackValue ?? null) : null
      return { value: fallback, badge: makeBadge(code, input) }
    }
  }

  // No badges triggered — return the value
  return { value: input.value ?? null, badge: null }
}
