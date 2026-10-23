import { Link } from 'react-router-dom'
import { fmt } from '../lib/calc'
import type { Macros } from '../lib/types'

/** Home card: protein left today, with a small carbs and fat line. Opens Nutrition. */
export function ProteinCard({ totals, targets }: { totals: Macros; targets: { protein: number; carbs: number; fat: number } }) {
  const p = Math.round(totals.protein)
  const left = targets.protein - p
  const pct = targets.protein ? Math.min(100, (p / targets.protein) * 100) : 0
  return (
    <Link
      to="/nutrition"
      className="block rounded-[20px] border-2 border-protein-line bg-card p-4"
      data-testid="protein-card"
      aria-label={`Protein: ${left > 0 ? `${fmt(left)} g left today` : 'target hit'}, ${fmt(p)} of ${fmt(targets.protein)} g. Carbs ${fmt(totals.carbs)} of ${fmt(targets.carbs)} g, fat ${fmt(totals.fat)} of ${fmt(targets.fat)} g. Open Nutrition.`}
    >
      <div className="flex items-start justify-between">
        <div>
          <div className="text-[13px] text-mute">Protein left today</div>
          <div className="text-[30px] font-extrabold leading-tight tracking-tight text-protein-ink" data-testid="protein-left">
            {left > 0 ? `${fmt(left)} g left` : left === 0 ? 'Target hit' : `Hit, +${fmt(-left)} g`}
          </div>
        </div>
        <span className="pt-1 text-[15px] font-bold text-g-ink" aria-hidden="true">View ›</span>
      </div>
      <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-line" aria-hidden="true">
        <i className="block h-full rounded-full bg-protein" style={{ width: `${pct}%` }} />
      </div>
      <div className="mt-2 flex gap-4 text-[13px] text-mute" data-testid="protein-sub" aria-hidden="true">
        <span>Carbs {fmt(totals.carbs)} / {fmt(targets.carbs)} g</span>
        <span>Fat {fmt(totals.fat)} / {fmt(targets.fat)} g</span>
      </div>
    </Link>
  )
}
