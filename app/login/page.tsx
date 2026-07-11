'use client'

import { useState, useEffect, useRef } from 'react'
import PolymarketLogo from '@/components/PolymarketLogo'

export default function LoginPage() {
  const [password, setPassword] = useState('')
  const [error, setError] = useState(false)
  const [loading, setLoading] = useState(false)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  // Matrix rain effect
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const resize = () => {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
    }
    resize()
    window.addEventListener('resize', resize)

    const chars =
      'アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン0123456789ABCDEF'
    const fontSize = 14
    const columns = Math.floor(canvas.width / fontSize)
    const drops: number[] = Array(columns).fill(1)

    const draw = () => {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.05)'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.fillStyle = '#0f0'
      ctx.font = `${fontSize}px monospace`

      for (let i = 0; i < drops.length; i++) {
        const char = chars[Math.floor(Math.random() * chars.length)]
        const x = i * fontSize
        const y = drops[i] * fontSize

        // Brighter green for leading drops
        ctx.fillStyle =
          Math.random() > 0.95 ? '#fff' : `rgba(0, ${150 + Math.random() * 105}, 0, ${0.7 + Math.random() * 0.3})`
        ctx.fillText(char, x, y)

        if (y > canvas.height && Math.random() > 0.975) {
          drops[i] = 0
        }
        drops[i]++
      }
    }

    const interval = setInterval(draw, 40)
    return () => {
      clearInterval(interval)
      window.removeEventListener('resize', resize)
    }
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(false)
    setLoading(true)

    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      })

      if (res.ok) {
        window.location.href = '/'
        return
      } else {
        setError(true)
        setPassword('')
      }
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden bg-black">
      {/* Matrix canvas */}
      <canvas ref={canvasRef} className="fixed inset-0 z-0" />

      {/* Login card */}
      <div className="relative z-10 w-full max-w-sm mx-4">
        <div className="flex items-center justify-center gap-3 mb-6">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/testedmedia.svg" alt="tested.media" className="h-4 w-auto opacity-90" />
          <span className="h-5 w-px bg-green-500/30" />
          <PolymarketLogo className="h-4 w-auto text-green-400/90" />
        </div>
        <form onSubmit={handleSubmit}>
          <div className="bg-black/80 backdrop-blur-sm border border-green-500/30 rounded-lg p-8 shadow-[0_0_40px_rgba(0,255,0,0.1)]">
            {/* Terminal header */}
            <div className="text-center mb-8">
              <div className="font-mono text-green-500 text-xs mb-4 opacity-60">
                SYSTEM://TESTED-MEDIA/WEATHER-COMMAND
              </div>
              <h1 className="text-2xl font-mono font-bold text-green-400 tracking-wider">WEATHER COMMAND CENTER</h1>
              <div className="font-mono text-green-500/50 text-[11px] mt-2 tracking-widest">
                41 CITIES · 28 MODELS · LIVE STATION FEEDS
              </div>
              <div className="h-px bg-green-500/20 mt-4" />
            </div>

            {/* Password input */}
            <div className="mb-6">
              <label className="block text-green-500/60 text-xs font-mono mb-2 tracking-widest">ACCESS_KEY_</label>
              <input
                type="password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value)
                  setError(false)
                }}
                placeholder="enter access code"
                autoFocus
                className={`w-full px-4 py-3 bg-black/60 border rounded font-mono text-green-400 placeholder-green-800 text-sm focus:outline-none transition-all ${
                  error
                    ? 'border-red-500/60 text-red-400'
                    : 'border-green-500/30 focus:border-green-500/60 focus:shadow-[0_0_10px_rgba(0,255,0,0.1)]'
                }`}
              />
              {error && (
                <div className="mt-2 text-red-500 text-xs font-mono animate-pulse">
                  &gt; ACCESS_DENIED: INVALID CREDENTIALS
                </div>
              )}
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={loading || !password}
              className="w-full py-3 rounded font-mono text-sm font-bold tracking-widest transition-all bg-green-500/10 border border-green-500/40 text-green-400 hover:bg-green-500/20 hover:shadow-[0_0_20px_rgba(0,255,0,0.15)] disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {loading ? '> AUTHENTICATING…' : '> ENTER'}
            </button>
          </div>
        </form>
        <p className="text-center font-mono text-[10px] text-green-700 mt-5 tracking-widest">
          BUILT BY TESTED.MEDIA · NOT FINANCIAL ADVICE
        </p>
      </div>
    </div>
  )
}
