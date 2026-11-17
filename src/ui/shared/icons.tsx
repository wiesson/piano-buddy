/**
 * Signet: drei Elfenbeintasten mit zwei Ebenholztasten, darüber fällt ein Notenblock in Messing
 * auf die mittlere Taste zu. Dieselbe Form trägt das App-Icon.
 */
export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" className="logo">
      <rect x="11.5" y="1.5" width="9" height="11" rx="2.5" fill="var(--brass)" />
      <rect x="2" y="15" width="28" height="2" fill="var(--felt)" />
      <rect x="2.5" y="17" width="8.4" height="13" rx="1.6" fill="var(--ivory)" />
      <rect x="11.8" y="17" width="8.4" height="13" rx="1.6" fill="var(--ivory)" />
      <rect x="21.1" y="17" width="8.4" height="13" rx="1.6" fill="var(--ivory)" />
      <rect x="8.6" y="17" width="5" height="7.6" rx="1" fill="#120c0a" />
      <rect x="18.4" y="17" width="5" height="7.6" rx="1" fill="#120c0a" />
    </svg>
  )
}

/** Gemeinsame Form aller Linien-Icons: 22 px, 1,7 px Strich, runde Enden */
const iconProps = {
  width: 22,
  height: 22,
  viewBox: '0 0 24 24',
  'aria-hidden': true,
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.7,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const

/** Telefon und Tablet: Geräte koppeln */
export function DevicesIcon() {
  return (
    <svg {...iconProps}>
      <rect x="2.5" y="4" width="13" height="16" rx="2" />
      <rect x="14.5" y="9" width="7" height="12" rx="1.6" fill="var(--lacquer)" />
      <path d="M7.5 17h3M17 18.5h2" />
    </svg>
  )
}

/** Zurück */
export function BackIcon() {
  return (
    <svg {...iconProps} strokeWidth={2}>
      <path d="M14.5 5.5 8 12l6.5 6.5" />
    </svg>
  )
}

/** Über die App */
export function InfoIcon() {
  return (
    <svg {...iconProps}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5.5" />
      <circle cx="12" cy="7.8" r="0.6" fill="currentColor" />
    </svg>
  )
}
