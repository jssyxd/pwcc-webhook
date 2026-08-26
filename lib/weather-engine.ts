import { CITY_IDS, STATION_REGISTRY, type CityKey } from './weather-cities'

/**
 * PWCC 实时观测引擎。
 *
 * 本模块有意不引入数据库：Vercel 函数重启或实例切换后，所有状态都会丢失。
 * 该约束由用户确认；本轮的 raw payload、去重状态、健康度和告警仅在当前
 * Node.js 实例的生命周期内可见。持久化适配器是下一个迭代事项。
 */

export const WEATHER_ENGINE_TIMEZONE = 'Asia/Shanghai'
export const XWEATHER_BATCH_SIZE = 5
export const XWEATHER_LOOKBACK_HOURS = 2
export const MAX_REPORT_AGE_SECONDS = 69 * 60
export const MAX_RUN_DURATION_MS = 60_000
export const RETRY_COUNT = 3
export const RETRY_DELAY_MS = 3_000
export const REQUEST_TIMEOUT_MS = 5_000
export const BASE_SCHEDULE_MINUTES = [0, 5, 11, 30, 35, 41] as const
export const SCHEDULE_MINUTES = [0, 2, 5, 7, 11, 13, 30, 32, 35, 37, 41, 43] as const

export type ObservationSource = 'xweather' | 'aviationweather' | 'xweather-webhook'
export type RunTrigger = 'cron' | 'manual' | 'webhook-fallback'
export type LogLevel = 'info' | 'warn' | 'error'

export interface NormalizedObservation {
  city: CityKey
  station: string
  source: ObservationSource
  observedAt: string
  receivedAt: string
  temperatureC: number | null
  temperatureF: number | null
  rawMetar: string | null
  confidence: number | null
  original: unknown
  ageSeconds: number
  fresh: boolean
  staleReason: string | null
  fields: {
    dewpointC: number | null
    windSpeedKt: number | null
    windDirectionDeg: number | null
    visibility: string | number | null
    pressureMb: number | null
    cloudCover: string | null
    clouds: Array<{ cover: string; base: number | null }>
    conditions: string | null
    flightCategory: string | null
  }
}

export interface RuntimeLog {
  at: string
  level: LogLevel
  event: string
  message: string
  context?: Record<string, unknown>
}

export interface RuntimeAlert {
  at: string
  code: string
  station?: string
  message: string
  context?: Record<string, unknown>
}

export interface SourceAttempt {
  source: 'xweather' | 'aviationweather'
  station: string
  outcome: 'accepted' | 'stale' | 'missing' | 'error'
  detail?: string
}

export interface RunSummary {
  id: string
  trigger: RunTrigger
  startedAt: string
  finishedAt: string
  scheduledSlot?: string
  skipped?: boolean
  skipReason?: string
  stationCount: number
  freshCount: number
  staleCount: number
  failedCount: number
  xweatherBatchCount: number
  xweatherCostHeaders: Array<Record<string, string>>
  sourceAttempts: SourceAttempt[]
}

export interface ScheduleWindow {
  eligible: boolean
  latenessSeconds: number
  slot: string | null
}

interface RuntimeStore {
  observations: Map<string, NormalizedObservation>
  dailyHighC: Map<string, { date: string; value: number }>
  logs: RuntimeLog[]
  alerts: RuntimeAlert[]
  recentRaw: Array<{ at: string; source: ObservationSource; station: string; payload: unknown }>
  lastRun: RunSummary | null
  startedAt: string
}

declare global {
  // eslint-disable-next-line no-var
  var __pwccWeatherRuntime: RuntimeStore | undefined
}

function createRuntimeStore(): RuntimeStore {
  return {
    observations: new Map(),
    dailyHighC: new Map(),
    logs: [],
    alerts: [],
    recentRaw: [],
    lastRun: null,
    startedAt: new Date().toISOString(),
  }
}

function runtime(): RuntimeStore {
  if (!globalThis.__pwccWeatherRuntime) globalThis.__pwccWeatherRuntime = createRuntimeStore()
  return globalThis.__pwccWeatherRuntime
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null
}

function asNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) return Number(value)
  return null
}

function isoFromUnix(value: unknown): string | null {
  const seconds = asNumber(value)
  if (seconds === null) return null
  const milliseconds = seconds > 10_000_000_000 ? seconds : seconds * 1000
  const date = new Date(milliseconds)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

function safeIso(value: unknown, fallback: Date): string {
  const raw = asString(value)
  if (!raw) return fallback.toISOString()
  const date = new Date(raw)
  return Number.isNaN(date.getTime()) ? fallback.toISOString() : date.toISOString()
}

function ageSeconds(observedAt: string, now: Date): number {
  const timestamp = new Date(observedAt).getTime()
  if (Number.isNaN(timestamp)) return Number.POSITIVE_INFINITY
  return Math.max(0, Math.floor((now.getTime() - timestamp) / 1000))
}

function freshState(observedAt: string, now: Date): Pick<NormalizedObservation, 'ageSeconds' | 'fresh' | 'staleReason'> {
  const age = ageSeconds(observedAt, now)
  if (!Number.isFinite(age)) return { ageSeconds: age, fresh: false, staleReason: 'invalid observation timestamp' }
  if (age > MAX_REPORT_AGE_SECONDS) {
    return { ageSeconds: age, fresh: false, staleReason: `report age ${age}s exceeds ${MAX_REPORT_AGE_SECONDS}s threshold` }
  }
  return { ageSeconds: age, fresh: true, staleReason: null }
}

function pushLog(entry: RuntimeLog): void {
  const store = runtime()
  store.logs.unshift(entry)
  store.logs.splice(160)
}

function pushAlert(alert: RuntimeAlert): void {
  const store = runtime()
  store.alerts.unshift(alert)
  store.alerts.splice(160)
  pushLog({ at: alert.at, level: 'warn', event: alert.code, message: alert.message, context: alert.context })
}

function addRawPayload(source: ObservationSource, station: string, payload: unknown): void {
  const store = runtime()
  store.recentRaw.unshift({ at: new Date().toISOString(), source, station, payload })
  // 仅保留当前实例内最近的 100 个对象，避免无数据库部署的内存无限增长。
  store.recentRaw.splice(100)
}

function cityForStation(station: string): CityKey | null {
  const normalized = station.trim().toUpperCase()
  for (const city of CITY_IDS) {
    if (STATION_REGISTRY[city].station === normalized) return city
  }
  return null
}

function zonedDate(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: WEATHER_ENGINE_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}

function upsertObservation(observation: NormalizedObservation): void {
  const store = runtime()
  const existing = store.observations.get(observation.station)
  const incomingAt = new Date(observation.observedAt).getTime()
  const existingAt = existing ? new Date(existing.observedAt).getTime() : Number.NEGATIVE_INFINITY
  const sourceWinsTie = observation.source === 'xweather-webhook' && existing?.source !== 'xweather-webhook'

  if (!existing || incomingAt > existingAt || (incomingAt === existingAt && sourceWinsTie)) {
    store.observations.set(observation.station, observation)
  }

  if (observation.temperatureC !== null) {
    const date = zonedDate(new Date(observation.observedAt))
    const previous = store.dailyHighC.get(observation.station)
    const value = previous?.date === date ? Math.max(previous.value, observation.temperatureC) : observation.temperatureC
    store.dailyHighC.set(observation.station, { date, value })
  }
}

function chunks<T>(values: readonly T[], size: number): T[][] {
  const output: T[][] = []
  for (let index = 0; index < values.length; index += size) output.push(values.slice(index, index + size) as T[])
  return output
}

function headersOf(response: Response): Record<string, string> {
  const selected: Record<string, string> = {}
  for (const [name, value] of response.headers.entries()) {
    if (name.toLowerCase().startsWith('x-cost') || name.toLowerCase().startsWith('x-ratelimit')) selected[name] = value
  }
  return selected
}

async function fetchWithRetry(url: string, init: RequestInit, source: string): Promise<Response> {
  let lastError: unknown
  for (let attempt = 0; attempt <= RETRY_COUNT; attempt += 1) {
    try {
      const response = await fetch(url, { ...init, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS), cache: 'no-store' })
      if (response.ok || response.status === 204 || response.status < 500) return response
      lastError = new Error(`${source} HTTP ${response.status}`)
    } catch (error) {
      lastError = error
    }
    if (attempt < RETRY_COUNT) await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS))
  }
  throw lastError instanceof Error ? lastError : new Error(`${source} request failed`)
}

function normalizeXweatherEnvelope(payload: unknown): Record<string, unknown> | null {
  let candidate: unknown = payload
  const envelope = asRecord(candidate)
  if (envelope && 'response' in envelope) candidate = envelope.response
  if (Array.isArray(candidate)) candidate = candidate[0]
  const nested = asRecord(candidate)
  if (nested && 'response' in nested) {
    candidate = nested.response
    if (Array.isArray(candidate)) candidate = candidate[0]
  }
  return asRecord(candidate)
}

function normalizeXweatherObservation(station: string, payload: unknown, now: Date): NormalizedObservation | null {
  const city = cityForStation(station)
  const data = normalizeXweatherEnvelope(payload)
  if (!city || !data) return null

  const returnedStation = asString(data.id)?.toUpperCase()
  // 不允许供应商静默返回邻近站；这会改变 Polymarket 的结算站点。
  if (returnedStation && returnedStation !== station) return null

  const ob = asRecord(data.ob)
  if (!ob) return null
  const observedAt = safeIso(ob.dateTimeISO ?? isoFromUnix(ob.timestamp), now)
  const receivedAt = safeIso(ob.recDateTimeISO ?? isoFromUnix(ob.recTimestamp), now)
  const state = freshState(observedAt, now)
  const clouds = asArray(ob.clouds).map((item) => {
    const cloud = asRecord(item)
    return { cover: asString(cloud?.cover) ?? 'UNKNOWN', base: asNumber(cloud?.base) }
  })

  return {
    city,
    station,
    source: 'xweather',
    observedAt,
    receivedAt,
    temperatureC: asNumber(ob.tempC),
    temperatureF: asNumber(ob.tempF),
    rawMetar: asString(data.raw),
    confidence: asNumber(ob.trustFactor),
    original: payload,
    ...state,
    fields: {
      dewpointC: asNumber(ob.dewpointC),
      windSpeedKt: asNumber(ob.windSpeedKTS ?? ob.windKTS),
      windDirectionDeg: asNumber(ob.windDirDEG),
      visibility: asNumber(ob.visibilityMI) ?? asString(ob.visibilityMI),
      pressureMb: asNumber(ob.pressureMB),
      cloudCover: asString(ob.cloudsCoded),
      clouds,
      conditions: asString(ob.weatherShort ?? ob.weather),
      flightCategory: asString(ob.flightRule),
    },
  }
}

function xweatherCredentialsConfigured(): boolean {
  return Boolean(process.env.XWEATHER_CLIENT_ID && process.env.XWEATHER_CLIENT_SECRET)
}

async function fetchXweatherBatch(stations: readonly string[]): Promise<{ observations: NormalizedObservation[]; attempts: SourceAttempt[]; costHeaders: Record<string, string> }> {
  if (!xweatherCredentialsConfigured()) {
    return {
      observations: [],
      attempts: stations.map((station) => ({ source: 'xweather', station, outcome: 'error', detail: 'Xweather credentials are not configured' })),
      costHeaders: {},
    }
  }

  const url = new URL('https://data.api.xweather.com/batch')
  url.searchParams.set('client_id', process.env.XWEATHER_CLIENT_ID ?? '')
  url.searchParams.set('client_secret', process.env.XWEATHER_CLIENT_SECRET ?? '')
  // /observations 是官方的“最新”端点；其返回时间会再由 69 分钟硬阈值校验。
  // XWEATHER_LOOKBACK_HOURS 供回退 API 的 hours=2 使用。archive 端点按站点当地整日返回，
  // 不能作为严格的两小时窗口请求，因此不向 Xweather 发送未文档化参数。
  url.searchParams.set('requests', stations.map((station) => `/observations/${station}`).join(','))

  try {
    const response = await fetchWithRetry(url.toString(), { headers: { accept: 'application/json', 'user-agent': 'pwcc-weather-engine/1.0' } }, 'Xweather')
    const costHeaders = headersOf(response)
    if (!response.ok) {
      return {
        observations: [],
        attempts: stations.map((station) => ({ source: 'xweather', station, outcome: 'error', detail: `HTTP ${response.status}` })),
        costHeaders,
      }
    }
    const payload = (await response.json()) as unknown
    const envelopes = asArray(asRecord(payload)?.response)
    const now = new Date()
    const observations: NormalizedObservation[] = []
    const attempts: SourceAttempt[] = []

    stations.forEach((station, index) => {
      const raw = envelopes[index] ?? payload
      const observation = normalizeXweatherObservation(station, raw, now)
      addRawPayload('xweather', station, raw)
      if (!observation) {
        attempts.push({ source: 'xweather', station, outcome: 'missing', detail: 'no valid exact-station observation in batch response' })
      } else if (!observation.fresh) {
        observations.push(observation)
        attempts.push({ source: 'xweather', station, outcome: 'stale', detail: observation.staleReason ?? undefined })
      } else {
        observations.push(observation)
        attempts.push({ source: 'xweather', station, outcome: 'accepted' })
      }
    })
    return { observations, attempts, costHeaders }
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    return {
      observations: [],
      attempts: stations.map((station) => ({ source: 'xweather', station, outcome: 'error', detail })),
      costHeaders: {},
    }
  }
}

function normalizeAviationWeatherObservation(station: string, payload: unknown, now: Date): NormalizedObservation | null {
  const city = cityForStation(station)
  const data = asRecord(payload)
  if (!city || !data || asString(data.icaoId)?.toUpperCase() !== station) return null

  const observedAt = safeIso(data.reportTime ?? isoFromUnix(data.obsTime), now)
  const receivedAt = safeIso(data.receiptTime, now)
  const state = freshState(observedAt, now)
  const clouds = asArray(data.clouds).map((item) => {
    const cloud = asRecord(item)
    return { cover: asString(cloud?.cover) ?? 'UNKNOWN', base: asNumber(cloud?.base) }
  })

  const tempC = asNumber(data.temp)
  return {
    city,
    station,
    source: 'aviationweather',
    observedAt,
    receivedAt,
    temperatureC: tempC,
    temperatureF: tempC === null ? null : Math.round((tempC * 9) / 5 * 10 + 320) / 10,
    rawMetar: asString(data.rawOb),
    confidence: asNumber(data.qcField),
    original: payload,
    ...state,
    fields: {
      dewpointC: asNumber(data.dewp),
      windSpeedKt: asNumber(data.wspd),
      windDirectionDeg: asNumber(data.wdir),
      visibility: asString(data.visib) ?? asNumber(data.visib),
      pressureMb: asNumber(data.altim),
      cloudCover: asString(data.cover),
      clouds,
      conditions: null,
      flightCategory: asString(data.fltCat),
    },
  }
}

async function fetchAviationWeather(stations: readonly string[]): Promise<{ observations: NormalizedObservation[]; attempts: SourceAttempt[] }> {
  if (!stations.length) return { observations: [], attempts: [] }
  const url = new URL('https://aviationweather.gov/api/data/metar')
  url.searchParams.set('ids', stations.join(','))
  url.searchParams.set('format', 'json')
  url.searchParams.set('hours', String(XWEATHER_LOOKBACK_HOURS))

  try {
    const response = await fetchWithRetry(url.toString(), { headers: { accept: 'application/json', 'user-agent': 'pwcc-weather-engine/1.0 contact: local' } }, 'AviationWeather.gov')
    if (response.status === 204) return { observations: [], attempts: stations.map((station) => ({ source: 'aviationweather', station, outcome: 'missing', detail: '204 no content' })) }
    if (!response.ok) return { observations: [], attempts: stations.map((station) => ({ source: 'aviationweather', station, outcome: 'error', detail: `HTTP ${response.status}` })) }

    const payload = (await response.json()) as unknown
    const now = new Date()
    const byStation = new Map<string, NormalizedObservation>()
    for (const row of asArray(payload)) {
      const record = asRecord(row)
      const station = asString(record?.icaoId)?.toUpperCase()
      if (!station || !stations.includes(station)) continue
      const normalized = normalizeAviationWeatherObservation(station, row, now)
      if (!normalized) continue
      addRawPayload('aviationweather', station, row)
      const previous = byStation.get(station)
      if (!previous || new Date(normalized.observedAt).getTime() > new Date(previous.observedAt).getTime()) byStation.set(station, normalized)
    }

    const observations = [...byStation.values()]
    const attempts = stations.map((station) => {
      const observation = byStation.get(station)
      if (!observation) return { source: 'aviationweather' as const, station, outcome: 'missing' as const, detail: 'no exact-station METAR in 2-hour response' }
      if (!observation.fresh) return { source: 'aviationweather' as const, station, outcome: 'stale' as const, detail: observation.staleReason ?? undefined }
      return { source: 'aviationweather' as const, station, outcome: 'accepted' as const }
    })
    return { observations, attempts }
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    return { observations: [], attempts: stations.map((station) => ({ source: 'aviationweather', station, outcome: 'error', detail })) }
  }
}

function compareObservation(a: NormalizedObservation, b: NormalizedObservation): NormalizedObservation {
  const aTime = new Date(a.observedAt).getTime()
  const bTime = new Date(b.observedAt).getTime()
  if (aTime !== bTime) return aTime > bTime ? a : b
  // 同一 reportTime 时，API 版以 Xweather 作为主源；Webhook 版会在写入时优先 webhook。
  if (a.source === 'xweather' && b.source !== 'xweather') return a
  return b
}

export function getScheduleWindow(now: Date = new Date()): ScheduleWindow {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: WEATHER_ENGINE_TIMEZONE,
    hourCycle: 'h23',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(now)
  const value = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? '0')
  const minute = value('minute')
  const second = value('second')
  const candidates = [...SCHEDULE_MINUTES].filter((candidate) => candidate <= minute)
  const scheduledMinute = candidates.length ? candidates[candidates.length - 1] : SCHEDULE_MINUTES[SCHEDULE_MINUTES.length - 1] - 60
  const latenessSeconds = (minute - scheduledMinute) * 60 + second
  const hour = value('hour')
  const slotHour = scheduledMinute < 0 ? (hour + 23) % 24 : hour
  const slotMinute = (scheduledMinute + 60) % 60
  return {
    eligible: latenessSeconds >= 0 && latenessSeconds <= 5 * 60,
    latenessSeconds,
    slot: `${String(slotHour).padStart(2, '0')}:${String(slotMinute).padStart(2, '0')}`,
  }
}

export async function runPolling(options: { stations?: readonly string[]; trigger?: RunTrigger; scheduledSlot?: string } = {}): Promise<RunSummary> {
  const started = new Date()
  const stations = [...new Set(options.stations ?? CITY_IDS.map((city) => STATION_REGISTRY[city].station))]
  const trigger = options.trigger ?? 'manual'
  const xweatherBatches = chunks(stations, XWEATHER_BATCH_SIZE)
  const sourceAttempts: SourceAttempt[] = []
  const xweatherCostHeaders: Array<Record<string, string>> = []
  const xweatherObservations: NormalizedObservation[] = []

  pushLog({ at: started.toISOString(), level: 'info', event: 'poll_started', message: `Starting ${trigger} poll for ${stations.length} exact ICAO stations`, context: { stations } })

  const batchResults = await Promise.all(xweatherBatches.map((batch) => fetchXweatherBatch(batch)))
  for (const result of batchResults) {
    xweatherObservations.push(...result.observations)
    sourceAttempts.push(...result.attempts)
    if (Object.keys(result.costHeaders).length) xweatherCostHeaders.push(result.costHeaders)
  }

  const xweatherByStation = new Map(xweatherObservations.map((observation) => [observation.station, observation]))
  const fallbackStations = stations.filter((station) => !xweatherByStation.get(station)?.fresh)
  const fallback = await fetchAviationWeather(fallbackStations)
  sourceAttempts.push(...fallback.attempts)
  const fallbackByStation = new Map(fallback.observations.map((observation) => [observation.station, observation]))

  let freshCount = 0
  let staleCount = 0
  let failedCount = 0
  for (const station of stations) {
    const xweather = xweatherByStation.get(station)
    const aviationWeather = fallbackByStation.get(station)
    const selected = xweather && aviationWeather ? compareObservation(xweather, aviationWeather) : xweather ?? aviationWeather
    if (!selected) {
      failedCount += 1
      pushAlert({ at: new Date().toISOString(), code: 'station_unavailable', station, message: `${station} has no usable Xweather or AviationWeather.gov observation`, context: { trigger } })
      continue
    }
    upsertObservation(selected)
    if (selected.fresh) freshCount += 1
    else {
      staleCount += 1
      pushAlert({ at: new Date().toISOString(), code: 'station_stale', station, message: `${station} retained latest stale report`, context: { source: selected.source, observedAt: selected.observedAt, ageSeconds: selected.ageSeconds } })
    }
  }

  const finished = new Date()
  const duration = finished.getTime() - started.getTime()
  if (duration > MAX_RUN_DURATION_MS) {
    pushAlert({ at: finished.toISOString(), code: 'run_duration_exceeded', message: `Polling run exceeded ${MAX_RUN_DURATION_MS}ms`, context: { duration } })
  }

  const summary: RunSummary = {
    id: `poll-${started.getTime()}`,
    trigger,
    startedAt: started.toISOString(),
    finishedAt: finished.toISOString(),
    scheduledSlot: options.scheduledSlot,
    stationCount: stations.length,
    freshCount,
    staleCount,
    failedCount,
    xweatherBatchCount: xweatherBatches.length,
    xweatherCostHeaders,
    sourceAttempts,
  }
  runtime().lastRun = summary
  pushLog({ at: finished.toISOString(), level: failedCount ? 'warn' : 'info', event: 'poll_finished', message: `Poll complete: ${freshCount} fresh, ${staleCount} stale, ${failedCount} unavailable`, context: { duration, xweatherBatchCount: xweatherBatches.length } })
  return summary
}

export function acceptWebhookObservation(observation: NormalizedObservation, eventId: string): { accepted: boolean; reason?: string } {
  const current = runtime().observations.get(observation.station)
  if (current) {
    const nextTime = new Date(observation.observedAt).getTime()
    const currentTime = new Date(current.observedAt).getTime()
    if (nextTime < currentTime) return { accepted: false, reason: 'older reportTime than existing observation' }
    if (nextTime === currentTime && current.source === 'xweather-webhook') return { accepted: false, reason: 'duplicate reportTime from webhook' }
  }
  upsertObservation(observation)
  addRawPayload('xweather-webhook', observation.station, observation.original)
  pushLog({ at: new Date().toISOString(), level: 'info', event: 'webhook_accepted', message: `Accepted webhook event ${eventId} for ${observation.station}`, context: { observedAt: observation.observedAt } })
  return { accepted: true }
}

function displayTemperature(observation: NormalizedObservation | undefined, unit: 'C' | 'F'): number | null {
  if (!observation) return null
  return unit === 'C' ? observation.temperatureC : observation.temperatureF
}

function displayHigh(city: CityKey, unit: 'C' | 'F'): number | null {
  const station = STATION_REGISTRY[city].station
  const high = runtime().dailyHighC.get(station)
  if (!high) return null
  return unit === 'C' ? high.value : Math.round((high.value * 9) / 5 * 10 + 320) / 10
}

function localClock(now: Date): { date: string; time: string; hour: number } {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: WEATHER_ENGINE_TIMEZONE,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(now)
  const part = (type: string) => parts.find((entry) => entry.type === type)?.value ?? '00'
  return { date: `${part('year')}-${part('month')}-${part('day')}`, time: `${part('hour')}:${part('minute')}`, hour: Number(part('hour')) }
}

export function buildLiveWeatherReport(now: Date = new Date()) {
  const store = runtime()
  const cities = CITY_IDS.map((city) => {
    const entry = STATION_REGISTRY[city]
    const observation = store.observations.get(entry.station)
    const currentTemp = displayTemperature(observation, entry.unit)
    const dayHigh = displayHigh(city, entry.unit)
    return {
      city,
      station: entry.station,
      unit: entry.unit,
      currentTemp,
      dayHigh,
      dataSource: observation?.source ?? 'UNAVAILABLE',
      obsCount: observation ? 1 : 0,
      ecmwf: null,
      gfs: null,
      icon: null,
      gem: null,
      jma: null,
      ensemble: null,
      spread: null,
      gap: currentTemp !== null && dayHigh !== null ? Math.round((dayHigh - currentTemp) * 10) / 10 : null,
      bestModel: null,
      bestModelWR: null,
      bestModelTemp: null,
    }
  })
  return { timestamp: now.toISOString(), cities }
}

export function buildLiveWeatherIntel(now: Date = new Date()) {
  const store = runtime()
  const clock = localClock(now)
  const cities = CITY_IDS.map((city) => {
    const entry = STATION_REGISTRY[city]
    const observation = store.observations.get(entry.station)
    const unit = entry.unit
    const currentTemp = displayTemperature(observation, unit)
    const runningHigh = displayHigh(city, unit)
    return {
      city,
      station: entry.station,
      unit,
      timezone: WEATHER_ENGINE_TIMEZONE,
      localTime: clock.time,
      localHour: clock.hour,
      currentTemp,
      runningHigh,
      v1ArchiveHigh: null,
      v3LiveCurrent: null,
      metarPeak: runningHigh,
      obsCount: observation ? 1 : 0,
      highIsDeclining: false,
      hoursSincePeak: null,
      peakHourLocal: null,
      peakMinuteLocal: null,
      trendLabel: observation?.fresh ? 'Live observation' : observation ? 'Stale observation' : 'Awaiting observation',
      wuLink: entry.wuHistoryUrlTemplate,
      weatherComLink: null,
      resolutionLink: entry.wuHistoryUrlTemplate,
      resolutionSource: 'METAR',
      polymarketUrl: null,
      ecmwf: null,
      gfs: null,
      icon: null,
      gem: null,
      jma: null,
      ensemble: null,
      spread: null,
      bestModel: null,
      bestModelWR: null,
      bestModelTemp: null,
      activeBuckets: [],
      liveMarkets: 0,
      totalMarkets: 0,
      recommendation: 'WATCH' as const,
      recommendationReason: 'Real-time observation ingestion only; no forecast/trading model is enabled in this standalone engine.',
      signalConfidence: observation?.fresh ? ('LOW' as const) : ('LOW' as const),
      metarHigh: runningHigh,
      metarCurrent: currentTemp,
      metarLastObsTime: observation?.observedAt ?? null,
      metarObsIntervalMin: null,
      decodedMetar: observation
        ? {
            temp: currentTemp,
            dewpoint: observation.fields.dewpointC,
            windSpeed: observation.fields.windSpeedKt,
            windDirection: observation.fields.windDirectionDeg,
            windGust: null,
            visibility: typeof observation.fields.visibility === 'number' ? observation.fields.visibility : null,
            pressure: observation.fields.pressureMb,
            cloudCover: observation.fields.cloudCover,
            clouds: observation.fields.clouds.map((cloud) => ({ cover: cloud.cover, base: cloud.base ?? 0 })),
            conditions: observation.fields.conditions,
            rawMetar: observation.rawMetar,
            obsTime: observation.observedAt,
            fltCat: observation.fields.flightCategory,
          }
        : null,
      observationPipeline: observation
        ? {
            source: observation.source,
            observedAt: observation.observedAt,
            receivedAt: observation.receivedAt,
            ageSeconds: observation.ageSeconds,
            fresh: observation.fresh,
            staleReason: observation.staleReason,
            confidence: observation.confidence,
          }
        : { source: null, observedAt: null, receivedAt: null, ageSeconds: null, fresh: false, staleReason: 'no observation in current instance', confidence: null },
    }
  })

  const ages = [...store.observations.values()].map((observation) => observation.ageSeconds)
  const oldestAge = ages.length ? Math.max(...ages) : null
  const status = oldestAge === null ? 'STALE' : oldestAge <= MAX_REPORT_AGE_SECONDS ? 'LIVE' : 'STALE'
  return {
    timestamp: now.toISOString(),
    cities,
    metarReliability: {},
    snipePlaybook: { activePhase: 'observation-only', topPlays: [] },
    pennyBidBoard: null,
    phoneEnabled: false,
    edgeLastUpdate: store.lastRun?.finishedAt ?? null,
    hongKongMultiStation: null,
    freshness: {
      server_build: 'pwcc-weather-engine',
      response_generated_at: now.toISOString(),
      snapshot_at: store.lastRun?.finishedAt ?? null,
      oldest_component_updated_at: oldestAge === null ? null : new Date(now.getTime() - oldestAge * 1000).toISOString(),
      source_status: {
        metar: {
          last_ok_at: store.lastRun?.finishedAt ?? null,
          age_seconds: oldestAge,
          status,
          slowest_context: cities.find((city) => city.observationPipeline.ageSeconds === oldestAge)?.station ?? null,
        },
        xweather: {
          last_ok_at: store.lastRun?.finishedAt ?? null,
          age_seconds: oldestAge,
          status: xweatherCredentialsConfigured() ? status : 'ERROR',
          error: xweatherCredentialsConfigured() ? null : 'XWEATHER_CLIENT_ID and XWEATHER_CLIENT_SECRET are not configured',
        },
        aviationweather: {
          last_ok_at: store.lastRun?.finishedAt ?? null,
          age_seconds: oldestAge,
          status,
        },
      },
    },
  }
}

export function getWeatherRuntimeHealth(now: Date = new Date()) {
  const store = runtime()
  const expectedBatchesPerRun = Math.ceil(CITY_IDS.length / XWEATHER_BATCH_SIZE)
  const expectedRunsPerDay = SCHEDULE_MINUTES.length * 24
  const projectedMonthlyNetworkRequests = expectedBatchesPerRun * expectedRunsPerDay * 30
  return {
    generatedAt: now.toISOString(),
    storage: {
      mode: 'ephemeral-memory',
      persistence: 'disabled-by-user-for-this-round',
      instanceStartedAt: store.startedAt,
      note: 'Logs, raw payloads and observations are lost on Vercel cold start or instance replacement.',
    },
    schedule: {
      timezone: WEATHER_ENGINE_TIMEZONE,
      baseMinutes: BASE_SCHEDULE_MINUTES,
      offsetMinutes: 2,
      effectiveMinutes: SCHEDULE_MINUTES,
      maxAllowedLatenessSeconds: 300,
    },
    thresholds: { maxReportAgeSeconds: MAX_REPORT_AGE_SECONDS, xweatherLookbackHours: XWEATHER_LOOKBACK_HOURS, maxRunDurationMs: MAX_RUN_DURATION_MS },
    xweather: {
      configured: xweatherCredentialsConfigured(),
      maxBatchSize: XWEATHER_BATCH_SIZE,
      expectedBatchesPerRun,
      projectedMonthlyNetworkRequests,
      warning: projectedMonthlyNetworkRequests > 15_000 ? 'Configured batch size and schedule can exceed 15,000 monthly HTTP requests if each batch is billed as one access; inspect X-Cost-* headers and dashboard usage before enabling production cron.' : null,
      lastCostHeaders: store.lastRun?.xweatherCostHeaders ?? [],
    },
    observations: Object.fromEntries([...store.observations.entries()].map(([station, observation]) => [station, {
      city: observation.city,
      source: observation.source,
      observedAt: observation.observedAt,
      receivedAt: observation.receivedAt,
      ageSeconds: observation.ageSeconds,
      fresh: observation.fresh,
      staleReason: observation.staleReason,
    }])),
    latestRun: store.lastRun,
    alerts: store.alerts,
    logs: store.logs,
    recentRawPayloads: store.recentRaw,
  }
}

export function isWeatherEngineEnabled(): boolean {
  return process.env.WEATHER_ENGINE_ENABLED === '1'
}

export function getEnginePayload(type: string): unknown | undefined {
  if (type === 'weather-report') return buildLiveWeatherReport()
  if (type === 'weather-intel') return buildLiveWeatherIntel()
  if (type === 'weather-health') return getWeatherRuntimeHealth()
  return undefined
}

export function normalizeWebhookPayload(station: string, payload: unknown, now: Date = new Date()): NormalizedObservation | null {
  // Xweather Webhooks deliver the same format as Weather API. Reuse the strict
  // exact-station normalizer, then mark source as webhook for same-timestamp priority.
  const normalized = normalizeXweatherObservation(station, payload, now)
  return normalized ? { ...normalized, source: 'xweather-webhook' } : null
}

export function stationCodes(): string[] {
  return CITY_IDS.map((city) => STATION_REGISTRY[city].station)
}

/** Returns only stations without a fresh webhook event in the prior 120 minutes. */
export function webhookSilentStations(now: Date = new Date(), silentAfterMinutes = 120): string[] {
  const silentAfterSeconds = silentAfterMinutes * 60
  const store = runtime()
  return stationCodes().filter((station) => {
    const observation = store.observations.get(station)
    if (!observation || observation.source !== 'xweather-webhook') return true
    return ageSeconds(observation.observedAt, now) > silentAfterSeconds
  })
}
