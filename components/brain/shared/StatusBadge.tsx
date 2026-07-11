const VARIANTS: Record<string, string> = {
  success: 'bg-green-500/15 text-green-400 border-green-500/30',
  error: 'bg-red-500/15 text-red-400 border-red-500/30',
  warning: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  info: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30',
  purple: 'bg-purple-500/15 text-purple-400 border-purple-500/30',
  default: 'bg-gray-500/15 text-gray-400 border-gray-500/30',

  // Event types
  deploy: 'bg-green-500/15 text-green-400 border-green-500/30',
  conversation: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30',
  memory: 'bg-purple-500/15 text-purple-400 border-purple-500/30',
  fix_chain: 'bg-red-500/15 text-red-400 border-red-500/30',
  task: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  system: 'bg-gray-500/15 text-gray-400 border-gray-500/30',

  // Task priorities
  urgent: 'bg-red-500/15 text-red-400 border-red-500/30',
  high: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  medium: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30',
  low: 'bg-gray-500/15 text-gray-400 border-gray-500/30',

  // Task statuses
  pending: 'bg-gray-500/15 text-gray-400 border-gray-500/30',
  in_progress: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  done: 'bg-green-500/15 text-green-400 border-green-500/30',
  blocked: 'bg-red-500/15 text-red-400 border-red-500/30',
}

export default function StatusBadge({ variant, children, className = '' }: {
  variant: string
  children: React.ReactNode
  className?: string
}) {
  const colors = VARIANTS[variant] || VARIANTS.default
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${colors} ${className}`}>
      {children}
    </span>
  )
}
