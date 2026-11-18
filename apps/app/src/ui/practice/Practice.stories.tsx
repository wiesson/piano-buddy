import { useCallback } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { LESSONS, notesForStage } from '@piano/core/music/lessons'
import { PianoRoll, type RollView } from './PianoRoll'
import { ResultCard } from './ResultCard'
import SheetView from './SheetView'

/**
 * @summary Die Übe-Bausteine: fallende Noten über der Klaviatur, die Notenansicht im Klaviersystem
 * und die Karte nach einem Durchgang. Gezeichnet mit echten Stücken, der aktuelle Ton leuchtet.
 */
const meta = {
  title: 'App/Üben',
  component: ResultCard,
  args: {
    result: { clean: true, wrong: 0, durationMs: 41000, unverified: 0, source: 'mic' },
    stage: 'R',
    nextStage: 'LR',
    clean: 1,
    onAgain: () => {},
    onNext: () => {},
  },
} satisfies Meta<typeof ResultCard>
export default meta

const ode = LESSONS.find((l) => l.id === 'ode')!
const elise = LESSONS.find((l) => l.id === 'elise')!

/** Ein stehender Moment der Übung: Position, erwartete Töne, keine Rückmeldungen */
function useView(lessonId: 'ode' | 'elise', stage: 'L' | 'R' | 'LR', beat: number, keysOnly = false) {
  return useCallback((): RollView => {
    const l = lessonId === 'ode' ? ode : elise
    const notes = notesForStage(l, stage)
    const expected = new Set(notes.filter((n) => Math.abs(n.start - beat) < 1e-6).map((n) => n.midi))
    return {
      notes,
      rangeNotes: l.notes,
      beat,
      expected,
      struck: new Set(),
      flashes: [],
      heard: [],
      press: () => 0,
      showNames: true,
      showFingers: true,
      keysOnly,
      hint: true,
    }
  }, [lessonId, stage, beat, keysOnly])
}

/** @summary Fallende Noten: Ode an die Freude, beide Hände, vierter Takt. Erwartete Töne leuchten. */
export const FallendeNoten: StoryObj<typeof meta> = {
  render: function Render() {
    const view = useView('ode', 'LR', 12)
    return (
      <div style={{ position: 'relative', height: 520 }}>
        <PianoRoll view={view} beatsPerBar={4} onKey={() => {}} expected={[]} paper />
      </div>
    )
  },
}

/** @summary Notenansicht: Für Elise, rechte Hand, 3/8 mit Auftakt; die linke Hand ist blass. */
export const Notenansicht: StoryObj<typeof meta> = {
  render: function Render() {
    const view = useView('elise', 'R', 6)
    return (
      <div className="sheet-stage" style={{ position: 'relative', height: 480 }}>
        <SheetView lesson={elise} stage="R" view={view} showNames={false} showFingers />
        <div className="sheet-keys">
          <PianoRoll view={useView('elise', 'R', 6, true)} beatsPerBar={3} onKey={() => {}} expected={[]} paper />
        </div>
      </div>
    )
  },
}

/** @summary Ergebnis nach einem sauberen Durchgang. */
export const Sauber: StoryObj<typeof meta> = {
  render: (args) => (
    <div style={{ position: 'relative', height: 360 }}>
      <ResultCard {...args} />
    </div>
  ),
}

/** @summary Ergebnis mit falschen Tönen. */
export const MitFehlern: StoryObj<typeof meta> = {
  args: { result: { clean: false, wrong: 3, durationMs: 52000, unverified: 0, source: 'mic' }, clean: 0 },
  render: (args) => (
    <div style={{ position: 'relative', height: 360 }}>
      <ResultCard {...args} />
    </div>
  ),
}
