import type { Stage } from '../music/lessons'
import type { InputSource } from '../input/events'

/**
 * Übungsprotokoll, lokal zuerst: Jeder Durchgang landet sofort im Browser und wird
 * hochgeladen, sobald eine Verbindung besteht. Durchgänge anderer Geräte kommen über
 * Convex herein und werden hier eingemischt. Fortschritt wird immer aus dem Protokoll
 * berechnet, nie als Zähler gespeichert.
 */
export interface Attempt {
  attemptId: string
  at: number
  lessonId: string
  stage: Stage
  clean: boolean
  wrong: number
  unverified: number
  source: InputSource | string
  durationMs: number
  /** Anteil der Schritte, die beim ersten Anschlag richtig waren (fehlt bei älteren Versuchen) */
  percent?: number
  /** Takte mit Fehlern (fehlt bei älteren Versuchen) */
  missedBars?: number[]
}

interface Stored extends Attempt {
  synced: boolean
}

export interface Device {
  token: string
  label: string
  registered: boolean
}

const LOG_KEY = 'pianobuddy.attempts.v2'
const DEVICE_KEY = 'pianobuddy.device.v1'

const read = <T,>(key: string, fallback: T): T => {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}
const write = (key: string, value: unknown) => {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* privater Modus oder voll: gilt dann nur für diese Sitzung */
  }
}

const base64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')

export const randomToken = () => base64url(crypto.getRandomValues(new Uint8Array(32)))

function guessLabel() {
  const ua = navigator.userAgent
  if (/iPad|Macintosh/.test(ua) && navigator.maxTouchPoints > 1) return 'iPad'
  if (/iPhone/.test(ua)) return 'iPhone'
  if (/Android/.test(ua)) return 'Android'
  if (/Mac/.test(ua)) return 'Mac'
  if (/Windows/.test(ua)) return 'Windows'
  return 'Browser'
}

let log: Map<string, Stored> = new Map(read<Stored[]>(LOG_KEY, []).map((a) => [a.attemptId, a]))
let device: Device = read<Device | null>(DEVICE_KEY, null) ?? { token: randomToken(), label: guessLabel(), registered: false }
write(DEVICE_KEY, device)

const listeners = new Set<() => void>()
let version = 0
const emit = () => {
  version++
  write(LOG_KEY, [...log.values()])
  listeners.forEach((l) => l())
}

export const store = {
  subscribe(fn: () => void) {
    listeners.add(fn)
    return () => listeners.delete(fn)
  },
  version: () => version,

  record(a: Omit<Attempt, 'attemptId' | 'at'>) {
    const attempt: Stored = { ...a, attemptId: randomToken().slice(0, 22), at: Date.now(), synced: false }
    log.set(attempt.attemptId, attempt)
    emit()
    return attempt
  },

  /** Stand des Servers einmischen: was dort liegt, gilt als synchronisiert. */
  mergeRemote(rows: Attempt[]) {
    let changed = false
    for (const r of rows) {
      const local = log.get(r.attemptId)
      if (!local || !local.synced) {
        log.set(r.attemptId, { ...r, synced: true })
        changed = true
      }
    }
    if (changed) emit()
  },

  unsynced(limit = 100): Attempt[] {
    const out: Attempt[] = []
    for (const a of log.values()) {
      if (a.synced) continue
      const { synced, ...rest } = a
      void synced
      out.push(rest)
      if (out.length >= limit) break
    }
    return out
  },

  markSynced(ids: string[]) {
    for (const id of ids) {
      const a = log.get(id)
      if (a) a.synced = true
    }
    emit()
  },

  all: () => [...log.values()],

  /** Alle Durchgänge, ältester zuerst (für Tagesplan, Wiederholung, Serie) */
  attempts(): Attempt[] {
    return [...log.values()].sort((a, b) => a.at - b.at)
  },

  /** Versuche einer Stufe, ältester zuerst */
  attemptsOf(lessonId: string, stage: Stage): Attempt[] {
    return [...log.values()].filter((a) => a.lessonId === lessonId && a.stage === stage).sort((a, b) => a.at - b.at)
  },

  cleanCount(lessonId: string, stage: Stage) {
    let n = 0
    for (const a of log.values()) if (a.lessonId === lessonId && a.stage === stage && a.clean) n++
    return n
  },

  device: () => device,
  setDevice(d: Partial<Device>) {
    device = { ...device, ...d }
    write(DEVICE_KEY, device)
    // Version erhöhen, sonst sieht useSyncExternalStore keine Änderung und der Sync bleibt
    // bis zum Neuladen im Zustand „nicht angemeldet“.
    version++
    listeners.forEach((l) => l())
  },
}

/** Nur für Tests */
export function __resetStore() {
  log = new Map()
  device = { token: randomToken(), label: 'Test', registered: false }
}
