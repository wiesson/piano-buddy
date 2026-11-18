import { useEffect, useReducer, useRef, useState } from 'react'
import { audioContext } from '../../audio/audio'
import { MicListener, type MicStatus } from '../../audio/mic'
import { TakeCollector, checkTake, evaluateTake, type Take } from '../../audio/calibrate'
import { A, HARMONICS, S, MIN_MIDI, type Calibration, type Frame } from '../../audio/detector'
import { clearProfile, loadProfile, lookupFrom, mergeTakes, saveProfile, takeShape, type MicProfile } from '../../audio/profile'
import { LESSONS, type Hand } from '../../music/lessons'
import { isBlack } from '../../music/notes'
import { locale, t } from '../../i18n'
import { displayNoteLabel } from '../../i18n/noteNames'
import { AppBar } from '../shared/AppBar'
import { BackIcon } from '../shared/icons'
import { usePrefersLight } from '../shared/usePrefersLight'
import { useThemeColor } from '../shared/useThemeColor'
import { SendReport } from './SendReport'

/**
 * Lernmodus fürs Mikrofon. Standard ist die C-Dur-Tonleiter hinauf und hinunter: Jeder Ton kommt
 * zweimal, jeder ist Nachbar des nächsten, so liegen Treffer und Verwechslungen in einem Lauf vor.
 *
 * Jeder Anschlag wird am Pegel erkannt, geprüft (die richtige Taste?) und bewertet: Hätte die
 * feste Erkennung ihn erkannt, und hätte sie zusätzlich falsche Töne gemeldet? Es geht immer
 * weiter: Klingt ein Anschlag nach einer anderen Taste, gibt es genau einen zweiten Versuch.
 * Am Ende entsteht ein Klangprofil je Ton und der Vergleich vorher/nachher; die Messung lässt
 * sich an Piano Buddy senden.
 */

type Mode = 'scale' | 'all'
type HandChoice = Hand | 'LR'
type Target = { midi: number; hand: Hand }
type Eval = { hit: boolean; extra: number[] }

interface Strike {
  index: number
  midi: number
  hand: Hand
  take: Take
  shape: { shape: number[]; level: number } | null
  unsure: boolean
  before: Eval
  after?: Eval
}

type Status =
  | { kind: 'wait' }
  | { kind: 'strike' }
  | { kind: 'done'; strike: Strike }
  | { kind: 'other'; heard: number }
  | { kind: 'quiet' }

const up = (notes: number[]) => [...notes, ...notes.slice(0, -1).reverse()]
const SCALE: Record<Hand, number[]> = {
  L: up([48, 50, 52, 53, 55, 57, 59, 60]),
  R: up([60, 62, 64, 65, 67, 69, 71, 72]),
}
function notesOf(hand: Hand) {
  return [...new Set(LESSONS.flatMap((l) => l.notes.filter((n) => n.hand === hand).map((n) => n.midi)))].sort((a, b) => a - b)
}
function sequence(mode: Mode, choice: HandChoice): Target[] {
  const hands: Hand[] = choice === 'LR' ? ['L', 'R'] : [choice]
  return hands.flatMap((hand) =>
    mode === 'scale' ? SCALE[hand].map((midi) => ({ midi, hand })) : notesOf(hand).flatMap((midi) => [{ midi, hand }, { midi, hand }]),
  )
}

const isNative = () => !!(window as Window & { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.()

export function CalibrateScreen({ onBack, synced }: { onBack: () => void; synced: boolean }) {
  const paper = usePrefersLight()
  useThemeColor(paper ? '#f6eedf' : '#241a17')
  const [phase, setPhase] = useState<'intro' | 'run' | 'done'>('intro')
  const [choice, setChoice] = useState<HandChoice>('L')
  const [mode, setMode] = useState<Mode>('scale')
  const [existing, setExisting] = useState<MicProfile | null>(() => loadProfile())
  const [micStatus, setMicStatus] = useState<MicStatus>('off')
  const [status, setStatus] = useState<Status>({ kind: 'wait' })
  const [, rerender] = useReducer((x: number) => x + 1, 0)
  const [audio, setAudio] = useState<Blob | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const seq = useRef<Target[]>([])
  const index = useRef(0)
  const rejects = useRef(0)
  const strikes = useRef<Strike[]>([])
  const calRef = useRef<Calibration | null>(null)
  const micRef = useRef<MicListener | null>(null)
  const levelRef = useRef(0)
  const heardRef = useRef<number[]>([])
  const recorder = useRef<MediaRecorder | null>(null)
  const chunks = useRef<Blob[]>([])
  const finishTimer = useRef<number | null>(null)

  const target = seq.current[index.current]

  const advance = () => {
    rejects.current = 0
    index.current++
    if (index.current >= seq.current.length) finishTimer.current = window.setTimeout(finish, 700)
    rerender()
  }

  const onTake = (take: Take) => {
    const mic = micRef.current
    const tg = seq.current[index.current]
    if (!mic || !tg || finishTimer.current) return
    const cal = mic.calibration
    calRef.current = cal
    const check = checkTake(take, tg.midi, cal)
    // Klang es nach einer anderen Taste: einmal nachfragen, beim zweiten Mal weiter (als unsicher)
    if (!check.ok && rejects.current < 1) {
      rejects.current++
      return setStatus(check.reason === 'quiet' ? { kind: 'quiet' } : { kind: 'other', heard: check.heard })
    }
    const strike: Strike = {
      index: index.current,
      midi: tg.midi,
      hand: tg.hand,
      take,
      shape: check.ok ? takeShape(take.frames, tg.midi) : null,
      unsure: !check.ok,
      before: evaluateTake(take, tg.midi, cal, null),
    }
    strikes.current.push(strike)
    setStatus({ kind: 'done', strike })
    advance()
  }

  // Rückrufe des Mikrofons sehen immer den aktuellen Stand
  const handlers = useRef({ onTake, strike: () => setStatus({ kind: 'strike' }) })
  handlers.current = { onTake, strike: () => setStatus({ kind: 'strike' }) }

  const start = () => {
    seq.current = sequence(mode, choice)
    index.current = 0
    rejects.current = 0
    strikes.current = []
    setAudio(null)
    setStatus({ kind: 'wait' })
    setNotice(null)
    const collector = new TakeCollector(
      () => handlers.current.strike(),
      (take) => handlers.current.onTake(take),
    )
    const mic = new MicListener({
      // „Ich höre“ zeigt die feste Erkennung: genau die, die wir messen
      expected: () => new Set(seq.current[index.current] ? [seq.current[index.current].midi] : []),
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

  // Mitschnitt, sobald das Mikrofon läuft
  useEffect(() => {
    if (micStatus !== 'calibrating' || recorder.current) return
    const stream = micRef.current?.mediaStream
    if (!stream || typeof MediaRecorder === 'undefined') return
    try {
      const rec = new MediaRecorder(stream)
      chunks.current = []
      rec.ondataavailable = (e) => e.data.size && chunks.current.push(e.data)
      rec.onstop = () => setAudio(new Blob(chunks.current, { type: rec.mimeType || 'audio/webm' }))
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
    if (finishTimer.current) window.clearTimeout(finishTimer.current)
    finishTimer.current = null
    calRef.current = micRef.current?.calibration ?? calRef.current
    stopMic()
    const byNote = new Map<number, { shape: number[]; level: number }[]>()
    for (const s of strikes.current) if (s.shape) byNote.set(s.midi, [...(byNote.get(s.midi) ?? []), s.shape])
    if (byNote.size) {
      const notes = { ...(loadProfile()?.notes ?? {}) }
      for (const [m, shapes] of byNote) {
        const p = mergeTakes(shapes)
        if (p) notes[m] = p
      }
      const profile: MicProfile = { name: '', createdAt: new Date().toISOString(), notes }
      saveProfile(profile)
      setExisting(profile)
      const lookup = lookupFrom(profile)
      for (const s of strikes.current) s.after = evaluateTake(s.take, s.midi, calRef.current, lookup)
    }
    setPhase('done')
  }

  useEffect(
    () => () => {
      if (finishTimer.current) window.clearTimeout(finishTimer.current)
      stopMic()
    },
    [],
  )

  const back = () => {
    const last = strikes.current.at(-1)
    if (!last) return
    strikes.current.pop()
    index.current = last.index
    rejects.current = 0
    setStatus({ kind: 'wait' })
    rerender()
  }

  const reset = () => {
    clearProfile()
    setExisting(null)
    setNotice(t.calib.resetDone)
  }

  const leave = () => {
    stopMic()
    onBack()
  }

  return (
    <div className={`calib ${paper ? 'paper' : ''}`}>
      <AppBar
        left={
          <button className="icon-button" onClick={leave} aria-label={t.practice.back}>
            <BackIcon />
          </button>
        }
        title={<span className="appbar-text">{t.calib.title}</span>}
      />
      <main className="calib-main">
        {phase === 'intro' && (
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
                  aria-checked={choice === h}
                  className={`calib-hand${choice === h ? ' on' : ''}`}
                  onClick={() => setChoice(h)}
                >
                  <span>{t.calib.hands[h]}</span>
                  <small>{t.calib.strikeCount(sequence(mode, h).length)}</small>
                </button>
              ))}
            </div>
            <div className="calib-modes" role="radiogroup">
              {(['scale', 'all'] as const).map((m) => (
                <button key={m} type="button" role="radio" aria-checked={mode === m} className={`chip-mode${mode === m ? ' on' : ''}`} onClick={() => setMode(m)}>
                  {t.calib.modes[m]}
                </button>
              ))}
            </div>
            {existing && (
              <p className="calib-small">
                {t.calib.existing(new Date(existing.createdAt).toLocaleDateString(locale))}{' '}
                <button type="button" className="calib-link" onClick={reset}>
                  {t.calib.reset}
                </button>
              </p>
            )}
            {notice && <p className="calib-small">{notice}</p>}
            <button type="button" className="calib-primary" onClick={start}>
              {t.calib.start}
            </button>
          </section>
        )}

        {phase === 'run' && (
          <Run
            seq={seq.current}
            index={index.current}
            target={target}
            strikes={strikes.current}
            micStatus={micStatus}
            status={status}
            levelRef={levelRef}
            heardRef={heardRef}
            onBack={back}
            onSkip={advance}
            onFinish={finish}
          />
        )}

        {phase === 'done' && (
          <Done
            strikes={strikes.current}
            audio={audio}
            synced={synced}
            data={() => measurement(strikes.current, calRef.current, mode, choice)}
            summary={() => summaryOf(strikes.current, mode, choice)}
            onDone={leave}
          />
        )}
      </main>
    </div>
  )
}

function statusLine(status: Status, target: Target | undefined, micStatus: MicStatus) {
  if (micStatus === 'denied' || micStatus === 'error') return t.practice.mic[micStatus]
  if (micStatus !== 'listening') return t.calib.quiet
  const note = target ? displayNoteLabel(target.midi) : ''
  switch (status.kind) {
    case 'strike':
      return t.calib.strike
    case 'other':
      return t.calib.soundedLike(displayNoteLabel(status.heard), note)
    case 'quiet':
      return t.calib.tooQuiet
    case 'done': {
      const s = status.strike
      const label = displayNoteLabel(s.midi)
      const extra = s.before.extra.map(displayNoteLabel).join(', ')
      if (s.unsure) return t.calib.unsure(label)
      if (s.before.hit) return extra ? t.calib.hitExtra(label, extra) : t.calib.hit(label)
      return extra ? t.calib.missExtra(label, extra) : t.calib.miss(label)
    }
    default:
      return t.calib.hint
  }
}

const markOf = (s: Strike | undefined) =>
  !s ? '' : s.unsure ? 'unsure' : !s.before.hit ? 'miss' : s.before.extra.length ? 'extra' : 'ok'

function Run(p: {
  seq: Target[]
  index: number
  target: Target | undefined
  strikes: Strike[]
  micStatus: MicStatus
  status: Status
  levelRef: React.RefObject<number>
  heardRef: React.RefObject<number[]>
  onBack: () => void
  onSkip: () => void
  onFinish: () => void
}) {
  const byIndex = new Map(p.strikes.map((s) => [s.index, s]))
  const tone = p.status.kind === 'done' ? markOf(p.status.strike) : p.status.kind
  return (
    <section className="calib-run">
      <p className="calib-mono">
        {t.calib.progress(Math.min(p.index + 1, p.seq.length), p.seq.length)}
        {p.target && ` · ${t.stage[p.target.hand]}`}
      </p>
      <h2 className={`calib-note calib-note-${p.target?.hand ?? 'R'}`}>{p.target ? t.calib.play(displayNoteLabel(p.target.midi)) : t.calib.doneTitle}</h2>
      <p className={`calib-status calib-status-${tone}`} aria-live="polite">
        {statusLine(p.status, p.target, p.micStatus)}
      </p>
      <ol className="calib-strip" aria-label={t.calib.legend}>
        {p.seq.map((tg, i) => {
          const mark = markOf(byIndex.get(i))
          return (
            <li key={i} className={`${mark}${i === p.index ? ' now' : ''}`}>
              <span>{displayNoteLabel(tg.midi).replace(/\d/, '')}</span>
              <i aria-hidden="true">{mark === 'ok' ? '✓' : mark === 'miss' ? '○' : mark === 'extra' ? '!' : mark === 'unsure' ? '?' : ''}</i>
            </li>
          )
        })}
      </ol>
      <p className="calib-mono">{t.calib.legend}</p>
      {p.target && <MiniKeys seq={p.seq} target={p.target} />}
      <Live levelRef={p.levelRef} heardRef={p.heardRef} active={p.micStatus === 'listening'} />
      <div className="calib-actions">
        <button type="button" className="ghost" onClick={p.onBack} disabled={!p.strikes.length}>
          {t.calib.back}
        </button>
        <button type="button" className="ghost" onClick={p.onSkip} disabled={!p.target}>
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
function Live({ levelRef, heardRef, active }: { levelRef: React.RefObject<number>; heardRef: React.RefObject<number[]>; active: boolean }) {
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

/** Klaviatur über die Töne der aktuellen Hand, Ziel in der Handfarbe */
function MiniKeys({ seq, target }: { seq: Target[]; target: Target }) {
  const notes = [...new Set(seq.filter((x) => x.hand === target.hand).map((x) => x.midi))].sort((a, b) => a - b)
  const lo = notes[0] - (isBlack(notes[0] - 1) ? 2 : 1)
  const hi = notes[notes.length - 1] + (isBlack(notes[notes.length - 1] + 1) ? 2 : 1)
  const whites: number[] = []
  for (let m = lo; m <= hi; m++) if (!isBlack(m)) whites.push(m)
  const W = 100 / whites.length
  const xOf = (m: number) => whites.findIndex((w) => w >= m) * W
  const cls = (m: number) => [m === target.midi && `is-target is-${target.hand}`, !notes.includes(m) && 'is-off'].filter(Boolean).join(' ')
  return (
    <div className="calib-keys" aria-hidden="true">
      {whites.map((m) => (
        <span key={m} className={`ck-white ${cls(m)}`} style={{ left: `${xOf(m)}%`, width: `${W}%` }}>
          {m % 12 === 0 ? displayNoteLabel(m) : ''}
        </span>
      ))}
      {Array.from({ length: hi - lo + 1 }, (_, i) => lo + i)
        .filter(isBlack)
        .map((m) => (
          <span key={m} className={`ck-black ${cls(m)}`} style={{ left: `${xOf(m) - W * 0.3}%`, width: `${W * 0.6}%` }} />
        ))}
    </div>
  )
}

function Done({
  strikes,
  audio,
  synced,
  data,
  summary,
  onDone,
}: {
  strikes: Strike[]
  audio: Blob | null
  synced: boolean
  data: () => Blob
  summary: () => string
  onDone: () => void
}) {
  const total = strikes.length
  const count = (f: (s: Strike) => number) => strikes.reduce((n, s) => n + f(s), 0)
  const hb = count((s) => +s.before.hit)
  const ha = count((s) => +!!s.after?.hit)
  const eb = count((s) => s.before.extra.length)
  const ea = count((s) => s.after?.extra.length ?? 0)
  const notes = [...new Set(strikes.map((s) => s.midi))]
    .map((m) => {
      const ss = strikes.filter((s) => s.midi === m)
      return {
        m,
        hand: ss[0].hand,
        n: ss.length,
        hb: ss.filter((s) => s.before.hit).length,
        ha: ss.filter((s) => s.after?.hit).length,
        eb: ss.reduce((x, s) => x + s.before.extra.length, 0),
        ea: ss.reduce((x, s) => x + (s.after?.extra.length ?? 0), 0),
      }
    })
    .filter((r) => r.hb < r.n || r.ha < r.n || r.eb || r.ea)
    .sort((a, b) => b.n - b.hb + b.eb - (a.n - a.hb + a.eb))
  const native = isNative()
  const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')
  return (
    <section className="calib-card">
      <h2 className="calib-title">{t.calib.doneTitle}</h2>
      {total ? (
        <>
          <div className="calib-compare">
            <div>
              <p className="calib-mono">{t.calib.before}</p>
              <p className="calib-big">{t.calib.hits(hb, total)}</p>
              <p className="calib-small">{t.calib.extras(eb)}</p>
            </div>
            <div>
              <p className="calib-mono">{t.calib.after}</p>
              <p className="calib-big">{t.calib.hits(ha, total)}</p>
              <p className="calib-small">{t.calib.extras(ea)}</p>
            </div>
          </div>
          {notes.length ? (
            <>
              <h3 className="calib-sub">{t.calib.perNote}</h3>
              <ul className="calib-list">
                {notes.map((r) => (
                  <li key={r.m}>
                    <span className={`calib-dot calib-dot-${r.hand}`} />
                    {displayNoteLabel(r.m)}
                    <span className="calib-mono">{t.calib.rowValue(r.hb, r.ha, r.n, r.eb, r.ea)}</span>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="calib-text">{t.calib.allGood}</p>
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
        {!native && audio && (
          <button type="button" className="ghost" onClick={() => download(audio, `piano-buddy-aufnahme-${stamp}.${audio.type.includes('mp4') ? 'm4a' : 'webm'}`)}>
            {t.calib.saveAudio}
          </button>
        )}
        {!native && total > 0 && (
          <button type="button" className="ghost" onClick={() => download(data(), `piano-buddy-messung-${stamp}.json`)}>
            {t.calib.saveData}
          </button>
        )}
      </div>
      {synced && total > 0 && <SendReport data={data} audio={audio} summary={summary} />}
    </section>
  )
}

/** Messwerte für die Auswertung: je Anschlag die Teiltöne der Taste, ihrer Nachbarn und Oktaven */
function measurement(strikes: Strike[], cal: Calibration | null, mode: Mode, choice: HandChoice) {
  const round = (x: number) => Math.round(x * 10000) / 10000
  const rows = (m: number) => [m - 24, m - 19, m - 12, m - 2, m - 1, m, m + 1, m + 2, m + 12, m + 19, m + 24, m + 28]
  const dump = (f: Frame, m: number) => ({
    rms: round(f.rms),
    fresh: round(f.freshness),
    notes: Object.fromEntries(
      rows(m)
        .filter((k) => k >= MIN_MIDI)
        .map((k) => [k, { s: round(S(f, k)), a: Array.from({ length: HARMONICS }, (_, h) => round(A(f, k, h + 1))) }]),
    ),
  })
  const data = {
    app: 'Piano Buddy',
    v: 2,
    createdAt: new Date().toISOString(),
    mode,
    hands: choice,
    userAgent: navigator.userAgent,
    sampleRate: audioContext().sampleRate,
    noise: cal ? Array.from(cal.noise, round) : null,
    profile: loadProfile(),
    strikes: strikes.map((s) => ({
      index: s.index,
      midi: s.midi,
      label: displayNoteLabel(s.midi),
      hand: s.hand,
      unsure: s.unsure,
      before: s.before,
      after: s.after ?? null,
      pre: s.take.pre.map((f) => dump(f, s.midi)),
      frames: s.take.frames.map((f) => dump(f, s.midi)),
    })),
  }
  return new Blob([JSON.stringify(data)], { type: 'application/json' })
}

function summaryOf(strikes: Strike[], mode: Mode, choice: HandChoice) {
  const n = (f: (s: Strike) => number) => strikes.reduce((x, s) => x + f(s), 0)
  return JSON.stringify({
    mode,
    hands: choice,
    strikes: strikes.length,
    before: { hit: n((s) => +s.before.hit), extra: n((s) => s.before.extra.length) },
    after: { hit: n((s) => +!!s.after?.hit), extra: n((s) => s.after?.extra.length ?? 0) },
    device: navigator.userAgent.slice(0, 160),
  })
}

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}
