import { NextRequest, NextResponse } from 'next/server'

// Read-only proxy to the upstream weather-intelligence API. The standalone
// Command Center has no database of its own — every panel is fed by the same
// public weather-intel payload the production engine builds every 15 minutes.
// GET only: this preview never mutates upstream state.
const UPSTREAM_BASE = process.env.UPSTREAM_BASE ?? 'http://localhost:3000'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest, { params }: { params: { path?: string[] } }) {
  const sub = params.path?.length ? `/${params.path.join('/')}` : ''
  const url = `${UPSTREAM_BASE}/api/brain/trading${sub}${req.nextUrl.search}`
  try {
    const headers: Record<string, string> = { accept: 'application/json' }
    // Server-side auth to the upstream engine — never exposed to the browser.
    if (process.env.UPSTREAM_SECRET) headers['authorization'] = `Bearer ${process.env.UPSTREAM_SECRET}`
    const res = await fetch(url, {
      cache: 'no-store',
      headers,
      signal: AbortSignal.timeout(55_000),
    })
    const body = await res.text()
    return new NextResponse(body, {
      status: res.status,
      headers: { 'content-type': res.headers.get('content-type') ?? 'application/json' },
    })
  } catch (e) {
    return NextResponse.json({ error: `upstream fetch failed: ${String(e)}` }, { status: 502 })
  }
}

export async function POST() {
  return NextResponse.json({ error: 'read-only preview' }, { status: 405 })
}
