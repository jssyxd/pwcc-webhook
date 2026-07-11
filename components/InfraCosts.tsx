'use client'

import GlassCard from '@/components/brain/shared/GlassCard'
import SvgIcon from '@/components/brain/shared/SvgIcon'

interface FeatureRow {
  feature: string
  what: string
  status: 'LIVE' | 'OPTIONAL' | 'SELF-HOSTED'
  cost: string
  costTier: 'free' | 'low' | 'paid'
}

const ROWS: FeatureRow[] = [
  {
    feature: 'Polymarket market data',
    what: 'Live bucket prices, orderbook depth and settlement rules from the public Gamma and CLOB APIs. Powers the edge calculation (model probability vs market price).',
    status: 'LIVE',
    cost: 'Free, no API key',
    costTier: 'free',
  },
  {
    feature: 'Open-Meteo multi-model forecasts',
    what: 'Primary forecast source. Up to 28 NWP models per city (GFS, ECMWF, HRRR, UKMO, ICON, GEM, ARPEGE and more) from api.open-meteo.com, plus the historical-forecast archive for backtests. The forecast column, peak projection and per-model win rates come from here.',
    status: 'LIVE',
    cost: 'Free tier: 10,000 calls per day, non-commercial use only (all endpoints, enough for 41 cities at 15-minute refresh). Commercial: Standard 29€ per month (1M calls, forecasts only), Professional 99€ per month (5M calls, adds ensemble + historical-forecast APIs). A trading stack is commercial use',
    costTier: 'low',
  },
  {
    feature: 'Open-Meteo ensemble members',
    what: 'ECMWF ENS, GEFS and ICON EPS ensemble runs (dozens of perturbed members per model) that feed the per-bucket probability distribution in the ENSEMBLE column.',
    status: 'OPTIONAL',
    cost: 'Commercially: requires the Open-Meteo API Professional plan (99€ per month); ensemble and historical APIs are not on the Standard plan. Included in the non-commercial free tier',
    costTier: 'low',
  },
  {
    feature: 'METAR live observations (NOAA)',
    what: 'Official airport station readings for all 41 cities from aviationweather.gov, updated every 30 to 60 minutes. This is the ASOS column and the running-high tracker.',
    status: 'LIVE',
    cost: 'Free, no API key',
    costTier: 'free',
  },
  {
    feature: 'HF-ASOS 1-minute feed (Synoptic)',
    what: 'One-minute resolution US station data that sees temperature crossings 10 to 20 minutes before the next METAR publishes.',
    status: 'OPTIONAL',
    cost: 'Free open-access tier',
    costTier: 'free',
  },
  {
    feature: 'Weather Underground actuals',
    what: 'The V1 HIGH column. WU daily history is what Polymarket temperature markets actually resolve on, so the engine tracks it next to ASOS and flags divergence.',
    status: 'LIVE',
    cost: 'Free (reads WU public website data; no commercial API contract, review weather.com terms yourself)',
    costTier: 'free',
  },
  {
    feature: 'Edge daemon',
    what: 'A small self-hosted poller that hits NOAA METAR every 30 seconds instead of waiting for the dashboard refresh. Runs on any always-on machine.',
    status: 'SELF-HOSTED',
    cost: 'Free software. Needs an always-on box: an old laptop, a Mac Mini, or a $5 per month VPS',
    costTier: 'low',
  },
  {
    feature: 'Calling agent (phone ASOS reader) — OPT-IN ADD-ON',
    what: 'Ships DISABLED and never turns on by itself. When you enable it per city, it dials the public automated ASOS phone line at that airport over your own VoIP line, transcribes the spoken temperature, and posts the reading to the observation feed between METAR cycles. Integration: provision a VoIP number, point the agent at the station phone directory, enable only the cities you trade, and cap it to fire inside snipe windows so call minutes stay tiny.',
    status: 'SELF-HOSTED',
    cost: 'Your own VoIP line required: about $1 per month per number plus roughly $0.01 per minute. Typical usage $5 to $20 per month. $0 while disabled',
    costTier: 'paid',
  },
  {
    feature: 'International 1-minute feeds',
    what: 'Hong Kong Observatory and Singapore NEA publish one-minute station data used for those cities.',
    status: 'LIVE',
    cost: 'Free, no API key',
    costTier: 'free',
  },
  {
    feature: 'Failover chain: Tomorrow.io, Visual Crossing, WeatherAPI.com',
    what: 'The forecast cron runs a 4-tier provider chain. Tier 1 is Open-Meteo; when it is rate-limited (maxed out) or down, the engine falls through to Tomorrow.io, then Visual Crossing, then WeatherAPI.com, so the forecast columns never go stale. Each provider needs its own API key.',
    status: 'OPTIONAL',
    cost: 'All three have free tiers (Tomorrow.io 500 calls per day, Visual Crossing 1,000 records per day, WeatherAPI 1M calls per month). Paid plans from about $25 to $99 per month if you outgrow them',
    costTier: 'low',
  },
  {
    feature: 'Hosting and database',
    what: 'Next.js app on Vercel plus a Postgres database (Supabase) for forecast history, live observations and the shadow-prediction log.',
    status: 'SELF-HOSTED',
    cost: 'Vercel Hobby free and Supabase free tier cover the workload (check non-commercial-use restrictions); Pro tiers $20 + $25 per month',
    costTier: 'low',
  },
  {
    feature: 'Telegram alerts',
    status: 'OPTIONAL',
    what: 'Bucket-flip and guaranteed-NO alerts pushed to a Telegram chat via a bot.',
    cost: 'Free',
    costTier: 'free',
  },
]

const STATUS_STYLE: Record<FeatureRow['status'], string> = {
  LIVE: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  OPTIONAL: 'bg-sky-500/15 text-sky-400 border-sky-500/30',
  'SELF-HOSTED': 'bg-amber-500/15 text-amber-400 border-amber-500/30',
}

const COST_STYLE: Record<FeatureRow['costTier'], string> = {
  free: 'text-emerald-400',
  low: 'text-sky-300',
  paid: 'text-amber-300',
}

export default function InfraCosts() {
  return (
    <GlassCard className="p-4 md:p-6" delay={0.6}>
      <div id="costs" className="scroll-mt-24">
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <SvgIcon name="clipboard" size={18} className="text-cyan-400" />
            Data Feeds, Agents and Running Costs
          </h2>
        </div>
        <p className="text-sm text-gray-400 mb-4">
          Everything on this dashboard is built from the feeds below. Core stack runs at $0 per month on free
          tiers. The full stack with the Professional forecast plan and the calling agent lands around $115 to $150 per
          month. Prices are typical published rates, verify current pricing before subscribing.
        </p>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="text-[11px] uppercase tracking-wider text-gray-500 border-b border-white/[0.08]">
                <th className="py-2 pr-4 font-medium">Feed / Agent</th>
                <th className="py-2 pr-4 font-medium">What it does</th>
                <th className="py-2 pr-4 font-medium">Status</th>
                <th className="py-2 font-medium">Cost to run</th>
              </tr>
            </thead>
            <tbody>
              {ROWS.map((r) => (
                <tr key={r.feature} className="border-b border-white/[0.04] align-top">
                  <td className="py-3 pr-4 font-medium text-white whitespace-nowrap">{r.feature}</td>
                  <td className="py-3 pr-4 text-gray-400 leading-relaxed max-w-xl">{r.what}</td>
                  <td className="py-3 pr-4">
                    <span
                      className={`inline-block px-2 py-0.5 rounded-md border text-[10px] font-bold tracking-wide whitespace-nowrap ${STATUS_STYLE[r.status]}`}
                    >
                      {r.status}
                    </span>
                  </td>
                  <td className={`py-3 leading-relaxed ${COST_STYLE[r.costTier]}`}>{r.cost}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
          <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/[0.05] p-3">
            <div className="text-[11px] uppercase tracking-wider text-emerald-400 font-bold mb-1">Minimal</div>
            <div className="text-white font-semibold">$0 / month</div>
            <p className="text-gray-400 text-xs mt-1 leading-relaxed">
              Free forecast tier, NOAA METAR, Polymarket APIs, free hosting. Full dashboard, slower observation
              cadence.
            </p>
          </div>
          <div className="rounded-lg border border-sky-500/20 bg-sky-500/[0.05] p-3">
            <div className="text-[11px] uppercase tracking-wider text-sky-400 font-bold mb-1">Serious</div>
            <div className="text-white font-semibold">$105 / month</div>
            <p className="text-gray-400 text-xs mt-1 leading-relaxed">
              Adds the Open-Meteo Professional key ($99, ensemble probabilities + historical backtests) and an always-on edge daemon box.
            </p>
          </div>
          <div className="rounded-lg border border-amber-500/20 bg-amber-500/[0.05] p-3">
            <div className="text-[11px] uppercase tracking-wider text-amber-400 font-bold mb-1">Full stack</div>
            <div className="text-white font-semibold">$110 to 145 / month</div>
            <p className="text-gray-400 text-xs mt-1 leading-relaxed">
              Everything above plus the calling agent VoIP line and paid fallback providers for redundancy.
            </p>
          </div>
        </div>
      </div>
    </GlassCard>
  )
}
