'use client'

import { motion } from 'framer-motion'

interface GlassCardProps {
  children: React.ReactNode
  className?: string
  animate?: boolean
  delay?: number
  hover?: boolean
  onClick?: () => void
}

export default function GlassCard({
  children,
  className = '',
  animate = true,
  delay = 0,
  hover = false,
  onClick,
}: GlassCardProps) {
  return (
    <motion.div
      initial={animate ? { opacity: 0, y: 20 } : false}
      animate={animate ? { opacity: 1, y: 0 } : undefined}
      transition={animate ? { duration: 0.4, delay } : undefined}
      whileHover={hover ? { y: -4, transition: { duration: 0.2 } } : undefined}
      className={`backdrop-blur-xl bg-white/[0.03] border border-white/10 rounded-2xl shadow-lg ${
        hover ? 'cursor-pointer transition-all hover:border-cyan-500/30 hover:shadow-cyan-500/10' : ''
      } ${className}`}
      onClick={onClick}
    >
      {children}
    </motion.div>
  )
}
