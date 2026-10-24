import { ACTIVITY, fmt, KCAL_PER_KG, PACE, PACES, type Body } from '../lib/calc'
import type { Activity, Goal, Pace, Sex } from '../lib/types'
import { Chip } from './ui'

/** goalWeightKg NaN = left blank, which means "same as current weight". */
export type Draft = Body & { goalWeightKg: number; pace: Pace }
export const goalWeightOf = (d: Pick<Draft, 'goalWeightKg' | 'weightKg'>) => (Number.isFinite(d.goalWeightKg) && d.goalWeightKg > 0 ? d.goalWeightKg : d.weightKg)
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
        <legend className="mb-2 text-[15px] font-semibold">Sex <span className="font-normal text-mute">(for the calorie formula)</span></legend>
        <div className="flex gap-2">
          {(['female', 'male'] as Sex[]).map((s) => (
            <Chip key={s} on={d.sex === s} onClick={() => set({ ...d, sex: s })}>{s === 'female' ? 'Female' : 'Male'}</Chip>
          ))}
        </div>
      </fieldset>
      <div className="rounded-[20px] border border-line bg-card px-4">
        {num('age', 'Age', 'yrs', 14, 100)}
        {num('heightCm', 'Height', 'cm', 120, 230)}
        {num('weightKg', 'Weight', 'kg', 30, 300)}
      </div>
    </>
  )
}

export function GoalFields({ d, set }: { d: Draft; set: (d: Draft) => void }) {
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
          <legend className="mb-2 text-[15px] font-semibold">Pace</legend>
          <div className="flex flex-wrap gap-2" data-testid="pace">
            {PACES.map((p) => (
              <Chip key={p} on={d.pace === p} onClick={() => set({ ...d, pace: p })}>{PACE_LABEL(p)}</Chip>
            ))}
          </div>
        </fieldset>
      )}
      <label className="flex items-center justify-between rounded-[20px] border border-line bg-card px-4 py-3 text-base">
        <span>
          Goal weight
          <span className="block text-[13px] text-mute">Optional. Sets protein. Blank = current weight</span>
        </span>
        <span className="flex items-center gap-2">
          <input
            className={input}
            type="number"
            inputMode="decimal"
            min={30}
            max={300}
            name="goalWeightKg"
            placeholder={Number.isFinite(d.weightKg) ? String(d.weightKg) : ''}
            value={Number.isNaN(d.goalWeightKg) ? '' : d.goalWeightKg}
            onChange={(e) => set({ ...d, goalWeightKg: e.target.value === '' ? NaN : Number(e.target.value) })}
          />
          <span className="w-6 text-mute">kg</span>
        </span>
      </label>
      <fieldset>
        <legend className="mb-2 text-[15px] font-semibold">Activity level</legend>
        <div className="rounded-[20px] border border-line bg-card px-4">
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

/** Goal weight is optional; when typed it must be 30 to 300 kg. */
export const validGoalWeight = (d: Pick<Draft, 'goalWeightKg'>) => Number.isNaN(d.goalWeightKg) || (d.goalWeightKg >= 30 && d.goalWeightKg <= 300)

/** Goal line from the balance goal the plan actually uses (after the 20% cap and the BMR floor). */
export function goalBlurb(goal: Goal, dailyGoal: number, capped: boolean) {
  if (goal === 'keep') return 'to keep your current weight'
  const kcal = Math.abs(dailyGoal)
  if (goal === 'lose' && dailyGoal <= 0) return 'at your BMR, the lowest target we suggest'
  const kg = Math.round(((kcal * 7) / KCAL_PER_KG) * 20) / 20
  const verb = goal === 'lose' ? 'lose' : 'gain'
  return `${fmt(kcal)} kcal a day ${goal === 'lose' ? 'deficit' : 'surplus'}, to ${verb} about ${kg} kg a week${capped ? ' (capped at 20%)' : ''}`
}
