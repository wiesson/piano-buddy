import { useEffect, useRef, useState } from 'react'
import { createParts } from '@ui-sdk/react/primitive'
import { pianoKeys } from './pianoKeys'
import { t } from '../../i18n'
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
  /** wie tief eine Taste gerade gedrückt ist: 1 = eben angeschlagen, 0 = oben */
  press: (midi: number) => number
  showNames: boolean
  showFingers: boolean
}

/** Abend: Lack und Elfenbein */
const DARK = {
  lane: '#2b201c',
  laneLine: 'rgba(243,235,221,0.06)',
  barLine: 'rgba(243,235,221,0.14)',
  keyBed: '#120c0a',
  ivory: '#f3ebdd',
  ivoryShade: '#d9cdb8',
  ebony: '#1a1210',
  // gedrückt: weiße Tasten etwas dunkler, schwarze etwas heller
  ivoryPressed: '#ddd0bb',
  ebonyPressed: '#3a2d28',
  felt: '#8e2f2b',
  wrong: '#e0533f',
  L: '#4f9db5',
  R: '#d3a04d',
  // Schrift auf den Blöcken der linken und rechten Hand
  onL: '#241a17',
  onR: '#241a17',
  // Tasten außerhalb des Stücks: leicht grau
  dimIvory: '#d4c9b8',
  dimEbony: '#3a2f2b',
  dimLane: 'rgba(16, 11, 9, 0.38)',
}

/** Tag: Papier, Petrol und Senf wie in den Gouache-Illustrationen */
const PAPER: typeof DARK = {
  lane: '#f6eedf',
  laneLine: 'rgba(43,36,32,0.06)',
  barLine: 'rgba(43,36,32,0.14)',
  keyBed: '#cfbfa5',
  ivory: '#fffcf6',
  ivoryShade: '#eadfcc',
  ebony: '#2b2420',
  ivoryPressed: '#ece0cc',
  ebonyPressed: '#4c4038',
  felt: '#d0603f',
  wrong: '#c2412d',
  L: '#2f6f7a',
  R: '#d9a441',
  onL: '#fffcf6',
  onR: '#2b2420',
  dimIvory: '#e9e0d1',
  dimEbony: '#8b7e71',
  dimLane: 'rgba(120, 100, 80, 0.10)',
}

interface Layout {
  lo: number
  hi: number
  /** Tonumfang des Stücks plus eine Taste Luft; alles außerhalb wird leicht grau gezeigt */
  coreLo: number
  coreHi: number
  whites: number[]
  keyW: number
}

/** Breiter werden weiße Tasten nicht: auf breiten Bildschirmen kommen statt dessen Tasten dazu */
const MAX_KEY_W = 64

function layoutKeys(notes: ScoreNote[], width: number): Layout {
  const minWhites = width < 640 ? 7 : 10
  let lo = notes.length ? Math.min(...notes.map((n) => n.midi)) : 60
  let hi = notes.length ? Math.max(...notes.map((n) => n.midi)) : 64
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
  // Hell bleibt nur der Tonumfang des Stücks (plus eine Taste Luft), nicht das erzwungene mittlere C
  const toWhiteDown = (m: number) => (isBlack(m) ? down(m) : m)
  const toWhiteUp = (m: number) => (isBlack(m) ? up(m) : m)
  const coreLo = notes.length ? down(toWhiteDown(Math.min(...notes.map((x) => x.midi)))) : lo
  const coreHi = notes.length ? up(toWhiteUp(Math.max(...notes.map((x) => x.midi)))) : hi
  // mindestens 10 weiße Tasten und keine breiter als MAX_KEY_W: abwechselnd nach unten und oben
  // auffüllen, innerhalb der 88 Tasten (A0 bis C8)
  const count = () => {
    let n = 0
    for (let m = lo; m <= hi; m++) if (!isBlack(m)) n++
    return n
  }
  let n = count()
  // abwechselnd links und rechts je eine weiße Taste, damit das Stück in der Mitte bleibt
  let left = 0
  let right = 0
  while ((n < minWhites || width / n > MAX_KEY_W) && (lo > 21 || hi < 108)) {
    if ((left <= right && lo > 21) || hi >= 108) {
      lo = down(lo)
      left++
    } else {
      hi = up(hi)
      right++
    }
    n = count()
  }
  const whites: number[] = []
  for (let m = lo; m <= hi; m++) if (!isBlack(m)) whites.push(m)
  return { lo, hi, coreLo, coreHi, whites, keyW: width / whites.length }
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

/** Zwei Hex-Farben mischen (t = 0: a, t = 1: b) */
function mix(a: string, b: string, t: number) {
  const p = (h: string, i: number) => parseInt(h.slice(1 + i * 2, 3 + i * 2), 16)
  const c = [0, 1, 2].map((i) => Math.round(p(a, i) + (p(b, i) - p(a, i)) * t))
  return `rgb(${c[0]}, ${c[1]}, ${c[2]})`
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
  expected,
  paper = false,
}: {
  view: () => RollView
  beatsPerBar: number
  onKey: (midi: number) => (() => void) | void
  /** Töne des aktuellen Schritts, für Screenreader („als Nächstes“) und den ersten Fokus */
  expected: number[]
  /** helles Papier statt Lack */
  paper?: boolean
}) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const layoutRef = useRef<{ l: Layout; keyTop: number; keyH: number } | null>(null)
  // Gleiche Lage wie die Zeichnung, als React-Zustand für die zugänglichen Tasten-Knöpfe
  const [keysLayout, setKeysLayout] = useState<{ l: Layout; keyTop: number; keyH: number } | null>(null)
  const layoutSig = useRef('')

  useEffect(() => {
    const el = canvas.current!
    const g = el.getContext('2d')!
    let raf = 0
    const font = '"Geist", system-ui, sans-serif'

    const C = paper ? PAPER : DARK
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
      // Schmal (hochkant am Telefon): nur der Tonumfang der geübten Hand, damit Tasten und
      // Schrift auf Armlänge lesbar bleiben; breit: das ganze Stück, damit nichts springt
      const l = layoutKeys(W < 640 ? v.notes : v.rangeNotes, W)
      const keyH = Math.max(90, Math.min(230, H * 0.3, l.keyW * 4.6))
      const keyTop = H - keyH
      const feltH = 6
      const laneBottom = keyTop - feltH
      layoutRef.current = { l, keyTop, keyH }
      const sig = `${W}x${H}:${l.lo}-${l.hi}:${l.coreLo}-${l.coreHi}`
      if (sig !== layoutSig.current) {
        layoutSig.current = sig
        setKeysLayout({ l, keyTop, keyH })
      }

      // Bahn; außerhalb des Tonumfangs des Stücks leicht abgedunkelt
      g.fillStyle = C.lane
      g.fillRect(0, 0, W, laneBottom)
      const coreX0 = keyRect(l, l.coreLo).x
      const coreR = keyRect(l, l.coreHi)
      const coreX1 = coreR.x + coreR.w
      g.fillStyle = C.dimLane
      if (coreX0 > 0) g.fillRect(0, 0, coreX0, laneBottom)
      if (coreX1 < W) g.fillRect(coreX1, 0, W - coreX1, laneBottom)
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
        // Beschriftung unten im Block: Notenname und Finger. Die Schrift richtet sich nach der
        // Blockhöhe, damit auch kurze Viertel ihren Fingersatz zeigen (quer am Telefon).
        const showFinger = v.showFingers && !!n.finger
        const both = v.showNames && showFinger
        const label = Math.min(bw * 0.5, 22, bh / (both ? 2.7 : 1.5))
        if (label >= 7 && (v.showNames || showFinger)) {
          const onColor = n.hand === 'L' ? C.onL : C.onR
          g.fillStyle = onColor
          let ly = by + bh - label * 0.85
          if (v.showNames) {
            g.font = `800 ${label}px ${font}`
            g.fillText(displayNoteName(n.midi), bx + bw / 2, ly)
            ly -= label * 1.15
          }
          if (showFinger) {
            g.font = `600 ${label * 0.78}px ${font}`
            g.globalAlpha *= 0.75
            g.beginPath()
            g.arc(bx + bw / 2, ly, label * 0.55, 0, Math.PI * 2)
            g.strokeStyle = onColor
            g.lineWidth = 1.5
            g.stroke()
            g.fillText(String(n.finger), bx + bw / 2, ly + 1)
          }
        }
        g.globalAlpha = 1
      }

      // Tastenbett: dunkel in den Fugen zwischen den Tasten
      g.fillStyle = C.keyBed
      g.fillRect(0, keyTop, W, keyH)

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
        // Drück-Optik: Die Taste sinkt beim Anschlag ein, die Vorderkante hebt sich und gibt
        // das dunkle Tastenbett frei; dazu wird sie dunkler (weiß) bzw. heller (schwarz)
        const pressed = v.press(m)
        const sink = pressed * (black ? 2.5 : 4)
        const bottom = keyTop + h - sink
        const hand = handOf(m)
        const flash = flashOf(m)
        const dim = m < l.coreLo || m > l.coreHi
        const base = black ? (dim ? C.dimEbony : C.ebony) : dim ? C.dimIvory : C.ivory
        g.fillStyle = pressed > 0 ? mix(base, black ? C.ebonyPressed : C.ivoryPressed, pressed) : base
        roundRect(g, kx, keyTop, kw, h - sink, [0, 0, kg.radius, kg.radius])
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
          // oben eckig wie die Taste (außen 0 → innen 0), unten Tastenradius − Abstand
          roundRect(g, ix, keyTop + kg.inset, iw, h - sink - kg.inset * 2, [0, 0, kg.inner, kg.inner])
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
        if (!black && (dim ? m % 12 === 0 : v.showNames || m % 12 === 0 || hand)) {
          g.font = `${hand ? 800 : 600} ${labelSize}px ${font}`
          // Kontrast auf Elfenbein: C etwa 7:1, übrige etwa 4,6:1; gedimmte Tasten bewusst schwächer
          g.fillStyle = hand ? (hand === 'L' ? C.onL : C.onR) : dim ? '#a69a8a' : m % 12 === 0 ? '#4f4137' : '#6f6052'
          g.fillText(m % 12 === 0 ? displayNoteLabel(m) : displayNoteName(m), ix + iw / 2, iy + ih / 2 + 1)
        }
      }
      for (let m = l.lo; m <= l.hi; m++) if (!isBlack(m)) drawKey(m)
      for (let m = l.lo; m <= l.hi; m++) if (isBlack(m) && m > l.lo && m < l.hi) drawKey(m)
    }
    draw()
    return () => cancelAnimationFrame(raf)
  }, [view, beatsPerBar, paper])

  // Gehaltene Tasten je Finger: Loslassen beendet den Ton
  const held = useRef(new Map<number, () => void>())
  const release = (e: React.PointerEvent<HTMLCanvasElement>) => {
    held.current.get(e.pointerId)?.()
    held.current.delete(e.pointerId)
  }
  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = pressAt(e)
    if (r) held.current.set(e.pointerId, r)
  }
  const pressAt = (e: React.PointerEvent<HTMLCanvasElement>) => {
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
    if (l.whites[i] !== undefined) return onKey(l.whites[i])
  }

  return (
    <div className="roll">
      <canvas
        ref={canvas}
        className="roll-canvas"
        onPointerDown={onPointerDown}
        onPointerUp={release}
        onPointerCancel={release}
        onPointerLeave={release}
      />
      {keysLayout && <AccessibleKeys layout={keysLayout} expected={expected} onKey={onKey} />}
    </div>
  )
}

const keyParts = createParts(pianoKeys, { root: 'div', key: 'button' })

/**
 * Unsichtbare Knöpfe exakt über den gezeichneten Tasten: Tastatur und Screenreader bedienen die
 * Klaviatur wie ein normales Bedienelement. Der Fokusring folgt der Tastenform (unten gerundet).
 */
function AccessibleKeys({
  layout,
  expected,
  onKey,
}: {
  layout: { l: Layout; keyTop: number; keyH: number }
  expected: number[]
  onKey: (midi: number) => (() => void) | void
}) {
  const { l, keyTop, keyH } = layout
  const geoW = keyGeometry(l.keyW - 2, false)
  const geoB = keyGeometry(l.keyW * 0.6, true)
  const next = new Set(expected)
  const keys: number[] = []
  for (let m = l.lo; m <= l.hi; m++) if (!isBlack(m) || (m > l.lo && m < l.hi)) keys.push(m)
  const home = expected[0] ?? l.whites.find((m) => m >= l.coreLo) ?? l.lo
  return (
    <keyParts.Root
      className="keys-a11y"
      style={{ top: keyTop, height: keyH }}
      aria-label={t.practice.keyboard}
      home={home}
      // Enter oder Leertaste: ein kurzer Anschlag, kein Halten
      onPlay={(m: number) => {
        const r = onKey(m)
        if (r) window.setTimeout(r, 300)
      }}
    >
      {keys.map((m) => {
        const { x, w, black } = keyRect(l, m)
        const g = black ? geoB : geoW
        return (
          <keyParts.Key
            key={m}
            value={String(m)}
            className={`key-a11y ${black ? 'key-a11y-black' : ''}`}
            aria-label={next.has(m) ? `${displayNoteLabel(m)}, ${t.practice.upNext}` : displayNoteLabel(m)}
            // Weiße Tasten: nur der sichtbare Bereich unter den schwarzen, damit der Fokusring
            // die Taste so umrahmt, wie man sie sieht
            style={{
              left: black ? x : x + 1,
              width: black ? w : w - 2,
              top: black ? 0 : keyH * 0.62,
              height: black ? keyH * 0.62 : keyH * 0.38,
              borderRadius: `0 0 ${g.radius}px ${g.radius}px`,
            }}
          />
        )
      })}
    </keyParts.Root>
  )
}
