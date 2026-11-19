import { de } from '../i18n/de'
import { en } from '../i18n/en'
import type { Localized } from '../i18n/localized'
import { noteName } from './notes'
import { LESSONS, voice, type Hand, type Lesson, type ScoreNote } from './lessons'
import { easyNotes, type Version } from './piece'

/**
 * Fassungen der eingebauten Stücke: Leicht, Mittel, Original. Jede Fassung ist eine eigene
 * Lektion mit eigener Kennung (`kanon~leicht`, `kanon~mittel`, das Original bleibt `kanon`), damit
 * Versuche, Sterne und Tagesplan getrennt zählen und alter Fortschritt beim Original bleibt.
 *
 * Leicht verlangt nur Elemente, die vorher im Lernpfad dran waren (siehe `PATH` und
 * elements.ts); Mittel ist der Zwischenschritt, meist die Originalmelodie mit einfacher
 * Begleitung. Stücke, die schon leicht sind, haben nur das Original.
 *
 * Wo es passt, entstehen Fassungen wie bei eigenen Stücken mit `easyNotes` (Melodie oben, ein
 * Grundton pro Takt); sonst stehen sie ausgeschrieben da, mit Fingersatz.
 */

export type Level = Version
export const LEVELS: readonly Level[] = ['easy', 'medium', 'full']
const SUFFIX: Record<Level, string> = { easy: 'leicht', medium: 'mittel', full: '' }

/** Kennung einer Fassung: das Original behält die Kennung des Stücks */
export const versionId = (pieceId: string, level: Level) => (level === 'full' ? pieceId : `${pieceId}~${SUFFIX[level]}`)

/** Stück und Fassung einer Kennung */
export function parseVersionId(id: string): { pieceId: string; level: Level } {
  const [pieceId, suffix] = id.split('~')
  const level = (Object.keys(SUFFIX) as Level[]).find((l) => suffix !== undefined && SUFFIX[l] === suffix)
  return { pieceId, level: level ?? 'full' }
}

const both = (f: (m: typeof de) => string): Localized => ({ de: f(de), en: f(en) })
const original = (id: string) => LESSONS.find((l) => l.id === id)!
const sorted = (ns: ScoreNote[]) => ns.sort((a, b) => a.start - b.start || a.midi - b.midi)
const hands = (left?: string, right?: string) => sorted([...(left ? voice('L', left) : []), ...(right ? voice('R', right) : [])])

/** Die Töne einer Hand neu fingern, der Reihe nach */
function refinger(notes: ScoreNote[], hand: Hand, fingers: number[]): ScoreNote[] {
  let i = 0
  return notes.map((n) => (n.hand === hand ? { ...n, finger: fingers[i++] } : n))
}

/**
 * Clair ab Takt 5: Debussy hält den Melodieton über den Taktstrich, darunter beginnt eine kurze
 * Mittelstimme. `easyNotes` nähme die Mittelstimme als Melodie; hier fällt sie weg, und der
 * Melodieton davor klingt weiter.
 */
function tieOver(notes: ScoreNote[], hand: Hand, beats: number[]): ScoreNote[] {
  const at = (b: number) => (n: ScoreNote) => n.hand === hand && Math.abs(n.start - b) < 1e-6
  let out = notes.map((n) => ({ ...n }))
  for (const b of beats) {
    const inner = out.find(at(b))
    const held = out.find((n) => n.hand === hand && Math.abs(n.start + n.dur - b) < 1e-6)
    if (!inner || !held) continue
    held.dur += inner.dur
    out = out.filter((n) => n !== inner)
  }
  return out
}

/** Um Halbtöne verschieben; die Schreibweise folgt der Zieltonart C-Dur (nur weiße Tasten erwartet) */
const transpose = (notes: ScoreNote[], semis: number): ScoreNote[] =>
  notes.map((n) => ({ ...n, midi: n.midi + semis, spelling: noteName(n.midi + semis) }))

interface Spec {
  goal: Localized
  notes: ScoreNote[]
  bpm?: number
  beatsPerBar?: number
  beatUnit?: 4 | 8
  key?: number
  pickup?: number
}

function variant(pieceId: string, level: Level, spec: Spec): Lesson {
  const o = original(pieceId)
  return {
    ...o,
    id: versionId(pieceId, level),
    title: both((m) => `${o.title[m === de ? 'de' : 'en']} · ${m.pieces.versions[level]}`),
    goal: spec.goal,
    notes: spec.notes,
    bpm: spec.bpm ?? o.bpm,
    beatsPerBar: spec.beatsPerBar ?? o.beatsPerBar,
    beatUnit: spec.beatUnit ?? o.beatUnit,
    key: spec.key ?? o.key,
    pickup: 'pickup' in spec ? spec.pickup : o.pickup,
  }
}

const left = (id: string) => original(id).notes.filter((n) => n.hand === 'L')
const right = (id: string) => original(id).notes.filter((n) => n.hand === 'R')

/** Clair, links ein Ton pro Takt (F Ges F Es Des B As F Des): absteigend fingern statt immer mit dem dritten */
const CLAIR_EASY_LEFT = [2, 1, 2, 3, 4, 1, 2, 4, 5]

/** Clair leicht und mittel: Melodie und ein Ton pro Takt, Melodie ab Takt 5 gehalten (9/8: Takt 5 beginnt bei Schlag 36) */
const clairEasy = () => tieOver(refinger(easyNotes(original('clair').notes, 9), 'L', CLAIR_EASY_LEFT), 'R', [36, 45, 54, 63])

/** Basstöne im Wechsel: tiefer Ton mit dem kleinen Finger, höherer mit dem Daumen, statt jedes Mal umzusetzen */
const alternateBass = (notes: ScoreNote[], low: number) =>
  notes.map((n) => (n.hand === 'L' ? { ...n, finger: n.midi <= low ? 5 : 1 } : n))

const JINGLE_A = 'E4:1:3 E4:1:3 E4:2:3 E4:1:3 E4:1:3 E4:2:3 E4:1:3 G4:1:5 C4:1:1 D4:1:2 E4:4:3 '

const VARIANTS: Lesson[] = [
  variant('jingle', 'easy', {
    goal: {
      de: 'Ohne Achtel und ohne Punktierung: Jeder Ton dauert mindestens einen Schlag.',
      en: 'No eighth notes, no dotted rhythm: every note lasts at least one beat.',
    },
    notes: sorted([
      ...left('jingle'),
      ...voice(
        'R',
        JINGLE_A +
          'F4:1:4 F4:1:4 F4:1:4 F4:1:4 F4:1:4 E4:1:3 E4:1:3 E4:1:3 E4:1:3 D4:1:2 D4:1:2 E4:1:3 D4:2:2 G4:2:5 ' +
          JINGLE_A +
          'F4:1:4 F4:1:4 F4:1:4 F4:1:4 F4:1:4 E4:1:3 E4:1:3 E4:1:3 G4:1:5 G4:1:5 F4:1:4 D4:1:2 C4:4:1',
      ),
    ]),
  }),
  variant('jingle', 'medium', {
    goal: {
      de: 'Neu: Achtel. Zwei Töne teilen sich einen Schlag, zähl „eins und“. Die Punktierung kommt erst im Original.',
      en: 'New: eighth notes. Two notes share one beat, count “one and”. The dotted rhythm comes in the original.',
    },
    notes: sorted([
      ...left('jingle'),
      ...voice(
        'R',
        JINGLE_A +
          'F4:1:4 F4:1:4 F4:1:4 F4:1:4 F4:1:4 E4:1:3 E4:1:3 E4:0.5:3 E4:0.5:3 E4:1:3 D4:1:2 D4:1:2 E4:1:3 D4:2:2 G4:2:5 ' +
          JINGLE_A +
          'F4:1:4 F4:1:4 F4:1:4 F4:1:4 F4:1:4 E4:1:3 E4:1:3 E4:0.5:3 E4:0.5:3 G4:1:5 G4:1:5 F4:1:4 D4:1:2 C4:4:1',
      ),
    ]),
  }),
  variant('ode', 'easy', {
    goal: {
      de: 'Ganz in der C-Lage, ohne Punktierung: Jeder Ton bekommt einen ganzen Schlag.',
      en: 'Entirely in C position, without the dotted rhythm: every note gets a full beat.',
    },
    notes: sorted([
      ...left('ode'),
      ...voice(
        'R',
        'E4:1:3 E4:1:3 F4:1:4 G4:1:5 G4:1:5 F4:1:4 E4:1:3 D4:1:2 C4:1:1 C4:1:1 D4:1:2 E4:1:3 E4:1:3 D4:1:2 D4:2:2 ' +
          'E4:1:3 E4:1:3 F4:1:4 G4:1:5 G4:1:5 F4:1:4 E4:1:3 D4:1:2 C4:1:1 C4:1:1 D4:1:2 E4:1:3 D4:1:2 C4:1:1 C4:2:1',
      ),
    ]),
  }),
  variant('vier-akkorde', 'easy', {
    goal: {
      de: 'Nur rechts, zwei Töne zugleich. Die Hand bleibt in der C-Lage, und du hörst die vier Akkorde schon.',
      en: 'Right hand only, two notes at once. The hand stays in C position, and you already hear the four chords.',
    },
    notes: hands(undefined, 'C4+E4:4:1+3 C4+F4:4:1+4 E4+G4:4:3+5 D4+G4:4:2+5'),
  }),
  variant('vier-akkorde', 'medium', {
    goal: {
      de: 'Neu: Dreiklänge, drei Töne zugleich. Nur rechts, alle Griffe über dem mittleren C.',
      en: 'New: triads, three notes at once. Right hand only, every chord above middle C.',
    },
    notes: hands(undefined, 'C4+E4+A4:4:1+2+5 C4+F4+A4:4:1+3+5 C4+E4+G4:4:1+3+5 D4+G4+H4:4:1+3+5'),
  }),
  variant('pop-begleitung', 'easy', {
    goal: {
      de: 'Die vier Akkorde rechts in Halben, links ein Grundton pro Takt. Neu: Links geht es tiefer als bisher, bis zum F.',
      en: 'The four chords in half notes on the right, one root per bar on the left. New: the left hand goes lower than before, down to F.',
    },
    notes: hands(
      'A2:4:3 F2:4:5 C3:4:1 G2:4:4 A2:4:3 F2:4:5 C3:4:1 G2:4:4',
      'C4+E4+A4:2:1+2+5 C4+E4+A4:2:1+2+5 C4+F4+A4:2:1+3+5 C4+F4+A4:2:1+3+5 C4+E4+G4:2:1+3+5 C4+E4+G4:2:1+3+5 D4+G4+H4:2:1+3+5 D4+G4+H4:2:1+3+5 ' +
        'C4+E4+A4:2:1+2+5 C4+E4+A4:2:1+2+5 C4+F4+A4:2:1+3+5 C4+F4+A4:2:1+3+5 C4+E4+G4:2:1+3+5 C4+E4+G4:2:1+3+5 D4+G4+H4:2:1+3+5 D4+G4+H4:2:1+3+5',
    ),
  }),
  variant('pop-begleitung', 'medium', {
    goal: {
      de: 'Rechts die Akkorde wie im Original, links Grundton und Quinte im Wechsel. Neu: Die linke Hand wandert über mehr als eine Oktave.',
      en: 'The chords as in the original on the right, root and fifth in turn on the left. New: the left hand travels across more than an octave.',
    },
    notes: sorted([
      ...right('pop-begleitung'),
      ...voice(
        'L',
        'A2:1:5 E3:1:1 A2:1:5 E3:1:1 F2:1:5 C3:1:1 F2:1:5 C3:1:1 C3:1:5 G3:1:1 C3:1:5 G3:1:1 G2:1:5 D3:1:1 G2:1:5 D3:1:1 ' +
          'A2:1:5 E3:1:1 A2:1:5 E3:1:1 F2:1:5 C3:1:1 F2:1:5 C3:1:1 C3:1:5 G3:1:1 C3:1:5 G3:1:1 G2:1:5 D3:1:1 G2:1:5 D3:1:1',
      ),
    ]),
  }),
  variant('kanon', 'easy', {
    goal: {
      de: 'Pachelbels Kanon in C-Dur, ohne schwarze Tasten. Neu: Rechts beginnt die Linie hoch, über dem C5, und wandert abwärts.',
      en: 'Pachelbel’s canon in C major, without black keys. New: on the right the line starts high, above C5, and walks downwards.',
    },
    key: 0,
    notes: hands(
      'C3:2:1 G2:2:4 A2:2:3 E2:2:5 F2:2:3 C2:2:5 F2:2:3 G2:2:2 ' + 'C3:2:1 G2:2:4 A2:2:3 E2:2:5 F2:2:3 C2:2:5 F2:2:3 G2:2:2 C2:4:5',
      'E5:2:5 D5:2:4 C5:2:3 H4:2:2 A4:2:1 G4:2:1 A4:2:2 H4:2:3 ' + 'C5:2:4 H4:2:3 A4:2:2 G4:2:1 F4:2:3 E4:2:2 F4:2:3 D4:2:2 C4+E4+G4:4:1+3+5',
    ),
  }),
  variant('gymnopedie', 'easy', {
    goal: {
      de: 'Satie im Dreivierteltakt: Zähl eins, zwei, drei. Rechts die Melodie, links ein Basston pro Takt.',
      en: 'Satie in three-four time: count one, two, three. The melody on the right, one bass note per bar on the left.',
    },
    // G2 mit dem Daumen, D2 mit dem kleinen Finger: die Hand bleibt liegen
    notes: alternateBass(easyNotes(original('gymnopedie').notes, 3), 38),
  }),
  variant('gymnopedie', 'medium', {
    goal: {
      de: 'Links Basston und Akkord, der Bass eine Oktave höher als im Original, damit die Hand nicht springt. Neu: Die linke Hand greift über das mittlere C.',
      en: 'Bass note and chord on the left, the bass an octave higher than in the original so the hand does not jump. New: the left hand reaches above middle C.',
    },
    notes: sorted([
      ...right('gymnopedie'),
      ...voice(
        'L',
        // Der D-Akkord eng über dem Bass (Fis–A–Cis), damit die Hand liegen bleibt
        'G3:1:5 H3+D4+Fis4:2:4+2+1 D3:1:5 Fis3+A3+Cis4:2:3+2+1 ' +
          'G3:1:5 H3+D4+Fis4:2:4+2+1 D3:1:5 Fis3+A3+Cis4:2:3+2+1 G3:1:5 H3+D4+Fis4:2:4+2+1 D3:1:5 Fis3+A3+Cis4:2:3+2+1 ' +
          'G3:1:5 H3+D4:2:3+1 D3:1:5 Fis3+A3:2:3+2',
      ),
    ]),
  }),
  variant('elise', 'easy', {
    goal: {
      de: 'Für Elise im Dreivierteltakt und langsamer, ein Schlag ist eine Viertel. Neu: Auftakt, das Stück beginnt vor der Eins. Links ein Basston pro Takt.',
      en: 'Für Elise in three-four time and slower, one beat is a quarter note. New: a pickup, the piece starts before beat one. One bass note per bar on the left.',
    },
    beatUnit: 4,
    bpm: 72,
    // A2 mit dem Daumen, E2 mit dem kleinen Finger
    notes: alternateBass(easyNotes(original('elise').notes, 3), 40),
  }),
  variant('elise', 'medium', {
    goal: {
      de: 'Links jetzt der gebrochene Akkord wie im Original, noch im Dreivierteltakt und langsamer.',
      en: 'Now the broken chord on the left as in the original, still in three-four time and slower.',
    },
    beatUnit: 4,
    bpm: 72,
    // Der E-Dur-Akkord eng (E3–Gis3–H3) statt über eine Dezime
    notes: sorted([
      ...right('elise'),
      ...voice(
        'L',
        '-:6 A2:0.5:5 E3:0.5:2 A3:0.5:1 -:1.5 E3:0.5:5 Gis3:0.5:3 H3:0.5:1 -:1.5 A2:0.5:5 E3:0.5:2 A3:0.5:1 -:1.5 ' +
          '-:3 A2:0.5:5 E3:0.5:2 A3:0.5:1 -:1.5 E3:0.5:5 Gis3:0.5:3 H3:0.5:1 -:1.5 A2:0.5:5 E3:0.5:2 A3:0.5:1 -:1.5',
      ),
    ]),
  }),
  variant('clair', 'easy', {
    goal: {
      de: 'Clair de Lune in C-Dur, ohne schwarze Tasten: rechts die Melodie, links ein Ton pro Takt. Neu: 9/8, neun Achtel pro Takt, gezählt in drei Gruppen.',
      en: 'Clair de Lune in C major, without black keys: the melody on the right, one note per bar on the left. New: 9/8, nine eighths per bar, counted in three groups.',
    },
    key: 0,
    // Zum Schluss der Bass eine Oktave höher, ohne Sprung
    notes: transpose(clairEasy(), -1).map((n) => (n.hand === 'L' && n.start >= 72 ? { ...n, midi: n.midi + 12, finger: 5 } : n)),
  }),
  variant('clair', 'medium', {
    goal: {
      de: 'In Des-Dur wie im Original, aber rechts nur die Melodie und links ein Ton pro Takt.',
      en: 'In D-flat major as in the original, but only the melody on the right and one note per bar on the left.',
    },
    notes: clairEasy(),
  }),
]

/** Alle Lektionen: Originale und Fassungen */
export const ALL_LESSONS: Lesson[] = [...LESSONS, ...VARIANTS]

/** Die Fassungen eines Stücks, leicht zuerst (nur die, die es gibt) */
export function versionsOf(lessonId: string): Lesson[] {
  const { pieceId } = parseVersionId(lessonId)
  return LEVELS.map((lv) => ALL_LESSONS.find((l) => l.id === versionId(pieceId, lv))).filter((l): l is Lesson => !!l)
}

/**
 * Der Lernpfad: jede Fassung genau einmal, so geordnet, dass jeder Schritt höchstens ein neues
 * Element bringt (geprüft in versions.test.ts). Leichte Fassungen späterer Stücke kommen vor den
 * schweren Fassungen früherer, wie die Spirale in Klavierschulen.
 */
export const PATH_IDS = [
  'lh-fuenf',
  'rh-fuenf',
  'wechsel',
  'parallel',
  'mary',
  'haenschen',
  'entchen',
  'jingle~leicht',
  'ode~leicht',
  'jingle~mittel',
  'ode',
  'jingle',
  'tonleiter',
  'vier-akkorde~leicht',
  'vier-akkorde~mittel',
  'pop-begleitung~leicht',
  'vier-akkorde',
  'pop-begleitung~mittel',
  'pop-begleitung',
  'kanon~leicht',
  'kanon',
  'gymnopedie~leicht',
  'gymnopedie~mittel',
  'gymnopedie',
  'elise~leicht',
  'elise~mittel',
  'elise',
  'clair~leicht',
  'clair~mittel',
  'clair',
] as const

export const PATH: Lesson[] = PATH_IDS.map((id) => ALL_LESSONS.find((l) => l.id === id)!)

/** Die Stücke in der Reihenfolge, in der der Pfad sie zum ersten Mal bringt */
export const PIECE_ORDER: string[] = [...new Set(PATH.map((l) => parseVersionId(l.id).pieceId))]
