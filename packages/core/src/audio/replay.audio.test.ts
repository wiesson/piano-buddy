import { describe, expect, it } from 'vitest'
import { LESSONS, notesForStage, stagesFor, type Lesson, type Stage } from '../music/lessons'
import { lookupFrom } from './profile'
import { replayCalibration, replayPractice } from './replay'
import { hum, synthesize, type MicModel } from './testSignal'
import { noteLabel } from '../music/notes'

/**
 * Der ganze Hör-Ablauf ohne Mikrofon: Eine fehlerfreie, künstliche Aufführung läuft durch Analyse,
 * Anschlagserkennung und Warte-Modus. Erwartet wird, was ein Mensch erwartet: Wer alles richtig
 * spielt, bekommt genau einen sauberen Durchgang und keinen falschen Ton.
 */

const LEAD_S = 1.5

function perform(
  lesson: Lesson,
  stage: Stage,
  mic: MicModel,
  /** legato: Tonlänge relativ zur Notenlänge (über 1 = Töne überlappen); fund/fundRise: Grundton */
  v: { legato?: number; fund?: number; fundRise?: number } = {},
) {
  const spb = 60 / lesson.bpm
  const notes = notesForStage(lesson, stage)
  const events = notes.map((n) => ({
    midi: n.midi,
    at: LEAD_S + n.start * spb,
    dur: Math.max(0.12, n.dur * spb * (v.legato ?? 0.9)),
    amp: n.hand === 'L' ? 0.25 : 0.2,
    fund: v.fund,
    fundRise: v.fundRise,
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
  'elise · LR',
])

/** Klangprofil wie nach dem Lernmodus „Alle Töne“ am Handy (einmal berechnet) */
let profileCache: ReturnType<typeof lookupFrom> | undefined
function phoneProfile() {
  if (profileCache) return profileCache
  const notesOf = (hand: 'L' | 'R') =>
    [...new Set(LESSONS.flatMap((l) => l.notes.filter((n) => n.hand === hand).map((n) => n.midi)))].sort((a, b) => a - b)
  const L = calibrationRun(notesOf('L'), 'phone')
  const R = calibrationRun(notesOf('R'), 'phone')
  const pl = replayCalibration(L.pcm, 48000, L.targets)
  const pr = replayCalibration(R.pcm, 48000, R.targets)
  return (profileCache = lookupFrom({ name: 'test', createdAt: '', notes: { ...pl.notes, ...pr.notes } }))
}

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
  const learned = phoneProfile()

  for (const l of LESSONS) {
    for (const stage of stagesFor(l).filter((s) => s !== 'LR')) {
      ;(KNOWN.has(`Profil ${l.id} · ${stage}`) ? it.fails : it)(`mit Profil: ${l.id} · ${stage} sauber`, () => {
        const r = replayPractice(perform(l, stage, 'phone'), 48000, l, stage, learned)
        expect(describeResult(r)).toBe(`${r.steps}/${r.steps} Schritte, falsch: –`)
      })
    }
  }
})

/**
 * Feldbericht: Gesummt ging die Übung „zack, zack, zack“ durch. Ohne Klavieranschlag darf kein
 * Schritt weitergehen und kein Ton als falsch zählen, auch mit eingelerntem Profil.
 */
describe('Summen und Singen sind kein Klavier', () => {
  const lesson = LESSONS.find((l) => l.id === 'lh-fuenf')!
  const notes = notesForStage(lesson, 'L')
  const spb = 60 / lesson.bpm
  // Melodie legato gesummt: weicher Einsatz, zum nächsten Ton geglitten
  const melody = (speed: number) => {
    const pts = [{ t: LEAD_S, midi: notes[0].midi, amp: 0 }]
    for (const [i, n] of notes.entries()) {
      const t = LEAD_S + (n.start * spb) / speed
      pts.push({ t: t + (i === 0 ? 0.08 : 0.06), midi: n.midi, amp: 1 })
      pts.push({ t: t + (n.dur * spb) / speed, midi: n.midi, amp: 1 })
    }
    const end = pts[pts.length - 1].t
    pts.push({ t: end + 0.15, midi: notes[notes.length - 1].midi, amp: 0 })
    return { pts, durS: end + 1 }
  }
  const cases: [string, () => { pts: { t: number; midi: number; amp: number }[]; durS: number; vibCents?: number }][] = [
    ['Melodie gesummt', () => melody(1)],
    ['Melodie gesummt, schnell', () => melody(2.5)],
    [
      'Sirene C3 → G3 → C3',
      () => ({
        pts: [
          { t: LEAD_S, midi: 48, amp: 0 },
          { t: LEAD_S + 0.1, midi: 48, amp: 1 },
          { t: LEAD_S + 2.6, midi: 55, amp: 1 },
          { t: LEAD_S + 5.1, midi: 48, amp: 1 },
          { t: LEAD_S + 5.3, midi: 48, amp: 0 },
        ],
        durS: LEAD_S + 6.5,
      }),
    ],
    [
      'ein gehaltener Ton mit starkem Vibrato',
      () => ({
        pts: [
          { t: LEAD_S, midi: 48, amp: 0 },
          { t: LEAD_S + 0.1, midi: 48, amp: 1 },
          { t: LEAD_S + 4, midi: 48, amp: 1 },
          { t: LEAD_S + 4.2, midi: 48, amp: 0 },
        ],
        durS: LEAD_S + 5.5,
        vibCents: 120,
      }),
    ],
  ]
  for (const [name, make] of cases) {
    for (const mic of ['ideal', 'phone'] as const) {
      it(`${name} (${mic === 'ideal' ? 'ideales Mikrofon' : 'Handy mit Profil'}): kein Schritt, kein falscher Ton`, () => {
        const c = make()
        const pcm = hum(c.pts, c.durS, { mic, vibCents: c.vibCents })
        const r = replayPractice(pcm, 48000, lesson, 'L', mic === 'phone' ? phoneProfile() : null)
        expect(describeResult(r)).toBe(`0/${r.steps} Schritte, falsch: –`)
      })
    }
  }
})

/**
 * Feldbericht: Töne wurden doppelt gezählt, trotz Einlernen. Jeder Anschlag ergibt genau einen
 * erkannten Ton, auch wenn der Grundton schwach ist oder sich langsam aufbaut, die Töne
 * überlappen und der Analyse-Takt ausgebremst ist (40 statt 20 ms).
 */
describe('Ein Anschlag, ein Ton', () => {
  const lesson = LESSONS.find((l) => l.id === 'lh-fuenf')!
  for (const fund of [undefined, 1])
    for (const fundRise of [0, 0.08])
      for (const legato of [0.9, 1.15])
        for (const hopMs of [20, 40]) {
          const name = `Grundton ${fund ?? 'schwach'}${fundRise ? ', langsam' : ''}, legato ${legato}, Takt ${hopMs} ms`
          it(name, () => {
            const pcm = perform(lesson, 'L', 'phone', { fund, fundRise, legato })
            const r = replayPractice(pcm, 48000, lesson, 'L', phoneProfile(), { hopMs })
            const labels = r.onsets.map((o) => noteLabel(o.midi)).join(' ')
            expect(labels).toBe(notesForStage(lesson, 'L').map((n) => noteLabel(n.midi)).join(' '))
            expect(r.wrong).toHaveLength(0)
          })
        }
})

/**
 * BEKANNT (Stufe 2, Vorlagenvergleich): Fehlt der Grundton fast ganz (Handy, tiefe Töne), hält die
 * Engine einen Oberton (E5 = 5. Teilton von C3) für den gespielten Ton. Das Profil kennt nur eine
 * mittlere Klangform und erklärt den Teilton nicht, solange der tiefe Ton nicht erkannt ist.
 */
describe('Fast ohne Grundton (bekannt, Stufe 2)', () => {
  const lesson = LESSONS.find((l) => l.id === 'lh-fuenf')!
  it.fails('Grundton 0,25 am Handy: richtige Töne statt Obertöne', () => {
    const r = replayPractice(perform(lesson, 'L', 'phone', { fund: 0.25 }), 48000, lesson, 'L', phoneProfile())
    expect(describeResult(r)).toBe(`${r.steps}/${r.steps} Schritte, falsch: –`)
  })
})
