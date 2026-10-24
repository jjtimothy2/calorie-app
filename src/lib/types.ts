export type Sex = 'male' | 'female'
export type Goal = 'lose' | 'keep' | 'gain'
export type Activity = 'sedentary' | 'light' | 'moderate' | 'active' | 'very'
export type Meal = 'breakfast' | 'lunch' | 'dinner' | 'snacks'
/** Weight-change pace in kg a week. */
export type Pace = 'gentle' | 'standard' | 'faster'
export type Intensity = 'light' | 'moderate' | 'vigorous'

export const MEALS: Meal[] = ['breakfast', 'lunch', 'dinner', 'snacks']
export const MEAL_LABEL: Record<Meal, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  snacks: 'Snacks',
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
  /** Daily food target on a rest day (kcal), derived by dailyPlan(): plan base (BMR + movement, or BMR x 1.2 with movement off) minus the pace deficit (or plus surplus), never under the sex floor. */
  target: number
  /** Daily starting budget. Mifflin-St Jeor unless the user typed their own. */
  bmr: number
  bmrCustom: boolean
  /** Add NEAT (BMR x (activity factor - 1)) to the daily budget. */
  includeMovement: boolean
  /** Daily balance goal in kcal, derived: home base (BMR + movement, or BMR x 1.2 with movement off) - target. Positive = deficit (lose), 0 = keep, negative = surplus (gain). */
  dailyGoal: number
  /** v1.1: goal weight (kg) used for protein and the fat floor. Defaults to the current weight. */
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
  /** v1.2.1: BMR x 1.2 when the day was counted with Movement off. Absent on older days (they used BMR + movement). */
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
