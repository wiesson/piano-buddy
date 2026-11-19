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

// Eigener Port je Session, wenn mehrere Sessions parallel testen: FLOW_PORT=5391 pnpm … test:flows
const PORT = Number(process.env.FLOW_PORT) || 5291
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

/** Mausrad in der Bahn: negativ heißt vorwärts im Stück; endet 180 ms nach dem letzten Ereignis */
const wheel = (deltaY) =>
  ev(`document.querySelector('.stage-roll canvas').dispatchEvent(new WheelEvent('wheel', { deltaY: ${deltaY}, bubbles: true, cancelable: true })); return true`)

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
  // Ein Klavier per Web MIDI, eingehängt vor jeder Seite (nur benutzt, wo MIDI eingeschaltet ist)
  browser('--init-script', fileURLToPath(new URL('./fake-midi.js', import.meta.url)), 'open')
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
    // Das Mikrofon wechselt die Stufe nicht (es hört auch Sprechen und Nachklang)
    play(60, 'mic')
    await sleep(400)
    assert.deepEqual([session().stage, session().phase], ['L', 'result'])
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

  it('Spulen im Warte-Modus: geübte Stelle ab Takt 3, das Ergebnis kommt nicht ins Protokoll', async () => {
    await open('lh-fuenf') // C3 D3 E3 F3 | G3 F3 E3 D3 | C3 (Ganze)
    wheel(-100_000) // ganz nach vorn: letzter Taktanfang
    assert.equal((await until(() => session()?.fromBar === '3' && session()))?.fromBar, '3')
    play(48)
    const s = await until(() => session()?.phase === 'result' && session(), 4000)
    assert.equal(s?.phase, 'result')
    assert.equal(attempts(), 0, 'eine geübte Stelle zählt nicht als Durchgang')
  })

  it('Mitspielen läuft, Spulen hält an der Stelle an, eine Taste zählt dort ein', async () => {
    await open('lh-fuenf')
    await startPlayAlong()
    wheel(-100_000)
    const s = await until(() => session()?.pausedBy === 'seek' && session()?.fromBar === '3' && session())
    assert.ok(s, `erwartet angehalten ab Takt 3, ist ${JSON.stringify(session())}`)
    play(48)
    assert.equal((await until(() => session()?.phase === 'running' && session()))?.phase, 'running')
  })

  it('Vorspielen läuft, Stufe wechseln: Das Vorspielen endet mit der alten Stufe', async () => {
    await open('parallel')
    act([{ ref: 'Stage', action: 'press', args: ['Listen'] }])
    assert.equal((await until(() => session()?.phase === 'demo' && session()))?.phase, 'demo')
    act([{ ref: 'Stage', action: 'press', args: ['Right'] }])
    const s = await until(() => session()?.stage === 'R' && session()?.phase !== 'demo' && session())
    assert.ok(s, `erwartet Stufe R ohne Vorspielen, ist ${JSON.stringify(session())}`)
  })

  it('Klaviatur-Hilfe: Ein Durchgang speichert Ansicht, Hilfe und wie oft die Taste half', async () => {
    const piece = [48, 50, 52, 53, 55, 53, 52, 50, 48]
    const lastAttempt = () => ev(`const a = JSON.parse(localStorage.getItem('${LOG_KEY}') || '[]'); return a[a.length - 1] ?? null`)
    // Aus, in den Noten: keine Hilfe, also null
    await open('lh-fuenf', { view: 'sheet', keyHelp: 'off' })
    for (const m of piece) {
      play(m)
      await sleep(60)
    }
    assert.equal((await until(() => session()?.phase === 'result' && session(), 4000))?.phase, 'result')
    assert.deepEqual(
      (({ view, keyHelp, hinted }) => ({ view, keyHelp, hinted }))(await until(() => lastAttempt())),
      { view: 'sheet', keyHelp: 'off', hinted: 0 },
    )
    // Sofort, fallend: Die Taste leuchtet, sobald der Ton an der Linie ist; das zählt
    await open('lh-fuenf', { view: 'roll', keyHelp: 'now' })
    for (const m of piece) {
      await sleep(900)
      play(m)
    }
    assert.equal((await until(() => session()?.phase === 'result' && session(), 4000))?.phase, 'result')
    const a = await until(() => lastAttempt())
    assert.equal(a.view, 'roll')
    assert.equal(a.keyHelp, 'now')
    assert.ok(a.hinted >= 5, `hinted ${a.hinted}`)
  })

  it('MIDI: jeder Anschlag genau einmal, Loslassen beendet das Halten, langes Pedal meldet', async () => {
    await open('lh-fuenf', { midi: '1', debug: '1' }) // C3 D3 E3 F3 | G3 F3 E3 D3 | C3 (Ganze)
    assert.ok(await until(() => ev(`return !!document.querySelector('.more-trigger [class*=input-icon]')`)), 'MIDI nicht verbunden')
    const midi = (...bytes) => ev(`return window.fakeMidi(${JSON.stringify(bytes)})`)
    // Kanal 1 und 2 gemischt, jeder Ton mit Loslassen (auch als Note-On mit Stärke 0)
    for (const [i, m] of [48, 50, 52, 53, 55, 53, 52, 50].entries()) {
      midi(0x90 + (i % 2), m, 80)
      await sleep(40)
      if (i % 2) midi(0x91, m, 0)
      else midi(0x80, m, 0)
    }
    // Die Ganze am Schluss: früh losgelassen endet das Halten sofort (ohne Loslassen erst nach 1,5 s)
    midi(0x90, 48, 80)
    await sleep(150)
    midi(0x80, 48, 0)
    const s = await until(() => session()?.phase === 'result' && session(), 600)
    assert.equal(s?.phase, 'result', 'Loslassen kam nicht an')
    const a = await until(() => ev(`const a = JSON.parse(localStorage.getItem('${LOG_KEY}') || '[]'); return a[a.length - 1] ?? null`))
    // Doppelt angekommene Töne wären im Warten Fehler
    assert.deepEqual([a.clean, a.wrong, a.source], [true, 0, 'midi'])
    // Haltepedal 1,2 s getreten: Debug-Ebene meldet
    midi(0xb0, 64, 127)
    await sleep(1400)
    midi(0xb0, 64, 0)
    const report = await until(() => ev(`return (window.pianoReports || []).at(-1)?.data ?? null`), 8000)
    assert.ok(report, 'Pedal hat nicht gemeldet')
    assert.ok(report.marks.some((m) => m.kind === 'pedal'), 'Pedal fehlt im Bericht')
  })

  it('iPhone hochkant, beide Hände, enger Umfang: Die Klaviatur steht für die Stufe fest', async () => {
    browser('set', 'viewport', '390', '844')
    try {
      await open('elise')
      act([{ ref: 'Stage', action: 'press', args: ['Both'] }])
      assert.ok(await until(() => session()?.stage === 'LR'), 'Stufe „beide“ fehlt')
      await startPlayAlong()
      const keys = () => ev(`return [...document.querySelectorAll('.key-a11y')].map((k) => k.getAttribute('aria-label').split(',')[0]).join(' ')`)
      const shown = () => ev(`return window.pianoShownBeat?.() ?? null`)
      const from = shown()
      const seen = new Set()
      // Mitspielen ohne Töne: Die Musik läuft weiter, die Tasten dürfen sich dabei nie ändern
      for (let i = 0; i < 30; i++) {
        seen.add(keys())
        await sleep(300)
      }
      assert.ok(shown() > from + 4, `die Musik lief nicht weit genug (${from} → ${shown()})`)
      assert.equal(seen.size, 1, `Klaviatur wechselte: ${[...seen].join(' | ')}`)
    } finally {
      browser('set', 'viewport', '1280', '800')
    }
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

// Stücke in Stufen und Pop-Pfad (STU-1287, STU-1271)
describe('Fassungen und Pop-Pfad', () => {
  const lessonInUrl = () => decodeURIComponent(new URL(browser('get', 'url')).pathname.split('/play/')[1] ?? '')
  const stageInUrl = () => new URL(browser('get', 'url')).searchParams.get('stage')
  const switchVersion = (level) => {
    act([{ ref: 'Stage', action: 'setOpen', args: [true] }])
    act([{ ref: 'Version', action: 'setValue', args: [level] }])
  }

  it('Fassung wechseln: Übe-Screen und Hand bleiben, der Durchgang zählt für die gewählte Fassung', async () => {
    // Jingle Bells leicht, rechte Hand: zum Original, die Hand bleibt rechts
    await open('jingle~leicht?stage=R')
    assert.equal(session().stage, 'R')
    switchVersion('full')
    assert.equal(await until(() => lessonInUrl() === 'jingle' && lessonInUrl()), 'jingle')
    assert.equal(stageInUrl(), 'R')
    assert.equal((await until(() => session()?.stage === 'R' && session()))?.stage, 'R')

    // Vier Akkorde mittel (Dreiklänge) → leicht (Zweiklänge), dann einmal sauber durch
    await open('vier-akkorde~mittel')
    switchVersion('easy')
    assert.equal(await until(() => lessonInUrl() === 'vier-akkorde~leicht' && lessonInUrl()), 'vier-akkorde~leicht')
    assert.ok(await until(() => session()), 'practice-session fehlt nach dem Wechsel')
    // C+E, C+F, E+G, D+G
    for (const chord of [[60, 64], [60, 65], [64, 67], [62, 67]]) {
      for (const m of chord) play(m)
      await sleep(120)
    }
    assert.equal((await until(() => session()?.phase === 'result' && session(), 6000))?.phase, 'result')
    const a = await until(() => ev(`const a = JSON.parse(localStorage.getItem('${LOG_KEY}') || '[]'); return a[a.length - 1] ?? null`))
    assert.deepEqual([a.lessonId, a.stage, a.clean], ['vier-akkorde~leicht', 'R', true])
  })

  it('Pop: ▶ spielt das Muster durch, nicht nur den ersten Akkord', async () => {
    browser('open', `${BASE}/`)
    ev(`localStorage.clear(); return true`)
    browser('open', `${BASE}/pop`)
    assert.ok(await until(() => ev(`return document.querySelectorAll('.pop-pattern .piece-play').length >= 3`), 10_000), 'Musterwahl fehlt')
    // Sonde auf den Audio-Quellen: wie viele Töne geplant werden, wie viele sofort wieder abbrechen
    ev(`
      window.__probe = { starts: 0, immediateStops: 0 }
      for (const P of [AudioScheduledSourceNode.prototype, AudioBufferSourceNode.prototype]) {
        if (!Object.prototype.hasOwnProperty.call(P, 'start')) continue
        const s0 = P.start, t0 = P.stop
        P.start = function (...a) { window.__probe.starts++; return s0.apply(this, a) }
        P.stop = function (when) {
          if (when === undefined || when <= this.context.currentTime + 0.01) window.__probe.immediateStops++
          return t0.call(this, when)
        }
      }
      return true`)
    // Ein echter Klick (Nutzergeste, sonst bleibt der Ton stumm): Viertel, das zweite Muster
    browser('click', '.pop-pattern:nth-child(2) .piece-play')
    await sleep(4000)
    const p = ev(`return { ...window.__probe, playing: !!document.querySelector('.pop-pattern:nth-child(2) .piece-play.on') }`)
    assert.ok(p.playing, 'Wiedergabe ist nicht an')
    // Viertel bei 80 bpm: in 4 s gut fünf Akkorde zu je drei Tönen plus Bass
    assert.ok(p.starts >= 12, `nur ${p.starts} Töne in 4 s`)
    assert.equal(p.immediateStops, 0, 'Töne wurden gleich nach dem Planen wieder abgebrochen')
    browser('click', '.pop-pattern:nth-child(2) .piece-play')
  })

  it('Party-Pianist: nach dem Einstieg schlägt die Startseite die Nachbarn vor, „Heute“ nennt einen Pop-Schritt', async () => {
    const START = 'pop-1564-c-ganze-grund-sing'
    const startTitle = 'I–V–vi–IV in C · Whole notes · root position · Accompany'
    browser('open', `${BASE}/`)
    ev(`localStorage.clear(); return true`)
    browser('open', `${BASE}/`)
    // Titel der Zeilen, ohne Nummer für Vorleser und ohne „Up next“
    const rows = () =>
      ev(`return [...document.querySelectorAll('[aria-labelledby=app-pop] .pb-lesson-name')].map((e) => {
        const c = e.cloneNode(true)
        c.querySelectorAll('.sr-only, .next-tag').forEach((x) => x.remove())
        return c.textContent.trim()
      })`)
    const before = await until(() => rows()?.length && rows())
    assert.equal(before[0], startTitle)
    // Einstieg gestern gemeistert: alle drei Stufen je dreimal sauber
    const at = Date.now() - 86_400_000
    ev(`
      const a = []
      let i = 0
      for (const stage of ['L', 'R', 'LR'])
        for (let k = 0; k < 3; k++)
          a.push({ attemptId: 'flow' + i, at: ${at} + i++ * 1000, lessonId: '${START}', stage, clean: true, wrong: 0, unverified: 0, source: 'midi', durationMs: 30000, synced: false })
      localStorage.setItem('${LOG_KEY}', JSON.stringify(a))
      return true`)
    browser('open', `${BASE}/`)
    const after = await until(() => {
      const r = rows()
      return r?.length && !r.includes(startTitle) && r
    })
    assert.ok(after, `Vorschläge haben sich nicht bewegt: ${JSON.stringify(rows())}`)
    assert.ok(after.length >= 2 && after.length <= 4, `${after.length} Vorschläge`)
    // Jeder Vorschlag ändert genau eine Achse gegenüber dem Einstieg
    const axes = (title) => title.replace(' in ', ' · ').split(' · ')
    const base = axes(startTitle)
    for (const t of after) {
      const diff = axes(t).filter((x, i) => x !== base[i]).length
      assert.equal(diff, 1, `${t} unterscheidet sich in ${diff} Achsen`)
    }
    // „Heute“: ein Pop-Schritt, der auf eine Pop-Übung führt
    const pop = ev(`return [...document.querySelectorAll('.today-item')].find((b) => b.querySelector('.today-kind')?.textContent === 'Pop')?.textContent ?? null`)
    assert.ok(pop, 'kein Pop-Schritt in Heute')
    ev(`document.querySelector('[aria-labelledby=app-pop] .pb-lesson').click(); return true`)
    assert.ok(await until(() => lessonInUrl().startsWith('pop-') && lessonInUrl() !== START), 'Vorschlag öffnet keine Pop-Übung')
    assert.ok(await until(() => session()), 'practice-session fehlt in der Pop-Übung')
  })
})
