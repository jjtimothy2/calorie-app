// v1.8 onboarding welcome illustration (variant A from Reed's mock). Hand-drawn inline SVG, no assets, works offline.
// Palette only: cream, card, line, ink, mute, green #2F8F5B, orange #D9663F and light tints of those.
// Entrance: the ring draws in, then the food pops in with a small stagger (all done in under 1 s).
// prefers-reduced-motion: the CSS in index.css switches the animations off and everything shows in its final state.
import type { CSSProperties, ReactNode } from 'react'

const C = {
  card: '#FFFDF8', line: '#E7DFD0', track: '#EDE5D6', tile: '#F1E9DA', ink: '#2A2420', mute: '#8A7F72',
  g: '#2F8F5B', g2: '#4FA373', g3: '#86BF9C', g4: '#DDEEDF', g5: '#EEF6EF',
  o: '#D9663F', o2: '#DD7552', o3: '#EC9B7E', o4: '#F7D9CC',
}

/** Arc from startDeg to endDeg (0 = 3 o'clock, clockwise on screen). */
function arc(cx: number, cy: number, r: number, a0: number, a1: number) {
  const p = (a: number) => [cx + r * Math.cos((a * Math.PI) / 180), cy + r * Math.sin((a * Math.PI) / 180)].map((n) => n.toFixed(2)).join(' ')
  return `M ${p(a0)} A ${r} ${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${p(a1)}`
}
const at = (cx: number, cy: number, r: number, a: number) => [cx + r * Math.cos((a * Math.PI) / 180), cy + r * Math.sin((a * Math.PI) / 180)]

/** Pop-in wrapper. Kept free of a transform attribute so the CSS scale does not fight it. */
function Pop({ d, children }: { d: number; children: ReactNode }) {
  return <g className="wa-pop" style={{ animationDelay: `${d}ms` } as CSSProperties}>{children}</g>
}

function Sparkle({ x, y, s, fill, d }: { x: number; y: number; s: number; fill: string; d: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <Pop d={d}>
        <path transform={`scale(${s})`} fill={fill} d="M0 -1Q.16 -.16 1 0Q.16 .16 0 1Q-.16 .16 -1 0Q-.16 -.16 0 -1Z" />
      </Pop>
    </g>
  )
}

const GRAINS: [number, number, number][] = [
  [-14, -14, 20], [-2, -22, -30], [10, -10, 60], [-20, 0, -50], [-6, 4, 15], [8, 8, -20], [16, -2, 80], [-10, 16, 40],
  [2, -32, 10], [-26, -12, 70], [20, -18, -40], [-18, -26, 35],
]

/** Top-down plate: rice, cucumber, fried egg, sambal, greens. Drawn around (0,0), radius 100. Delays start at `t`. */
function Plate({ t = 250, step = 80 }: { t?: number; step?: number }) {
  return (
    <g>
      <circle cx={3} cy={7} r={100} fill={C.ink} opacity={0.06} />
      <circle r={100} fill={C.card} stroke={C.line} strokeWidth={2} />
      <circle r={82} fill="none" stroke={C.track} strokeWidth={1.5} />
      {/* rice */}
      <g transform="translate(-24 -26)">
        <Pop d={t}>
          <circle r={37} fill="#F7F0E3" stroke={C.line} strokeWidth={1.5} />
          <circle cx={-6} cy={-7} r={24} fill={C.card} opacity={0.8} />
          {GRAINS.map(([x, y, r], i) => <rect key={i} x={x - 3.2} y={y - 1.4} width={6.4} height={2.8} rx={1.4} fill="#E2D5BF" transform={`rotate(${r} ${x} ${y})`} />)}
        </Pop>
      </g>
      {/* cucumber */}
      <g transform="translate(40 -36)">
        <Pop d={t + step}>
          {[[-8, -8], [12, 8]].map(([x, y], i) => (
            <g key={i}>
              <circle cx={x} cy={y} r={13} fill={C.g4} stroke={C.g2} strokeWidth={3} />
              <circle cx={x} cy={y} r={6.5} fill={C.g5} />
              {[0, 120, 240].map((a) => { const [sx, sy] = at(x, y, 3.4, a + 30 * i); return <circle key={a} cx={sx} cy={sy} r={1.2} fill={C.g3} /> })}
            </g>
          ))}
        </Pop>
      </g>
      {/* fried egg */}
      <g transform="translate(36 26)">
        <Pop d={t + step * 2}>
          <path d="M0 -34C22 -37 39 -20 36 0C40 19 23 37 2 34C-21 38 -38 21 -34 1C-38 -19 -22 -32 0 -34Z" fill="#FFFFFF" stroke={C.line} strokeWidth={1.5} />
          <circle cx={-2} cy={-3} r={13} fill={C.o2} />
          <ellipse cx={-6} cy={-8} rx={4} ry={2.6} fill={C.o4} transform="rotate(-30 -6 -8)" />
        </Pop>
      </g>
      {/* sambal in a little dish */}
      <g transform="translate(-4 60)">
        <Pop d={t + step * 3}>
          <circle r={14} fill={C.card} stroke={C.line} strokeWidth={1.5} />
          <path d="M0 -9C6 -9 9.5 -4 9 1C9.5 6 5 9.5 -1 9C-7 9.5 -9.5 5 -9 0C-9.5 -5 -5.5 -9 0 -9Z" fill={C.o} />
          <circle cx={-3} cy={-3.4} r={2.1} fill={C.o3} />
          <circle cx={3.2} cy={2.6} r={1} fill={C.o4} />
        </Pop>
      </g>
      {/* greens */}
      <g transform="translate(-48 30)">
        <Pop d={t + step * 4}>
          {[[200, C.g3, 0, 4], [160, C.g, -4, -2], [125, C.g2, 2, 2]].map(([rot, fill, x, y], i) => (
            <g key={i} transform={`translate(${x} ${y}) rotate(${rot})`}>
              <path d="M0 0C10 -13 29 -15 40 -4C30 8 11 10 0 0Z" fill={fill as string} />
              <path d="M3 -1Q20 -5 35 -4" fill="none" stroke={C.card} strokeOpacity={0.55} strokeWidth={1.4} strokeLinecap="round" />
            </g>
          ))}
        </Pop>
      </g>
    </g>
  )
}

/** The plate sits inside a soft progress ring, partly filled green. */
function PlateRing() {
  const cx = 160, cy = 152, r = 128, pct = 0.7, a1 = -90 + 360 * pct
  const [kx, ky] = at(cx, cy, r, a1)
  return (
    <>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={C.track} strokeWidth={11} />
      <path className="wa-draw" d={arc(cx, cy, r, -90, a1)} pathLength={1} fill="none" stroke={C.g} strokeWidth={11} strokeLinecap="round" />
      <g transform={`translate(${kx} ${ky})`}><Pop d={720}><circle r={3} fill={C.card} /></Pop></g>
      <g transform={`translate(${cx} ${cy})`}><Plate /></g>
      <Sparkle x={279} y={38} s={15} fill={C.o} d={700} />
      <Sparkle x={302} y={70} s={7} fill={C.g} d={780} />
    </>
  )
}

export function WelcomeArt({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 320 300" className={`welcome-art ${className}`} aria-hidden="true" focusable="false" data-testid="welcome-art">
      <PlateRing />
    </svg>
  )
}
