import { createFileRoute, useCanGoBack, useNavigate, useRouter } from '@tanstack/react-router'
import { PopPage } from '../ui/pop/PopPage'

/** Pop-Pfad „Party-Pianist“: Musterwahl und alle Übungen */
export const Route = createFileRoute('/pop')({ component: Pop })

function Pop() {
  const navigate = useNavigate()
  const router = useRouter()
  const canGoBack = useCanGoBack()
  return (
    <PopPage
      onBack={() => (canGoBack ? router.history.back() : void navigate({ to: '/', replace: true }))}
      onOpen={(l) => void navigate({ to: '/play/$lessonId', params: { lessonId: l.id } })}
    />
  )
}
