import { definePrimitive } from '@ui-sdk/core'

/**
 * Der Übe-Ablauf als UI-SDK-Primitive. Es zeichnet nichts: Es trägt die Übe-Fläche (`<main>`) und
 * macht den Zustand lesbar, den man sonst nur sieht (Phase, Stufe, Tempo, Grund einer Pause).
 * So sieht `agent.snapshot()` genau, wo man gerade ist, und Tests prüfen die Interaktions-Karte
 * gegen diesen Zustand statt gegen Bilder. Die Aktionen sind dieselben, die Tipps und Tasten
 * auslösen.
 *
 * Phasen: Warten `waiting` → `playing` ↔ `holding` → `result`; Mitspielen `ready` → `running`
 * (mit Einzähler) ↔ `paused` → `result`; quer dazu `demo` (Vorspielen).
 */
export type SessionPhase = 'waiting' | 'playing' | 'holding' | 'ready' | 'running' | 'paused' | 'result' | 'demo'

export type PracticeSessionOptions = {
  phase?: SessionPhase
  stage?: string
  tempo?: string
  /** Warum angehalten: tap, background, midi, demo, seek; leer, wenn nicht angehalten */
  pausedBy?: string
  /** Gespult: Takt, ab dem gerade eine Stelle geübt wird; '0' heißt von vorn */
  fromBar?: string
  onPause?: () => void
  onResume?: () => void
  onRestart?: () => void
  onStopDemo?: () => void
}

export const practiceSession = definePrimitive({
  name: 'practice-session',
  options: {
    phase: 'string',
    stage: 'string',
    tempo: 'string',
    pausedBy: 'string',
    fromBar: 'string',
    onPause: 'callback',
    onResume: 'callback',
    onRestart: 'callback',
    onStopDemo: 'callback',
  },
  state: (o: PracticeSessionOptions) => ({
    phase: o.phase ?? ('waiting' as SessionPhase),
    stage: o.stage ?? '',
    tempo: o.tempo ?? 'wait',
    pausedBy: o.pausedBy ?? '',
    fromBar: o.fromBar ?? '0',
  }),
  sync: (o) => ({
    ...(o.phase === undefined ? {} : { phase: o.phase }),
    ...(o.stage === undefined ? {} : { stage: o.stage }),
    ...(o.tempo === undefined ? {} : { tempo: o.tempo }),
    ...(o.pausedBy === undefined ? {} : { pausedBy: o.pausedBy }),
    ...(o.fromBar === undefined ? {} : { fromBar: o.fromBar }),
  }),
  // Im Snapshot sichtbar
  controlled: ['phase', 'stage', 'tempo', 'pausedBy', 'fromBar'],
  api: (context) => ({
    pause: () => context.options().onPause?.(),
    resume: () => context.options().onResume?.(),
    restart: () => context.options().onRestart?.(),
    stopDemo: () => context.options().onStopDemo?.(),
  }),
  slots: (slot) => ({
    root: slot({ attrs: (state) => ({ 'data-phase': state.phase }) }),
  }),
  agent: { actions: ['pause', 'resume', 'restart', 'stopDemo'] },
})
