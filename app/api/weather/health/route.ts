import { NextResponse } from 'next/server'
import { getWeatherRuntimeHealth, webhookSilentStations } from '@/lib/weather-engine'

export const dynamic = 'force-dynamic'

export async function GET() {
  const health = getWeatherRuntimeHealth()
  return NextResponse.json({
    ...health,
    webhook: {
      enabledInVendorAccount: false,
      configuredSignature: Boolean(process.env.XWEATHER_WEBHOOK_SIGNING_SECRET || process.env.XWEATHER_WEBHOOK_AUTH_TOKEN),
      silentAfterMinutes: 120,
      silentStations: webhookSilentStations(),
      limitation: 'Current implementation is intentionally ephemeral-memory only; cold starts clear webhook delivery history.',
    },
  }, { headers: { 'cache-control': 'no-store' } })
}
