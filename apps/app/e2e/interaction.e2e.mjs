// Die fünf Übergänge der Interaktions-Karte, die echte Tests verdienen. Jeder scheitert, wenn das
// Verhalten falsch ist. Sie laufen gegen den lokalen Dev-Server (nie gegen die Website) und lesen
// den Zustand über die Agenten-Brücke des UI SDK: window.pianoAgent.snapshot() zeigt das Primitive
// „practice-session“ mit Phase, Stufe, Tempo und Pausengrund; act() bedient Tempo, Stufen-Sheet
// und Übe-Fläche. Töne aus MIDI oder Mikrofon kommen über window.pianoInput (nur Entwicklung).
//
// Start: pnpm --filter @piano/app test:flows   (startet und beendet den Dev-Server selbst)

import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync, spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const PORT = 5291
const BASE = `http://localhost:${PORT}/app`
const SESSION = `piano-flows-${process.pid}`
const LOG_KEY = 'pianobuddy.attempts.v2'
const appDir = fileURLToPath(new URL('..', import.meta.url))

let server
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function browser(...args) {
  return execFileSync('agent-browser', ['--session', SESSION, ...args], {
    encoding: 'utf8',
    env: { ...process.env, AGENT_BROWSER_IDLE_TIMEOUT_MS: '300000' },
  }).trim()
}

/** JavaScript im Browser ausführen; das Ergebnis kommt als JSON zurück */
function ev(js) {
  const out = browser('eval', `(async () => JSON.stringify(await (async () => { ${js} })()))()`)
  let v = JSON.parse(out)
  if (typeof v === 'string') v = JSON.parse(v)
  return v
}

const session = () => ev(`return window.pianoAgent.snapshot().find((c) => c.component === 'practice-session')`)
const act = (steps) => {
  const r = ev(`return await window.pianoAgent.act({ steps: ${JSON.stringify(steps)} })`)
  assert.ok(r.ok, `act fehlgeschlagen: ${JSON.stringify(r.error)}`)
  return r
}
const play = (midi, source = 'midi') => ev(`window.pianoInput(${midi}, '${source}'); return true`)
const attempts = () => ev(`return JSON.parse(localStorage.getItem('${LOG_KEY}') || '[]').length`)

/** Bis die Bedingung gilt (oder Zeit um) */
async function until(check, ms = 5000) {
  const end = Date.now() + ms
  let last
  while (Date.now() < end) {
    last = check()
    if (last) return last
    await sleep(100)
  }
  return check()
}

/** Leeres Gerät, dann ein Stück öffnen; prefs: zusätzliche Merker (ohne Präfix) */
async function open(lessonId, prefs = {}) {
  browser('open', `${BASE}/`)
  ev(`localStorage.clear(); ${Object.entries(prefs)
    .map(([k, v]) => `localStorage.setItem('pianobuddy.${k}', '${v}');`)
    .join(' ')} return true`)
  browser('open', `${BASE}/play/${lessonId}`)
  assert.ok(await until(() => ev(`return !!window.pianoAgent && !!window.pianoInput`), 10_000), 'Brücke fehlt')
  assert.ok(await until(() => session()), 'practice-session fehlt im Snapshot')
}

/** Mitspielen im vollen Tempo starten und warten, bis es läuft */
async function startPlayAlong() {
  act([{ ref: 'Tempo', action: 'setValue', args: ['100%'] }])
  await until(() => session()?.tempo === '1')
  act([{ ref: 'practice-session', action: 'restart' }])
  assert.equal((await until(() => session()?.phase === 'running' && session()))?.phase, 'running')
}

/** Zeiger-Druck dort, wo ein Finger hinträfe (ausgeblendete Leisten lassen ihn durch) */
const tapAt = (selector, fy = 0.5) =>
  ev(`
    const r = document.querySelector('${selector}').getBoundingClientRect()
    const x = r.left + r.width / 2, y = r.top + r.height * ${fy}
    const el = document.elementFromPoint(x, y)
    el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: x, clientY: y, pointerId: 1 }))
    el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientX: x, clientY: y, pointerId: 1 }))
    return el.className || el.tagName
  `)

before(async () => {
  // Belegter Port hieße: fremder Server antwortet, Tests liefen gegen ihn
  try {
    execFileSync('lsof', ['-tiTCP:' + PORT, '-sTCP:LISTEN'])
    throw new Error(`Port ${PORT} ist belegt`)
  } catch (e) {
    if (e.message?.startsWith('Port')) throw e
  }
  server = spawn('pnpm', ['exec', 'vp', 'dev', '--port', String(PORT), '--strictPort'], {
    cwd: appDir,
    detached: true,
    stdio: 'ignore',
  })
  const up = await until(() => {
    try {
      execFileSync('curl', ['-sf', '-o', '/dev/null', `${BASE}/`])
      return true
    } catch {
      return false
    }
  }, 30_000)
  assert.ok(up, 'Dev-Server kam nicht hoch')
})

after(() => {
  try {
    browser('close')
  } catch {
    /* schon zu */
  }
  // Ganze Prozessgruppe beenden, sonst bleibt Vite verwaist zurück
  try {
    if (server?.pid) process.kill(-server.pid, 'SIGTERM')
  } catch {
    /* schon beendet */
  }
})

describe('Interaktions-Karte', () => {
  it('Mitspielen, App im Hintergrund: angehalten, kein Eintrag im Protokoll', async () => {
    await open('lh-fuenf')
    await startPlayAlong()
    ev(`
      Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true })
      document.dispatchEvent(new Event('visibilitychange'))
      return true`)
    const s = await until(() => session()?.phase === 'paused' && session())
    assert.equal(s.phase, 'paused')
    assert.equal(s.pausedBy, 'background')
    // Zurück in der App: Die Zeit des Stücks wäre längst um, trotzdem bleibt es angehalten
    ev(`
      Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
      document.dispatchEvent(new Event('visibilitychange'))
      return true`)
    await sleep(2500)
    assert.equal(session().phase, 'paused')
    assert.equal(attempts(), 0)
  })

  it('Warten, Stufe sitzt: Wechsel ist angesagt, der nächste Ton zählt in der neuen Stufe', async () => {
    // „Beide Hände parallel“: Stufen Links, Rechts, Beide; links C3 bis G3 und zurück
    await open('parallel')
    const piece = [48, 50, 52, 53, 55, 53, 52, 50, 48]
    for (let pass = 0; pass < 3; pass++) {
      for (const m of piece) {
        play(m)
        await sleep(60)
      }
      // Die Ganze am Schluss: höchstens 1,5 s halten, dann Ergebnis; 1,2 s Nachklang-Sperre
      assert.equal((await until(() => session()?.phase === 'result' && session(), 4000))?.phase, 'result')
      await sleep(1300)
    }
    assert.match(ev(`return document.querySelector('.result-hint')?.textContent ?? ''`), /keep playing to start Right/)
    play(60)
    const s = await until(() => session()?.stage === 'R' && session()?.phase === 'playing' && session())
    assert.ok(s, `erwartet Stufe R und „playing“, ist ${JSON.stringify(session())}`)
  })

  it('Mitspielen: Tipp auf Band, Leisten-Fläche oder Bahn hält an; Taste setzt fort; Doppeltipp läuft nicht los', async () => {
    await open('lh-fuenf', { view: 'both' })
    await startPlayAlong()
    tapAt('.stage-band')
    assert.equal((await until(() => session()?.phase === 'paused' && session()))?.pausedBy, 'tap')
    play(48)
    assert.equal((await until(() => session()?.phase === 'running' && session()))?.phase, 'running')
    // Wo die (jetzt ausgeblendete) Tempo-Leiste war
    tapAt('.tempo-bar')
    assert.equal((await until(() => session()?.phase === 'paused' && session()))?.phase, 'paused')
    await sleep(450)
    // Bahn: oberes Drittel der Pianorolle; erst fortsetzen, dann Doppeltipp
    tapAt('.stage-roll canvas', 0.2)
    assert.equal((await until(() => session()?.phase === 'running' && session()))?.phase, 'running')
    tapAt('.stage-roll canvas', 0.2)
    tapAt('.stage-roll canvas', 0.2)
    await sleep(300)
    assert.equal(session().phase, 'paused', 'Doppeltipp darf nicht gleich weiterlaufen')
  })

  it('Mitspielen, Ergebnis: Ein Mikrofon-Ton startet keinen neuen Durchgang, eine Taste schon', async () => {
    await open('lh-fuenf')
    await startPlayAlong()
    // Nichts spielen: Nach Einzähler und 12 Schlägen (72 bpm) endet der Durchgang
    assert.equal((await until(() => session()?.phase === 'result' && session(), 25_000))?.phase, 'result')
    await sleep(2000)
    play(48, 'mic')
    await sleep(400)
    assert.equal(session().phase, 'result')
    play(48, 'midi')
    assert.equal((await until(() => session()?.phase === 'running' && session()))?.phase, 'running')
  })

  it('Vorspielen läuft, eine Taste beendet es', async () => {
    await open('lh-fuenf')
    act([{ ref: 'Stage', action: 'press', args: ['Listen'] }]) // ganzes Wort im Knopftext
    assert.equal((await until(() => session()?.phase === 'demo' && session()))?.phase, 'demo')
    assert.ok(ev(`return !!document.querySelector('.demo-stop')`), 'Stopp-Chip fehlt')
    play(48)
    const s = await until(() => session()?.phase !== 'demo' && session())
    assert.notEqual(s.phase, 'demo')
  })

  it('Debug-Ebene: fünfmal auf den Titel öffnet sie, jeder Ton bekommt genau ein Urteil, Melden hält sie fest', async () => {
    await open('lh-fuenf')
    assert.ok(!ev(`return !!document.querySelector('.dbg')`), 'Debug-Ebene ist ohne Geste schon da')
    ev(`for (let i = 0; i < 5; i++) document.querySelector('.appbar-text').click(); return true`)
    assert.ok(await until(() => ev(`return !!document.querySelector('.dbg')`)), 'Debug-Ebene geht nicht auf')
    // Warten: Schonfrist, Treffer, falsch (C3 D3 E3 … ist dran)
    play(40)
    play(48)
    play(57)
    await sleep(150)
    // Mitspielen: Die erste Taste startet nur (Bedienung), danach im Einzähler gesucht
    act([{ ref: 'Tempo', action: 'setValue', args: ['100%'] }])
    await until(() => session()?.tempo === '1')
    play(48)
    await until(() => session()?.phase === 'running')
    play(50)
    await sleep(200)
    ev(`[...document.querySelectorAll('.dbg-btn')].find((b) => b.classList.contains('dbg-primary')).click(); return true`)
    const report = await until(() => ev(`return (window.pianoReports || []).at(-1)?.data ?? null`), 8000)
    assert.ok(report, 'Melden hat nichts festgehalten')
    const verdicts = report.strikes.map((s) => s.verdict)
    assert.deepEqual(verdicts, ['grace', 'hit', 'wrong', 'control', 'ignored'])
    assert.ok(report.marks.some((m) => m.kind === 'phase' && m.text === 'running'), 'Phasenwechsel fehlt im Bericht')
    assert.equal(report.lessonId, 'lh-fuenf')
  })
})
