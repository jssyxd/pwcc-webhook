'use client'

/**
 * CanonicalPeakBar — single source of truth for today's peak display.
 *
 * Reads from the parent city intel (`/api/brain/trading?type=weather-intel`):
 *   - runningHigh (WU V1 archive running max — THE Polymarket resolution source)
 *   - peakHourLocal + peakMinuteLocal (local HH:MM of today's peak)
 *   - hoursSincePeak
 *   - trendLabel (AT PEAK / RISING / PEAK SET / FADE LOCK / ...)
 *   - currentTemp (latest V3 live)
 *   - wuFcstHigh (model's forecast peak for today)
 *
 * Replaces the independently-polled peak in SniperIntelStrip on the preview
 * route so the number you see here ALWAYS matches the Live Bucket Strip
 * header and the AI Engine badge. No more 14-vs-15 drift.
 *
 * the operator (2026-04-23): "Three different pieces of information on the page
 * that all say the peak is completely different times."
 */

interface Props {
  runningHigh?: number | null
  peakHourLocal?: number | null
  peakMinuteLocal?: number | null
  hoursSincePeak?: number | null
  trendLabel?: string | null
  currentTemp?: number | null
  wuFcstHigh?: number | null
  localHour?: number | null
  unitLabel: string // '°C' | '°F'
  // Typical peak heuristic — a city-level constant (tropical peaks earlier,
  // continental later). Passed from the page; falls back to null → render '—'.
  typicalPeakLocalHour?: number | null
}

function to12Hour(h: number | null | undefined, m: number | null | undefined): string {
  if (h == null) return '—'
  const mm = String(m ?? 0).padStart(2, '0')
  const ampm = h >= 12 ? 'PM' : 'AM'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}:${mm} ${ampm}`
}

export default function CanonicalPeakBar({
  runningHigh,
  peakHourLocal,
  peakMinuteLocal,
  hoursSincePeak,
  trendLabel,
  currentTemp,
  wuFcstHigh,
  localHour,
  unitLabel,
  typicalPeakLocalHour,
}: Props) {
  const peakTime = to12Hour(peakHourLocal, peakMinuteLocal)
  const typicalTime = to12Hour(typicalPeakLocalHour ?? null, 0)

  // Typical-peak relative for a second-glance read
  let typicalRel = ''
  if (typicalPeakLocalHour != null && localHour != null) {
    const diff = typicalPeakLocalHour - localHour
    if (diff === 0) typicalRel = ' (now)'
    else if (diff > 0) typicalRel = ` (${diff}h ahead)`
    else typicalRel = ` (${Math.abs(diff)}h behind)`
  }

  const trendColor =
    trendLabel === 'AT PEAK' || trendLabel === 'PEAK SET'
      ? 'text-emerald-300'
      : trendLabel === 'FADE LOCK'
        ? 'text-purple-300'
        : (trendLabel || '').startsWith('RISING')
          ? 'text-amber-300'
          : 'text-gray-400'

  return (
    <div className="mb-3 px-3 py-2 rounded-md border border-cyan-500/30 bg-cyan-500/[0.05] flex items-center gap-x-4 gap-y-1 flex-wrap text-[11px] font-mono">
      <div className="flex items-center gap-1.5">
        <span className="text-[9px] uppercase tracking-wider text-cyan-400/70">Today&apos;s Peak</span>
        <span className="text-cyan-200 font-bold">
          {runningHigh != null ? runningHigh.toFixed(1) : '—'}
          {unitLabel}
        </span>
        <span className="text-gray-400">@ {peakTime}</span>
        {hoursSincePeak != null && hoursSincePeak >= 0.1 && (
          <span className="text-[9px] text-gray-500">
            ({hoursSincePeak < 1 ? `${Math.round(hoursSincePeak * 60)}m` : `${hoursSincePeak.toFixed(1)}h`} ago)
          </span>
        )}
      </div>
      <span className="text-gray-700">|</span>
      <div className="flex items-center gap-1.5">
        <span className="text-[9px] uppercase tracking-wider text-gray-400">Now</span>
        <span className="text-white font-bold">
          {currentTemp != null ? currentTemp.toFixed(1) : '—'}
          {unitLabel}
        </span>
        {trendLabel && <span className={`text-[10px] ${trendColor}`}>{trendLabel}</span>}
      </div>
      <span className="text-gray-700">|</span>
      <div className="flex items-center gap-1.5">
        <span className="text-[9px] uppercase tracking-wider text-gray-400">Typical Peak</span>
        <span className="text-gray-300">{typicalTime}</span>
        {typicalRel && <span className="text-[9px] text-gray-500">{typicalRel}</span>}
      </div>
      {/* v3.100.8: WU Forecast column removed per the operator's request. */}
      <span className="ml-auto text-[9px] text-gray-600">source: WU V1 archive</span>
    </div>
  )
}
