import { fmt } from '../lib/calc'

export type Bar = { key: string; label: string; value: number; partial?: boolean }

/** Hand-rolled SVG bar chart with dashed target line. Orange = over target. */
export function BarChart({ bars, target, height = 200 }: { bars: Bar[]; target: number; height?: number }) {
  const W = 350
  const labelH = 22
  const plotH = height - labelH - 8
  const max = Math.max(target * 1.2, ...bars.map((b) => b.value)) || 1
  const gap = bars.length > 10 ? 3 : 12
  const bw = (W - gap * (bars.length - 1)) / bars.length
  const y = (v: number) => 8 + plotH - (v / max) * plotH
  const every = bars.length > 10 ? 5 : 1
  return (
    <svg viewBox={`0 0 ${W} ${height}`} className="block w-full" aria-hidden="true" data-testid="chart">
      {bars.map((b, i) => {
        const x = i * (bw + gap)
        const h = Math.max(b.value > 0 ? 4 : 0, (b.value / max) * plotH)
        const over = b.value > target
        return (
          <g key={b.key} data-bar={b.key} data-value={Math.round(b.value)}>
            <rect x={x} y={8 + plotH - h} width={bw} height={h} rx={Math.min(10, bw / 2)} fill={over ? 'var(--color-over)' : 'var(--color-g)'} opacity={b.partial ? 0.5 : 1} />
            {(i % every === 0 || i === bars.length - 1) && (
              <text x={x + bw / 2} y={height - 4} textAnchor="middle" fontSize="13" fill="var(--color-mute)">{b.label}</text>
            )}
          </g>
        )
      })}
      <line x1="0" x2={W} y1={y(target)} y2={y(target)} stroke="var(--color-ink)" strokeOpacity=".35" strokeWidth="2" strokeDasharray="6 5" />
      <title>{`Daily calories vs ${fmt(target)} target`}</title>
    </svg>
  )
}
