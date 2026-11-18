import { createFileRoute } from '@tanstack/react-router'
import { SinkPage } from '../ui/sink/SinkPage'

/** Bausteine der App als Katalog (nicht verlinkt, zum Zeigen) */
export const Route = createFileRoute('/sink')({ component: SinkPage })
