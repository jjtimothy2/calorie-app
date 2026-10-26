// v1.4: History balance chart with a 7-day average line, press-and-hold scrubbing and
// swipe paging, modelled on Apple Health's weight chart. Bars keep the v1.3 design.
// v1.4.2: the same chart draws Protein (variant="protein"): pink bars from zero, solid when the target is hit.
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { fmt } from '../lib/calc'
import { haptic } from '../lib/haptics'
import { barLabel, monotonePath, proteinTrendScale, runs, trendScale } from '../lib/trend'
import { reducedMotion } from './motion'

export type TrendDay = { key: string; label: string; tick: boolean; value: number | null; open?: boolean; avg: number | null; hit?: boolean }

// Rough bold-digit width (Inter-like): digits ~0.6em, commas and dots ~0.3em.
const textW = (t: string, fs: number) => [...t].reduce((w, c) => w + (/[,.]/.test(c) ? 0.3 : 0.6), 0) * fs
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
export function BalanceTrendChart({ days, n, goal, page, onPage, scrub, onScrub, height = 232, variant = 'balance' }: {
  days: TrendDay[]; n: number; goal: number; page: number; onPage: (p: number) => void
  scrub: number | null; onScrub: (i: number | null) => void; height?: number
  /** balance: goal is the daily balance goal. protein: goal is the protein target in grams. */
  variant?: 'balance' | 'protein'
}) {
  const isP = variant === 'protein'
  const W = 350, left = 48, labelH = 22, top = 10
  const plotW = W - left
  const plotH = height - labelH - top - 6
  const N = days.length
  const slot = plotW / n
  const gap = n > 10 ? 3 : 9 // v1.4.2: 9 (was 10) keeps 7-day bars as wide as before with the wider goal-label gutter
  const bw = slot - gap
  const maxPage = Math.max(0, N / n - 1)
  const tx = (p: number) => -(N - n * (p + 1)) * slot
  const start = N - n * (page + 1), end = start + n - 1

  // v1.4.1: one fixed, lopsided scale for the whole history (never jumps while paging, never cuts off a closed day).
  // Room is kept above and below for value labels that sit outside short bars.
  const compact = n > 10
  // Protein: every day counts (bars only go up, so today can never be clipped either).
  const closedVals = days.flatMap((d) => (d.value == null || d.open ? [] : [d.value]))
  const { top: sTop, bottom: sBot } = isP ? proteinTrendScale(days.flatMap((d) => (d.value == null ? [] : [d.value])), goal) : trendScale(closedVals, goal)
  const S = sTop
  const padT = compact ? 26 : 18, padB = sBot > 0 ? (compact ? 26 : 18) : isP ? 2 : compact ? 22 : 16
  const k = (plotH - padT - padB) / (sTop + sBot)
  const zero = top + padT + sTop * k
  const plotBottom = top + plotH
  const yOf = (v: number) => zero - v * k // unclamped: the 7-day average of closed days always fits the scale
  const zf = (zero - top) / plotH
  const cx = (i: number) => left + i * slot + slot / 2

  const linePath = useMemo(() => runs(days.map((d, i) => (d.avg == null ? null : ([cx(i), yOf(d.avg)] as [number, number]))))
    .map((r) => monotonePath(r)).join(''), [days, n, S]) // eslint-disable-line react-hooks/exhaustive-deps
  const areaPath = useMemo(() => runs(days.map((d, i) => (d.avg == null ? null : ([cx(i), yOf(d.avg)] as [number, number]))))
    .map((r) => `${monotonePath(r)}L${r[r.length - 1][0].toFixed(2)},${zero}L${r[0][0].toFixed(2)},${zero}Z`).join(''), [days, n, S]) // eslint-disable-line react-hooks/exhaustive-deps

  const geom = (d: TrendDay, i: number) => {
    const x = left + i * slot + gap / 2
    const v = d.value ?? 0
    const surplus = v < 0
    const room = surplus ? plotBottom - zero : zero - top // today's open bar may pass the scale: it runs to the plot edge
    const h = d.value == null ? 0 : Math.max(4, Math.min(Math.abs(v) * k, room))
    const over = d.value != null && Math.abs(v) * k > room
    const vis = i >= start && i <= end
    const dim = scrub != null && scrub !== i
    const label = d.value != null && Math.round(v) !== 0 ? barLabel(v, compact) : null
    // Label inside the bar when it fits, otherwise just above a deficit bar or just below a surplus bar.
    const fs = compact ? 8.5 : 11
    const need = compact ? label ? label.length * fs * 0.62 + 8 : 0 : 22
    const inside = label != null && h >= need && (compact || bw >= textW(label, fs) + 4)
    const lx = x + bw / 2
    const barEnd = surplus ? zero + h : zero - h
    let ly: number
    if (compact) ly = inside ? (surplus ? barEnd - 4 : barEnd + 4) : (surplus ? barEnd + 3 : barEnd - 3) // rotated -90, reads bottom to top
    else ly = inside ? (surplus ? barEnd - 7 : barEnd + 16) : (surplus ? barEnd + 14 : barEnd - 5)
    if (!inside && surplus) ly = Math.min(ly, plotBottom + (compact ? 3 : 9)) // never into the day ticks
    if (!inside && !surplus && !compact) ly = Math.max(ly, 11) // never above the chart
    return { x, v, surplus, h, over, vis, dim, label, fs, inside, lx, ly }
  }

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

  // v1.4.2: the solid 0 line plus one dashed line: the balance goal ('goal 337') or the protein target ('147 g').
  const refs = goal !== 0 ? [0, goal] : [0]
  const refLabel = (r: number) => (r === 0 ? '0' : isP ? `${fmt(r)} g` : `goal ${fmt(Math.abs(r))}`)
  const gapPx = Math.abs(goal) * k
  const tight = gapPx < 12 // keep '0' and the goal label apart when the lines are close
  const sel = scrub != null ? days[scrub] : null
  return (
    <div {...handlers} tabIndex={0} aria-label={`${isP ? 'Protein' : 'Balance'} chart. Press and hold to see a day. Swipe or use the arrow keys to change period.`}
      className="relative -mx-1 select-none rounded-xl outline-offset-2 [-webkit-touch-callout:none]" style={{ touchAction: 'pan-y' }} data-testid="trend-chart" data-variant={variant} data-page={page}>
      <svg ref={svgRef} viewBox={`0 0 ${W} ${height}`} className="block w-full overflow-visible" aria-hidden="true" data-testid={isP ? 'protein-chart' : 'chart'} data-scale={S} data-top={sTop} data-bottom={sBot}
        data-zero={zero.toFixed(2)} data-k={k.toFixed(6)} data-plot-top={top} data-plot-bottom={plotBottom}>
        <defs>
          <clipPath id={`trend-clip-${variant}`}><rect x={left} y={0} width={plotW} height={height} /></clipPath>
          <linearGradient id={`trend-fill-${variant}`} gradientUnits="userSpaceOnUse" x1="0" y1={top} x2="0" y2={top + plotH}>
            {isP ? <>
              <stop offset={(zf * 0.3).toFixed(3)} stopColor="var(--color-protein)" stopOpacity=".34" />
              <stop offset={zf.toFixed(3)} stopColor="var(--color-protein)" stopOpacity=".05" />
            </> : <>
            <stop offset={(zf * 0.35).toFixed(3)} stopColor="var(--color-g)" stopOpacity=".42" />
            <stop offset={zf.toFixed(3)} stopColor="var(--color-g)" stopOpacity=".06" />
            <stop offset={zf.toFixed(3)} stopColor="var(--color-over)" stopOpacity=".06" />
            <stop offset={(zf + (1 - zf) * 0.65).toFixed(3)} stopColor="var(--color-over)" stopOpacity=".42" />
            </>}
          </linearGradient>
        </defs>
        {refs.map((r) => {
          const y = zero - r * k
          return (
            <g key={r} data-ref={r} data-ref-label={refLabel(r)}>
              <line x1={left - 4} x2={W} y1={y} y2={y} stroke="var(--color-ink)" strokeOpacity={r === 0 ? 0.22 : 0.16} strokeWidth={r === 0 ? 1.5 : 1.25} strokeDasharray={r === 0 ? undefined : '4 4'} />
              <text x={left - 7} y={r === 0 ? y + (tight ? (goal > 0 ? 9 : -3) : 4) : tight ? y + (goal > 0 ? -1 : 8) : y + 3.5} textAnchor="end"
                fontSize={r === 0 ? 11 : refLabel(r).length > 8 ? 9 : 10} fontWeight={r === 0 ? 400 : 600} fill="var(--color-mute)">{refLabel(r)}</text>
            </g>
          )
        })}
        <g clipPath={`url(#trend-clip-${variant})`}>
          <g ref={stripRef} transform={`translate(${tx(page).toFixed(2)} 0)`}>
            <path d={areaPath} fill={`url(#trend-fill-${variant})`} className="trend-area" />
            {days.map((d, i) => {
              const { x, v, surplus, h, over, vis, dim } = geom(d, i)
              return (
                <g key={d.key} data-bar={d.key} data-value={d.value == null ? '' : Math.round(v)} data-kind={d.value == null ? 'empty' : surplus ? 'surplus' : 'deficit'}
                  data-clipped="no" data-over={over ? 'yes' : 'no'} data-h={Math.round(h)} data-hx={h.toFixed(2)} data-y0={(surplus ? zero : zero - h).toFixed(2)} data-y1={(surplus ? zero + h : zero).toFixed(2)}
                  data-open={d.open ? 'yes' : 'no'} data-visible={vis ? 'yes' : 'no'} data-pbar={isP ? d.key : undefined} data-hit={isP ? (d.hit ? 'yes' : 'no') : undefined}>
                  {d.value != null && (
                    <rect x={x} y={surplus ? zero : zero - h} width={bw} height={h} rx={Math.min(8, bw / 2, h / 2)}
                      fill={isP ? 'var(--color-protein)' : surplus ? 'var(--color-over)' : 'var(--color-g)'} opacity={(d.open ? 0.5 : 1) * (isP && !d.hit ? 0.4 : 1) * (dim ? 0.32 : 1)}
                      className="bar-grow" style={{ transformOrigin: surplus ? 'top' : 'bottom', animationDelay: vis ? `${(i - start) * (n > 10 ? 12 : 45)}ms` : '0ms', transition: 'opacity .12s' }} />
                  )}
                  {d.tick && <text x={x + bw / 2} y={height - 4} textAnchor="middle" fontSize="13" fill={scrub === i ? 'var(--color-ink)' : 'var(--color-mute)'} fontWeight={scrub === i ? 700 : 400}>{d.label}</text>}
                </g>
              )
            })}
            <path ref={lineRef} d={linePath} fill="none" stroke="var(--color-ink)" strokeOpacity=".82" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" data-testid="trend-line" />
            <g data-testid="bar-labels" pointerEvents="none">
              {days.map((d, i) => {
                const { surplus, vis, dim, label, fs, inside, lx, ly } = geom(d, i)
                if (label == null) return null
                const anchor = compact ? (inside !== surplus ? 'end' : 'start') : 'middle'
                return (
                  <text key={d.key} data-label-for={d.key} data-label={inside ? 'inside' : 'outside'} x={lx} y={ly} fontSize={fs} fontWeight="700" className="bar-label"
                    fill={inside ? (d.open || (isP && !d.hit) ? (isP ? 'var(--color-protein-deep)' : surplus ? 'var(--color-over-ink)' : 'var(--color-g-ink)') : 'white') : 'var(--color-ink)'} fillOpacity={dim ? 0.32 : inside ? 1 : 0.8}
                    stroke={inside ? undefined : 'var(--color-card)'} strokeWidth={inside ? undefined : 3} strokeOpacity={dim ? 0.32 : 1} paintOrder="stroke" strokeLinejoin="round"
                    textAnchor={anchor} dominantBaseline={compact ? 'central' : undefined} transform={compact ? `rotate(-90 ${lx} ${ly})` : undefined}
                    style={{ animationDelay: vis ? `${(i - start) * (n > 10 ? 12 : 45) + 300}ms` : '0ms', transition: 'fill-opacity .12s' }}>{label}</text>
                )
              })}
            </g>
            {sel && scrub != null && (
              <g data-testid="scrub-indicator" pointerEvents="none">
                <line x1={cx(scrub)} x2={cx(scrub)} y1={top - 6} y2={top + plotH} stroke="var(--color-ink)" strokeOpacity=".55" strokeWidth="1.25" />
                {sel.avg != null && (
                  <circle cx={cx(scrub)} cy={yOf(sel.avg)} r="6" fill="#fff" stroke={isP ? 'var(--color-protein)' : sel.avg < 0 ? 'var(--color-over)' : 'var(--color-g)'} strokeWidth="3" className="dot-pop" />
                )}
              </g>
            )}
          </g>
        </g>
      </svg>
    </div>
  )
}
