/**
 * Vergleichsmessung: MIDI ist die Wahrheit, das Mikrofon wird dagegen gemessen.
 * Jeder MIDI-Anschlag wartet bis zu MATCH_MS auf eine Mikrofon-Meldung derselben Taste.
 * Mikrofon-Meldungen ohne passenden Anschlag sind Fehlalarme (Oktav-/Nachbarfehler benannt).
 */
const MATCH_MS = 700
/** Das Mikrofon darf minimal vor MIDI melden (Zeitbasen unterscheiden sich leicht) */
const EARLY_MS = 60

export interface BenchRelation {
  kind: 'octaveAbove' | 'octaveBelow' | 'neighbor' | 'other'
  /** MIDI-Note des tatsächlichen Anschlags */
  of: number
}

export interface BenchEntry {
  midi: number
  kind: 'hit' | 'missed' | 'false'
  latencyMs?: number
  /** bei Fehlalarm: was tatsächlich gespielt wurde, z. B. Oktave darunter */
  relation?: BenchRelation
  tMs: number
}

export interface BenchStats {
  played: number
  detected: number
  missed: number
  falseAlarms: number
  medianLatencyMs: number | null
  recent: BenchEntry[]
}

export class MicBench {
  private truths: { midi: number; tMs: number; matched: boolean }[] = []
  private entries: BenchEntry[] = []
  private latencies: number[] = []
  played = 0
  detected = 0
  missed = 0
  falseAlarms = 0

  truth(midi: number, tMs: number) {
    this.played++
    this.truths.push({ midi, tMs, matched: false })
  }

  mic(midi: number, tMs: number) {
    const t = this.truths.find((x) => !x.matched && x.midi === midi && tMs - x.tMs >= -EARLY_MS && tMs - x.tMs <= MATCH_MS)
    if (t) {
      t.matched = true
      this.detected++
      const latency = Math.max(0, tMs - t.tMs)
      this.latencies.push(latency)
      this.entries.push({ midi, kind: 'hit', latencyMs: Math.round(latency), tMs })
      return
    }
    this.falseAlarms++
    // Was wurde stattdessen gespielt? Hilft beim Deuten: Oktav- oder Nachbarfehler
    const near = [...this.truths].reverse().find((x) => tMs - x.tMs <= MATCH_MS && tMs - x.tMs >= -EARLY_MS)
    let relation: BenchRelation | undefined
    if (near) {
      const d = midi - near.midi
      const kind = Math.abs(d) === 12 ? (d > 0 ? 'octaveAbove' : 'octaveBelow') : Math.abs(d) <= 2 ? 'neighbor' : 'other'
      relation = { kind, of: near.midi }
    }
    this.entries.push({ midi, kind: 'false', relation, tMs })
  }

  tick(nowMs: number) {
    for (const t of this.truths) {
      if (t.matched || nowMs - t.tMs <= MATCH_MS) continue
      t.matched = true // als erledigt markieren
      this.missed++
      this.entries.push({ midi: t.midi, kind: 'missed', tMs: nowMs })
    }
    this.truths = this.truths.filter((t) => nowMs - t.tMs < MATCH_MS * 3)
  }

  reset() {
    this.truths = []
    this.entries = []
    this.latencies = []
    this.played = this.detected = this.missed = this.falseAlarms = 0
  }

  stats(): BenchStats {
    const sorted = [...this.latencies].sort((a, b) => a - b)
    return {
      played: this.played,
      detected: this.detected,
      missed: this.missed,
      falseAlarms: this.falseAlarms,
      medianLatencyMs: sorted.length ? Math.round(sorted[Math.floor(sorted.length / 2)]) : null,
      recent: this.entries.slice(-6).reverse(),
    }
  }
}
