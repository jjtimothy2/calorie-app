// v1.4: History balance chart with a 7-day average line, press-and-hold scrubbing and
// swipe paging, modelled on Apple Health's weight chart. Bars keep the v1.3 design.
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { balanceScale, fmt } from '../lib/calc'
import { haptic } from '../lib/haptics'
import { monotonePath, runs } from '../lib/trend'
import { reducedMotion } from './motion'

export type TrendDay = { key: string; label: string; tick: boolean; value: number | null; open?: boolean; avg: number | null }

const signed = (n: number) => (n > 0 ? `+${fmt(n)}` : n < 0 ? `−${fmt(-n)}` : '0')
const HOLD_MS = 150
const SLOP = 8

type G = {
  id: number; x0: number; y0: number; mode: 'pending' | 'scrub' | 'pan' | 'none'; timer: number
  dx: number; samples: { t: number; x: number }[]
}

/**
 * days: oldest to today, length a multiple of n. page 0 is the latest n days, page 1 the n before, and so on.
 * The plot is one wide strip translated sideways; the y axis and reference lines stay put.
 */
export function BalanceTrendChart({ days, n, goal, page, onPage, scrub, onScrub, height = 232 }: {
  days: TrendDay[]; n: number; goal: number; page: number; onPage: (p: number) => void
  scrub: number | null; onScrub: (i: number | null) => void; height?: number
}) {
  const W = 350, left = 40, labelH = 22, top = 10
  const plotW = W - left
  const plotH = height - labelH - top - 6
  const half = plotH / 2
  const zero = top + half
  const N = days.length
  const slot = plotW / n
  const gap = n > 10 ? 3 : 10
  const bw = slot - gap
  const maxPage = Math.max(0, N / n - 1)
  const tx = (p: number) => -(N - n * (p + 1)) * slot
  const start = N - n * (page + 1), end = start + n - 1

  // One static scale for the whole history so the y axis never jumps while paging.
  const closedVals = days.flatMap((d) => (d.value == null || d.open ? [] : [d.value]))
  const S = balanceScale(closedVals.length ? closedVals : days.flatMap((d) => (d.value == null ? [] : [d.value])), goal)
  const k = half / S
  const yOf = (v: number) => zero - Math.max(-S, Math.min(S, v)) * k
  const cx = (i: number) => left + i * slot + slot / 2

  const linePath = useMemo(() => runs(days.map((d, i) => (d.avg == null ? null : ([cx(i), yOf(d.avg)] as [number, number]))))
    .map((r) => monotonePath(r)).join(''), [days, n, S]) // eslint-disable-line react-hooks/exhaustive-deps
  const areaPath = useMemo(() => runs(days.map((d, i) => (d.avg == null ? null : ([cx(i), yOf(d.avg)] as [number, number]))))
    .map((r) => `${monotonePath(r)}L${r[r.length - 1][0].toFixed(2)},${zero}L${r[0][0].toFixed(2)},${zero}Z`).join(''), [days, n, S]) // eslint-disable-line react-hooks/exhaustive-deps

  const svgRef = useRef<SVGSVGElement>(null)
  const stripRef = useRef<SVGGElement>(null)
  const lineRef = useRef<SVGPathElement>(null)
  const g = useRef<G | null>(null)
  const anim = useRef<{ raf: number; finish: () => void } | null>(null)
  const live = useRef({ page, scrub, maxPage, start, end })
  live.current = { page, scrub, maxPage, start, end }

  const setDx = (dx: number) => stripRef.current?.setAttribute('transform', `translate(${(tx(live.current.page) + dx).toFixed(2)} 0)`)
  const toSvgX = (clientX: number) => { const r = svgRef.current!.getBoundingClientRect(); return ((clientX - r.left) * W) / r.width }

  // Line draws in left to right across the visible window (stroke-dashoffset), bars grow from zero (CSS).
  useLayoutEffect(() => {
    const p = lineRef.current
    if (!p || reducedMotion() || !p.getTotalLength) return
    const L = p.getTotalLength()
    const x0 = cx(start) - slot / 2
    let lo = 0, hi = L
    for (let j = 0; j < 24; j++) { const mid = (lo + hi) / 2; if (p.getPointAtLength(mid).x < x0) lo = mid; else hi = mid }
    p.style.strokeDasharray = `${L} ${L}`
    const a = p.animate([{ strokeDashoffset: L - lo }, { strokeDashoffset: 0 }], { duration: 650, delay: 200, easing: 'cubic-bezier(.4,0,.2,1)', fill: 'backwards' })
    a.onfinish = () => { p.style.strokeDasharray = '' }
    return () => a.cancel()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const settle = (from: number, target: number, v: number) => {
    const done = () => {
      anim.current = null
      const np = live.current.page + (target > 0 ? 1 : target < 0 ? -1 : 0)
      live.current.page = np
      setDx(0)
      if (np !== page || target !== 0) { onPage(np); haptic('settle') }
    }
    const dist = Math.abs(target - from)
    if (reducedMotion() || dist < 0.5) return done()
    // easeOutCubic starts at 3x the average speed, so pick the duration that matches the finger's speed.
    const dur = Math.max(180, Math.min(340, (3 * dist) / Math.max(Math.abs(v), 0.4)))
    const ease = (t: number) => 1 - Math.pow(1 - t, 3)
    let t0 = 0
    const step = (t: number) => {
      if (!t0) t0 = t
      const q = Math.min(1, (t - t0) / dur)
      setDx(from + (target - from) * ease(q))
      if (q < 1) anim.current!.raf = requestAnimationFrame(step)
      else done()
    }
    anim.current = { raf: requestAnimationFrame(step), finish: () => { cancelAnimationFrame(anim.current!.raf); done() } }
  }

  const scrubAt = (clientX: number, dx = 0) => {
    const { start: s, end: e } = live.current
    const i = Math.max(s, Math.min(e, Math.floor((toSvgX(clientX) - left - (tx(live.current.page) + dx)) / slot)))
    if (i !== live.current.scrub) { live.current.scrub = i; onScrub(i); haptic('select') }
  }

  const end_ = () => {
    const s = g.current
    if (!s) return
    clearTimeout(s.timer)
    g.current = null
    if (s.mode === 'scrub') onScrub(null)
    if (s.mode === 'pan') {
      const now = performance.now()
      const recent = s.samples.filter((p) => now - p.t < 100)
      const a = recent[0], b = recent[recent.length - 1]
      const v = a && b && b.t > a.t ? (b.x - a.x) / (b.t - a.t) : 0
      const proj = s.dx + v * 180
      const { page: p, maxPage: mp } = live.current
      const target = proj > plotW * 0.25 && p < mp ? plotW : proj < -plotW * 0.25 && p > 0 ? -plotW : 0
      settle(s.dx, target, v)
    }
  }

  // Stop the page from scrolling once we own the gesture (touch-action stays pan-y for normal scrolling).
  useEffect(() => {
    const el = svgRef.current!.parentElement!
    const tm = (e: TouchEvent) => { const m = g.current?.mode; if (m === 'scrub' || m === 'pan') e.preventDefault() }
    el.addEventListener('touchmove', tm, { passive: false })
    return () => el.removeEventListener('touchmove', tm)
  }, [])
  useEffect(() => () => { if (anim.current) cancelAnimationFrame(anim.current.raf) }, [])

  const handlers = {
    onPointerDown: (e: React.PointerEvent) => {
      if (g.current || (e.pointerType === 'mouse' && e.button !== 0)) return
      anim.current?.finish()
      const s: G = { id: e.pointerId, x0: e.clientX, y0: e.clientY, mode: 'pending', timer: 0, dx: 0, samples: [{ t: performance.now(), x: 0 }] }
      const cx0 = e.clientX
      s.timer = window.setTimeout(() => { if (g.current === s && s.mode === 'pending') { s.mode = 'scrub'; scrubAt(cx0) } }, HOLD_MS)
      g.current = s
      try { (e.currentTarget as Element).setPointerCapture(e.pointerId) } catch { /* ignore */ }
    },
    onPointerMove: (e: React.PointerEvent) => {
      const s = g.current
      if (!s || s.id !== e.pointerId) return
      const dxPx = e.clientX - s.x0, dyPx = e.clientY - s.y0
      if (s.mode === 'pending') {
        if (Math.abs(dxPx) > SLOP && Math.abs(dxPx) > Math.abs(dyPx)) { s.mode = 'pan'; clearTimeout(s.timer) }
        else if (Math.abs(dyPx) > SLOP) { s.mode = 'none'; clearTimeout(s.timer) }
      }
      if (s.mode === 'scrub') scrubAt(e.clientX)
      if (s.mode === 'pan') {
        const r = svgRef.current!.getBoundingClientRect()
        let dx = (dxPx * W) / r.width
        const { page: p, maxPage: mp } = live.current
        if ((dx > 0 && p >= mp) || (dx < 0 && p <= 0)) dx *= 0.3 // rubber band: nothing newer than today, nothing older than history
        dx = Math.max(-plotW, Math.min(plotW, dx))
        s.dx = dx
        s.samples.push({ t: performance.now(), x: dx })
        if (s.samples.length > 12) s.samples.shift()
        setDx(dx)
      }
    },
    onPointerUp: end_,
    onPointerCancel: end_,
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowLeft' && page < maxPage) { e.preventDefault(); settle(0, plotW, 0) }
      if (e.key === 'ArrowRight' && page > 0) { e.preventDefault(); settle(0, -plotW, 0) }
    },
  }

  const g0 = Math.abs(goal)
  const refs = g0 > 0 ? [0, g0, -g0] : [0]
  const sel = scrub != null ? days[scrub] : null
  return (
    <div {...handlers} tabIndex={0} aria-label="Balance chart. Press and hold to see a day. Swipe or use the arrow keys to change period."
      className="relative -mx-1 select-none rounded-xl outline-offset-2 [-webkit-touch-callout:none]" style={{ touchAction: 'pan-y' }} data-testid="trend-chart" data-page={page}>
      <svg ref={svgRef} viewBox={`0 0 ${W} ${height}`} className="block w-full overflow-visible" aria-hidden="true" data-testid="chart" data-scale={S}>
        <defs>
          <clipPath id="trend-clip"><rect x={left} y={0} width={plotW} height={height} /></clipPath>
          <linearGradient id="trend-fill" gradientUnits="userSpaceOnUse" x1="0" y1={top} x2="0" y2={top + plotH}>
            <stop offset=".2" stopColor="var(--color-g)" stopOpacity=".42" />
            <stop offset=".5" stopColor="var(--color-g)" stopOpacity=".06" />
            <stop offset=".5" stopColor="var(--color-over)" stopOpacity=".06" />
            <stop offset=".8" stopColor="var(--color-over)" stopOpacity=".42" />
          </linearGradient>
        </defs>
        {refs.map((r) => {
          const y = zero - r * k
          return (
            <g key={r} data-ref={r}>
              <line x1={left - 4} x2={W} y1={y} y2={y} stroke="var(--color-ink)" strokeOpacity={r === 0 ? 0.22 : 0.16} strokeWidth={r === 0 ? 1.5 : 1.25} strokeDasharray={r === 0 ? undefined : '4 4'} />
              {(r === 0 || g0 * k >= 13) && <text x={left - 8} y={y + 4} textAnchor="end" fontSize="11" fill="var(--color-mute)">{signed(r)}</text>}
            </g>
          )
        })}
        <g clipPath="url(#trend-clip)">
          <g ref={stripRef} transform={`translate(${tx(page).toFixed(2)} 0)`}>
            <path d={areaPath} fill="url(#trend-fill)" className="trend-area" />
            {days.map((d, i) => {
              const x = left + i * slot + gap / 2
              const v = d.value ?? 0
              const h = d.value == null ? 0 : Math.max(4, Math.min(Math.abs(v), S) * k)
              const surplus = v < 0
              const vis = i >= start && i <= end
              const dim = scrub != null && scrub !== i
              return (
                <g key={d.key} data-bar={d.key} data-value={d.value == null ? '' : Math.round(v)} data-kind={d.value == null ? 'empty' : surplus ? 'surplus' : 'deficit'}
                  data-clipped={d.value != null && Math.abs(v) > S ? 'yes' : 'no'} data-h={Math.round(h)} data-visible={vis ? 'yes' : 'no'}>
                  {d.value != null && (
                    <rect x={x} y={surplus ? zero : zero - h} width={bw} height={h} rx={Math.min(8, bw / 2, h / 2)}
                      fill={surplus ? 'var(--color-over)' : 'var(--color-g)'} opacity={(d.open ? 0.5 : 1) * (dim ? 0.32 : 1)}
                      className="bar-grow" style={{ transformOrigin: surplus ? 'top' : 'bottom', animationDelay: vis ? `${(i - start) * (n > 10 ? 12 : 45)}ms` : '0ms', transition: 'opacity .12s' }} />
                  )}
                  {d.value != null && Math.abs(v) > S && (
                    <g data-cap opacity={dim ? 0.32 : 1}>
                      <rect x={x - 2} y={surplus ? zero + h - 1 : zero - h - 2} width={bw + 4} height={3} rx={1.5} fill="var(--color-ink)" fillOpacity=".55" />
                      {bw >= 14 && <text x={x + bw / 2} y={surplus ? zero + h - 8 : zero - h + 16} textAnchor="middle" fontSize={bw < 30 ? 9 : 11} fontWeight="700" fill="white">{fmt(Math.abs(v))}</text>}
                    </g>
                  )}
                  {d.tick && <text x={x + bw / 2} y={height - 4} textAnchor="middle" fontSize="13" fill={scrub === i ? 'var(--color-ink)' : 'var(--color-mute)'} fontWeight={scrub === i ? 700 : 400}>{d.label}</text>}
                </g>
              )
            })}
            <path ref={lineRef} d={linePath} fill="none" stroke="var(--color-ink)" strokeOpacity=".82" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" data-testid="trend-line" />
            {sel && scrub != null && (
              <g data-testid="scrub-indicator" pointerEvents="none">
                <line x1={cx(scrub)} x2={cx(scrub)} y1={top - 6} y2={top + plotH} stroke="var(--color-ink)" strokeOpacity=".55" strokeWidth="1.25" />
                {sel.avg != null && (
                  <circle cx={cx(scrub)} cy={yOf(sel.avg)} r="6" fill="#fff" stroke={sel.avg < 0 ? 'var(--color-over)' : 'var(--color-g)'} strokeWidth="3" className="dot-pop" />
                )}
              </g>
            )}
          </g>
        </g>
      </svg>
    </div>
  )
}
