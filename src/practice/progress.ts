import type { Stage } from '../music/lessons'

/** Fortschritt lokal im Browser: saubere Durchgänge je Stück und Stufe. */
export const CLEAN_GOAL = 3

type Progress = Record<string, Partial<Record<Stage, { clean: number; total: number; last: number }>>>
const KEY = 'pianobuddy.progress.v1'

export function loadProgress(): Progress {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}') as Progress
  } catch {
    return {}
  }
}

export function recordPass(lessonId: string, stage: Stage, clean: boolean): Progress {
  const p = loadProgress()
  const l = (p[lessonId] ??= {})
  const s = (l[stage] ??= { clean: 0, total: 0, last: 0 })
  s.total++
  if (clean) s.clean++
  s.last = Date.now()
  try {
    localStorage.setItem(KEY, JSON.stringify(p))
  } catch {
    /* privater Modus: Fortschritt gilt nur für diese Sitzung */
  }
  return p
}

export const cleanCount = (p: Progress, lessonId: string, stage: Stage) => p[lessonId]?.[stage]?.clean ?? 0
