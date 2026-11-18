import { describe, expect, it } from 'vitest'
import { LESSONS, notesForStage, stagesFor, type Lesson, type Stage } from '../music/lessons'
import { lookupFrom } from './profile'
import { replayCalibration, replayPractice } from './replay'
import { synthesize, type MicModel } from './testSignal'
import { noteLabel } from '../music/notes'

/**
 * Der ganze Hör-Ablauf ohne Mikrofon: Eine fehlerfreie, künstliche Aufführung läuft durch Analyse,
 * Anschlagserkennung und Warte-Modus. Erwartet wird, was ein Mensch erwartet: Wer alles richtig
 * spielt, bekommt genau einen sauberen Durchgang und keinen falschen Ton.
 */

const LEAD_S = 1.5

function perform(lesson: Lesson, stage: Stage, mic: MicModel) {
  const spb = 60 / lesson.bpm
  const notes = notesForStage(lesson, stage)
  const events = notes.map((n) => ({
    midi: n.midi,
    at: LEAD_S + n.start * spb,
    dur: Math.max(0.12, n.dur * spb * 0.9),
    amp: n.hand === 'L' ? 0.25 : 0.2,
  }))
  const end = LEAD_S + Math.max(...notes.map((n) => n.start + n.dur)) * spb + 1
  return synthesize(events, end, { mic })
}

/** Lernmodus: jeder Ton der Hand zweimal, ruhig nacheinander */
function calibrationRun(midis: number[], mic: MicModel) {
  const targets = midis.flatMap((m) => [m, m])
  const events = targets.map((midi, i) => ({ midi, at: LEAD_S + i * 1.2, dur: 0.6, amp: 0.25 }))
  return { pcm: synthesize(events, LEAD_S + targets.length * 1.2 + 1, { mic }), targets }
}

const describeResult = (r: ReturnType<typeof replayPractice>) =>
  `${r.reached}/${r.steps} Schritte, falsch: ${r.wrong.map((w) => noteLabel(w.midi)).join(' ') || '–'}`

/**
 * BEKANNTE FEHLER (it.fails): Bei „Beide“ hört das Mikrofon Kreuzwirkungen zwischen den Händen
 * (Obertöne der linken Hand, Oktaven) und meldet einzelne falsche Töne oder bleibt hängen.
 * Wird einer dieser Fälle behoben, schlägt it.fails an: dann aus der Liste nehmen.
 */
const KNOWN = new Set([
  'entchen · LR',
  'haenschen · LR',
  'ode · LR',
  'jingle · LR',
  'pop-begleitung · LR',
  'kanon · LR',
  'elise · LR',
  'Profil vier-akkorde · R',
])

describe('Durchgang per Mikrofon, fehlerfrei gespielt (ideales Mikrofon)', () => {
  for (const lesson of LESSONS) {
    for (const stage of stagesFor(lesson)) {
      const name = `${lesson.id} · ${stage}`
      ;(KNOWN.has(name) ? it.fails : it)(name, () => {
        const r = replayPractice(perform(lesson, stage, 'ideal'), 48000, lesson, stage)
        expect(describeResult(r)).toBe(`${r.steps}/${r.steps} Schritte, falsch: –`)
        expect(r.passes).toHaveLength(1)
        expect(r.passes[0].clean).toBe(true)
      })
    }
  }
})

describe('Handy-Mikrofon (tiefe Frequenzen gedämpft)', () => {
  const lesson = LESSONS.find((l) => l.id === 'lh-fuenf')!

  it('ohne Profil: „Fünf Finger links“ bekommt falsche Töne oder hängt (Ausgangslage vom Testabend)', () => {
    const r = replayPractice(perform(lesson, 'L', 'phone'), 48000, lesson, 'L')
    expect(r.wrong.length > 0 || r.reached < r.steps).toBe(true)
  })

  // Eingelernt mit allen Tönen der Stücke je Hand (Lernmodus „Alle Töne“): dann muss jedes
  // einhändige Stück sauber durchgehen
  const notesOf = (hand: 'L' | 'R') =>
    [...new Set(LESSONS.flatMap((l) => l.notes.filter((n) => n.hand === hand).map((n) => n.midi)))].sort((a, b) => a - b)
  const learned = (() => {
    const L = calibrationRun(notesOf('L'), 'phone')
    const R = calibrationRun(notesOf('R'), 'phone')
    const pl = replayCalibration(L.pcm, 48000, L.targets)
    const pr = replayCalibration(R.pcm, 48000, R.targets)
    return lookupFrom({ name: 'test', createdAt: '', notes: { ...pl.notes, ...pr.notes } })
  })()

  for (const l of LESSONS) {
    for (const stage of stagesFor(l).filter((s) => s !== 'LR')) {
      ;(KNOWN.has(`Profil ${l.id} · ${stage}`) ? it.fails : it)(`mit Profil: ${l.id} · ${stage} sauber`, () => {
        const r = replayPractice(perform(l, stage, 'phone'), 48000, l, stage, learned)
        expect(describeResult(r)).toBe(`${r.steps}/${r.steps} Schritte, falsch: –`)
      })
    }
  }
})
