import { useEffect, useRef } from 'react'
import type { ScoreNote } from '../../music/lessons'
import { isBlack } from '../../music/notes'
import { displayNoteName, displayNoteLabel } from '../../i18n/noteNames'

export interface RollView {
  notes: ScoreNote[]
  /** bestimmt den Tastaturausschnitt (ganzes Stück, damit er beim Handwechsel stehen bleibt) */
  rangeNotes: ScoreNote[]
  /** aktuelle Position in Schlägen */
  beat: number
  /** Töne des aktuellen Schritts */
  expected: ReadonlySet<number>
  /** bereits getroffene Töne des aktuellen Schritts */
  struck: ReadonlySet<number>
  /** kurze Rückmeldungen: getroffen / daneben */
  flashes: { midi: number; kind: 'hit' | 'wrong'; age: number }[]
  /** gerade per Mikrofon gehört */
  heard: number[]
  showNames: boolean
  showFingers: boolean
}

const C = {
  lacquer: '#241a17',
  lane: '#2b201c',
  laneLine: 'rgba(243,235,221,0.06)',
  barLine: 'rgba(243,235,221,0.14)',
  ivory: '#f3ebdd',
  ivoryShade: '#d9cdb8',
  ebony: '#1a1210',
  felt: '#8e2f2b',
  wrong: '#e0533f',
  L: '#4f9db5',
  R: '#d3a04d',
  ink: '#241a17',
}

interface Layout {
  lo: number
  hi: number
  whites: number[]
  keyW: number
}

function layoutKeys(notes: ScoreNote[], width: number): Layout {
  let lo = Math.min(...notes.map((n) => n.midi), 60)
  let hi = Math.max(...notes.map((n) => n.midi), 64)
  // auf weiße Tasten erweitern, eine weiße Taste Luft
  const down = (m: number) => {
    m--
    while (isBlack(m)) m--
    return m
  }
  const up = (m: number) => {
    m++
    while (isBlack(m)) m++
    return m
  }
  lo = isBlack(lo) ? down(lo) : lo
  hi = isBlack(hi) ? up(hi) : hi
  lo = down(lo)
  hi = up(hi)
  // mindestens 10 weiße Tasten, damit einzelne Tasten nicht riesig werden
  let whites = []
  for (let m = lo; m <= hi; m++) if (!isBlack(m)) whites.push(m)
  while (whites.length < 10) {
    if (whites.length % 2) lo = down(lo)
    else hi = up(hi)
    whites = []
    for (let m = lo; m <= hi; m++) if (!isBlack(m)) whites.push(m)
  }
  return { lo, hi, whites, keyW: width / whites.length }
}

/** x-Position und Breite einer Taste */
function keyRect(l: Layout, m: number) {
  if (!isBlack(m)) {
    const i = l.whites.indexOf(m)
    return { x: i * l.keyW, w: l.keyW, black: false }
  }
  const i = l.whites.indexOf(m - 1)
  const w = l.keyW * 0.6
  return { x: (i + 1) * l.keyW - w / 2, w, black: true }
}

/** Radius je Ecke: Zahl oder [oben links, oben rechts, unten rechts, unten links] */
function roundRect(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number | [number, number, number, number],
) {
  g.beginPath()
  if (w <= 0 || h <= 0) return
  const max = Math.min(w / 2, h / 2)
  const radii = (typeof r === 'number' ? [r, r, r, r] : r).map((v) => Math.max(0, Math.min(v, max)))
  g.roundRect(x, y, w, h, radii)
}

/**
 * Maße einer Taste und ihrer Einlagen aus einer Quelle. Designregel der App: Liegt eine Fläche in
 * einer anderen, ist der Abstand an allen Seiten gleich und der innere Radius = äußerer Radius
 * minus Abstand. Dieselbe Einlage nutzen die fallenden Blöcke, damit sie passgenau landen.
 */
function keyGeometry(width: number, black: boolean) {
  const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Math.round(v)))
  const radius = black ? clamp(width * 0.14, 3, 6) : clamp(width * 0.16, 6, 12)
  const inset = black ? clamp(width * 0.12, 2, 4) : clamp(width * 0.09, 3, 6)
  return { radius, inset, inner: Math.max(2, radius - inset) }
}

/** Fallende Noten über einer Tastatur, gezeichnet in einem Canvas. Tippen auf Tasten spielt sie. */
export function PianoRoll({
  view,
  beatsPerBar,
  onKey,
}: {
  view: () => RollView
  beatsPerBar: number
  onKey: (midi: number) => void
}) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const layoutRef = useRef<{ l: Layout; keyTop: number; keyH: number } | null>(null)

  useEffect(() => {
    const el = canvas.current!
    const g = el.getContext('2d')!
    let raf = 0
    const font = '"Geist", system-ui, sans-serif'

    const draw = () => {
      raf = requestAnimationFrame(draw)
      const dpr = window.devicePixelRatio || 1
      const W = el.clientWidth
      const H = el.clientHeight
      if (W < 20 || H < 20) return
      if (el.width !== Math.round(W * dpr) || el.height !== Math.round(H * dpr)) {
        el.width = Math.round(W * dpr)
        el.height = Math.round(H * dpr)
      }
      g.setTransform(dpr, 0, 0, dpr, 0, 0)
      const v = view()
      const l = layoutKeys(v.rangeNotes, W)
      const keyH = Math.max(90, Math.min(230, H * 0.3, l.keyW * 4.6))
      const keyTop = H - keyH
      const feltH = 6
      const laneBottom = keyTop - feltH
      layoutRef.current = { l, keyTop, keyH }

      // Bahn
      g.fillStyle = C.lane
      g.fillRect(0, 0, W, laneBottom)
      for (const m of l.whites) {
        if (m % 12 === 0 || m % 12 === 5) {
          const { x } = keyRect(l, m)
          g.fillStyle = C.laneLine
          g.fillRect(Math.round(x), 0, 1, laneBottom)
        }
      }

      const pxPerBeat = Math.max(46, laneBottom / 4.8)
      const yOf = (beat: number) => laneBottom - (beat - v.beat) * pxPerBeat

      // Taktstriche
      const firstBar = Math.floor(v.beat / beatsPerBar) * beatsPerBar
      for (let b = firstBar; yOf(b) > -10; b += beatsPerBar) {
        const y = yOf(b)
        if (y > laneBottom) continue
        g.fillStyle = C.barLine
        g.fillRect(0, Math.round(y), W, 1)
      }

      // Notenblöcke; „jetzt“ ist eine Note, deren Zeitspanne die aktuelle Position enthält
      const sounding = (n: ScoreNote) => n.start <= v.beat + 1e-6 && v.beat < n.start + n.dur - 1e-6
      g.textAlign = 'center'
      g.textBaseline = 'middle'
      const geoW = keyGeometry(l.keyW - 2, false)
      const geoB = keyGeometry(l.keyW * 0.6, true)
      for (const n of v.notes) {
        const top = yOf(n.start + n.dur)
        const bottom = yOf(n.start)
        if (bottom < -20 || top > laneBottom + 400) continue
        const { x, w, black } = keyRect(l, n.midi)
        const kg = black ? geoB : geoW
        // weiße Tasten beginnen 1 px eingerückt (Fuge), die Einlage kommt dazu
        const pad = (black ? 0 : 1) + kg.inset
        const isNow = v.expected.has(n.midi) && sounding(n)
        const past = n.start < v.beat - 1e-6
        const color = C[n.hand]
        g.globalAlpha = past ? 0.18 : isNow ? 1 : 0.78
        const bx = x + pad
        const bw = w - pad * 2
        const by = Math.max(top + 2, -20)
        const bh = Math.min(bottom, laneBottom + 400) - by - 2
        if (isNow) {
          g.shadowColor = color
          g.shadowBlur = 18
        }
        g.fillStyle = color
        roundRect(g, bx, by, bw, bh, kg.inner)
        g.fill()
        g.shadowBlur = 0
        if (isNow && v.struck.has(n.midi)) {
          g.fillStyle = 'rgba(255,255,255,0.35)'
          g.fill()
        }
        // Beschriftung unten im Block: Notenname und Finger
        const label = Math.min(bw * 0.5, 22)
        if (bh > label * 1.4 && (v.showNames || v.showFingers)) {
          g.fillStyle = C.ink
          let ly = by + bh - label * 0.85
          if (v.showNames) {
            g.font = `800 ${label}px ${font}`
            g.fillText(displayNoteName(n.midi), bx + bw / 2, ly)
            ly -= label * 1.15
          }
          if (v.showFingers && n.finger && bh > label * 2.6) {
            g.font = `600 ${label * 0.78}px ${font}`
            g.globalAlpha *= 0.75
            g.beginPath()
            g.arc(bx + bw / 2, ly, label * 0.55, 0, Math.PI * 2)
            g.strokeStyle = C.ink
            g.lineWidth = 1.5
            g.stroke()
            g.fillText(String(n.finger), bx + bw / 2, ly + 1)
          }
        }
        g.globalAlpha = 1
      }

      // Filzstreifen über der Tastatur
      g.fillStyle = C.felt
      g.fillRect(0, laneBottom, W, feltH)

      // Tastatur
      const flashOf = (m: number) => v.flashes.find((f) => f.midi === m)
      const handOf = (m: number) => v.notes.find((n) => n.midi === m && v.expected.has(m) && sounding(n))?.hand
      // Sichtbarer Elfenbein-Bereich unter den schwarzen Tasten: Die Einlage füllt ihn mit
      // gleichem Abstand nach oben (zur schwarzen Taste), zu den Seiten und nach unten.
      const blackH = keyH * 0.62
      const whiteInlayH = Math.max(12, keyH - blackH - geoW.inset * 2)
      const labelSize = Math.min(l.keyW * 0.42, 20, whiteInlayH * 0.56)
      const drawKey = (m: number) => {
        const { x, w, black } = keyRect(l, m)
        const h = black ? blackH : keyH
        const kg = black ? geoB : geoW
        // Taste: oben eckig (verschwindet unter dem Filz), unten gerundet; weiße mit 1 px Fuge
        const kx = black ? x : x + 1
        const kw = black ? w : w - 2
        const bottom = keyTop + h
        const hand = handOf(m)
        const flash = flashOf(m)
        g.fillStyle = black ? C.ebony : C.ivory
        roundRect(g, kx, keyTop, kw, h, [0, 0, kg.radius, kg.radius])
        g.fill()
        if (!black) {
          g.fillStyle = C.ivoryShade
          g.fillRect(kx, keyTop, kw, 3)
        }
        // Einlage: gleicher Abstand links, rechts, unten; Radius = Tastenradius − Abstand
        const ix = kx + kg.inset
        const iw = kw - kg.inset * 2
        const ih = black ? h * 0.42 : whiteInlayH
        const iy = bottom - kg.inset - ih
        if (hand) {
          g.fillStyle = C[hand]
          g.globalAlpha = v.struck.has(m) ? 1 : 0.85
          roundRect(g, ix, iy, iw, ih, kg.inner)
          g.fill()
          g.globalAlpha = 1
        }
        if (flash) {
          // Rückmeldung füllt die ganze Taste innerhalb desselben Abstands
          const a = Math.max(0, 1 - flash.age / 900)
          g.fillStyle = flash.kind === 'wrong' ? C.wrong : 'rgba(255,255,255,0.9)'
          g.globalAlpha = a * (flash.kind === 'wrong' ? 0.85 : 0.5)
          roundRect(g, ix, keyTop + kg.inset, iw, h - kg.inset * 2, [kg.inner, kg.inner, kg.inner, kg.inner])
          g.fill()
          g.globalAlpha = 1
        }
        if (v.heard.includes(m)) {
          g.fillStyle = black ? C.ivory : C.ebony
          g.globalAlpha = 0.5
          g.beginPath()
          g.arc(x + w / 2, keyTop + 12, 3.5, 0, Math.PI * 2)
          g.fill()
          g.globalAlpha = 1
        }
        // Namen: C immer zur Orientierung, alle anderen mit Schalter; immer mittig in der Einlage
        if (!black && (v.showNames || m % 12 === 0 || hand)) {
          g.font = `${hand ? 800 : 600} ${labelSize}px ${font}`
          g.fillStyle = hand ? C.ink : m % 12 === 0 ? '#7a6a5c' : '#a39482'
          g.fillText(m % 12 === 0 ? displayNoteLabel(m) : displayNoteName(m), ix + iw / 2, iy + ih / 2 + 1)
        }
      }
      for (let m = l.lo; m <= l.hi; m++) if (!isBlack(m)) drawKey(m)
      for (let m = l.lo; m <= l.hi; m++) if (isBlack(m) && m > l.lo && m < l.hi) drawKey(m)
    }
    draw()
    return () => cancelAnimationFrame(raf)
  }, [view, beatsPerBar])

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const lr = layoutRef.current
    if (!lr) return
    const rect = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    if (y < lr.keyTop) return
    const { l, keyTop, keyH } = lr
    // schwarze Tasten zuerst prüfen (liegen oben drauf)
    if (y < keyTop + keyH * 0.62) {
      for (let m = l.lo + 1; m < l.hi; m++) {
        if (!isBlack(m)) continue
        const r = keyRect(l, m)
        if (x >= r.x && x <= r.x + r.w) return onKey(m)
      }
    }
    const i = Math.floor(x / l.keyW)
    if (l.whites[i] !== undefined) onKey(l.whites[i])
  }

  return <canvas ref={canvas} className="roll" onPointerDown={onPointerDown} />
}
