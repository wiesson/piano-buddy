import { t } from '@piano/core/i18n'

const STAR = 'M12 2.8l2.75 5.82 6.37.79-4.68 4.39 1.2 6.31L12 17.02l-5.64 3.09 1.2-6.31-4.68-4.39 6.37-.79z'

/**
 * Sterne eines Durchgangs oder einer Stufe: ★ ab 70 %, ★★ ab 90 %, ★★★ sauber.
 * `earnedOnly`: nur die verdienten Sterne, ohne leere Plätze (dezent, z. B. in der Stufenwahl).
 */
export function Stars({ n, earnedOnly = false, className = '' }: { n: number; earnedOnly?: boolean; className?: string }) {
  const count = earnedOnly ? n : 3
  if (!count) return null
  return (
    <span className={`stars ${className}`} role="img" aria-label={t.practice.stars(n)}>
      {Array.from({ length: count }, (_, i) => (
        <svg key={i} viewBox="0 0 24 24" className={i < n ? 'on' : ''} aria-hidden="true">
          <path d={STAR} />
        </svg>
      ))}
    </span>
  )
}
