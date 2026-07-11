'use client'

import { resolveCellStatus, type CellType, type CellInput } from '@/lib/cell-status'

interface Props {
  cellType: CellType
  input: CellInput
  format?: (v: number) => string // formatter for the value when shown
  className?: string
}

const COLOR_CLASS = {
  red: 'bg-red-900/40 text-red-200 border-red-500/60',
  amber: 'bg-amber-900/40 text-amber-200 border-amber-500/60',
  blue: 'bg-blue-900/40 text-blue-200 border-blue-500/60',
  gray: 'bg-slate-800/60 text-slate-400 border-slate-600/60',
}

export function StatusCell({ cellType, input, format, className = '' }: Props) {
  const { value, badge } = resolveCellStatus(cellType, input)

  if (badge) {
    // v3.76.4: if resolver returned a value alongside the badge (STATION_DELAYED
    // fallback case), show both: the cached reading inline with a small badge.
    // Operator sees real data + staleness context instead of just "awaiting data".
    if (value !== null && value !== undefined) {
      return (
        <span className={`inline-flex items-center gap-1 ${className}`} title={badge.tooltip} data-badge={badge.code}>
          <span className="text-slate-400">{format ? format(value) : String(value)}</span>
          <span
            className={`inline-flex items-center rounded border px-1 py-0 text-[9px] font-semibold uppercase tracking-wide ${COLOR_CLASS[badge.color]}`}
          >
            {badge.label}
          </span>
        </span>
      )
    }
    return (
      <span
        className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${COLOR_CLASS[badge.color]} ${className}`}
        title={badge.tooltip}
        data-badge={badge.code}
      >
        {badge.label}
      </span>
    )
  }

  if (value === null || value === undefined) {
    // Should be unreachable — resolveCellStatus returns AWAITING_FIRST_RUN when value is null.
    // Defense in depth: render a loud fallback instead of silent dash.
    return (
      <span
        className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${COLOR_CLASS.blue} ${className}`}
        title="Unexpected null — no badge resolved. This is a display bug; report it."
        data-badge="UNRESOLVED"
      >
        UNRESOLVED
      </span>
    )
  }

  return <span className={className}>{format ? format(value) : String(value)}</span>
}
