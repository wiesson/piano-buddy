import { flushSync } from 'react-dom'

/**
 * Module der Übe-Seite tauschen (Notenband, Bahn, Klaviatur) mit sichtbarem Übergang: Was neu
 * kommt, gleitet von seinem Platz herein, was geht, gleitet hinaus, die Klaviatur bleibt stehen
 * (CSS: ::view-transition-* in practice.css). Ohne View Transitions oder bei reduzierter
 * Bewegung wird einfach umgeschaltet.
 */
export function swapModules(update: () => void) {
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  if (reduced || typeof document.startViewTransition !== 'function') {
    update()
    return
  }
  document.startViewTransition(() => flushSync(update))
}
