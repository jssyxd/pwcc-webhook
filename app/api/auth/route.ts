import { NextRequest, NextResponse } from 'next/server'
import { createHmac, timingSafeEqual } from 'crypto'

const COOKIE = 'pwcc-auth'
const TTL_MS = 30 * 24 * 60 * 60 * 1000 // 30 days

export async function POST(req: NextRequest) {
  const expected = process.env.ACCESS_PASSWORD
  const secret = process.env.AUTH_SECRET
  if (!expected || !secret) {
    return NextResponse.json({ error: 'auth not configured' }, { status: 500 })
  }
  let password = ''
  try {
    password = String((await req.json())?.password ?? '')
  } catch {
    return NextResponse.json({ error: 'bad request' }, { status: 400 })
  }
  const a = Buffer.from(password)
  const b = Buffer.from(expected)
  const ok = a.length === b.length && timingSafeEqual(a, b)
  if (!ok) {
    // flat 900ms on failure to blunt timing/bruteforce probing
    await new Promise((r) => setTimeout(r, 900))
    return NextResponse.json({ error: 'invalid password' }, { status: 401 })
  }
  const exp = String(Date.now() + TTL_MS)
  const sig = createHmac('sha256', secret).update(exp).digest('hex')
  const res = NextResponse.json({ ok: true })
  res.cookies.set(COOKIE, `${exp}.${sig}`, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: TTL_MS / 1000,
  })
  return res
}
