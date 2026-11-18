import { createRovingFocus, definePrimitive } from '@ui-sdk/core'

/**
 * Die Klaviatur als zugängliches Bedienelement (UI SDK): ein einziger Tab-Halt, Pfeiltasten gehen
 * chromatisch von Taste zu Taste, Home/End springen an die Enden, Leertaste oder Enter spielt.
 * Die Tasten sind unsichtbare Knöpfe über der gezeichneten Tastatur; der Screenreader liest
 * den Notennamen. Zeiger (Maus, Touch) bleiben beim Canvas, damit Antippen sofort klingt.
 */
export type PianoKeysOptions = {
  /** Taste, auf der der Fokus beim ersten Betreten landet (MIDI-Nummer) */
  home?: number
  onPlay?: (midi: number) => void
}

export const pianoKeys = definePrimitive({
  name: 'piano-keys',
  options: {
    home: 'number',
    onPlay: 'callback',
  },
  state: (options: PianoKeysOptions) => ({
    home: options.home ?? 60,
    focused: null as string | null,
  }),
  sync: (options) => (options.home === undefined ? {} : { home: options.home }),
  api: (context) => {
    const roving = createRovingFocus(context, {
      slot: 'key',
      key: 'focused',
      orientation: () => 'horizontal',
      loop: () => false,
      // Beim Betreten der Klaviatur landet der Fokus auf der erwarteten Taste
      remember: false,
      preferred: (item) => item.key === String(context.store.get().home),
      claims: (state, item) => item.key === String(state.home),
    })
    return {
      roving,
      play: (midi: number) => context.options().onPlay?.(midi),
      keydown: (event: KeyboardEvent, el: HTMLElement) => {
        roving.keydown(event, el)
      },
    }
  },
  slots: (slot) => ({
    root: slot({
      attrs: () => ({ role: 'group' }),
    }),
    key: slot<{ value: string }>({
      props: { value: 'string' },
      attrs: (state, part) => ({
        type: 'button',
        tabindex: part.api.roving.tabIndex(state, part),
      }),
      press: ({ api, key }) => api.play(Number(key)),
      on: {
        keydown: (event, { el, api }) => {
          if (el) api.keydown(event, el)
        },
      },
      bind: (el, part) => part.api.roving.bind(el, part),
    }),
  }),
})
