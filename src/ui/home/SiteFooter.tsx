import { SITE } from '../../content/site'
import { locale, setLocale, t, type Locale } from '../../i18n'
import { Logo } from '../shared/icons'

/** Zeichen von Studio Nordwerk: Tintenfeld mit Salbeipunkt (nordwerk MARKE.md), dreht sich beim Hover */
function NordwerkMark() {
  return (
    <svg className="nordwerk-mark" viewBox="0 0 128 128" width="20" height="20" aria-hidden="true">
      <rect width="128" height="128" rx="42" fill="#e9eae5" />
      <circle cx="85.5" cy="42.5" r="21.5" fill="#8fb59b" />
    </svg>
  )
}

/** Jede Sprache nennt sich selbst, damit man die eigene findet, ohne die andere zu können */
const LANGUAGES: { value: Locale; name: string }[] = [
  { value: 'en', name: 'English' },
  { value: 'de', name: 'Deutsch' },
]

/** Fuß der Startseite nach dem Muster von Tourvy: Studio-Leiste, Spalten, Zeile mit Sprache und Agent-Hinweis */
export function SiteFooter() {
  const f = t.site
  const ext = { target: '_blank', rel: 'noopener' } as const
  return (
    <footer className="site-footer">
      <a className="nordwerk-strip" href={SITE.studio.url} {...ext}>
        <span className="nordwerk-name">
          <NordwerkMark />
          {f.builtBy}
        </span>
        <span className="nordwerk-about">{f.studioAbout}</span>
        <span className="nordwerk-link">
          nordwerk.studio
          <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
            <path d="M4.5 9.5 9.5 4.5M5 4.5h4.5V9" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      </a>

      <div className="footer-grid">
        <div className="footer-brand">
          <span className="footer-logo">
            <Logo size={22} />
            {t.appName}
          </span>
          <p>{f.about}</p>
        </div>

        <nav className="footer-col" aria-label={f.app}>
          <h3>{f.app}</h3>
          <ul>
            <li>
              <a href="#path">{f.path}</a>
            </li>
            <li>
              <a href="#songs">{t.home.dock.songs}</a>
            </li>
            <li>
              <a href="#faq">{f.faqTitle}</a>
            </li>
            <li>
              <a href="/changelog">Changelog</a>
            </li>
            <li>
              <a href={SITE.source} {...ext}>
                {f.source}
              </a>
            </li>
          </ul>
        </nav>

        <div className="footer-col">
          <h3>{f.contact}</h3>
          <ul>
            <li>
              <a href={SITE.issues} {...ext}>
                {f.feedback}
              </a>
            </li>
            <li>
              <a href={SITE.author.url} {...ext}>
                {SITE.author.name}
              </a>
            </li>
          </ul>
          <h3 className="footer-sub">{f.legal}</h3>
          <ul>
            <li>
              <a href={SITE.imprint} {...ext}>
                {f.imprint}
              </a>
            </li>
            <li>
              <a href={SITE.privacy} {...ext}>
                {f.privacy}
              </a>
            </li>
          </ul>
        </div>
      </div>

      <div className="footer-bottom">
        <p>
          © {new Date().getFullYear()} {t.appName}. {f.license}
        </p>
        <div className="footer-lang" role="group" aria-label={t.about.language}>
          {LANGUAGES.map((l) => (
            <button
              key={l.value}
              type="button"
              lang={l.value}
              aria-pressed={l.value === locale}
              onClick={() => l.value !== locale && setLocale(l.value)}
            >
              {l.name}
            </button>
          ))}
        </div>
        <p className="footer-agent">
          {f.agentPrompt} <a href="/llms.txt">{f.agentLink}</a>
        </p>
      </div>
    </footer>
  )
}
