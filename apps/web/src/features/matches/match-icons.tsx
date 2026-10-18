/** Match-event icons — the coach's own SVGs (ball, boot, cards), reused at whatever size the
 * caller needs. Kept as plain components (not lucide-react) since these are specific match
 * iconography, not generic UI icons. */

export function BallIcon({ size = 22, fill = '#FFFFFF' }: { size?: number; fill?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <circle cx="16" cy="16" r="14.5" fill={fill} stroke="#1E293B" strokeWidth="1.5" />
      <polygon points="16,11 19.8,13.8 18.3,18.3 13.7,18.3 12.2,13.8" fill="#1E293B" />
      <path d="M16 11L16 1.7" stroke="#1E293B" strokeWidth="1.3" strokeLinecap="round" />
      <path
        d="M11.5 1.8C12.9 1.6 14.4 1.5 16 1.5C17.6 1.5 19.1 1.6 20.5 1.8L18 6.5L14 6.5L11.5 1.8Z"
        fill="#1E293B"
      />
      <path d="M19.8 13.8L28.6 10.9" stroke="#1E293B" strokeWidth="1.3" strokeLinecap="round" />
      <path
        d="M29.5 15.5C30.1 13.9 30.4 12.2 30.4 10.5C30.4 9.6 30.3 8.7 30.1 7.8L25.2 9.5L23.5 14L29.5 15.5Z"
        fill="#1E293B"
      />
      <path d="M18.3 18.3L23.5 26" stroke="#1E293B" strokeWidth="1.3" strokeLinecap="round" />
      <path
        d="M25.5 28C26.9 26.8 28.1 25.3 28.9 23.6L24.5 21L20.2 23.5L20.8 29.8C22.5 29.4 24.1 28.8 25.5 28Z"
        fill="#1E293B"
      />
      <path d="M13.7 18.3L8.5 26" stroke="#1E293B" strokeWidth="1.3" strokeLinecap="round" />
      <path
        d="M6.5 28C7.9 28.8 9.5 29.4 11.2 29.8L11.8 23.5L7.5 21L3.1 23.6C3.9 25.3 5.1 26.8 6.5 28Z"
        fill="#1E293B"
      />
      <path d="M12.2 13.8L3.4 10.9" stroke="#1E293B" strokeWidth="1.3" strokeLinecap="round" />
      <path
        d="M2.5 15.5L8.5 14L6.8 9.5L1.9 7.8C1.7 8.7 1.6 9.6 1.6 10.5C1.6 12.2 1.9 13.9 2.5 15.5Z"
        fill="#1E293B"
      />
    </svg>
  )
}

export function BootIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <path
        d="M 5 12 C 5 8.5 8 6 11 6 C 14 6 17 8.5 19 11 C 22 12 25.5 13.5 28.5 16 C 30.5 17.8 31 20 30 21.5 C 29 23 27 23.5 24.5 23.5 L 6 23.5 C 3.5 23.5 2.2 22 2.2 20 C 2.2 17.5 3.5 14 5 12 Z"
        fill="#1E293B"
        stroke="#1E293B"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path
        d="M 6 12.5 C 6 9.5 8.8 7.2 11.5 7.2 C 14.2 7.2 17 9.8 18.8 12.2 C 21.5 13.2 25 14.5 27.8 16.8 C 29.2 18 29.8 19.8 29 20.8 C 28.2 21.8 26.5 22 24.5 22 L 6.5 22 C 4.5 22 3.5 20.8 3.5 19 C 3.5 16.8 4.8 14 6 12.5 Z"
        fill="#FFFFFF"
      />
      <path
        d="M 10.2 8.2 C 8.2 8.2 6.8 9.8 6.8 12 C 7.8 12.8 9.2 13.2 10.8 13 C 13 12.8 14.2 11.5 14.8 10.2 C 13.5 9 11.8 8.2 10.2 8.2 Z"
        fill="#1E293B"
      />
      <rect x="7.2" y="22" width="2.8" height="3.5" rx="0.8" fill="#FFFFFF" stroke="#1E293B" strokeWidth="0.8" />
      <rect x="12.5" y="22" width="2.5" height="3.2" rx="0.8" fill="#FFFFFF" stroke="#1E293B" strokeWidth="0.8" />
      <rect x="18" y="22" width="2.5" height="3.2" rx="0.8" fill="#FFFFFF" stroke="#1E293B" strokeWidth="0.8" />
      <rect x="23.2" y="22" width="2.8" height="3.5" rx="0.8" fill="#FFFFFF" stroke="#1E293B" strokeWidth="0.8" />
    </svg>
  )
}

function CardIcon({
  size,
  fill,
  stroke,
  rotate,
}: {
  size: number
  fill: string
  stroke: string
  rotate: number
}) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <rect
        x="9.5"
        y="4.5"
        width="15"
        height="23"
        rx="2"
        fill="#000000"
        fillOpacity="0.25"
        transform={`rotate(${rotate} 17 16)`}
      />
      <rect x="8.5" y="3.5" width="15" height="23" rx="2" fill={fill} stroke={stroke} strokeWidth="1" />
      <path
        d="M9.5 4.5H20.5L12.5 25.5H8.5V6.5C8.5 5.4 9.4 4.5 10.5 4.5Z"
        fill="#FFFFFF"
        fillOpacity="0.2"
      />
    </svg>
  )
}

export function YellowCardIcon({ size = 17 }: { size?: number }) {
  return <CardIcon size={size} fill="#FACC15" stroke="#EAB308" rotate={6} />
}

export function RedCardIcon({ size = 17 }: { size?: number }) {
  return <CardIcon size={size} fill="#EF4444" stroke="#DC2626" rotate={-6} />
}
