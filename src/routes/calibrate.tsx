import { createFileRoute, useCanGoBack, useNavigate, useRouter } from '@tanstack/react-router'
import { CalibrateScreen } from '../ui/calibrate/CalibrateScreen'

/** Mikrofon einlernen; „Zurück“ führt dorthin, wo man herkam (meist das Stück) */
export const Route = createFileRoute('/calibrate')({ component: Calibrate })

function Calibrate() {
  const navigate = useNavigate()
  const router = useRouter()
  const canGoBack = useCanGoBack()
  return <CalibrateScreen onBack={() => (canGoBack ? router.history.back() : void navigate({ to: '/', replace: true }))} />
}
