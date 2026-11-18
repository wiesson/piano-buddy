import type { Meta, StoryObj } from '@storybook/react-vite'
import { LESSONS } from '@piano/core/music/lessons'
import { LessonRow } from './LessonRow'
import { SongGallery } from './SongGallery'

/**
 * @summary Lernpfad und Liederkarten, auf Website und App-Startseite gleich. Eine Zeile zeigt
 * Nummer, Stück, Ziel und die Punkte je Hand; die Karten Illustration und Stand der Stufen.
 */
const meta = {
  title: 'Gemeinsam/Lernpfad',
  component: LessonRow,
  args: { lesson: LESSONS[0], index: 0, done: false, isNext: true, onOpen: () => {} },
} satisfies Meta<typeof LessonRow>
export default meta

/** @summary Der ganze Lernpfad mit allen 14 Stücken; das erste ist „als Nächstes“ markiert. */
export const Lernpfad: StoryObj<typeof meta> = {
  render: (args) => (
    <ol className="pb-path" style={{ maxWidth: 820 }}>
      {LESSONS.map((l, i) => (
        <LessonRow key={l.id} {...args} lesson={l} index={i} isNext={i === 0} done={false} />
      ))}
    </ol>
  ),
}

/** @summary Eine Zeile, die schon sitzt: Häkchen statt Nummer. */
export const Gelernt: StoryObj<typeof meta> = {
  args: { done: true, isNext: false },
  render: (args) => (
    <ol className="pb-path" style={{ maxWidth: 820 }}>
      <LessonRow {...args} />
    </ol>
  ),
}

/** @summary Die Liederkarten mit Gouache-Illustrationen. */
export const Lieder: StoryObj<typeof meta> = {
  render: () => (
    <div style={{ maxWidth: 1100 }}>
      <SongGallery onOpen={() => {}} />
    </div>
  ),
}
