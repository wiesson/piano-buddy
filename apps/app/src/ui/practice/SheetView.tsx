import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Accidental,
  Beam,
  Dot,
  Formatter,
  FretHandFinger,
  Modifier,
  Renderer,
  Stave,
  StaveConnector,
  StaveNote,
  StaveTie,
  Voice,
} from 'vexflow/bravura'
import type { Lesson, Stage } from '@piano/core/music/lessons'
import { notationOf, type NotationItem } from '@piano/core/music/notation'
import { displayNoteName } from '@piano/core/i18n/noteNames'
import type { RollView } from './PianoRoll'

/**
 * Notenansicht im Warte-Modus: dieselbe Übung wie die Pianorolle, als Klaviersystem.
 * Das Notenmodell kommt aus music/notation.ts, gezeichnet wird mit VexFlow (lädt nur hier).
 *
 * Breit: eine Zeile wandert nach links, der aktuelle Ton steht bei etwa einem Drittel.
 * Schmal (iPhone hochkant): Zeilen mit wenigen Takten, die aktuelle Zeile steht oben.
 * Gezeichnet wird einmal pro Stück, Stufe und Breite; bei jedem Schritt wechseln nur Klassen
 * (gespielt, aktuell) und der Cursor gleitet.
 */

const KEY_NAMES = ['Cb', 'Gb', 'Db', 'Ab', 'Eb', 'Bb', 'F', 'C', 'G', 'D', 'A', 'E', 'B', 'F#', 'C#']
const SYSTEM_H = 210
const STAFF_GAP = 96
const EPS = 1e-6

interface Mark {
  start: number
  hand: 'L' | 'R'
  midis: number[]
  x: number
  line: number
  el: SVGElement | null
}

interface Drawn {
  marks: Mark[]
  lineTops: number[]
  scale: number
  layout: 'band' | 'lines'
}

export default function SheetView({
  lesson,
  stage,
  view,
  showNames,
  showFingers,
  forceBand = false,
}: {
  lesson: Lesson
  stage: Stage
  view: () => RollView
  showNames: boolean
  showFingers: boolean
  /** Immer das wandernde Band, auch schmal (in „Beides“ ist die Notenzeile niedrig) */
  forceBand?: boolean
}) {
  const box = useRef<HTMLDivElement>(null)
  const track = useRef<HTMLDivElement>(null)
  const cursor = useRef<HTMLDivElement>(null)
  const drawn = useRef<Drawn | null>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })
  const notation = useMemo(() => notationOf(lesson), [lesson])

  useEffect(() => {
    const el = box.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => {
      const w = Math.round(e.contentRect.width)
      const h = Math.round(e.contentRect.height)
      setSize((s) => (Math.abs(s.w - w) > 2 || Math.abs(s.h - h) > 40 ? { w, h } : s))
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Zeichnen
  useEffect(() => {
    const host = track.current
    if (!host || size.w < 50) return
    host.innerHTML = ''
    const layout: Drawn['layout'] = size.w < 600 && !forceBand ? 'lines' : 'band'
    const scale = layout === 'lines' ? 0.9 : Math.max(0.85, Math.min(1.3, (size.h - 24) / SYSTEM_H))
    const avail = size.w / scale - 16
    const active = (hand: 'L' | 'R') => stage === 'LR' || stage === hand

    // Breite je Takt nach Zahl der Elemente; der erste Takt einer Zeile trägt Schlüssel und Tonart
    const keyExtra = 12 * Math.abs(notation.key)
    const widthOf = (i: number, first: boolean) => {
      const m = notation.measures[i]
      const n = Math.max(m.items.R.length, m.items.L.length)
      const base = layout === 'lines' ? Math.max(90, 26 + n * 19) : Math.max(120, 40 + n * 26)
      return base + (first ? 62 + keyExtra : 0)
    }
    const lines: number[][] = []
    if (layout === 'band') lines.push(notation.measures.map((_, i) => i))
    else {
      let line: number[] = []
      let w = 0
      notation.measures.forEach((_, i) => {
        const mw = widthOf(i, line.length === 0)
        if (line.length && w + mw > avail) {
          lines.push(line)
          line = []
          w = 0
        }
        w += widthOf(i, line.length === 0)
        line.push(i)
      })
      if (line.length) lines.push(line)
    }
    const natural = lines.map((ln) => ln.reduce((s, i, k) => s + widthOf(i, k === 0), 0))
    const width = layout === 'band' ? natural[0] + 40 : avail + 8
    const height = SYSTEM_H * lines.length + 16

    const div = document.createElement('div')
    host.appendChild(div)
    const renderer = new Renderer(div, Renderer.Backends.SVG)
    renderer.resize(width * scale, height * scale)
    const ctx = renderer.getContext()
    ctx.scale(scale, scale)
    const svg = div.querySelector('svg')!
    const timeSig = `${notation.time[0]}/${notation.time[1]}`
    const marks: Mark[] = []
    const lineTops: number[] = []
    const tieQueue: { hand: 'L' | 'R'; item: NotationItem; note: StaveNote; line: number }[] = []

    lines.forEach((ln, li) => {
      const y = li * SYSTEM_H + 22
      lineTops.push(y)
      let x = 8
      const stretch = layout === 'lines' ? avail / natural[li] : 1
      ln.forEach((mi, k) => {
        const m = notation.measures[mi]
        const first = k === 0
        const w = widthOf(mi, first) * stretch
        const top = new Stave(x, y, w)
        const bot = new Stave(x, y + STAFF_GAP, w)
        if (first) {
          top.addClef('treble')
          bot.addClef('bass')
          if (notation.key) {
            top.addKeySignature(KEY_NAMES[notation.key + 7])
            bot.addKeySignature(KEY_NAMES[notation.key + 7])
          }
          if (li === 0) {
            top.addTimeSignature(timeSig)
            bot.addTimeSignature(timeSig)
          }
        }
        top.setContext(ctx).draw()
        bot.setContext(ctx).draw()
        if (first) {
          new StaveConnector(top, bot).setType('brace').setContext(ctx).draw()
          new StaveConnector(top, bot).setType('singleLeft').setContext(ctx).draw()
        }
        new StaveConnector(top, bot).setType(mi === notation.measures.length - 1 ? 'boldDoubleRight' : 'singleRight').setContext(ctx).draw()

        const voices: Voice[] = []
        const staveNotes: Record<'L' | 'R', StaveNote[]> = { L: [], R: [] }
        const itemsOf = new Map<StaveNote, NotationItem>()
        for (const hand of ['R', 'L'] as const) {
          const clef = hand === 'R' ? 'treble' : 'bass'
          for (const it of m.items[hand]) {
            const keys = it.rest ? [clef === 'treble' ? 'b/4' : 'd/3'] : it.keys.map((kk) => `${kk.step.toLowerCase()}/${kk.octave}`)
            const n = new StaveNote({
              keys,
              duration: it.value + (it.rest ? 'r' : ''),
              clef,
              autoStem: !it.rest,
              alignCenter: !!it.fullBar,
            })
            if (it.dots) Dot.buildAndAttach([n], { all: true })
            it.keys.forEach((kk, i) => {
              if (kk.accidental) n.addModifier(new Accidental(kk.accidental), i)
              if (showFingers && kk.finger && active(hand)) {
                const f = new FretHandFinger(String(kk.finger))
                f.setPosition(hand === 'R' ? Modifier.Position.ABOVE : Modifier.Position.BELOW)
                n.addModifier(f, i)
              }
            })
            staveNotes[hand].push(n)
            itemsOf.set(n, it)
          }
          const voice = new Voice({ numBeats: (m.end - m.start), beatValue: notation.time[1] })
          voice.setMode(Voice.Mode.SOFT)
          voice.addTickables(staveNotes[hand])
          voices.push(voice)
        }
        const groups = Beam.getDefaultBeamGroups(timeSig)
        const beams = [
          ...Beam.generateBeams(staveNotes.R, { groups, beamRests: false }),
          ...Beam.generateBeams(staveNotes.L, { groups, beamRests: false }),
        ]
        const startX = Math.max(top.getNoteStartX(), bot.getNoteStartX())
        top.setNoteStartX(startX)
        bot.setNoteStartX(startX)
        new Formatter().joinVoices([voices[0]]).joinVoices([voices[1]]).format(voices, Math.max(40, w - (startX - x) - 16))
        voices[0].draw(ctx, top)
        voices[1].draw(ctx, bot)
        beams.forEach((b) => b.setContext(ctx).draw())

        for (const hand of ['R', 'L'] as const) {
          for (const n of staveNotes[hand]) {
            const it = itemsOf.get(n)!
            // Klassen selbst setzen (addClass landet in VexFlow 5 nicht im SVG): Farbe kommt aus CSS
            const g = n.getSVGElement?.()
            g?.classList.add('pb-note', `hand-${hand}`)
            if (!active(hand)) g?.classList.add('is-off')
            if (it.rest) continue
            if (it.tie || it.tied) tieQueue.push({ hand, item: it, note: n, line: li })
            if (!it.noteIndex.length) continue
            const headX = n.getNoteHeadBeginX()
            const headW = n.getGlyphWidth()
            const el = (g as SVGElement | undefined) ?? null
            marks.push({ start: it.start, hand, midis: it.keys.map((kk) => kk.midi), x: headX + headW / 2, line: li, el })
            // Notennamen im Notenkopf, als Lesehilfe
            if (showNames && active(hand)) {
              const ys = n.getYs()
              it.keys.forEach((kk, i) => {
                const name = displayNoteName(kk.midi)
                const tx = document.createElementNS('http://www.w3.org/2000/svg', 'text')
                tx.setAttribute('x', String(headX + headW / 2))
                tx.setAttribute('y', String(ys[i] + 2.4))
                tx.setAttribute('class', 'pb-name')
                tx.setAttribute('font-size', name.length > 1 ? '4.8' : '6.6')
                tx.textContent = name
                ;(el ?? svg).appendChild(tx)
              })
            }
          }
        }
        x += w
      })
    })

    // Haltebögen: über den Zeilenwechsel als zwei halbe Bögen
    for (const hand of ['R', 'L'] as const) {
      const q = tieQueue.filter((t) => t.hand === hand)
      q.forEach((a, i) => {
        const b = q[i + 1]
        if (!a.item.tie || !b) return
        const idx = a.item.keys.map((_, k) => k)
        const tie =
          a.line === b.line
            ? new StaveTie({ firstNote: a.note, lastNote: b.note, firstIndexes: idx, lastIndexes: idx })
            : new StaveTie({ firstNote: a.note, firstIndexes: idx })
        tie.setContext(ctx).draw()
      })
    }

    marks.sort((a, b) => a.start - b.start)
    // Breit: das System steht mittig im Blatt statt oben
    host.style.top = layout === 'band' ? `${Math.max(8, (size.h - SYSTEM_H * scale) / 2)}px` : '8px'
    drawn.current = { marks, lineTops, scale, layout }
    lastBeat.current = NaN
  }, [notation, stage, size, showNames, showFingers, forceBand])

  // Cursor und Klassen folgen der Übung (eigener Loop, ohne React-Neuzeichnen)
  const lastBeat = useRef(NaN)
  useEffect(() => {
    let raf = 0
    const loop = () => {
      raf = requestAnimationFrame(loop)
      const d = drawn.current
      const el = box.current
      const cur = cursor.current
      const tr = track.current
      if (!d || !el || !cur || !tr) return
      const v = view()
      const active = d.marks.filter((mk) => stage === 'LR' || mk.hand === stage)
      if (!active.length) return
      // Position zwischen zwei Anschlägen interpolieren, damit der Cursor gleitet wie die Rolle
      let i = active.findIndex((mk) => mk.start > v.beat + EPS)
      if (i === -1) i = active.length
      const prev = active[Math.max(0, i - 1)]
      const next = active[Math.min(active.length - 1, i)]
      let x = prev.x
      if (next !== prev && next.line === prev.line && next.start > prev.start) {
        const f = Math.min(1, Math.max(0, (v.beat - prev.start) / (next.start - prev.start)))
        x = prev.x + (next.x - prev.x) * f
      }
      const line = prev.line
      const s = d.scale
      const lineTop = d.lineTops[line]
      if (d.layout === 'band') {
        const offset = Math.max(0, x * s - el.clientWidth * 0.3)
        tr.style.transform = `translate3d(${-offset}px, 0, 0)`
        cur.style.transform = `translate3d(${x * s - offset}px, ${(lineTop - 14) * s + tr.offsetTop - 8}px, 0)`
      } else {
        const offset = Math.max(0, (lineTop - 16) * s)
        tr.style.transform = `translate3d(0, ${-offset}px, 0)`
        cur.style.transform = `translate3d(${x * s}px, ${(lineTop - 14) * s - offset}px, 0)`
      }
      cur.style.height = `${(STAFF_GAP + 72) * s}px`
      const wrong = v.flashes.some((f) => f.kind === 'wrong' && f.age < 450)
      cur.classList.toggle('is-wrong', wrong)
      cur.classList.toggle('hand-L', !!active.find((mk) => Math.abs(mk.start - v.beat) < EPS && mk.hand === 'L') && !active.find((mk) => Math.abs(mk.start - v.beat) < EPS && mk.hand === 'R'))

      // Klassen nur bei neuem Schritt setzen
      if (v.beat === lastBeat.current) return
      lastBeat.current = v.beat
      for (const mk of d.marks) {
        if (!mk.el) continue
        const on = stage === 'LR' || mk.hand === stage
        mk.el.classList.toggle('is-done', on && mk.start < v.beat - EPS)
        mk.el.classList.toggle('is-now', on && Math.abs(mk.start - v.beat) < EPS && mk.midis.some((m) => v.expected.has(m)))
      }
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [view, stage])

  return (
    <div className="sheet-view" ref={box}>
      <div className="sheet-track" ref={track} />
      <div className="sheet-cursor" ref={cursor} aria-hidden="true" />
    </div>
  )
}
