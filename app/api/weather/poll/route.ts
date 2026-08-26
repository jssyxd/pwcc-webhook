import { NextRequest, NextResponse } from 'next/server'
import { getScheduleWindow, isWeatherEngineEnabled, runPolling, stationCodes, webhookSilentStations } from '@/lib/weather-engine'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

function requestIsAuthorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return true
  return request.headers.get('authorization') === `Bearer ${secret}`
}

/**
 * Manual or future-external-scheduler Webhook fallback. The current
 * no-database constraint means this is instance-local: a cold-started Vercel
 * function cannot know prior deliveries and conservatively treats every station
 * as silent. The current Hobby deployment does not register high-frequency Cron.
 */
export async function GET(request: NextRequest) {
  if (!isWeatherEngineEnabled()) return NextResponse.json({ error: 'WEATHER_ENGINE_ENABLED=1 is required before fallback polling is enabled' }, { status: 503 })
  if (!requestIsAuthorized(request)) return NextResponse.json({ error: 'unauthorized cron request' }, { status: 401 })

  const force = request.nextUrl.searchParams.get('force') === '1'
  const allStations = request.nextUrl.searchParams.get('all') === '1'
  const window = getScheduleWindow()
  if (!force && !window.eligible) {
    return NextResponse.json({ skipped: true, reason: 'invocation arrived more than 5 minutes after its Asia/Shanghai schedule slot', schedule: window })
  }

  const stations = allStations ? stationCodes() : webhookSilentStations()
  if (!stations.length) return NextResponse.json({ skipped: true, reason: 'all stations have a webhook observation younger than 120 minutes in this instance', schedule: window })

  const summary = await runPolling({ stations, trigger: 'webhook-fallback', scheduledSlot: window.slot ?? undefined })
  return NextResponse.json({ skipped: false, schedule: window, silentStationCount: stations.length, summary })
}
