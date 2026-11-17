import { parseNote } from './notes'

export type Hand = 'L' | 'R'

export interface ScoreNote {
  midi: number
  /** Beginn in Schlägen (Viertel) ab Stückanfang */
  start: number
  /** Dauer in Schlägen */
  dur: number
  hand: Hand
  finger?: number
}

export interface Lesson {
  id: string
  title: string
  /** Ein Satz, worum es geht */
  goal: string
  bpm: number
  beatsPerBar: number
  notes: ScoreNote[]
}

/**
 * Kompakte Schreibweise pro Hand, Töne nacheinander:
 *   "E4:1:3"     Note E4, 1 Schlag, Finger 3
 *   "C4+E4+G4:4:1+3+5"  Akkord über 4 Schläge
 *   "-:2"        Pause über 2 Schläge
 */
function voice(hand: Hand, src: string): ScoreNote[] {
  const out: ScoreNote[] = []
  let t = 0
  for (const tok of src.trim().split(/\s+/)) {
    const [pitches, durStr, fingers] = tok.split(':')
    const dur = Number(durStr)
    if (pitches !== '-') {
      const ps = pitches.split('+')
      const fs = fingers?.split('+')
      ps.forEach((p, i) =>
        out.push({ midi: parseNote(p), start: t, dur, hand, finger: fs?.[i] ? Number(fs[i]) : undefined }),
      )
    }
    t += dur
  }
  return out
}

const lesson = (l: Omit<Lesson, 'notes'> & { left?: string; right?: string }): Lesson => ({
  id: l.id,
  title: l.title,
  goal: l.goal,
  bpm: l.bpm,
  beatsPerBar: l.beatsPerBar,
  notes: [...(l.left ? voice('L', l.left) : []), ...(l.right ? voice('R', l.right) : [])].sort(
    (a, b) => a.start - b.start || a.midi - b.midi,
  ),
})

export const LESSONS: Lesson[] = [
  lesson({
    id: 'lh-fuenf',
    title: 'Fünf Finger links',
    goal: 'Der kleine Finger links liegt auf dem C eine Oktave tiefer.',
    bpm: 72,
    beatsPerBar: 4,
    left: 'C3:1:5 D3:1:4 E3:1:3 F3:1:2 G3:1:1 F3:1:2 E3:1:3 D3:1:4 C3:4:5',
  }),
  lesson({
    id: 'rh-fuenf',
    title: 'Fünf Finger rechts',
    goal: 'Daumen auf das C in der Mitte, jeder Finger bekommt eine Taste.',
    bpm: 72,
    beatsPerBar: 4,
    right: 'C4:1:1 D4:1:2 E4:1:3 F4:1:4 G4:1:5 F4:1:4 E4:1:3 D4:1:2 C4:4:1',
  }),
  lesson({
    id: 'wechsel',
    title: 'Frage und Antwort',
    goal: 'Links fängt an, rechts antwortet. Die Hände wechseln sich ab.',
    bpm: 76,
    beatsPerBar: 4,
    left: 'C3:1:5 D3:1:4 E3:1:3 F3:1:2 G3:4:1 -:8',
    right: '-:8 G4:1:5 F4:1:4 E4:1:3 D4:1:2 C4:4:1',
  }),
  lesson({
    id: 'parallel',
    title: 'Beide Hände parallel',
    goal: 'Gleiche Töne, eine Oktave auseinander. Die Daumen bewegen sich gegenläufig.',
    bpm: 60,
    beatsPerBar: 4,
    left: 'C3:1:5 D3:1:4 E3:1:3 F3:1:2 G3:1:1 F3:1:2 E3:1:3 D3:1:4 C3:4:5',
    right: 'C4:1:1 D4:1:2 E4:1:3 F4:1:4 G4:1:5 F4:1:4 E4:1:3 D4:1:2 C4:4:1',
  }),
  lesson({
    id: 'entchen',
    title: 'Alle meine Entchen',
    goal: 'Das erste Lied. Rechts die Melodie, links ein Ton pro Takt.',
    bpm: 84,
    beatsPerBar: 4,
    right:
      'C4:1:1 D4:1:2 E4:1:3 F4:1:4 G4:2:5 G4:2:5 A4:1:5 A4:1:5 A4:1:5 A4:1:5 G4:4:4 ' +
      'A4:1:5 A4:1:5 A4:1:5 A4:1:5 G4:4:4 F4:1:4 F4:1:4 F4:1:4 F4:1:4 E4:2:3 E4:2:3 ' +
      'D4:1:2 D4:1:2 D4:1:2 D4:1:2 C4:4:1',
    left: 'C3:4:5 C3:4:5 F3:4:2 C3:4:5 F3:4:2 C3:4:5 G3:4:1 C3:4:5 G3:4:1 C3:4:5',
  }),
  lesson({
    id: 'ode',
    title: 'Ode an die Freude',
    goal: 'Beethoven, ganz in der C-Lage. Achte auf die punktierten Stellen.',
    bpm: 80,
    beatsPerBar: 4,
    right:
      'E4:1:3 E4:1:3 F4:1:4 G4:1:5 G4:1:5 F4:1:4 E4:1:3 D4:1:2 C4:1:1 C4:1:1 D4:1:2 E4:1:3 E4:1.5:3 D4:0.5:2 D4:2:2 ' +
      'E4:1:3 E4:1:3 F4:1:4 G4:1:5 G4:1:5 F4:1:4 E4:1:3 D4:1:2 C4:1:1 C4:1:1 D4:1:2 E4:1:3 D4:1.5:2 C4:0.5:1 C4:2:1',
    left: 'C3:4:5 G3:4:1 C3:4:5 G3:4:1 C3:4:5 G3:4:1 C3:4:5 G3:2:1 C3:2:5',
  }),
  lesson({
    id: 'vier-akkorde',
    title: 'Vier Akkorde',
    goal: 'a-Moll, F, C, G: die Folge hinter unzähligen Popsongs. Rechts Akkorde, links der Grundton.',
    bpm: 70,
    beatsPerBar: 4,
    right: 'C4+E4+A4:4:1+2+5 C4+F4+A4:4:1+3+5 C4+E4+G4:4:1+3+5 H3+D4+G4:4:1+2+5',
    left: 'A2:4:1 F2:4:3 C3:4:1 G2:4:2',
  }),
]

/** Die Lernreihenfolge pro Stück: erst links, dann rechts, dann beide. */
export type Stage = 'L' | 'R' | 'LR'

export function stagesFor(l: Lesson): Stage[] {
  const hasL = l.notes.some((n) => n.hand === 'L')
  const hasR = l.notes.some((n) => n.hand === 'R')
  const out: Stage[] = []
  if (hasL) out.push('L')
  if (hasR) out.push('R')
  if (hasL && hasR) out.push('LR')
  return out
}

export const stageLabel: Record<Stage, string> = { L: 'Links', R: 'Rechts', LR: 'Beide' }

export const notesForStage = (l: Lesson, s: Stage) =>
  s === 'LR' ? l.notes : l.notes.filter((n) => n.hand === s)

/** Gruppiert gleichzeitig beginnende Töne zu Schritten (für den Warte-Modus). */
export interface Step {
  start: number
  notes: ScoreNote[]
}

export function toSteps(notes: ScoreNote[]): Step[] {
  const steps: Step[] = []
  for (const n of notes) {
    const last = steps[steps.length - 1]
    if (last && Math.abs(last.start - n.start) < 1e-6) last.notes.push(n)
    else steps.push({ start: n.start, notes: [n] })
  }
  return steps
}
