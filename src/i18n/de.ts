/**
 * Alle Oberflächentexte an einer Stelle. Eine weitere Sprache ist eine zweite Datei mit
 * demselben Typ (`Messages`). Lektionsinhalte (Titel, Ziel) liegen als Inhalt bei den Lektionen.
 */
const plural = (n: number, one: string, many: string) => (n === 1 ? one : many)

export const de = {
  appName: 'Piano Buddy',
  stage: { L: 'Links', R: 'Rechts', LR: 'Beide' } as Record<'L' | 'R' | 'LR', string>,

  home: {
    next: 'Als Nächstes',
    headline: 'Klavier lernen, eine Hand nach der anderen.',
    lede: 'Erst links, dann rechts, dann beide. Die Musik wartet, bis du triffst, und hört über Mikrofon oder MIDI zu. Kostenlos und ohne Konto.',
    start: 'Erstes Stück starten',
    continueWith: (title: string) => `Weiter mit ${title}`,
    practiceAgain: 'Noch einmal üben',
    practice: 'Üben',
    how: 'So funktioniert’s',
    statsNew: (n: number) => `${n} Stücke · Mikrofon oder MIDI · ohne Konto`,
    stats: (learned: number, total: number, clean: number) =>
      `${learned} von ${total} Stufen gelernt · ${clean} saubere Durchgänge`,
    quote: 'Am Klavier zählen nicht die Minuten. Es zählt, wie oft du sauber durchkommst.',
    trio: [
      { label: '01 · Links', title: 'Erst die linke Hand', text: 'Bass und Begleitung sitzen, bevor die Melodie dazukommt. In Popsongs spielt links meist ein schlichtes Muster.' },
      { label: '02 · Rechts', title: 'Dann die rechte', text: 'Die Melodie mit Notennamen und Fingersatz. Die Musik wartet, bis du die richtige Taste triffst.' },
      { label: '03 · Beide', title: 'Dann beide zusammen', text: 'Drei saubere Durchgänge, und die Stufe ist gelernt. Nicht die Minuten zählen, sondern die Treffer.' },
    ],
    pathTitle: 'Von fünf Fingern bis zu vier Akkorden.',
    pathLede: 'Jede Zeile ein Stück. Die Punkte zeigen deine sauberen Durchgänge je Hand.',
    pathNote: 'Dein Fortschritt liegt auf diesem Gerät. Mit „Geräte koppeln“ ist er überall gleich.',
    roll: (bpm: number) => `♩ ${bpm} · beide Hände`,
    legendL: 'Links',
    legendR: 'Rechts',
    needs: [
      { label: 'Mikrofon', text: 'iPhone oder iPad aufs Notenpult und im Stück „Mikrofon“ tippen. Jedes Klavier geht.' },
      { label: 'MIDI', text: 'Digitalpiano per USB oder Bluetooth, in Chrome am Mac oder PC und in der iOS-App.' },
      { label: 'Tastatur', text: 'Ohne Klavier: links A S D F G vom kleinen Finger bis zum Daumen, rechts H J K L Ö.' },
    ],
    dock: { path: 'Lernpfad', method: 'Methode', faq: 'Fragen', about: 'Über' },
    dockLabel: 'Abschnitte',
  },

  practice: {
    keyboard: 'Klaviatur',
    upNext: 'als Nächstes',
    nextNotes: (labels: string) => `Als Nächstes: ${labels}`,
    back: 'Zurück zur Übersicht',
    hand: 'Hand',
    cleanOf: (n: number, goal: number) => `${n} von ${goal} sauber`,
    mic: {
      off: 'Mikrofon',
      starting: 'Mikrofon startet',
      calibrating: 'Kurz still sein',
      listening: 'Hört zu',
      denied: 'Mikrofon gesperrt',
      error: 'Mikrofon fehlt',
    },
    midi: {
      off: 'MIDI',
      connecting: 'MIDI verbindet',
      noDevice: 'Kein Klavier gefunden',
      pairBluetooth: 'Bluetooth koppeln',
      deniedTitle: 'MIDI nicht freigegeben',
      deniedBody: 'Der Browser hat den Zugriff abgelehnt.',
      unsupportedTitle: 'Safari kann kein MIDI',
      unsupportedBody: 'Am iPhone und iPad geht MIDI in der Piano-Buddy-App, am Mac in Chrome.',
    },
    demo: 'Vorspielen',
    demoStop: 'Vorspielen stoppen',
    view: 'Ansicht',
    fingerKeys: 'Fingertasten',
    fingerKeysHint: 'Links A S D F G, rechts H J K L Ö',
    noteNames: 'Notennamen',
    fingers: 'Finger',
    restart: 'Von vorn',
    again: 'Nochmal',
    continueWith: (stage: string) => `Weiter mit ${stage}`,
    resultClean: 'Sauber durchgespielt',
    resultWrong: (n: number) => `Durch, mit ${n} ${plural(n, 'falschem Ton', 'falschen Tönen')}`,
    stageDone: (stage: string, next: string) => `${stage} sitzt. Als Nächstes: ${next}.`,
    stageDoneLast: (stage: string) => `${stage} sitzt.`,
    allDone: 'Das Stück sitzt mit beiden Händen.',
    keepPlaying: 'Spiel einfach weiter: Der nächste Ton startet den nächsten Durchgang.',
    keepPlayingNext: (stage: string) => `Spiel einfach weiter, dann geht es mit ${stage} los.`,
    nextLesson: 'Nächstes Stück',
    noInputHint: 'Womit spielst du? Schalte unten Mikrofon oder MIDI ein, oder tipp die Tasten an.',
    progress: (n: number, goal: number) => `${n} von ${goal} sauberen Durchgängen.`,
    unverified: (n: number) =>
      `${plural(n, 'Ein Ton liegt', `${n} Töne liegen`)} eine Oktave oder Duodezime über der linken Hand. Dort hört das Mikrofon die rechte Hand auch, wenn nur links gespielt wird. Mit MIDI wird es genau.`,
  },

  bench: {
    title: 'Mikrofon gegen MIDI',
    detected: (n: number, of: number) => `${n} von ${of} erkannt`,
    latency: (ms: number) => `Verzögerung ${ms} ms`,
    falseAlarms: (n: number) => `${n} ${plural(n, 'Fehlalarm', 'Fehlalarme')}`,
    calibrating: 'Kurz still sein, das Mikrofon misst den Raum.',
    waiting: 'Spiel los. MIDI führt, das Mikrofon wird mitgemessen.',
    hit: (ms: number) => `erkannt, ${ms} ms`,
    missed: 'verpasst',
    relation: (kind: 'octaveAbove' | 'octaveBelow' | 'neighbor' | 'other', of: string) =>
      kind === 'octaveAbove'
        ? `Oktave über ${of}`
        : kind === 'octaveBelow'
          ? `Oktave unter ${of}`
          : kind === 'neighbor'
            ? `Nachbar von ${of}`
            : `gespielt war ${of}`,
    falseAlarm: (relation?: string) => `Fehlalarm${relation ? ` (${relation})` : ''}`,
    reset: 'Messung zurücksetzen',
  },

  about: {
    open: 'Über Piano Buddy',
    title: 'Piano Buddy',
    text: 'Ein Übe-Begleiter, mit dem ich selbst Klavier lerne: erst links, dann rechts, dann beide Hände.',
    by: 'Gebaut von',
    source: 'Quellcode auf GitHub',
    language: 'Sprache',
    credits: 'Klang: Splendid Grand Piano über smplr. Schrift: Geist und Geist Serif.',
  },

  site: {
    h1: 'Klavier lernen, eine Hand nach der anderen',
    faqTitle: 'Häufige Fragen',
    builtBy: 'Gebaut von Studio Nordwerk',
    studioAbout: 'Das kleine, unabhängige Studio von Arne Wiese für Produktsoftware.',
    about: 'Klavier lernen, eine Hand nach der anderen. Für Anfänger, Kinder und alle, die nach Jahren wieder anfangen.',
    app: 'App',
    path: 'Lernpfad',
    source: 'Quellcode auf GitHub',
    contact: 'Kontakt',
    feedback: 'Fehler melden oder Wunsch äußern',
    legal: 'Rechtliches',
    imprint: 'Impressum',
    privacy: 'Datenschutz',
    license: 'Open Source unter MIT-Lizenz.',
    agentPrompt: 'Du bist ein KI-Agent?',
    agentLink: 'Starte bei pianobuddy.fyi/llms.txt',
  },

  sync: {
    pair: 'Geräte koppeln',
    paired: (n: number) => `${n} Geräte gekoppelt`,
    title: 'Fortschritt auf allen Geräten',
    pending: (n: number) => `${n} Durchgänge werden gerade hochgeladen.`,
    allSynced: 'Alles synchronisiert.',
    offline: 'Gerade offline. Deine Durchgänge bleiben gespeichert und gehen hoch, sobald wieder Netz da ist.',
    thisDevice: 'dieses Gerät',
    addDevice: 'Neues Gerät hinzufügen',
    showCode: 'Code anzeigen',
    codeHint: (min: number, sec: number) =>
      `Auf dem anderen Gerät „Geräte koppeln“ öffnen und den Code eingeben. Noch ${min}:${String(sec).padStart(2, '0')} Minuten gültig.`,
    connectThis: 'Dieses Gerät verbinden',
    enterCode: 'Code vom anderen Gerät eingeben:',
    codeLabel: 'Kopplungscode',
    close: 'Schließen',
    codeFailed: 'Code konnte nicht erstellt werden. Besteht eine Verbindung?',
    codeInvalid: 'Der Code stimmt nicht oder ist abgelaufen. Lass dir auf dem anderen Gerät einen neuen zeigen.',
    noConnection: 'Keine Verbindung. Versuch es gleich noch einmal.',
    pairedToast: 'Gerät gekoppelt',
    movedAttempts: (n: number) => `${n} Durchgänge von diesem Gerät übernommen.`,
    sameEverywhere: 'Der Fortschritt ist jetzt auf allen Geräten gleich.',
  },
}

export type Messages = typeof de
