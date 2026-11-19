import { useEffect, useRef } from 'react'
import type { ScoreNote } from '@piano/core/music/lessons'
import type { Section } from '@piano/core/music/piece'

/**
 * Das ganze Stück auf einen Blick, wie eine Pianorolle von der Seite: Zeit nach rechts, Tonhöhe
 * nach oben, Farbe nach Hand. Teile sind als Bänder hinterlegt, die Stelle des Players als Linie.
 * Tippen setzt die Stelle.
 */
export function PieceOverview({
  notes,
  length,
  beat,
  sections,
  beatsPerBar,
  onSeek,
  label,
}: {
  notes: ScoreNote[]
  length: number
  beat: number
  sections: Section[]
  beatsPerBar: number
  onSeek: (beat: number) => void
  label: string
}) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const size = useRef({ w: 0, h: 0 })

  useEffect(() => {
    const el = canvas.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => {
      size.current = { w: e.contentRect.width, h: e.contentRect.height }
      draw()
    })
    ro.observe(el)
    return () => ro.disconnect()
  })

  const draw = () => {
    const el = canvas.current
    const { w, h } = size.current
    if (!el || !w || !h) return
    const dpr = window.devicePixelRatio || 1
    if (el.width !== Math.round(w * dpr)) el.width = Math.round(w * dpr)
    if (el.height !== Math.round(h * dpr)) el.height = Math.round(h * dpr)
    const g = el.getContext('2d')
    if (!g) return
    g.setTransform(dpr, 0, 0, dpr, 0, 0)
    g.clearRect(0, 0, w, h)
    const css = getComputedStyle(el)
    const col = (v: string) => css.getPropertyValue(v).trim()
    const total = Math.max(length, 1)
    const x = (b: number) => (b / total) * w
    const lo = Math.min(...notes.map((n) => n.midi), 60) - 1
    const hi = Math.max(...notes.map((n) => n.midi), 72) + 1
    const rowH = (h - 8) / (hi - lo + 1)
    const y = (m: number) => 4 + (hi - m) * rowH

    // Teile als Bänder, Wiederholungen etwas heller
    sections.forEach((s, i) => {
      if (sections.length < 2) return
      g.fillStyle = col('--bg-2')
      g.globalAlpha = s.repeatOf === null ? (i % 2 ? 0.9 : 0.45) : 0.25
      g.fillRect(x(s.start), 0, x(s.end) - x(s.start), h)
    })
    g.globalAlpha = 1
    // Taktstriche, wenn sie nicht zu dicht stehen
    const barW = x(beatsPerBar)
    if (barW > 6) {
      g.fillStyle = col('--bg-3')
      for (let b = beatsPerBar; b < total; b += beatsPerBar) g.fillRect(Math.round(x(b)), 0, 1, h)
    }
    const nh = Math.max(2, Math.min(6, rowH))
    for (const n of notes) {
      g.fillStyle = n.hand === 'L' ? col('--hand-l') : col('--hand-r')
      g.fillRect(x(n.start), y(n.midi) + (rowH - nh) / 2, Math.max(1.5, x(n.dur) - 1), nh)
    }
    // Stelle
    g.fillStyle = col('--accent')
    g.fillRect(Math.round(x(beat)) - 1, 0, 2, h)
  }

  useEffect(draw)

  const seekAt = (clientX: number) => {
    const el = canvas.current
    if (!el) return
    const r = el.getBoundingClientRect()
    onSeek(((clientX - r.left) / r.width) * Math.max(length, 1))
  }

  return (
    <canvas
      ref={canvas}
      className="piece-overview"
      role="img"
      aria-label={label}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId)
        seekAt(e.clientX)
      }}
      onPointerMove={(e) => e.buttons && seekAt(e.clientX)}
    />
  )
}
