// Ein Klavier per Web MIDI für die Ablauftests (vor dem Laden der Seite eingehängt). Der Test
// spielt mit window.fakeMidi([status, data1, data2]); jede Verbindung bekommt dasselbe Gerät,
// wie es Chrome bei mehreren requestMIDIAccess-Aufrufen tun kann.
;(() => {
  const input = new EventTarget()
  Object.assign(input, { id: 'test', name: 'Testklavier', type: 'input', state: 'connected' })
  const access = new EventTarget()
  Object.assign(access, { inputs: new Map([['test', input]]), outputs: new Map(), sysexEnabled: false })
  navigator.requestMIDIAccess = async () => access
  window.fakeMidi = (bytes) => {
    const e = new Event('midimessage')
    Object.defineProperty(e, 'data', { value: new Uint8Array(bytes) })
    input.dispatchEvent(e)
    return true
  }
})()
