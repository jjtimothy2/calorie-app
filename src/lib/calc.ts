import type { Activity, DaySummary, Entry, ExerciseEntry, Goal, Macros, Profile, Sex, State } from './types'

export const ACTIVITY: Record<Activity, { label: string; factor: number }> = {
  sedentary: { label: 'Sedentary (desk job, little exercise)', factor: 1.2 },
  light: { label: 'Light (exercise 1 to 3 days a week)', factor: 1.375 },
  moderate: { label: 'Moderate (3 to 5 days a week)', factor: 1.55 },
  active: { label: 'Active (6 to 7 days a week)', factor: 1.725 },
  very: { label: 'Very active (physical job or 2x training)', factor: 1.9 },
}

export const GOAL_ADJUST: Record<Goal, number> = { lose: -500, keep: 0, gain: 300 }

/** Mifflin-St Jeor BMR */
export function bmr(sex: Sex, weightKg: number, heightCm: number, age: number): number {
  return 10 * weightKg + 6.25 * heightCm - 5 * age + (sex === 'male' ? 5 : -161)
}

export type Body = Pick<Profile, 'age' | 'sex' | 'heightCm' | 'weightKg' | 'activity' | 'goal'>

export function tdee(p: Body): number {
  return bmr(p.sex, p.weightKg, p.heightCm, p.age) * ACTIVITY[p.activity].factor
}

/** ~7,700 kcal per kg of body weight; rounded to the nearest 0.25 kg a week. */
export function weeklyKg(dailyDelta: number): number {
  return Math.round(((Math.abs(dailyDelta) * 7) / 7700) * 4) / 4
}

export function computeTarget(p: Body): number {
  const raw = tdee(p) + GOAL_ADJUST[p.goal]
  const floor = p.sex === 'male' ? 1500 : 1200
  return Math.round(Math.max(floor, raw) / 10) * 10
}

export function entryTotals(e: Entry): Macros {
  return {
    kcal: Math.round(e.kcal * e.qty),
    protein: e.protein * e.qty,
    carbs: e.carbs * e.qty,
    fat: e.fat * e.qty,
  }
}

export function sumEntries(entries: Entry[]): Macros {
  return entries.reduce<Macros>(
    (acc, e) => {
      const t = entryTotals(e)
      return {
        kcal: acc.kcal + t.kcal,
        protein: acc.protein + t.protein,
        carbs: acc.carbs + t.carbs,
        fat: acc.fat + t.fat,
      }
    },
    { kcal: 0, protein: 0, carbs: 0, fat: 0 },
  )
}

export function dateKey(d: Date = new Date()): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function addDays(key: string, n: number): string {
  const [y, m, d] = key.split('-').map(Number)
  return dateKey(new Date(y, m - 1, d + n))
}

export function lastNDays(n: number, today = dateKey()): string[] {
  return Array.from({ length: n }, (_, i) => addDays(today, i - (n - 1)))
}

/** Consecutive days with at least one entry, ending today (or yesterday if today is still empty). */
export function streak(entries: Entry[], today = dateKey()): number {
  const days = new Set(entries.map((e) => e.date))
  let cur = days.has(today) ? today : addDays(today, -1)
  let n = 0
  while (days.has(cur)) {
    n++
    cur = addDays(cur, -1)
  }
  return n
}

export function defaultMeal(hour = new Date().getHours()) {
  if (hour < 10) return 'breakfast' as const
  if (hour < 15) return 'lunch' as const
  if (hour < 21) return 'dinner' as const
  return 'snacks' as const
}

export const round1 = (n: number) => Math.round(n * 10) / 10

export const PROTEIN_PER_KG = 1.6
export const CARB_SHARE = 0.6 // of the calories left after protein; fat gets the rest

/** Macro targets with user overrides applied. Overriding protein re-splits the default carbs and fat. */
export function macroTargets(p: Profile) {
  const budget = foodBudget(p)
  const protein = p.macros.protein ?? Math.round(PROTEIN_PER_KG * p.weightKg)
  const rest = Math.max(0, budget - protein * 4)
  return {
    protein,
    carbs: p.macros.carbs ?? Math.round((rest * CARB_SHARE) / 4),
    fat: p.macros.fat ?? Math.round((rest * (1 - CARB_SHARE)) / 9),
  }
}

export const fmt = (n: number) => Math.round(n).toLocaleString('en-US')

// ---------- Daily balance (v1) ----------

/** Daily balance goal from the onboarding goal. Positive = deficit. */
export const defaultDailyGoal = (g: Goal) => -GOAL_ADJUST[g]

export const calcBmr = (p: Body) => Math.round(bmr(p.sex, p.weightKg, p.heightCm, p.age))

/** NEAT: everyday movement on top of BMR, from the activity level. */
export function movementKcal(p: Pick<Profile, 'bmr' | 'activity' | 'includeMovement'>): number {
  return p.includeMovement ? Math.round(p.bmr * (ACTIVITY[p.activity].factor - 1)) : 0
}

/** Food budget on a rest day: what you can eat and still hit the daily goal. */
export function foodBudget(p: Pick<Profile, 'bmr' | 'activity' | 'includeMovement' | 'dailyGoal'>): number {
  return Math.max(0, p.bmr + movementKcal(p) - p.dailyGoal)
}

export type DayBalance = { bmr: number; movement: number; burned: number; eaten: number; balance: number; goal: number; protein: number; logged: boolean }

export function sumExercise(list: ExerciseEntry[]): number {
  return list.reduce((s, e) => s + e.kcal, 0)
}

/** Live balance for a date from the current profile: BMR + movement + burned - eaten. */
export function liveDay(state: Pick<State, 'entries' | 'exercises'>, profile: Profile, date: string): DayBalance {
  const entries = state.entries.filter((e) => e.date === date)
  const ex = state.exercises.filter((e) => e.date === date)
  const m = sumEntries(entries)
  const burned = sumExercise(ex)
  const movement = movementKcal(profile)
  return {
    bmr: profile.bmr, movement, burned, eaten: m.kcal, protein: m.protein,
    balance: profile.bmr + movement + burned - m.kcal, goal: profile.dailyGoal,
    logged: entries.length + ex.length > 0,
  }
}

/** Closed days use their frozen summary; open days are computed live. */
export function dayView(state: State, date: string): DayBalance & { closed: DaySummary | null } {
  const c = state.closedDays[date]
  if (c) return { ...c, logged: true, closed: c }
  return { ...liveDay(state, state.profile!, date), closed: null }
}

export function summarise(d: DayBalance, auto: boolean): DaySummary {
  const { bmr, movement, burned, eaten, balance, goal, protein } = d
  return { bmr, movement, burned, eaten, balance, goal, protein, closedAt: Date.now(), auto }
}

/** "Deficit 420 kcal" / "Surplus 180 kcal" / "Even" */
export function verdict(balance: number): string {
  const b = Math.round(balance)
  return b > 0 ? `Deficit ${fmt(b)} kcal` : b < 0 ? `Surplus ${fmt(-b)} kcal` : 'Even'
}

export function goalLabel(g: number): string {
  return g > 0 ? `${fmt(g)} kcal deficit` : g < 0 ? `${fmt(-g)} kcal surplus` : 'Break even'
}

/** Short message comparing the balance with the goal. */
export function goalMessage(balance: number, goal: number, done: boolean): string {
  const b = Math.round(balance)
  if (goal > 0) {
    if (b === goal) return `Right on your ${fmt(goal)} goal.${done ? ' Nice work.' : ''}`
    if (b >= goal) return `${fmt(b - goal)} kcal past your ${fmt(goal)} goal.${done ? ' Nice work.' : ''}`
    return done ? `You were ${fmt(goal - b)} kcal short of your ${fmt(goal)} goal.${b > 0 ? ' Still a good day.' : ''}` : `${fmt(goal - b)} kcal to go to your ${fmt(goal)} goal.`
  }
  if (goal < 0) {
    const need = -goal
    if (-b === need) return `Right on your ${fmt(need)} surplus goal.`
    if (-b >= need) return `${fmt(-b - need)} kcal past your ${fmt(need)} surplus goal.`
    return done ? `You were ${fmt(need + b)} kcal short of your ${fmt(need)} surplus goal.` : `Eat ${fmt(need + b)} kcal more to reach your ${fmt(need)} surplus goal.`
  }
  if (Math.abs(b) <= 100) return done ? 'Close to even. Right on goal.' : 'Close to even. Right on goal so far.'
  return b > 0 ? `${fmt(b)} kcal under break even.` : `${fmt(-b)} kcal over break even.`
}

export const KCAL_PER_KG = 7700
