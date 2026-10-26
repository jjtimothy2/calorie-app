// Storage versions and migrations (pure, no React, so unit tests can import it).
import { calcBmr, dailyPlan } from './calc'
import { STATE_VERSION, type Pace, type Profile, type State } from './types'

const PACES: Pace[] = ['gentle', 'standard', 'faster']
type ProfileIn = Partial<Profile> & Pick<Profile, 'age' | 'sex' | 'heightCm' | 'weightKg' | 'activity' | 'goal'>

/**
 * Fill every profile field and derive target + dailyGoal from the v1.1 plan.
 * Missing fields from older data: includeMovement keeps its saved value (true if it was never saved, as v0 always
 * counted movement), goalWeightKg = current weight, pace = standard. New profiles set includeMovement: true (v1.8, false before).
 */
export function normaliseProfile(p: ProfileIn): Profile {
  const bmr = typeof p.bmr === 'number' && p.bmr > 0 ? p.bmr : calcBmr(p)
  const gw = typeof p.goalWeightKg === 'number' && p.goalWeightKg > 0 ? p.goalWeightKg : p.weightKg
  const base = {
    ...p,
    bmr,
    bmrCustom: p.bmrCustom ?? false,
    includeMovement: p.includeMovement ?? true,
    goalWeightKg: gw,
    pace: p.pace && PACES.includes(p.pace) ? p.pace : ('standard' as Pace),
    macros: { protein: null, carbs: null, fat: null, ...(p.macros ?? {}) },
  }
  const plan = dailyPlan(base)
  return { ...base, target: plan.target, dailyGoal: plan.dailyGoal }
}

const empty = (): State => ({ version: STATE_VERSION, profile: null, entries: [], exercises: [], closedDays: {}, favourites: [] })

/**
 * Bring saved state (v1 or v2) up to the current version. Entries, exercises, closed days and favourites are copied
 * through untouched; only the profile gains the new fields. Returns null for unknown or newer versions.
 */
export function migrateState(raw: unknown): State | null {
  if (typeof raw !== 'object' || raw === null) return null
  const s = raw as Omit<Partial<State>, 'version'> & { version?: number }
  if (s.version !== 1 && s.version !== STATE_VERSION) return null
  return { ...empty(), ...s, version: STATE_VERSION, profile: s.profile ? normaliseProfile(s.profile as ProfileIn) : null }
}
