import type { Meta, StoryObj } from '@storybook/react-vite'
import { Logo } from './icons'
import { Dots } from './Dots'

/**
 * @summary Signet und Fortschrittspunkte: das Pianorollen-P (Messingbalken = aktuelle Note) und
 * die drei Punkte je Stufe, gefüllt für jeden sauberen Durchgang.
 */
const meta = {
  title: 'Gemeinsam/Marke und Punkte',
  component: Logo,
} satisfies Meta<typeof Logo>
export default meta

/** @summary Das Signet in den Größen, die die App nutzt (Leiste 24, Über-Fenster 32, Icon 96). */
export const Signet: StoryObj<typeof meta> = {
  render: () => (
    <div style={{ display: 'flex', gap: 24, alignItems: 'end' }}>
      <Logo size={24} />
      <Logo size={32} />
      <Logo size={96} />
    </div>
  ),
}

/** @summary Punkte je Stufe: 0 bis 3 saubere Durchgänge, links Petrol, rechts Messing, beide zusammen. */
export const Fortschrittspunkte: StoryObj<typeof meta> = {
  render: () => (
    <div style={{ display: 'grid', gap: 12 }}>
      {(['L', 'R', 'LR'] as const).map((s) => (
        <div key={s} style={{ display: 'flex', gap: 16 }}>
          {[0, 1, 2, 3].map((n) => (
            <Dots key={n} stage={s} clean={n} />
          ))}
        </div>
      ))}
    </div>
  ),
}
