import type { Meta, StoryObj } from '@storybook/react-vite'
import { LESSONS } from '@piano/core/music/lessons'
import TryPiano from './TryPiano'
import { RollPreview } from './RollPreview'
import { Faq } from './Faq'

/**
 * @summary Abschnitte der Website: „Probier’s gleich hier“ (spielbar), die Pianorollen-Vorschau aus
 * echten Lektionsdaten und die häufigen Fragen.
 */
const meta = {
  title: 'Website/Abschnitte',
  component: RollPreview,
  args: { lesson: LESSONS.find((l) => l.id === 'ode')!, onOpen: () => {} },
} satisfies Meta<typeof RollPreview>
export default meta

/** @summary Spielbare Klaviatur im Warte-Modus: die ersten Takte der Ode, rechte Hand. */
export const Ausprobieren: StoryObj<typeof meta> = {
  render: () => (
    <div className="home" style={{ maxWidth: 760, margin: '0 auto' }}>
      <TryPiano onOpen={() => {}} />
    </div>
  ),
}

/** @summary Pianorollen-Vorschau: die ersten acht Schläge als fallende Noten. */
export const Vorschau: StoryObj<typeof meta> = {
  render: (args) => (
    <div className="home" style={{ maxWidth: 420 }}>
      <RollPreview {...args} />
    </div>
  ),
}

/** @summary Häufige Fragen, aus derselben Quelle wie JSON-LD und llms.txt. */
export const Fragen: StoryObj<typeof meta> = {
  render: () => (
    <div className="home">
      <Faq />
    </div>
  ),
}
