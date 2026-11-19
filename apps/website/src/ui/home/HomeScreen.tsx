import { lazy, Suspense, useEffect, useRef, useState, type ReactElement, type ReactNode } from 'react'
import { LESSONS, type Lesson } from '@piano/core/music/lessons'
import { lessonDone, nextLesson, totals } from '@piano/core/practice/progress'
import { t, localized } from '@piano/core/i18n'
import { Logo } from '@piano/ui/shared/icons'
import { AboutDialog } from '@piano/ui/shared/AboutDialog'
import { LessonRow } from '@piano/ui/home/LessonRow'
import { SongGallery } from '@piano/ui/home/SongGallery'
import { illustration } from '@piano/ui/illustrations'
import { useThemeColor } from '@piano/ui/shared/useThemeColor'
import { AmbientPlayer } from './AmbientPlayer'
import { Faq } from './Faq'
import { RollPreview } from './RollPreview'
import { SiteFooter } from './SiteFooter'

// Klaviatur zum Ausprobieren: eigener Chunk, geladen erst kurz bevor die Section sichtbar wird
const TryPiano = lazy(() => import('./TryPiano'))

/**
 * Startseite auf Papier, Aufbau nach monet.directory und Kontor: das Bild füllt den ersten
 * Bildschirm und zieht sich beim Scrollen zur Karte zusammen (home.css, scroll-getrieben, ohne
 * Unterstützung statisch), die Leiste fährt mit nach oben. Darunter Methode, Lernpfad, Bedarf,
 * Fragen, Fuß. Wer schon geübt hat, kommt mit einem Tipp weiter: Hero-Knopf und Leiste öffnen
 * das nächste Stück.
 */
const APP_URL = '/app/'

export function HomeScreen({ onOpen }: { onOpen: (l: Lesson) => void }) {
  useThemeColor('#fbf7ef')
  const next = nextLesson()
  const showcase = LESSONS.find((l) => l.id === 'ode') ?? LESSONS[LESSONS.length - 1]
  const { total, learned, clean } = totals()
  const started = clean > 0
  const target = next ?? LESSONS[0]
  const cta = !started ? t.home.start : next ? t.home.continueWith(localized(next.title)) : t.home.practiceAgain
  const open = () => onOpen(target)

  return (
    <div className="home paper">
      <header className="pb-bar">
        <a className="pb-brand pb-reveal" href="#top" aria-label={t.appName}>
          <Logo size={24} />
          <span>{t.appName}</span>
        </a>
        <div className="pb-bar-actions pb-reveal">
          <AboutDialog className="icon-button pb-bar-about" />
          {/* In die App: Startseite mit „Heute“, Lernpfad und eigenen Stücken (eigener Worker unter /app) */}
          <a className="pb-btn pb-btn-sm pb-bar-cta" href={APP_URL}>
            {t.home.openApp}
          </a>
        </div>
      </header>

      <div className="pb-dock-layer">
        <div className="pb-dock">
          <nav className="pb-pill" aria-label={t.home.dockLabel}>
            <a href="#path">
              <PathIcon />
              {t.home.dock.path}
            </a>
            <a href="#songs">
              <SongsIcon />
              {t.home.dock.songs}
            </a>
            <a href="#method">
              <StepsIcon />
              {t.home.dock.method}
            </a>
            <a href="#faq">
              <HelpIcon />
              {t.home.dock.faq}
            </a>
            <AboutDialog label={t.home.dock.about} className="pb-pill-item" />
            <a className="is-lit" href={APP_URL}>
              {t.home.openApp}
            </a>
          </nav>
        </div>
      </div>

      <div className="pb-journey" id="top">
        <div className="pb-stage" aria-hidden="true">
          <img className="pb-stage-img" src={illustration("hero.jpg")} alt="" />
        </div>
        <div className="pb-journey-content">
          <section className="pb-intro" aria-labelledby="pb-title">
            <h1 id="pb-title" className="pb-title">
              {t.home.headline}
            </h1>
            <p className="pb-lede">{t.home.lede}</p>
            <div className="pb-hero-actions">
              <button type="button" className="pb-btn pb-btn-primary" onClick={open}>
                {cta}
              </button>
              <a className="pb-btn pb-btn-ghost" href="#method">
                {t.home.how}
              </a>
            </div>
            <p className="pb-mono pb-stats">
              {started ? t.home.stats(learned, total, clean) : t.home.statsNew(LESSONS.length)}
            </p>
          </section>
        </div>
      </div>

      <main>
        <section id="method" className="pb-section">
          <div className="pb-wrap">
            <p className="pb-quote">{t.home.quote}</p>
            <div className="pb-trio">
              {t.home.trio.map((c) => (
                <article key={c.label} className="pb-card">
                  <p className="pb-mono">{c.label}</p>
                  <h2 className="pb-h3">{c.title}</h2>
                  <p className="pb-small">{c.text}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="try" className="pb-section">
          <div className="pb-try">
            <h2 className="pb-h2 pb-center">{t.home.tryTitle}</h2>
            <p className="pb-body pb-center">{t.home.tryLede}</p>
            <WhenNear placeholder={<div className="try-card try-placeholder" aria-hidden="true" />}>
              <Suspense fallback={<div className="try-card try-placeholder" aria-hidden="true" />}>
                <TryPiano onOpen={onOpen} />
              </Suspense>
            </WhenNear>
          </div>
        </section>

        <section id="path" className="pb-section">
          <div className="pb-split">
            <div className="pb-split-aside">
              <RollPreview lesson={showcase} onOpen={() => onOpen(showcase)} />
            </div>
            <div className="pb-split-main">
              <h2 className="pb-h2">{t.home.pathTitle}</h2>
              <p className="pb-body">{t.home.pathLede}</p>
              <ol className="pb-path">
                {LESSONS.map((l, i) => (
                  <LessonRow key={l.id} lesson={l} index={i} done={lessonDone(l)} isNext={l === next} onOpen={onOpen} />
                ))}
              </ol>
              <p className="pb-note">{t.home.pathNote}</p>
            </div>
          </div>
        </section>

        <section id="songs" className="pb-section">
          <div className="pb-wide">
            <h2 className="pb-h2 pb-center">{t.home.songsTitle}</h2>
            <p className="pb-body pb-center">{t.home.songsLede}</p>
            <SongGallery onOpen={onOpen} />
          </div>
        </section>

        <section className="pb-section">
          <div className="pb-wrap pb-needs">
            {t.home.needs.map((n) => (
              <div key={n.label}>
                <p className="pb-mono">{n.label}</p>
                <p className="pb-small">{n.text}</p>
              </div>
            ))}
          </div>
        </section>

        <Faq />
      </main>
      <SiteFooter />
      <AmbientPlayer />
    </div>
  )
}

/** Rendert die Kinder erst, wenn der Platzhalter auf etwa einen Bildschirm herangescrollt ist */
function WhenNear({ children, placeholder }: { children: ReactNode; placeholder: ReactElement }) {
  const [near, setNear] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el || near) return
    const io = new IntersectionObserver(([e]) => e.isIntersecting && setNear(true), { rootMargin: '100% 0px' })
    io.observe(el)
    return () => io.disconnect()
  }, [near])
  return near ? children : <div ref={ref}>{placeholder}</div>
}

const dockIcon = {
  width: 15,
  height: 15,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
}

function PathIcon() {
  return (
    <svg {...dockIcon}>
      <circle cx="6" cy="6" r="2" />
      <circle cx="6" cy="18" r="2" />
      <path d="M6 8v8M11 6h9M11 18h9M11 12h6" />
    </svg>
  )
}

function SongsIcon() {
  return (
    <svg {...dockIcon}>
      <path d="M9 18V5l11-2v13" />
      <circle cx="6" cy="18" r="3" />
      <circle cx="17" cy="16" r="3" />
    </svg>
  )
}

function StepsIcon() {
  return (
    <svg {...dockIcon}>
      <path d="M4 20v-5h5v-5h5V5h6" />
    </svg>
  )
}

function HelpIcon() {
  return (
    <svg {...dockIcon}>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.5 9.5a2.5 2.5 0 0 1 4.9.7c0 1.7-2.4 2.1-2.4 3.6" />
      <circle cx="12" cy="17" r="0.6" fill="currentColor" />
    </svg>
  )
}
