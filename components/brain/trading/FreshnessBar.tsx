'use client'

/**
 * v3.7.11 — Enterprise-grade freshness badge bar
 *
 * Persistent top-of-dashboard indicator. Shows operator exactly when the
 * displayed data was captured, which sources are stale, and whether their
 * browser is running a different build than the server. Never lies: derives
 * state from the server's own snapshot timestamps, not client fetch times.
 *
 * v3.7.11 changes:
 * - Removed the big red "Trade actions disabled" banner for STALE/DISCONNECTED.
 *   Trading is never disabled by data staleness — only VERSION_MISMATCH blocks.
 *   Rationale: forecast models only update 4x/day; "stale" dashboard data is
 *   often still the most recent model run. The operator judges when to trust.
 * - Added a non-blocking model-schedule chip when state is STALE/DISCONNECTED:
 *   shows the last available model run (e.g. "Model Z18") and when the next
 *   run is expected (e.g. "next Z00 in 4h 32m"). Context without alarm.
 * - VERSION_MISMATCH: still shows a hard-reload banner (client code mismatch
 *   is a structural incompatibility, not just a freshness concern).
 */

import { useEffect, useState } from 'react'
import {
  deriveFreshnessState,
  THRESHOLDS,
  type FreshnessPayload,
  type FreshnessState,
  type SourceInfo,
} from '@/lib/freshness'
import { lastModelRunIso, nextModelRunMinutesAway, formatModelRunLabel, nextModelRunIso } from '@/lib/model-schedule'

interface Props {
  payload: FreshnessPayload | null
  clientBuild: string
  lastFetchOkAt: number | null
  onRefresh?: () => void
  refreshing?: boolean
}

const STATE_STYLES: Record<FreshnessState, { bg: string; border: string; text: string; dot: string; label: string }> = {
  LIVE: {
    bg: 'bg-emerald-500/10',
    border: 'border-emerald-500/40',
    text: 'text-emerald-300',
    dot: 'bg-emerald-400',
    label: 'LIVE',
  },
  DEGRADED: {
    bg: 'bg-amber-500/10',
    border: 'border-amber-500/50',
    text: 'text-amber-300',
    dot: 'bg-amber-400',
    label: 'DEGRADED',
  },
  STALE: {
    bg: 'bg-red-500/15',
    border: 'border-red-500/60',
    text: 'text-red-300',
    dot: 'bg-red-500',
    label: 'STALE',
  },
  DISCONNECTED: {
    bg: 'bg-red-900/40',
    border: 'border-red-600/70',
    text: 'text-red-200',
    dot: 'bg-red-600',
    label: 'DISCONNECTED',
  },
  VERSION_MISMATCH: {
    bg: 'bg-fuchsia-500/15',
    border: 'border-fuchsia-500/60',
    text: 'text-fuchsia-200',
    dot: 'bg-fuchsia-400',
    label: 'VERSION MISMATCH',
  },
}

function formatAge(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds)) return '—'
  if (seconds < 60) return `${Math.round(seconds)}s`
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`
  return `${Math.round(seconds / 3600)}h`
}

function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes}m`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}

function SourceBadge({ id, info }: { id: string; info: SourceInfo }) {
  const color =
    info.status === 'LIVE'
      ? 'text-emerald-400'
      : info.status === 'DEGRADED'
        ? 'text-amber-400'
        : info.status === 'STALE'
          ? 'text-red-400'
          : 'text-gray-500'
  // v3.77.8: show slowest reporter inline when the source isn't LIVE so the
  // operator knows which station is lagging instead of a faceless average.
  const showSlowest = info.status !== 'LIVE' && info.slowest_context
  return (
    <span
      className="inline-flex items-center gap-1 text-[10px] font-mono"
      title={`${id}: ${info.status} · last ok ${info.last_ok_at ?? 'never'}${
        info.slowest_context ? ` · slowest: ${info.slowest_context}` : ''
      }`}
    >
      <span className={`${color} font-bold uppercase`}>{id}</span>
      <span className="text-gray-400">{formatAge(info.age_seconds)}</span>
      {showSlowest && <span className="text-gray-500">· {info.slowest_context}</span>}
    </span>
  )
}

/**
 * Non-blocking model schedule chip for STALE/DISCONNECTED states.
 * Shows: "Model Z18 · next Z00 in 4h 32m"
 * Client-side only (suppressHydrationWarning on the time value).
 */
function ModelScheduleChip() {
  const now = new Date()
  const lastRun = lastModelRunIso(now)
  const nextRun = nextModelRunIso(now)
  const minsAway = nextModelRunMinutesAway(now)
  const lastLabel = formatModelRunLabel(lastRun)
  const nextLabel = formatModelRunLabel(nextRun)
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-gray-800/60 border border-gray-700/60 text-[10px] font-mono text-gray-400"
      title={`Last available model run: ${lastLabel} (${lastRun}). Next expected: ${nextLabel} in ${formatMinutes(minsAway)}`}
    >
      <span className="text-gray-300">Model {lastLabel}</span>
      <span className="text-gray-600">·</span>
      <span>
        next {nextLabel} in{' '}
        <span suppressHydrationWarning className="text-gray-200">
          {formatMinutes(minsAway)}
        </span>
      </span>
    </span>
  )
}

export function FreshnessBar({ payload, clientBuild, lastFetchOkAt, onRefresh, refreshing = false }: Props) {
  // Re-derive every second so the displayed age ticks forward without a new fetch.
  const [tick, setTick] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 1000)
    return () => clearInterval(t)
  }, [])

  const decision = deriveFreshnessState({
    payload,
    clientBuild,
    lastFetchOkAt,
    now: Date.now() + tick * 0, // tick is only to trigger re-render; we read Date.now() fresh
  })
  const styles = STATE_STYLES[decision.state]
  const [expanded, setExpanded] = useState(false)

  // v3.77.10: hide bar entirely on LIVE/DEGRADED. Weather forecasts refresh
  // every 15 min from cron (models themselves only update 4x/day), so the
  // normal operating window is minutes-old data. Showing an amber bar every
  // time the snapshot ages past 30s produces false-alarm fatigue. Only surface
  // the bar when something actually needs operator attention.
  if (decision.state === 'LIVE' || decision.state === 'DEGRADED') {
    return null
  }

  return (
    <div
      className={`sticky top-0 z-40 border-b backdrop-blur ${styles.bg} ${styles.border}`}
      role="status"
      aria-live="polite"
      data-state={decision.state}
    >
      <div className="flex items-center gap-3 px-4 py-1.5 text-[11px] font-mono flex-wrap">
        {/* State dot + label */}
        <span className="inline-flex items-center gap-1.5">
          <span className={`h-2 w-2 rounded-full ${styles.dot}`} />
          <span className={`${styles.text} text-[12px] font-bold tracking-wide`}>{styles.label}</span>
        </span>

        <span className="text-gray-500">·</span>

        {/* Snapshot age */}
        <span className="text-gray-300">
          Data: <span className="text-white font-bold">{formatAge(decision.snapshot_age_seconds)}</span> old
        </span>

        <span className="text-gray-500">·</span>

        {/* Server build + mismatch indicator */}
        <span className="text-gray-400">
          Server <span className="text-white font-bold">v{decision.server_build ?? '?'}</span>
          {decision.client_build !== (decision.server_build ?? decision.client_build) && (
            <span className="text-fuchsia-400 ml-1">· client v{decision.client_build}</span>
          )}
        </span>

        {/* v3.7.11: Model schedule chip for STALE/DISCONNECTED (informational, non-blocking).
            Tells operator which run is current and when next update is expected.
            Replaces the old "Trade actions disabled" banner — never blocks trading. */}
        {(decision.state === 'STALE' || decision.state === 'DISCONNECTED') && (
          <>
            <span className="text-gray-500">·</span>
            <ModelScheduleChip />
          </>
        )}

        {/* Source drilldown toggle */}
        <button
          onClick={() => setExpanded((e) => !e)}
          className="ml-2 text-gray-400 hover:text-white text-[10px] underline"
          type="button"
        >
          {expanded ? 'Hide sources' : 'Sources'}
        </button>

        {/* Refresh */}
        {onRefresh && (
          <button
            onClick={onRefresh}
            disabled={refreshing}
            className="ml-auto text-[10px] px-2 py-0.5 rounded border border-gray-600 text-gray-300 hover:bg-gray-800 disabled:opacity-50"
            type="button"
          >
            {refreshing ? 'refreshing…' : 'refresh now'}
          </button>
        )}

        {/* Reason */}
        <span className={`${styles.text} text-[10px] ml-auto max-w-md truncate`} title={decision.reason}>
          {decision.reason}
        </span>
      </div>

      {/* Source drilldown */}
      {expanded && (
        <div className="px-4 py-1.5 border-t border-gray-800/60 flex flex-wrap gap-4 text-[10px]">
          {(Object.entries(decision.sources) as Array<[string, SourceInfo]>).map(([id, info]) => (
            <SourceBadge key={id} id={id} info={info} />
          ))}
          <span className="text-gray-600 ml-auto">
            live ≤ {THRESHOLDS.source_live_max / 60}m · stale &gt; {THRESHOLDS.source_degraded_max / 60}m
          </span>
        </div>
      )}

      {/* v3.7.11: VERSION_MISMATCH still shows hard-reload banner.
          Client code mismatch is a structural incompatibility (UI logic may not
          match API response shape), not just a freshness concern. Hard reload
          is required before trading. STALE/DISCONNECTED banners are removed. */}
      {decision.state === 'VERSION_MISMATCH' && (
        <div className="px-4 py-1 border-t border-fuchsia-500/40 bg-fuchsia-900/20 text-[11px] text-fuchsia-200">
          <span className="font-bold">Hard reload required: </span>
          Your browser is running an older version than the server (client v{decision.client_build} vs server v
          {decision.server_build}). Press Cmd+Shift+R (or Ctrl+Shift+R) to reload. Do not trade until synced.
        </div>
      )}
    </div>
  )
}
