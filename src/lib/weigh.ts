import { calcBmr, daysBetween, round1 } from './calc'
import { normaliseProfile } from './migrate'
import type { State, WeightEntry } from './types'

/** Weekly weigh-in: Home nudges once the last weigh-in is this many days old. */
export const WEIGH_DAYS = 7

export const lastWeigh = (weights: WeightEntry[]) => weights[weights.length - 1] ?? null

/** True when Home should ask for a weigh-in: the last one is 7+ days old and the note wasn't dismissed in the last 7 days. */
export function shouldNudge(weights: WeightEntry[], today: string, dismissedAt: string | null) {
  const last = lastWeigh(weights)
  if (!last || daysBetween(last.date, today) < WEIGH_DAYS) return false
  return !dismissedAt || daysBetween(dismissedAt, today) >= WEIGH_DAYS
}

/**
 * A weigh-in. One per day (a second one that day replaces it). When it is the latest weigh-in it becomes the current
 * weight: BMR is worked out again unless it was typed in, and the plan restarts from this weight and day towards the
 * same goal weight and date (so the daily gap is what's left over the days left).
 */
export function logWeight(s: State, date: string, kg: number): State {
  const w = round1(kg)
  const weights = [...s.weights.filter((e) => e.date !== date), { date, kg: w }].sort((a, b) => (a.date < b.date ? -1 : 1))
  const p = s.profile
  if (!p || weights[weights.length - 1].date !== date) return { ...s, weights }
  const next = { ...p, weightKg: w, planFrom: { date, kg: w } }
  if (!p.bmrCustom) next.bmr = calcBmr(next)
  return { ...s, weights, profile: normaliseProfile(next) }
}


/**
 * Delete a weigh-in. Deleting the latest one makes the one before it the current weight again and re-plans from there
 * (BMR worked out again unless typed in). If the plan was started by the deleted weigh-in it restarts on the earlier
 * weigh-in's day; if the goal was set later, it keeps that later start day with the earlier weight. Deleting an older
 * weigh-in only changes the trend. Deleting the only weigh-in leaves the profile as it is (the log is just empty).
 */
export function deleteWeight(s: State, date: string): State {
  const gone = s.weights.find((e) => e.date === date)
  if (!gone) return s
  const weights = s.weights.filter((e) => e.date !== date)
  const p = s.profile
  const wasLatest = lastWeigh(s.weights)?.date === date
  const prev = lastWeigh(weights)
  if (!p || !wasLatest || !prev) return { ...s, weights }
  const start = p.planFrom.date === date || p.planFrom.date < prev.date ? prev.date : p.planFrom.date
  const next = { ...p, weightKg: prev.kg, planFrom: { date: start, kg: prev.kg } }
  if (!p.bmrCustom) next.bmr = calcBmr(next)
  return { ...s, weights, profile: normaliseProfile(next) }
}
