// Cookie format: "<expiryMs>.<hex hmac of expiryMs>" signed with AUTH_SECRET.
// The implementation intentionally uses only Web-standard APIs so it can run
// in Vercel Edge Middleware without importing a Node-oriented runtime bundle.
const COOKIE = 'pwcc-auth'

const PUBLIC_PATHS = ['/login', '/api/auth', '/api/demo-status', '/icon.svg', '/testedmedia.svg', '/favicon.ico']

function cookieValue(request: Request, name: string): string | undefined {
  const prefix = `${name}=`
  for (const part of (request.headers.get('cookie') ?? '').split(';')) {
    const trimmed = part.trim()
    if (trimmed.startsWith(prefix)) return decodeURIComponent(trimmed.slice(prefix.length))
  }
  return undefined
}

async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message))
  return Array.from(new Uint8Array(sig))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

export async function middleware(request: Request) {
  const { pathname } = new URL(request.url)
  if (pathname.startsWith('/_next') || PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`))) {
    return
  }

  const secret = process.env.AUTH_SECRET
  // If auth is not configured (e.g. local dev without env), stay open.
  if (!secret || !process.env.ACCESS_PASSWORD) return

  const token = cookieValue(request, COOKIE)
  if (token) {
    const [exp, sig] = token.split('.')
    if (exp && sig && Number(exp) > Date.now()) {
      const expected = await hmacHex(secret, exp)
      if (sig.length === expected.length && sig === expected) return
    }
  }

  if (pathname.startsWith('/api/')) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), {
      status: 401,
      headers: { 'content-type': 'application/json; charset=utf-8' },
    })
  }
  return Response.redirect(new URL('/login', request.url), 307)
}

export const config = {
  matcher: ['/((?!_next/static|_next/image).*)'],
}
