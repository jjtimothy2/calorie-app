import { Link } from 'react-router-dom'
import { fmt, overBy } from '../lib/calc'
import type { Macros } from '../lib/types'

/** Home card: protein left today, with a small carbs and fat line. Opens Nutrition. */
export function ProteinCard({ totals, targets }: { totals: Macros; targets: { protein: number; carbs: number; fat: number } }) {
  const p = Math.round(totals.protein)
  const left = targets.protein - p
  const pct = targets.protein ? Math.min(100, (p / targets.protein) * 100) : 0
  const cOver = overBy(totals.carbs, targets.carbs)
  const fOver = overBy(totals.fat, targets.fat)
  const macro = (name: string, v: number, target: number, over: number, ink: string, id: string) =>
    over ? (
      <span data-testid={id}>{name} {fmt(v)} g, <b className={ink}>+{fmt(over)} g over</b></span>
    ) : (
      <span data-testid={id}>{name} {fmt(v)} / {fmt(target)} g</span>
    )
  const said = (name: string, v: number, target: number, over: number) => `${name} ${fmt(v)} of ${fmt(target)} g${over ? `, ${fmt(over)} g over` : ''}`
  return (
    <Link
      to="/nutrition"
      className="block rounded-[20px] border-2 border-protein-line bg-card p-4"
      data-testid="protein-card"
      aria-label={`Protein: ${left > 0 ? `${fmt(left)} g left today` : left === 0 ? 'target hit' : `target hit, ${fmt(-left)} g over`}, ${fmt(p)} of ${fmt(targets.protein)} g. ${said('Carbs', totals.carbs, targets.carbs, cOver)}, ${said('fat', totals.fat, targets.fat, fOver)}. Open Nutrition.`}
    >
      <div className="flex items-start justify-between">
        <div>
          <div className="text-[13px] text-mute">{left >= 0 ? 'Protein left today' : 'Protein target hit'}</div>
          <div className="text-[30px] font-extrabold leading-tight tracking-tight text-protein-ink" data-testid="protein-left">
            {left > 0 ? `${fmt(left)} g left` : left === 0 ? 'Target hit' : `+${fmt(-left)} g over`}
          </div>
        </div>
        <span className="pt-1 text-[15px] font-bold text-g-ink" aria-hidden="true">View ›</span>
      </div>
      <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-line" aria-hidden="true">
        <i className={`block h-full rounded-full ${left < 0 ? 'bg-protein-deep' : 'bg-protein'}`} style={{ width: `${pct}%` }} />
      </div>
      <div className="mt-2 flex gap-4 text-[13px] text-mute" data-testid="protein-sub" aria-hidden="true">
        {macro('Carbs', totals.carbs, targets.carbs, cOver, 'text-carbs-ink', 'protein-sub-carbs')}
        {macro('Fat', totals.fat, targets.fat, fOver, 'text-fat-ink', 'protein-sub-fat')}
      </div>
    </Link>
  )
}
