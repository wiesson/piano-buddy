import { useEffect, useRef, useState } from 'react'
import { createParts } from '@ui-sdk/react/primitive'
import { pianoKeys } from './pianoKeys'
import { t } from '@piano/core/i18n'
import type { ScoreNote } from '@piano/core/music/lessons'
import { isBlack } from '@piano/core/music/notes'
import { displayNoteName, displayNoteLabel, spelledNoteName } from '@piano/core/i18n/noteNames'
import { spell } from '@piano/core/music/notation'

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
  /** Nur die Klaviatur, ohne fallende Noten (unter der Notenansicht) */
  keysOnly?: boolean
  /** Erwartete Tasten einfärben; aus, solange man in der Notenansicht selbst lesen soll */
  hint?: boolean
  /** Mitspiel-Modus: Wertung je Note (verpasst; zu früh losgelassen nach so vielen Schlägen) */
  judge?: (n: ScoreNote) => NoteLook | undefined
  /** Mitspiel-Modus: Töne, die über ihr Ende hinaus gehalten werden (Faden über der Taste) */
  overholds?: { midi: number; hand: 'L' | 'R'; beats: number; long: boolean }[]
  /** Kurze Hinweise direkt über der Taste („früh“, „spät“, „kurz“, „loslassen“) */
  tags?: { midi: number; text: string; age: number }[]
  /** Einzähler: welcher Schlag (1 bis 4) und wie weit er ist (0..1) */
  countIn?: { n: number; frac: number } | null
  /** Beim Spulen: Taktnummer an jedem Taktstrich, mit Deckkraft (blendet nach dem Loslassen aus) */
  barLabels?: { alpha: number; label: (beat: number) => string }
  /**
   * Warten, Variante B: Beginn des Schritts, der gerade spielbar ist. Gesetzt, leuchten seine
   * Tasten und Blöcke sofort, auch wenn die Bahn noch dorthin gleitet. Ohne: erst an der Linie.
   */
  stepStart?: number
  /** Rückmeldung (Varianten): Treffer weiß aufblitzen oder kräftig grün; Akkordtöne abhaken */
  feel?: { hit: 'soft' | 'green'; check: boolean; wrong: 'red' | 'soft' }
}

/** Ab so vielen Pixeln wird aus einem Tipp in die Bahn ein Spulen */
const SCRUB_SLOP = 8
/** So lange nach dem letzten Mausrad-Ereignis gilt das Spulen als beendet (Trackpad schwingt nach) */
const WHEEL_END_MS = 180

export interface NoteLook {
  missed?: boolean
  /** Zu früh losgelassen: so viele Schläge gehalten; der Rest des Balkens wird hohl */
  heldBeats?: number
}

/** So lange steht ein Hinweis über der Taste */
export const TAG_MS = 1100

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
  hit: '#5fbf7e',
  onHit: '#1d1512',
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
  hit: '#3c9a5b',
  onHit: '#fffcf6',
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
  /** Index der weißen Taste am linken Rand (fortlaufend über die ganze Klaviatur, auch krumm) */
  start: number
}

/** Fortlaufender Index der weißen Tasten (C-1 = 0) und zurück: die Spur der Kamera */
const WHITE_OF = [0, -1, 1, -1, 2, 3, -1, 4, -1, 5, -1, 6]
const WHITE_SEMIS = [0, 2, 4, 5, 7, 9, 11]
const whiteIndex = (m: number) => Math.floor(m / 12) * 7 + WHITE_OF[m % 12]
const whiteAt = (i: number) => Math.floor(i / 7) * 12 + WHITE_SEMIS[((i % 7) + 7) % 7]

/**
 * Höhe der Klaviatur: hängt nur von der Fensterhöhe ab, nicht vom Platz der Ansicht. So steht sie
 * in allen Ansichten (fallend, beides, Noten) und bei jeder Hand gleich groß an derselben Stelle.
 */
export function keyboardHeight() {
  const vh = typeof window === 'undefined' ? 800 : window.innerHeight
  return Math.round(Math.max(90, Math.min(200, vh * 0.2)))
}
const FELT_H = 6
/** Kamera-Fahrt beim Wechsel des Tastenausschnitts (Zeitkonstante; nach ~4τ angekommen) */
const CAMERA_TAU = 110

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
  return { lo, hi, coreLo, coreHi, whites, keyW: width / whites.length, start: whiteIndex(lo) }
}

/** Ausschnitt einer Kamera-Stellung (linker Rand, Zahl der weißen Tasten) über dem Ziel-Layout */
function cameraLayout(target: Layout, start: number, count: number, width: number): Layout {
  const first = Math.max(whiteIndex(21), Math.floor(start))
  const last = Math.min(whiteIndex(108), Math.ceil(start + count) - 1)
  const whites: number[] = []
  for (let i = first; i <= last; i++) whites.push(whiteAt(i))
  return {
    ...target,
    lo: whites[0],
    hi: whites[whites.length - 1],
    whites,
    keyW: width / count,
    start,
  }
}

/** x-Position und Breite einer Taste */
function keyRect(l: Layout, m: number) {
  if (!isBlack(m)) return { x: (whiteIndex(m) - l.start) * l.keyW, w: l.keyW, black: false }
  const w = l.keyW * 0.6
  return { x: (whiteIndex(m - 1) + 1 - l.start) * l.keyW - w / 2, w, black: true }
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
  onLaneTap,
  onScrub,
}: {
  view: () => RollView
  beatsPerBar: number
  onKey: (midi: number) => (() => void) | void
  /** Tipp in die Bahn (über der Klaviatur): Mitspielen anhalten oder fortsetzen */
  onLaneTap?: () => void
  /**
   * Spulen: Ziehen in der Bahn, Mausrad oder Trackpad. `beats` ist der Weg seit dem Beginn in
   * Schlägen; positiv heißt vorwärts im Stück (die Noten wandern nach unten, wie beim Spielen).
   */
  onScrub?: (phase: 'start' | 'move' | 'end', beats: number) => void
  /** Töne des aktuellen Schritts, für Screenreader („als Nächstes“) und den ersten Fokus */
  expected: number[]
  /** helles Papier statt Lack */
  paper?: boolean
}) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const layoutRef = useRef<{ l: Layout; keyTop: number; keyH: number; pxPerBeat: number } | null>(null)
  const onScrubRef = useRef(onScrub)
  onScrubRef.current = onScrub
  // Gleiche Lage wie die Zeichnung, als React-Zustand für die zugänglichen Tasten-Knöpfe
  const [keysLayout, setKeysLayout] = useState<{ l: Layout; keyTop: number; keyH: number } | null>(null)
  const layoutSig = useRef('')
  // Kamera: weicher Übergang, wenn der Ausschnitt wechselt (andere Hand, anderes Stück)
  const camera = useRef<{ start: number; count: number; w: number; t: number } | null>(null)

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
      const target = layoutKeys(W < 640 ? v.notes : v.rangeNotes, W)
      const now = performance.now()
      const cam = camera.current
      const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
      if (!cam || cam.w !== W || reduced) {
        camera.current = { start: target.start, count: target.whites.length, w: W, t: now }
      } else {
        const k = 1 - Math.exp(-Math.min(64, now - cam.t) / CAMERA_TAU)
        cam.start += (target.start - cam.start) * k
        cam.count += (target.whites.length - cam.count) * k
        cam.t = now
        if (Math.abs(cam.start - target.start) < 0.004 && Math.abs(cam.count - target.whites.length) < 0.004) {
          cam.start = target.start
          cam.count = target.whites.length
        }
      }
      const c = camera.current!
      const l = cameraLayout(target, c.start, c.count, W)
      const feltH = FELT_H
      const keyH = Math.min(keyboardHeight(), H - feltH)
      const keyTop = H - keyH
      const laneBottom = keyTop - feltH
      const pxPerBeat = Math.max(46, laneBottom / 4.8)
      layoutRef.current = { l, keyTop, keyH, pxPerBeat }
      // Für die zugänglichen Knöpfe zählt das Ziel; sie sind unsichtbar und stehen gleich dort
      const sig = `${W}x${H}:${target.lo}-${target.hi}:${target.coreLo}-${target.coreHi}:${keyH}`
      if (sig !== layoutSig.current) {
        layoutSig.current = sig
        setKeysLayout({ l: target, keyTop, keyH })
      }

      // „jetzt“ ist eine Note, deren Zeitspanne die aktuelle Position enthält
      const sounding = (n: ScoreNote) => n.start <= v.beat + 1e-6 && v.beat < n.start + n.dur - 1e-6
      // Variante B: Der spielbare Schritt ist „jetzt“, egal wo die Bahn gerade steht
      const current = (n: ScoreNote) => (v.stepStart !== undefined ? Math.abs(n.start - v.stepStart) < 1e-6 : sounding(n))
      const green = v.feel?.hit === 'green'
      const check = !!v.feel?.check
      const geoW = keyGeometry(l.keyW - 2, false)
      const geoB = keyGeometry(l.keyW * 0.6, true)

      // Bahn; außerhalb des Tonumfangs des Stücks leicht abgedunkelt. Nur Klaviatur (unter den
      // Noten): die Bahn bleibt leer, der Seitengrund scheint durch
      g.clearRect(0, 0, W, laneBottom)
      if (!v.keysOnly) {
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

      const yOf = (beat: number) => laneBottom - (beat - v.beat) * pxPerBeat

      // Taktstriche
      const firstBar = Math.floor(v.beat / beatsPerBar) * beatsPerBar
      for (let b = firstBar; yOf(b) > -10; b += beatsPerBar) {
        const y = yOf(b)
        if (y > laneBottom) continue
        g.fillStyle = C.barLine
        g.fillRect(0, Math.round(y), W, 1)
        // Spulen: Taktnummer links über dem Strich, damit man weiß, wo man landet
        if (v.barLabels && v.barLabels.alpha > 0 && b >= 0) {
          g.globalAlpha = v.barLabels.alpha
          g.fillStyle = paper ? '#5c4d42' : '#c9bba6'
          g.font = `600 12px "Geist Mono", ui-monospace, monospace`
          g.textAlign = 'left'
          g.textBaseline = 'bottom'
          g.fillText(v.barLabels.label(b), 10, Math.round(y) - 4)
          g.globalAlpha = 1
        }
      }

      // Notenblöcke; „jetzt“ ist eine Note, deren Zeitspanne die aktuelle Position enthält
      g.textAlign = 'center'
      g.textBaseline = 'middle'
      for (const n of v.notes) {
        const top = yOf(n.start + n.dur)
        const bottom = yOf(n.start)
        if (bottom < -20 || top > laneBottom + 400) continue
        const { x, w, black } = keyRect(l, n.midi)
        const kg = black ? geoB : geoW
        // weiße Tasten beginnen 1 px eingerückt (Fuge), die Einlage kommt dazu
        const pad = (black ? 0 : 1) + kg.inset
        const isNow = v.expected.has(n.midi) && current(n)
        const past = n.start < v.beat - 1e-6
        const color = C[n.hand]
        const look = v.judge?.(n)
        g.globalAlpha = look?.missed ? 0.22 : past && !isNow ? 0.18 : isNow ? 1 : 0.78
        const bx = x + pad
        const bw = w - pad * 2
        const by = Math.max(top + 2, -20)
        const bh = Math.min(bottom, laneBottom + 400) - by - 2
        if (isNow && !look?.missed) {
          g.shadowColor = color
          g.shadowBlur = 18
        }
        g.fillStyle = color
        if (look?.heldBeats !== undefined && look.heldBeats < n.dur) {
          // Zu früh losgelassen: gespielter Teil voll, der Rest nur als gestrichelter Umriss
          const cut = Math.max(by, Math.min(bottom, yOf(n.start + look.heldBeats)))
          g.save()
          g.beginPath()
          g.rect(bx - 2, cut, bw + 4, bottom - cut + 2)
          g.clip()
          roundRect(g, bx, by, bw, bh, kg.inner)
          g.fill()
          g.restore()
          g.save()
          g.beginPath()
          g.rect(bx - 2, by - 2, bw + 4, cut - by + 2)
          g.clip()
          g.shadowBlur = 0
          g.strokeStyle = color
          g.lineWidth = 1.5
          g.setLineDash([4, 3])
          roundRect(g, bx + 0.75, by + 0.75, bw - 1.5, bh - 1.5, Math.max(0, kg.inner - 0.75))
          g.stroke()
          g.setLineDash([])
          g.restore()
        } else {
          roundRect(g, bx, by, bw, bh, kg.inner)
          g.fill()
        }
        g.shadowBlur = 0
        if (isNow && v.struck.has(n.midi)) {
          // Abgehakt: grün (Variante B) bzw. heller
          g.fillStyle = check ? C.hit : 'rgba(255,255,255,0.35)'
          g.globalAlpha = check ? 0.8 : 1
          g.fill()
          g.globalAlpha = 1
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
            // wie in den Noten geschrieben (As in Des-Dur); ohne Schreibweise wie bisher mit Kreuz
            g.fillText(n.spelling ? spelledNoteName(spell(n)) : displayNoteName(n.midi), bx + bw / 2, ly)
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

      // Zu lang gehalten: ein dünner Faden steigt aus der Taste, solange der Ton über sein Ende
      // hinaus liegt; ab der Grenze in der Fehlerfarbe
      for (const o of v.overholds ?? []) {
        const { x, w } = keyRect(l, o.midi)
        const len = Math.min(o.beats * pxPerBeat, laneBottom * 0.4)
        g.globalAlpha = 0.65
        g.fillStyle = o.long ? C.wrong : C[o.hand]
        roundRect(g, x + w / 2 - 1.5, laneBottom - len, 3, len, 1.5)
        g.fill()
        g.globalAlpha = 1
      }

      // Einzähler: groß in der Bahn, jede Zahl verblasst über ihren Schlag
      if (v.countIn) {
        const { n, frac } = v.countIn
        g.globalAlpha = 1 - frac * 0.7
        g.fillStyle = paper ? '#2b2420' : '#f3ebdd'
        g.font = `400 ${Math.round(Math.min(72, laneBottom * 0.18) * (1 - frac * 0.12))}px "Geist Serif", Georgia, serif`
        g.fillText(String(n), W / 2, laneBottom * 0.4)
        g.globalAlpha = 1
      }
      }

      // Hinweise über der Taste: leise, steigen etwas und verblassen
      for (const tag of v.tags ?? []) {
        const { x, w } = keyRect(l, tag.midi)
        const a = tag.age / TAG_MS
        g.font = `700 12px ${font}`
        const tw = g.measureText(tag.text).width + 16
        const tx = Math.max(4, Math.min(W - tw - 4, x + w / 2 - tw / 2))
        const ty = laneBottom - 36 - a * 16
        g.globalAlpha = a < 0.7 ? 1 : Math.max(0, 1 - (a - 0.7) / 0.3)
        g.fillStyle = paper ? 'rgba(255,252,246,0.95)' : 'rgba(36,26,23,0.92)'
        roundRect(g, tx, ty, tw, 22, 11)
        g.fill()
        g.fillStyle = paper ? '#2b2420' : '#f3ebdd'
        g.fillText(tag.text, tx + tw / 2, ty + 11.5)
        g.globalAlpha = 1
      }

      // Tastenbett: dunkel in den Fugen zwischen den Tasten. Es endet, wo die Rundung der weißen
      // Tasten beginnt: Darunter scheint der Seitengrund durch, die runden Tastenenden stehen frei
      // statt auf einer harten Kante zur Leiste darunter.
      g.fillStyle = C.keyBed
      g.fillRect(0, keyTop, W, Math.max(0, keyH - geoW.radius))
      // ohne Bett jeden Frame leeren, sonst bliebe der Umriss einer eben gedrückten Taste stehen
      g.clearRect(0, keyTop + Math.max(0, keyH - geoW.radius), W, geoW.radius + 1)

      // Filzstreifen über der Tastatur
      g.fillStyle = C.felt
      g.fillRect(0, laneBottom, W, feltH)

      // Tastatur
      // Der jüngste Blitz zählt: Falsch und gleich danach richtig zeigt den Treffer (STU-1285)
      const flashOf = (m: number) => {
        let best: RollView['flashes'][number] | undefined
        // Gleich alt (ein MIDI-Paket): der später eingetragene gewinnt
        for (const f of v.flashes) if (f.midi === m && (!best || f.age <= best.age)) best = f
        return best
      }
      const handOf = (m: number) =>
        v.hint === false ? undefined : v.notes.find((n) => n.midi === m && v.expected.has(m) && current(n))?.hand
      // Sichtbarer Elfenbein-Bereich unter den schwarzen Tasten: Die Einlage füllt ihn mit
      // gleichem Abstand nach oben (zur schwarzen Taste), zu den Seiten und nach unten.
      const blackH = keyH * 0.62
      const whiteInlayH = Math.max(12, keyH - blackH - geoW.inset * 2)
      const labelSize = Math.min(l.keyW * 0.42, 20, whiteInlayH * 0.56)
      // auch ohne Bahn (nur Klaviatur) mittig beschriften
      g.textAlign = 'center'
      g.textBaseline = 'middle'
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
        // Abgehakt (Variante B): Getroffene Töne des Schritts bleiben grün, auch ohne Leuchthilfe
        const done = check && v.struck.has(m) && v.expected.has(m)
        if (done) {
          g.fillStyle = C.hit
          roundRect(g, ix, iy, iw, ih, kg.inner)
          g.fill()
        } else if (hand) {
          g.fillStyle = C[hand]
          g.globalAlpha = v.struck.has(m) ? 1 : 0.85
          roundRect(g, ix, iy, iw, ih, kg.inner)
          g.fill()
          g.globalAlpha = 1
        }
        if (flash?.kind === 'wrong' && v.feel?.wrong === 'soft') {
          // Leise: nur ein roter Rand in der Einlage, kurz (nichts beschämt)
          g.strokeStyle = C.wrong
          g.lineWidth = 2.5
          g.globalAlpha = Math.max(0, 1 - flash.age / 500)
          roundRect(g, ix + 1.25, keyTop + kg.inset + 1.25, iw - 2.5, h - sink - kg.inset * 2 - 2.5, [0, 0, kg.inner, kg.inner])
          g.stroke()
          g.globalAlpha = 1
        } else if (flash) {
          // Rückmeldung füllt die ganze Taste innerhalb desselben Abstands
          const a = Math.max(0, 1 - flash.age / 900)
          const strong = green && flash.kind === 'hit'
          g.fillStyle = flash.kind === 'wrong' ? C.wrong : strong ? C.hit : 'rgba(255,255,255,0.9)'
          // Grün: 300 ms voll, dann ausblenden
          g.globalAlpha = strong
            ? 0.95 * Math.min(1, Math.max(0, 1 - (flash.age - 300) / 600))
            : a * (flash.kind === 'wrong' ? 0.85 : 0.5)
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
        if (!black && (dim ? m % 12 === 0 : v.showNames || m % 12 === 0 || hand || done)) {
          g.font = `${hand || done ? 800 : 600} ${labelSize}px ${font}`
          // Kontrast auf Elfenbein: C etwa 7:1, übrige etwa 4,6:1; gedimmte Tasten bewusst schwächer
          g.fillStyle = done ? C.onHit : hand ? (hand === 'L' ? C.onL : C.onR) : dim ? '#a69a8a' : m % 12 === 0 ? '#4f4137' : '#6f6052'
          g.fillText(m % 12 === 0 ? displayNoteLabel(m) : displayNoteName(m), ix + iw / 2, iy + ih / 2 + 1)
        }
      }
      for (let m = l.lo; m <= l.hi; m++) if (!isBlack(m)) drawKey(m)
      for (let m = l.lo; m <= l.hi; m++) if (isBlack(m) && m > l.lo && m < l.hi) drawKey(m)
    }
    draw()
    return () => cancelAnimationFrame(raf)
  }, [view, beatsPerBar, paper])

  // Mausrad und Trackpad spulen. Eigener Listener, weil Reacts onWheel passiv ist und die Seite
  // sonst mitscrollen bzw. zurückwischen könnte
  useEffect(() => {
    const el = canvas.current!
    let acc = 0
    let active = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const onWheel = (e: WheelEvent) => {
      const scrub = onScrubRef.current
      const lr = layoutRef.current
      // Pinch-Zoom (ctrl) und seitliches Wischen gehören dem Browser
      if (!scrub || !lr || e.ctrlKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return
      e.preventDefault()
      const px = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaMode === 2 ? e.deltaY * el.clientHeight : e.deltaY
      if (!active) {
        active = true
        acc = 0
        scrub('start', 0)
      }
      // Rad nach unten schiebt den Inhalt nach oben: zurück im Stück
      acc -= px
      scrub('move', acc / lr.pxPerBeat)
      clearTimeout(timer)
      timer = setTimeout(() => {
        active = false
        onScrubRef.current?.('end', acc / lr.pxPerBeat)
      }, WHEEL_END_MS)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => {
      el.removeEventListener('wheel', onWheel)
      clearTimeout(timer)
    }
  }, [])

  // Gehaltene Tasten je Finger: Loslassen beendet den Ton
  const held = useRef(new Map<number, () => void>())
  /** Finger oder Maus in der Bahn: erst ein Tipp, ab ein paar Pixeln Weg ein Spulen */
  const drag = useRef<{ id: number; y0: number; active: boolean; beats: number } | null>(null)
  const release = (e: React.PointerEvent<HTMLCanvasElement>) => {
    held.current.get(e.pointerId)?.()
    held.current.delete(e.pointerId)
  }
  const endDrag = (e: React.PointerEvent<HTMLCanvasElement>, tap: boolean) => {
    const d = drag.current
    if (!d || d.id !== e.pointerId) return
    drag.current = null
    if (d.active) onScrubRef.current?.('end', d.beats)
    else if (tap) onLaneTap?.()
  }
  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const lr = layoutRef.current
    if (lr && !drag.current) {
      const y = e.clientY - e.currentTarget.getBoundingClientRect().top
      if (y < lr.keyTop) {
        drag.current = { id: e.pointerId, y0: e.clientY, active: false, beats: 0 }
        e.currentTarget.setPointerCapture?.(e.pointerId)
        return
      }
    }
    const r = pressAt(e)
    if (r) held.current.set(e.pointerId, r)
  }
  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const d = drag.current
    const lr = layoutRef.current
    if (!d || d.id !== e.pointerId || !lr || !onScrubRef.current) return
    const dy = e.clientY - d.y0
    if (!d.active) {
      if (Math.abs(dy) < SCRUB_SLOP) return
      d.active = true
      d.y0 = e.clientY
      onScrubRef.current('start', 0)
      return
    }
    // Finger nach unten zieht die Noten nach unten: vorwärts im Stück
    d.beats = dy / lr.pxPerBeat
    onScrubRef.current('move', d.beats)
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
    const m = whiteAt(Math.floor(x / l.keyW + l.start))
    if (m >= l.lo && m <= l.hi) return onKey(m)
  }

  return (
    <div className="roll">
      <canvas
        ref={canvas}
        className="roll-canvas"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={(e) => (endDrag(e, true), release(e))}
        onPointerCancel={(e) => (endDrag(e, false), release(e))}
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
        // Enter/Leertaste: ein Anschlag; losgelassen wird nach der Notenlänge, nicht nach 300 ms
        const r = onKey(m)
        if (r) window.setTimeout(r, 1800)
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
