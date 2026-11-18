import { useEffect } from 'react'
import { createFileRoute, redirect, useCanGoBack, useNavigate, useRouter } from '@tanstack/react-router'
import { LESSONS, type Stage } from '../music/lessons'
import { SITE } from '../content/site'
import { localized } from '../i18n'
import { PracticeScreen } from '../ui/practice/PracticeScreen'

const STAGES: readonly Stage[] = ['L', 'R', 'LR']

/** Ein Stück unter eigener Adresse, z. B. /play/ode?stage=R: teilbar, und „Zurück“ führt zur Startseite */
export const Route = createFileRoute('/play/$lessonId')({
  validateSearch: (search: Record<string, unknown>): { stage?: Stage } =>
    STAGES.includes(search.stage as Stage) ? { stage: search.stage as Stage } : {},
  beforeLoad: ({ params }) => {
    if (!LESSONS.some((l) => l.id === params.lessonId)) throw redirect({ to: '/', replace: true })
  },
  component: Play,
})

function Play() {
  const { lessonId } = Route.useParams()
  const { stage } = Route.useSearch()
  const navigate = useNavigate()
  const router = useRouter()
  const canGoBack = useCanGoBack()
  const index = LESSONS.findIndex((l) => l.id === lessonId)
  const lesson = LESSONS[index]
  const next = LESSONS[index + 1]

  useEffect(() => {
    const before = document.title
    document.title = `${localized(lesson.title)} · ${SITE.name}`
    return () => {
      document.title = before
    }
  }, [lesson])

  return (
    <PracticeScreen
      key={lesson.id}
      lesson={lesson}
      initialStage={stage}
      // Stufenwechsel ersetzen den Eintrag: „Zurück“ springt nicht durch die Stufen
      onStageChange={(s) => void navigate({ to: '.', search: { stage: s }, replace: true })}
      // Kam man von der Startseite, zurück dorthin (mit Scroll-Position); sonst zur Startseite
      onBack={() => (canGoBack ? router.history.back() : void navigate({ to: '/', replace: true }))}
      onNextLesson={next ? () => void navigate({ to: '/play/$lessonId', params: { lessonId: next.id } }) : undefined}
      onCalibrate={() => void navigate({ to: '/calibrate' })}
    />
  )
}
