import { LESSONS, type Lesson } from './lessons'
import { learningPath, type PathStep, type Piece } from './piece'

/**
 * Eigene Stücke liegen nur auf diesem Gerät (localStorage), nie auf unserem Server: Die Dateien
 * gehören dem, der sie mitbringt. Der Fortschritt darin läuft wie bei jedem Stück über das
 * Protokoll.
 */

const KEY = 'pianobuddy.pieces'

let cache: Piece[] | null = null
let version = 0
const listeners = new Set<() => void>()

function read(): Piece[] {
  try {
    const raw = localStorage.getItem(KEY)
    const list = raw ? (JSON.parse(raw) as Piece[]) : []
    return Array.isArray(list) ? list : []
  } catch {
    return []
  }
}

function write(list: Piece[]) {
  cache = list
  version++
  paths.clear()
  try {
    localStorage.setItem(KEY, JSON.stringify(list))
  } catch {
    /* Speicher voll oder gesperrt: bis zum Neuladen bleibt das Stück trotzdem da */
  }
  listeners.forEach((l) => l())
}

if (typeof window !== 'undefined')
  window.addEventListener('storage', (e) => {
    if (e.key !== KEY) return
    cache = null
    version++
    paths.clear()
    listeners.forEach((l) => l())
  })

export const pieces = {
  list(): Piece[] {
    if (!cache) cache = read()
    return cache
  },
  get(id: string): Piece | undefined {
    return pieces.list().find((p) => p.id === id)
  },
  save(piece: Piece) {
    const list = pieces.list()
    const i = list.findIndex((p) => p.id === piece.id)
    write(i < 0 ? [piece, ...list] : list.map((p) => (p.id === piece.id ? piece : p)))
  },
  remove(id: string) {
    write(pieces.list().filter((p) => p.id !== id))
  },
  subscribe(fn: () => void) {
    listeners.add(fn)
    return () => void listeners.delete(fn)
  },
  version: () => version,
}

const paths = new Map<string, PathStep[]>()

/** Lernpfad eines Stücks, zwischengespeichert bis zur nächsten Änderung */
export function pathOf(piece: Piece): PathStep[] {
  let p = paths.get(piece.id)
  if (!p) {
    p = learningPath(piece)
    paths.set(piece.id, p)
  }
  return p
}

/** Stück zu einer Lernfassung (own-<Stück>-…) */
export function pieceOfLesson(lessonId: string): Piece | undefined {
  if (!lessonId.startsWith('own-')) return undefined
  return pieces.list().find((p) => lessonId.startsWith(`own-${p.id}-`))
}

/** Lektion nach Kennung: eingebaute Stücke und Lernfassungen eigener Stücke */
export function lessonById(id: string): Lesson | undefined {
  const builtIn = LESSONS.find((l) => l.id === id)
  if (builtIn) return builtIn
  const piece = pieceOfLesson(id)
  return piece ? pathOf(piece).find((s) => s.lesson.id === id)?.lesson : undefined
}

/** Die Lektion danach: im Lernpfad des eigenen Stücks oder in der eingebauten Reihenfolge */
export function lessonAfter(id: string): Lesson | undefined {
  const piece = pieceOfLesson(id)
  if (piece) {
    const path = pathOf(piece)
    return path[path.findIndex((s) => s.lesson.id === id) + 1]?.lesson
  }
  const i = LESSONS.findIndex((l) => l.id === id)
  return i < 0 ? undefined : LESSONS[i + 1]
}
