'use client'

import GlassCard from '@/components/brain/shared/GlassCard'
import SvgIcon from '@/components/brain/shared/SvgIcon'

// Every number on this dashboard traces to a raw artifact. This panel is the
// single place that discloses the window, the source, and the verification
// status of each metric, mirroring docs/ and data/backtest/ in the repo.

// Derived directly from data/backtest/polymarket_asos_ground_truth_v1.json
// (pm_bucket hits/attempts) so the table always matches the shipped artifact.
const VERIFIED_BETS = [
  { bet: 'London / UKMO', wr: '60.05%', n: 438, ci: '[55.39%, 64.53%]' },
  { bet: 'London / UKMO 2km', wr: '59.13%', n: 438, ci: '[54.47%, 63.64%]' },
  { bet: 'London / ICON', wr: '57.53%', n: 438, ci: '[52.86%, 62.08%]' },
  { bet: 'NYC / GFS-HRRR', wr: '55.73%', n: 436, ci: '[51.04%, 60.33%]' },
]

const COLUMN_SOURCES = [
  {
    column: 'V1 HIGH',
    source: 'Weather Underground V1 daily archive, the exact series Polymarket resolution reads',
    window: 'Live, refreshed each cycle',
  },
  {
    column: 'METAR / ASOS / NOW',
    source: 'NOAA aviationweather.gov METAR + SPECI, 1-minute HF-ASOS where available, HKO and NEA for Hong Kong and Singapore. Only the exact resolution station is ever plotted',
    window: 'Live, 30 to 60 minute METAR cadence',
  },
  {
    column: 'FORECAST (model + win rate)',
    source:
      'Best-performing model per city from the ground-truth backtest (polymarket_asos_ground_truth_v1.json): 28 models scored against actual Polymarket bucket resolutions where markets existed, ASOS observed peaks where they did not. Forecasts are real lead-time runs from the Open-Meteo historical-forecast API, never reanalysis',
    window: '730 days (2 years)',
  },
  {
    column: 'PEAK',
    source: 'Per-city peak-hour histogram from ASOS observation history',
    window: '731 days',
  },
  {
    column: '@3PM',
    source: 'Hourly hold rates (asos_hourly_hold_rates_v1.json): given a running high at hour H, how often it survived to close',
    window: '728 days, all 24 hours, 400+ samples per hour',
  },
  {
    column: 'ENSEMBLE',
    source: 'Open-Meteo ensemble members (ECMWF ENS, GEFS, ICON EPS) spread into bucket probabilities using per-city residual standard deviations (forecast_residuals.json)',
    window: 'Live runs; residuals from the 730-day window',
  },
  {
    column: 'AI',
    source: 'Blend of the ensemble distribution, live observation trajectory and market signal. Method tag on each card shows which path produced the number (CONFIRMED, TRAJECTORY, BLEND, ENSEMBLE)',
    window: 'Live',
  },
]

export default function DataProvenance() {
  return (
    <GlassCard className="p-4 md:p-6" delay={0.65}>
      <div id="methodology" className="scroll-mt-24">
        <h2 className="text-lg font-semibold text-white flex items-center gap-2 mb-1">
          <SvgIcon name="shield" size={18} className="text-cyan-400" />
          Backtest Data and Methodology
        </h2>
        <p className="text-sm text-gray-400 mb-5 max-w-3xl">
          Every number on this dashboard traces to a raw artifact you can inspect. The backtest JSONs ship in
          the repository under <code className="text-gray-300">data/backtest/</code>. Nothing here is
          marketing math: the window, the sample size and the verification status of each metric are stated
          below.
        </p>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-emerald-400 mb-2">
              Verified against resolved Polymarket outcomes (the only numbers we call proven)
            </h3>
            <p className="text-xs text-gray-400 mb-3 leading-relaxed">
              Four bets clear the gate: at least 300 resolved markets AND a 95% Wilson CI lower bound above 49%
              (an even-money break-even proxy; at typical sub-10 cent entries, true break-even is far lower,
              so the gate is conservative). Smaller-sample passes exist in the artifact (Dallas GFS-HRRR
              66.4% at n=125) and stay off this table until n clears 300. For context, a uniform-random
              bucket guess is 14.3%; the empirical single-bucket base rate in this backtest is about 17%. NYC / GFS (52.98%, n=436, CI lower bound 48.3%) passed on an earlier
              snapshot and was demoted when the latest regeneration dropped it below the gate; that demotion
              is the gate working as designed.
            </p>
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="text-[10px] uppercase tracking-wider text-gray-500 border-b border-white/[0.08]">
                  <th className="py-1.5 pr-3 font-medium">Bet</th>
                  <th className="py-1.5 pr-3 font-medium text-right">Win rate</th>
                  <th className="py-1.5 pr-3 font-medium text-right">n</th>
                  <th className="py-1.5 font-medium text-right">95% CI</th>
                </tr>
              </thead>
              <tbody>
                {VERIFIED_BETS.map((b) => (
                  <tr key={b.bet} className="border-b border-white/[0.04]">
                    <td className="py-2 pr-3 text-white font-medium">{b.bet}</td>
                    <td className="py-2 pr-3 text-right text-emerald-400 font-bold tabular-nums">{b.wr}</td>
                    <td className="py-2 pr-3 text-right text-gray-400 tabular-nums">{b.n}</td>
                    <td className="py-2 text-right text-gray-400 tabular-nums">{b.ci}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <h3 className="text-xs font-bold uppercase tracking-wider text-amber-400 mt-5 mb-2">
              Everything else is proxy-verified, treat accordingly
            </h3>
            <p className="text-xs text-gray-400 leading-relaxed">
              Per-city win rates outside the table above are scored against ASOS observed peaks, not Polymarket
              resolutions: the other 38 cities resolved between 0 and 125 markets each in the window, below
              the significance gate. ASOS-proxy scoring has been measured 20+ points off the true Polymarket rate in one NYC
              cross-check, so these numbers rank models and time entries; they are not sizing justification.
              Strategy combos are watchlist signals: the dashboard renders a COMBO line only when its 95%
              CI lower bound clears 50% on its actual fire-day sample (n shown inline), and even then it is
              ASOS-proxy evidence, not sizing justification.
            </p>

            <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 mt-5 mb-2">Method</h3>
            <ul className="text-xs text-gray-400 space-y-1.5 leading-relaxed list-disc pl-4">
              <li>Forecasts replayed at true lead time from the Open-Meteo historical-forecast API. Reanalysis data is banned from backtests; it inflates hit rates 2 to 3x.</li>
              <li>Scoring uses proper scoring rules: log-loss with Dirichlet smoothing plus Brier, with 14-day block-bootstrap standard errors (1,000 iterations).</li>
              <li>Bucket hits are canonicalized to the market's native unit. Mixing units over-counts hits by roughly 1.8x.</li>
              <li>One station per city, ever. Readings from any other station are discarded, not merged.</li>
              <li>Numbers that fail an independent anchor check are deleted and rebuilt from raw source, never patched.</li>
            </ul>
          </div>

          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">
              Where every column comes from
            </h3>
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="text-[10px] uppercase tracking-wider text-gray-500 border-b border-white/[0.08]">
                  <th className="py-1.5 pr-3 font-medium">Column</th>
                  <th className="py-1.5 pr-3 font-medium">Source</th>
                  <th className="py-1.5 font-medium whitespace-nowrap">Window</th>
                </tr>
              </thead>
              <tbody>
                {COLUMN_SOURCES.map((c) => (
                  <tr key={c.column} className="border-b border-white/[0.04] align-top">
                    <td className="py-2 pr-3 text-white font-medium whitespace-nowrap">{c.column}</td>
                    <td className="py-2 pr-3 text-gray-400 leading-relaxed">{c.source}</td>
                    <td className="py-2 text-gray-500 whitespace-nowrap">{c.window}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-[11px] text-gray-500 mt-3 leading-relaxed">
              Raw artifacts: <code>polymarket_asos_ground_truth_v1.json</code> (28 models, 41 cities, 730
              days) and <code>wu_backtest_41cities_v1.json</code> in the repository. Past performance does not
              guarantee future results; markets adapt.
            </p>
          </div>
        </div>
      </div>
    </GlassCard>
  )
}
