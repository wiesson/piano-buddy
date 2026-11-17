import { audioContext, setAudioSession } from './audio'
import { NoteAnalyzer, OnsetDetector, calibrate, heardNotes, type Calibration, type Frame } from './detector'

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
}

export class MicListener {
  private stream: MediaStream | null = null
  private source: MediaStreamAudioSourceNode | null = null
  private analyser: AnalyserNode | null = null
  private timer: number | null = null
  private cal: Calibration | null = null
  private calFrames: Frame[] = []
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
      const onset = new OnsetDetector(() => this.cal)
      const buf = new Float32Array(this.analyser.fftSize)
      this.calFrames = []
      this.calUntil = performance.now() + CALIBRATION_MS
      this.set('calibrating')
      this.timer = window.setInterval(() => {
        if (!this.analyser) return
        this.analyser.getFloatTimeDomainData(buf)
        const frame = analyzer.analyze(buf)
        const now = performance.now()
        if (this.status === 'calibrating') {
          this.calFrames.push(frame)
          this.cb.onLevel?.(Math.min(1, frame.rms * 8), [])
          if (now >= this.calUntil) {
            this.cal = calibrate(this.calFrames)
            this.set('listening')
          }
          return
        }
        for (const m of onset.push(frame, now, this.cb.expected())) this.cb.onNote(m, now)
        this.cb.onLevel?.(Math.min(1, frame.rms * 8), heardNotes(frame, this.cal))
      }, HOP_MS)
    } catch (e) {
      console.warn('Mikrofon', e)
      this.stop()
      this.set(e instanceof DOMException && e.name === 'NotAllowedError' ? 'denied' : 'error')
    }
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
