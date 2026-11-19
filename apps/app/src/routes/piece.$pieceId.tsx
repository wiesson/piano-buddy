import { createFileRoute, redirect, useCanGoBack, useNavigate, useRouter } from '@tanstack/react-router'
import { pieces } from '@piano/core/music/pieceStore'
import { PieceScreen } from '../ui/pieces/PieceScreen'

/** Ein eigenes Stück (MIDI-Import): anhören, Hände, Lernpfad. Nur auf diesem Gerät. */
export const Route = createFileRoute('/piece/$pieceId')({
  beforeLoad: ({ params }) => {
    if (!pieces.get(params.pieceId)) throw redirect({ to: '/', replace: true })
  },
  component: Piece,
})

function Piece() {
  const { pieceId } = Route.useParams()
  const navigate = useNavigate()
  const router = useRouter()
  const canGoBack = useCanGoBack()
  return (
    <PieceScreen
      pieceId={pieceId}
      onBack={() => (canGoBack ? router.history.back() : void navigate({ to: '/', replace: true }))}
      onOpen={(l) => void navigate({ to: '/play/$lessonId', params: { lessonId: l.id } })}
    />
  )
}
