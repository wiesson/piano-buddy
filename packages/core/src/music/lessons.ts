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
  /** Schreibweise wie in den Daten, ohne Oktave (z. B. „Dis“ oder „Es“): Für die Notenansicht sind das verschiedene Zeichen */
  spelling?: string
}

export interface Lesson {
  id: string
  title: Localized
  /** Ein Satz, worum es geht */
  goal: Localized
  bpm: number
  beatsPerBar: number
  /** Notenwert eines Schlags: 4 = Viertel (Standard), 8 = Achtel (Für Elise: 3/8) */
  beatUnit?: 4 | 8
  /** Tonart als Zahl der Kreuze (positiv) oder Bs (negativ), Standard 0 = C-Dur/a-Moll */
  key?: number
  /**
   * Auftakt in Schlägen. In den Daten ist der erste Takt mit Pausen aufgefüllt, damit Taktstriche
   * und Pianorolle stimmen; die Notenansicht zeigt nur diese letzten Schläge als ersten Takt.
   */
  pickup?: number
  notes: ScoreNote[]
  /** Gouache-Illustration in public/illustrations (optional) */
  illustration?: string
}

/**
 * Kompakte Schreibweise pro Hand, Töne nacheinander:
 *   "E4:1:3"     Note E4, 1 Schlag, Finger 3
 *   "C4+E4+G4:4:1+3+5"  Akkord über 4 Schläge
 *   "-:2"        Pause über 2 Schläge
 */
export function voice(hand: Hand, src: string): ScoreNote[] {
  const out: ScoreNote[] = []
  let t = 0
  for (const tok of src.trim().split(/\s+/)) {
    const [pitches, durStr, fingers] = tok.split(':')
    const dur = Number(durStr)
    if (pitches !== '-') {
      const ps = pitches.split('+')
      const fs = fingers?.split('+')
      ps.forEach((p, i) =>
        out.push({
          midi: parseNote(p),
          start: t,
          dur,
          hand,
          finger: fs?.[i] ? Number(fs[i]) : undefined,
          spelling: p.replace(/-?\d$/, ''),
        }),
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
  beatUnit: l.beatUnit,
  key: l.key,
  pickup: l.pickup,
  illustration: l.illustration,
  notes: [...(l.left ? voice('L', l.left) : []), ...(l.right ? voice('R', l.right) : [])].sort(
    (a, b) => a.start - b.start || a.midi - b.midi,
  ),
})

/**
 * Kanon: rechts erst die Lage H–Fis, dann rutscht der Daumen auf A; der dritte Finger setzt über
 * den Daumen aufs G. Links eine Lage, die sich nur dehnt (Daumen auf D3, kleiner Finger bis D2).
 */
const KANON_RIGHT =
  'Fis5:2:5 E5:2:4 D5:2:3 Cis5:2:2 H4:2:1 A4:2:1 H4:2:2 Cis5:2:3 ' +
  'D5:2:4 Cis5:2:3 H4:2:2 A4:2:1 G4:2:3 Fis4:2:2 G4:2:3 E4:2:1 D4+Fis4+A4:4:1+3+5'
const KANON_LEFT =
  'D3:2:1 A2:2:4 H2:2:3 Fis2:2:5 G2:2:3 D2:2:5 G2:2:3 A2:2:2 ' +
  'D3:2:1 A2:2:4 H2:2:3 Fis2:2:5 G2:2:3 D2:2:5 G2:2:3 A2:2:2 D2:4:5'

/** Gymnopédie: rechts dritter Finger aufs Fis, beim H rutscht der Daumen eine Taste tiefer */
const GYMNO_RIGHT = '-:6 -:1 Fis5:1:3 A5:1:5 G5:1:4 Fis5:1:3 Cis5:1:1 H4:1:1 Cis5:1:2 D5:1:3 A4:3:1 Fis4:6:1'

/** Für Elise links: gebrochener Akkord, kleiner Finger auf dem Grundton, Daumen oben */
const ELISE_LEFT =
  '-:6 A2:0.5:5 E3:0.5:2 A3:0.5:1 -:1.5 E2:0.5:5 E3:0.5:2 Gis3:0.5:1 -:1.5 A2:0.5:5 E3:0.5:2 A3:0.5:1 -:1.5 ' +
  '-:3 A2:0.5:5 E3:0.5:2 A3:0.5:1 -:1.5 E2:0.5:5 E3:0.5:2 Gis3:0.5:1 -:1.5 A2:0.5:5 E3:0.5:2 A3:0.5:1 -:1.5'

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
    id: 'mary',
    illustration: '/illustrations/mary.jpg',
    title: { de: 'Mary hat ein kleines Lamm', en: 'Mary Had a Little Lamb' },
    goal: {
      de: 'Das erste Lied. Rechts reichen drei Finger, links wechseln Grundton und Quinte wie eine Begleitung.',
      en: 'Your first song. Three fingers are enough on the right, the left alternates root and fifth like an accompaniment.',
    },
    bpm: 84,
    beatsPerBar: 4,
    right:
      'E4:1:3 D4:1:2 C4:1:1 D4:1:2 E4:1:3 E4:1:3 E4:2:3 D4:1:2 D4:1:2 D4:2:2 E4:1:3 G4:1:5 G4:2:5 ' +
      'E4:1:3 D4:1:2 C4:1:1 D4:1:2 E4:1:3 E4:1:3 E4:1:3 E4:1:3 D4:1:2 D4:1:2 E4:1:3 D4:1:2 C4:4:1',
    left:
      'C3:2:5 G3:2:1 C3:2:5 G3:2:1 G3:2:1 D3:2:4 C3:2:5 G3:2:1 ' +
      'C3:2:5 G3:2:1 C3:2:5 G3:2:1 G3:2:1 D3:2:4 C3:4:5',
  }),
  lesson({
    id: 'haenschen',
    illustration: '/illustrations/haenschen.jpg',
    title: { de: 'Hänschen klein', en: 'Lightly Row' },
    goal: {
      de: 'Rechts bleibt die Hand in der C-Lage, links wechseln C und G. Im Mittelteil wiederholt sich ein Ton viermal.',
      en: 'The right hand stays in C position, the left alternates C and G. In the middle part one note repeats four times.',
    },
    bpm: 88,
    beatsPerBar: 4,
    right:
      'G4:1:5 E4:1:3 E4:2:3 F4:1:4 D4:1:2 D4:2:2 C4:1:1 D4:1:2 E4:1:3 F4:1:4 G4:1:5 G4:1:5 G4:2:5 ' +
      'G4:1:5 E4:1:3 E4:2:3 F4:1:4 D4:1:2 D4:2:2 C4:1:1 E4:1:3 G4:1:5 G4:1:5 C4:4:1 ' +
      'D4:1:2 D4:1:2 D4:1:2 D4:1:2 D4:1:2 E4:1:3 F4:2:4 E4:1:3 E4:1:3 E4:1:3 E4:1:3 E4:1:3 F4:1:4 G4:2:5 ' +
      'G4:1:5 E4:1:3 E4:2:3 F4:1:4 D4:1:2 D4:2:2 C4:1:1 E4:1:3 G4:1:5 G4:1:5 C4:4:1',
    left:
      'C3:4:5 G3:4:1 C3:4:5 C3:4:5 C3:4:5 G3:4:1 C3:4:5 C3:4:5 ' +
      'G3:4:1 G3:4:1 C3:4:5 C3:4:5 C3:4:5 G3:4:1 C3:4:5 C3:4:5',
  }),
  lesson({
    id: 'entchen',
    illustration: '/illustrations/ducklings.jpg',
    title: { de: 'Alle meine Entchen', en: 'All My Little Ducklings' },
    goal: {
      de: 'Neu: Beim A rutscht die rechte Hand eine Taste nach oben, danach zurück. Links ein Ton pro Takt.',
      en: 'New: for the A your right hand slides up one key, then back. One note per bar on the left.',
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
    id: 'jingle',
    illustration: '/illustrations/jingle.jpg',
    title: { de: 'Jingle Bells', en: 'Jingle Bells' },
    goal: {
      de: 'Der Refrain, leicht vereinfacht. Viele gleiche Töne hintereinander: Zähl mit, damit keiner verrutscht.',
      en: 'The chorus, slightly simplified. Many repeated notes in a row: count along so none slips.',
    },
    bpm: 96,
    beatsPerBar: 4,
    right:
      'E4:1:3 E4:1:3 E4:2:3 E4:1:3 E4:1:3 E4:2:3 E4:1:3 G4:1:5 C4:1.5:1 D4:0.5:2 E4:4:3 ' +
      'F4:1:4 F4:1:4 F4:1.5:4 F4:0.5:4 F4:1:4 E4:1:3 E4:1:3 E4:0.5:3 E4:0.5:3 E4:1:3 D4:1:2 D4:1:2 E4:1:3 D4:2:2 G4:2:5 ' +
      'E4:1:3 E4:1:3 E4:2:3 E4:1:3 E4:1:3 E4:2:3 E4:1:3 G4:1:5 C4:1.5:1 D4:0.5:2 E4:4:3 ' +
      'F4:1:4 F4:1:4 F4:1.5:4 F4:0.5:4 F4:1:4 E4:1:3 E4:1:3 E4:0.5:3 E4:0.5:3 G4:1:5 G4:1:5 F4:1:4 D4:1:2 C4:4:1',
    left:
      'C3:4:5 C3:4:5 C3:4:5 C3:4:5 F3:4:2 C3:4:5 G3:4:1 G3:4:1 ' +
      'C3:4:5 C3:4:5 C3:4:5 C3:4:5 F3:4:2 C3:4:5 G3:4:1 C3:4:5',
  }),
  lesson({
    id: 'ode',
    illustration: '/illustrations/ode.jpg',
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
    id: 'tonleiter',
    title: { de: 'C-Dur-Tonleiter', en: 'C major scale' },
    goal: {
      de: 'Der Schritt aus der Fünftonlage: Rechts geht der Daumen nach dem E unter, links kommt der dritte Finger über.',
      en: 'The step out of five-finger position: on the right the thumb passes under after E, on the left the third finger crosses over.',
    },
    bpm: 60,
    beatsPerBar: 4,
    right:
      'C4:1:1 D4:1:2 E4:1:3 F4:1:1 G4:1:2 A4:1:3 H4:1:4 C5:1:5 ' +
      'H4:1:4 A4:1:3 G4:1:2 F4:1:1 E4:1:3 D4:1:2 C4:2:1',
    left:
      'C3:1:5 D3:1:4 E3:1:3 F3:1:2 G3:1:1 A3:1:3 H3:1:2 C4:1:1 ' +
      'H3:1:2 A3:1:3 G3:1:1 F3:1:2 E3:1:3 D3:1:4 C3:2:5',
  }),
  lesson({
    id: 'vier-akkorde',
    illustration: '/illustrations/chords.jpg',
    title: { de: 'Vier Akkorde', en: 'Four chords' },
    goal: {
      de: 'a-Moll, F, C, G: die Folge hinter unzähligen Popsongs. Rechts Akkorde, links der Grundton.',
      en: 'A minor, F, C, G: the progression behind countless pop songs. Chords on the right, root note on the left.',
    },
    bpm: 70,
    beatsPerBar: 4,
    right: 'C4+E4+A4:4:1+2+5 C4+F4+A4:4:1+3+5 C4+E4+G4:4:1+3+5 H3+D4+G4:4:1+2+5',
    // Links eine Lage F2–C3: kleiner Finger auf F, Daumen auf C
    left: 'A2:4:3 F2:4:5 C3:4:1 G2:4:4',
  }),
  lesson({
    id: 'pop-begleitung',
    title: { de: 'Pop-Begleitung', en: 'Pop accompaniment' },
    goal: {
      de: 'Die vier Akkorde mit Bewegung: links Grundton, Quinte, Oktave, Quinte. So klingt es nach Band.',
      en: 'The four chords with movement: root, fifth, octave, fifth on the left. That is what makes it sound like a band.',
    },
    bpm: 80,
    beatsPerBar: 4,
    right:
      'C4+E4+A4:4:1+2+5 C4+F4+A4:4:1+3+5 E4+G4+C5:4:1+2+5 H3+D4+G4:4:1+2+5 ' +
      'C4+E4+A4:4:1+2+5 C4+F4+A4:4:1+3+5 E4+G4+C5:4:1+2+5 H3+D4+G4:4:1+2+5',
    left:
      'A2:1:5 E3:1:2 A3:1:1 E3:1:2 F2:1:5 C3:1:2 F3:1:1 C3:1:2 C3:1:5 G3:1:2 C4:1:1 G3:1:2 G2:1:5 D3:1:2 G3:1:1 D3:1:2 ' +
      'A2:1:5 E3:1:2 A3:1:1 E3:1:2 F2:1:5 C3:1:2 F3:1:1 C3:1:2 C3:1:5 G3:1:2 C4:1:1 G3:1:2 G2:1:5 D3:1:2 G3:1:1 D3:1:2',
  }),
  lesson({
    id: 'kanon',
    illustration: '/illustrations/canon.jpg',
    title: { de: 'Kanon in D', en: 'Canon in D' },
    goal: {
      de: 'Pachelbels Barock-Kanon: links acht Basstöne, die bis heute unter Popsongs liegen, rechts eine Linie, die abwärts wandert.',
      en: 'Pachelbel’s baroque canon: eight bass notes on the left that still sit under pop songs today, a line walking downwards on the right.',
    },
    bpm: 60,
    beatsPerBar: 4,
    key: 2,
    right: KANON_RIGHT,
    left: KANON_LEFT,
  }),
  lesson({
    id: 'gymnopedie',
    illustration: '/illustrations/gymnopedie.jpg',
    title: { de: 'Gymnopédie No. 1 (Anfang)', en: 'Gymnopédie No. 1 (opening)' },
    goal: {
      de: 'Satie, langsam und ruhig. Links pendelt es zwischen tiefem Bass und Akkord, rechts schwebt die Melodie darüber.',
      en: 'Satie, slow and calm. The left hand swings between a low bass note and a chord, the melody floats above on the right.',
    },
    bpm: 66,
    beatsPerBar: 3,
    key: 2,
    right: GYMNO_RIGHT,
    left:
      'G2:1:5 H3+D4+Fis4:2:4+2+1 D2:1:5 A3+Cis4+Fis4:2:5+3+1 ' +
      'G2:1:5 H3+D4+Fis4:2:4+2+1 D2:1:5 A3+Cis4+Fis4:2:5+3+1 G2:1:5 H3+D4+Fis4:2:4+2+1 D2:1:5 A3+Cis4+Fis4:2:5+3+1 ' +
      // Das Fis hält jetzt die Melodie: links nur noch die beiden unteren Akkordtöne
      'G2:1:5 H3+D4:2:3+1 D2:1:5 A3+Cis4:2:3+1',
  }),
  lesson({
    id: 'elise',
    illustration: '/illustrations/elise.jpg',
    title: { de: 'Für Elise (Anfang)', en: 'Für Elise (opening)' },
    goal: {
      de: 'Beethoven in a-Moll. Rechts pendelt die Melodie zwischen E und Dis, links ein gebrochener Akkord. Ein Schlag ist hier eine Achtel.',
      en: 'Beethoven in A minor. On the right the melody swings between E and D sharp, on the left a broken chord. One beat is an eighth note here.',
    },
    bpm: 120,
    beatsPerBar: 3,
    beatUnit: 8,
    pickup: 1,
    right:
      '-:2 E5:0.5:5 Dis5:0.5:4 ' +
      'E5:0.5:5 Dis5:0.5:4 E5:0.5:5 H4:0.5:2 D5:0.5:4 C5:0.5:3 ' +
      'A4:1:1 -:0.5 C4:0.5:1 E4:0.5:2 A4:0.5:3 ' +
      'H4:1:4 -:0.5 E4:0.5:1 Gis4:0.5:3 H4:0.5:4 ' +
      'C5:1:5 -:0.5 E4:0.5:1 E5:0.5:5 Dis5:0.5:4 ' +
      'E5:0.5:5 Dis5:0.5:4 E5:0.5:5 H4:0.5:2 D5:0.5:4 C5:0.5:3 ' +
      'A4:1:1 -:0.5 C4:0.5:1 E4:0.5:2 A4:0.5:3 ' +
      'H4:1:4 -:0.5 E4:0.5:1 C5:0.5:5 H4:0.5:4 ' +
      'A4:3:3',
    left: ELISE_LEFT,
  }),
  lesson({
    id: 'clair',
    illustration: '/illustrations/clairdelune.jpg',
    title: { de: 'Clair de Lune (Anfang)', en: 'Clair de Lune (opening)' },
    goal: {
      de: 'Debussy in Des-Dur, fünf schwarze Tasten. Erst sinken Terzen in beiden Händen, dann kreisen rechts Achtel abwärts. Ein Schlag ist eine Achtel.',
      en: 'Debussy in D-flat major, five black keys. First thirds sink in both hands, then eighths circle downwards on the right. One beat is an eighth note.',
    },
    bpm: 92,
    beatsPerBar: 9,
    beatUnit: 8,
    key: -5,
    // Ab Takt 5 hält das Original rechts einen Ton unter den Achteln; hier wird er zur ersten Achtel
    right:
      '-:2 F5+As5:4:3+5 Des5+F5:4:2+4 C5+Es5:1:1+3 Des5+F5:1:2+4 C5+Es5:7:1+3 ' +
      'B4+Des5:1:1+3 C5+Es5:1:2+4 B4+Des5:1.5:1+3 F5:3:5 Des5:2.5:3 As4+C5:1:1+2 B4+Des5:1:2+3 As4+C5:6:1+2 ' +
      'Ges4:1:1 B4:1:2 C5:1:3 B4:1:2 Es5:1:5 B4:1:2 Ges4+As4:1:1+2 B4:1:3 As4:1:2 ' +
      'Es4:1:1 Ges4:1:2 As4:1:3 Ges4:3:2 Es4+F4:3:1+2 ' +
      'Des4:1:1 F4:1:2 Ges4:1:3 F4:1:2 B4:1:5 F4:1:2 Es4:1:1 F4:1:2 Es4:1:1 ' +
      'B3:1:1 Des4:1:2 Es4:1:3 Des4:3:2 As3+C4:3:1+2 ' +
      '-:2 F4+As4:7:2+4',
    left:
      '-:1 F4+As4:8:3+1 Ges4+A4:9:3+1 F4+As4:9:3+1 Es4+Ges4:9:3+1 ' +
      'Des4+Es4:6:2+1 C4+Es4:3:3+1 B3+Des4:6:3+1 A3+C4:3:3+1 As3+B3:6:2+1 Ges3:3:3 F3+As3:6:3+1 Es3+Ges3:1.5:3+1 As2:1.5:5 ' +
      'Des2:9:5',
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

/** Taktnummer eines Schlags wie in den Noten: mit Auftakt ist der kurze erste Takt die 0 */
export function barOf(lesson: Pick<Lesson, 'beatsPerBar' | 'pickup'>, beat: number): number {
  const i = Math.floor(beat / lesson.beatsPerBar + 1e-6)
  return lesson.pickup ? i : i + 1
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
