import { ACTIVITY, DEFICIT_CAP, fmt, KCAL_PER_KG, PACE, PACES, type Body } from '../lib/calc'
import type { Activity, Goal, Pace, Sex } from '../lib/types'
import { Chip } from './ui'
import { Info } from './Info'

/** v1.3.3: goal weight is no longer asked for; a stored value is kept in the profile untouched. */
export type Draft = Body & { pace: Pace }
export const PACE_LABEL = (p: Pace) => `${PACE[p].label} ${PACE[p].kg} kg/wk`
export const GOAL_LABEL: Record<Goal, string> = { lose: 'Lose weight', keep: 'Keep weight', gain: 'Gain weight' }
export const ACTIVITY_SHORT: Record<Activity, string> = {
  sedentary: 'Sedentary', light: 'Lightly active', moderate: 'Moderately active', active: 'Active', very: 'Very active',
}
const input = 'w-24 rounded-xl border border-line bg-bg px-3 py-2 text-right text-[17px]'

export function BodyFields({ d, set }: { d: Draft; set: (d: Draft) => void }) {
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
        {num('weightKg', 'Weight', 'kg', 30, 300)}
      </div>
    </>
  )
}

const pct = (f: number) => `${Math.round((f - 1) * 1000) / 10}%`

/** paceHint: one short grey line under the pace chips (the plan's capped daily deficit or surplus). */
export function GoalFields({ d, set, paceHint }: { d: Draft; set: (d: Draft) => void; paceHint?: string }) {
  return (
    <>
      <fieldset>
        <legend className="mb-2 text-[15px] font-semibold">Goal</legend>
        <div className="flex flex-wrap gap-2">
          {(['lose', 'keep', 'gain'] as Goal[]).map((g) => (
            <Chip key={g} on={d.goal === g} onClick={() => set({ ...d, goal: g })}>{GOAL_LABEL[g]}</Chip>
          ))}
        </div>
      </fieldset>
      {d.goal !== 'keep' && (
        <fieldset>
          <legend className="mb-2 flex items-center text-[15px] font-semibold">
            Pace
            <Info title="Pace" id="pace">
              <p>How fast to aim for, per week. About {fmt(KCAL_PER_KG)} kcal is one kg of body weight, so 0.25 kg a week is roughly 275 kcal a day, 0.5 kg about 550 and 0.75 kg about 825.</p>
              <p>The daily difference is capped at {DEFICIT_CAP * 100}% of your base (your BMR, plus daily movement when it is on).</p>
              <p>The target also never goes under 1,500 kcal for men or 1,200 kcal for women (or under your BMR when movement is on), so near that floor the real deficit is smaller.</p>
            </Info>
          </legend>
          <div className="flex flex-wrap gap-2" data-testid="pace">
            {PACES.map((p) => (
              <Chip key={p} on={d.pace === p} onClick={() => set({ ...d, pace: p })}>{PACE_LABEL(p)}</Chip>
            ))}
          </div>
          {paceHint && <p className="mt-2 text-[13px] text-mute" data-testid="pace-hint">{paceHint}</p>}
        </fieldset>
      )}
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

/** v1.3.3: the short line under the pace chips: the plan's actual daily deficit or surplus after the cap and floor. */
export function paceHint(goal: Goal, plan: { planDeficit: number; atMinimum: boolean }) {
  if (goal === 'keep') return undefined
  if (plan.atMinimum) return "You're at the minimum intake"
  return `About ${fmt(Math.abs(plan.planDeficit))} kcal a day`
}

/**
 * v1.3.3: the visible sum under the Daily target, e.g. "BMR 1,900 + 713 movement − 523 deficit". Keep has no
 * deficit term, Gain shows "+ N surplus", and a target the floor holds up says so briefly. Never shows a surplus
 * for Keep or Lose.
 */
export function targetSum(goal: Goal, plan: { bmr: number; movement: number; planDeficit: number; floored: boolean; floor: number }, includeMovement: boolean) {
  let s = `BMR ${fmt(plan.bmr)}`
  if (includeMovement) s += ` + ${fmt(plan.movement)} movement`
  if (goal === 'lose' && plan.planDeficit > 0) s += ` − ${fmt(plan.planDeficit)} deficit`
  if (goal === 'gain' && plan.planDeficit < 0) s += ` + ${fmt(-plan.planDeficit)} surplus`
  if (plan.floored) s += ` · at the ${fmt(plan.floor)} minimum`
  return s
}

/** Goal line from what the plan takes off (or adds to) its base, after the 20% cap and the v1.2 floor. */
export function goalBlurb(goal: Goal, plan: { planDeficit: number; capped: boolean; floored: boolean; floor: number }) {
  if (goal === 'keep') return plan.planDeficit < 0 ? `You're at the minimum intake (${fmt(plan.floor)} kcal). Your watch or exercise burn creates your deficit` : 'to keep your current weight'
  const kcal = Math.abs(plan.planDeficit)
  const min = `the ${fmt(plan.floor)} kcal minimum`
  if (goal === 'lose' && plan.planDeficit <= 0) return `You're at the minimum intake (${fmt(plan.floor)} kcal). Your watch or exercise burn creates your deficit`
  const kg = Math.round(((kcal * 7) / KCAL_PER_KG) * 20) / 20
  const verb = goal === 'lose' ? 'lose' : 'gain'
  const note = plan.floored ? ` (held at ${min})` : plan.capped ? ' (capped at 20%)' : ''
  return `${fmt(kcal)} kcal a day ${goal === 'lose' ? 'deficit' : 'surplus'}, to ${verb} about ${kg} kg a week${note}`
}
