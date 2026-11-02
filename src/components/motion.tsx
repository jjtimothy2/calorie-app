// v1.3 motion helpers (visual only). Hand-written, no dependency. Every effect respects prefers-reduced-motion:
// with reduce on, numbers render their final value straight away and CSS animations are switched off in index.css.
import { createContext, useContext, useEffect, useRef, useState, type CSSProperties, type RefObject } from 'react'

export const reducedMotion = () =>
  typeof window === 'undefined' || !window.matchMedia || window.matchMedia('(prefers-reduced-motion: reduce)').matches

// Last value shown per ticker key, so a number animates from what you last saw (e.g. after logging food) instead of from 0.
const lastShown = new Map<string, number>()

const ease = (t: number) => 1 - Math.pow(1 - t, 3)

/** Count duration shared by every ticker and the gauge needle, so Home can wait for it before scrolling (v1.21). */
export const COUNT_MS = 600

/**
 * v1.21: while true, tickers hold the value they last showed and start counting once it turns false. Home sets it
 * until the gauge is in view, so a count is never spent off screen.
 */
export const CountHold = createContext(false)

/**
 * v1.21: a sheet that is sliding away still covers the screen, so a count that would start under it waits until it
 * has gone (Sheet sets this for its 250 ms close). Home adds the same wait before it scrolls to the new row.
 */
let heldUntil = 0
export function holdCounts(ms: number) { heldUntil = ms > 0 ? Math.max(heldUntil, performance.now() + ms) : 0; return heldUntil }
export const countsHeldFor = () => Math.max(0, heldUntil - performance.now())

/**
 * Count up to `value` over ~600 ms (Magic UI style number ticker). v1.21: `hold` keeps the last shown value until it
 * turns false; the key's last value is only recorded once the count starts, so a held count that unmounts replays.
 */
export function useCountUp(value: number, key?: string, duration = COUNT_MS, delay = 0, hold = false) {
  const reduce = reducedMotion()
  const start = key != null && lastShown.has(key) ? lastShown.get(key)! : 0
  const [shown, setShown] = useState(reduce ? value : start)
  const from = useRef(reduce ? value : start)
  useEffect(() => {
    if (reducedMotion() || from.current === value) { setShown(value); from.current = value; if (key) lastShown.set(key, value); return }
    if (hold) return
    const a = from.current
    let raf = 0
    let t0 = 0
    // Compare the frame time, not the clock, so every ticker in one frame decides alike and they start in step.
    const tick = (t: number) => {
      if (!t0 && t < heldUntil) { raf = requestAnimationFrame(tick); return }
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
  }, [value, key, duration, delay, hold])
  // Reduced motion: always the live value, in the same render (no one-frame lag).
  return reduce ? value : shown
}

export function Ticker({ value, format, id, delay }: { value: number; format: (n: number) => string; id?: string; delay?: number }) {
  const hold = useContext(CountHold)
  const v = useCountUp(value, id, COUNT_MS, delay, hold)
  return <>{format(v)}</>
}

/**
 * v1.21: true once `pick(root)` is at least `ratio` visible on screen (scroll containers clip it), null before the
 * first reading.
 */
export function useInView(root: RefObject<HTMLElement | null>, pick: (el: HTMLElement) => Element | null, ratio = 0.5) {
  const [seen, setSeen] = useState<boolean | null>(null)
  const pickRef = useRef(pick)
  pickRef.current = pick
  useEffect(() => {
    const el = root.current && pickRef.current(root.current)
    if (!el || typeof IntersectionObserver === 'undefined') { setSeen(true); return }
    const io = new IntersectionObserver((es) => { const e = es[es.length - 1]; setSeen(e.isIntersecting && e.intersectionRatio >= ratio - 0.01) }, { threshold: [0, ratio, 1] })
    io.observe(el)
    return () => io.disconnect()
  }, [root, ratio])
  return seen
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
