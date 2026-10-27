// Storage versions and migrations (pure, no React, so unit tests can import it).
import { addDays, calcBmr, dailyPlan, dateKey, PACE, round1 } from './calc'
import { STATE_VERSION, type Pace, type Profile, type State, type WeightEntry } from './types'

const PACES: Pace[] = ['gentle', 'standard', 'faster']
type ProfileIn = Partial<Profile> & Pick<Profile, 'age' | 'sex' | 'heightCm' | 'weightKg' | 'activity' | 'goal'> & { pace?: Pace }

/** Default plan length when an old profile has no usable goal weight: 26 weeks. */
export const LEGACY_PLAN_DAYS = 182
const isDay = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)

/**
 * State v2 to v3 (v1.13.1): turn the old pace into a goal date, then the target comes from the goal-date plan with no
 * floor (the 1,500 / 1,200 line only warns now, it doesn't hold the target up).
 * - Lose or Gain with a goal weight on the right side of the current weight: goal date = today + |kg to go| / pace kg a
 *   week, in days (rounded up). The gap then works out to the old pace kcal.
 * - Otherwise (the usual case: goal weight was not asked for from v1.3.3 to v1.12, so it equals the current weight):
 *   goal weight = current weight -/+ pace x 26 weeks, goal date = today + 182 days. Gap = pace x 7,700 / 7, the old deficit.
 * Either way goalAssumed is set so Me can ask the user to check the goal (goalAssumedV 2 = derived this way). Keep: goal date null.
 */
export function legacyGoal(p: ProfileIn, gw: number, today: string): Pick<Profile, 'goalWeightKg' | 'goalDate' | 'goalAssumed' | 'goalAssumedV'> {
  if (p.goal === 'keep') return { goalWeightKg: gw, goalDate: null }
  const pace = PACE[p.pace && PACES.includes(p.pace) ? p.pace : 'standard'].kg
  const left = p.goal === 'lose' ? p.weightKg - gw : gw - p.weightKg
  if (left > 0) return { goalWeightKg: gw, goalDate: addDays(today, Math.ceil((left / pace) * 7 - 1e-9)), goalAssumed: true, goalAssumedV: 2 }
  const sign = p.goal === 'lose' ? -1 : 1
  return { goalWeightKg: round1(p.weightKg + sign * pace * (LEGACY_PLAN_DAYS / 7)), goalDate: addDays(today, LEGACY_PLAN_DAYS), goalAssumed: true, goalAssumedV: 2 }
}

type OldState = { version?: number; profile?: (ProfileIn & { goalWeightKg?: number }) | null }

/**
 * One-time v1.13.1 fix for a profile v1.13 migrated (goalAssumed without goalAssumedV 2): v1.13 picked a goal weight and
 * date that kept the old floored target. Re-derive the goal from the old pace and kg left (legacyGoal, as of the day the
 * plan started) when the old v1/v2 data is still there and the plan hasn't moved since (same goal, same weight, no
 * weigh-in re-plan); otherwise keep the goal weight and date as they are. Either way goalAssumedV 2 marks it done, and
 * normaliseProfile then works the target out with no floor. A goal the user edited has no goalAssumed and isn't touched.
 */
export function repairAssumedGoal(p: ProfileIn, legacy?: OldState | null): ProfileIn {
  if (!p.goalAssumed || p.goalAssumedV === 2) return p
  const old = legacy && (legacy.version === 1 || legacy.version === 2) ? legacy.profile : null
  const from = p.planFrom
  if (old && p.goal !== 'keep' && old.goal === p.goal && old.weightKg === p.weightKg && from && from.kg === p.weightKg && isDay(from.date)) {
    const gw = typeof old.goalWeightKg === 'number' && old.goalWeightKg > 0 ? old.goalWeightKg : old.weightKg
    return { ...p, ...legacyGoal({ ...p, pace: old.pace }, gw, from.date) }
  }
  return { ...p, goalAssumedV: 2 }
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
    : legacyGoal(p, gw, today)
  // A Lose or Gain plan with no date (hand-edited data): plan it like an old profile on the Standard pace.
  const fixed = goal.goalDate === null && p.goal !== 'keep' ? legacyGoal({ ...p, pace: 'standard' }, gw, today) : goal
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
  if (!base.goalAssumed) { delete base.goalAssumed; delete base.goalAssumedV }
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
 * Bring saved state (v1, v2 or v3) up to the current version. legacy: the old v2 (or v1) state still kept as a backup,
 * used once to re-derive a v1.13 assumed goal (repairAssumedGoal). Entries, exercises, closed days and favourites are copied
 * through untouched; the profile gains the new fields. v3 adds the weight log: older data starts it with one weigh-in,
 * the current weight today (so the weekly weigh-in nudge counts from the upgrade). Returns null for unknown or newer versions.
 */
export function migrateState(raw: unknown, today = dateKey(), legacy?: unknown): State | null {
  if (typeof raw !== 'object' || raw === null) return null
  const s = raw as Omit<Partial<State>, 'version'> & { version?: number }
  if (s.version !== 1 && s.version !== 2 && s.version !== STATE_VERSION) return null
  const pin = s.profile && s.version === STATE_VERSION ? repairAssumedGoal(s.profile as ProfileIn, legacy as OldState) : (s.profile as ProfileIn | null | undefined)
  const profile = pin ? normaliseProfile(pin, today) : null
  let weights = normaliseWeights(s.weights)
  // Only data from before the weight log (v1, v2, or no weights field) is seeded; a v3 log emptied by Delete stays empty.
  if (profile && !weights.length && (s.version !== STATE_VERSION || !Array.isArray(s.weights))) weights = [{ date: profile.planFrom.date, kg: profile.weightKg }]
  return { ...empty(), ...s, version: STATE_VERSION, profile, weights }
}
