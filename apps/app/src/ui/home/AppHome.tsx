import { useEffect } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import type { Lesson } from '@piano/core/music/lessons'
import { PIECE_ORDER, parseVersionId, versionsOf } from '@piano/core/music/versions'
import { lessonDone, nextLesson, recommendedVersion, totals } from '@piano/core/practice/progress'
import { t } from '@piano/core/i18n'
import { audioContext } from '@piano/core/audio/audio'
import { Logo } from '@piano/ui/shared/icons'
import { AboutDialog } from '@piano/ui/shared/AboutDialog'
import { LessonRow } from '@piano/ui/home/LessonRow'
import { SongGallery } from '@piano/ui/home/SongGallery'
import { useThemeColor } from '@piano/ui/shared/useThemeColor'
import { DevicesDialog } from '../../sync/DevicesDialog'
import { Today } from './Today'
import { OwnPieces } from '../pieces/OwnPieces'
import { PopSection } from '../pop/PopSection'

/**
 * Startseite der App (Web unter /app, iOS): ohne Werbeteil. Oben „Weiter mit …“, dann Lernpfad
 * und Lieder. Die Website (pianobuddy.fyi) erklärt, die App übt.
 */
export function AppHome({ synced }: { synced: boolean }) {
  useThemeColor('#fbf7ef')
  useRememberedScroll()
  const navigate = useNavigate()
  const next = nextLesson()
  const { total, learned, clean } = totals()
  const started = clean > 0
  const nextPiece = next && parseVersionId(next.id).pieceId
  // Ein Stück öffnet in der empfohlenen Fassung (die leichteste, die noch nicht sitzt)
  const open = (l: Lesson) => {
    // Der Tipp ist die Geste, mit der Browser Klang erlauben
    audioContext()
    void navigate({ to: '/play/$lessonId', params: { lessonId: recommendedVersion(parseVersionId(l.id).pieceId).id } })
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
        {/* Stand erst, wenn es einen gibt; die Werbezeile („14 Stücke · kein Konto“) gehört auf die Website */}
        {started && <p className="pb-mono app-home-stats">{t.home.stats(learned, total, clean)}</p>}

        <section className="app-home-section" aria-labelledby="app-path">
          <h2 id="app-path" className="pb-h2">
            {t.home.pathTitle}
          </h2>
          <ol className="pb-path">
            {PIECE_ORDER.map((pieceId, i) => {
              // Die Zeile zeigt die empfohlene Fassung; erledigt ist das Stück mit dem Original
              const versions = versionsOf(pieceId)
              return (
                <LessonRow
                  key={pieceId}
                  lesson={recommendedVersion(pieceId)}
                  index={i}
                  done={lessonDone(versions[versions.length - 1])}
                  isNext={pieceId === nextPiece}
                  onOpen={open}
                />
              )
            })}
          </ol>
          <p className="pb-note">{t.home.pathNote}</p>
        </section>

        <PopSection
          onOpen={(l) => {
            audioContext()
            void navigate({ to: '/play/$lessonId', params: { lessonId: l.id } })
          }}
        />

        <section className="app-home-section" aria-labelledby="app-songs">
          <h2 id="app-songs" className="pb-h2">
            {t.home.songsTitle}
          </h2>
          <SongGallery onOpen={open} />
        </section>

        <OwnPieces onOpen={(pieceId) => void navigate({ to: '/piece/$pieceId', params: { pieceId } })} />

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

const SCROLL_KEY = 'pianobuddy.homeScroll'

/**
 * Die Startseite bleibt, wo man war. Der Router merkt sich die Position nur für die Sitzung; iOS
 * beendet die App im Hintergrund aber gern, und „Zurück“ ohne Verlauf legt eine neue Startseite
 * an. Deshalb zusätzlich dauerhaft merken und wiederherstellen, wenn der Router oben anfängt.
 */
function useRememberedScroll() {
  useEffect(() => {
    let saved = 0
    try {
      saved = Number(localStorage.getItem(SCROLL_KEY)) || 0
    } catch {
      /* ohne Speicher eben oben */
    }
    // Erst nach der Wiederherstellung des Routers prüfen (zwei Bilder später)
    let raf = requestAnimationFrame(() => {
      raf = requestAnimationFrame(() => {
        if (window.scrollY < 8 && saved > 0) window.scrollTo(0, saved)
      })
    })
    let pending = 0
    const onScroll = () => {
      if (pending) return
      pending = requestAnimationFrame(() => {
        pending = 0
        try {
          localStorage.setItem(SCROLL_KEY, String(Math.round(window.scrollY)))
        } catch {
          /* egal */
        }
      })
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      cancelAnimationFrame(raf)
      cancelAnimationFrame(pending)
      window.removeEventListener('scroll', onScroll)
    }
  }, [])
}
