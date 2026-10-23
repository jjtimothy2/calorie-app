export type Sex = 'male' | 'female'
export type Goal = 'lose' | 'keep' | 'gain'
export type Activity = 'sedentary' | 'light' | 'moderate' | 'active' | 'very'
export type Meal = 'breakfast' | 'lunch' | 'dinner' | 'snacks'
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
  /** Food budget on a rest day (kcal). Kept in sync with BMR + movement - daily goal. */
  target: number
  /** Daily starting budget. Mifflin-St Jeor unless the user typed their own. */
  bmr: number
  bmrCustom: boolean
  /** Add NEAT (BMR x (activity factor - 1)) to the daily budget. */
  includeMovement: boolean
  /** Daily balance goal in kcal. Positive = deficit (lose), 0 = keep, negative = surplus (gain). */
  dailyGoal: number
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
  burned: number
  eaten: number
  balance: number // positive = deficit
  goal: number
  protein: number
  closedAt: number
  auto: boolean
}

export type State = {
  version: 1
  profile: Profile | null
  entries: Entry[]
  exercises: ExerciseEntry[]
  closedDays: Record<string, DaySummary>
  favourites: string[]
}
