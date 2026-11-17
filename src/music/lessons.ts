import { parseNote } from './notes'
import type { Localized } from '../i18n/localized'

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
  title: Localized
  /** Ein Satz, worum es geht */
  goal: Localized
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
    title: { de: 'Fünf Finger links', en: 'Five fingers, left hand' },
    goal: {
      de: 'Der kleine Finger links liegt auf dem C eine Oktave tiefer.',
      en: 'The left pinky rests on the C one octave lower.',
    },
    bpm: 72,
    beatsPerBar: 4,
    left: 'C3:1:5 D3:1:4 E3:1:3 F3:1:2 G3:1:1 F3:1:2 E3:1:3 D3:1:4 C3:4:5',
  }),
  lesson({
    id: 'rh-fuenf',
    title: { de: 'Fünf Finger rechts', en: 'Five fingers, right hand' },
    goal: {
      de: 'Daumen auf das C in der Mitte, jeder Finger bekommt eine Taste.',
      en: 'Thumb on middle C, each finger gets one key.',
    },
    bpm: 72,
    beatsPerBar: 4,
    right: 'C4:1:1 D4:1:2 E4:1:3 F4:1:4 G4:1:5 F4:1:4 E4:1:3 D4:1:2 C4:4:1',
  }),
  lesson({
    id: 'wechsel',
    title: { de: 'Frage und Antwort', en: 'Question and answer' },
    goal: {
      de: 'Links fängt an, rechts antwortet. Die Hände wechseln sich ab.',
      en: 'The left hand starts, the right answers. The hands take turns.',
    },
    bpm: 76,
    beatsPerBar: 4,
    left: 'C3:1:5 D3:1:4 E3:1:3 F3:1:2 G3:4:1 -:8',
    right: '-:8 G4:1:5 F4:1:4 E4:1:3 D4:1:2 C4:4:1',
  }),
  lesson({
    id: 'parallel',
    title: { de: 'Beide Hände parallel', en: 'Both hands in parallel' },
    goal: {
      de: 'Gleiche Töne, eine Oktave auseinander. Die Daumen bewegen sich gegenläufig.',
      en: 'Same notes, one octave apart. The thumbs move in opposite directions.',
    },
    bpm: 60,
    beatsPerBar: 4,
    left: 'C3:1:5 D3:1:4 E3:1:3 F3:1:2 G3:1:1 F3:1:2 E3:1:3 D3:1:4 C3:4:5',
    right: 'C4:1:1 D4:1:2 E4:1:3 F4:1:4 G4:1:5 F4:1:4 E4:1:3 D4:1:2 C4:4:1',
  }),
  lesson({
    id: 'entchen',
    title: { de: 'Alle meine Entchen', en: 'All My Little Ducklings' },
    goal: {
      de: 'Das erste Lied. Rechts die Melodie, links ein Ton pro Takt.',
      en: 'Your first song. Melody on the right, one note per bar on the left.',
    },
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
    title: { de: 'Ode an die Freude', en: 'Ode to Joy' },
    goal: {
      de: 'Beethoven, ganz in der C-Lage. Achte auf die punktierten Stellen.',
      en: 'Beethoven, entirely in C position. Watch the dotted rhythms.',
    },
    bpm: 80,
    beatsPerBar: 4,
    right:
      'E4:1:3 E4:1:3 F4:1:4 G4:1:5 G4:1:5 F4:1:4 E4:1:3 D4:1:2 C4:1:1 C4:1:1 D4:1:2 E4:1:3 E4:1.5:3 D4:0.5:2 D4:2:2 ' +
      'E4:1:3 E4:1:3 F4:1:4 G4:1:5 G4:1:5 F4:1:4 E4:1:3 D4:1:2 C4:1:1 C4:1:1 D4:1:2 E4:1:3 D4:1.5:2 C4:0.5:1 C4:2:1',
    left: 'C3:4:5 G3:4:1 C3:4:5 G3:4:1 C3:4:5 G3:4:1 C3:4:5 G3:2:1 C3:2:5',
  }),
  lesson({
    id: 'vier-akkorde',
    title: { de: 'Vier Akkorde', en: 'Four chords' },
    goal: {
      de: 'a-Moll, F, C, G: die Folge hinter unzähligen Popsongs. Rechts Akkorde, links der Grundton.',
      en: 'A minor, F, C, G: the progression behind countless pop songs. Chords on the right, root note on the left.',
    },
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
