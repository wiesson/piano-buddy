/**
 * Standard-MIDI-Datei (SMF, Format 0 und 1) lesen: Töne mit Anfang und Länge in Ticks, Tempo,
 * Taktart, Spurnamen. Mehr braucht der Import nicht; Pedal, Lautstärke-Verläufe und SysEx werden
 * überlesen. Schlagzeug (Kanal 10) bleibt draußen: Es ist kein Klavierpart.
 */

export interface MidiNote {
  midi: number
  /** Beginn in Ticks ab Stückanfang */
  tick: number
  /** Dauer in Ticks */
  durTicks: number
  velocity: number
}

export interface MidiPart {
  /** Spurname aus der Datei, sonst leer */
  name: string
  /** MIDI-Kanal 0–15 */
  channel: number
  notes: MidiNote[]
}

export interface MidiFile {
  /** Ticks pro Viertel */
  ppq: number
  /** Tempo-Wechsel: Mikrosekunden pro Viertel ab Tick */
  tempos: { tick: number; usPerQuarter: number }[]
  /** Taktart-Wechsel: Zähler und Nenner (4 = Viertel, 8 = Achtel) ab Tick */
  timeSignatures: { tick: number; num: number; den: number }[]
  /** Ein Part je Spur und Kanal (Format 0 trägt alle Kanäle in einer Spur) */
  parts: MidiPart[]
}

export class MidiError extends Error {}

const DRUM_CHANNEL = 9

export function parseMidi(data: ArrayBuffer | Uint8Array): MidiFile {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data)
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const ascii = (at: number) => String.fromCharCode(...bytes.subarray(at, at + 4))

  if (bytes.length < 14 || ascii(0) !== 'MThd') throw new MidiError('not a MIDI file')
  const headerLen = view.getUint32(4)
  const trackCount = view.getUint16(10)
  const division = view.getUint16(12)
  if (division & 0x8000) throw new MidiError('SMPTE time is not supported')
  const ppq = division || 480

  const tempos: MidiFile['tempos'] = []
  const timeSignatures: MidiFile['timeSignatures'] = []
  const parts: MidiPart[] = []

  let pos = 8 + headerLen
  for (let tr = 0; tr < trackCount && pos + 8 <= bytes.length; tr++) {
    const id = ascii(pos)
    const len = view.getUint32(pos + 4)
    const start = pos + 8
    const end = Math.min(bytes.length, start + len)
    pos = start + len
    if (id !== 'MTrk') {
      tr-- // fremder Block zählt nicht als Spur
      continue
    }
    readTrack(bytes, start, end, tempos, timeSignatures, parts)
  }

  tempos.sort((a, b) => a.tick - b.tick)
  timeSignatures.sort((a, b) => a.tick - b.tick)
  return { ppq, tempos, timeSignatures, parts: parts.filter((p) => p.notes.length) }
}

function readTrack(
  bytes: Uint8Array,
  start: number,
  end: number,
  tempos: MidiFile['tempos'],
  timeSignatures: MidiFile['timeSignatures'],
  parts: MidiPart[],
) {
  let p = start
  let tick = 0
  let status = 0
  let name = ''
  const byChannel = new Map<number, MidiPart>()
  /** Offene Töne je Kanal und Taste, ältester zuerst */
  const open = new Map<number, { tick: number; velocity: number }[]>()

  const vlq = () => {
    let v = 0
    for (let i = 0; i < 4 && p < end; i++) {
      const b = bytes[p++]
      v = (v << 7) | (b & 0x7f)
      if (!(b & 0x80)) break
    }
    return v
  }
  const partOf = (ch: number) => {
    let part = byChannel.get(ch)
    if (!part) {
      part = { name: '', channel: ch, notes: [] }
      byChannel.set(ch, part)
    }
    return part
  }
  const close = (ch: number, midi: number, at: number) => {
    const list = open.get(ch * 128 + midi)
    const on = list?.shift()
    if (!on) return
    partOf(ch).notes.push({ midi, tick: on.tick, durTicks: Math.max(1, at - on.tick), velocity: on.velocity })
  }

  while (p < end) {
    tick += vlq()
    if (p >= end) break
    let b = bytes[p]
    if (b & 0x80) {
      p++
    } else if (status) {
      b = status // laufender Status: das Byte gehört schon zu den Daten
    } else {
      break // Daten ohne Status: Spur kaputt, Rest überlesen
    }

    if (b === 0xff) {
      const type = bytes[p++]
      const len = vlq()
      const d = bytes.subarray(p, Math.min(end, p + len))
      p += len
      if (type === 0x2f) break
      if (type === 0x51 && d.length >= 3) tempos.push({ tick, usPerQuarter: (d[0] << 16) | (d[1] << 8) | d[2] })
      else if (type === 0x58 && d.length >= 2) timeSignatures.push({ tick, num: d[0], den: 2 ** d[1] })
      else if (type === 0x03 && !name) name = new TextDecoder().decode(d).trim()
      continue
    }
    if (b === 0xf0 || b === 0xf7) {
      p += vlq()
      status = 0
      continue
    }

    status = b
    const kind = b & 0xf0
    const ch = b & 0x0f
    if (kind === 0xc0 || kind === 0xd0) {
      p += 1
      continue
    }
    const d1 = bytes[p++]
    const d2 = bytes[p++]
    if (ch === DRUM_CHANNEL) continue
    if (kind === 0x90 && d2 > 0) {
      const key = ch * 128 + d1
      const list = open.get(key) ?? []
      list.push({ tick, velocity: d2 })
      open.set(key, list)
    } else if (kind === 0x80 || kind === 0x90) {
      close(ch, d1, tick)
    }
  }

  // Ohne Note-Off endet ein Ton mit der Spur
  for (const [key, list] of open) for (let i = list.length; i > 0; i--) close(Math.floor(key / 128), key % 128, tick)

  for (const part of byChannel.values()) {
    part.name = name
    part.notes.sort((a, b) => a.tick - b.tick || a.midi - b.midi)
    parts.push(part)
  }
}
