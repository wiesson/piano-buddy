import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { useConvex, useMutation, useQuery } from 'convex/react'
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
import { api } from '../../convex/_generated/api'
import { store } from './store'
import { toast } from '../ui/toaster'
import { DevicesIcon } from '../ui/Logo'

export const useStoreVersion = () => useSyncExternalStore(store.subscribe, store.version)

/**
 * Unsichtbar: meldet das Gerät an, lädt neue Durchgänge hoch und mischt die der anderen
 * Geräte ein. Läuft nur, wenn eine Convex-Adresse konfiguriert ist.
 */
export function SyncBridge() {
  const version = useStoreVersion()
  const dev = store.device()
  const register = useMutation(api.sync.register)
  const push = useMutation(api.sync.pushAttempts)
  const remote = useQuery(api.sync.attempts, dev.registered ? { token: dev.token } : 'skip')
  const inflight = useRef(false)

  useEffect(() => {
    if (dev.registered) return
    register({ token: dev.token, label: dev.label })
      .then(() => store.setDevice({ registered: true }))
      .catch((e) => console.warn('Anmelden', e))
  }, [dev.registered, dev.token, dev.label, register])

  useEffect(() => {
    if (remote) store.mergeRemote(remote)
    // Server kennt das Gerät nicht (mehr): neu anmelden, die lokalen Durchgänge gehen wieder hoch
    if (remote === null) store.setDevice({ registered: false })
  }, [remote])

  useEffect(() => {
    if (!dev.registered) return
    const flush = async () => {
      if (inflight.current) return
      const batch = store.unsynced()
      if (!batch.length) return
      inflight.current = true
      try {
        await push({ token: dev.token, attempts: batch })
        store.markSynced(batch.map((a) => a.attemptId))
      } catch (e) {
        console.warn('Hochladen', e)
      } finally {
        inflight.current = false
      }
    }
    void flush()
    const t = window.setInterval(flush, 15000)
    window.addEventListener('online', flush)
    return () => {
      clearInterval(t)
      window.removeEventListener('online', flush)
    }
  }, [version, dev.registered, dev.token, push])

  return null
}

/** Verbunden? Wie viele Durchgänge warten noch? */
export function useSyncStatus() {
  const convex = useConvex()
  useStoreVersion()
  const [online, setOnline] = useState(true)
  useEffect(() => {
    const check = () => setOnline(convex.connectionState().isWebSocketConnected)
    check()
    const t = window.setInterval(check, 2000)
    return () => clearInterval(t)
  }, [convex])
  return { online, pending: store.unsynced().length }
}

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
function randomCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(8))
  return [...bytes].map((b) => CODE_CHARS[b % CODE_CHARS.length]).join('')
}

export function DevicesDialog() {
  const dev = store.device()
  const { online, pending } = useSyncStatus()
  const devices = useQuery(api.sync.devices, dev.registered ? { token: dev.token } : 'skip')
  const offer = useMutation(api.sync.offerPairCode)
  const claim = useMutation(api.sync.claimPairCode)
  const [shown, setShown] = useState<{ code: string; expiresAt: number } | null>(null)
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (!shown) return
    const t = window.setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [shown])

  const showCode = async () => {
    setError(null)
    const c = randomCode()
    try {
      const { expiresAt } = await offer({ token: dev.token, code: c })
      setShown({ code: c, expiresAt })
      setNow(Date.now())
    } catch {
      setError('Code konnte nicht erstellt werden. Besteht eine Verbindung?')
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
        toast('Gerät gekoppelt', {
          description: r.moved ? `${r.moved} Durchgänge von diesem Gerät übernommen.` : 'Der Fortschritt ist jetzt auf allen Geräten gleich.',
          type: 'success',
        })
      } else setError('Der Code stimmt nicht oder ist abgelaufen. Lass dir auf dem anderen Gerät einen neuen zeigen.')
    } catch {
      setError('Keine Verbindung. Versuch es gleich noch einmal.')
    } finally {
      setBusy(false)
    }
  }

  const remaining = shown ? Math.max(0, Math.round((shown.expiresAt - now) / 1000)) : 0
  const count = devices?.length ?? 1

  return (
    <Dialog onOpenChange={(open) => !open && (setShown(null), setError(null))}>
      <DialogTrigger className="sync-trigger" aria-label={count > 1 ? `${count} Geräte gekoppelt` : 'Geräte koppeln'}>
        <DevicesIcon />
        {count > 1 && <span className="sync-count">{count}</span>}
        <span className={`sync-dot ${online ? (pending ? 'pending' : 'ok') : 'off'}`} aria-hidden />
      </DialogTrigger>
      <DialogBackdrop className="dialog-backdrop" />
      <DialogContent className="dialog">
        <DialogTitle className="dialog-title">Fortschritt auf allen Geräten</DialogTitle>
        <DialogDescription className="dialog-desc">
          {online
            ? pending
              ? `${pending} Durchgänge werden gerade hochgeladen.`
              : 'Alles synchronisiert.'
            : 'Gerade offline. Deine Durchgänge bleiben gespeichert und gehen hoch, sobald wieder Netz da ist.'}
        </DialogDescription>

        {devices && devices.length > 0 && (
          <ul className="device-list">
            {devices.map((d, i) => (
              <li key={i}>
                {d.label}
                {d.self && <span className="device-self">dieses Gerät</span>}
              </li>
            ))}
          </ul>
        )}

        <section className="pair">
          <h3>Neues Gerät hinzufügen</h3>
          {shown && remaining > 0 ? (
            <>
              <p className="pair-code" aria-live="polite">
                {shown.code.slice(0, 4)}
                <span aria-hidden>–</span>
                {shown.code.slice(4)}
              </p>
              <p className="pair-hint">
                Auf dem anderen Gerät „Geräte koppeln“ öffnen und den Code eingeben. Noch {Math.floor(remaining / 60)}:
                {String(remaining % 60).padStart(2, '0')} Minuten gültig.
              </p>
            </>
          ) : (
            <button className="secondary-dark" onClick={showCode} disabled={!dev.registered}>
              Code anzeigen
            </button>
          )}
        </section>

        <section className="pair">
          <h3>Dieses Gerät verbinden</h3>
          <p className="pair-hint">Code vom anderen Gerät eingeben:</p>
          <OTPInput
            className="otp"
            maxLength={8}
            pattern={/[A-HJ-NP-Za-hj-np-z2-9]/}
            inputMode="text"
            value={code}
            onValueChange={(v) => setCode(v.toUpperCase())}
            onValueCommit={(v) => void redeem(v)}
            disabled={busy}
            aria-label="Kopplungscode"
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

        <DialogClose className="dialog-close" aria-label="Schließen">
          ×
        </DialogClose>
      </DialogContent>
    </Dialog>
  )
}
