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

/**
 * v1.4.2 fixed balance scale for the whole history (paging never jumps, no closed day is cut off).
 * top fits the biggest closed-day deficit (or a deficit goal), bottom only the biggest closed surplus
 * (or a surplus goal when gaining), each + ~10% rounded up to 50 kcal. No surplus: bottom is 0 and the chart
 * keeps a small pixel margin below zero. Open days (today) do not set the scale: they may run to the plot edge.
 */
export function trendScale(closed: number[], goal: number): { top: number; bottom: number } {
  const up = (n: number) => (n > 0 ? Math.max(50, Math.ceil((n * 1.1) / 50) * 50) : 0)
  const maxDef = Math.max(0, ...closed, goal)
  const maxSur = Math.max(0, ...closed.map((v) => -v), -goal)
  return { top: Math.max(50, up(maxDef)), bottom: up(maxSur) }
}

/** v1.4.2 protein scale, fixed for all history: top = biggest day or the target, whichever is larger, + ~10% (rounded up to 10 g). */
export function proteinTrendScale(values: number[], target: number): { top: number; bottom: number } {
  const m = Math.max(0, target, ...values)
  return { top: Math.max(10, Math.ceil((m * 1.1) / 10) * 10), bottom: 0 }
}

/** Short bar label: '380', '1,559' (7 days) or '380', '1.6k' (30 days). */
export function barLabel(v: number, compact: boolean): string {
  const a = Math.round(Math.abs(v))
  if (compact && a >= 1000) return `${(a / 1000).toFixed(a >= 9950 ? 0 : 1)}k`
  return a.toLocaleString('en-US')
}
