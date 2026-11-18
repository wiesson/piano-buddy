import { A, MIN_MIDI, OnsetDetector, S, type Calibration, type Frame } from './detector'
import type { ProfileLookup } from './profile'

/**
 * Lernmodus: Anschläge aufnehmen, prüfen und bewerten. Ohne React, damit es testbar bleibt.
 *
 * Ein Anschlag wird am Pegel erkannt, nicht an der Tonhöhe: Die App weiß, welche Taste dran ist,
 * und soll auch melden, wenn etwas anderes kam. Danach wird geprüft, ob es wirklich die Taste war
 * (nicht Nachbar, nicht Oktave), und gemessen, ob die feste Erkennung ihn erkannt hätte.
 */

/** Frames vor dem Anschlag, für die Bewertung mit dem echten Onset-Detektor */
const PRE = 12
/** Frames nach dem Anschlag: 25 × 20 ms = 0,5 s */
const TAKE = 25
const COOLDOWN_MS = 150

export interface Take {
  pre: Frame[]
  frames: Frame[]
}

export class TakeCollector {
  private pre: Frame[] = []
  private capturing: Frame[] | null = null
  private preAtStart: Frame[] = []
  private cooldownUntil = 0

  constructor(
    private onStrike: () => void,
    private onTake: (t: Take) => void,
  ) {}

  push(f: Frame, tMs: number) {
    if (this.capturing) {
      this.capturing.push(f)
      if (this.capturing.length >= TAKE) {
        this.onTake({ pre: this.preAtStart, frames: this.capturing })
        this.capturing = null
        this.cooldownUntil = tMs + COOLDOWN_MS
      }
    } else if (tMs > this.cooldownUntil && this.pre.length >= 4) {
      // Pegel deutlich über dem Minimum der letzten Viertelsekunde: angeschlagen
      const min = Math.min(...this.pre.map((p) => p.rms))
      if (f.rms > Math.max(0.003, min * 2.5)) {
        this.capturing = [f]
        this.preAtStart = [...this.pre]
        this.onStrike()
      }
    }
    this.pre.push(f)
    if (this.pre.length > PRE) this.pre.shift()
  }

  reset() {
    this.capturing = null
    this.pre = []
  }
}

export type TakeCheck =
  | { ok: true }
  | { ok: false; reason: 'quiet' }
  | { ok: false; reason: 'other'; heard: number }

const mean = (fs: Frame[], get: (f: Frame) => number) => fs.reduce((s, f) => s + get(f), 0) / Math.max(1, fs.length)

/** War es wirklich die Taste? Laut genug, kein lauterer Nachbar, nicht die Oktave daneben */
export function checkTake(take: Take, target: number, cal: Calibration | null): TakeCheck {
  const settled = take.frames.filter((f) => f.freshness < 2)
  const fs = settled.length >= 3 ? settled : take.frames
  const sal = (m: number) => mean(fs, (f) => S(f, m))
  const own = sal(target)
  const noise = cal ? cal.noise[target - MIN_MIDI] : 0
  if (own < Math.max(0.5, noise * 6)) return { ok: false, reason: 'quiet' }

  // Lauter als die Taste? Dann den lautesten Nachbarn nennen (Teiltöne streuen auch auf andere)
  const loudest = [-2, -1, 1, 2].map((d) => target + d).reduce((a, b) => (sal(b) > sal(a) ? b : a))
  if (sal(loudest) > own * 1.1) return { ok: false, reason: 'other', heard: loudest }

  const a = (m: number, h: number) => mean(fs, (f) => A(f, m, h))
  const a1 = a(target, 1)
  // Oktave darunter: deren Grundton und ihr 3. Teilton (fällt nicht auf die Teiltöne der Taste)
  const sub = target - 12
  if (a(sub, 1) > a1 * 0.5 && a(sub, 3) > a1 * 0.3) return { ok: false, reason: 'other', heard: sub }
  // Oktave darüber: Grundton und 3. Teilton der Taste fehlen, nur der 2. ist da
  const a2 = a(target, 2)
  if (a1 < a2 * 0.03 && a(target, 3) < a2 * 0.15) return { ok: false, reason: 'other', heard: target + 12 }
  return { ok: true }
}

/**
 * Was hätte der Onset-Detektor aus diesem Anschlag gemacht (mit oder ohne Profil)?
 * hit: die Taste erkannt. extra: Töne, die er zusätzlich gemeldet hätte, im Üben also falsche Töne.
 */
export function evaluateTake(take: Take, target: number, cal: Calibration | null, profile: ProfileLookup | null) {
  const det = new OnsetDetector(() => cal, undefined, undefined, undefined, undefined, () => profile)
  const expected = new Set([target])
  let hit = false
  const extra: number[] = []
  ;[...take.pre, ...take.frames].forEach((f, i) => {
    for (const m of det.push(f, i * 20, expected)) {
      if (m === target) hit = true
      else if (!extra.includes(m)) extra.push(m)
    }
  })
  return { hit, extra }
}

/** Hätte der Onset-Detektor den Anschlag erkannt? */
export const recognizedIn = (take: Take, target: number, cal: Calibration | null, profile: ProfileLookup | null) =>
  evaluateTake(take, target, cal, profile).hit
