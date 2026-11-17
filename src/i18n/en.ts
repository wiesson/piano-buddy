import type { Messages } from './de'

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many)

export const en: Messages = {
  appName: 'Piano Buddy',
  stage: { L: 'Left', R: 'Right', LR: 'Both' },

  home: {
    intro:
      'Left hand first, then right, then both. A stage is learned after three clean passes.',
    next: 'Up next',
    hint: 'Put your iPhone or iPad on the music stand and tap "Microphone" in a piece. On a Mac in Chrome and in the iOS app, "MIDI" works too. Without a piano, practice the finger patterns on your keyboard: left A S D F G from little finger to thumb, right H J K L ; from thumb to little finger.',
  },

  practice: {
    keyboard: 'Keyboard',
    upNext: 'up next',
    nextNotes: (labels: string) => `Next: ${labels}`,
    back: 'Back to overview',
    hand: 'Hand',
    cleanOf: (n: number, goal: number) => `${n} of ${goal} clean`,
    mic: {
      off: 'Microphone',
      starting: 'Microphone starting',
      calibrating: 'Quiet for a moment',
      listening: 'Listening',
      denied: 'Microphone blocked',
      error: 'No microphone',
    },
    midi: {
      off: 'MIDI',
      connecting: 'MIDI connecting',
      noDevice: 'No piano found',
      pairBluetooth: 'Pair Bluetooth',
      deniedTitle: 'MIDI not allowed',
      deniedBody: 'The browser denied access.',
      unsupportedTitle: 'Safari has no MIDI',
      unsupportedBody: 'On iPhone and iPad, MIDI works in the Piano Buddy app, on a Mac in Chrome.',
    },
    demo: 'Play it for me',
    demoStop: 'Stop playback',
    view: 'View',
    fingerKeys: 'Finger keys',
    fingerKeysHint: 'Left A S D F G, right H J K L ;',
    noteNames: 'Note names',
    fingers: 'Fingering',
    restart: 'Restart',
    again: 'Again',
    continueWith: (stage: string) => `Continue with ${stage}`,
    resultClean: 'Clean pass',
    resultWrong: (n: number) => `Finished with ${n} ${plural(n, 'wrong note', 'wrong notes')}`,
    stageDone: (stage: string, next: string) => `${stage} is learned. Up next: ${next}.`,
    stageDoneLast: (stage: string) => `${stage} is learned.`,
    allDone: 'You can play the piece with both hands.',
    keepPlaying: 'Just keep playing: the next note starts the next pass.',
    keepPlayingNext: (stage: string) => `Just keep playing to start ${stage}.`,
    nextLesson: 'Next piece',
    noInputHint: 'How are you playing? Turn on the microphone or MIDI below, or tap the keys.',
    progress: (n: number, goal: number) => `${n} of ${goal} clean passes.`,
    unverified: (n: number) =>
      `${plural(n, 'One note is', `${n} notes are`)} an octave or a twelfth above the left hand. There the microphone also hears the right hand when only the left is playing. With MIDI it is exact.`,
  },

  bench: {
    title: 'Microphone vs. MIDI',
    detected: (n: number, of: number) => `${n} of ${of} detected`,
    latency: (ms: number) => `Latency ${ms} ms`,
    falseAlarms: (n: number) => `${n} ${plural(n, 'false alarm', 'false alarms')}`,
    calibrating: 'Stay quiet, the microphone is measuring the room.',
    waiting: 'Start playing. MIDI leads, the microphone is measured against it.',
    hit: (ms: number) => `detected, ${ms} ms`,
    missed: 'missed',
    relation: (kind: 'octaveAbove' | 'octaveBelow' | 'neighbor' | 'other', of: string) =>
      kind === 'octaveAbove'
        ? `octave above ${of}`
        : kind === 'octaveBelow'
          ? `octave below ${of}`
          : kind === 'neighbor'
            ? `neighbor of ${of}`
            : `played was ${of}`,
    falseAlarm: (relation?: string) => `False alarm${relation ? ` (${relation})` : ''}`,
    reset: 'Reset measurement',
  },

  about: {
    open: 'About Piano Buddy',
    title: 'Piano Buddy',
    text: 'A practice companion I use to learn piano myself: left hand first, then right, then both.',
    by: 'Built by',
    source: 'Source on GitHub',
    language: 'Language',
    credits: 'Sound: Splendid Grand Piano via smplr. Type: Geist and Geist Serif.',
  },

  site: {
    h1: 'Learn piano one hand at a time',
    faqTitle: 'Questions and answers',
    builtBy: 'Built by Studio Nordwerk',
    studioAbout: 'Arne Wiese’s small, independent studio for product software.',
    about: 'Learn piano one hand at a time. For beginners, kids and everyone picking it up again after years.',
    app: 'App',
    path: 'Learning path',
    source: 'Source on GitHub',
    contact: 'Contact',
    feedback: 'Report a bug or ask for a feature',
    legal: 'Legal',
    imprint: 'Site notice',
    privacy: 'Privacy',
    license: 'Open source under the MIT license.',
    agentPrompt: 'Are you an AI agent?',
    agentLink: 'Start at pianobuddy.fyi/llms.txt',
  },

  sync: {
    pair: 'Pair devices',
    paired: (n: number) => `${n} ${plural(n, 'device', 'devices')} paired`,
    title: 'Progress on all devices',
    pending: (n: number) => `${n} ${plural(n, 'pass is', 'passes are')} being uploaded.`,
    allSynced: 'Everything is synced.',
    offline: 'Offline right now. Your passes stay saved and upload as soon as you are back online.',
    thisDevice: 'this device',
    addDevice: 'Add a new device',
    showCode: 'Show code',
    codeHint: (min: number, sec: number) =>
      `On the other device, open "Pair devices" and enter the code. Valid for another ${min}:${String(sec).padStart(2, '0')} minutes.`,
    connectThis: 'Connect this device',
    enterCode: 'Enter the code from the other device:',
    codeLabel: 'Pairing code',
    close: 'Close',
    codeFailed: 'Could not create the code. Are you connected?',
    codeInvalid: 'The code is wrong or has expired. Get a new one on the other device.',
    noConnection: 'No connection. Try again in a moment.',
    pairedToast: 'Device paired',
    movedAttempts: (n: number) => `Took over ${n} ${plural(n, 'pass', 'passes')} from this device.`,
    sameEverywhere: 'Your progress is now the same on all devices.',
  },
}
