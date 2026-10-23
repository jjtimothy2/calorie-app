import { fmt } from '../lib/calc'

export type BalanceBar = { key: string; label: string; value: number | null; open?: boolean }

/** Bars up from a zero line for deficit (green), down for surplus (orange). Open days are faded. */
export function BalanceChart({ bars, goal, height = 200 }: { bars: BalanceBar[]; goal: number; height?: number }) {
  const W = 350
  const labelH = 22
  const plotH = height - labelH - 8
  const vals = bars.map((b) => b.value ?? 0)
  const up = Math.max(goal > 0 ? goal : 0, ...vals, 1)
  const down = Math.max(goal < 0 ? -goal : 0, ...vals.map((v) => -v), 0)
  // Give the surplus side at least a third of the space so small surpluses stay visible.
  const span = up + Math.max(down, up / 3)
  const zero = 8 + (up / span) * plotH
  const scale = plotH / span
  const gap = bars.length > 10 ? 3 : 12
  const bw = (W - gap * (bars.length - 1)) / bars.length
  const every = bars.length > 10 ? 5 : 1
  return (
    <svg viewBox={`0 0 ${W} ${height}`} className="block w-full" aria-hidden="true" data-testid="chart">
      <line x1="0" x2={W} y1={zero} y2={zero} stroke="var(--color-line)" strokeWidth="2" />
      {bars.map((b, i) => {
        const x = i * (bw + gap)
        const v = b.value ?? 0
        const h = b.value == null ? 0 : Math.max(4, Math.abs(v) * scale)
        const surplus = v < 0
        return (
          <g key={b.key} data-bar={b.key} data-value={b.value == null ? '' : Math.round(v)} data-kind={b.value == null ? 'empty' : surplus ? 'surplus' : 'deficit'}>
            {b.value != null && (
              <rect x={x} y={surplus ? zero : zero - h} width={bw} height={h} rx={Math.min(10, bw / 2, h / 2)} fill={surplus ? 'var(--color-over)' : 'var(--color-g)'} opacity={b.open ? 0.5 : 1} />
            )}
            {(i % every === 0 || i === bars.length - 1) && (
              <text x={x + bw / 2} y={height - 4} textAnchor="middle" fontSize="13" fill="var(--color-mute)">{b.label}</text>
            )}
          </g>
        )
      })}
      {goal !== 0 && (
        <line x1="0" x2={W} y1={zero - goal * scale} y2={zero - goal * scale} stroke="var(--color-ink)" strokeOpacity=".35" strokeWidth="2" strokeDasharray="6 5" />
      )}
      <title>{`Daily balance. Goal ${fmt(goal)} kcal`}</title>
    </svg>
  )
}
