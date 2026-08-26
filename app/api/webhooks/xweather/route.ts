import { createHash, createHmac, timingSafeEqual } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { acceptWebhookObservation, normalizeWebhookPayload, runPolling } from '@/lib/weather-engine'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

const MAX_BODY_BYTES = 1_000_000
const RECENT_EVENT_LIMIT = 10

declare global {
  // eslint-disable-next-line no-var
  var __pwccWebhookRecentEvents: string[] | undefined
}

function recentEvents(): string[] {
  if (!globalThis.__pwccWebhookRecentEvents) globalThis.__pwccWebhookRecentEvents = []
  return globalThis.__pwccWebhookRecentEvents
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null
}

function payloadResponse(value: unknown): Record<string, unknown> | null {
  let current: unknown = value
  const envelope = asRecord(current)
  if (envelope && 'response' in envelope) current = envelope.response
  if (Array.isArray(current)) current = current[0]
  const nested = asRecord(current)
  if (nested && 'response' in nested) current = nested.response
  if (Array.isArray(current)) current = current[0]
  return asRecord(current)
}

function stationFromPayload(value: unknown): string | null {
  return asString(payloadResponse(value)?.id)?.toUpperCase() ?? asString(asRecord(value)?.station)?.toUpperCase() ?? null
}

function eventIdFrom(request: NextRequest, raw: string, parsed: unknown): string {
  const payload = asRecord(parsed)
  const meta = asRecord(payload?.meta)
  const supplied = request.headers.get('x-xweather-event-id') ?? request.headers.get('x-event-id') ?? asString(payload?.eventId) ?? asString(payload?.id) ?? asString(meta?.eventId)
  return supplied ?? createHash('sha256').update(raw).digest('hex')
}

function validSecretHeader(request: NextRequest): boolean {
  const token = process.env.XWEATHER_WEBHOOK_AUTH_TOKEN
  if (!token) return true
  const headerName = process.env.XWEATHER_WEBHOOK_AUTH_HEADER ?? 'x-xweather-token'
  return request.headers.get(headerName) === token
}

function validSignature(request: NextRequest, raw: string): boolean {
  const secret = process.env.XWEATHER_WEBHOOK_SIGNING_SECRET
  if (!secret) return true
  const headerName = process.env.XWEATHER_WEBHOOK_SIGNATURE_HEADER ?? 'x-xweather-signature'
  const received = request.headers.get(headerName)
  if (!received) return false
  const prefix = process.env.XWEATHER_WEBHOOK_SIGNATURE_PREFIX ?? 'sha256='
  const expected = `${prefix}${createHmac('sha256', secret).update(raw).digest('hex')}`
  const receivedBuffer = Buffer.from(received)
  const expectedBuffer = Buffer.from(expected)
  return receivedBuffer.length === expectedBuffer.length && timingSafeEqual(receivedBuffer, expectedBuffer)
}

function challengeFrom(request: NextRequest): string | null {
  const configured = process.env.XWEATHER_WEBHOOK_CHALLENGE_PARAM
  if (configured) return request.nextUrl.searchParams.get(configured)
  return request.nextUrl.searchParams.get('challenge') ?? request.nextUrl.searchParams.get('hub.challenge')
}

/**
 * Xweather Webhooks are not enabled on the current free plan. This endpoint is
 * intentionally ready for vendor registration, but signature/header names stay
 * environment-configurable until Xweather provides account-specific details.
 */
export async function GET(request: NextRequest) {
  const challenge = challengeFrom(request)
  if (challenge) return new NextResponse(challenge, { status: 200, headers: { 'content-type': 'text/plain; charset=utf-8' } })
  return NextResponse.json({
    ready: true,
    endpoint: '/api/webhooks/xweather',
    persistence: 'ephemeral-memory',
    signatureConfigured: Boolean(process.env.XWEATHER_WEBHOOK_SIGNING_SECRET || process.env.XWEATHER_WEBHOOK_AUTH_TOKEN),
    note: 'Vendor Webhooks subscription and registration are required before real deliveries can be verified.',
  })
}

export async function POST(request: NextRequest) {
  const declaredSize = Number(request.headers.get('content-length') ?? '0')
  if (declaredSize > MAX_BODY_BYTES) return NextResponse.json({ error: 'payload too large' }, { status: 413 })

  const raw = await request.text()
  if (Buffer.byteLength(raw, 'utf8') > MAX_BODY_BYTES) return NextResponse.json({ error: 'payload too large' }, { status: 413 })
  if (!validSecretHeader(request) || !validSignature(request, raw)) return NextResponse.json({ error: 'invalid webhook authentication' }, { status: 401 })

  let parsed: unknown
  try {
    parsed = JSON.parse(raw) as unknown
  } catch {
    return NextResponse.json({ error: 'invalid JSON payload' }, { status: 400 })
  }

  const eventId = eventIdFrom(request, raw, parsed)
  const seen = recentEvents()
  if (seen.includes(eventId)) return NextResponse.json({ accepted: true, duplicate: true, eventId }, { status: 200 })

  const station = stationFromPayload(parsed)
  if (!station) return NextResponse.json({ accepted: false, ignored: true, reason: 'no station identifier found in payload', eventId }, { status: 202 })

  const observation = normalizeWebhookPayload(station, parsed)
  if (!observation) {
    // Unknown station, malformed payload, or a provider-selected nearest station
    // is never mapped to a different Polymarket resolution airport.
    return NextResponse.json({ accepted: false, ignored: true, reason: 'payload is not a valid exact configured ICAO observation', station, eventId }, { status: 202 })
  }

  seen.unshift(eventId)
  seen.splice(RECENT_EVENT_LIMIT)

  if (!observation.fresh) {
    // The response must return within 30 seconds. Best-effort verification is
    // started without blocking the supplier acknowledgement; the next scheduled
    // station-level fallback remains the reliable second chance on serverless.
    void runPolling({ stations: [station], trigger: 'webhook-fallback' })
    return NextResponse.json({ accepted: false, stale: true, eventId, station, observedAt: observation.observedAt, fallback: 'scheduled station-level polling started' }, { status: 202 })
  }

  const result = acceptWebhookObservation(observation, eventId)
  return NextResponse.json({ accepted: result.accepted, duplicate: !result.accepted, reason: result.reason ?? null, eventId, station, observedAt: observation.observedAt }, { status: result.accepted ? 202 : 200 })
}
