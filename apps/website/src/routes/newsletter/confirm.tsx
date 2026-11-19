import { useCallback } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { t } from '@piano/core/i18n'
import { confirm } from '../../newsletter/client'
import { NewsletterResult } from '../../ui/NewsletterResult'

/** Link aus der Bestätigungsmail (Double-Opt-in) */
export const Route = createFileRoute('/newsletter/confirm')({
  validateSearch: (s: Record<string, unknown>) => ({ token: typeof s.token === 'string' ? s.token : '' }),
  component: Confirm,
})

function Confirm() {
  const { token } = Route.useSearch()
  const run = useCallback(() => confirm(token), [token])
  return <NewsletterResult run={run} okTitle={t.launch.confirmedTitle} okBody={t.launch.confirmedBody} failBody={t.launch.confirmFailed} />
}
