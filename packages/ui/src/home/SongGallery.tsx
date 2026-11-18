import { LESSONS, stagesFor, type Lesson } from '@piano/core/music/lessons'
import { CLEAN_GOAL } from '@piano/core/practice/goal'
import { store } from '@piano/core/sync/store'
import { localized, t } from '@piano/core/i18n'
import { illustration } from '../illustrations'

/** Lieder mit Illustration als Karten, mit Stand der Stufen */
export function SongGallery({ onOpen }: { onOpen: (l: Lesson) => void }) {
  return (
    <ul className="pb-gallery">
      {LESSONS.filter((l) => l.illustration).map((l) => {
        const stages = stagesFor(l)
        const done = stages.filter((s) => store.cleanCount(l.id, s) >= CLEAN_GOAL).length
        return (
          <li key={l.id}>
            <button type="button" className="pb-song" onClick={() => onOpen(l)}>
              <img src={illustration(l.illustration)} alt="" loading="lazy" />
              <span className="pb-song-body">
                <span className="pb-song-title">{localized(l.title)}</span>
                <span className="pb-mono">{t.home.songMeta(done, stages.length)}</span>
              </span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}
