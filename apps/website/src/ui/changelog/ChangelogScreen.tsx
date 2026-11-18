import { Link } from '@tanstack/react-router'
import { CHANGELOG } from '@piano/core/content/changelog'
import { t } from '@piano/core/i18n'
import { Logo } from '@piano/ui/shared/icons'
import { useThemeColor } from '@piano/ui/shared/useThemeColor'

/** Changelog for players: what changed, newest first. English only on purpose. */
export function ChangelogScreen() {
  useThemeColor('#fbf7ef')
  return (
    <div className="home paper changelog" lang="en">
      <header className="pb-bar changelog-bar">
        <Link className="pb-brand" to="/" aria-label={t.appName}>
          <Logo size={24} />
          <span>{t.appName}</span>
        </Link>
      </header>
      <main className="changelog-main">
        <h1 className="pb-h2">Changelog</h1>
        <p className="pb-body">What changed in Piano Buddy, newest first.</p>
        <ol className="changelog-list">
          {CHANGELOG.map((e) => (
            <li key={e.date} className="changelog-entry">
              <time className="pb-mono" dateTime={e.date}>
                {new Date(`${e.date}T12:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
              </time>
              <h2 className="pb-h3">{e.title}</h2>
              <ul>
                {e.items.map((it) => (
                  <li key={it}>{it}</li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      </main>
    </div>
  )
}
