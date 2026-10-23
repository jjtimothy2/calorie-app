import { fmt } from '../lib/calc'

export type ProteinBar = { key: string; label: string; value: number | null; today?: boolean }

/** Daily protein bars against a dashed target line. Solid pink when the target is hit, light pink when not. */
export function ProteinChart({ bars, target, height = 200 }: { bars: ProteinBar[]; target: number; height?: number }) {
  const W = 350
  const labelH = 22
  const plotH = height - labelH - 10
  const max = Math.max(target * 1.15, ...bars.map((b) => b.value ?? 0), 1)
  const gap = bars.length > 10 ? 3 : 12
  const bw = (W - gap * (bars.length - 1)) / bars.length
  const every = bars.length > 10 ? 5 : 1
  const base = 10 + plotH
  const ty = base - (target / max) * plotH
  return (
    <svg viewBox={`0 0 ${W} ${height}`} className="block w-full" aria-hidden="true" data-testid="protein-chart">
      {bars.map((b, i) => {
        const x = i * (bw + gap)
        const h = b.value ? Math.max(4, (b.value / max) * plotH) : 0
        const hit = b.value != null && b.value >= target
        return (
          <g key={b.key} data-pbar={b.key} data-value={b.value == null ? '' : Math.round(b.value)} data-hit={hit ? 'yes' : 'no'}>
            {h > 0 && <rect x={x} y={base - h} width={bw} height={h} rx={Math.min(10, bw / 2)} fill="var(--color-protein)" opacity={(hit ? 1 : 0.4) * (b.today ? 0.55 : 1)} />}
            {(i % every === 0 || i === bars.length - 1) && (
              <text x={x + bw / 2} y={height - 4} textAnchor="middle" fontSize="13" fill="var(--color-mute)">{b.label}</text>
            )}
          </g>
        )
      })}
      <line x1="0" x2={W} y1={ty} y2={ty} stroke="var(--color-ink)" strokeOpacity=".45" strokeWidth="2" strokeDasharray="6 5" />
      <title>{`Daily protein. Target ${fmt(target)} g`}</title>
    </svg>
  )
}
