/**
 * What changed, for people who use Piano Buddy. English only, newest first.
 * One entry per day, a few lines each, written from the player's side.
 */
export interface ChangelogEntry {
  date: string
  title: string
  items: string[]
}

export const CHANGELOG: ChangelogEntry[] = [
  {
    date: '2026-11-18',
    title: 'Sheet music, a smarter microphone, and a test bench',
    items: [
      'Hold long notes: half and whole notes now count when you hold them. The bar slides into the key while you hold; let go too early and you get a gentle hint, not an error.',
      'New view switch in the toolbar: Falling, Both and Sheet. Both shows the staff above the falling notes, a stepping stone from keys to reading music.',
      'After each pass a three-second countdown starts the next one by itself; tap Pause to read in peace.',
      'The app has its own home at pianobuddy.fyi/app with your path and songs; the iPhone app now works offline from the first start.',
      'Sheet music view: switch from falling notes to a grand staff in the View menu. The music still waits for you, the keyboard below can be hidden.',
      'Calibrate the microphone with a scale: play C major up and down, see for every note whether the app heard it, then it knows your piano.',
      'Fixed: repeated notes in tempo (E–E, D–D) were sometimes missed, so the music stalled and the rest counted as wrong.',
      'Fixed: low notes on phone microphones produced false “wrong notes” from their overtones.',
      'Melody notes over a held bass note are now recognised.',
      'Send a measurement from calibration so we can improve recognition with real pianos.',
      'Every piece now has its own address, and the browser back button works.',
      'Try it on the home page: play the opening of Ode to Joy right there. Notes ring as long as you hold a key.',
    ],
  },
  {
    date: '2026-11-17',
    title: 'Launch',
    items: [
      'Fourteen pieces from five fingers to Für Elise, each in three stages: left hand, right hand, both.',
      'Wait mode: the music waits until you play the right key. Falling notes with note names and fingering.',
      'Listens through the microphone or over MIDI. The iPhone app connects to digital pianos over Bluetooth.',
      'Practice with the computer keyboard by finger, or tap the keys on screen.',
      'Three clean passes and a stage is learned. Progress syncs across your devices without an account.',
      'English and German, works offline, free.',
    ],
  },
]
