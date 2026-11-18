/**
 * Signet, das Pianorollen-P: ein P aus Notenbalken auf einem 32er-Raster, wie im MIDI-Editor.
 * Der Messingbalken ist die Note, die gerade dran ist. Dieselbe Form trägt das App-Icon.
 */
export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" className="logo">
      <rect x="6" y="3" width="16" height="4" rx="2" fill="currentColor" />
      <rect x="6" y="9" width="5" height="4" rx="2" fill="currentColor" />
      <rect x="20" y="9" width="6" height="4" rx="2" className="logo-note" />
      <rect x="6" y="15" width="16" height="4" rx="2" fill="currentColor" />
      <rect x="6" y="21" width="5" height="4" rx="2" fill="currentColor" />
      <rect x="6" y="27" width="5" height="4" rx="2" fill="currentColor" />
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
      <rect x="14.5" y="9" width="7" height="12" rx="1.6" fill="var(--bg)" />
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

/** Von vorn */
export function RestartIcon() {
  return (
    <svg {...iconProps}>
      <path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3" />
      <path d="M4.5 4.5v3.5H8" />
    </svg>
  )
}

/** Ansicht: was auf Tasten und Blöcken steht */
export function ViewIcon() {
  return (
    <svg {...iconProps}>
      <path d="M2.5 12s3.5-6.5 9.5-6.5S21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
      <circle cx="12" cy="12" r="2.8" />
    </svg>
  )
}

/** Mehr: drei Punkte für das Menü mit allen Optionen */
export function MoreIcon() {
  return (
    <svg {...iconProps}>
      <circle cx="5.5" cy="12" r="1.4" fill="currentColor" />
      <circle cx="12" cy="12" r="1.4" fill="currentColor" />
      <circle cx="18.5" cy="12" r="1.4" fill="currentColor" />
    </svg>
  )
}

/** MIDI: Buchse mit fünf Kontakten; durchgestrichen, wenn eingeschaltet, aber kein Klavier da ist */
export function MidiIcon({ lost = false }: { lost?: boolean }) {
  return (
    <svg {...iconProps}>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="7.6" cy="12" r="1" fill="currentColor" stroke="none" />
      <circle cx="16.4" cy="12" r="1" fill="currentColor" stroke="none" />
      <circle cx="8.9" cy="8.9" r="1" fill="currentColor" stroke="none" />
      <circle cx="15.1" cy="8.9" r="1" fill="currentColor" stroke="none" />
      <circle cx="12" cy="7.6" r="1" fill="currentColor" stroke="none" />
      <path d="M10.5 17h3" />
      {lost && <path d="M4 20 20 4" />}
    </svg>
  )
}

/** Mikrofon */
export function MicIcon() {
  return (
    <svg {...iconProps}>
      <rect x="9" y="3.5" width="6" height="11" rx="3" />
      <path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v2.5" />
    </svg>
  )
}

/** Schließen */
export function CloseIcon() {
  return (
    <svg {...iconProps}>
      <path d="M6.5 6.5l11 11M17.5 6.5l-11 11" />
    </svg>
  )
}
