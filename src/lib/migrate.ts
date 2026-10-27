// Storage versions and migrations (pure, no React, so unit tests can import it).
import { addDays, calcBmr, dailyPlan, dateKey, KCAL_PER_KG, MIN_PLAN_DAYS, PACE, round1, targetFloor } from './calc'
import { STATE_VERSION, type Pace, type Profile, type State, type WeightEntry } from './types'

const PACES: Pace[] = ['gentle', 'standard', 'faster']
type ProfileIn = Partial<Profile> & Pick<Profile, 'age' | 'sex' | 'heightCm' | 'weightKg' | 'activity' | 'goal'> & { pace?: Pace }

/** Default plan length when an old profile has no usable goal weight: 26 weeks. */
export const LEGACY_PLAN_DAYS = 182
const isDay = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)

/**
 * The v1.1 to v1.12 daily target, kept only so migration can carry it over: plan base -/+ pace kcal, never under the
 * floor (1,500 men / 1,200 women; with Movement on also never under BMR). Returns the target and the plan base.
 */
export function legacyTarget(p: ProfileIn & { bmr: number }): { target: number; planBase: number } {
  const planBase = dailyPlan({ ...p, includeMovement: p.includeMovement ?? true, goal: 'keep', goalWeightKg: p.weightKg, goalDate: null, planFrom: { date: '2000-01-01', kg: p.weightKg }, macros: { protein: null, carbs: null, fat: null } }).planBase
  const want = (PACE[p.pace && PACES.includes(p.pace) ? p.pace : 'standard'].kg * KCAL_PER_KG) / 7
  const floor = (p.includeMovement ?? true) ? Math.max(p.bmr, targetFloor(p.sex)) : targetFloor(p.sex)
  let target = planBase
  if (p.goal === 'lose') target = Math.round(planBase - want)
  if (p.goal === 'gain') target = Math.round(planBase + want)
  return { target: Math.max(floor, target), planBase }
}

/**
 * State v2 to v3: turn the old pace into a goal weight and date that keep the same daily target, so the number the
 * user sees does not move on upgrade (v1.13: this includes targets the old 1,500 / 1,200 floor was holding up).
 * - Lose or Gain with a goal weight on the right side of the current weight: keep that goal weight and pick the goal
 *   date whose daily gap gives the old target.
 * - Otherwise (the usual case: goal weight was not asked for from v1.3.3 to v1.12, so it equals the current weight):
 *   goal date = today + 182 days and the goal weight whose gap gives the old target (pace x 26 weeks when not floored).
 * - A Lose target the floor held at or above the plan base (nothing left to cut) can't be matched without a floor:
 *   a small goal (0.5 kg in a year) keeps the target as close to the old one as the plan allows.
 * Either way goalAssumed is set so Me can ask the user to check the goal. Keep: goal date null.
 */
export function legacyGoal(p: ProfileIn & { bmr: number }, gw: number, today: string): Pick<Profile, 'goalWeightKg' | 'goalDate' | 'goalAssumed'> {
  if (p.goal === 'keep') return { goalWeightKg: gw, goalDate: null }
  const sign = p.goal === 'lose' ? -1 : 1
  const { target: want, planBase } = legacyTarget(p)
  const gap = (want - planBase) * sign // kcal a day the old plan took off (lose) or added (gain)
  const targetOf = (goalWeightKg: number, days: number) =>
    dailyPlan({ ...p, includeMovement: p.includeMovement ?? true, goalWeightKg, goalDate: addDays(today, days), planFrom: { date: today, kg: p.weightKg }, macros: { protein: null, carbs: null, fat: null } }).target
  if (gap <= 0) return { goalWeightKg: round1(p.weightKg + sign * 0.5), goalDate: addDays(today, 365), goalAssumed: true }
  const left = round1((gw - p.weightKg) * sign)
  // Find a goal (kg to go, days) whose rounded target equals the old one. Days move the gap in steps of about gap / days
  // and 0.1 kg in steps of 770 / days, so trying both always lands on it within a few weeks of the ideal date.
  const find = (kgs: (d: number) => number[], from: number, to: number) => {
    for (let d = Math.max(MIN_PLAN_DAYS, from); d <= to; d++)
      for (const kg of kgs(d)) if (kg > 0 && targetOf(round1(p.weightKg + sign * kg), d) === want) return { kg, days: d }
    return null
  }
  const near = (d: number) => [0, -0.1, 0.1, -0.2, 0.2, -0.3, 0.3].map((o) => round1((gap * d) / KCAL_PER_KG + o))
  let best: { kg: number; days: number } | null = null
  if (left > 0) {
    // A goal weight on the right side (set by hand before v1.3.3): keep it if a date matches, else the closest goal.
    const ideal = Math.round((left * KCAL_PER_KG) / gap)
    best = find(() => [left], ideal - 3, ideal + 5) ?? find(near, ideal - 3, ideal + 30)
    if (!best) best = { kg: left, days: Math.max(MIN_PLAN_DAYS, ideal) }
  } else {
    best = find(near, LEGACY_PLAN_DAYS, LEGACY_PLAN_DAYS + 30) ?? { kg: round1((gap * LEGACY_PLAN_DAYS) / KCAL_PER_KG), days: LEGACY_PLAN_DAYS }
  }
  return { goalWeightKg: round1(p.weightKg + sign * best.kg), goalDate: addDays(today, best.days), goalAssumed: true }
}

/**
 * Fill every profile field and derive target + dailyGoal from the goal-date plan.
 * Missing fields from older data: includeMovement keeps its saved value (true if it was never saved, as v0 always
 * counted movement), goalWeightKg = current weight. No goalDate (state v1/v2): derived from the pace (legacyGoal).
 * No planFrom: the current weight, today. New profiles set includeMovement: true (v1.8, false before).
 */
export function normaliseProfile(p: ProfileIn, today = dateKey()): Profile {
  const bmr = typeof p.bmr === 'number' && p.bmr > 0 ? p.bmr : calcBmr(p)
  const gw = typeof p.goalWeightKg === 'number' && p.goalWeightKg > 0 ? p.goalWeightKg : p.weightKg
  const hasPlan = p.goalDate === null || isDay(p.goalDate)
  const goal = hasPlan
    ? { goalWeightKg: p.goal === 'keep' ? p.weightKg : gw, goalDate: p.goal === 'keep' ? null : (p.goalDate ?? null) }
    : legacyGoal({ ...p, bmr }, gw, today)
  // A Lose or Gain plan with no date (hand-edited data): plan it like an old profile on the Standard pace.
  const fixed = goal.goalDate === null && p.goal !== 'keep' ? legacyGoal({ ...p, bmr, pace: 'standard' }, gw, today) : goal
  const planFrom: WeightEntry = p.planFrom && isDay(p.planFrom.date) && typeof p.planFrom.kg === 'number' ? p.planFrom : { date: today, kg: p.weightKg }
  const { pace: _old, ...rest } = p
  void _old
  const base = {
    ...rest,
    bmr,
    bmrCustom: p.bmrCustom ?? false,
    includeMovement: p.includeMovement ?? true,
    ...fixed,
    planFrom,
    macros: { protein: null, carbs: null, fat: null, ...(p.macros ?? {}) },
  }
  if (!base.goalAssumed) delete base.goalAssumed
  const plan = dailyPlan(base)
  return { ...base, target: plan.target, dailyGoal: plan.dailyGoal }
}

/** Weigh-ins: valid entries only, one per day (the last one wins), oldest first. */
export function normaliseWeights(w: unknown): WeightEntry[] {
  if (!Array.isArray(w)) return []
  const byDay = new Map<string, number>()
  for (const e of w) if (e && isDay(e.date) && typeof e.kg === 'number' && e.kg > 0) byDay.set(e.date, e.kg)
  return [...byDay].sort(([a], [b]) => (a < b ? -1 : 1)).map(([date, kg]) => ({ date, kg }))
}

const empty = (): State => ({ version: STATE_VERSION, profile: null, entries: [], exercises: [], closedDays: {}, favourites: [], weights: [] })

/**
 * Bring saved state (v1, v2 or v3) up to the current version. Entries, exercises, closed days and favourites are copied
 * through untouched; the profile gains the new fields. v3 adds the weight log: older data starts it with one weigh-in,
 * the current weight today (so the weekly weigh-in nudge counts from the upgrade). Returns null for unknown or newer versions.
 */
export function migrateState(raw: unknown, today = dateKey()): State | null {
  if (typeof raw !== 'object' || raw === null) return null
  const s = raw as Omit<Partial<State>, 'version'> & { version?: number }
  if (s.version !== 1 && s.version !== 2 && s.version !== STATE_VERSION) return null
  const profile = s.profile ? normaliseProfile(s.profile as ProfileIn, today) : null
  let weights = normaliseWeights(s.weights)
  // Only data from before the weight log (v1, v2, or no weights field) is seeded; a v3 log emptied by Delete stays empty.
  if (profile && !weights.length && (s.version !== STATE_VERSION || !Array.isArray(s.weights))) weights = [{ date: profile.planFrom.date, kg: profile.weightKg }]
  return { ...empty(), ...s, version: STATE_VERSION, profile, weights }
}
