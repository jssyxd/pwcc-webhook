'use client'

/**
 * Phase 02.15 — DEAD Sniper panel with buyNoSafe tier system.
 *
 * Three kill tiers:
 *   GUARANTEED (green) — buyNoSafe=true, ceiling breached. Free money.
 *   RISKY (amber) — audited but WU may resolve lower. Warning shown.
 *   UNAUDITED (blue) — no audit data. Use with caution.
 *
 * Three approaching tiers:
 *   APPROACHING (yellow) — buyNoSafe=true, temp climbing to ceiling.
 *   INTERNATIONAL WATCH (gray) — audited non-buyNoSafe, approaching.
 *   UNAUDITED WATCH (blue-gray) — no audit, approaching.
 */

import { useEffect, useState, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { authedFetch } from '@/lib/authed-fetch'
import SvgIcon from '@/components/brain/shared/SvgIcon'
import type { DeadSniperApproaching, DeadSniperBucket, DeadSniperResponse } from '@/lib/dead-sniper/types'

const POLL_INTERVAL_MS = 30_000

function formatPrice(p: number): string {
  return `$${p.toFixed(3)}`
}

function formatEdgeCents(edge: number): string {
  return `${(edge * 100).toFixed(1)}\u00A2`
}

// ── Tier badge config ──
const KILL_TIER_CONFIG = {
  guaranteed: {
    bg: 'bg-green-500/20',
    border: 'border-green-500/50',
    text: 'text-green-300',
    label: 'GUARANTEED NO',
    rowBg: 'bg-green-500/[0.04]',
    rowHover: 'hover:bg-green-500/[0.09]',
    edgeColor: 'text-green-400',
    btnBg: 'bg-green-500/15 hover:bg-green-500/30 border-green-500/50',
    btnText: 'text-green-200',
    btnLabel: 'TRADE',
  },
  risky: {
    bg: 'bg-amber-500/20',
    border: 'border-amber-500/50',
    text: 'text-amber-300',
    label: 'LIKELY NO',
    rowBg: 'bg-amber-500/[0.03]',
    rowHover: 'hover:bg-amber-500/[0.07]',
    edgeColor: 'text-amber-400',
    btnBg: 'bg-amber-500/15 hover:bg-amber-500/30 border-amber-500/50',
    btnText: 'text-amber-200',
    btnLabel: 'TRADE',
  },
  unaudited: {
    bg: 'bg-blue-500/20',
    border: 'border-blue-500/50',
    text: 'text-blue-300',
    label: 'UNAUDITED',
    rowBg: 'bg-blue-500/[0.03]',
    rowHover: 'hover:bg-blue-500/[0.07]',
    edgeColor: 'text-blue-400',
    btnBg: 'bg-blue-500/15 hover:bg-blue-500/30 border-blue-500/50',
    btnText: 'text-blue-200',
    btnLabel: 'TRADE',
  },
} as const

const APPROACHING_TIER_CONFIG = {
  approaching: {
    bg: 'bg-yellow-500/20',
    border: 'border-yellow-500/50',
    text: 'text-yellow-300',
    label: 'APPROACHING',
    rowBg: 'bg-yellow-500/[0.04]',
    rowHover: 'hover:bg-yellow-500/[0.09]',
    edgeColor: 'text-yellow-400',
    btnBg: 'bg-yellow-500/15 hover:bg-yellow-500/30 border-yellow-500/50',
    btnText: 'text-yellow-200',
    btnLabel: 'WATCH',
  },
  international_watch: {
    bg: 'bg-gray-500/20',
    border: 'border-gray-500/40',
    text: 'text-gray-400',
    label: 'INTL WATCH',
    rowBg: 'bg-gray-500/[0.03]',
    rowHover: 'hover:bg-gray-500/[0.06]',
    edgeColor: 'text-gray-400',
    btnBg: 'bg-gray-500/15 hover:bg-gray-500/25 border-gray-500/40',
    btnText: 'text-gray-300',
    btnLabel: 'WATCH',
  },
  unaudited_watch: {
    bg: 'bg-blue-500/15',
    border: 'border-blue-500/40',
    text: 'text-blue-400',
    label: 'UNAUDITED',
    rowBg: 'bg-blue-500/[0.02]',
    rowHover: 'hover:bg-blue-500/[0.05]',
    edgeColor: 'text-blue-400',
    btnBg: 'bg-blue-500/15 hover:bg-blue-500/25 border-blue-500/40',
    btnText: 'text-blue-300',
    btnLabel: 'WATCH',
  },
} as const

function KillRow({ bucket }: { bucket: DeadSniperBucket }) {
  const staleOrUnknown = bucket.metarObservationStatus !== 'fresh'
  const cfg = KILL_TIER_CONFIG[bucket.tier]

  return (
    <tr className={`border-t border-white/5 ${cfg.rowBg} ${cfg.rowHover} transition-colors`}>
      <td className="px-3 py-2.5 whitespace-nowrap">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="font-mono text-[11px] font-bold text-white">{bucket.cityDisplayName}</span>
          <span
            className={`rounded ${cfg.bg} border ${cfg.border} px-1.5 py-px text-[8px] font-mono font-bold ${cfg.text}`}
          >
            {cfg.label}
          </span>
          {staleOrUnknown ? (
            <span className="rounded bg-gray-500/10 border border-gray-500/30 px-1 py-px text-[8px] text-gray-400 uppercase">
              {bucket.metarObservationStatus}
            </span>
          ) : null}
        </div>
        <div className="text-[9px] font-mono text-gray-500 mt-0.5">
          high {bucket.runningHigh}&deg;{bucket.bucketUnit} &middot; exceeded by +{bucket.exceededByDeg}&deg;
          {bucket.metarAgeSeconds !== null ? ` \u00B7 obs ${Math.round(bucket.metarAgeSeconds / 60)}m ago` : ''}
          {bucket.auditDays > 0 ? ` \u00B7 ${bucket.auditDays}d audit` : ''}
        </div>
        {bucket.warningMessage ? (
          <div className="text-[8px] font-mono text-amber-500/80 mt-0.5">{bucket.warningMessage}</div>
        ) : null}
      </td>
      <td className="px-3 py-2.5 whitespace-nowrap">
        <div className="font-mono text-[11px] font-bold text-white">BUY NO &middot; {bucket.bucketLabel}</div>
        <div className="text-[9px] font-mono text-gray-500 mt-0.5">
          {bucket.tier === 'guaranteed'
            ? 'ceiling breached \u2014 NO resolves to $1.00'
            : 'ceiling breached \u2014 likely NO (check warning)'}
        </div>
      </td>
      <td className="px-3 py-2.5 font-mono text-[11px] text-right whitespace-nowrap">
        {formatPrice(bucket.currentNoPrice)}
      </td>
      <td className={`px-3 py-2.5 font-mono text-[11px] font-bold ${cfg.edgeColor} text-right whitespace-nowrap`}>
        {formatEdgeCents(bucket.edgePerShare)}/share
      </td>
      <td className="px-3 py-2.5 text-right">
        <a
          href={bucket.polymarketUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={`inline-block rounded ${cfg.btnBg} border px-3 py-1.5 text-[10px] font-mono font-bold ${cfg.btnText} transition-colors whitespace-nowrap`}
        >
          {cfg.btnLabel} &uarr;
        </a>
      </td>
    </tr>
  )
}

function ApproachingRow({ item }: { item: DeadSniperApproaching }) {
  const cfg = APPROACHING_TIER_CONFIG[item.tier]

  return (
    <tr className={`border-t border-white/5 ${cfg.rowBg} ${cfg.rowHover} transition-colors`}>
      <td className="px-3 py-2.5 whitespace-nowrap">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="font-mono text-[11px] font-bold text-white">{item.cityDisplayName}</span>
          <span
            className={`rounded ${cfg.bg} border ${cfg.border} px-1.5 py-px text-[8px] font-mono font-bold ${cfg.text}`}
          >
            {cfg.label}
          </span>
        </div>
        <div className="text-[9px] font-mono text-gray-500 mt-0.5">
          high {item.runningHigh}&deg;{item.bucketUnit} &middot; {item.degreesAway}&deg; away &middot; {item.trendLabel}
          {item.leadTimeMins ? ` \u00B7 ${item.leadTimeMins}m snipe window` : ''}
        </div>
        {item.warningMessage ? (
          <div className="text-[8px] font-mono text-amber-500/80 mt-0.5">{item.warningMessage}</div>
        ) : null}
      </td>
      <td className="px-3 py-2.5 whitespace-nowrap">
        <div className="font-mono text-[11px] font-bold text-white">WATCH &middot; {item.bucketLabel}</div>
        <div className="text-[9px] font-mono text-gray-500 mt-0.5">
          {item.minutesUntilNextMetar !== null
            ? `next METAR in ${item.minutesUntilNextMetar}m`
            : 'METAR timing unknown'}
        </div>
      </td>
      <td className="px-3 py-2.5 font-mono text-[11px] text-right whitespace-nowrap">
        {formatPrice(item.currentNoPrice)}
      </td>
      <td className={`px-3 py-2.5 font-mono text-[11px] font-bold ${cfg.edgeColor} text-right whitespace-nowrap`}>
        {formatEdgeCents(item.potentialEdge)}/share
      </td>
      <td className="px-3 py-2.5 text-right">
        <a
          href={item.polymarketUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={`inline-block rounded ${cfg.btnBg} border px-3 py-1.5 text-[10px] font-mono font-bold ${cfg.btnText} transition-colors whitespace-nowrap`}
        >
          {cfg.btnLabel} &uarr;
        </a>
      </td>
    </tr>
  )
}

function SectionHeader({ label, color }: { label: string; color: string }) {
  return (
    <tr>
      <td colSpan={5} className={`px-3 py-1.5 text-[9px] font-mono font-bold uppercase ${color} bg-white/[0.01]`}>
        {label}
      </td>
    </tr>
  )
}

export default function DeadSniperPanel() {
  const [data, setData] = useState<DeadSniperResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [userToggled, setUserToggled] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [newKillFlash, setNewKillFlash] = useState(false)
  const prevKillKeysRef = useRef<Set<string>>(new Set())

  // Play alert sound when new guaranteed NO appears
  const playAlertSound = useCallback(() => {
    try {
      const ctx = new AudioContext()
      // Two-tone alert: ascending beep
      const osc1 = ctx.createOscillator()
      const gain1 = ctx.createGain()
      osc1.type = 'sine'
      osc1.frequency.setValueAtTime(880, ctx.currentTime)
      gain1.gain.setValueAtTime(0.15, ctx.currentTime)
      gain1.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15)
      osc1.connect(gain1).connect(ctx.destination)
      osc1.start(ctx.currentTime)
      osc1.stop(ctx.currentTime + 0.15)

      const osc2 = ctx.createOscillator()
      const gain2 = ctx.createGain()
      osc2.type = 'sine'
      osc2.frequency.setValueAtTime(1320, ctx.currentTime + 0.15)
      gain2.gain.setValueAtTime(0.15, ctx.currentTime + 0.15)
      gain2.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.35)
      osc2.connect(gain2).connect(ctx.destination)
      osc2.start(ctx.currentTime + 0.15)
      osc2.stop(ctx.currentTime + 0.35)

      setTimeout(() => ctx.close(), 500)
    } catch {
      // AudioContext not available (SSR or blocked)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const res = await authedFetch('/api/brain/dead-sniper')
        if (!res.ok) {
          if (!cancelled) setError(`API ${res.status}`)
          return
        }
        const payload = (await res.json()) as DeadSniperResponse
        if (!cancelled) {
          // Detect new guaranteed kills
          const newKeys = new Set((payload.guaranteedNOs ?? []).map((b) => `${b.city}|${b.bucketLabel}`))
          const prevKeys = prevKillKeysRef.current
          if (prevKeys.size > 0) {
            const brandNew = [...newKeys].filter((k) => !prevKeys.has(k))
            if (brandNew.length > 0) {
              playAlertSound()
              setNewKillFlash(true)
              setTimeout(() => setNewKillFlash(false), 3000)
            }
          }
          prevKillKeysRef.current = newKeys

          setData(payload)
          setError(null)
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'unknown error')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    const interval = setInterval(load, POLL_INTERVAL_MS)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [playAlertSound])

  const guaranteedNOs = data?.guaranteedNOs ?? []
  const riskyNOs = data?.riskyNOs ?? []
  const approachingItems = data?.approaching ?? []
  const internationalWatch = data?.internationalWatch ?? []
  const unauditedApproaching = data?.unauditedApproaching ?? []
  const fullyRepricedCount = data?.fullyRepricedCount ?? 0

  const totalKills = guaranteedNOs.length + riskyNOs.length
  const totalApproaching = approachingItems.length + internationalWatch.length + unauditedApproaching.length
  const totalAlerts = totalKills + totalApproaching

  // Phase 02.19 (2026-04-16): Dead Sniper always starts COLLAPSED per the operator.
  // No auto-expand on alerts — the header pills show the live counts so the
  // user sees they're there and clicks in when ready. Opening the whole panel
  // on every page load was too noisy.
  function toggleExpanded() {
    setUserToggled(true)
    setExpanded((v) => !v)
  }

  return (
    <div
      className={`rounded-xl border bg-gradient-to-br from-green-950/20 via-emerald-950/15 to-black/40 transition-all duration-500 ${newKillFlash ? 'border-green-400/60 shadow-lg shadow-green-500/20' : 'border-green-500/25'}`}
    >
      <button
        type="button"
        onClick={toggleExpanded}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 hover:bg-white/[0.02] transition-colors rounded-t-xl"
      >
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-green-500/20 to-emerald-600/20 border border-green-500/30 flex items-center justify-center">
            <SvgIcon name="skull" size={18} className="text-green-400" />
          </div>
          <div className="text-left">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-sm font-bold text-white">Dead Sniper</h2>
              {guaranteedNOs.length > 0 ? (
                <span className="rounded-full bg-green-500/15 border border-green-500/50 px-2 py-0.5 text-[9px] font-mono text-green-300 animate-pulse">
                  {guaranteedNOs.length} GUARANTEED
                </span>
              ) : null}
              {riskyNOs.length > 0 ? (
                <span className="rounded-full bg-amber-500/15 border border-amber-500/50 px-2 py-0.5 text-[9px] font-mono text-amber-300">
                  {riskyNOs.length} LIKELY
                </span>
              ) : null}
              {approachingItems.length > 0 ? (
                <span className="rounded-full bg-yellow-500/15 border border-yellow-500/50 px-2 py-0.5 text-[9px] font-mono text-yellow-300">
                  {approachingItems.length} APPROACHING
                </span>
              ) : null}
              {internationalWatch.length + unauditedApproaching.length > 0 ? (
                <span className="rounded-full bg-gray-500/10 border border-gray-500/30 px-2 py-0.5 text-[9px] font-mono text-gray-400">
                  {internationalWatch.length + unauditedApproaching.length} WATCH
                </span>
              ) : null}
              {totalAlerts === 0 ? (
                <span className="rounded-full bg-gray-500/10 border border-gray-500/20 px-2 py-0.5 text-[9px] font-mono text-gray-500">
                  SCANNING
                </span>
              ) : null}
              {fullyRepricedCount > 0 ? (
                <span className="rounded-full bg-white/[0.02] border border-white/10 px-2 py-0.5 text-[9px] font-mono text-gray-500">
                  {fullyRepricedCount} fully repriced
                </span>
              ) : null}
            </div>
            <p className="text-[10px] text-gray-500 mt-0.5">
              {totalAlerts === 0
                ? `Scanning 41 markets for kills and approaching buckets`
                : `${totalKills} kill${totalKills !== 1 ? 's' : ''} (${guaranteedNOs.length} guaranteed) \u00B7 ${totalApproaching} approaching \u00B7 ${data?.summary?.citiesWithEdge ?? 0} cit${(data?.summary?.citiesWithEdge ?? 0) === 1 ? 'y' : 'ies'}${data?.staleness === 'stale' ? ' \u00B7 some obs stale' : ''}`}
            </p>
          </div>
        </div>
        <SvgIcon
          name="chart"
          size={14}
          className={`text-gray-500 transition-transform ${expanded ? 'rotate-180' : ''}`}
        />
      </button>
      <AnimatePresence initial={false}>
        {expanded ? (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="border-t border-green-500/20 py-3">
              {loading && !data ? (
                <div className="px-3 py-4 text-[11px] text-gray-500 font-mono">Loading...</div>
              ) : error ? (
                <div className="mx-3 mb-3 rounded-lg border border-red-500/30 bg-red-500/10 p-2 text-[11px] text-red-300 font-mono">
                  {error}
                </div>
              ) : null}

              {totalAlerts > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[600px]">
                    <thead>
                      <tr className="text-[9px] font-mono uppercase text-gray-600">
                        <th className="px-3 py-1 text-left">City</th>
                        <th className="px-3 py-1 text-left">Bucket</th>
                        <th className="px-3 py-1 text-right">NO Price</th>
                        <th className="px-3 py-1 text-right">Edge</th>
                        <th className="px-3 py-1 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {/* ── GUARANTEED KILLS (green) ── */}
                      {guaranteedNOs.length > 0 && (
                        <SectionHeader label="Guaranteed NOs (buyNoSafe verified)" color="text-green-400" />
                      )}
                      {guaranteedNOs.map((b) => (
                        <KillRow key={`g|${b.city}|${b.bucketLabel}`} bucket={b} />
                      ))}

                      {/* ── RISKY KILLS (amber) ── */}
                      {riskyNOs.length > 0 && (
                        <SectionHeader label="Likely NOs (WU may resolve lower)" color="text-amber-400" />
                      )}
                      {riskyNOs.map((b) => (
                        <KillRow key={`r|${b.city}|${b.bucketLabel}`} bucket={b} />
                      ))}

                      {/* ── APPROACHING (yellow, buyNoSafe) ── */}
                      {approachingItems.length > 0 && (
                        <SectionHeader label="Approaching (buyNoSafe, get ready)" color="text-yellow-400" />
                      )}
                      {approachingItems.map((a) => (
                        <ApproachingRow key={`a|${a.city}|${a.bucketLabel}`} item={a} />
                      ))}

                      {/* ── INTERNATIONAL WATCH (gray) ── */}
                      {internationalWatch.length > 0 && (
                        <SectionHeader label="International Watch (higher risk)" color="text-gray-400" />
                      )}
                      {internationalWatch.map((a) => (
                        <ApproachingRow key={`iw|${a.city}|${a.bucketLabel}`} item={a} />
                      ))}

                      {/* ── UNAUDITED APPROACHING (blue) ── */}
                      {unauditedApproaching.length > 0 && (
                        <SectionHeader label="Unaudited (audit pending)" color="text-blue-400" />
                      )}
                      {unauditedApproaching.map((a) => (
                        <ApproachingRow key={`ua|${a.city}|${a.bucketLabel}`} item={a} />
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="mx-3 mb-4 rounded-lg border border-white/5 bg-white/[0.01] p-4 text-center text-[11px] text-gray-500 font-mono">
                  No confirmed kills or approaching buckets right now. Scanning 41 markets.
                </div>
              )}

              <div className="mt-3 pt-3 border-t border-white/5 px-3 text-[9px] font-mono text-gray-600 text-center">
                polls every {POLL_INTERVAL_MS / 1000}s &middot; 23 buyNoSafe cities &middot; 41 total markets
              </div>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  )
}
