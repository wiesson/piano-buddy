import { useState } from 'react'
import { t } from '@piano/core/i18n'
import { useReportUpload } from '../../diagnostics/upload'

/**
 * „Messung senden“: Messwerte und Aufnahme gehen auf ausdrücklichen Tipp an Piano Buddy (Convex),
 * damit wir die Erkennung an echten Klavieren verbessern. Nur gerendert, wenn Sync läuft.
 */
export function SendReport({ data, audio, summary }: { data: () => Blob; audio: Blob | null; summary: () => string }) {
  const upload = useReportUpload()
  const [state, setState] = useState<{ kind: 'idle' | 'sending' | 'error' } | { kind: 'sent'; id: string }>({ kind: 'idle' })
  if (!upload) return null

  const send = async () => {
    setState({ kind: 'sending' })
    try {
      const id = await upload('calibration', summary(), data(), audio)
      setState({ kind: 'sent', id })
    } catch (e) {
      console.warn('Messung senden', e)
      setState({ kind: 'error' })
    }
  }

  return (
    <div className="calib-send">
      {state.kind === 'sent' ? (
        <p className="calib-small">{t.calib.sent(state.id)}</p>
      ) : (
        <>
          <button type="button" className="ghost" onClick={send} disabled={state.kind === 'sending'}>
            {state.kind === 'sending' ? t.calib.sending : t.calib.send}
          </button>
          <p className="calib-small">{state.kind === 'error' ? t.calib.sendFailed : t.calib.sendNote}</p>
        </>
      )}
    </div>
  )
}
