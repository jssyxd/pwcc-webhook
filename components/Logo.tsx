export default function Logo({ size = 36 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id="pwccG" x1="0" y1="0" x2="40" y2="40" gradientUnits="userSpaceOnUse">
          <stop stopColor="#22d3ee" />
          <stop offset="1" stopColor="#2563eb" />
        </linearGradient>
      </defs>
      <rect x="1" y="1" width="38" height="38" rx="10" stroke="url(#pwccG)" strokeWidth="1.5" fill="rgba(34,211,238,0.05)" />
      {/* probability bars */}
      <rect x="9" y="22" width="4" height="8" rx="1" fill="#22d3ee" opacity="0.45" />
      <rect x="15" y="17" width="4" height="13" rx="1" fill="#22d3ee" opacity="0.7" />
      <rect x="21" y="12" width="4" height="18" rx="1" fill="url(#pwccG)" />
      {/* thermometer needle */}
      <path d="M30 9v13.5" stroke="#e2e8f0" strokeWidth="2" strokeLinecap="round" />
      <circle cx="30" cy="26" r="3.4" fill="#e2e8f0" />
      <circle cx="30" cy="26" r="1.6" fill="#0a0f14" />
    </svg>
  )
}
