// v1.3 motion helpers (visual only). Hand-written, no dependency. Every effect respects prefers-reduced-motion:
// with reduce on, numbers render their final value straight away and CSS animations are switched off in index.css.
import { useEffect, useRef, useState, type CSSProperties } from 'react'

export const reducedMotion = () =>
  typeof window === 'undefined' || !window.matchMedia || window.matchMedia('(prefers-reduced-motion: reduce)').matches

// Last value shown per ticker key, so a number animates from what you last saw (e.g. after logging food) instead of from 0.
const lastShown = new Map<string, number>()

const ease = (t: number) => 1 - Math.pow(1 - t, 3)

/** Count up to `value` over ~600 ms (Magic UI style number ticker). */
export function useCountUp(value: number, key?: string, duration = 600, delay = 0) {
  const reduce = reducedMotion()
  const start = key != null && lastShown.has(key) ? lastShown.get(key)! : 0
  const [shown, setShown] = useState(reduce ? value : start)
  const from = useRef(reduce ? value : start)
  useEffect(() => {
    if (reducedMotion() || from.current === value) { setShown(value); from.current = value; if (key) lastShown.set(key, value); return }
    const a = from.current
    let raf = 0
    let t0 = 0
    const tick = (t: number) => {
      if (!t0) t0 = t
      const p = Math.min(1, Math.max(0, (t - t0 - delay) / duration))
      const v = a + (value - a) * ease(p)
      from.current = v
      setShown(v)
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    if (key) lastShown.set(key, value)
    return () => cancelAnimationFrame(raf)
  }, [value, key, duration, delay])
  // Reduced motion: always the live value, in the same render (no one-frame lag).
  return reduce ? value : shown
}

export function Ticker({ value, format, id, delay }: { value: number; format: (n: number) => string; id?: string; delay?: number }) {
  const v = useCountUp(value, id, 600, delay)
  return <>{format(v)}</>
}

// Remember the last ring fill per key so a ring grows from where it was (first time: from empty).
const lastRing = new Map<string, number>()
/** Returns the dashoffset the ring should animate from (CSS var --from) and records the new one. */
export function useRingFrom(key: string, c: number, offset: number) {
  const [from] = useState(() => (lastRing.has(key) ? lastRing.get(key)! : c))
  useEffect(() => { lastRing.set(key, offset) }, [key, offset])
  return from
}

// Tabs that have already played their staggered entrance this session.
const visited = new Set<string>()
export function useFirstVisit(path: string) {
  const [first] = useState(() => !visited.has(path))
  useEffect(() => { visited.add(path) }, [path])
  return first
}

// Food and exercise rows already on screen once; a row not in here is new and slides in.
const knownRows = new Set<string>()
let rowsReady = false
export function useNewRows(ids: string[]) {
  const [fresh] = useState(() => (rowsReady ? new Set(ids.filter((id) => !knownRows.has(id))) : new Set<string>()))
  useEffect(() => { ids.forEach((id) => knownRows.add(id)); rowsReady = true })
  return fresh
}

const CONFETTI = ['var(--color-protein)', 'var(--color-carbs)', 'var(--color-fat)', 'var(--color-g)']
/** One light confetti burst in the macro colours. Renders nothing with reduced motion. */
export function Confetti({ n = 36 }: { n?: number }) {
  const [bits] = useState(() =>
    Array.from({ length: n }, (_, i) => {
      const a = (Math.PI * 2 * i) / n + Math.random() * 0.4
      const d = 90 + Math.random() * 110
      return { x: Math.cos(a) * d, y: Math.sin(a) * d * 0.8 - 40, r: Math.random() * 540 - 270, c: CONFETTI[i % CONFETTI.length], w: 6 + Math.random() * 5, delay: Math.random() * 80 }
    }),
  )
  const [done, setDone] = useState(false)
  useEffect(() => { const t = setTimeout(() => setDone(true), 1100); return () => clearTimeout(t) }, [])
  if (done || reducedMotion()) return null
  return (
    <div className="pointer-events-none absolute left-1/2 top-[30%] z-20" aria-hidden="true" data-testid="confetti">
      {bits.map((b, i) => (
        <i key={i} className="confetti-bit" style={{ '--x': `${b.x}px`, '--y': `${b.y}px`, '--r': `${b.r}deg`, background: b.c, width: b.w, height: b.w * 0.45, animationDelay: `${b.delay}ms` } as CSSProperties} />
      ))}
    </div>
  )
}
