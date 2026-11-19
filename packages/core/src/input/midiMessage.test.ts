import { describe, expect, it } from 'vitest'
import { midiEvent } from './midiMessage'

describe('MIDI-Meldungen', () => {
  it('liest Anschlag mit Stärke, auf jedem Kanal', () => {
    expect(midiEvent([0x90, 60, 100], 5)).toEqual({ type: 'on', midi: 60, velocity: 100, tMs: 5, source: 'midi' })
    expect(midiEvent([0x9f, 61, 1], 6)).toEqual({ type: 'on', midi: 61, velocity: 1, tMs: 6, source: 'midi' })
  })

  it('liest Note-Off und Note-On mit Stärke 0 als Loslassen', () => {
    expect(midiEvent([0x80, 60, 64], 7)).toEqual({ type: 'off', midi: 60, tMs: 7, source: 'midi' })
    expect(midiEvent([0x93, 60, 0], 8)).toEqual({ type: 'off', midi: 60, tMs: 8, source: 'midi' })
  })

  it('liest das Haltepedal: ab 64 getreten, darunter losgelassen', () => {
    expect(midiEvent([0xb0, 64, 64], 9)).toEqual({ type: 'pedal', down: true, tMs: 9, source: 'midi' })
    expect(midiEvent([0xb0, 64, 63], 9)).toEqual({ type: 'pedal', down: false, tMs: 9, source: 'midi' })
    expect(midiEvent([0xb0, 64, 127], 9)?.type).toBe('pedal')
  })

  it('übergeht alles andere: andere Controller, Klangwahl, Pitchbend, zu kurze Meldungen', () => {
    expect(midiEvent([0xb0, 7, 100], 0)).toBeNull() // Lautstärke
    expect(midiEvent([0xc0, 5], 0)).toBeNull() // Klangwahl, zwei Bytes
    expect(midiEvent([0xe0, 0, 64], 0)).toBeNull() // Pitchbend
    expect(midiEvent([0xf8], 0)).toBeNull() // Uhr
    expect(midiEvent(null, 0)).toBeNull()
  })
})
