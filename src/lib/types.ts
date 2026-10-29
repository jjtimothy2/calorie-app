export type Sex = 'male' | 'female'
export type Goal = 'lose' | 'keep' | 'gain'
export type Activity = 'sedentary' | 'light' | 'moderate' | 'active' | 'very'
export type Meal = 'breakfast' | 'lunch' | 'dinner' | 'snacks' | 'beverages'
/** v1.1 to v1.12: weight-change pace in kg a week. Only read when migrating older data (goal date replaced it). */
export type Pace = 'gentle' | 'standard' | 'faster'
/** A weigh-in. date is YYYY-MM-DD local. */
export type WeightEntry = { date: string; kg: number }
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
  /** Daily food target on a rest day (kcal), derived by dailyPlan(): plan base (BMR + movement, or plain BMR with movement off) minus the daily gap to the goal weight (plus for gain). No floor since the goal-date plan. */
  target: number
  /** Daily starting budget. Mifflin-St Jeor unless the user typed their own. */
  bmr: number
  bmrCustom: boolean
  /** Add NEAT (BMR x (activity factor - 1)) to the daily budget. */
  includeMovement: boolean
  /** Daily balance goal in kcal, derived: home base (BMR + movement, or BMR with movement off) - target. Positive = deficit (lose), 0 = keep, negative = surplus (gain). */
  dailyGoal: number
  /** Goal weight (kg). Asked in onboarding for Lose and Gain; equals the current weight for Keep. Macros use the current weight. */
  goalWeightKg: number
  /** Goal-date plan: the day to reach goalWeightKg (YYYY-MM-DD local). null for Keep. */
  goalDate: string | null
  /**
   * Where the current plan starts: the weight and day it was last worked out (onboarding, a goal edit or the latest
   * weigh-in). The daily gap is |kg - goal| x 7,700 / days from date to goalDate, so the target only moves when the
   * plan is re-planned, not every day.
   */
  planFrom: WeightEntry
  /** Set when the goal weight and date were derived from an old pace on migration (state v2 to v3). Cleared on any goal edit. */
  goalAssumed?: boolean
  /** 2: the assumed goal was derived from the old pace with no floor (v1.13.1). Missing on a v1.13 assumed goal, which gets re-derived once. */
  goalAssumedV?: 2
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

/**
 * v2 (app v1.1) added Profile.goalWeightKg and Profile.pace. v3 (goal-date plan) replaced pace with goalDate + planFrom
 * and added the weight log. v1 and v2 data are migrated on load and on restore.
 */
export const STATE_VERSION = 3
export type State = {
  version: typeof STATE_VERSION
  profile: Profile | null
  entries: Entry[]
  exercises: ExerciseEntry[]
  closedDays: Record<string, DaySummary>
  favourites: string[]
  /** v3: dated weigh-ins, oldest first, one per day. */
  weights: WeightEntry[]
  /**
   * v1.15 (optional, v3): the day the Home "safer date" card for a plan over the safe cap was dismissed. Once set, the
   * card never shows again. Missing in older data, which loads unchanged.
   */
  capCardDismissed?: string
}
