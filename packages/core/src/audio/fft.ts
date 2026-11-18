/** Radix-2-FFT für reelle Eingangsdaten, liefert das Betragsspektrum (N/2 Bins). */
export class RealFFT {
  readonly n: number
  private re: Float64Array
  private im: Float64Array
  private cos: Float64Array
  private sin: Float64Array
  private rev: Uint32Array

  constructor(n: number) {
    if (n & (n - 1)) throw new Error('FFT-Größe muss eine Zweierpotenz sein')
    this.n = n
    this.re = new Float64Array(n)
    this.im = new Float64Array(n)
    this.cos = new Float64Array(n / 2)
    this.sin = new Float64Array(n / 2)
    for (let i = 0; i < n / 2; i++) {
      this.cos[i] = Math.cos((-2 * Math.PI * i) / n)
      this.sin[i] = Math.sin((-2 * Math.PI * i) / n)
    }
    this.rev = new Uint32Array(n)
    const bits = Math.log2(n)
    for (let i = 0; i < n; i++) {
      let r = 0
      for (let b = 0; b < bits; b++) r = (r << 1) | ((i >> b) & 1)
      this.rev[i] = r
    }
  }

  /** input.length === n; out.length >= n/2 */
  magnitude(input: ArrayLike<number>, window: Float64Array, out: Float64Array) {
    const { n, re, im, rev, cos, sin } = this
    for (let i = 0; i < n; i++) {
      re[rev[i]] = input[i] * window[i]
      im[rev[i]] = 0
    }
    for (let size = 2; size <= n; size <<= 1) {
      const half = size >> 1
      const step = n / size
      for (let start = 0; start < n; start += size) {
        for (let k = 0; k < half; k++) {
          const c = cos[k * step]
          const s = sin[k * step]
          const a = start + k
          const b = a + half
          const tr = re[b] * c - im[b] * s
          const ti = re[b] * s + im[b] * c
          re[b] = re[a] - tr
          im[b] = im[a] - ti
          re[a] += tr
          im[a] += ti
        }
      }
    }
    for (let k = 0; k < n / 2; k++) out[k] = Math.hypot(re[k], im[k])
  }
}

export function hann(n: number) {
  const w = new Float64Array(n)
  for (let i = 0; i < n; i++) w[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1))
  return w
}
