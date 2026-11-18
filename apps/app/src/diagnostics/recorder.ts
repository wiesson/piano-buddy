import { A, HARMONICS, MIN_MIDI, S, type Calibration, type Frame } from '@piano/core/audio/detector'

/**
 * Diagnose beim Üben: Aufnahme des Mikrofons plus jeder erkannte Ton mit den Messwerten davor
 * und danach und dem, was in dem Moment erwartet war. Damit lassen sich doppelt gezählte Töne,
 * akzeptiertes Summen oder überhörte Töne genau nachvollziehen und im Prüfstand nachspielen.
 */

const PRE = 12
const POST = 15

interface OnsetRecord {
  tMs: number
  midi: number
  expected: number[]
  pre: Frame[]
  post: Frame[]
}

export class PracticeRecorder {
  private ring: Frame[] = []
  private onsets: OnsetRecord[] = []
  private pending: OnsetRecord[] = []
  private rec: MediaRecorder | null = null
  private chunks: Blob[] = []
  private startedAt = performance.now()

  /** Aufnahme starten (Mikrofon-Strom aus dem MicListener) */
  start(stream: MediaStream | null) {
    if (!stream || typeof MediaRecorder === 'undefined' || this.rec) return
    try {
      this.chunks = []
      this.rec = new MediaRecorder(stream)
      this.rec.ondataavailable = (e) => e.data.size && this.chunks.push(e.data)
      this.rec.start(1000)
    } catch {
      this.rec = null
    }
  }

  frame(f: Frame) {
    this.ring.push(f)
    if (this.ring.length > PRE) this.ring.shift()
    for (const p of this.pending) p.post.push(f)
    this.pending = this.pending.filter((p) => p.post.length < POST)
  }

  note(midi: number, tMs: number, expected: number[]) {
    const r: OnsetRecord = { tMs: tMs - this.startedAt, midi, expected, pre: [...this.ring], post: [] }
    this.onsets.push(r)
    this.pending.push(r)
  }

  get empty() {
    return this.onsets.length === 0
  }

  /** Aufnahme beenden und Messung zusammenstellen */
  async finish(meta: Record<string, unknown>, cal: Calibration | null): Promise<{ data: Blob; audio: Blob | null; summary: string }> {
    const audio = await this.stopRecording()
    const round = (x: number) => Math.round(x * 10000) / 10000
    const rowsFor = (o: OnsetRecord) => {
      const set = new Set<number>()
      for (const m of [o.midi, ...o.expected]) for (const d of [-24, -19, -12, -2, -1, 0, 1, 2, 12, 19]) set.add(m + d)
      return [...set].filter((k) => k >= MIN_MIDI).sort((a, b) => a - b)
    }
    const dump = (f: Frame, rows: number[]) => ({
      rms: round(f.rms),
      fresh: round(f.freshness),
      notes: Object.fromEntries(
        rows.map((k) => [k, { s: round(S(f, k)), a: Array.from({ length: HARMONICS }, (_, h) => round(A(f, k, h + 1))) }]),
      ),
    })
    const data = {
      app: 'Piano Buddy',
      kind: 'practice',
      v: 1,
      createdAt: new Date().toISOString(),
      userAgent: navigator.userAgent,
      noise: cal ? Array.from(cal.noise, round) : null,
      ...meta,
      onsets: this.onsets.map((o) => {
        const rows = rowsFor(o)
        return { tMs: Math.round(o.tMs), midi: o.midi, expected: o.expected, pre: o.pre.map((f) => dump(f, rows)), post: o.post.map((f) => dump(f, rows)) }
      }),
    }
    const summary = JSON.stringify({ ...meta, onsets: this.onsets.length, device: navigator.userAgent.slice(0, 120) })
    return { data: new Blob([JSON.stringify(data)], { type: 'application/json' }), audio, summary }
  }

  private stopRecording(): Promise<Blob | null> {
    const rec = this.rec
    this.rec = null
    if (!rec || rec.state === 'inactive') return Promise.resolve(null)
    return new Promise((resolve) => {
      rec.onstop = () => resolve(new Blob(this.chunks, { type: rec.mimeType || 'audio/webm' }))
      rec.stop()
    })
  }
}
