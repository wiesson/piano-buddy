// Meldungen aus der Debug-Ebene abholen (STU-1286): je Meldung ein Ordner mit report.json, dem
// Bild der Bahn, der Sprachnotiz und ihrer Abschrift (lokal mit `transcribe`), dazu eine kurze
// Übersicht der Anschläge im Terminal.
//
// Aufruf: pnpm reports [anzahl=5] [--dev]   (ohne --dev aus der Produktion)
// Ziel: docs/reports/ (gitignored), überschreibt nichts, was schon da ist.

import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const args = process.argv.slice(2)
const dev = args.includes('--dev')
const limit = Number(args.find((a) => /^\d+$/.test(a)) ?? 5)
const out = join(root, 'docs', 'reports')

// Alle Arten von Messungen liegen in derselben Tabelle; Meldungen haben kind „report“
const raw = execFileSync('npx', ['convex', 'run', 'reports:latest', JSON.stringify({ limit: Math.max(limit * 4, 20) }), ...(dev ? [] : ['--prod'])], {
  cwd: root,
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'inherit'],
})
const rows = JSON.parse(raw)
  .filter((r) => r.kind === 'report')
  .slice(0, limit)
if (!rows.length) {
  console.log('Keine Meldungen.')
  process.exit(0)
}

const VERDICT = { hit: 'Treffer', carried: 'übernommen', early: 'früh', late: 'spät', wrong: 'FALSCH', grace: 'Schonfrist', overtone: 'Oberton', ignored: 'ignoriert', dropped: 'verworfen', control: 'Bedienung' }
const NAMES = ['C', 'Cis', 'D', 'Dis', 'E', 'F', 'Fis', 'G', 'Gis', 'A', 'B', 'H']
const note = (m) => `${NAMES[m % 12]}${Math.floor(m / 12) - 1}`
const hasTranscribe = (() => {
  try {
    execFileSync('which', ['transcribe'], { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
})()

for (const r of rows) {
  const stamp = new Date(r.createdAt).toISOString().replace(/[:T]/g, '-').slice(0, 19)
  const dir = join(out, `${stamp}-${String(r.id).slice(-6)}`)
  const summary = JSON.parse(r.summary)
  console.log(`\n── ${stamp} · ${summary.lessonId} ${summary.stage} · ${summary.tempo} · Variante ${summary.variant}${summary.blind ? ' (blind)' : ''} · ${summary.version}`)
  if (existsSync(dir)) {
    console.log(`   schon da: ${dir}`)
    continue
  }
  mkdirSync(dir, { recursive: true })
  const data = await (await fetch(r.dataUrl)).json()
  const { image, ...rest } = data
  writeFileSync(join(dir, 'report.json'), JSON.stringify(rest, null, 2))
  if (image?.startsWith('data:image/')) writeFileSync(join(dir, 'lane.jpg'), Buffer.from(image.split(',')[1], 'base64'))
  if (r.audioUrl) {
    const res = await fetch(r.audioUrl)
    const ext = (res.headers.get('content-type') ?? '').includes('webm') ? 'webm' : 'm4a'
    const file = join(dir, `voice.${ext}`)
    writeFileSync(file, Buffer.from(await res.arrayBuffer()))
    if (hasTranscribe) {
      try {
        const text = execFileSync('transcribe', [file, 'de'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
        writeFileSync(join(dir, 'voice.txt'), text + '\n')
        console.log(`   Sprachnotiz: „${text}“`)
      } catch {
        console.log('   Sprachnotiz: Abschrift fehlgeschlagen')
      }
    }
  }
  // Übersicht: die letzten 15 Anschläge vor dem Melden
  for (const s of rest.strikes.slice(-15)) {
    const lat = s.frameMs !== undefined ? `${Math.round(s.frameMs - s.tMs)} ms` : '–'
    const exp = s.expected.map(note).join(' ') || '–'
    console.log(
      `   ${String(s.tMs.toFixed(0)).padStart(7)} ms  ${s.source.padEnd(5)} ${note(s.midi).padEnd(5)} erw ${exp.padEnd(10)} ${s.lit ? 'leuchtete' : '         '}  Bild ${lat.padStart(6)}  ${VERDICT[s.verdict] ?? 'offen'}${s.note ? ` (${s.note})` : ''}`,
    )
  }
  console.log(`   → ${dir}`)
}
