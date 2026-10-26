export type Sex = 'male' | 'female'
export type Goal = 'lose' | 'keep' | 'gain'
export type Activity = 'sedentary' | 'light' | 'moderate' | 'active' | 'very'
export type Meal = 'breakfast' | 'lunch' | 'dinner' | 'snacks' | 'beverages'
/** Weight-change pace in kg a week. */
export type Pace = 'gentle' | 'standard' | 'faster'
export type Intensity = 'light' | 'moderate' | 'vigorous'

// v1.11: Beverages after Snacks. Never a time-of-day default (defaultMeal), only picked by hand.
export const MEALS: Meal[] = ['breakfast', 'lunch', 'dinner', 'snacks', 'beverages']
export const MEAL_LABEL: Record<Meal, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  snacks: 'Snacks',
  beverages: 'Beverages',
}

export type MacroKey = 'protein' | 'carbs' | 'fat'
/** User overrides for macro targets in grams; null means "use the default". */
export type MacroOverrides = Record<MacroKey, number | null>

export type Profile = {
  age: number
  sex: Sex
  heightCm: number
  weightKg: number
  activity: Activity
  goal: Goal
  /** Daily food target on a rest day (kcal), derived by dailyPlan(): plan base (BMR + movement, or plain BMR with movement off) minus the pace deficit (or plus surplus), never under the sex floor. */
  target: number
  /** Daily starting budget. Mifflin-St Jeor unless the user typed their own. */
  bmr: number
  bmrCustom: boolean
  /** Add NEAT (BMR x (activity factor - 1)) to the daily budget. */
  includeMovement: boolean
  /** Daily balance goal in kcal, derived: home base (BMR + movement, or BMR with movement off) - target. Positive = deficit (lose), 0 = keep, negative = surplus (gain). */
  dailyGoal: number
  /** v1.1: goal weight (kg). Defaults to the current weight. Since v1.3.2 macros use the current weight; since v1.3.3 it is no longer shown or asked for, and a stored value is kept untouched. */
  goalWeightKg: number
  /** v1.1: how fast to lose (or gain). Ignored for "keep". */
  pace: Pace
  macros: MacroOverrides
}

export type Macros = { kcal: number; protein: number; carbs: number; fat: number }

export type Entry = Macros & {
  id: string
  date: string // YYYY-MM-DD local
  meal: Meal
  foodId: string | null // null = quick add
  name: string
  servingLabel: string
  servingMult: number
  qty: number
  createdAt: number
  // values above (kcal/protein/carbs/fat) are per 1 qty of the chosen serving
  /** v1.5: 'photo' when logged from an AI estimate (v1.6: with or without a photo; the value stays 'photo' for older data). Optional, so older data loads unchanged. The photo itself is never stored. */
  source?: 'photo'
  /** v1.10: items logged together from one AI estimate share a groupId (Home shows them as one row). Optional, so older entries stay single rows. */
  groupId?: string
  /** v1.10: the AI's name for the whole meal (e.g. "Nasi ayam goreng"), on every item of the group. */
  groupName?: string
}

export type ExerciseEntry = {
  id: string
  date: string
  activityId: string | null // null = quick add (e.g. from a watch)
  name: string
  minutes: number
  intensity: Intensity
  kcal: number // total burned for this entry
  createdAt: number
}

/** Frozen numbers for a closed day (manual "Close day" or auto at midnight). */
export type DaySummary = {
  bmr: number
  movement: number
  /** BMR x 1.2 on days closed with Movement off by v1.2.1 to v1.3 (kept as closed). Absent on other days, and never set since v1.3.1. */
  baseBurn?: number
  burned: number
  eaten: number
  balance: number // positive = deficit
  goal: number
  protein: number
  closedAt: number
  auto: boolean
}

/** v2 (app v1.1) added Profile.goalWeightKg and Profile.pace. v1 data is migrated on load and on restore. */
export const STATE_VERSION = 2
export type State = {
  version: typeof STATE_VERSION
  profile: Profile | null
  entries: Entry[]
  exercises: ExerciseEntry[]
  closedDays: Record<string, DaySummary>
  favourites: string[]
}
