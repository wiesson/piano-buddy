import { useEffect, useRef, useState } from 'react'
import { t } from '@piano/core/i18n'
import { Logo } from '@piano/ui/shared/icons'
import { useThemeColor } from '@piano/ui/shared/useThemeColor'

/**
 * Seite hinter den Links aus den Mails: führt die Aktion einmal aus (Bestätigen oder Abmelden)
 * und sagt in einem Satz, was passiert ist.
 */
export function NewsletterResult({
  run,
  okTitle,
  okBody,
  failBody,
}: {
  run: () => Promise<{ ok: boolean }>
  okTitle: string
  okBody: string
  failBody: string
}) {
  useThemeColor('#f6eedf')
  const [state, setState] = useState<'working' | 'ok' | 'fail'>('working')
  const once = useRef(false)
  useEffect(() => {
    if (once.current) return
    once.current = true
    run()
      .then((r) => setState(r.ok ? 'ok' : 'fail'))
      .catch(() => setState('fail'))
  }, [run])

  return (
    <main className="paper newsletter-page">
      <div className="launch-card" aria-live="polite">
        <div className="launch-done">
          <Logo size={28} />
          <h1 className="pb-h3">{state === 'working' ? t.launch.working : state === 'ok' ? okTitle : t.launch.oops}</h1>
          {state !== 'working' && <p className="pb-small">{state === 'ok' ? okBody : failBody}</p>}
          {state !== 'working' && (
            <a className="pb-btn pb-btn-primary" href="/">
              {t.launch.home}
            </a>
          )}
        </div>
      </div>
    </main>
  )
}
