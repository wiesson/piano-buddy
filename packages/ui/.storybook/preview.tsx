import type { Decorator, Preview } from '@storybook/react-vite'
import '../src/styles/base.css'
import '../src/styles/home.css'
import '../../../apps/app/src/styles/practice.css'
import '../../../apps/app/src/styles/calibrate.css'

/**
 * Papier (Website, Startseiten, Übe-Screen tagsüber) oder Lack (Übe-Screen abends), wie die
 * App es mit der Klasse .paper umschaltet.
 */
const withTheme: Decorator = (Story, context) => {
  const paper = context.globals.theme !== 'lacquer'
  return (
    <div className={paper ? 'paper' : ''} style={{ background: 'var(--bg)', color: 'var(--fg)', padding: 24, minHeight: '100%' }}>
      <Story />
    </div>
  )
}

const preview: Preview = {
  tags: ['autodocs'],
  decorators: [withTheme],
  globalTypes: {
    theme: {
      description: 'Papier oder Lack',
      toolbar: {
        icon: 'mirror',
        items: [
          { value: 'paper', title: 'Papier' },
          { value: 'lacquer', title: 'Lack' },
        ],
        dynamicTitle: true,
      },
    },
  },
  initialGlobals: { theme: 'paper' },
  parameters: {
    layout: 'fullscreen',
    a11y: { test: 'todo' },
  },
}

export default preview
