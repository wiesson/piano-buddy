import { audioContext, setAudioSession } from './audio'
import { NoteAnalyzer, OnsetDetector, calibrate, heardNotes, type Calibration, type Frame } from './detector'
import type { ProfileLookup } from './profile'

export type MicStatus = 'off' | 'starting' | 'calibrating' | 'listening' | 'denied' | 'error'

const CALIBRATION_MS = 900
const HOP_MS = 20

export interface MicCallbacks {
  /** Welche Töne gerade erwartet werden (für die gezielte Prüfung) */
  expected: () => ReadonlySet<number>
  onNote: (midi: number, tMs: number) => void
  onStatus: (s: MicStatus) => void
  /** Pegel 0..1 und frei gehörte Töne, für die Anzeige */
  onLevel?: (level: number, heard: number[]) => void
  /** Eingelernte Klangprofile; ohne sie gelten die festen Regeln */
  profile?: () => ProfileLookup | null
  /** Jeder analysierte Frame nach der Ruhemessung (Lernmodus) */
  onFrame?: (frame: Frame, tMs: number) => void
}

export class MicListener {
  private stream: MediaStream | null = null
  private source: MediaStreamAudioSourceNode | null = null
  private analyser: AnalyserNode | null = null
  private timer: number | null = null
  private cal: Calibration | null = null
  private calFrames: Frame[] = []
  /** Abstände der Analyse-Frames (ms): Ist der Timer ausgebremst, wird die Erkennung ungenauer */
  private gaps: number[] = []
  private lastFrameAt = 0
  private calUntil = 0
  status: MicStatus = 'off'

  constructor(private cb: MicCallbacks) {}

  private set(s: MicStatus) {
    this.status = s
    this.cb.onStatus(s)
  }

  async start() {
    if (this.status !== 'off' && this.status !== 'denied' && this.status !== 'error') return
    this.set('starting')
    try {
      setAudioSession('play-and-record')
      const ctx = audioContext()
      // Echo-Unterdrückung & Co. verfälschen Musik (und knacksen in iOS-Safari): alles aus.
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      })
      await ctx.resume()
      this.source = ctx.createMediaStreamSource(this.stream)
      this.analyser = ctx.createAnalyser()
      this.analyser.fftSize = 8192
      this.analyser.smoothingTimeConstant = 0
      this.source.connect(this.analyser)
      const analyzer = new NoteAnalyzer(ctx.sampleRate, this.analyser.fftSize)
      const profile = this.cb.profile ?? (() => null)
      const onset = new OnsetDetector(() => this.cal, undefined, undefined, undefined, undefined, profile)
      const buf = new Float32Array(this.analyser.fftSize)
      this.calFrames = []
      this.gaps = []
      this.lastFrameAt = 0
      this.calUntil = performance.now() + CALIBRATION_MS
      this.set('calibrating')
      this.timer = window.setInterval(() => {
        if (!this.analyser) return
        this.analyser.getFloatTimeDomainData(buf)
        const frame = analyzer.analyze(buf)
        const now = performance.now()
        if (this.lastFrameAt) {
          this.gaps.push(now - this.lastFrameAt)
          if (this.gaps.length > 3000) this.gaps.splice(0, 1000)
        }
        this.lastFrameAt = now
        if (this.status === 'calibrating') {
          this.calFrames.push(frame)
          this.cb.onLevel?.(Math.min(1, frame.rms * 8), [])
          if (now >= this.calUntil) {
            this.cal = calibrate(this.calFrames)
            this.set('listening')
          }
          return
        }
        this.cb.onFrame?.(frame, now)
        for (const m of onset.push(frame, now, this.cb.expected())) this.cb.onNote(m, now)
        this.cb.onLevel?.(Math.min(1, frame.rms * 8), heardNotes(frame, this.cal, undefined, profile()))
      }, HOP_MS)
    } catch (e) {
      console.warn('Mikrofon', e)
      this.stop()
      this.set(e instanceof DOMException && e.name === 'NotAllowedError' ? 'denied' : 'error')
    }
  }

  /** Ruhemessung des Raums (nach dem Start), für den Lernmodus */
  get calibration() {
    return this.cal
  }

  /**
   * Was das Gerät wirklich eingestellt hat (Echo-Unterdrückung & Co. trotz Wunsch an?),
   * Abtastrate und Frame-Abstände: für die Diagnose
   */
  get info() {
    const track = this.stream?.getAudioTracks()[0]
    const g = [...this.gaps].sort((a, b) => a - b)
    const q = (p: number) => (g.length ? Math.round(g[Math.min(g.length - 1, Math.floor(g.length * p))] * 10) / 10 : null)
    return {
      settings: track?.getSettings?.() ?? null,
      sampleRate: this.analyser?.context.sampleRate ?? null,
      frameGapMs: { n: g.length, p50: q(0.5), p95: q(0.95), max: q(1) },
    }
  }

  /** Der Mikrofon-Strom, z. B. für einen Mitschnitt */
  get mediaStream() {
    return this.stream
  }

  /** Neu kalibrieren, z. B. wenn es im Raum lauter geworden ist */
  recalibrate() {
    if (this.status !== 'listening') return
    this.calFrames = []
    this.calUntil = performance.now() + CALIBRATION_MS
    this.set('calibrating')
  }

  stop() {
    if (this.timer !== null) clearInterval(this.timer)
    this.timer = null
    this.source?.disconnect()
    this.stream?.getTracks().forEach((t) => t.stop())
    this.stream = null
    this.source = null
    this.analyser = null
    setAudioSession('playback')
    if (this.status !== 'denied' && this.status !== 'error') this.set('off')
  }
}
