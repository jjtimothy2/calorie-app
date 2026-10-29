import { Link } from 'react-router-dom'
import { fmt, overBy } from '../lib/calc'
import type { Macros } from '../lib/types'

/**
 * Home card: protein eaten today against the target from macroTargets, with a small carbs and fat line. Opens Nutrition.
 * v1.16 (Reed): "44 g" big with "of 125 g" small and muted on the same baseline, the bar fills with grams eaten, and
 * a green "Target hit" once the target is reached. Over the target it keeps the eaten number.
 */
export function ProteinCard({ totals, targets }: { totals: Macros; targets: { protein: number; carbs: number; fat: number } }) {
  const p = Math.round(totals.protein)
  const left = targets.protein - p
  const hit = targets.protein > 0 && left <= 0
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
      className="tap block rounded-[22px] border border-line bg-card p-4"
      data-testid="protein-card"
      aria-label={`Protein: ${left > 0 ? `${fmt(left)} g left today` : left === 0 ? 'target hit' : `target hit, ${fmt(-left)} g over`}, ${fmt(p)} of ${fmt(targets.protein)} g. ${said('Carbs', totals.carbs, targets.carbs, cOver)}, ${said('fat', totals.fat, targets.fat, fOver)}. Open Nutrition.`}
    >
      <div className="flex items-start justify-between">
        <div>
          <div className="eyebrow" data-testid="protein-eyebrow">
            Protein today{hit && <> <b className="ml-1 font-sans text-[13px] font-bold tracking-normal text-g-ink [font-variant-caps:normal]" data-testid="protein-hit">Target hit</b></>}
          </div>
          <div className="num text-[32px] leading-tight text-protein-ink" data-testid="protein-left">
            {fmt(p)} g{' '}<span className="ml-0.5 font-sans text-[17px] font-normal tracking-normal text-mute" data-testid="protein-target">of {fmt(targets.protein)} g</span>
          </div>
        </div>
        <span className="pt-1 text-[15px] font-bold text-g-ink" aria-hidden="true">View ›</span>
      </div>
      <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-track" aria-hidden="true">
        <i className={`grow-x bar-fill block h-full rounded-full ${left < 0 ? 'bg-protein-deep' : 'bg-protein'}`} style={{ width: `${pct}%` }} />
      </div>
      <div className="mt-2 flex gap-4 text-[13px] text-mute" data-testid="protein-sub" aria-hidden="true">
        {macro('Carbs', totals.carbs, targets.carbs, cOver, 'text-carbs-ink', 'protein-sub-carbs')}
        {macro('Fat', totals.fat, targets.fat, fOver, 'text-fat-ink', 'protein-sub-fat')}
      </div>
    </Link>
  )
}
