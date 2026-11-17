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

/** Telefon und Tablet: Geräte koppeln */
export function DevicesIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round">
      <rect x="2.5" y="4" width="13" height="16" rx="2" />
      <rect x="14.5" y="9" width="7" height="12" rx="1.6" fill="var(--lacquer)" />
      <path d="M7.5 17h3M17 18.5h2" strokeLinecap="round" />
    </svg>
  )
}
