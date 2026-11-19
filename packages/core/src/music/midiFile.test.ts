import { describe, expect, it } from 'vitest'
import { MidiError, parseMidi } from './midiFile'

/** Kleine SMF-Schreibhilfe: Ereignisse als [Delta, ...Bytes] */
const vlq = (n: number) => {
  const out = [n & 0x7f]
  while ((n >>= 7)) out.unshift((n & 0x7f) | 0x80)
  return out
}
const u32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]
const u16 = (n: number) => [(n >>> 8) & 255, n & 255]
const track = (events: [number, ...number[]][]) => {
  const body = events.flatMap(([d, ...b]) => [...vlq(d), ...b])
  return [...[0x4d, 0x54, 0x72, 0x6b], ...u32(body.length), ...body]
}
const smf = (format: number, ppq: number, tracks: number[][]) =>
  new Uint8Array([...[0x4d, 0x54, 0x68, 0x64], ...u32(6), ...u16(format), ...u16(tracks.length), ...u16(ppq), ...tracks.flat()])
const name = (s: string): [number, ...number[]] => [0, 0xff, 0x03, s.length, ...[...s].map((c) => c.charCodeAt(0))]
const END: [number, ...number[]] = [0, 0xff, 0x2f, 0]

describe('MIDI-Datei lesen', () => {
  it('liest Tempo, Taktart, Spurnamen und Töne mit Anfang und Länge', () => {
    const file = parseMidi(
      smf(1, 480, [
        // Tempospur: 100 Viertel pro Minute (600 000 µs), 3/4
        track([[0, 0xff, 0x51, 3, 0x09, 0x27, 0xc0], [0, 0xff, 0x58, 4, 3, 2, 24, 8], END]),
        track([
          name('Melodie'),
          [0, 0x90, 64, 90], // E4 an
          [480, 0x80, 64, 0], // nach einem Viertel aus
          [0, 0x90, 67, 80], // G4 an
          [0, 67, 0], // laufender Status, Anschlag 0 = aus: sofort wieder aus (Länge mindestens 1 Tick)
          [0, 72, 70], // C5 an, laufender Status
          [960, 72, 0], // nach einer Halben aus
          END,
        ]),
      ]),
    )
    expect(file.ppq).toBe(480)
    expect(file.tempos).toEqual([{ tick: 0, usPerQuarter: 600_000 }])
    expect(file.timeSignatures).toEqual([{ tick: 0, num: 3, den: 4 }])
    expect(file.parts).toHaveLength(1)
    expect(file.parts[0].name).toBe('Melodie')
    expect(file.parts[0].notes.map((n) => [n.midi, n.tick, n.durTicks])).toEqual([
      [64, 0, 480],
      [67, 480, 1],
      [72, 480, 960],
    ])
  })

  it('trennt in Format 0 die Kanäle in eigene Parts und lässt das Schlagzeug weg', () => {
    const file = parseMidi(
      smf(0, 96, [
        track([
          [0, 0x90, 48, 80], // Kanal 1: C3
          [0, 0x91, 72, 80], // Kanal 2: C5
          [0, 0x99, 36, 100], // Kanal 10: Bassdrum
          [96, 0x80, 48, 0],
          [0, 0x81, 72, 0],
          [0, 0x89, 36, 0],
          END,
        ]),
      ]),
    )
    expect(file.parts.map((p) => [p.channel, p.notes.map((n) => n.midi)])).toEqual([
      [0, [48]],
      [1, [72]],
    ])
  })

  it('beendet einen Ton ohne Note-Off am Ende der Spur', () => {
    const file = parseMidi(smf(0, 480, [track([[0, 0x90, 60, 80], [1920, 0xff, 0x2f, 0]])]))
    expect(file.parts[0].notes).toEqual([{ midi: 60, tick: 0, durTicks: 1920, velocity: 80 }])
  })

  it('lehnt Dateien ab, die keine MIDI-Dateien sind', () => {
    expect(() => parseMidi(new TextEncoder().encode('ID3 das ist ein mp3'))).toThrow(MidiError)
  })
})
