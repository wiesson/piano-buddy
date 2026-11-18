import { RealFFT, hann } from './fft'
import { midiToFreq } from '../music/notes'
import type { ProfileLookup } from './profile'

/**
 * Erkennung erwarteter Klaviertöne aus einem Mikrofon-Signal.
 *
 * Kein freies Transkribieren: Die App weiß, welche Töne kommen sollen, und prüft
 * gezielt deren Grundton und Obertöne. Dazu kommen Sperren gegen Oktav- und
 * Quintfehler (ein tiefer Ton hat Obertöne genau dort, wo höhere Töne liegen) und
 * eine Anschlags-Regel: Ein Ton zählt erst, wenn seine Energie seit Beginn des
 * Schritts deutlich gestiegen ist. Ein noch klingender Ton zählt also nicht doppelt.
 */

export const MIN_MIDI = 33 // A1
export const MAX_MIDI = 100 // E7
export const HARMONICS = 6
const CENTS = 40
/** Inharmonizität einer Klaviersaite, grober Mittelwert für die Mittellage */
const INHARM_B = 0.0004

export interface Frame {
  /** amp[(midi - MIN_MIDI) * HARMONICS + (h - 1)] = Spitzenbetrag am h-ten Teilton */
  amp: Float64Array
  /** gewichtete Summe der Teiltöne je Note */
  salience: Float64Array
  rms: number
  /** Energie im letzten Viertel des Fensters relativ zum Rest: groß = gerade erst angeschlagen */
  freshness: number
  /** Hüllkurven des Fensters je Band (voll, höhenbetont) in 5-ms-Blöcken, neuester Block zuletzt */
  env?: Float32Array[]
}

/** Blocklänge der Hüllkurve für das Anschlags-Gate */
export const ENV_BLOCK_MS = 5

export class NoteAnalyzer {
  readonly fftSize: number
  readonly sampleRate: number
  private fft: RealFFT
  private window: Float64Array
  private mag: Float64Array
  private ranges: Int32Array // [lo, hi] je (Note, Teilton); -1 wenn oberhalb Nyquist/Grenze
  /** exakte (gebrochene) Bin-Position je (Note, Teilton) für schmale Fenster */
  private centers: Float64Array

  constructor(sampleRate: number, fftSize = 8192) {
    this.sampleRate = sampleRate
    this.fftSize = fftSize
    this.fft = new RealFFT(fftSize)
    this.window = hann(fftSize)
    this.mag = new Float64Array(fftSize / 2)
    const n = MAX_MIDI - MIN_MIDI + 1
    this.ranges = new Int32Array(n * HARMONICS * 2)
    this.centers = new Float64Array(n * HARMONICS)
    const df = sampleRate / fftSize
    const maxHz = Math.min(6000, sampleRate / 2 - df * 2)
    for (let m = MIN_MIDI; m <= MAX_MIDI; m++) {
      const f0 = midiToFreq(m)
      for (let h = 1; h <= HARMONICS; h++) {
        const i = ((m - MIN_MIDI) * HARMONICS + (h - 1)) * 2
        const f = h * f0 * Math.sqrt(1 + INHARM_B * h * h)
        if (f > maxHz) {
          this.ranges[i] = -1
          this.ranges[i + 1] = -1
          continue
        }
        const k = f / df
        // Toleranz ±40 Cent. In der tiefen Lage ist das weniger als ein Bin: Dann wird genau an der
        // Sollfrequenz interpoliert (lo = hi = 0 als Marker), statt das Maximum über ±1 Bin zu nehmen.
        // Sonst fängt das Fenster die Flanke des Halbton-Nachbarn ein, der dort unter 3 Bins entfernt liegt.
        const spread = (f * (2 ** (CENTS / 1200) - 1)) / df
        this.centers[i / 2] = k
        if (spread < 1) {
          this.ranges[i] = 0
          this.ranges[i + 1] = 0
        } else {
          this.ranges[i] = Math.max(1, Math.round(k - spread))
          this.ranges[i + 1] = Math.round(k + spread)
        }
      }
    }
  }

  analyze(samples: ArrayLike<number>): Frame {
    const { fftSize, mag, ranges } = this
    let sum = 0
    let head = 0
    const q = (fftSize * 3) / 4
    for (let i = 0; i < fftSize; i++) {
      sum += samples[i] * samples[i]
      if (i < q) head += samples[i] * samples[i]
    }
    const tail = sum - head
    this.fft.magnitude(samples, this.window, mag)
    const n = MAX_MIDI - MIN_MIDI + 1
    const amp = new Float64Array(n * HARMONICS)
    const salience = new Float64Array(n)
    for (let j = 0; j < n; j++) {
      let s = 0
      for (let h = 0; h < HARMONICS; h++) {
        const i = (j * HARMONICS + h) * 2
        const lo = ranges[i]
        if (lo < 0) continue
        let peak = 0
        if (lo === 0) {
          const k = this.centers[j * HARMONICS + h]
          const k0 = Math.floor(k)
          const fr = k - k0
          peak = mag[k0] * (1 - fr) + mag[k0 + 1] * fr
        } else for (let k = lo; k <= ranges[i + 1]; k++) if (mag[k] > peak) peak = mag[k]
        amp[j * HARMONICS + h] = peak
        s += peak * (h === 0 ? 1 : 0.8)
      }
      salience[j] = s
    }
    return { amp, salience, rms: Math.sqrt(sum / fftSize), freshness: (tail * 3) / (head + 1e-12), env: this.envelope(samples) }
  }

  /**
   * Hüllkurven in 5-ms-Blöcken, am Fensterende ausgerichtet (für das Anschlags-Gate), in zwei
   * Bändern: voll (Basstöne) und höhenbetont (Differenz benachbarter Samples). Obere Teiltöne
   * klingen schnell ab, ein neuer Anschlag sticht dort auch über einem nachklingenden Bass heraus.
   */
  private envelope(samples: ArrayLike<number>): Float32Array[] {
    const B = Math.max(1, Math.round((this.sampleRate * ENV_BLOCK_MS) / 1000))
    const n = Math.floor(this.fftSize / B)
    const off = this.fftSize - n * B
    const full = new Float64Array(n)
    const high = new Float64Array(n)
    for (let k = 0; k < n; k++) {
      let e = 0
      let h = 0
      for (let i = Math.max(1, off + k * B); i < off + (k + 1) * B; i++) {
        const x = samples[i]
        const d = x - samples[i - 1]
        e += x * x
        h += d * d
      }
      full[k] = e
      high[k] = h
    }
    // RMS über 20 ms (4 Blöcke): Tiefe Töne ohne Grundton schwanken in kürzeren Fenstern so stark,
    // dass eine einzelne Spitze wie ein Anschlag aussähe
    const smooth = (block: Float64Array) => {
      const env = new Float32Array(n)
      const W = 4
      for (let k = 0; k < n; k++) {
        let e = 0
        for (let j = Math.max(0, k - W + 1); j <= k; j++) e += block[j]
        env[k] = Math.sqrt(e / (Math.min(W, k + 1) * B))
      }
      return env
    }
    return [smooth(full), smooth(high)]
  }
}

export const A = (f: Frame, midi: number, h: number) => f.amp[(midi - MIN_MIDI) * HARMONICS + (h - 1)] ?? 0
export const S = (f: Frame, midi: number) => f.salience[midi - MIN_MIDI] ?? 0
const inRange = (m: number) => m >= MIN_MIDI && m <= MAX_MIDI

/** Untertöne, deren Obertöne genau auf dem Grundton von m landen: Oktave, Duodezime, Doppeloktave */
const SUBS: [number, number][] = [
  [12, 2],
  [19, 3],
  [24, 4],
]

/**
 * Für die freie Schätzung zusätzlich der 5. und 6. Teilton (große Dezime plus Oktave, Duodezime
 * plus Oktave): Bei schwachem Grundton klingen sie sonst wie eigene, falsche Töne.
 */
const PARTIALS: [number, number][] = [...SUBS, [28, 5], [31, 6]]

export interface Calibration {
  /** Ruhe-Salienz je Note (Raumrauschen, Lüfter, Brummen) */
  noise: Float64Array
  /** Ruhe-Pegel der Hüllkurven je Band (90. Perzentil), Grundlage für die Mindesthöhe eines Anschlags */
  envFloor?: number[]
}

export function calibrate(frames: Frame[]): Calibration {
  const n = MAX_MIDI - MIN_MIDI + 1
  const noise = new Float64Array(n)
  for (let j = 0; j < n; j++) {
    const vals = frames.map((f) => f.salience[j]).sort((a, b) => a - b)
    // 90. Perzentil, damit kurze Geräusche während der Kalibrierung nicht die Schwelle bestimmen
    noise[j] = vals[Math.floor(vals.length * 0.9)] ?? 0
  }
  const bands = frames[0]?.env?.length ?? 0
  const envFloor = Array.from({ length: bands }, (_, b) => {
    const v = frames.flatMap((f) => (f.env?.[b] ? Array.from(f.env[b]) : [])).sort((x, y) => x - y)
    return v[Math.floor(v.length * 0.9)] ?? 0
  })
  return { noise, envFloor: bands ? envFloor : undefined }
}

export interface DetectOptions {
  /** Abstand zur Ruhe (Faktor auf die Salienz) */
  snr: number
  /** absolute Mindest-Salienz, falls nicht kalibriert */
  floor: number
}

export const DEFAULT_DETECT: DetectOptions = { snr: 6, floor: 0.5 }

/**
 * Klingt der Ton `m` in diesem Frame? `expected` sind alle Töne, die gerade erwartet
 * werden: Ist der Unterton selbst erwartet (z. B. G3 und G4 gleichzeitig), entfällt
 * die Oktavsperre.
 */
export function isSounding(
  f: Frame,
  m: number,
  expected: ReadonlySet<number>,
  cal: Calibration | null,
  opt: DetectOptions = DEFAULT_DETECT,
  profile: ProfileLookup | null = null,
  /**
   * Darf das Profil die Prüfung lockern? Für erwartete Töne ja. Für die freie Schätzung fremder
   * Töne nein: Dort würde Lockern nur mehr falsche Töne melden. Erklären (Oktavsperre) darf es immer.
   */
  relax = true,
): boolean {
  if (!inRange(m)) return false
  const s = S(f, m)
  const noise = cal ? cal.noise[m - MIN_MIDI] : 0
  if (s < Math.max(opt.floor, noise * opt.snr)) return false

  // Mindestens ein Fünftel der stärksten Note im Frame, sonst ist es Nebengeräusch
  let max = 0
  for (let j = 0; j < f.salience.length; j++) if (f.salience[j] > max) max = f.salience[j]
  if (s < max * 0.2) return false

  const a1 = A(f, m, 1)
  const a2 = A(f, m, 2)
  // Eingelernt: Wie klingt dieser Ton auf diesem Klavier mit diesem Mikrofon? (profile.ts)
  const own = relax ? (profile?.(m) ?? null) : null

  // Teiltonreihe: wie ein Durchschnittsklavier ODER wie beim Einlernen gemessen. Das Profil lockert
  // nur, es verschärft nie: Ein schlecht aufgenommenes Profil kann die Erkennung nicht verschlechtern.
  if (!harmonicSeries(f, m, a1, a2)) {
    if (!own) return false
    // Im Akkord liegen Teiltöne anderer erwarteter Töne auf manchen Teiltönen von m: Die zählen
    // für den Vergleich nicht, sonst passt die Form nie zum eingelernten Einzelton
    const a: number[] = []
    const b: number[] = []
    for (let h = 1; h <= HARMONICS; h++) {
      if (h > 1 && sharedPartial(m, h, expected)) continue
      a.push(A(f, m, h))
      b.push(own.shape[h - 1])
    }
    if (a.length < 2 || similarity(a, b) < 0.75) return false
  }

  // Ein deutlich lauterer Nachbarton (bis zwei Halbtöne) verschmiert ins Fenster, vor allem
  // direkt nach dem Anschlag. Dann ist m nur Übersprechen. Ausnahme: der Nachbar ist selbst erwartet.
  for (const d of [-2, -1, 1, 2]) {
    const nb = m + d
    if (!inRange(nb) || expected.has(nb)) continue
    if (S(f, nb) * 0.6 > s) return false
  }
  // Gespielt wurde die Oktave darüber: Dann fehlt der Grundton, nur der 2. Teilton ist da.
  // Mit Profil gilt das Verhältnis dieses Klaviers: Ist der Grundton hier immer schwach,
  // darf er es auch beim Üben sein, nur nicht viel schwächer als beim Einlernen.
  let octaveRatio = m < 48 ? 0.08 : 0.25
  if (own && own.shape[1] > 0) octaveRatio = Math.min(octaveRatio, (own.shape[0] / own.shape[1]) * 0.3)
  if (a2 > 0 && a1 < a2 * octaveRatio) return false

  // Gespielt wurde ein tieferer Ton, dessen Oberton hier liegt.
  for (const [d, h] of SUBS) {
    const sub = m - d
    if (!inRange(sub) || expected.has(sub)) continue
    // Der Unterton kann selbst nur Oberton eines erwarteten, noch tieferen Tons sein
    // (G2 erwartet → Energie auf G3 → darf G4 nicht sperren).
    if (SUBS.some(([d2]) => expected.has(sub - d2))) continue
    const subFund = A(f, sub, 1)
    // Ein echter tiefer Ton hat auch Teiltöne, die NICHT auf m fallen (z. B. die Quinte darüber).
    const otherH = h === 2 ? 3 : 2
    const subOther = A(f, sub, otherH)
    const subOwn = profile?.(sub)
    // Beleg für den tiefen Ton nur, wenn sein eigener Teilton nicht von einem anderen erwarteten
    // Ton stammt (im Akkord C4+E4+A4 liegt E4s Oberton genau auf dem 3. Teilton von A3)
    if (subOwn && subOwn.shape[otherH - 1] > 0.05 && !sharedPartial(sub, otherH, expected)) {
      // Mit Profil des tiefen Tons: Aus seinem eigenen Teilton schätzen, wie laut er klingt, und
      // daraus, wie viel Energie er auf m legt. Erklärt das fast alles, wurde nur er gespielt.
      // Das greift auch, wenn sein Grundton auf diesem Klavier kaum zu hören ist.
      const gain = subOther / subOwn.shape[otherH - 1]
      if (a1 <= gain * subOwn.shape[h - 1] * 2.5) return false
      continue
    }
    if (subFund > a1 * 0.35 && subOther > a1 * 0.2) return false
  }
  return true
}

/**
 * Feste Regel ohne Profil: Ein echter Ton hat eine Teiltonreihe wie ein Durchschnittsklavier.
 */
function harmonicSeries(f: Frame, m: number, a1: number, a2: number) {
  // Ein echter Ton hat eine Teiltonreihe: Von den ersten drei Teiltönen müssen mindestens
  // zwei deutlich da sein. Sonst ist es nur ein zufällig passender Oberton eines anderen Tons
  // (z. B. der 6. Teilton von A1 liegt genau auf E4) oder Übersprechen des Nachbartons.
  let peak = 0
  for (let h = 1; h <= HARMONICS; h++) peak = Math.max(peak, A(f, m, h))
  let available = 0
  let supported = 0
  for (let h = 1; h <= 3; h++) {
    if (f.amp[(m - MIN_MIDI) * HARMONICS + (h - 1)] === 0 && h > 1) continue
    available++
    if (A(f, m, h) > peak * 0.1) supported++
  }
  if (supported < Math.min(2, available)) return false
  return Math.max(a1, a2) >= peak * 0.25
}

/** Halbtöne vom Grundton zum h-ten Teilton (gerundet): 0, 12, 19, 24, 28, 31 */
const PARTIAL_STEPS = [0, 12, 19, 24, 28, 31, 34, 36]

/** Fällt der h-te Teilton von m auf einen Teilton eines anderen erwarteten Tons? */
function sharedPartial(m: number, h: number, expected: ReadonlySet<number>) {
  const target = m + PARTIAL_STEPS[h - 1]
  for (const e of expected) {
    if (e === m) continue
    if (PARTIAL_STEPS.some((d) => e + d === target)) return true
  }
  return false
}

/** Ähnlichkeit zweier Teiltonformen, 0..1 (Kosinus) */
export function similarity(a: ArrayLike<number>, b: ArrayLike<number>) {
  let ab = 0
  let aa = 0
  let bb = 0
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    ab += a[i] * b[i]
    aa += a[i] * a[i]
    bb += b[i] * b[i]
  }
  return aa && bb ? ab / Math.sqrt(aa * bb) : 0
}

/**
 * Freie Schätzung für die Anzeige „gehört“: alle Töne, die deutlich klingen und
 * nicht nur Obertöne eines tieferen Tons sind.
 */
export function heardNotes(
  f: Frame,
  cal: Calibration | null,
  opt: DetectOptions = DEFAULT_DETECT,
  profile: ProfileLookup | null = null,
  /** Töne, von denen feststeht, dass sie klingen (erwartet und erkannt): Ihre Obertöne sind keine eigenen Töne */
  sounding: readonly number[] = [],
): number[] {
  const out: number[] = []
  const empty = new Set<number>()
  for (let m = MIN_MIDI; m <= MAX_MIDI; m++) {
    if (!isSounding(f, m, empty, cal, opt, profile, false)) continue
    // lokales Maximum gegenüber Halbton-Nachbarn
    if (S(f, m) < S(f, m - 1) || S(f, m) < S(f, m + 1)) continue
    // von bereits gefundenem tieferem Ton erklärt?
    const explained = [...sounding, ...out].some((k) =>
      PARTIALS.some(([d, h]) => m - k === d && A(f, m, 1) < A(f, k, h) * 1.5),
    )
    if (!explained) out.push(m)
  }
  return out
}

/**
 * Macht aus dem Frame-Strom einzelne Anschläge (Note-On-Ereignisse), wie sie auch
 * MIDI oder Touch liefern. Ein Anschlag ist die steigende Flanke von
 * „klingt UND Energie ist gegenüber dem Minimum der letzten ~300 ms um `rise` gestiegen“.
 * So zählt ein ausklingender Ton nicht erneut, ein neuer Anschlag desselben Tons schon.
 */
/** So lange gilt ein erkannter Anschlag als nachklingend (Obertöne erklären) */
const RING_MS = 2000
/**
 * Nach einem Anschlag gilt für diesen Ton so lange sein laufender Spitzenpegel als Vergleichswert
 * für „Energie steigt“. Sonst vergleicht er noch ~270 ms mit der Stille vor dem Anschlag, und ein
 * einziger flackernder Frame zählt denselben Ton ein zweites Mal (Doppelzählung).
 */
const HOLD_MS = 150
/**
 * Anschlags-Gate: Ein Ton zählt nur, wenn kurz vorher die Hüllkurve gesprungen ist (innerhalb von
 * 20 ms um mindestens 40 % des danach erreichten Pegels). Klavier hat das, Summen, Singen und
 * Gleiten nicht. Ein Anschlag deckt jeden Ton höchstens einmal.
 */
const ATTACK_RISE_BLOCKS = 4 // 20 ms
const ATTACK_PEAK_BLOCKS = 6 // Spitzenpegel in den 30 ms danach
const ATTACK_RATIO = 0.4
/**
 * …und der Pegel muss dann schon zu 60 % stehen. Ein linearer Einsatz aus der Stille (Summen,
 * „hm“) erreicht das Verhältnis oben in seinen ersten 20 ms immer genau, egal wie langsam er ist;
 * beides zugleich schafft nur ein schneller Anstieg wie der Hammer auf der Saite.
 */
const ATTACK_ARRIVED = 0.6
const ATTACK_MERGE_MS = 60
/** So lange nach dem Anschlag darf ein Ton noch bestätigt werden (Erkennung braucht ~90–120 ms) */
const ATTACK_MAX_AGE_MS = 300
/** Mindestsprung als Vielfaches des Ruhe-Pegels */
const ATTACK_FLOOR = 4

interface Attack {
  tMs: number
  ratio: number
  used: Set<number>
}

export class OnsetDetector {
  private hist: Float64Array[]
  /** Grundton-Amplitude je Note in denselben Frames (für „der tiefe Ton wurde nicht neu angeschlagen“) */
  private histA1: Float64Array[]
  private pos = 0
  private filled = 0
  private count: Uint8Array
  private lastOnset: Float64Array
  /** Zeitpunkt der letzten Anschlags-Transiente (Energie springt am Fensterende) */
  private lastTransient = -Infinity
  /** Zuletzt erkannte Anschläge: Sie klingen nach, ihre Obertöne sind keine eigenen Töne */
  private ringing = new Map<number, number>()
  /** Vergleichswert halten: bis wann und auf welchem Spitzenpegel je Ton */
  private holdUntil: Float64Array
  private holdPeak: Float64Array
  /** Hüllkurve nach absolutem 5-ms-Block (Frames überlappen; neuere Werte überschreiben ältere) */
  private env: Map<number, number>[] = []
  private envEvaluated = -Infinity
  private attacks: Attack[] = []
  /** Gate an, sobald Frames eine Hüllkurve tragen (NoteAnalyzer); Tests mit Hand-Frames ohne */
  gate = true

  constructor(
    private cal: () => Calibration | null,
    private opt: DetectOptions = DEFAULT_DETECT,
    private rise = 2.2,
    historyFrames = 10,
    private refractoryMs = 120,
    /** Eingelernte Klangprofile (Lernmodus), sonst feste Regeln */
    private profile: () => ProfileLookup | null = () => null,
  ) {
    const n = MAX_MIDI - MIN_MIDI + 1
    this.hist = Array.from({ length: historyFrames }, () => new Float64Array(n))
    this.histA1 = Array.from({ length: historyFrames }, () => new Float64Array(n))
    this.count = new Uint8Array(n)
    this.lastOnset = new Float64Array(n).fill(-Infinity)
    this.holdUntil = new Float64Array(n).fill(-Infinity)
    this.holdPeak = new Float64Array(n)
  }

  /** Hüllkurven des Frames einsortieren und neu auswertbare Blöcke auf Anschläge prüfen */
  private trackAttacks(f: Frame, tMs: number) {
    const bands = f.env
    if (!bands?.length) return
    const len = bands[0].length
    const newest = Math.round(tMs / ENV_BLOCK_MS)
    bands.forEach((env, i) => {
      const map = (this.env[i] ??= new Map())
      for (let k = 0; k < len; k++) map.set(newest - (len - 1 - k), env[k])
      for (const b of map.keys()) if (b < newest - 400) map.delete(b)
    })
    const floors = this.cal()?.envFloor ?? []
    // Anschlag in einem Band: schneller Sprung, der einen großen Teil des Folgepegels ausmacht
    const ratioAt = (map: Map<number, number>, floor: number, b: number) => {
      const now = map.get(b)
      const before = map.get(b - ATTACK_RISE_BLOCKS)
      if (now === undefined || before === undefined) return 0
      const d = now - before
      if (d <= floor * ATTACK_FLOOR || d <= 0) return 0
      let peak = 0
      for (let j = b; j <= b + ATTACK_PEAK_BLOCKS; j++) peak = Math.max(peak, map.get(j) ?? 0)
      const ratio = d / (peak + 1e-12)
      return ratio >= ATTACK_RATIO && now >= ATTACK_ARRIVED * peak ? ratio : 0
    }
    const from = Math.max(this.envEvaluated + 1, newest - len + 1 + ATTACK_RISE_BLOCKS)
    for (let b = from; b <= newest - ATTACK_PEAK_BLOCKS; b++) {
      this.envEvaluated = b
      const ratio = Math.max(...this.env.map((map, i) => ratioAt(map, floors[i] ?? 0, b)))
      if (!ratio) continue
      const at = b * ENV_BLOCK_MS
      const last = this.attacks[this.attacks.length - 1]
      if (last && at - last.tMs < ATTACK_MERGE_MS) {
        last.ratio = Math.max(last.ratio, ratio)
        continue
      }
      this.attacks.push({ tMs: at, ratio, used: new Set() })
    }
    this.attacks = this.attacks.filter((a) => tMs - a.tMs <= ATTACK_MAX_AGE_MS)
  }

  /** Gibt es einen frischen Anschlag, den dieser Ton noch nicht verbraucht hat? Dann verbrauchen. */
  private takeAttack(m: number, tMs: number) {
    const a = this.attacks.find((x) => tMs - x.tMs <= ATTACK_MAX_AGE_MS && !x.used.has(m))
    if (!a) return false
    a.used.add(m)
    return true
  }

  /**
   * @param expected Töne, die gerade erwartet werden (hebt die Oktavsperre zwischen ihnen auf)
   * @returns Anschläge in diesem Frame
   */
  push(f: Frame, tMs: number, expected: ReadonlySet<number>): number[] {
    const cal = this.cal()
    const n = MAX_MIDI - MIN_MIDI + 1
    const onsets: number[] = []
    if (f.freshness > 1.3) this.lastTransient = tMs
    const gated = this.gate && !!f.env
    if (gated) this.trackAttacks(f, tMs)
    const transient = tMs - this.lastTransient < 160
    const profile = this.profile()
    const soundingExpected = [...expected].filter((m) => isSounding(f, m, expected, cal, this.opt, profile))
    for (const [m, at] of this.ringing) if (tMs - at > RING_MS) this.ringing.delete(m)
    const explainers = [...new Set([...soundingExpected, ...this.ringing.keys()])]
    const heard = new Set(heardNotes(f, cal, this.opt, profile, explainers))
    const minOf = (j: number) => {
      let min = Infinity
      for (let k = 0; k < this.filled; k++) min = Math.min(min, this.hist[k][j])
      return min
    }
    for (let j = 0; j < n; j++) {
      const m = j + MIN_MIDI
      const min = minOf(j)
      const s = f.salience[j]
      // Erneuter Anschlag eines noch klingenden Tons (E-E, D-D im Tempo): Der alte Ton ist nicht
      // abgeklungen, die Energie steigt nur auf etwa das 1,5-Fache. Zählt für erwartete Töne, wenn
      // kurz zuvor eine Anschlags-Transiente war; fremde Töne brauchen weiter den vollen Anstieg.
      const rising =
        this.filled === 0 ? false : s > min * this.rise || (expected.has(m) && transient && s > min * 1.25)
      // Erwartete Töne prüfen wir gezielt, alle anderen nur, wenn sie frei gehört werden.
      let sounding = expected.has(m) ? soundingExpected.includes(m) : heard.has(m)
      // Melodieton auf einem Oberton eines noch klingenden Basstons (G4 über C3): Die Oktavsperre
      // hielte ihn für den Oberton. Steigt aber der Ton selbst stark an und der tiefe nicht, ist
      // er neu angeschlagen: dann ohne Sperre gegen diese tiefen Töne prüfen.
      if (!sounding && expected.has(m) && rising) {
        const subs = SUBS.map(([d]) => m - d).filter((x) => inRange(x))
        // Grundton des tiefen Tons statt seiner Gesamtenergie: Die steigt mit, weil der neue Ton
        // auf einem seiner Teiltöne liegt
        const quiet = subs.every((x) => {
          let lo = Infinity
          for (let k = 0; k < this.filled; k++) lo = Math.min(lo, this.histA1[k][x - MIN_MIDI])
          return A(f, x, 1) < lo * 1.3 + 1e-9
        })
        if (quiet) sounding = isSounding(f, m, new Set([...expected, ...subs]), cal, this.opt, profile)
      }
      // Bestätigung über mehrere Frames: erwartete Töne 2, fremde Töne 3. Frames, in denen der
      // Anschlag erst am Fensterende liegt, zählen nie: Dort ist das Spektrum verschmiert und der
      // Halbton-Nachbar „klingt“ mit. Das kostet ~90 ms, Fehlalarme kosten mehr als späte Meldungen.
      const need = expected.has(m) ? 2 : 3
      const ok = rising && sounding && f.freshness < 3
      this.count[j] = ok ? Math.min(255, this.count[j] + 1) : 0
      if (this.count[j] === need && tMs - this.lastOnset[j] > this.refractoryMs && (!gated || this.takeAttack(m, tMs))) {
        onsets.push(m)
        this.lastOnset[j] = tMs
        this.ringing.set(m, tMs)
        this.holdUntil[j] = tMs + HOLD_MS
        this.holdPeak[j] = 0
      }
    }
    this.hist[this.pos].set(f.salience)
    // Vergleichswert halten (siehe HOLD_MS): Die Historie dieses Tons zeigt seinen Spitzenpegel
    for (let j = 0; j < n; j++) {
      if (tMs >= this.holdUntil[j]) continue
      this.holdPeak[j] = Math.max(this.holdPeak[j], f.salience[j])
      for (const h of this.hist) h[j] = this.holdPeak[j]
    }
    for (let j = 0; j < n; j++) this.histA1[this.pos][j] = f.amp[j * HARMONICS]
    this.pos = (this.pos + 1) % this.hist.length
    this.filled = Math.min(this.filled + 1, this.hist.length)
    return onsets
  }
}
