import { useEffect, useRef } from 'react'

/** Pegelbalken im Mikrofon-Knopf. Liest den Pegel aus einer Ref, ohne React neu zu rendern. */
export function MicMeter({ levelRef, active }: { levelRef: React.RefObject<number>; active: boolean }) {
  const ref = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    let raf = 0
    const loop = () => {
      raf = requestAnimationFrame(loop)
      if (ref.current) ref.current.style.transform = `scaleY(${active ? Math.max(0.12, levelRef.current) : 0.12})`
    }
    loop()
    return () => cancelAnimationFrame(raf)
  }, [active, levelRef])
  return (
    <span className="meter" aria-hidden>
      <span ref={ref} className="meter-fill" />
    </span>
  )
}
