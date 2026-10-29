import { fmt, GAIN_BAND, gaugeRead, KEEP_BAND, type GaugeZone } from '../lib/calc'
import { Ticker } from './motion'

/**
 * v1.16 Home speedometer (Reed's spec). Net = eaten - burn, where burn = the day's base (BMR + movement, or BMR alone
 * when movement is off) plus exercise. The arc is painted with fixed zones and only the rider moves. Eating 0 puts the
 * rider exactly on the left end (minus the burn), so it never goes further left. Exercise pushes the left end further
 * out and the arc rescales, so the goal line moves and "left to eat" grows by the same amount. The right end sits 500
 * kcal past the goal (or at +500 when the goal is a deficit or even). Past it the rider pins at the end and the end
 * label turns red with a chevron, while the big number keeps the real figure.
 *
 * Zones per plan (one language: track = still to eat, green = end the day here, red = surplus or over):
 * - Lose: green from the left end to the goal line, light orange from the goal to 0, red from 0 to the end.
 * - Keep: track up to -100, green within 100 of even, red past it.
 * - Gain: track up to the goal, green from the goal to goal + 200, red past it.
 * The copy comes from gaugeRead, the same reading the equation card, After this line and verdict use.
 * A closed day passes its frozen numbers, so the gauge shows the day's final net.
 */
const W = 340, R = 116, SW = 18, CX = W / 2
const TOP = 32, CY = TOP + R, END_Y = CY + 32, H = CY + 54
const END_PAST_GOAL = 500
const C = { green: '#2f8f5b', light: '#eaa58b', deep: '#b3362a', track: '#c9bca5' }
export const ZONE_INK: Record<GaugeZone, string> = { green: 'var(--color-g-ink)', light: 'var(--color-over-ink)', red: 'var(--color-deep-ink)', track: 'var(--color-ink)' }

const signed = (n: number) => (Math.round(n) < 0 ? `−${fmt(-n)}` : Math.round(n) > 0 ? `+${fmt(n)}` : '0')
const pt = (f: number, r = R) => {
  const a = Math.PI * (1 - f)
  return [CX + r * Math.cos(a), CY - r * Math.sin(a)] as const
}
const arc = (f1: number, f2: number) => {
  const [x1, y1] = pt(f1), [x2, y2] = pt(f2)
  return `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${R} ${R} 0 0 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`
}

export function BalanceGauge({ balance, burned, eaten, goal, closed = false }: { balance: number; burned: number; eaten: number; goal: number; closed?: boolean }) {
  // balance = base + exercise - eaten, so the full burn (left end) is balance + eaten.
  const burn = Math.round(balance + eaten)
  const net = Math.round(eaten) - burn
  const read = gaugeRead(balance, goal, closed)
  const { plan } = read
  const goalNet = -Math.round(goal)
  const lo = -burn
  const hi = Math.max(END_PAST_GOAL, goalNet + END_PAST_GOAL)
  const f = (v: number) => (hi === lo ? 0 : Math.max(0, Math.min(1, (v - lo) / (hi - lo))))
  const fv = f(net), fg = f(goalNet), f0 = f(0)
  const pinned = net > hi

  const zones: [number, number, string][] =
    plan === 'keep' ? [[lo, -KEEP_BAND, C.track], [-KEEP_BAND, KEEP_BAND, C.green], [KEEP_BAND, hi, C.deep]]
      : plan === 'gain' ? [[lo, goalNet, C.track], [goalNet, goalNet + GAIN_BAND, C.green], [goalNet + GAIN_BAND, hi, C.deep]]
        : [[lo, goalNet, C.green], [goalNet, 0, C.light], [0, hi, C.deep]]

  // Labels outside the arc.
  const lr = R + SW / 2 + 12
  const anchor = (fr: number) => (fr < 0.42 ? 'end' : fr > 0.58 ? 'start' : 'middle')
  const [gx1, gy1] = pt(fg, R - SW / 2 - 4), [gx2, gy2] = pt(fg, R + SW / 2 + 5)
  const [glx, gly] = pt(fg, lr)
  const [zlx, zly] = pt(f0, lr - 3)
  const goalText = plan === 'keep' ? 'Goal even' : `Goal ${signed(goalNet)}`
  const showZero = plan !== 'keep' && Math.abs(f0 - fg) > 0.06
  const [d1x, d1y] = pt(f0, R - SW / 2), [d2x, d2y] = pt(f0, R + SW / 2)

  // Rider: a group rotated about the centre with the dot at the top, so it travels along the arc when it moves.
  const deg = -90 + fv * 180
  const nY = CY - 32
  const ink = ZONE_INK[read.zone]
  const said = read.big == null ? `On target. ${read.label}` : `${fmt(read.big)} ${read.label}`
  return (
    <div className="relative mx-auto w-full" style={{ maxWidth: W }} data-testid="ring" data-state={read.state} data-zone={read.zone} data-pinned={pinned} data-plan={plan} data-net={net} data-lo={lo} data-hi={hi}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" aria-hidden="true" className="block overflow-visible" data-testid="gauge">
        {zones.map(([a, b, col], i) => (f(b) > f(a) ? <path key={i} d={arc(f(a), f(b))} fill="none" stroke={col} strokeWidth={SW} data-zone-color={col} /> : null))}
        {showZero && <line x1={d1x} y1={d1y} x2={d2x} y2={d2y} stroke="var(--color-bg)" strokeWidth={2} />}
        <line x1={gx1} y1={gy1} x2={gx2} y2={gy2} stroke="var(--color-ink)" strokeWidth={3} strokeLinecap="round" />
        <text x={glx} y={gly} textAnchor={anchor(fg)} className="num" fontSize={13} fill="var(--color-ink)" data-testid="gauge-goal">{goalText}</text>
        {showZero && <text x={zlx} y={zly} textAnchor={anchor(f0)} fontSize={12} fill="var(--color-mute)" data-testid="gauge-zero">0</text>}
        <text x={CX - R} y={END_Y} textAnchor="middle" className="num" fontSize={17} fill="var(--color-ink)" data-testid="gauge-burn">{signed(lo)}</text>
        <text x={CX - R} y={END_Y + 16} textAnchor="middle" fontSize={12} fill="var(--color-mute)" data-testid="gauge-burn-label">{burned > 0 ? 'burn + exercise' : 'burn'}</text>
        <text x={CX + R} y={END_Y} textAnchor="middle" className="num" fontSize={17} fontWeight={pinned ? 800 : 600} fill={pinned ? C.deep : 'var(--color-mute)'} data-testid="gauge-end">{pinned ? `${fmt(hi)}+` : signed(hi)}</text>
        {pinned && <path d={`M ${CX + R + SW / 2 + 5} ${CY - 7} l 7 7 l -7 7`} fill="none" stroke={C.deep} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" data-testid="gauge-overflow" />}
        <text x={CX + R} y={END_Y + 16} textAnchor="middle" fontSize={12} fill={pinned ? C.deep : 'var(--color-mute)'} data-testid="gauge-end-label">{pinned ? 'off the scale' : 'surplus'}</text>
        <g data-testid="gauge-needle" data-deg={deg.toFixed(1)} data-f={fv.toFixed(4)} className="gauge-rider" style={{ transform: `rotate(${deg.toFixed(2)}deg)`, transformOrigin: `${CX}px ${CY}px` }}>
          <circle cx={CX} cy={CY - R} r={13} fill="var(--color-ink)" stroke="var(--color-card)" strokeWidth={4} />
        </g>
        <text x={CX} y={read.big == null ? nY - 4 : nY} textAnchor="middle" className="num" fontSize={read.big == null ? 34 : 46} fill={ink} data-testid="balance">
          {read.big == null ? 'On target' : <Ticker value={read.big} format={(n) => fmt(Math.round(n))} id="gauge" />}
        </text>
        <text x={CX} y={nY + 21} textAnchor="middle" fontSize={15} fontWeight={600} fill="var(--color-ink)" data-testid="balance-label">{read.label}</text>
        <text x={CX} y={nY + 40} textAnchor="middle" fontSize={13} fill="var(--color-mute)" data-testid="ring-goal">{read.sub}</text>
      </svg>
      <span className="sr-only">{`${said}. ${read.sub}. Scale from ${signed(lo)} to ${signed(hi)}${pinned ? ', off the scale' : ''}.`}</span>
    </div>
  )
}
