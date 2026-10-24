import { balanceScale, fmt } from '../lib/calc'

export type BalanceBar = { key: string; label: string; value: number | null; open?: boolean }

const signed = (n: number) => (n > 0 ? `+${fmt(n)}` : n < 0 ? `−${fmt(-n)}` : '0')

/**
 * Bars up from zero for deficit (green), down for surplus (orange), on a symmetric scale (see balanceScale).
 * Faint reference lines at 0 and +/- the daily goal, labelled at the left edge. Bars past the scale are clipped
 * with a cap mark and their value. Open days are faded.
 */
export function BalanceChart({ bars, goal, height = 220 }: { bars: BalanceBar[]; goal: number; height?: number }) {
  const W = 350
  const left = 40 // label gutter
  const labelH = 22
  const top = 8
  const plotH = height - labelH - top - 6
  const half = plotH / 2
  const zero = top + half
  const vals = bars.flatMap((b) => (b.value == null ? [] : [b.value]))
  // An open day starts at the full burn (BMR + movement, or BMR) and shrinks as food is logged, so it would inflate the scale
  // every morning. Scale from closed days when there are any; an open bar past the scale is clipped like a spike.
  const closed = bars.flatMap((b) => (b.value == null || b.open ? [] : [b.value]))
  const S = balanceScale(closed.length ? closed : vals, goal)
  const k = half / S
  const gap = bars.length > 10 ? 3 : 10
  const bw = (W - left - gap * (bars.length - 1)) / bars.length
  const every = bars.length > 10 ? 5 : 1
  const g = Math.abs(goal)
  const refs = g > 0 ? [0, g, -g] : [0]
  return (
    <svg viewBox={`0 0 ${W} ${height}`} className="block w-full" aria-hidden="true" data-testid="chart" data-scale={S}>
      {refs.map((r) => {
        const y = zero - r * k
        return (
          <g key={r} data-ref={r}>
            <line x1={left - 4} x2={W} y1={y} y2={y} stroke="var(--color-ink)" strokeOpacity={r === 0 ? 0.22 : 0.16} strokeWidth={r === 0 ? 1.5 : 1.25} strokeDasharray={r === 0 ? undefined : '4 4'} />
            {(r === 0 || g * k >= 13) && (
              <text x={left - 8} y={y + 4} textAnchor="end" fontSize="11" fill="var(--color-mute)">{signed(r)}</text>
            )}
          </g>
        )
      })}
      {bars.map((b, i) => {
        const x = left + i * (bw + gap)
        const v = b.value ?? 0
        const clipped = b.value != null && Math.abs(v) > S
        const h = b.value == null ? 0 : Math.max(4, Math.min(Math.abs(v), S) * k)
        const surplus = v < 0
        const y = surplus ? zero : zero - h
        const tip = surplus ? zero + h : zero - h // outer end of the bar
        return (
          <g key={b.key} data-bar={b.key} data-value={b.value == null ? '' : Math.round(v)} data-kind={b.value == null ? 'empty' : surplus ? 'surplus' : 'deficit'} data-clipped={clipped ? 'yes' : 'no'} data-h={Math.round(h)}>
            {b.value != null && (
              <rect x={x} y={y} width={bw} height={h} rx={clipped ? 3 : Math.min(8, bw / 2, h / 2)} fill={surplus ? 'var(--color-over)' : 'var(--color-g)'} opacity={b.open ? 0.5 : 1} />
            )}
            {clipped && (
              <g data-cap>
                {/* break mark: a white zigzag across the bar, then a dark cap at the edge */}
                <path d={`M${x - 1} ${tip + (surplus ? -12 : 12)} l${bw / 4} -4 l${bw / 4} 4 l${bw / 4} -4 l${bw / 4 + 2} 4`} stroke="var(--color-card)" strokeWidth="3" fill="none" />
                <rect x={x - 2} y={surplus ? tip - 1 : tip - 2} width={bw + 4} height={3} rx={1.5} fill="var(--color-ink)" fillOpacity=".55" />
                <text x={x + bw / 2} y={surplus ? tip - 18 : tip + 28} textAnchor="middle" fontSize={bw < 30 ? 9 : 11} fontWeight="700" fill="white">{fmt(Math.abs(v))}</text>
              </g>
            )}
            {(i % every === 0 || i === bars.length - 1) && (
              <text x={x + bw / 2} y={height - 4} textAnchor="middle" fontSize="13" fill="var(--color-mute)">{b.label}</text>
            )}
          </g>
        )
      })}
      <title>{`Daily balance. Scale ±${fmt(S)} kcal. Goal ${fmt(goal)} kcal`}</title>
    </svg>
  )
}
