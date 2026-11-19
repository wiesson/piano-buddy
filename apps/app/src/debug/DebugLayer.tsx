import { useEffect, useRef, useState, type MutableRefObject } from 'react'
import { t } from '@piano/core/i18n'
import { displayNoteLabel } from '@piano/core/i18n/noteNames'
import type { UploadReport } from '../diagnostics/upload'
import { acceptedUnlit, chordSpread, latencyBySource, type DebugRing, type Strike } from './ring'
import { laneImage, snapshot, VoiceNote, VOICE_MAX_MS, type ReportContext } from './report'
import {
  VARIANT_A,
  VARIANT_B,
  setBlind,
  setVariant,
  useBlind,
  useVariant,
  variantName,
  type Variant,
} from '../ui/practice/variants'
import './debug.css'

/**
 * Debug-Ebene über dem echten Übe-Screen (STU-1286). Eine Leiste mit Varianten-Kennung und
 * „Melden“; aufgeklappt Live-Anschläge, Zeitstrahl, Latenz je Quelle und Varianten-Schalter.
 * Ein- und aus: fünfmal auf den Titel tippen. Kein Tracking: gesendet wird nur auf „Melden“.
 */

type Tab = 'live' | 'time' | 'latency' | 'variants'
type ReportState =
  | { step: 'idle' }
  | { step: 'recording'; id: number; since: number }
  | { step: 'sending'; id: number }
  | { step: 'done'; text: string }

const VERDICT_CLASS: Record<string, string> = {
  hit: 'ok',
  carried: 'ok',
  early: 'near',
  late: 'near',
  wrong: 'bad',
}

export interface StepInfo {
  index: number
  total: number
  expected: number[]
}

export default function DebugLayer({
  ring,
  phase,
  step,
  context,
  upload,
  reportRef,
  onOff,
}: {
  ring: DebugRing
  phase: string
  step: () => StepInfo | null
  context: () => ReportContext
  upload: UploadReport | null
  /** Pedal lange getreten: „Melden“ von außen auslösen */
  reportRef: MutableRefObject<(() => void) | null>
  onOff: () => void
}) {
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<Tab>('live')
  const [, setTick] = useState(0)
  const [report, setReport] = useState<ReportState>({ step: 'idle' })
  const variant = useVariant()
  const blind = useBlind()
  /** Die Meldung, die gerade läuft: Kennung, Momentaufnahme, Sprachnotiz. Spätere Rückläufer einer
   *  älteren Meldung (Freigabe, Frist) greifen nicht mehr ein. */
  const active = useRef<{ id: number; snap: ReturnType<typeof snapshot>; voice: VoiceNote } | null>(null)
  const nextId = useRef(1)

  // Neu zeichnen, wenn sich im Ring etwas tut (und für Zeitstrahl und Aufnahme-Uhr)
  useEffect(() => {
    let seen = -1
    const id = window.setInterval(() => {
      if (ring.version !== seen || tab === 'time' || report.step === 'recording') {
        seen = ring.version
        setTick((x) => x + 1)
      }
    }, 100)
    return () => clearInterval(id)
  }, [ring, tab, report.step])

  const send = async (id: number, withVoice: boolean, noMic = false) => {
    const cur = active.current
    // Nur einmal senden, und nur die Meldung, die gerade läuft
    if (!cur || cur.id !== id) return
    active.current = null
    setReport({ step: 'sending', id })
    const audio = withVoice ? await cur.voice.stop() : (cur.voice.cancel(), null)
    const snap = cur.snap
    const data = new Blob([JSON.stringify(snap.data)], { type: 'application/json' })
    const finish = (text: string) => {
      setReport({ step: 'done', text })
      window.setTimeout(() => setReport((r) => (r.step === 'done' ? { step: 'idle' } : r)), 4000)
    }
    keepLocal(snap.data, audio)
    if (!upload) return finish(t.debug.savedLocal)
    try {
      const ref = await upload('report', JSON.stringify(snap.summary), data, audio)
      finish(noMic ? `${t.debug.noMic} · ${ref}` : t.debug.sent(ref))
    } catch (e) {
      console.warn('Melden', e)
      finish(t.debug.failed)
    }
  }
  const sendRef = useRef(send)
  sendRef.current = send

  /** Melden: sofort festhalten, dann Sprachnotiz (bis „Senden“ oder höchstens eine Minute) */
  const startReport = async () => {
    // Pedal oder Knopf während der Aufnahme: senden
    if (active.current) return void sendRef.current(active.current.id, true)
    if (report.step === 'sending') return
    const id = nextId.current++
    ring.mark('report', 'melden')
    const v = new VoiceNote()
    active.current = { id, snap: snapshot(ring, context(), laneImage()), voice: v }
    setReport({ step: 'recording', id, since: performance.now() })
    if (!(await v.start())) await sendRef.current(id, false, true)
  }
  const startRef = useRef(startReport)
  startRef.current = startReport
  useEffect(() => {
    reportRef.current = () => void startRef.current()
    return () => {
      reportRef.current = null
      active.current?.voice.cancel()
      active.current = null
    }
  }, [reportRef])
  const recordingId = report.step === 'recording' ? report.id : 0
  useEffect(() => {
    if (!recordingId) return
    const timer = window.setTimeout(() => void sendRef.current(recordingId, true), VOICE_MAX_MS)
    return () => clearTimeout(timer)
  }, [recordingId])

  const name = variantName(variant)
  const tag = blind ? '?' : name || t.debug.custom
  const recSec = report.step === 'recording' ? Math.floor((performance.now() - report.since) / 1000) : 0

  return (
    <div className={`dbg${open ? ' dbg-open' : ''}`} onPointerDown={(e) => e.stopPropagation()}>
      <div className="dbg-bar">
        <button type="button" className="dbg-chip" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          <span className="dbg-dot" aria-hidden="true" />
          {t.debug.title} · {tag}
        </button>
        {open && <span className="dbg-phase">{phase}</span>}
        <span className="dbg-spacer" />
        {report.step === 'recording' ? (
          <>
            <span className="dbg-rec">{t.debug.recording(recSec)}</span>
            <button type="button" className="dbg-btn" onClick={() => void send(report.id, false)}>
              {t.debug.noVoice}
            </button>
            <button type="button" className="dbg-btn dbg-primary" onClick={() => void send(report.id, true)}>
              {t.debug.done}
            </button>
          </>
        ) : report.step === 'sending' ? (
          <span className="dbg-rec">{t.debug.sending}</span>
        ) : report.step === 'done' ? (
          <span className="dbg-rec">{report.text}</span>
        ) : (
          <button type="button" className="dbg-btn dbg-primary" onClick={() => void startReport()}>
            {t.debug.report}
          </button>
        )}
      </div>
      {open && (
        <div className="dbg-panel">
          <div className="dbg-tabs" role="tablist">
            {(['live', 'time', 'latency', 'variants'] as const).map((k) => (
              <button key={k} type="button" role="tab" aria-selected={tab === k} className="dbg-tab" onClick={() => setTab(k)}>
                {t.debug.tabs[k]}
              </button>
            ))}
            <span className="dbg-spacer" />
            <button type="button" className="dbg-tab" onClick={onOff}>
              {t.debug.off}
            </button>
          </div>
          <div className="dbg-body">
            {tab === 'live' && <Live ring={ring} step={step()} />}
            {tab === 'time' && <Timeline ring={ring} />}
            {tab === 'latency' && <Latency ring={ring} />}
            {tab === 'variants' && <Variants variant={variant} blind={blind} />}
          </div>
        </div>
      )}
    </div>
  )
}

/** Letzte Berichte zusätzlich im Speicher der Seite (ohne Sync, und zum Nachsehen im Test) */
function keepLocal(data: Record<string, unknown>, audio: Blob | null) {
  const w = window as Window & { pianoReports?: { data: Record<string, unknown>; audio: Blob | null }[] }
  w.pianoReports = [...(w.pianoReports ?? []).slice(-4), { data, audio }]
}

const notes = (ms: number[]) => ms.map(displayNoteLabel).join(' ') || '–'
const ms = (x: number | undefined) => (x === undefined || Number.isNaN(x) ? '–' : `${Math.round(x)}`)

function Live({ ring, step }: { ring: DebugRing; step: StepInfo | null }) {
  const last = ring.strikes.slice(-8).reverse()
  return (
    <div className="dbg-live">
      {step && (
        <p className="dbg-line">
          {t.debug.step(step.index + 1, step.total)} · {t.debug.expected} {notes(step.expected)}
        </p>
      )}
      {!last.length && <p className="dbg-muted">{t.debug.nothing}</p>}
      {last.length > 0 && (
        <table className="dbg-table">
          <thead>
            <tr>
              <th>{t.debug.source}</th>
              <th>♪</th>
              <th>v</th>
              <th>{t.debug.event}</th>
              <th>{t.debug.frame}</th>
              <th>{t.debug.expected}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {last.map((s) => (
              <StrikeRow key={s.id} s={s} />
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

function StrikeRow({ s }: { s: Strike }) {
  const v = s.verdict ?? 'pending'
  return (
    <tr>
      <td>{s.source}</td>
      <td className="dbg-strong">{displayNoteLabel(s.midi)}</td>
      <td>{s.velocity ?? '–'}</td>
      <td>{ms(s.arrMs - s.tMs)}</td>
      <td>{ms(s.frameMs !== undefined ? s.frameMs - s.tMs : undefined)}</td>
      <td title={s.lit ? t.debug.lit : t.debug.unlit}>
        {notes(s.expected)}
        {s.lit ? ' ●' : ''}
      </td>
      <td className={`dbg-verdict ${VERDICT_CLASS[v] ?? 'other'}`}>
        {t.debug.verdict[v]}
        {s.note ? ` (${s.note})` : s.deltaMs !== undefined ? ` ${s.deltaMs > 0 ? '+' : ''}${s.deltaMs}` : ''}
      </td>
    </tr>
  )
}

/** Zeitstrahl der letzten 10 Sekunden: oben, was erwartet war (Schrittwechsel), unten, was kam */
function Timeline({ ring }: { ring: DebugRing }) {
  // Breite in Pixeln als viewBox, damit die Schrift nicht mitgestreckt wird
  const ref = useRef<SVGSVGElement>(null)
  const [w, setW] = useState(600)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(() => setW(Math.max(200, Math.round(el.clientWidth))))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const now = performance.now()
  const span = 10_000
  const x = (tMs: number) => ((tMs - (now - span)) / span) * w
  const { strikes, marks } = ring.since(span, now)
  return (
    <svg ref={ref} className="dbg-time" viewBox={`0 0 ${w} 96`} role="img" aria-label={t.debug.tabs.time}>
      <line x1="0" x2={w} y1="48" y2="48" className="dbg-axis" />
      {[2, 4, 6, 8].map((s) => (
        <line key={s} x1={(s * w) / 10} x2={(s * w) / 10} y1="0" y2="96" className="dbg-grid" />
      ))}
      <text x="4" y="12" className="dbg-label">
        {t.debug.expected}
      </text>
      <text x="4" y="92" className="dbg-label">
        {t.debug.played}
      </text>
      {marks
        .filter((m) => m.kind === 'step' || m.kind === 'phase' || m.kind === 'pedal')
        .map((m, i) => (
          <g key={i} transform={`translate(${x(m.tMs)},0)`}>
            <line y1={m.kind === 'step' ? 18 : 0} y2="44" className={`dbg-mark ${m.kind}`} />
            <text y={m.kind === 'step' ? 30 : 16} x="3" className="dbg-mark-text">
              {m.text}
            </text>
          </g>
        ))}
      {strikes.map((s) => (
        <g key={s.id} transform={`translate(${x(s.tMs)},64)`}>
          <circle r="5" className={`dbg-hit ${VERDICT_CLASS[s.verdict ?? ''] ?? 'other'}`} />
          <text y="-8" textAnchor="middle" className="dbg-mark-text">
            {displayNoteLabel(s.midi)}
          </text>
        </g>
      ))}
    </svg>
  )
}

function Latency({ ring }: { ring: DebugRing }) {
  const { strikes } = ring.since(60_000)
  const rows = latencyBySource(strikes)
  const chord = chordSpread(strikes)
  const unlit = acceptedUnlit(strikes)
  return (
    <div className="dbg-live">
      {!rows.length && <p className="dbg-muted">{t.debug.nothing}</p>}
      {rows.length > 0 && (
        <table className="dbg-table">
          <thead>
            <tr>
              <th>{t.debug.source}</th>
              <th>n</th>
              <th>
                {t.debug.event} {t.debug.mean}
              </th>
              <th>{t.debug.event} p95</th>
              <th>
                {t.debug.frame} {t.debug.mean}
              </th>
              <th>{t.debug.frame} p95</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.source}>
                <td>{r.source}</td>
                <td>{r.n}</td>
                <td>{ms(r.event.mean)}</td>
                <td className={r.source === 'midi' && r.event.p95 > 15 ? 'dbg-verdict bad' : ''}>{ms(r.event.p95)}</td>
                <td>{ms(r.frame.mean)}</td>
                <td className={r.frame.p95 > 50 ? 'dbg-verdict bad' : ''}>{ms(r.frame.p95)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {chord.groups > 0 && <p className="dbg-line">{t.debug.chord(chord.groups, Math.round(chord.mean), Math.round(chord.max))}</p>}
      {unlit.n > 0 && <p className="dbg-line">{t.debug.unlitShare(unlit.unlit, unlit.n)}</p>}
      <p className="dbg-muted">{t.debug.goal}</p>
    </div>
  )
}

function Seg<T extends string | number | boolean>({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: T
  options: [T, string][]
  onChange: (v: T) => void
}) {
  return (
    <div className="dbg-row">
      <span className="dbg-row-label">{label}</span>
      <span className="dbg-seg">
        {options.map(([v, text]) => (
          <button key={String(v)} type="button" aria-pressed={v === value} onClick={() => onChange(v)}>
            {text}
          </button>
        ))}
      </span>
    </div>
  )
}

function Variants({ variant, blind }: { variant: Variant; blind: boolean }) {
  const set = <K extends keyof Variant>(k: K) => (v: Variant[K]) => {
    if (blind) setBlind(false)
    setVariant({ ...variant, [k]: v })
  }
  const name = variantName(variant)
  const shown = blind ? t.debug.hidden : name
  return (
    <div className="dbg-variants">
      <div className="dbg-row">
        <span className="dbg-row-label">{t.debug.preset}</span>
        <span className="dbg-seg">
          <button type="button" aria-pressed={!blind && name === 'A'} onClick={() => (setBlind(false), setVariant(VARIANT_A))}>
            A
          </button>
          <button type="button" aria-pressed={!blind && name === 'B'} onClick={() => (setBlind(false), setVariant(VARIANT_B))}>
            B
          </button>
          <button type="button" aria-pressed={blind} onClick={() => setBlind(!blind)}>
            {blind ? t.debug.reveal : t.debug.blind}
          </button>
        </span>
        <span className="dbg-muted">{shown || t.debug.custom}</span>
      </div>
      {/* Verdeckt: keine Einzelwerte zeigen, sonst ist der Blindvergleich keiner */}
      {!blind && (
        <>
          <Seg label={t.debug.lightLabel} value={variant.lit} options={[['arrive', t.debug.lightArrive], ['playable', t.debug.lightPlayable]]} onChange={set('lit')} />
          <Seg label={t.debug.hitLabel} value={variant.hit} options={[['soft', t.debug.hitSoft], ['green', t.debug.hitGreen]]} onChange={set('hit')} />
          <Seg label={t.debug.checkLabel} value={variant.check} options={[[false, t.debug.offShort], [true, t.debug.on]]} onChange={set('check')} />
          <Seg label={t.debug.wrongLabel} value={variant.wrong} options={[['red', t.debug.wrongRed], ['soft', t.debug.wrongSoft]]} onChange={set('wrong')} />
          <Seg label={t.debug.helpLabel} value={variant.help} options={[['idle', t.debug.helpIdle], ['stuck', t.debug.helpStuck]]} onChange={set('help')} />
          <Seg label={t.debug.helpMsLabel} value={variant.helpMs} options={[[1000, '1 s'], [2000, '2 s'], [3000, '3 s']]} onChange={set('helpMs')} />
          <Seg label={t.debug.wrongDelayLabel} value={variant.wrongDelayMs} options={[[350, '350'], [500, '500'], [700, '700']]} onChange={set('wrongDelayMs')} />
          <Seg label={t.debug.carryLabel} value={variant.carryMs} options={[[300, '300'], [450, '450'], [500, '500'], [700, '700']]} onChange={set('carryMs')} />
          <Seg label={t.debug.strayLabel} value={variant.strayDelay} options={[[false, t.debug.strayNow], [true, t.debug.strayLater]]} onChange={set('strayDelay')} />
          <Seg label={t.debug.repeatLabel} value={variant.repeatOk} options={[[false, t.debug.repeatWrong], [true, t.debug.repeatOk]]} onChange={set('repeatOk')} />
        </>
      )}
    </div>
  )
}
