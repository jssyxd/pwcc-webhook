'use client'

/**
 * UnifiedEngineBadge — minimal surface of jarvisPrediction for cross-check
 * next to the dynamicSignal recommendation.
 *
 * the operator reported losing Singapore bets multiple days in a row: Signal popup
 * said "ICON predicts 32.6°C (47.9% WR), bet on 33°C" while the same payload
 * carried jarvisPrediction.prediction=34 (TRAJECTORY method, +2.31°C
 * trajectory adjustment). Actual resolved at 34°C. This badge surfaces that
 * trajectory-corrected number next to the Signal popup so the operator can see both
 * before committing to a bucket.
 *
 * Scope is intentionally narrow (consensus-reviewed 2026-04-23, Option B):
 *   - prediction + method + σ only
 *   - no edge rows, no bucket probabilities, no divergence math, no
 *     adjustments breakdown, no directional YES/NO language
 *   - no synthetic ROI or WR claims
 *
 * Consumes the existing WUCityIntel.jarvisPrediction field — already typed,
 * already on the API response, same underlying values as unifiedPrediction.
 */

interface EnginePredictionMinimal {
  prediction: number
  standardDeviation: number
  method: 'ENSEMBLE' | 'TRAJECTORY' | 'CONFIRMED' | 'BLEND'
  climatologyPeakHour?: number
}

function formatPeakHour(h: number | undefined): string | null {
  if (h === undefined || h === null || !isFinite(h)) return null
  const hr = Math.max(0, Math.min(23, Math.round(h)))
  const ampm = hr >= 12 ? 'PM' : 'AM'
  const h12 = hr === 0 ? 12 : hr > 12 ? hr - 12 : hr
  return `${h12} ${ampm}`
}

interface Props {
  jp: EnginePredictionMinimal | null | undefined
  unitLabel: string
  variant?: 'popup' | 'strip'
}

const METHOD_COLOR: Record<EnginePredictionMinimal['method'], string> = {
  CONFIRMED: 'text-green-400',
  TRAJECTORY: 'text-blue-400',
  BLEND: 'text-purple-400',
  ENSEMBLE: 'text-gray-400',
}

export default function UnifiedEngineBadge({ jp, unitLabel, variant = 'popup' }: Props) {
  if (!jp || typeof jp.prediction !== 'number' || !isFinite(jp.prediction)) {
    return null
  }
  const methodColor = METHOD_COLOR[jp.method] ?? 'text-gray-400'
  const pred = jp.prediction.toFixed(1)
  const stddev = isFinite(jp.standardDeviation) ? jp.standardDeviation.toFixed(2) : '?'

  const peakLabel = formatPeakHour(jp.climatologyPeakHour)

  if (variant === 'strip') {
    return (
      <div className="mt-1 text-[11px] font-mono text-purple-300 flex flex-wrap items-center gap-x-2 gap-y-0.5">
        <span className="text-gray-500">AI Engine:</span>
        <span className="text-white font-bold">
          {pred}
          {unitLabel}
        </span>
        <span className={`font-bold ${methodColor}`}>{jp.method}</span>
        <span className="text-gray-500">
          σ ±{stddev}
          {unitLabel}
        </span>
        {peakLabel && (
          <span className="text-amber-300 font-bold" title="2-year climatological peak hour for this city">
            peak {peakLabel}
          </span>
        )}
      </div>
    )
  }

  return (
    <div className="mt-2 px-2 py-1.5 rounded border border-purple-500/40 bg-purple-500/10">
      <div className="flex justify-between items-center">
        <span className="text-[10px] text-purple-300 font-bold uppercase tracking-wide">AI Engine</span>
        <span className={`text-[10px] font-bold ${methodColor}`}>{jp.method}</span>
      </div>
      <div className="flex justify-between items-baseline mt-0.5">
        <span className="text-white font-mono font-bold text-sm">
          {pred}
          {unitLabel}
        </span>
        <span className="text-[10px] text-gray-400 font-mono">
          σ ±{stddev}
          {unitLabel}
        </span>
      </div>
      {peakLabel && (
        <div className="flex justify-between items-center mt-0.5 pt-0.5 border-t border-purple-500/20">
          <span className="text-[9px] text-gray-500 uppercase tracking-wide">Climatology peak</span>
          <span
            className="text-[10px] text-amber-300 font-bold font-mono"
            title="2-year mode of daily-max hour from ERA5"
          >
            {peakLabel} local
          </span>
        </div>
      )}
    </div>
  )
}
