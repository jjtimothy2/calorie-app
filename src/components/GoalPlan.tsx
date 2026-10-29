import { addDays, addMonths, daysBetween, fmt, kgWeek, longDay, MIN_PLAN_DAYS, FAST_WEEKLY_SHARE, targetFloor, type PaceCheck, type SafeDeficit } from '../lib/calc'
import type { ReactNode } from 'react'
import type { Goal, Sex } from '../lib/types'

/** Goal-date plan: the "By when?" choices. Custom opens a native date picker. */
export type ByWhen = '1m' | '3m' | '6m' | '1y' | 'custom'
export const BY_WHEN: { id: Exclude<ByWhen, 'custom'>; label: string; months: number }[] = [
  { id: '1m', label: '1 month', months: 1 },
  { id: '3m', label: '3 months', months: 3 },
  { id: '6m', label: '6 months', months: 6 },
  { id: '1y', label: '1 year', months: 12 },
]
export const byWhenDate = (id: Exclude<ByWhen, 'custom'>, today: string) => addMonths(today, BY_WHEN.find((b) => b.id === id)!.months)
/** Onboarding Skip: no goal weight picked -> a first goal of 5% of the current weight (to the nearest 0.5 kg); no date -> 6 months. */
export const SKIP_GOAL_SHARE = 0.05
export const SKIP_BY_WHEN: Exclude<ByWhen, 'custom'> = '6m'
export const skipGoalKg = (goal: Goal, kg: number) => Math.round(kg * (1 + (goal === 'gain' ? 1 : -1) * SKIP_GOAL_SHARE) * 2) / 2
/** Earliest date the custom picker offers. A nearer date would be planned as MIN_PLAN_DAYS anyway. */
export const minGoalDate = (today: string) => addDays(today, MIN_PLAN_DAYS)

/** kg a week a date asks for, from the weight change alone (same maths as the plan). */
export const weeklyFor = (fromKg: number, goalKg: number, today: string, date: string) =>
  (Math.abs(fromKg - goalKg) * 7) / Math.max(MIN_PLAN_DAYS, daysBetween(today, date))
export const tooFast = (weekly: number, kg: number) => weekly > FAST_WEEKLY_SHARE * kg + 1e-9

/** Goal weight checks: in range, and on the right side of the current weight for the goal. Blank is "not yet", not an error. */
export function goalWeightError(goal: Goal, current: number, gw: number): string | null {
  if (Number.isNaN(gw)) return null
  if (gw < 30 || gw > 300) return 'Pick a weight between 30 and 300 kg.'
  if (goal === 'lose' && gw >= current) return `To lose weight, pick a goal under ${current} kg.`
  if (goal === 'gain' && gw <= current) return `To gain weight, pick a goal over ${current} kg.`
  return null
}
export const goalWeightOk = (goal: Goal, current: number, gw: number) => !Number.isNaN(gw) && !goalWeightError(goal, current, gw)

/**
 * Soft warning (never blocks): over 1% of body weight a week, or (Lose) a target under 1,500 kcal for men or 1,200 for
 * women. "Try <date>" sets the earliest date that clears both.
 */
export function PaceWarning({ check, weeklyKg, sex, onTry, className = '', tryLabel }: { check: PaceCheck; weeklyKg: number; sex: Sex; onTry?: (date: string) => void; className?: string; tryLabel?: string }) {
  if (!check.warn) return null
  const line = fmt(targetFloor(sex))
  const why = [
    check.fast && `About ${kgWeek(weeklyKg)} kg a week is more than 1% of your weight.`,
    check.low && `It takes your target under ${line} kcal a day.`,
  ].filter(Boolean).join(' ')
  return (
    <div role="note" className={`flex flex-col gap-2 rounded-[18px] bg-carbs-soft px-4 py-3 text-left text-[15px] leading-snug text-carbs-ink ${className}`} data-testid="pace-warning">
      <p><b>That's a fast pace. Consider a later date.</b> {why}</p>
      {check.suggest ? (
        onTry && (
          <button type="button" onClick={() => onTry(check.suggest!)} className="tap min-h-11 self-start rounded-full bg-card px-4 text-[15px] font-bold text-carbs-ink" data-testid="pace-try">
            {tryLabel ?? `Try ${longDay(check.suggest)}`}
          </button>
        )
      ) : (
        <p data-testid="pace-no-date">Your burn is already at or under {line} kcal, so a later date can't lift the target above it. More movement or a smaller goal helps most.</p>
      )}
    </div>
  )
}

/** The date choices as option rows. Shared by onboarding (big cards) and the goal sheet (compact). */
export function ByWhenPicker({ value, date, today, fromKg, goalKg, onPick, compact, unsafe }: {
  value: ByWhen | null; date: string | null; today: string; fromKg: number; goalKg: number
  onPick: (by: ByWhen, date: string | null) => void; compact?: boolean
  /** v1.15: when given (Me, Lose), marks dates over the safe deficit cap "· not safe" instead of the 1% "· fast". */
  unsafe?: (date: string) => boolean
}) {
  const known = !Number.isNaN(goalKg)
  const hint = (d: string) => {
    if (!known) return longDay(d)
    const w = weeklyFor(fromKg, goalKg, today, d)
    return { text: `${longDay(d)} · about ${kgWeek(w)} kg a week`, fast: unsafe ? unsafe(d) : tooFast(w, fromKg) }
  }
  const row = (id: ByWhen, title: string, d: string | null, extra?: ReactNode) => {
    const on = value === id
    const h = d ? hint(d) : null
    return (
      <div key={id} className={`rounded-[22px] border-2 bg-card ${on ? 'border-ink' : 'border-line'}`}>
        <button type="button" aria-pressed={on} data-testid={`by-${id}`} onClick={() => onPick(id, id === 'custom' ? date ?? null : d)}
          className={`opt flex w-full items-center gap-4 text-left ${compact ? 'min-h-[62px] px-4 py-2.5' : 'min-h-[76px] px-5 py-3 [@media(max-height:700px)]:min-h-[52px] [@media(max-height:700px)]:py-1'}`}>
          <span className="flex flex-1 flex-col gap-0.5">
            <span className={`${compact ? 'text-[17px]' : 'text-[18px]'} font-bold`}>{title}</span>
            {h && <span className="text-[15px] leading-snug text-mute">{typeof h === 'string' ? h : h.text}{typeof h !== 'string' && h.fast && <b className="font-semibold text-carbs-ink">{unsafe ? ' · not safe' : ' · fast'}</b>}</span>}
          </span>
          <span aria-hidden="true" className={`grid h-7 w-7 shrink-0 place-items-center rounded-full border-2 ${on ? 'border-ink bg-ink text-bg' : 'border-line'}`}>
            {on && <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>}
          </span>
        </button>
        {extra}
      </div>
    )
  }
  const custom = value === 'custom' && (
    <label className="mx-4 mb-3 flex items-center justify-between gap-3 border-t border-line pt-3 text-[16px]">
      <span className="font-semibold">Goal date</span>
      <input type="date" className="rounded-xl border border-line bg-bg px-3 py-2 text-[17px]" min={minGoalDate(today)} value={date ?? ''} data-testid="by-date"
        onChange={(e) => onPick('custom', e.target.value || null)} />
    </label>
  )
  return (
    <div className={`flex flex-col ${compact ? 'gap-2' : 'gap-2.5 [@media(max-height:700px)]:gap-1.5'}`} data-testid="by-when">
      {BY_WHEN.map((b) => row(b.id, b.label, byWhenDate(b.id, today)))}
      {row('custom', 'Custom date', value === 'custom' ? date : null, custom)}
    </div>
  )
}

/**
 * v1.15: why a Lose date is over the safe cap. Always says what it would leave to eat. No em dashes or semicolons.
 * "It would leave about 1,001 kcal a day to eat, under the safe minimum of 1,200."
 */
export function unsafeWhy(s: SafeDeficit, weeklyKg: number): string {
  if (s.eat <= 0) return `It would leave nothing to eat. The safe minimum is ${fmt(s.floor)} kcal a day.`
  const eat = `It would leave about ${fmt(s.eat)} kcal a day to eat`
  if (s.low) return `${eat}, under the safe minimum of ${fmt(s.floor)}.`
  return `${eat}, but about ${kgWeek(weeklyKg)} kg a week is more than 1% of your weight.`
}

/** "A safer plan: a 653 kcal deficit, eating about 1,501 kcal a day, 78 kg by 24 Feb 2027." */
export const saferLine = (safer: { deficit: number; eat: number; date: string }, goalKg: number) =>
  `A safer plan: a ${fmt(safer.deficit)} kcal deficit, eating about ${fmt(safer.eat)} kcal a day, ${goalKg} kg by ${longDay(safer.date)}.`

/** No date can fit the cap (the plan base is at or near the floor). */
export const noSaferLine = (s: SafeDeficit) =>
  `Your burn is too close to the safe minimum of ${fmt(s.floor)} kcal, so a later date can't make room for a deficit. A smaller goal or more movement helps most.`

/**
 * v1.15: the card for a Lose date over the safe cap. Onboarding and the Me goal sheet. The buttons sit outside it.
 */
export function UnsafeCard({ s, weeklyKg, safer, goalKg, className = '', title = "This date isn't safe." }: {
  s: SafeDeficit; weeklyKg: number; safer: { deficit: number; eat: number; date: string } | null; goalKg: number; className?: string; title?: string
}) {
  return (
    <div role="note" className={`flex flex-col gap-1.5 rounded-[18px] bg-carbs-soft px-4 py-3 text-left text-[15px] leading-snug text-carbs-ink ${className}`} data-testid="unsafe-card">
      <p><b>{title}</b> {unsafeWhy(s, weeklyKg)}</p>
      {safer ? <p data-testid="safer-plan">{saferLine(safer, goalKg)}</p> : <p data-testid="safer-none">{noSaferLine(s)}</p>}
    </div>
  )
}
