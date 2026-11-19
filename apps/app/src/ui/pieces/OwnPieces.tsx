import { useState, useSyncExternalStore } from 'react'
import { FileInput, FileInputDropzone, FileInputTrigger } from '@ui-sdk/react/file-input'
import { MidiError, parseMidi } from '@piano/core/music/midiFile'
import { barsOf, pieceFromMidi, titleFromFile } from '@piano/core/music/piece'
import { pathOf, pieces } from '@piano/core/music/pieceStore'
import { lessonDone } from '@piano/core/practice/progress'
import { t } from '@piano/core/i18n'
import '../../styles/pieces.css'

const ACCEPT = ['.mid', '.midi', '.kar', 'audio/midi', 'audio/x-midi', 'audio/mid']

/** Kurze Kennung für Lernfassungen (own-<id>-…): feste Länge, keine ist Anfang einer anderen */
const newId = () => Array.from(crypto.getRandomValues(new Uint8Array(4)), (b) => b.toString(16).padStart(2, '0')).join('')

/**
 * Eigene Stücke auf der Startseite: MIDI-Datei öffnen (oder irgendwo auf die Seite ziehen), dann
 * geht es direkt zum Stück. Darunter die Stücke dieses Geräts mit ihrem Stand im Lernpfad.
 */
export function OwnPieces({ onOpen }: { onOpen: (pieceId: string) => void }) {
  const list = useSyncExternalStore(pieces.subscribe, pieces.list)
  const [error, setError] = useState('')

  const importFile = async (file: File) => {
    setError('')
    try {
      const midi = parseMidi(await file.arrayBuffer())
      if (!midi.parts.length) return setError(t.pieces.noNotes)
      const piece = pieceFromMidi(midi, { id: newId(), title: titleFromFile(file.name), addedAt: Date.now() })
      pieces.save(piece)
      onOpen(piece.id)
    } catch (e) {
      setError(e instanceof MidiError || e instanceof RangeError ? t.pieces.notMidi : String(e))
    }
  }

  return (
    <section className="app-home-section own-pieces" aria-labelledby="app-own">
      <h2 id="app-own" className="pb-h2">
        {t.pieces.title}
      </h2>
      {list.length > 0 && (
        <ul className="own-list">
          {list.map((p) => {
            const path = pathOf(p)
            const done = path.filter((s) => lessonDone(s.lesson)).length
            return (
              <li key={p.id}>
                <button type="button" className="own-item" onClick={() => onOpen(p.id)}>
                  <span className="own-name">{p.title}</span>
                  <span className="pb-mono">
                    {t.pieces.meta(barsOf(p), path[path.length - 1].lesson.notes.length, p.bpm)}
                  </span>
                  <span className="own-progress" aria-hidden="true">
                    {path.map((s) => (
                      <i key={s.lesson.id} className={lessonDone(s.lesson) ? 'done' : ''} />
                    ))}
                  </span>
                  <span className="sr-only">{`${done}/${path.length}`}</span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
      <FileInput
        accept={ACCEPT}
        value={[]}
        onValueChange={(files) => files[0] && void importFile(files[0])}
        onReject={() => setError(t.pieces.notMidi)}
        announcement={() => null}
      >
        <div className="own-open">
          <FileInputTrigger className="pb-btn pb-btn-primary">{t.pieces.open}</FileInputTrigger>
          <p className="pb-small">{t.pieces.note}</p>
        </div>
        <FileInputDropzone target="document" className="own-drop">
          <span>{t.pieces.drop}</span>
        </FileInputDropzone>
      </FileInput>
      {error && (
        <p className="own-error" role="alert">
          {error}
        </p>
      )}
    </section>
  )
}
