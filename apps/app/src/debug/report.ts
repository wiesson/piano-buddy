import type { DebugRing } from './ring'

/**
 * „Melden“ aus der Debug-Ebene (STU-1286): die letzten 30 Sekunden mit allen Anschlägen, Urteilen
 * und Zuständen, die Einstellungen, Gerät und App-Version, ein Bild der Bahn und eine kurze
 * Sprachnotiz. Landet in Convex (kind „report“) und wird mit `pnpm reports` abgeholt; die Ereignisse
 * reichen, um den Durchgang im Prüfstand nachzuspielen (goldene Aufnahmen, STU-1284).
 */

export const REPORT_WINDOW_MS = 30_000
/** Länger als eine Minute spricht niemand über eine komische Stelle */
export const VOICE_MAX_MS = 60_000

export interface ReportContext {
  lessonId: string
  stage: string
  tempo: string
  view: string
  keyHelp: string
  phase: string
  variant: Record<string, unknown>
  variantName: string
  blind: boolean
  inputs: { midi: string[]; mic: string }
}

export interface Snapshot {
  data: Record<string, unknown>
  summary: Record<string, unknown>
}

/** Sofort beim Tipp festhalten: Was danach kommt (Sprachnotiz), gehört nicht mehr dazu */
export function snapshot(ring: DebugRing, ctx: ReportContext, image: string | null): Snapshot {
  const now = performance.now()
  const { strikes, marks } = ring.since(REPORT_WINDOW_MS, now)
  const rel = (t: number | undefined) => (t === undefined ? undefined : Math.round((t - now) * 10) / 10)
  const data = {
    app: 'Piano Buddy',
    kind: 'report',
    v: 1,
    version: __APP_VERSION__,
    createdAt: new Date().toISOString(),
    userAgent: navigator.userAgent,
    screen: { w: window.innerWidth, h: window.innerHeight, dpr: window.devicePixelRatio },
    ...ctx,
    /** Zeiten in ms relativ zum Tipp auf „Melden“ (negativ: davor) */
    strikes: strikes.map((s) => ({
      ...s,
      tMs: rel(s.tMs),
      arrMs: rel(s.arrMs),
      frameMs: rel(s.frameMs),
      verdictMs: rel(s.verdictMs),
      offMs: rel(s.offMs),
    })),
    marks: marks.map((m) => ({ ...m, tMs: rel(m.tMs) })),
    image,
  }
  const summary = {
    lessonId: ctx.lessonId,
    stage: ctx.stage,
    tempo: ctx.tempo,
    view: ctx.view,
    variant: ctx.variantName || 'custom',
    blind: ctx.blind,
    strikes: strikes.length,
    version: __APP_VERSION__,
    device: navigator.userAgent.slice(0, 120),
  }
  return { data, summary }
}

/** Bild der Bahn (Canvas der Pianorolle), verkleinert, damit der Bericht klein bleibt */
export function laneImage(): string | null {
  const c = document.querySelector<HTMLCanvasElement>('.roll-canvas')
  if (!c || !c.width) return null
  try {
    const scale = Math.min(1, 900 / c.width)
    const out = document.createElement('canvas')
    out.width = Math.round(c.width * scale)
    out.height = Math.round(c.height * scale)
    out.getContext('2d')!.drawImage(c, 0, 0, out.width, out.height)
    return out.toDataURL('image/jpeg', 0.8)
  } catch {
    return null
  }
}

/** Sprachnotiz: eigene Mikrofon-Aufnahme, unabhängig von der Ton-Erkennung */
export class VoiceNote {
  private rec: MediaRecorder | null = null
  private stream: MediaStream | null = null
  private chunks: Blob[] = []
  /** Beendet oder abgebrochen: Eine spät erteilte Mikrofon-Freigabe startet nichts mehr */
  private closed = false

  async start(): Promise<boolean> {
    if (typeof MediaRecorder === 'undefined' || !navigator.mediaDevices?.getUserMedia) return false
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      if (this.closed) {
        stream.getTracks().forEach((t) => t.stop())
        return false
      }
      this.stream = stream
      this.rec = new MediaRecorder(stream)
      this.chunks = []
      this.rec.ondataavailable = (e) => e.data.size && this.chunks.push(e.data)
      this.rec.start(500)
      return true
    } catch {
      this.release()
      return false
    }
  }

  /** Beenden; null, wenn nichts aufgenommen wurde */
  stop(): Promise<Blob | null> {
    this.closed = true
    const rec = this.rec
    this.rec = null
    if (!rec || rec.state === 'inactive') {
      this.release()
      return Promise.resolve(null)
    }
    return new Promise((resolve) => {
      const done = () => {
        clearTimeout(timer)
        this.release()
        const blob = new Blob(this.chunks, { type: rec.mimeType || 'audio/mp4' })
        resolve(blob.size ? blob : null)
      }
      // Kommt das Ende der Aufnahme nicht, wird mit dem gesendet, was da ist
      const timer = setTimeout(done, 3000)
      rec.onstop = done
      rec.stop()
    })
  }

  cancel() {
    this.closed = true
    if (this.rec && this.rec.state !== 'inactive') this.rec.stop()
    this.rec = null
    this.release()
  }

  private release() {
    this.stream?.getTracks().forEach((t) => t.stop())
    this.stream = null
  }
}
