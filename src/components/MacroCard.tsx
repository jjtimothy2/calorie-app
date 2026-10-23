import { macroTargets, fmt } from '../lib/calc'
import type { Macros } from '../lib/types'
import { Card } from './ui'

export function MacroCard({ totals, target }: { totals: Macros; target: number }) {
  const t = macroTargets(target)
  const items = [
    { k: 'protein' as const, label: 'Protein', color: 'var(--color-protein)' },
    { k: 'carbs' as const, label: 'Carbs', color: 'var(--color-carbs)' },
    { k: 'fat' as const, label: 'Fat', color: 'var(--color-fat)' },
  ]
  return (
    <Card className="grid grid-cols-3 gap-2.5">
      {items.map(({ k, label, color }) => {
        const v = totals[k]
        const pct = Math.min(100, (v / t[k]) * 100)
        return (
          <div key={k} data-testid={`macro-${k}`}>
            <small className="text-[13px] text-mute">{label}</small>
            <b className="mb-1.5 mt-0.5 block text-[15px]">
              {fmt(v)} / {t[k]}g
            </b>
            <div
              className="h-2 overflow-hidden rounded-full bg-line"
              role="progressbar"
              aria-label={`${label} ${fmt(v)} of ${t[k]} grams`}
              aria-valuemin={0}
              aria-valuemax={t[k]}
              aria-valuenow={Math.round(v)}
            >
              <i className="block h-full" style={{ width: `${pct}%`, background: color }} />
            </div>
          </div>
        )
      })}
    </Card>
  )
}
