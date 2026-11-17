import type { Localized } from '../i18n/localized'

/**
 * Inhalte der Startseite, die auch Suchmaschinen und KI-Crawler lesen sollen.
 * Eine Quelle für drei Ausgaben: das FAQ in der App, das statische HTML samt JSON-LD in
 * index.html (vite.config.ts, Plugin `seo`) und /llms.txt. Darum hier keine Browser-Importe.
 * Nur Fakten, die heute stimmen; Geplantes steht als geplant da.
 */

export const SITE = {
  name: 'Piano Buddy',
  url: 'https://pianobuddy.fyi/',
  source: 'https://github.com/wiesson/piano-buddy',
  author: { name: 'Arne Wiese', url: 'https://wiesson.dev' },
  studio: { name: 'Studio Nordwerk', url: 'https://www.nordwerk.studio' },
  imprint: 'https://www.nordwerk.studio/impressum',
  privacy: 'https://www.nordwerk.studio/datenschutz',
  issues: 'https://github.com/wiesson/piano-buddy/issues',
  title: { en: 'Piano Buddy: learn piano one hand at a time', de: 'Piano Buddy: Klavier lernen, eine Hand nach der anderen' },
  tagline: {
    en: 'Learn piano one hand at a time: left, right, then both. Listens via microphone or MIDI, free and without an account.',
    de: 'Klavier lernen, eine Hand nach der anderen: links, rechts, dann beide. Hört per Mikrofon oder MIDI zu, kostenlos und ohne Konto.',
  },
} as const

export interface FaqItem {
  id: string
  q: Localized
  a: Localized
}

export const FAQ: FaqItem[] = [
  {
    id: 'what',
    q: { en: 'What is Piano Buddy?', de: 'Was ist Piano Buddy?' },
    a: {
      en: 'A practice companion for piano beginners that runs in the browser. Every piece is learned in three stages: left hand, right hand, then both. Notes fall towards the keyboard with note names and fingering, and the music waits until you play the right key.',
      de: 'Ein Übe-Begleiter für Klavier-Anfänger, der im Browser läuft. Jedes Stück lernst du in drei Stufen: linke Hand, rechte Hand, dann beide. Die Noten fallen mit Notennamen und Fingersatz auf die Tasten zu, und die Musik wartet, bis du die richtige Taste spielst.',
    },
  },
  {
    id: 'midi',
    q: { en: 'Do I need a digital piano or a MIDI keyboard?', de: 'Brauche ich ein Digitalpiano oder ein MIDI-Keyboard?' },
    a: {
      en: 'No. Piano Buddy listens to any piano through the microphone of your iPhone, iPad or computer. With a digital piano, MIDI is more precise: in Chrome on a Mac or PC over USB or Bluetooth. Without any piano you can practice the finger patterns on your computer keyboard or tap the keys on screen.',
      de: 'Nein. Piano Buddy hört jedem Klavier über das Mikrofon von iPhone, iPad oder Computer zu. Mit einem Digitalpiano ist MIDI genauer: in Chrome am Mac oder PC, per USB oder Bluetooth. Ganz ohne Klavier übst du die Fingermuster auf der Computertastatur oder tippst die Tasten am Bildschirm.',
    },
  },
  {
    id: 'devices',
    q: { en: 'Which devices does it run on?', de: 'Auf welchen Geräten läuft es?' },
    a: {
      en: 'On iPhone and iPad in Safari, on Mac and PC in any current browser. Add it to your home screen and it opens like an app, also offline. Safari has no Web MIDI, so on iPhone and iPad it listens through the microphone. An iOS app with MIDI over Bluetooth is in the works.',
      de: 'Auf iPhone und iPad in Safari, am Mac und PC in jedem aktuellen Browser. Auf den Home-Bildschirm gelegt, öffnet es sich wie eine App, auch offline. Safari kann kein Web MIDI, darum hört es auf iPhone und iPad über das Mikrofon zu. Eine iOS-App mit MIDI über Bluetooth ist in Arbeit.',
    },
  },
  {
    id: 'sheet-music',
    q: { en: 'Do I need to read sheet music?', de: 'Muss ich Noten lesen können?' },
    a: {
      en: 'No. You see falling notes on a piano roll, each with its note name and the finger to use. Both can be switched off once you know the piece.',
      de: 'Nein. Du siehst fallende Noten auf einer Pianorolle, jede mit Notennamen und dem Finger, der sie spielt. Beides lässt sich ausschalten, sobald du das Stück kennst.',
    },
  },
  {
    id: 'one-hand',
    q: { en: 'Why one hand at a time?', de: 'Warum eine Hand nach der anderen?' },
    a: {
      en: 'Because both hands at once is the hardest part for beginners. Piano teachers usually start hands separately and put them together once each hand sits roughly. Piano Buddy starts with the left hand because in pop songs it mostly plays a simple bass pattern, then the right hand takes the melody, then you play both.',
      de: 'Weil beide Hände gleichzeitig für Anfänger der schwerste Teil sind. Klavierlehrer beginnen meist mit getrennten Händen und setzen sie zusammen, sobald jede Hand ungefähr sitzt. Piano Buddy beginnt links, weil die linke Hand in Popsongs meist ein schlichtes Bassmuster spielt, dann übernimmt die rechte die Melodie, dann spielst du beide.',
    },
  },
  {
    id: 'clean-passes',
    q: { en: 'Why three clean passes instead of practice minutes?', de: 'Warum drei saubere Durchgänge statt Übungsminuten?' },
    a: {
      en: 'In a study of piano students (Duke, Simmons and Cash, 2009), neither practice time nor the number of repetitions predicted how well they played the next day. The share of correct attempts did. So Piano Buddy counts clean passes: a stage is learned after three of them.',
      de: 'In einer Studie mit Klavierstudierenden (Duke, Simmons und Cash, 2009) sagten weder Übungszeit noch Zahl der Wiederholungen voraus, wie gut sie am nächsten Tag spielten. Der Anteil korrekter Versuche schon. Darum zählt Piano Buddy saubere Durchgänge: Nach dreien gilt eine Stufe als gelernt.',
    },
  },
  {
    id: 'beginners',
    q: { en: 'Is it for complete beginners and kids?', de: 'Ist es für absolute Anfänger und Kinder geeignet?' },
    a: {
      en: 'Yes. The learning path starts with five fingers per hand on five white keys and builds up to songs like Lightly Row, Ode to Joy and Jingle Bells, then the C major scale, four pop chords, Pachelbel’s Canon and the opening of Für Elise. No account, no ads, nothing to buy, so it is safe to hand to a child.',
      de: 'Ja. Der Lernpfad beginnt mit fünf Fingern je Hand auf fünf weißen Tasten und führt über Lieder wie Hänschen klein, die Ode an die Freude und Jingle Bells zur C-Dur-Tonleiter, vier Pop-Akkorden, Pachelbels Kanon und dem Anfang von Für Elise. Kein Konto, keine Werbung, nichts zu kaufen: Man kann es einem Kind in die Hand geben.',
    },
  },
  {
    id: 'own-songs',
    q: { en: 'Can I practice my own songs?', de: 'Kann ich eigene Songs üben?' },
    a: {
      en: 'Not yet. Importing your own MIDI files, splitting them into hands and editing notes is next on the roadmap. Imported pieces will stay on your device.',
      de: 'Noch nicht. Eigene MIDI-Dateien importieren, auf die Hände aufteilen und Noten bearbeiten kommt als Nächstes. Importierte Stücke bleiben auf deinem Gerät.',
    },
  },
  {
    id: 'mic',
    q: { en: 'How reliable is the microphone?', de: 'Wie zuverlässig ist das Mikrofon?' },
    a: {
      en: 'Good for one hand. It knows which notes to expect and checks exactly those, including their overtones. One limit is physics: when both hands play an octave apart, the left hand alone sounds like both. Piano Buddy marks those notes as unverified. With MIDI every note is exact.',
      de: 'Gut für eine Hand. Es weiß, welche Töne kommen sollen, und prüft genau diese samt ihren Obertönen. Eine Grenze ist Physik: Spielen beide Hände im Oktavabstand, klingt die linke Hand allein wie beide. Piano Buddy markiert solche Töne als ungeprüft. Mit MIDI ist jeder Ton exakt.',
    },
  },
  {
    id: 'price',
    q: { en: 'What does it cost?', de: 'Was kostet es?' },
    a: {
      en: 'Nothing. No subscription, no account, no ads. The source code is open under the MIT license on GitHub.',
      de: 'Nichts. Kein Abo, kein Konto, keine Werbung. Der Quellcode ist unter der MIT-Lizenz auf GitHub offen.',
    },
  },
  {
    id: 'data',
    q: { en: 'What happens to my data?', de: 'Was passiert mit meinen Daten?' },
    a: {
      en: 'Your practice log is saved in your browser first. To show the same progress on all your devices it is synced without an account: each device has its own secret key, and further devices join with an 8-character pairing code. Stored are only passes (piece, stage, clean or not, wrong notes, duration). No name, no email, no audio. The microphone is analysed on the device and never recorded.',
      de: 'Dein Übungsprotokoll liegt zuerst in deinem Browser. Damit alle deine Geräte denselben Stand zeigen, wird es ohne Konto abgeglichen: Jedes Gerät hat einen eigenen geheimen Schlüssel, weitere Geräte kommen mit einem 8-stelligen Kopplungscode dazu. Gespeichert werden nur Durchgänge (Stück, Stufe, sauber oder nicht, falsche Töne, Dauer). Kein Name, keine E-Mail, kein Audio. Das Mikrofon wird auf dem Gerät ausgewertet und nie aufgezeichnet.',
    },
  },
  {
    id: 'offline',
    q: { en: 'Does it work offline?', de: 'Funktioniert es offline?' },
    a: {
      en: 'Yes. After the first visit the app, fonts and piano sound are cached. Passes you play offline are uploaded once you are back online.',
      de: 'Ja. Nach dem ersten Besuch sind App, Schriften und Klavierklang zwischengespeichert. Offline gespielte Durchgänge werden hochgeladen, sobald du wieder online bist.',
    },
  },
]
