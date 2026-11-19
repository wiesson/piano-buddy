import type { InputEvent } from './events'

/**
 * Eine MIDI-1.0-Kanalmeldung als Ereignis. Web MIDI liefert jede Meldung vollständig (ohne
 * Running Status); die iOS-App liest die Bytes selbst (PianoMidi.swift) und meldet fertige
 * Ereignisse. Jeder Kanal zählt: Digitalpianos senden je nach Klang auf verschiedenen Kanälen.
 *
 * - Note-On mit Stärke über 0: Anschlag
 * - Note-Off, oder Note-On mit Stärke 0: Loslassen
 * - Controller 64 (Haltepedal): ab 64 getreten
 * Alles andere (Klangwahl, Pitchbend, Uhr) ist für das Üben ohne Bedeutung.
 */
export function midiEvent(data: ArrayLike<number> | null | undefined, tMs: number): InputEvent | null {
  if (!data || data.length < 3) return null
  const kind = data[0] & 0xf0
  const a = data[1] & 0x7f
  const b = data[2] & 0x7f
  if (kind === 0x90 && b > 0) return { type: 'on', midi: a, velocity: b, tMs, source: 'midi' }
  if (kind === 0x80 || kind === 0x90) return { type: 'off', midi: a, tMs, source: 'midi' }
  if (kind === 0xb0 && a === 64) return { type: 'pedal', down: b >= 64, tMs, source: 'midi' }
  return null
}
