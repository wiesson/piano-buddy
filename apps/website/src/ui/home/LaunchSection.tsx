import { useState, type FormEvent } from 'react'
import { Checkbox, CheckboxIndicator } from '@ui-sdk/react/checkbox'
import { SITE } from '@piano/core/content/site'
import { locale, t } from '@piano/core/i18n'
import { subscribe } from '../../newsletter/client'

type Topic = 'launch' | 'updates'
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Häkchen im Kästchen, Strich wie die Linien-Icons */
const Check = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
    <path d="M3 7.4 5.8 10 11 4.2" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

/**
 * „Bald als App“: App Store und Google Play als Platzhalter (noch nicht verfügbar, daher keine
 * Original-Abzeichen), darunter die Launch-Liste mit Double-Opt-in. Ein Feld, zwei Häkchen.
 */
export function LaunchSection() {
  const l = t.launch
  const [email, setEmail] = useState('')
  const [topics, setTopics] = useState<Topic[]>(['launch'])
  const [honey, setHoney] = useState('')
  const [state, setState] = useState<'idle' | 'sending' | 'done'>('idle')
  const [error, setError] = useState('')

  const toggle = (tp: Topic, on: boolean) => setTopics((ts) => (on ? [...new Set([...ts, tp])] : ts.filter((x) => x !== tp)))

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const address = email.trim()
    if (!EMAIL_RE.test(address)) return setError(l.invalid)
    if (!topics.length) return setError(l.noTopic)
    setError('')
    setState('sending')
    try {
      await subscribe({ email: address, topics, locale, website: honey || undefined })
      setState('done')
    } catch {
      setError(l.failed)
      setState('idle')
    }
  }

  return (
    <section id="launch" className="pb-section" aria-labelledby="launch-title">
      <div className="pb-wrap launch">
        <div className="launch-intro">
          <p className="pb-mono">{l.eyebrow}</p>
          <h2 id="launch-title" className="pb-h2">
            {l.title}
          </h2>
          <p className="pb-body">{l.lede}</p>
          <ul className="launch-stores">
            {l.stores.map((s) => (
              <li key={s.name} className="launch-store" aria-label={`${s.pre} ${s.name}`}>
                <span className="launch-store-pre" aria-hidden="true">
                  {s.pre}
                </span>
                <span className="launch-store-name" aria-hidden="true">
                  {s.name}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className="launch-card" aria-live="polite">
          {state === 'done' ? (
            <div className="launch-done">
              <h3 className="pb-h3">{l.doneTitle}</h3>
              <p className="pb-small">{l.doneBody(email.trim())}</p>
            </div>
          ) : (
            <form className="launch-form" onSubmit={submit} noValidate>
              <h3 className="pb-h3">{l.formTitle}</h3>
              <label className="launch-field">
                <span className="sr-only">{l.email}</span>
                <input
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  autoCapitalize="none"
                  spellCheck={false}
                  placeholder={l.placeholder}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  aria-invalid={!!error && error === l.invalid}
                />
              </label>
              {(
                [
                  ['launch', l.topicLaunch],
                  ['updates', l.topicUpdates],
                ] as const
              ).map(([tp, label]) => (
                <label key={tp} className="launch-check">
                  <Checkbox className="launch-box" checked={topics.includes(tp)} onCheckedChange={(c) => toggle(tp, c === true)}>
                    <CheckboxIndicator className="launch-box-mark">
                      <Check />
                    </CheckboxIndicator>
                  </Checkbox>
                  {label}
                </label>
              ))}
              {/* Honigtopf: für Menschen unsichtbar, Bots füllen ihn aus */}
              <input className="launch-honey" tabIndex={-1} autoComplete="off" aria-hidden="true" value={honey} onChange={(e) => setHoney(e.target.value)} name="website" />
              <button type="submit" className="pb-btn pb-btn-primary" disabled={state === 'sending'}>
                {state === 'sending' ? l.sending : l.submit}
              </button>
              {error && (
                <p className="launch-error" role="alert">
                  {error}
                </p>
              )}
              <p className="pb-note launch-note">
                {l.note}{' '}
                <a href={SITE.privacy} target="_blank" rel="noopener">
                  {l.privacy}
                </a>
              </p>
            </form>
          )}
        </div>
      </div>
    </section>
  )
}
