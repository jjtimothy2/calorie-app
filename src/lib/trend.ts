// Helpers for the History balance trend chart (pure).

/** 7-day rolling average of the values present in [i-6, i]. Null when the window has none. */
export function rolling(values: (number | null)[], win = 7): (number | null)[] {
  return values.map((_, i) => {
    const w = values.slice(Math.max(0, i - win + 1), i + 1).filter((v): v is number => v != null)
    return w.length ? w.reduce((s, v) => s + v, 0) / w.length : null
  })
}

type P = [number, number]
/** Monotone cubic (Fritsch-Carlson, same as d3.curveMonotoneX) through points sorted by x. */
export function monotonePath(pts: P[]): string {
  const n = pts.length
  if (!n) return ''
  if (n === 1) return `M${pts[0][0]},${pts[0][1]}`
  const d: number[] = []
  for (let i = 0; i < n - 1; i++) d.push((pts[i + 1][1] - pts[i][1]) / (pts[i + 1][0] - pts[i][0]))
  const m = pts.map((_, i) => (i === 0 ? d[0] : i === n - 1 ? d[n - 2] : d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2))
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) { m[i] = 0; m[i + 1] = 0; continue }
    const a = m[i] / d[i], b = m[i + 1] / d[i], s = a * a + b * b
    if (s > 9) { const t = 3 / Math.sqrt(s); m[i] = t * a * d[i]; m[i + 1] = t * b * d[i] }
  }
  let out = `M${pts[0][0].toFixed(2)},${pts[0][1].toFixed(2)}`
  for (let i = 0; i < n - 1; i++) {
    const [x0, y0] = pts[i], [x1, y1] = pts[i + 1], h = (x1 - x0) / 3
    out += `C${(x0 + h).toFixed(2)},${(y0 + m[i] * h).toFixed(2)} ${(x1 - h).toFixed(2)},${(y1 - m[i + 1] * h).toFixed(2)} ${x1.toFixed(2)},${y1.toFixed(2)}`
  }
  return out
}

/** Split into runs of consecutive non-null points. */
export function runs<T>(items: (T | null)[]): T[][] {
  const out: T[][] = []
  let cur: T[] = []
  for (const it of items) { if (it == null) { if (cur.length) out.push(cur); cur = [] } else cur.push(it) }
  if (cur.length) out.push(cur)
  return out
}
