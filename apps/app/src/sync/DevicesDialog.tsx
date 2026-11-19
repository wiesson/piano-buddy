import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery } from 'convex/react'
import {
  Dialog,
  DialogBackdrop,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from '@ui-sdk/react/dialog'
import { OTPInput, OTPInputGroup, OTPInputSeparator, OTPInputSlot } from '@ui-sdk/react/otp-input'
import { api } from '../../../../convex/_generated/api'
import { t } from '@piano/core/i18n'
import { store } from '@piano/core/sync/store'
import { useSyncStatus } from './hooks'
import { toast } from '@piano/ui/shared/Toaster'
import { CloseIcon, DevicesIcon } from '@piano/ui/shared/icons'
import type { Id } from '../../../../convex/_generated/dataModel'
import { getPref, setPref } from '../ui/practice/prefs'
import { AgentKeys } from './AgentKeys'
import '../styles/access.css'

/** KI-Zugänge sind noch nicht für alle sichtbar: 5× auf den Titel tippen blendet sie ein und aus. */
const AGENTS_PREF = 'labs.agents'

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
function randomCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(8))
  return [...bytes].map((b) => CODE_CHARS[b % CODE_CHARS.length]).join('')
}

/** Geräte koppeln: Code anzeigen (Gerät A) oder eingeben (Gerät B) */
export function DevicesDialog() {
  const dev = store.device()
  const { online, pending } = useSyncStatus()
  const devices = useQuery(api.sync.devices, dev.registered ? { token: dev.token } : 'skip')
  const offer = useMutation(api.sync.offerPairCode)
  const claim = useMutation(api.sync.claimPairCode)
  const remove = useMutation(api.sync.removeDevice)
  const [labs, setLabs] = useState(() => getPref(AGENTS_PREF, false))
  const agentKeys = useQuery(api.agents.list, dev.registered ? { token: dev.token } : 'skip')
  const [confirming, setConfirming] = useState<Id<'devices'> | null>(null)
  const taps = useRef<number[]>([])
  const [shown, setShown] = useState<{ code: string; expiresAt: number } | null>(null)
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [now, setNow] = useState(() => Date.now())

  // Kommt ein Gerät dazu, ist der angezeigte Code verbraucht: ausblenden
  const deviceCount = devices?.length ?? 0
  const countAtShow = useRef(0)
  useEffect(() => {
    if (shown && deviceCount > countAtShow.current) setShown(null)
  }, [shown, deviceCount])

  // „Wirklich entfernen“ gilt nur kurz, dann wieder „Entfernen“
  useEffect(() => {
    if (!confirming) return
    const timer = window.setTimeout(() => setConfirming(null), 4000)
    return () => clearTimeout(timer)
  }, [confirming])

  const tapTitle = () => {
    const now = Date.now()
    taps.current = [...taps.current.filter((x) => now - x < 2000), now]
    if (taps.current.length < 5) return
    taps.current = []
    setLabs((on) => (setPref(AGENTS_PREF, !on), !on))
  }

  const removeDevice = async (id: Id<'devices'>, label: string) => {
    if (confirming !== id) return setConfirming(id)
    setConfirming(null)
    try {
      await remove({ token: dev.token, deviceId: id })
      toast(t.sync.removedToast(label), { description: t.sync.removedHint, type: 'success' })
    } catch {
      toast(t.sync.removeFailed, { type: 'error' })
    }
  }

  useEffect(() => {
    if (!shown) return
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [shown])

  const showCode = async () => {
    setError(null)
    const c = randomCode()
    try {
      const { expiresAt } = await offer({ token: dev.token, code: c })
      countAtShow.current = devices?.length ?? Infinity
      setShown({ code: c, expiresAt })
      setNow(Date.now())
    } catch {
      setError(t.sync.codeFailed)
    }
  }

  const redeem = async (value: string) => {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      const r = await claim({ token: dev.token, code: value, label: dev.label })
      if (r.ok) {
        store.setDevice({ registered: true })
        setCode('')
        toast(t.sync.pairedToast, {
          description: r.moved ? t.sync.movedAttempts(r.moved) : t.sync.sameEverywhere,
          type: 'success',
        })
      } else setError('reason' in r && r.reason === 'locked' ? t.sync.codeLocked : t.sync.codeInvalid)
    } catch {
      setError(t.sync.noConnection)
    } finally {
      setBusy(false)
    }
  }

  const remaining = shown ? Math.max(0, Math.round((shown.expiresAt - now) / 1000)) : 0
  const count = devices?.length ?? 1

  return (
    <Dialog onOpenChange={(open) => !open && (setShown(null), setError(null), setConfirming(null))}>
      <DialogTrigger className="icon-button sync-trigger" aria-label={count > 1 ? t.sync.paired(count) : t.sync.pair}>
        <DevicesIcon />
        {count > 1 && <span className="sync-count">{count}</span>}
        <span className={`sync-dot ${online ? (pending ? 'pending' : 'ok') : 'off'}`} aria-hidden />
      </DialogTrigger>
      <DialogBackdrop className="dialog-backdrop" />
      <DialogContent className="dialog">
        <DialogTitle className="dialog-title" onClick={tapTitle}>
          {t.sync.title}
        </DialogTitle>
        <DialogDescription className="dialog-desc">
          {online ? (pending ? t.sync.pending(pending) : t.sync.allSynced) : t.sync.offline}
        </DialogDescription>

        {devices && devices.length > 0 && (
          <ul className="access-list">
            {devices.map((d) => (
              <li key={d.id} className="access-row">
                <span className="access-main">
                  <span className="access-name">{d.label}</span>
                </span>
                {d.self ? (
                  <span className="access-self">{t.sync.thisDevice}</span>
                ) : (
                  <button
                    className={`access-action ${confirming === d.id ? 'is-confirming' : ''}`}
                    onClick={() => void removeDevice(d.id, d.label)}
                  >
                    {confirming === d.id ? t.sync.confirmRemove : t.sync.remove}
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}

        <section className="pair">
          <h3>{t.sync.addDevice}</h3>
          {shown && remaining > 0 ? (
            <>
              <p className="pair-code" aria-live="polite">
                {shown.code.slice(0, 4)}
                <span aria-hidden>–</span>
                {shown.code.slice(4)}
              </p>
              <p className="pair-hint">{t.sync.codeHint(Math.floor(remaining / 60), remaining % 60)}</p>
            </>
          ) : (
            <button className="secondary-dark" onClick={showCode} disabled={!dev.registered}>
              {t.sync.showCode}
            </button>
          )}
        </section>

        <section className="pair">
          <h3>{t.sync.connectThis}</h3>
          <p className="pair-hint">{t.sync.enterCode}</p>
          <OTPInput
            className="otp"
            maxLength={8}
            pattern={/[A-HJ-NP-Za-hj-np-z2-9]/}
            inputMode="text"
            value={code}
            onValueChange={(v) => setCode(v.toUpperCase())}
            onValueCommit={(v) => void redeem(v)}
            disabled={busy}
            aria-label={t.sync.codeLabel}
          >
            <OTPInputGroup className="otp-group">
              {[0, 1, 2, 3].map((i) => (
                <OTPInputSlot key={i} index={i} className="otp-slot" />
              ))}
            </OTPInputGroup>
            <OTPInputSeparator className="otp-sep">–</OTPInputSeparator>
            <OTPInputGroup className="otp-group">
              {[4, 5, 6, 7].map((i) => (
                <OTPInputSlot key={i} index={i} className="otp-slot" />
              ))}
            </OTPInputGroup>
          </OTPInput>
          {error && (
            <p className="pair-error" role="alert">
              {error}
            </p>
          )}
        </section>

        {agentKeys && (labs || agentKeys.length > 0) && <AgentKeys token={dev.token} keys={agentKeys} />}

        <DialogClose className="icon-button icon-button-ink dialog-close" aria-label={t.sync.close}>
          <CloseIcon />
        </DialogClose>
      </DialogContent>
    </Dialog>
  )
}
