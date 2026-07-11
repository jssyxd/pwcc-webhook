'use client'

/**
 * Phase 02.21 (v3.93.0) — Sniper Intel strip.
 *
 * Renders a single-row edge-capture panel inside each expanded city card.
 * Signals (left → right):
 *   1. Peak Today        — WU v1 hourly max
 *   2. Current + trend   — latest obs + rising/steady/falling/crashing arrow
 *   3. METAR Intent      — next-2hr BECMG/TEMPO TSRA/SH/FG/BR event + minutes
 *   4. Time-to-peak      — typical diurnal hours-until-peak (or "peak behind")
 *
 * Fetches GET /api/brain/trading/city-intel/[city] on mount + on a 2-min
 * poll (METAR cadence ≈ 5 min, WU v1 refresh ≈ 5-15 min, so 2-min polling
 * is friendly). Intentionally independent of the existing 60s weather-intel
 * poll so the strip updates smoothly without refetching everything.
 */

import { useEffect, useRef, useState } from 'react'

interface WUObs {
  tsUTC: number
  temp: number
}
interface WUAnalysis {
  station: string
  unit: 'C' | 'F'
  obs: WUObs[]
  peak: number | null
  current: number | null
  deltaFromPeak: number | null
  trend: 'rising' | 'steady' | 'falling' | 'crashing' | null
  hoursSincePeak: number | null
  peakAtISO: string | null
}
interface MetarIntent {
  phenomenon: string
  kind: 'BECMG' | 'TEMPO'
  minutesUntil: number | null
  label: string
  severity: 'high' | 'medium' | 'low'
  raw: string
}
interface IntelResponse {
  city: string
  station: string
  unit: 'C' | 'F'
  fetchedAt: string
  wu: WUAnalysis
  metarIntent: MetarIntent | null
  metarRaw: string | null
  metarObsTimeISO: string | null
  localHour: number
  typicalPeakLocalHour: number
  hoursUntilTypicalPeak: number | null
}

interface Props {
  city: string
  displayUnit?: 'C' | 'F'
}

const POLL_INTERVAL_MS = 120_000 // 2 minutes

function fmt(val: number | null, unit: 'C' | 'F'): string {
  if (val === null || val === undefined) return '—'
  return `${val.toFixed(1)}°${unit}`
}

function trendArrow(trend: WUAnalysis['trend']): { icon: string; color: string; label: string } {
  switch (trend) {
    case 'rising':
      return { icon: '▲', color: 'text-emerald-400', label: 'Rising' }
    case 'steady':
      return { icon: '▬', color: 'text-gray-400', label: 'Steady' }
    case 'falling':
      return { icon: '▼', color: 'text-amber-400', label: 'Falling' }
    case 'crashing':
      return { icon: '⇊', color: 'text-red-400', label: 'Crashing' }
    default:
      return { icon: '·', color: 'text-gray-600', label: '—' }
  }
}

function intentBadge(intent: MetarIntent | null): {
  text: string
  color: string
  title: string
} | null {
  if (!intent) return null
  const timeTxt =
    intent.minutesUntil === null
      ? 'active'
      : intent.minutesUntil <= 0
        ? 'now'
        : intent.minutesUntil < 60
          ? `~${intent.minutesUntil}m`
          : `~${(intent.minutesUntil / 60).toFixed(1)}h`
  const color =
    intent.severity === 'high'
      ? 'bg-red-500/15 text-red-300 border-red-500/40'
      : intent.severity === 'medium'
        ? 'bg-amber-500/15 text-amber-300 border-amber-500/40'
        : 'bg-blue-500/15 text-blue-300 border-blue-500/40'
  return {
    text: `⚠ ${intent.label} ${timeTxt}`,
    color,
    title: `${intent.kind} ${intent.phenomenon} — raw: ${intent.raw}`,
  }
}

export default function SniperIntelStrip({ city, displayUnit }: Props) {
  const [data, setData] = useState<IntelResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    const load = async () => {
      try {
        const res = await fetch(`/api/brain/trading/city-intel/${encodeURIComponent(city)}`, {
          cache: 'no-store',
        })
        if (!res.ok) {
          if (mountedRef.current) {
            setError(`HTTP ${res.status}`)
            setLoading(false)
          }
          return
        }
        const j = (await res.json()) as IntelResponse
        if (mountedRef.current) {
          setData(j)
          setError(null)
          setLoading(false)
        }
      } catch (e) {
        if (mountedRef.current) {
          setError(e instanceof Error ? e.message : 'fetch failed')
          setLoading(false)
        }
      }
    }
    load()
    const interval = setInterval(load, POLL_INTERVAL_MS)
    return () => {
      mountedRef.current = false
      clearInterval(interval)
    }
  }, [city])

  if (loading && !data) {
    return (
      <div className="mb-3 px-3 py-2 rounded-md border border-white/[0.06] bg-white/[0.02] text-[10px] text-gray-500 font-mono">
        Loading sniper intel…
      </div>
    )
  }
  if (error && !data) {
    return (
      <div className="mb-3 px-3 py-2 rounded-md border border-red-500/20 bg-red-500/[0.04] text-[10px] text-red-400/80 font-mono">
        Sniper intel unavailable ({error}). Strip self-heals on next 2-min poll.
      </div>
    )
  }
  if (!data) return null

  const unit = displayUnit ?? data.unit
  const { wu, metarIntent } = data
  const arrow = trendArrow(wu.trend)
  const badge = intentBadge(metarIntent)

  const peakAt = wu.peakAtISO
    ? new Date(wu.peakAtISO).toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      })
    : null

  return (
    <div className="mb-3 px-3 py-2 rounded-md border border-cyan-500/20 bg-cyan-500/[0.04] flex items-center gap-3 flex-wrap text-[11px] font-mono">
      {/* Peak Today */}
      <div className="flex items-center gap-1.5" title={peakAt ? `Peak recorded at ${peakAt} UTC` : 'WU v1 hourly max'}>
        <span className="text-[9px] uppercase tracking-wider text-cyan-400/70">Peak</span>
        <span className="text-cyan-300 font-bold">{fmt(wu.peak, unit)}</span>
        {wu.hoursSincePeak !== null && wu.hoursSincePeak >= 0.5 && (
          <span className="text-[9px] text-gray-500">
            ({wu.hoursSincePeak < 1 ? '<1h' : `${Math.round(wu.hoursSincePeak)}h`} ago)
          </span>
        )}
      </div>
      <span className="text-gray-700">|</span>
      {/* Current + Trend */}
      <div className="flex items-center gap-1.5" title={`Trend from last 2 obs: ${arrow.label}`}>
        <span className="text-[9px] uppercase tracking-wider text-gray-400">Now</span>
        <span className="text-white font-bold">{fmt(wu.current, unit)}</span>
        <span className={`${arrow.color} text-[13px] leading-none`}>{arrow.icon}</span>
        {wu.deltaFromPeak !== null && wu.deltaFromPeak < -0.5 && (
          <span className="text-[9px] text-amber-400/80">{wu.deltaFromPeak.toFixed(1)}° vs peak</span>
        )}
      </div>
      {badge && (
        <>
          <span className="text-gray-700">|</span>
          <div className={`px-2 py-0.5 rounded border ${badge.color} text-[10px] font-semibold`} title={badge.title}>
            {badge.text}
          </div>
        </>
      )}
      {/* Time to typical peak */}
      <span className="text-gray-700">|</span>
      <div
        className="flex items-center gap-1.5"
        title={`Typical diurnal peak for this city is ~${data.typicalPeakLocalHour}:00 local. Current local hour: ${data.localHour}.`}
      >
        <span className="text-[9px] uppercase tracking-wider text-gray-400">TTP</span>
        <span className="text-gray-300">
          {data.hoursUntilTypicalPeak === null
            ? 'peak behind'
            : data.hoursUntilTypicalPeak === 0
              ? 'now'
              : `~${data.hoursUntilTypicalPeak}h`}
        </span>
      </div>
      {/* Debug tail — station + obs count */}
      <span className="ml-auto text-[9px] text-gray-600">
        {data.station} · {wu.obs.length} obs
      </span>
    </div>
  )
}
