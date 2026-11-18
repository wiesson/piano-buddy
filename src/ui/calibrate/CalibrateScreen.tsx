import { useEffect, useReducer, useRef, useState } from 'react'
import { MicListener, type MicStatus } from '../../audio/mic'
import { TakeCollector, checkTake, recognizedIn, type Take } from '../../audio/calibrate'
import { A, HARMONICS, S, type Frame } from '../../audio/detector'
import {
  clearProfile,
  loadProfile,
  lookupFrom,
  mergeTakes,
  saveProfile,
  takeShape,
  type MicProfile,
} from '../../audio/profile'
import { LESSONS, type Hand } from '../../music/lessons'
import { isBlack } from '../../music/notes'
import { locale, t } from '../../i18n'
import { displayNoteLabel } from '../../i18n/noteNames'
import { AppBar } from '../shared/AppBar'
import { BackIcon } from '../shared/icons'
import { usePrefersLight } from '../shared/usePrefersLight'
import { useThemeColor } from '../shared/useThemeColor'

/**
 * Lernmodus fürs Mikrofon: Die App zeigt Taste für Taste, man schlägt jede zweimal an.
 * Jeder Anschlag wird geprüft (richtige Taste? laut genug?) und gemessen, ob die feste Erkennung
 * ihn erkannt hätte. Am Ende entsteht ein Klangprofil je Ton (audio/profile.ts) und der Vergleich
 * vorher/nachher. Aufnahme und Messdaten lassen sich sichern, um Fehler nachzuvollziehen.
 */

const TAKES = 2

type HandChoice = Hand | 'LR'
type Status =
  | { kind: 'wait' }
  | { kind: 'strike' }
  | { kind: 'ok'; before: boolean }
  | { kind: 'other'; heard: number }
  | { kind: 'quiet' }

interface NoteRecord {
  midi: number
  hand: Hand
  takes: Take[]
  shapes: { shape: number[]; level: number }[]
  before: boolean[]
  after: boolean[]
}

/** Alle Töne, die in den Stücken vorkommen, je Hand aufsteigend */
function notesOf(hand: Hand) {
  return [...new Set(LESSONS.flatMap((l) => l.notes.filter((n) => n.hand === hand).map((n) => n.midi)))].sort(
    (a, b) => a - b,
  )
}
const TARGETS: Record<HandChoice, { midi: number; hand: Hand }[]> = {
  L: notesOf('L').map((midi) => ({ midi, hand: 'L' as const })),
  R: notesOf('R').map((midi) => ({ midi, hand: 'R' as const })),
  LR: [...notesOf('L').map((midi) => ({ midi, hand: 'L' as const })), ...notesOf('R').map((midi) => ({ midi, hand: 'R' as const }))],
}

export function CalibrateScreen({ onBack }: { onBack: () => void }) {
  const paper = usePrefersLight()
  useThemeColor(paper ? '#f6eedf' : '#241a17')
  const [phase, setPhase] = useState<'intro' | 'run' | 'done'>('intro')
  const [choice, setChoice] = useState<HandChoice>('R')
  const [existing, setExisting] = useState<MicProfile | null>(() => loadProfile())
  const [micStatus, setMicStatus] = useState<MicStatus>('off')
  const [status, setStatus] = useState<Status>({ kind: 'wait' })
  const [, rerender] = useReducer((x: number) => x + 1, 0)
  const [audio, setAudio] = useState<{ url: string; ext: string } | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const targets = TARGETS[choice]
  const indexRef = useRef(0)
  const records = useRef(new Map<number, NoteRecord>())
  const micRef = useRef<MicListener | null>(null)
  const levelRef = useRef(0)
  const heardRef = useRef<number[]>([])
  const recorder = useRef<MediaRecorder | null>(null)
  const chunks = useRef<Blob[]>([])
  const advanceTimer = useRef<number | null>(null)

  const current = targets[indexRef.current]

  const record = (midi: number, hand: Hand) => {
    let r = records.current.get(midi)
    if (!r) {
      r = { midi, hand, takes: [], shapes: [], before: [], after: [] }
      records.current.set(midi, r)
    }
    return r
  }

  const next = () => {
    if (advanceTimer.current) window.clearTimeout(advanceTimer.current)
    advanceTimer.current = null
    if (indexRef.current + 1 >= targets.length) return finish()
    indexRef.current++
    setStatus({ kind: 'wait' })
    rerender()
  }

  const onTake = (take: Take) => {
    const mic = micRef.current
    const target = targets[indexRef.current]
    if (!mic || !target || advanceTimer.current) return
    const cal = mic.calibration
    const check = checkTake(take, target.midi, cal)
    if (!check.ok) return setStatus(check.reason === 'quiet' ? { kind: 'quiet' } : { kind: 'other', heard: check.heard })
    const shape = takeShape(take.frames, target.midi)
    if (!shape) return setStatus({ kind: 'quiet' })
    const r = record(target.midi, target.hand)
    const before = recognizedIn(take, target.midi, cal, null)
    r.takes.push(take)
    r.shapes.push(shape)
    r.before.push(before)
    setStatus({ kind: 'ok', before })
    rerender()
    if (r.takes.length >= TAKES) advanceTimer.current = window.setTimeout(next, 650)
  }

  // Die Rückrufe des Mikrofons sehen immer den aktuellen Stand
  const handlers = useRef({ onTake, strike: () => setStatus({ kind: 'strike' }) })
  handlers.current = { onTake, strike: () => setStatus({ kind: 'strike' }) }

  const start = () => {
    records.current.clear()
    indexRef.current = 0
    setStatus({ kind: 'wait' })
    setNotice(null)
    const collector = new TakeCollector(
      () => handlers.current.strike(),
      (take) => handlers.current.onTake(take),
    )
    const mic = new MicListener({
      // Für die Anzeige „ich höre“ zählt die feste Erkennung: genau die, die wir verbessern wollen
      expected: () => new Set(targets[indexRef.current] ? [targets[indexRef.current].midi] : []),
      onNote: () => {},
      onStatus: setMicStatus,
      onLevel: (level, heard) => {
        levelRef.current = level
        heardRef.current = heard
      },
      onFrame: (f, tMs) => collector.push(f, tMs),
    })
    micRef.current = mic
    void mic.start()
    setPhase('run')
  }

  // Mitschnitt, sobald das Mikrofon läuft: zum Sichern, falls etwas nicht erkannt wird
  useEffect(() => {
    if (micStatus !== 'calibrating' || recorder.current) return
    const stream = micRef.current?.mediaStream
    if (!stream || typeof MediaRecorder === 'undefined') return
    try {
      const rec = new MediaRecorder(stream)
      chunks.current = []
      rec.ondataavailable = (e) => e.data.size && chunks.current.push(e.data)
      rec.onstop = () => {
        const type = rec.mimeType || 'audio/webm'
        const blob = new Blob(chunks.current, { type })
        setAudio({ url: URL.createObjectURL(blob), ext: type.includes('mp4') ? 'm4a' : 'webm' })
      }
      rec.start()
      recorder.current = rec
    } catch {
      // ohne Mitschnitt geht der Lernmodus genauso
    }
  }, [micStatus])

  const stopMic = () => {
    if (recorder.current?.state === 'recording') recorder.current.stop()
    recorder.current = null
    micRef.current?.stop()
    micRef.current = null
  }

  const finish = () => {
    if (advanceTimer.current) window.clearTimeout(advanceTimer.current)
    advanceTimer.current = null
    const cal = micRef.current?.calibration ?? null
    stopMic()
    const notes = { ...(loadProfile()?.notes ?? {}) }
    for (const r of records.current.values()) {
      const p = mergeTakes(r.shapes)
      if (p) notes[r.midi] = p
    }
    if (records.current.size) {
      const profile: MicProfile = { name: '', createdAt: new Date().toISOString(), notes }
      saveProfile(profile)
      setExisting(profile)
      const lookup = lookupFrom(profile)
      for (const r of records.current.values()) r.after = r.takes.map((tk) => recognizedIn(tk, r.midi, cal, lookup))
    }
    setPhase('done')
  }

  useEffect(
    () => () => {
      if (advanceTimer.current) window.clearTimeout(advanceTimer.current)
      stopMic()
    },
    [],
  )
  useEffect(() => () => void (audio && URL.revokeObjectURL(audio.url)), [audio])

  const redo = () => {
    if (!current) return
    if (advanceTimer.current) window.clearTimeout(advanceTimer.current)
    advanceTimer.current = null
    records.current.delete(current.midi)
    setStatus({ kind: 'wait' })
    rerender()
  }

  const reset = () => {
    clearProfile()
    setExisting(null)
    setNotice(t.calib.resetDone)
  }

  const saveData = () => {
    const rows = (m: number) => [m - 24, m - 19, m - 12, m - 2, m - 1, m, m + 1, m + 2, m + 12]
    const dump = (f: Frame, m: number) => ({
      rms: round(f.rms),
      fresh: round(f.freshness),
      notes: Object.fromEntries(
        rows(m).map((k) => [k, { s: round(S(f, k)), a: Array.from({ length: HARMONICS }, (_, h) => round(A(f, k, h + 1))) }]),
      ),
    })
    const data = {
      app: 'Piano Buddy',
      createdAt: new Date().toISOString(),
      profile: loadProfile(),
      notes: [...records.current.values()].map((r) => ({
        midi: r.midi,
        label: displayNoteLabel(r.midi),
        hand: r.hand,
        before: r.before,
        after: r.after,
        takes: r.takes.map((tk) => ({ pre: tk.pre.map((f) => dump(f, r.midi)), frames: tk.frames.map((f) => dump(f, r.midi)) })),
      })),
    }
    download(new Blob([JSON.stringify(data)], { type: 'application/json' }), `piano-buddy-messung-${stamp()}.json`)
  }

  const back = () => {
    stopMic()
    onBack()
  }

  return (
    <div className={`calib ${paper ? 'paper' : ''}`}>
      <AppBar
        left={
          <button className="icon-button" onClick={back} aria-label={t.practice.back}>
            <BackIcon />
          </button>
        }
        title={<span className="appbar-text">{t.calib.title}</span>}
      />
      <main className="calib-main">
        {phase === 'intro' && (
          <Intro
            choice={choice}
            onChoice={setChoice}
            existing={existing}
            notice={notice}
            onReset={reset}
            onStart={start}
          />
        )}
        {phase === 'run' && current && (
          <Run
            target={current}
            index={indexRef.current}
            total={targets.length}
            targets={targets}
            records={records.current}
            micStatus={micStatus}
            status={status}
            levelRef={levelRef}
            heardRef={heardRef}
            onSkip={next}
            onRedo={redo}
            onFinish={finish}
          />
        )}
        {phase === 'done' && (
          <Done records={[...records.current.values()]} audio={audio} onSaveData={saveData} onDone={back} />
        )}
      </main>
    </div>
  )
}

function Intro(p: {
  choice: HandChoice
  onChoice: (c: HandChoice) => void
  existing: MicProfile | null
  notice: string | null
  onReset: () => void
  onStart: () => void
}) {
  return (
    <section className="calib-card">
      <h2 className="calib-title">{t.calib.introTitle}</h2>
      <p className="calib-text">{t.calib.introText}</p>
      <ul className="calib-tips">
        {t.calib.tips.map((tip) => (
          <li key={tip}>{tip}</li>
        ))}
      </ul>
      <div className="calib-hands" role="radiogroup" aria-label={t.practice.hand}>
        {(['L', 'R', 'LR'] as const).map((h) => (
          <button
            key={h}
            type="button"
            role="radio"
            aria-checked={p.choice === h}
            className={`calib-hand${p.choice === h ? ' on' : ''}`}
            onClick={() => p.onChoice(h)}
          >
            <span>{t.calib.hands[h]}</span>
            <small>{t.calib.noteCount(TARGETS[h].length)}</small>
          </button>
        ))}
      </div>
      {p.existing && (
        <p className="calib-small">
          {t.calib.existing(new Date(p.existing.createdAt).toLocaleDateString(locale))}{' '}
          <button type="button" className="calib-link" onClick={p.onReset}>
            {t.calib.reset}
          </button>
        </p>
      )}
      {p.notice && <p className="calib-small">{p.notice}</p>}
      <button type="button" className="calib-primary" onClick={p.onStart}>
        {t.calib.start}
      </button>
    </section>
  )
}

function Run(p: {
  target: { midi: number; hand: Hand }
  index: number
  total: number
  targets: { midi: number; hand: Hand }[]
  records: Map<number, NoteRecord>
  micStatus: MicStatus
  status: Status
  levelRef: React.RefObject<number>
  heardRef: React.RefObject<number[]>
  onSkip: () => void
  onRedo: () => void
  onFinish: () => void
}) {
  const takes = p.records.get(p.target.midi)?.takes.length ?? 0
  const label = displayNoteLabel(p.target.midi)
  const blocked = p.micStatus === 'denied' || p.micStatus === 'error'
  const line = blocked
    ? t.practice.mic[p.micStatus]
    : p.micStatus !== 'listening'
      ? t.calib.quiet
      : p.status.kind === 'strike'
        ? t.calib.strike
        : p.status.kind === 'ok'
          ? t.calib.gotIt(p.status.before)
          : p.status.kind === 'other'
            ? t.calib.soundedLike(displayNoteLabel(p.status.heard))
            : p.status.kind === 'quiet'
              ? t.calib.tooQuiet
              : t.calib.hint
  // Nur die Töne der aktuellen Hand auf der Klaviatur
  const handNotes = p.targets.filter((x) => x.hand === p.target.hand).map((x) => x.midi)
  return (
    <section className="calib-run">
      <p className="calib-mono">
        {t.calib.progress(p.index + 1, p.total)} · {t.stage[p.target.hand]}
      </p>
      <h2 className={`calib-note calib-note-${p.target.hand}`}>{t.calib.play(label)}</h2>
      <div className="calib-takes" aria-label={`${takes} / ${TAKES}`}>
        {Array.from({ length: TAKES }, (_, i) => (
          <span key={i} className={`calib-take${i < takes ? ' on' : ''}`} />
        ))}
      </div>
      <p className={`calib-status calib-status-${p.status.kind}`} aria-live="polite">
        {line}
      </p>
      <MiniKeys notes={handNotes} target={p.target.midi} hand={p.target.hand} records={p.records} />
      <Live levelRef={p.levelRef} heardRef={p.heardRef} active={p.micStatus === 'listening'} />
      <div className="calib-actions">
        <button type="button" className="ghost" onClick={p.onRedo} disabled={!takes}>
          {t.calib.redo}
        </button>
        <button type="button" className="ghost" onClick={p.onSkip}>
          {t.calib.skip}
        </button>
        <span className="spacer" />
        <button type="button" className="ghost" onClick={p.onFinish}>
          {t.calib.finishNow}
        </button>
      </div>
    </section>
  )
}

/** Pegel und was die feste Erkennung gerade hört, ohne React bei jedem Frame neu zu zeichnen */
function Live({
  levelRef,
  heardRef,
  active,
}: {
  levelRef: React.RefObject<number>
  heardRef: React.RefObject<number[]>
  active: boolean
}) {
  const bar = useRef<HTMLSpanElement>(null)
  const [heard, setHeard] = useState('')
  useEffect(() => {
    let raf = 0
    let last = 0
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop)
      if (bar.current) bar.current.style.transform = `scaleX(${active ? Math.max(0.02, levelRef.current) : 0.02})`
      if (now - last > 120) {
        last = now
        setHeard(heardRef.current.map(displayNoteLabel).join(' '))
      }
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [active, levelRef, heardRef])
  return (
    <div className="calib-live">
      <span className="calib-level" aria-hidden="true">
        <span ref={bar} />
      </span>
      <span className="calib-mono">{heard ? `${t.calib.hears}: ${heard}` : t.calib.hearsNothing}</span>
    </div>
  )
}

/** Klaviatur über die Töne einer Hand: Ziel in der Handfarbe, fertige Töne mit Häkchen */
function MiniKeys({
  notes,
  target,
  hand,
  records,
}: {
  notes: number[]
  target: number
  hand: Hand
  records: Map<number, NoteRecord>
}) {
  const lo = notes[0] - (isBlack(notes[0] - 1) ? 2 : 1)
  const hi = notes[notes.length - 1] + (isBlack(notes[notes.length - 1] + 1) ? 2 : 1)
  const whites: number[] = []
  for (let m = lo; m <= hi; m++) if (!isBlack(m)) whites.push(m)
  const W = 100 / whites.length
  const xOf = (m: number) => whites.findIndex((w) => w >= m) * W
  const done = (m: number) => (records.get(m)?.takes.length ?? 0) >= TAKES
  const cls = (m: number) =>
    [m === target && `is-target is-${hand}`, done(m) && 'is-done', !notes.includes(m) && 'is-off'].filter(Boolean).join(' ')
  return (
    <div className="calib-keys" aria-hidden="true">
      {whites.map((m) => (
        <span key={m} className={`ck-white ${cls(m)}`} style={{ left: `${xOf(m)}%`, width: `${W}%` }}>
          {done(m) && <span className="ck-check">✓</span>}
        </span>
      ))}
      {Array.from({ length: hi - lo + 1 }, (_, i) => lo + i)
        .filter(isBlack)
        .map((m) => (
          <span key={m} className={`ck-black ${cls(m)}`} style={{ left: `${xOf(m) - W * 0.3}%`, width: `${W * 0.6}%` }}>
            {done(m) && <span className="ck-check">✓</span>}
          </span>
        ))}
    </div>
  )
}

function Done({
  records,
  audio,
  onSaveData,
  onDone,
}: {
  records: NoteRecord[]
  audio: { url: string; ext: string } | null
  onSaveData: () => void
  onDone: () => void
}) {
  const total = records.reduce((s, r) => s + r.takes.length, 0)
  const before = records.reduce((s, r) => s + r.before.filter(Boolean).length, 0)
  const after = records.reduce((s, r) => s + r.after.filter(Boolean).length, 0)
  const count = (xs: boolean[]) => xs.filter(Boolean).length
  const improved = records.filter((r) => count(r.after) > count(r.before))
  const weak = records.filter((r) => count(r.after) < r.takes.length)
  const Row = ({ r }: { r: NoteRecord }) => (
    <li>
      <span className={`calib-dot calib-dot-${r.hand}`} />
      {displayNoteLabel(r.midi)}
      <span className="calib-mono">{t.calib.beforeAfter(count(r.before), count(r.after), r.takes.length)}</span>
    </li>
  )
  return (
    <section className="calib-card">
      <h2 className="calib-title">{t.calib.doneTitle}</h2>
      {total ? (
        <>
          <p className="calib-text">{t.calib.summary(before, after, total)}</p>
          {improved.length > 0 && (
            <>
              <h3 className="calib-sub">{t.calib.improved}</h3>
              <ul className="calib-list">
                {improved.map((r) => (
                  <Row key={r.midi} r={r} />
                ))}
              </ul>
            </>
          )}
          {weak.length > 0 && (
            <>
              <h3 className="calib-sub">{t.calib.stillWeak}</h3>
              <ul className="calib-list">
                {weak.map((r) => (
                  <Row key={r.midi} r={r} />
                ))}
              </ul>
            </>
          )}
          <p className="calib-small">{t.calib.saved}</p>
        </>
      ) : (
        <p className="calib-text">{t.calib.nothing}</p>
      )}
      <div className="calib-actions">
        <button type="button" className="calib-primary" onClick={onDone}>
          {t.calib.done}
        </button>
        {audio && (
          <a className="ghost" href={audio.url} download={`piano-buddy-aufnahme-${stamp()}.${audio.ext}`}>
            {t.calib.saveAudio}
          </a>
        )}
        {total > 0 && (
          <button type="button" className="ghost" onClick={onSaveData}>
            {t.calib.saveData}
          </button>
        )}
      </div>
    </section>
  )
}

const round = (x: number) => Math.round(x * 10000) / 10000
const stamp = () => new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}
