import { useEffect } from 'react'
import { createFileRoute, redirect, useCanGoBack, useNavigate, useRouter } from '@tanstack/react-router'
import type { Stage } from '@piano/core/music/lessons'
import { lessonAfter, lessonById } from '@piano/core/music/pieceStore'
import { parseVersionId, versionId, versionsOf, type Level } from '@piano/core/music/versions'
import { recommendedVersion } from '@piano/core/practice/progress'
import { SITE } from '@piano/core/content/site'
import { localized } from '@piano/core/i18n'
import { PracticeScreen } from '../ui/practice/PracticeScreen'

const STAGES: readonly Stage[] = ['L', 'R', 'LR']

/** Ein Stück (oder eine Lernfassung eines eigenen Stücks) unter eigener Adresse, z. B. /play/ode?stage=R: teilbar, und „Zurück“ führt zur Startseite */
export const Route = createFileRoute('/play/$lessonId')({
  validateSearch: (search: Record<string, unknown>): { stage?: Stage } =>
    STAGES.includes(search.stage as Stage) ? { stage: search.stage as Stage } : {},
  beforeLoad: ({ params }) => {
    if (!lessonById(params.lessonId)) throw redirect({ to: '/', replace: true })
  },
  component: Play,
})

function Play() {
  const { lessonId } = Route.useParams()
  const { stage } = Route.useSearch()
  const navigate = useNavigate()
  const router = useRouter()
  const canGoBack = useCanGoBack()
  // Eingebaute Stücke und Lernfassungen eigener Stücke (MIDI-Import)
  const lesson = lessonById(lessonId)!
  const next = lessonAfter(lessonId)
  // Fassungen (Leicht, Mittel, Original): der Wechsel ersetzt den Eintrag wie ein Stufenwechsel
  const { pieceId, level } = parseVersionId(lessonId)
  const available = versionsOf(lessonId).map((l) => parseVersionId(l.id).level)
  const versions =
    available.length > 1
      ? {
          current: level,
          available,
          recommended: parseVersionId(recommendedVersion(pieceId).id).level,
          onChange: (lv: Level) =>
            void navigate({ to: '/play/$lessonId', params: { lessonId: versionId(pieceId, lv) }, search: stage ? { stage } : {}, replace: true }),
        }
      : undefined

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
      // Nächstes Stück ersetzt den Eintrag ebenso: „Zurück“ führt nach mehreren Stücken
      // hintereinander direkt ins Hauptmenü, nicht durch jedes Stück rückwärts
      onNextLesson={next ? () => void navigate({ to: '/play/$lessonId', params: { lessonId: next.id }, replace: true }) : undefined}
      onCalibrate={() => void navigate({ to: '/calibrate' })}
      versions={versions}
    />
  )
}
