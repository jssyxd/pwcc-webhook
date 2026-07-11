'use client'

import { useEffect, useState, useRef } from 'react'

export default function AnimatedCounter({
  value,
  duration = 1000,
  suffix = '',
}: {
  value: number
  duration?: number
  suffix?: string
}) {
  const [display, setDisplay] = useState(0)
  const ref = useRef<number>(0)
  const startTime = useRef<number>(0)

  useEffect(() => {
    const start = ref.current
    const diff = value - start
    startTime.current = Date.now()
    let frameId: number

    const animate = () => {
      const elapsed = Date.now() - startTime.current
      const progress = Math.min(elapsed / duration, 1)
      const eased = 1 - Math.pow(1 - progress, 3) // ease out cubic
      const current = Math.round(start + diff * eased)
      setDisplay(current)
      ref.current = current

      if (progress < 1) {
        frameId = requestAnimationFrame(animate)
      }
    }

    frameId = requestAnimationFrame(animate)

    return () => {
      if (frameId) cancelAnimationFrame(frameId)
    }
  }, [value, duration])

  return (
    <>
      {display.toLocaleString('en-US')}
      {suffix}
    </>
  )
}
