import { describe, expect, it } from 'vitest'
import type { MidiFile } from './midiFile'
import { learningPath, pieceFromMidi, pieceNotes, type Piece } from './piece'

const meta = { id: 'p1', title: 'Test', addedAt: 0 }
const file = (parts: MidiFile['parts'], extra: Partial<MidiFile> = {}): MidiFile => ({
  ppq: 480,
  tempos: [],
  timeSignatures: [],
  parts,
  ...extra,
})
const note = (midi: number, tick: number, durTicks: number) => ({ midi, tick, durTicks, velocity: 80 })

describe('Stück aus einer MIDI-Datei', () => {
  it('zieht ungenaue Anschläge aufs Sechzehntel und rechnet das Tempo in Schläge pro Minute', () => {
    const p = pieceFromMidi(
      file([{ name: '', channel: 0, notes: [note(72, 7, 470), note(74, 478, 245), note(76, 721, 230)] }], {
        tempos: [{ tick: 0, usPerQuarter: 750_000 }],
      }),
      meta,
    )
    expect(p.bpm).toBe(80)
    expect(p.parts[0].notes).toEqual([
      { midi: 72, start: 0, dur: 1 },
      { midi: 74, start: 1, dur: 0.5 },
      { midi: 76, start: 1.5, dur: 0.5 },
    ])
  })

  it('beginnt mit dem Takt des ersten Tons, nicht mit leeren Takten davor', () => {
    // Erster Ton im dritten Takt (4/4), auf Schlag 2
    const p = pieceFromMidi(file([{ name: '', channel: 0, notes: [note(60, 480 * 9, 480)] }]), meta)
    expect(p.parts[0].notes[0].start).toBe(1)
  })

  it('teilt eine einzelne Spur am Trennton in links und rechts', () => {
    const p = pieceFromMidi(file([{ name: '', channel: 0, notes: [note(48, 0, 480), note(59, 0, 480), note(60, 0, 480), note(76, 0, 480)] }]), meta)
    expect(pieceNotes(p).map((n) => [n.midi, n.hand])).toEqual([
      [48, 'L'],
      [59, 'L'],
      [60, 'R'],
      [76, 'R'],
    ])
  })

  it('gibt bei mehreren Spuren der höheren die rechte und der tieferen die linke Hand', () => {
    const p = pieceFromMidi(
      file([
        { name: 'Bass', channel: 0, notes: [note(43, 0, 480), note(64, 480, 480)] },
        { name: 'Melodie', channel: 1, notes: [note(72, 0, 480), note(55, 480, 480)] },
      ]),
      meta,
    )
    expect(p.parts.map((x) => [x.name, x.hand])).toEqual([
      ['Bass', 'L'],
      ['Melodie', 'R'],
    ])
    // Die Spur bestimmt die Hand, nicht die Lage des einzelnen Tons
    expect(pieceNotes(p).find((n) => n.midi === 55)?.hand).toBe('R')
  })

  it('schätzt die Tonart aus den Tönen', () => {
    // G-Dur-Tonleiter: ein Kreuz
    const g = [67, 69, 71, 72, 74, 76, 78, 79].map((m, i) => note(m, i * 480, 480))
    expect(pieceFromMidi(file([{ name: '', channel: 0, notes: g }]), meta).key).toBe(1)
  })
})

/** Ein Stück direkt aus Takten bauen: je Takt rechts ein Akkord (Melodie oben), links zwei Töne */
function pieceOfBars(bars: number[][]): Piece {
  const right = bars.flatMap((chord, b) => chord.map((m) => ({ midi: m, start: b * 4, dur: 4 })))
  const left = bars.flatMap((chord, b) => [
    { midi: chord[0] - 24, start: b * 4, dur: 2 },
    { midi: chord[0] - 17, start: b * 4 + 2, dur: 2 },
  ])
  return {
    ...meta,
    bpm: 80,
    beatsPerBar: 4,
    beatUnit: 4,
    key: 0,
    split: 60,
    parts: [
      { name: 'R', hand: 'R', notes: right },
      { name: 'L', hand: 'L', notes: left },
    ],
  }
}

describe('Lernfassungen', () => {
  const A = [60, 64, 67]
  const B = [62, 65, 69]
  const C = [64, 67, 71]
  // 24 Takte: A A A A A A A A | B … | wieder wie der erste Teil
  const bars = [...Array(8).fill(A), ...Array(8).fill(B), ...Array(8).fill(A)]

  it('übt jeden Teil erst leicht, dann im Original, zum Schluss das ganze Stück; Wiederholungen nur einmal', () => {
    const path = learningPath(pieceOfBars(bars))
    expect(path.map((s) => `${s.section?.letter ?? 'ganz'} ${s.version}`)).toEqual(['A easy', 'A full', 'B easy', 'B full', 'ganz full'])
    // Der erste Teil sagt, dass er wiederkommt
    expect(path[0].lesson.goal.de).toContain('17–24')
  })

  it('leicht heißt: rechts nur die Melodie (oberster Ton), links ein Ton pro Takt', () => {
    const easy = learningPath(pieceOfBars([A, B, C]))[0]
    expect(easy.version).toBe('easy')
    const right = easy.lesson.notes.filter((n) => n.hand === 'R')
    const left = easy.lesson.notes.filter((n) => n.hand === 'L')
    expect(right.map((n) => n.midi)).toEqual([67, 69, 71])
    expect(left.map((n) => [n.midi, n.start, n.dur])).toEqual([
      [36, 0, 4],
      [38, 4, 4],
      [40, 8, 4],
    ])
  })

  it('beginnt jeder Teil bei Schlag 0, damit Taktstriche und Stufen stimmen', () => {
    const path = learningPath(pieceOfBars([...Array(8).fill(A), ...Array(8).fill(B)]))
    const b = path.find((s) => s.section?.letter === 'B' && s.version === 'full')!
    expect(Math.min(...b.lesson.notes.map((n) => n.start))).toBe(0)
    expect(b.lesson.notes.filter((n) => n.hand === 'R').map((n) => n.midi).slice(0, 3)).toEqual(B)
  })
})
