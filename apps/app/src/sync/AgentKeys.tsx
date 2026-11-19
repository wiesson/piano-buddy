import { useEffect, useState } from 'react'
import { useMutation } from 'convex/react'
import { SegmentedControl, SegmentedControlIndicator, SegmentedControlItem } from '@ui-sdk/react/segmented-control'
import { Toggle } from '@ui-sdk/react/toggle'
import type { FunctionReturnType } from 'convex/server'
import { api } from '../../../../convex/_generated/api'
import { t } from '@piano/core/i18n'
import { randomToken } from '@piano/core/sync/store'
import { toast } from '@piano/ui/shared/Toaster'

export const MCP_URL = 'https://mcp.pianobuddy.fyi/mcp'
const MAX_ACTIVE = 5
const DAY_OPTIONS = [7, 30, 90, 365] as const
const SCOPES = ['progress.read', 'pieces.write'] as const
type Scope = (typeof SCOPES)[number]
type Client = 'claude' | 'codex'
export type AgentKeyRow = NonNullable<FunctionReturnType<typeof api.agents.list>>[number]

async function sha256(s: string) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** Fertige Befehle zum Einfügen. Der Schlüssel steht nur hier, nie im Speicher des Geräts. */
export function commandFor(client: Client, key: string) {
  if (client === 'claude')
    return `claude mcp add --scope user --transport http piano ${MCP_URL} --header "Authorization: Bearer ${key}"`
  return `export PIANO_BUDDY_KEY=${key}\ncodex mcp add piano --url ${MCP_URL} --bearer-token-env-var PIANO_BUDDY_KEY`
}

function ago(at: number, now: number) {
  const min = Math.floor((now - at) / 60_000)
  if (min < 1) return t.agents.ago.now
  if (min < 60) return t.agents.ago.min(min)
  const h = Math.floor(min / 60)
  if (h < 24) return t.agents.ago.hour(h)
  return t.agents.ago.day(Math.floor(h / 24))
}

/**
 * KI-Zugänge im Geräte-Dialog: Liste mit Widerruf (ein Tipp), „KI verbinden“ mit Name, Rechten und
 * Ablauf, danach einmal der fertige Befehl. Verwaltet wird nur mit dem Geräteschlüssel.
 */
export function AgentKeys({ token, keys }: { token: string; keys: AgentKeyRow[] }) {
  const create = useMutation(api.agents.create)
  const revoke = useMutation(api.agents.revoke)
  const [mode, setMode] = useState<'idle' | 'form'>('idle')
  const [name, setName] = useState(t.agents.namePlaceholder)
  const [scopes, setScopes] = useState<Set<Scope>>(() => new Set(SCOPES))
  const [days, setDays] = useState<number>(90)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [reveal, setReveal] = useState<{ id: string; key: string; name: string } | null>(null)
  const [client, setClient] = useState<Client>('claude')
  const [copied, setCopied] = useState(false)
  const now = Date.now()
  const active = keys.filter((k) => !k.expired).length

  // Wird der gerade angezeigte Zugang widerrufen, verschwindet auch sein Befehl
  const revealGone = reveal && !keys.some((k) => k.id === reveal.id)
  useEffect(() => {
    if (revealGone) setReveal(null)
  }, [revealGone])

  useEffect(() => {
    if (!copied) return
    const timer = window.setTimeout(() => setCopied(false), 2000)
    return () => clearTimeout(timer)
  }, [copied])

  const toggleScope = (s: Scope, on: boolean) =>
    setScopes((prev) => {
      const next = new Set(prev)
      if (on) next.add(s)
      else next.delete(s)
      return next
    })

  const submit = async () => {
    if (busy || !scopes.size || !name.trim()) return
    setBusy(true)
    setError(null)
    try {
      const secret = randomToken()
      const { id } = await create({
        token,
        name: name.trim(),
        scopes: SCOPES.filter((s) => scopes.has(s)),
        days,
        secretHash: await sha256(secret),
      })
      setReveal({ id, key: `pb_${id}_${secret}`, name: name.trim() })
      setMode('idle')
      setClient('claude')
    } catch {
      setError(t.agents.createFailed)
    } finally {
      setBusy(false)
    }
  }

  const copy = async () => {
    if (!reveal) return
    try {
      await navigator.clipboard.writeText(commandFor(client, reveal.key))
      setCopied(true)
    } catch {
      /* Zwischenablage gesperrt: der Befehl ist markierbar */
    }
  }

  const doRevoke = async (k: AgentKeyRow) => {
    try {
      await revoke({ token, id: k.id })
      toast(t.agents.revokedToast(k.name), { type: 'success' })
    } catch {
      toast(t.agents.revokeFailed, { type: 'error' })
    }
  }

  return (
    <section className="pair agents">
      <h3>{t.agents.title}</h3>
      <p className="pair-hint">{t.agents.lede}</p>

      {keys.length > 0 && (
        <ul className="access-list">
          {keys.map((k) => (
            <li key={k.id} className={`access-row ${k.expired ? 'is-expired' : ''}`}>
              <span className="access-main">
                <span className="access-name">{k.name}</span>
                <span className="access-meta">{k.scopes.map((s) => t.agents.scopes[s]).join(' · ')}</span>
                <span className="access-meta">
                  {k.expired ? t.agents.expired : t.agents.expiresIn(Math.ceil((k.expiresAt - now) / 86_400_000))}
                  {' · '}
                  {k.lastUsedAt ? t.agents.usedAgo(ago(k.lastUsedAt, now)) : t.agents.neverUsed}
                </span>
              </span>
              <button className="access-action" onClick={() => void doRevoke(k)}>
                {t.agents.revoke}
              </button>
            </li>
          ))}
        </ul>
      )}

      {reveal ? (
        <div className="access-reveal" role="status">
          <h4>{t.agents.onceTitle}</h4>
          <p className="pair-hint">{t.agents.onceHint}</p>
          <SegmentedControl
            className="lang access-switch"
            aria-label={reveal.name}
            value={client}
            onValueChange={(v) => v && setClient(v as Client)}
          >
            <SegmentedControlIndicator className="lang-indicator" />
            <SegmentedControlItem value="claude" className="lang-item">
              Claude Code
            </SegmentedControlItem>
            <SegmentedControlItem value="codex" className="lang-item">
              Codex
            </SegmentedControlItem>
          </SegmentedControl>
          <pre className="access-cmd">{commandFor(client, reveal.key)}</pre>
          {client === 'codex' && <p className="access-note">{t.agents.codexHint}</p>}
          <div className="access-buttons">
            <button className="access-primary" onClick={() => void copy()}>
              {copied ? t.agents.copied : t.agents.copy}
            </button>
            <button className="access-text" onClick={() => setReveal(null)}>
              {t.agents.done}
            </button>
          </div>
        </div>
      ) : mode === 'form' ? (
        <form
          className="access-form"
          onSubmit={(e) => {
            e.preventDefault()
            void submit()
          }}
        >
          <label className="access-field">
            <span className="access-label">{t.agents.name}</span>
            <input
              className="access-input"
              value={name}
              maxLength={40}
              onChange={(e) => setName(e.target.value)}
              placeholder={t.agents.namePlaceholder}
              autoComplete="off"
            />
          </label>
          <div className="access-field">
            <span className="access-label">{t.agents.rights}</span>
            <div className="access-chips">
              {SCOPES.map((s) => (
                <Toggle
                  key={s}
                  className="access-chip"
                  pressed={scopes.has(s)}
                  onPressedChange={(on) => toggleScope(s, on)}
                >
                  {t.agents.scopes[s]}
                </Toggle>
              ))}
            </div>
          </div>
          <div className="access-field">
            <span className="access-label">{t.agents.expiry}</span>
            <SegmentedControl
              className="lang access-switch"
              aria-label={t.agents.expiry}
              value={String(days)}
              onValueChange={(v) => v && setDays(Number(v))}
            >
              <SegmentedControlIndicator className="lang-indicator" />
              {DAY_OPTIONS.map((d) => (
                <SegmentedControlItem key={d} value={String(d)} className="lang-item">
                  {t.agents.days(d)}
                </SegmentedControlItem>
              ))}
            </SegmentedControl>
          </div>
          {error && (
            <p className="pair-error" role="alert">
              {error}
            </p>
          )}
          <div className="access-buttons">
            <button type="submit" className="access-primary" disabled={busy || !scopes.size || !name.trim()}>
              {t.agents.create}
            </button>
            <button type="button" className="access-text" onClick={() => (setMode('idle'), setError(null))}>
              {t.agents.cancel}
            </button>
          </div>
        </form>
      ) : active >= MAX_ACTIVE ? (
        <p className="access-note">{t.agents.limit(MAX_ACTIVE)}</p>
      ) : (
        <button className="secondary-dark" onClick={() => setMode('form')}>
          {t.agents.connect}
        </button>
      )}
    </section>
  )
}
