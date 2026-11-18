import { NoteAnalyzer, type Frame } from './detector'
import { midiToFreq } from '../music/notes'

/** Nur für Tests: synthetische Klaviertöne und ihre Analyse-Frames im Takt der App */
// Synthetischer Klavierton: Teiltöne mit Inharmonizität, schnelle Ansprache, exponentielles Abklingen.
const SR = 48000
const FFT = 8192
// 20 ms wie die App (HOP_MS in mic.ts)
export const HOP = 960

export function render(
  durS: number,
  events: { midi: number; at: number; amp?: number; dur?: number; fund?: number }[],
  noise = 0.002,
  seed = 1,
) {
  const out = new Float32Array(Math.round(durS * SR))
  let x = seed
  const rnd = () => ((x = (x * 1103515245 + 12345) % 2 ** 31) / 2 ** 31) * 2 - 1
  for (let i = 0; i < out.length; i++) out[i] = rnd() * noise
  for (const e of events) {
    const f0 = midiToFreq(e.midi)
    const start = Math.round(e.at * SR)
    const amp = e.amp ?? 0.2
    // Taste losgelassen: der Dämpfer stoppt die Saite (ohne Pedal) innerhalb von ~0,1 s
    const release = e.dur ?? 0.5
    for (let h = 1; h <= 10; h++) {
      const f = h * f0 * Math.sqrt(1 + 0.0004 * h * h)
      if (f > SR / 2) break
      // tiefe Töne haben schwache Grundtöne, hohe Teiltöne fallen ab
      const a = (amp / h ** 0.9) * (h === 1 ? (e.fund ?? (e.midi < 48 ? 0.4 : 1)) : 1)
      const tau = 1.2 / h ** 0.5
      for (let i = start; i < out.length; i++) {
        const t = (i - start) / SR
        const damp = t > release ? Math.exp(-(t - release) / 0.03) : 1
        out[i] += a * Math.sin(2 * Math.PI * f * t) * Math.exp(-t / tau) * Math.min(1, t / 0.004) * damp
      }
    }
  }
  return out
}

export function frames(sig: Float32Array) {
  const an = new NoteAnalyzer(SR, FFT)
  const res: { t: number; f: Frame }[] = []
  for (let end = FFT; end <= sig.length; end += HOP) {
    res.push({ t: (end / SR) * 1000, f: an.analyze(sig.subarray(end - FFT, end)) })
  }
  return res
}


/**
 * Wie das Mikrofon den Klang aufnimmt. „ideal“: voller Frequenzgang. „phone“: Handy-Mikrofon vor
 * Lautsprechern, tiefe Frequenzen stark gedämpft (Hochpass ~300 Hz, 24 dB/Oktave). Damit verlieren
 * tiefe Töne ihren Grundton, genau der Fall vom Testabend.
 */
export type MicModel = 'ideal' | 'phone'
const micGain = (model: MicModel, f: number) => (model === 'phone' ? 1 / (1 + (300 / f) ** 4) : 1)

/** Klaviertöne mit Teiltönen, Inharmonizität, Abklingen und Dämpfer beim Loslassen */
export function synthesize(
  events: { midi: number; at: number; dur: number; amp?: number; fund?: number; fundRise?: number }[],
  durS: number,
  opts: { sampleRate?: number; noise?: number; mic?: MicModel; seed?: number } = {},
) {
  const sr = opts.sampleRate ?? SR
  const out = new Float32Array(Math.round(durS * sr))
  let x = opts.seed ?? 7
  const rnd = () => ((x = (x * 1103515245 + 12345) % 2 ** 31) / 2 ** 31) * 2 - 1
  const noise = opts.noise ?? 0.002
  for (let i = 0; i < out.length; i++) out[i] = rnd() * noise
  for (const e of events) {
    const f0 = midiToFreq(e.midi)
    const start = Math.round(e.at * sr)
    const end = Math.min(out.length, start + Math.round((e.dur + 0.3) * sr))
    for (let h = 1; h <= 10; h++) {
      const f = h * f0 * Math.sqrt(1 + 0.0004 * h * h)
      if (f > sr / 2) break
      const fund = e.fund ?? (e.midi < 48 ? 0.4 : 1)
      const a = ((e.amp ?? 0.2) / h ** 0.9) * (h === 1 ? fund : 1) * micGain(opts.mic ?? 'ideal', f)
      // Grundton baut sich langsam auf (Raum, Resonanzboden): fundRise Sekunden statt sofort
      const rise = h === 1 && e.fundRise ? e.fundRise : 0.004
      const tau = 1.2 / h ** 0.5
      const w = (2 * Math.PI * f) / sr
      for (let i = start; i < end; i++) {
        const t = (i - start) / sr
        const damp = t > e.dur ? Math.exp(-(t - e.dur) / 0.03) : 1
        out[i] += a * Math.sin(w * (i - start)) * Math.exp(-t / tau) * Math.min(1, t / rise) * damp
      }
    }
  }
  return out
}

/**
 * Summen oder Singen: harmonische Quelle mit gleitender Tonhöhe, Vibrato und weichem Einsatz.
 * Spektrum wie geschlossener Mund: starke erste Harmonische, darüber steil abfallend. Stützstellen
 * (Zeit, Tonhöhe als MIDI-Wert, Lautstärke 0..1) werden linear verbunden.
 */
export function hum(
  points: { t: number; midi: number; amp: number }[],
  durS: number,
  opts: { vibHz?: number; vibCents?: number; mic?: MicModel; level?: number; seed?: number } = {},
) {
  const sr = SR
  const out = new Float32Array(Math.round(durS * sr))
  let x = opts.seed ?? 11
  const rnd = () => ((x = (x * 1103515245 + 12345) % 2 ** 31) / 2 ** 31) * 2 - 1
  for (let i = 0; i < out.length; i++) out[i] = rnd() * 0.002
  const vibHz = opts.vibHz ?? 5.5
  const vibCents = opts.vibCents ?? 25
  const level = opts.level ?? 0.15
  const phases = new Float64Array(13)
  let k = 0
  const from = Math.round(points[0].t * sr)
  const to = Math.min(out.length, Math.round(points[points.length - 1].t * sr))
  for (let i = from; i < to; i++) {
    const t = i / sr
    while (k < points.length - 2 && t > points[k + 1].t) k++
    const a = points[k]
    const b = points[k + 1]
    const u = Math.min(1, Math.max(0, (t - a.t) / (b.t - a.t)))
    const midi = a.midi + (b.midi - a.midi) * u + (vibCents / 100) * Math.sin(2 * Math.PI * vibHz * t)
    const amp = (a.amp + (b.amp - a.amp) * u) * level
    const f0 = midiToFreq(midi)
    let s = 0
    for (let h = 1; h <= 12; h++) {
      const f = h * f0
      if (f > sr / 2) break
      phases[h] += (2 * Math.PI * f) / sr
      s += (Math.sin(phases[h]) / h ** 2) * micGain(opts.mic ?? 'ideal', f)
    }
    out[i] += s * amp
  }
  return out
}
