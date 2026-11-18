import { useEffect } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { SITE } from '@piano/core/content/site'
import { ChangelogScreen } from '../ui/changelog/ChangelogScreen'

export const Route = createFileRoute('/changelog')({ component: Changelog })

function Changelog() {
  useEffect(() => {
    const before = document.title
    document.title = `Changelog · ${SITE.name}`
    window.scrollTo(0, 0)
    return () => {
      document.title = before
    }
  }, [])
  return <ChangelogScreen />
}
