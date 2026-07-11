'use client'

/**
 * Phase 02.20 (v3.78.0) — Live Observations Panel.
 *
 * Sits below FreshnessBar on /brain/trading. Polls
 * /api/brain/trading/live-observations every 20 seconds and:
 *
 *   1. Renders a freshness chip per city showing the most recent
 *      sub-20-min reading and how stale it is.
 *   2. Cross-references those readings against the active buckets
 *      passed in from the page state. If any bucket is "guaranteed NO"
 *      under the live reading (live > top + 0.5°C, NO < 99¢), it
 *      fires a red "NO LOCKED" chip + sound + browser notification.
 *
 * The panel is read-only: no mutation of trading state, no automated
 * trade submission. the operator trades manually after seeing the chip.
 *
 * Debounce: one alert per (city × bucketLabel) per local day, kept in
 * localStorage so it survives a page refresh.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

const POLL_INTERVAL_MS = 20_000
// METAR quiet-hour windows can leave a city 45-55 min between routine publishes
// (airports that only tick at :00). 90-min window covers every worst case and
// still lets the panel display a stale reading with an age badge so the user
// knows they're not dead — they're just between cycles.
const ENDPOINT = '/api/brain/trading/live-observations?max_age_min=90'

type ObservationSource = 'synoptic_hf_asos' | 'awc_metar' | 'hko_1min' | 'nea_sg' | 'asos_phone'

interface CityReading {
  temp_c: number
  source: ObservationSource
  station: string
  report_type: string
  obs_time: string
  fetched_at: string
  age_seconds: number
}

interface ApiResponse {
  fetched_at: string
  cities: Record<string, CityReading>
}

export interface BucketLite {
  /** Display label like "between 16-17°C" or "between 65-66°F" */
  label: string
  /** Bucket top in the city's display unit (F for US, C for everyone else) */
  upper: number
  /** Current Polymarket NO price, 0..1 */
  noPrice: number
}

export interface CityCardLite {
  /** city slug */
  slug: string
  /** display label (eg "NYC", "Hong Kong") */
  displayName: string
  /** display unit */
  unit: 'F' | 'C'
  /** active (un-killed) buckets only */
  activeBuckets: BucketLite[]
}

interface Props {
  cityCards: CityCardLite[]
}

interface GnSignal {
  city: string
  cityDisplay: string
  bucketLabel: string
  bucketTop: number
  observed: number
  unit: 'F' | 'C'
  noPrice: number
  source: ObservationSource
  station: string
  obsAgeSeconds: number
  obsTime: string
}

const SOURCE_LABEL: Record<ObservationSource, string> = {
  synoptic_hf_asos: 'Synoptic HF',
  awc_metar: 'AWC METAR',
  hko_1min: 'HKO 1-min',
  nea_sg: 'NEA SG',
  asos_phone: 'ASOS phone',
}

function celsiusToDisplay(c: number, unit: 'F' | 'C'): number {
  return unit === 'F' ? Math.round(((c * 9) / 5 + 32) * 100) / 100 : Math.round(c * 100) / 100
}

/** +0.5°C ASOS tolerance, in the bucket's display unit. */
function marginInUnit(unit: 'F' | 'C'): number {
  return unit === 'F' ? 0.9 : 0.5
}

function todayLocalISO(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function debounceKey(city: string, bucketLabel: string): string {
  return `gn-alerted:${todayLocalISO()}:${city}:${bucketLabel}`
}

function alreadyAlerted(city: string, bucketLabel: string): boolean {
  if (typeof window === 'undefined') return false
  try {
    return window.localStorage.getItem(debounceKey(city, bucketLabel)) === '1'
  } catch {
    return false
  }
}

function markAlerted(city: string, bucketLabel: string): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(debounceKey(city, bucketLabel), '1')
  } catch {
    /* localStorage full or disabled — degrade gracefully, alerts may repeat */
  }
}

function playAlertSound(): void {
  if (typeof window === 'undefined') return
  try {
    const W = window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }
    const Ctx = W.AudioContext || W.webkitAudioContext
    if (!Ctx) return
    const ctx = new Ctx()
    const tones = [880, 1320] // ascending two-tone
    let t = ctx.currentTime
    for (const f of tones) {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.value = f
      gain.gain.setValueAtTime(0.0001, t)
      gain.gain.exponentialRampToValueAtTime(0.18, t + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.18)
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(t)
      osc.stop(t + 0.2)
      t += 0.18
    }
    setTimeout(() => ctx.close().catch(() => {}), 800)
  } catch {
    /* audio not allowed — ignore */
  }
}

function fireNotification(signal: GnSignal): void {
  if (typeof window === 'undefined') return
  if (typeof Notification === 'undefined') return
  if (Notification.permission !== 'granted') return
  const obsDisp = celsiusToDisplay(signal.observed, signal.unit)
  try {
    new Notification(`NO LOCKED — ${signal.cityDisplay} ${signal.bucketLabel}`, {
      body: `${signal.source.replace('_', ' ')} ${signal.station}: ${obsDisp}°${signal.unit} > ${signal.bucketTop}°${signal.unit}. Market NO ${(signal.noPrice * 100).toFixed(0)}¢.`,
      icon: '/favicon.ico',
      tag: `gn-${signal.city}-${signal.bucketLabel}`,
    })
  } catch {
    /* notification API may throw on rare browsers */
  }
}

function detectGn(reading: CityReading, card: CityCardLite, now: number): GnSignal[] {
  const out: GnSignal[] = []
  const ageMs = now - Date.parse(reading.obs_time)
  if (!Number.isFinite(ageMs) || ageMs > 20 * 60_000 || ageMs < -60_000) return out
  const obsInUnit = celsiusToDisplay(reading.temp_c, card.unit)
  const margin = marginInUnit(card.unit)
  for (const b of card.activeBuckets) {
    if (!Number.isFinite(b.upper)) continue
    if (b.noPrice >= 0.99) continue
    if (obsInUnit - b.upper > margin) {
      out.push({
        city: card.slug,
        cityDisplay: card.displayName,
        bucketLabel: b.label,
        bucketTop: b.upper,
        observed: reading.temp_c,
        unit: card.unit,
        noPrice: b.noPrice,
        source: reading.source,
        station: reading.station,
        obsAgeSeconds: reading.age_seconds,
        obsTime: reading.obs_time,
      })
    }
  }
  return out
}

export default function LiveObservationsPanel({ cityCards }: Props) {
  const [data, setData] = useState<ApiResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [signals, setSignals] = useState<GnSignal[]>([])
  const [notifAsked, setNotifAsked] = useState(false)
  const lastFetchedAt = useRef<number>(0)

  const fetchOnce = useCallback(async () => {
    try {
      const res = await fetch(ENDPOINT, { cache: 'no-store' })
      if (!res.ok) {
        setError(`HTTP ${res.status}`)
        return
      }
      const body = (await res.json()) as ApiResponse
      setData(body)
      setError(null)
      lastFetchedAt.current = Date.now()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }, [])

  // Initial + interval polling
  useEffect(() => {
    fetchOnce()
    const id = window.setInterval(fetchOnce, POLL_INTERVAL_MS)
    return () => window.clearInterval(id)
  }, [fetchOnce])

  // Recompute signals whenever data or cityCards change
  useEffect(() => {
    if (!data) return
    const now = Date.now()
    const fresh: GnSignal[] = []
    for (const card of cityCards) {
      const reading = data.cities[card.slug]
      if (!reading) continue
      fresh.push(...detectGn(reading, card, now))
    }
    setSignals(fresh)

    // Fire alerts for any newly-detected GN that isn't debounced for today.
    for (const s of fresh) {
      if (alreadyAlerted(s.city, s.bucketLabel)) continue
      markAlerted(s.city, s.bucketLabel)
      playAlertSound()
      fireNotification(s)
    }
  }, [data, cityCards])

  // Browser notification permission ask (one-shot per session)
  useEffect(() => {
    if (notifAsked) return
    if (typeof Notification === 'undefined') return
    if (Notification.permission !== 'default') return
    setNotifAsked(true)
  }, [notifAsked])

  const onEnableNotifications = () => {
    if (typeof Notification === 'undefined') return
    Notification.requestPermission().catch(() => {})
  }

  const sourceCounts = useMemo(() => {
    if (!data) return {}
    const map: Record<string, number> = {}
    for (const r of Object.values(data.cities)) {
      map[r.source] = (map[r.source] ?? 0) + 1
    }
    return map
  }, [data])

  const cityCount = data ? Object.keys(data.cities).length : 0

  return (
    <div className="rounded-xl border border-cyan-500/20 bg-slate-900/60 p-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 text-xs">
          <span className="inline-flex items-center gap-1 text-cyan-300">
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
            <span className="font-semibold uppercase tracking-wider">Live Observations</span>
          </span>
          <span className="text-gray-500">·</span>
          <span className="text-gray-400">
            {cityCount}/{cityCards.length} cities reporting
          </span>
          {Object.keys(sourceCounts).length > 0 && (
            <>
              <span className="text-gray-500">·</span>
              <span className="text-gray-500">
                {Object.entries(sourceCounts)
                  .map(([s, n]) => `${SOURCE_LABEL[s as ObservationSource] ?? s}:${n}`)
                  .join(' ')}
              </span>
            </>
          )}
          {error && (
            <>
              <span className="text-gray-500">·</span>
              <span className="text-red-400">err: {error}</span>
            </>
          )}
        </div>
        {typeof Notification !== 'undefined' && Notification.permission === 'default' && (
          <button
            onClick={onEnableNotifications}
            className="px-2 py-1 rounded bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-300 text-[10px] font-medium"
          >
            Enable browser alerts
          </button>
        )}
      </div>

      {/* GN signal strip — only render when there are firing signals */}
      {signals.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {signals.map((s) => {
            const obsDisp = celsiusToDisplay(s.observed, s.unit)
            return (
              <div
                key={`${s.city}-${s.bucketLabel}`}
                className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-red-500/15 border border-red-500/40 text-red-200 text-xs animate-pulse"
                title={`${SOURCE_LABEL[s.source]} ${s.station} — obs ${s.obsAgeSeconds}s old`}
              >
                <span className="font-bold uppercase tracking-wider text-red-300">NO LOCKED</span>
                <span className="text-red-100/90">
                  {s.cityDisplay} {s.bucketLabel}
                </span>
                <span className="text-red-300/80">
                  · {obsDisp}°{s.unit} &gt; {s.bucketTop}°{s.unit}
                </span>
                <span className="text-red-200 font-semibold">· NO {(s.noPrice * 100).toFixed(0)}¢</span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
