import { Link, useNavigate } from '@tanstack/react-router'
import { LESSONS, type Lesson } from '@piano/core/music/lessons'
import { lessonDone, nextLesson, totals } from '@piano/core/practice/progress'
import { t } from '@piano/core/i18n'
import { audioContext } from '@piano/core/audio/audio'
import { Logo } from '@piano/ui/shared/icons'
import { AboutDialog } from '@piano/ui/shared/AboutDialog'
import { LessonRow } from '@piano/ui/home/LessonRow'
import { SongGallery } from '@piano/ui/home/SongGallery'
import { useThemeColor } from '@piano/ui/shared/useThemeColor'
import { DevicesDialog } from '../../sync/DevicesDialog'
import { Today } from './Today'

/**
 * Startseite der App (Web unter /app, iOS): ohne Werbeteil. Oben „Weiter mit …“, dann Lernpfad
 * und Lieder. Die Website (pianobuddy.fyi) erklärt, die App übt.
 */
export function AppHome({ synced }: { synced: boolean }) {
  useThemeColor('#fbf7ef')
  const navigate = useNavigate()
  const next = nextLesson()
  const { total, learned, clean } = totals()
  const started = clean > 0
  const open = (l: Lesson) => {
    // Der Tipp ist die Geste, mit der Browser Klang erlauben
    audioContext()
    void navigate({ to: '/play/$lessonId', params: { lessonId: l.id } })
  }

  return (
    <div className="home paper app-home">
      <header className="pb-bar app-home-bar">
        <span className="pb-brand">
          <Logo size={24} />
          <span>{t.appName}</span>
        </span>
        <div className="pb-bar-actions">
          {synced && <DevicesDialog />}
          <AboutDialog className="icon-button" />
        </div>
      </header>

      <main className="app-home-main">
        <Today
          onOpen={(lessonId, stage) => {
            audioContext()
            void navigate({ to: '/play/$lessonId', params: { lessonId }, search: { stage } })
          }}
        />
        <p className="pb-mono app-home-stats">
          {started ? t.home.stats(learned, total, clean) : t.home.statsNew(LESSONS.length)}
        </p>

        <section className="app-home-section" aria-labelledby="app-path">
          <h2 id="app-path" className="pb-h2">
            {t.home.pathTitle}
          </h2>
          <ol className="pb-path">
            {LESSONS.map((l, i) => (
              <LessonRow key={l.id} lesson={l} index={i} done={lessonDone(l)} isNext={l === next} onOpen={open} />
            ))}
          </ol>
          <p className="pb-note">{t.home.pathNote}</p>
        </section>

        <section className="app-home-section" aria-labelledby="app-songs">
          <h2 id="app-songs" className="pb-h2">
            {t.home.songsTitle}
          </h2>
          <SongGallery onOpen={open} />
        </section>

        <footer className="app-home-foot">
          <Link to="/calibrate">{t.calib.title}</Link>
          <a href="https://pianobuddy.fyi/changelog" target="_blank" rel="noopener">
            Changelog
          </a>
          <a href="https://pianobuddy.fyi" target="_blank" rel="noopener">
            pianobuddy.fyi
          </a>
        </footer>
      </main>
    </div>
  )
}
