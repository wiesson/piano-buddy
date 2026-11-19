import { useEffect, useRef, type ReactNode, type RefObject } from 'react'
import { BackIcon } from '@piano/ui/shared/icons'

/**
 * Kompakte Leiste nach iOS-Muster (44 pt plus Sicherheitsabstand oben): links Zurück, in der
 * Mitte der kleine Titel. Der große Titel steht im Inhalt; je weiter er beim Scrollen unter der
 * Leiste verschwindet, desto deutlicher erscheint der kleine (stufenlos, nichts springt). Statt
 * Milchglas ein ruhiger Papiergrund mit sanftem Auslauf nach unten, der erst beim Scrollen kommt.
 */
export function PageBar({
  title,
  onBack,
  backLabel,
  titleRef,
}: {
  title: ReactNode
  onBack: () => void
  backLabel: string
  /** Der große Titel im Inhalt */
  titleRef: RefObject<HTMLElement | null>
}) {
  const bar = useRef<HTMLElement>(null)
  useEffect(() => {
    let raf = 0
    const update = () => {
      raf = 0
      const b = bar.current
      const h = titleRef.current
      if (!b) return
      const barBottom = b.getBoundingClientRect().bottom
      let p = 0
      if (h) {
        const r = h.getBoundingClientRect()
        // 0: großer Titel ganz unter der Leiste sichtbar; 1: ganz unter ihr verschwunden
        p = Math.min(1, Math.max(0, (barBottom - r.top) / Math.max(1, r.height)))
      }
      b.style.setProperty('--collapse', p.toFixed(3))
      b.style.setProperty('--edge', Math.min(1, window.scrollY / 12).toFixed(3))
    }
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update)
    }
    update()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
    }
  }, [titleRef])

  return (
    <header ref={bar} className="piece-bar">
      <button type="button" className="icon-button" onClick={onBack} aria-label={backLabel}>
        <BackIcon />
      </button>
      {/* Für Vorleser genügt der große Titel */}
      <span className="piece-bar-title" aria-hidden="true">
        {title}
      </span>
      <span className="piece-bar-end" aria-hidden="true" />
    </header>
  )
}
