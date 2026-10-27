import { ACTIVITY, fmt, kgWeek, longDay, type Body } from '../lib/calc'
import type { Activity, Goal, Sex } from '../lib/types'
import { Chip } from './ui'
import { Info } from './Info'

/** Goal-date plan: the goal (weight and date) is set in the goal sheet; this draft holds body and activity only. */
export type Draft = Body
export const GOAL_LABEL: Record<Goal, string> = { lose: 'Lose weight', keep: 'Keep weight', gain: 'Gain weight' }
export const ACTIVITY_SHORT: Record<Activity, string> = {
  sedentary: 'Sedentary', light: 'Lightly active', moderate: 'Moderately active', active: 'Active', very: 'Very active',
}
const input = 'w-24 rounded-xl border border-line bg-bg px-3 py-2 text-right text-[17px]'

/** hideWeight (Me): weight comes from Log weight, so it isn't typed here. */
export function BodyFields({ d, set, hideWeight }: { d: Draft; set: (d: Draft) => void; hideWeight?: boolean }) {
  const num = (k: 'age' | 'heightCm' | 'weightKg', label: string, unit: string, min: number, max: number) => (
    <label className="flex items-center justify-between border-b border-line py-3 text-base last:border-0">
      <span>{label}</span>
      <span className="flex items-center gap-2">
        <input
          className={input}
          type="number"
          inputMode="decimal"
          min={min}
          max={max}
          required
          name={k}
          value={Number.isNaN(d[k]) ? '' : d[k]}
          onChange={(e) => set({ ...d, [k]: e.target.value === '' ? NaN : Number(e.target.value) })}
        />
        <span className="w-6 text-mute">{unit}</span>
      </span>
    </label>
  )
  return (
    <>
      <fieldset>
        <legend className="mb-2 text-[15px] font-semibold">Sex</legend>
        <div className="flex gap-2">
          {(['female', 'male'] as Sex[]).map((s) => (
            <Chip key={s} on={d.sex === s} onClick={() => set({ ...d, sex: s })}>{s === 'female' ? 'Female' : 'Male'}</Chip>
          ))}
        </div>
      </fieldset>
      <div className="rounded-[22px] border border-line bg-card px-4">
        {num('age', 'Age', 'yrs', 14, 100)}
        {num('heightCm', 'Height', 'cm', 120, 230)}
        {!hideWeight && num('weightKg', 'Weight', 'kg', 30, 300)}
      </div>
    </>
  )
}

const pct = (f: number) => `${Math.round((f - 1) * 1000) / 10}%`

/** Goal-date plan: the goal chips and pace moved to the goal sheet (Weight card); this is the activity level. */
export function GoalFields({ d, set }: { d: Draft; set: (d: Draft) => void }) {
  return (
    <>
      <fieldset>
        <legend className="mb-2 flex items-center text-[15px] font-semibold">
          Activity level
          <Info title="Activity level" id="activity">
            <p>How much you move on a normal day. With daily movement on (under Daily balance), it adds everyday activity on top of your BMR:</p>
            <ul className="flex flex-col gap-1" data-testid="activity-scale">
              {(Object.keys(ACTIVITY) as Activity[]).map((a) => (
                <li key={a} className="flex justify-between gap-3"><span>{ACTIVITY_SHORT[a]}</span><b className="num font-semibold">+{pct(ACTIVITY[a].factor)}</b></li>
              ))}
            </ul>
            <p>Log workouts separately as exercise. Exercise adds to the food you can eat that day but never changes your macro goals.</p>
          </Info>
        </legend>
        <div className="rounded-[22px] border border-line bg-card px-4">
          {(Object.keys(ACTIVITY) as Activity[]).map((a) => (
            <label key={a} className="flex cursor-pointer items-center gap-3 border-b border-line py-3 text-[15px] last:border-0">
              <input type="radio" name="activity" className="h-5 w-5 accent-g-ink" checked={d.activity === a} onChange={() => set({ ...d, activity: a })} />
              {ACTIVITY[a].label}
            </label>
          ))}
        </div>
      </fieldset>
    </>
  )
}

export function validBody(d: Body) {
  return d.age >= 14 && d.age <= 100 && d.heightCm >= 120 && d.heightCm <= 230 && d.weightKg >= 30 && d.weightKg <= 300
}

type PlanSum = { bmr: number; movement: number; planDeficit: number; weeklyKg: number; kgToGo: number; days: number }

/**
 * The visible sum under the Daily target, e.g. "BMR 1,900 + 713 movement − 523 deficit". Keep has no deficit term and
 * Gain shows "+ N surplus". Goal-date plan: no floor, so nothing is "held".
 */
export function targetSum(goal: Goal, plan: PlanSum, includeMovement: boolean) {
  let s = `BMR ${fmt(plan.bmr)}`
  if (includeMovement) s += ` + ${fmt(plan.movement)} movement`
  if (goal === 'lose' && plan.planDeficit > 0) s += ` − ${fmt(plan.planDeficit)} deficit`
  if (goal === 'gain' && plan.planDeficit < 0) s += ` + ${fmt(-plan.planDeficit)} surplus`
  return s
}

/** "12 kg × 7,700 kcal ÷ 182 days = 508 kcal a day, about 0.5 kg a week." */
export function gapLine(plan: PlanSum) {
  const kg = Math.round(plan.kgToGo * 10) / 10
  return `${kg} kg × 7,700 kcal ÷ ${fmt(plan.days)} days = ${fmt(Math.abs(plan.planDeficit))} kcal a day, about ${kgWeek(plan.weeklyKg)} kg a week.`
}

/** Goal line for Me: "Lose 12 kg by 27 Apr 2027" (Keep: "Keep your current weight"). */
export function goalBlurb(goal: Goal, plan: PlanSum, goalDate: string | null) {
  if (goal === 'keep' || !goalDate) return 'to keep your current weight'
  if (plan.kgToGo === 0) return 'Goal weight reached'
  return `to ${goal} ${Math.round(plan.kgToGo * 10) / 10} kg by ${longDay(goalDate)}`
}
