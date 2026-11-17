/** Kleine Merker pro Gerät (Mikrofon an, Notennamen, Finger). Ohne Speicher gilt der Standard. */
export function getPref(key: string, fallback: boolean) {
  try {
    const v = localStorage.getItem(`pianobuddy.${key}`)
    return v === null ? fallback : v === '1'
  } catch {
    return fallback
  }
}

export function setPref(key: string, on: boolean) {
  try {
    localStorage.setItem(`pianobuddy.${key}`, on ? '1' : '0')
  } catch {
    /* privater Modus: gilt nur für diese Sitzung */
  }
}
