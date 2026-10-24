import type { Activity, DaySummary, Entry, ExerciseEntry, MacroOverrides, Macros, Pace, Profile, Sex, State } from './types'

export const ACTIVITY: Record<Activity, { label: string; factor: number }> = {
  sedentary: { label: 'Sedentary (desk job, little exercise)', factor: 1.2 },
  light: { label: 'Light (exercise 1 to 3 days a week)', factor: 1.375 },
  moderate: { label: 'Moderate (3 to 5 days a week)', factor: 1.55 },
  active: { label: 'Active (6 to 7 days a week)', factor: 1.725 },
  very: { label: 'Very active (physical job or 2x training)', factor: 1.9 },
}

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

export const KCAL_PER_KG = 7700

export const PROTEIN_PER_KG = 1.6 // of goal weight
export const PROTEIN_MIN_PER_KG = 1.2 // protein is lowered towards this before carbs drop under the floor
export const FAT_SHARE = 0.25 // of the daily target
export const FAT_FLOOR_PER_KG = 0.6 // of goal weight; fat never defaults below this
export const CARB_FLOOR = 100 // g
export const DEFICIT_CAP = 0.2 // of the plan base (BMR + movement, or BMR with Movement off)

export const PACE: Record<Pace, { label: string; kg: number }> = {
  gentle: { label: 'Gentle', kg: 0.25 },
  standard: { label: 'Standard', kg: 0.5 },
  faster: { label: 'Faster', kg: 0.75 },
}
export const PACES = Object.keys(PACE) as Pace[]

/**
 * v1.1 macros for a daily target (pure, for unit tests).
 * Protein = round(1.6 x goal weight). Fat = max(25% of target, 0.6 g x goal weight) (kcal kept unrounded).
 * Carbs = (target - protein x 4 - fat kcal) / 4, never under 100 g: protein drops first (down to 1.2 g/kg),
 * then carbs are held at 100 g and the target is raised to fit. Overrides are used as typed.
 */
export function macroPlan(target: number, goalWeightKg: number, o: MacroOverrides = { protein: null, carbs: null, fat: null }) {
  const fatKcalAt = (t: number) => (o.fat != null ? o.fat * 9 : Math.max(FAT_SHARE * t, FAT_FLOOR_PER_KG * goalWeightKg * 9))
  const carbsAt = (t: number, p: number) => (t - p * 4 - fatKcalAt(t)) / 4
  let protein = o.protein ?? Math.round(PROTEIN_PER_KG * goalWeightKg)
  if (o.carbs != null) return { target, protein, fat: Math.round(fatKcalAt(target) / 9), carbs: o.carbs, adjusted: false }
  let adjusted = false
  if (carbsAt(target, protein) < CARB_FLOOR && o.protein == null) {
    protein = Math.max(Math.round(PROTEIN_MIN_PER_KG * goalWeightKg), Math.floor((target - fatKcalAt(target) - CARB_FLOOR * 4) / 4))
    adjusted = true
  }
  if (carbsAt(target, protein) < CARB_FLOOR) {
    // Hold carbs at the floor and raise the target until protein + fat + 100 g carbs fit.
    const fixed = protein * 4 + CARB_FLOOR * 4
    let t: number
    if (o.fat != null) t = fixed + o.fat * 9
    else {
      const share = fixed / (1 - FAT_SHARE) // fat at 25% of the new target
      t = FAT_SHARE * share >= FAT_FLOOR_PER_KG * goalWeightKg * 9 ? share : fixed + FAT_FLOOR_PER_KG * goalWeightKg * 9
    }
    target = Math.ceil(t - 1e-9)
    adjusted = true
  }
  return { target, protein, fat: Math.round(fatKcalAt(target) / 9), carbs: Math.round(carbsAt(target, protein)), adjusted }
}

/** v1 split kept for reference: callers now use macroPlan. */
export function splitMacros(target: number, goalWeightKg: number, o: MacroOverrides) {
  const { protein, carbs, fat } = macroPlan(target, goalWeightKg, o)
  return { protein, carbs, fat }
}

export type PlanInput = Pick<Profile, 'sex' | 'bmr' | 'activity' | 'includeMovement' | 'goal' | 'pace' | 'goalWeightKg' | 'macros'>

/** Pace in kcal a day before the cap (7,700 kcal per kg). */
export const paceKcal = (pace: Pace) => (PACE[pace].kg * KCAL_PER_KG) / 7

/**
 * v1.2 lowest daily target: 1,500 kcal for men, 1,200 for women. Any other or missing value gets the lower
 * 1,200 (the app only offers male and female today; this keeps older or hand-edited data safe).
 */
export const targetFloor = (sex: Sex | string | undefined) => (sex === 'male' ? 1500 : 1200)

/**
 * Daily target.
 * Plan base: BMR + movement when Movement is on, plain BMR when it is off (v1.3.1; v1.2 to v1.3 used BMR x 1.2).
 * Lose: base - pace kcal, the deficit capped at 20% of the plan base. Gain: the same pace as a surplus, capped at 20%.
 * Keep: the plan base.
 * Floor (v1.2): never under 1,500 kcal (men) / 1,200 (women). With Movement on the v1.1 BMR floor is kept as well,
 * so nothing changes there. The macro carb floor can still raise the target.
 * planDeficit is what the plan takes off its base (base - target, negative for a surplus).
 * dailyGoal is the balance goal against what Home counts as the burn (homeBase), which is the plan base
 * (BMR with Movement off), so dailyGoal = planDeficit. Keep = 0, Lose = the deficit, Gain = minus the surplus.
 */
export function dailyPlan(p: PlanInput) {
  const movement = movementKcal(p)
  const base = p.bmr + movement
  const planBase = p.includeMovement ? base : p.bmr
  const want = paceKcal(p.pace)
  const cap = DEFICIT_CAP * planBase
  const floor = p.includeMovement ? Math.max(p.bmr, targetFloor(p.sex)) : targetFloor(p.sex)
  let target = Math.round(planBase)
  if (p.goal === 'lose') target = Math.round(planBase - Math.min(want, cap))
  if (p.goal === 'gain') target = Math.round(planBase + Math.min(want, cap))
  const floored = target < floor
  target = Math.max(floor, target)
  const m = macroPlan(target, p.goalWeightKg, p.macros)
  return {
    bmr: p.bmr, movement, base, planBase: Math.round(planBase), planDeficit: Math.round(planBase) - m.target, floor, floored,
    target: m.target, dailyGoal: Math.round(planBase) - m.target, protein: m.protein, carbs: m.carbs, fat: m.fat, adjusted: m.adjusted,
    capped: p.goal !== 'keep' && want > cap,
  }
}

export function macroTargets(p: PlanInput) {
  const { protein, carbs, fat } = dailyPlan(p)
  return { protein, carbs, fat }
}

/** Grams over target, or 0. Ignores rounding noise under half a gram. */
export const overBy = (value: number, target: number) => (target > 0 && value - target >= 0.5 ? Math.round(value - target) : 0)

export const fmt = (n: number) => Math.round(n).toLocaleString('en-US')

// ---------- Daily balance (v1) ----------

export const calcBmr = (p: Body) => Math.round(bmr(p.sex, p.weightKg, p.heightCm, p.age))

/** NEAT: everyday movement on top of BMR, from the activity level. */
export function movementKcal(p: Pick<Profile, 'bmr' | 'activity' | 'includeMovement'>): number {
  return p.includeMovement ? Math.round(p.bmr * (ACTIVITY[p.activity].factor - 1)) : 0
}

/** Food target on a rest day (v1.1: from the pace, see dailyPlan). */
export const foodBudget = (p: PlanInput): number => dailyPlan(p).target

/**
 * What Home counts as the day's burn before exercise, the same base the food target is planned from:
 * Movement on: BMR + movement. Movement off (v1.3.1): plain BMR (v1.2.1 to v1.3 used a BMR x 1.2 "base burn").
 */
export function homeBase(p: Pick<Profile, 'bmr' | 'activity' | 'includeMovement'>): number {
  return p.includeMovement ? p.bmr + movementKcal(p) : p.bmr
}

/**
 * baseBurn (BMR x 1.2) is only on days closed with Movement off by v1.2.1 to v1.3; it replaces BMR + movement in
 * their balance. Those closed days keep the numbers they were closed with. v1.3.1 never sets it (Movement off = BMR).
 */
export type DayBalance = { bmr: number; movement: number; baseBurn?: number; burned: number; eaten: number; balance: number; goal: number; protein: number; logged: boolean }

/** Burn before exercise for a day: the base burn when set, else BMR + movement. */
export const dayBase = (d: Pick<DayBalance, 'bmr' | 'movement' | 'baseBurn'>) => d.baseBurn ?? d.bmr + d.movement

export function sumExercise(list: ExerciseEntry[]): number {
  return list.reduce((s, e) => s + e.kcal, 0)
}

/** Live balance for a date from the current profile: home base (BMR + movement, or BMR) + burned - eaten. */
export function liveDay(state: Pick<State, 'entries' | 'exercises'>, profile: Profile, date: string): DayBalance {
  const entries = state.entries.filter((e) => e.date === date)
  const ex = state.exercises.filter((e) => e.date === date)
  const m = sumEntries(entries)
  const burned = sumExercise(ex)
  const movement = movementKcal(profile)
  const base = homeBase(profile)
  return {
    bmr: profile.bmr, movement, burned, eaten: m.kcal, protein: m.protein,
    balance: base + burned - m.kcal, goal: profile.dailyGoal,
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
  const { bmr, movement, baseBurn, burned, eaten, balance, goal, protein } = d
  return { bmr, movement, ...(baseBurn != null ? { baseBurn } : {}), burned, eaten, balance, goal, protein, closedAt: Date.now(), auto }
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



// ---------- Nutrition (v1.2) ----------

/** Whole-number percentage of a target (0 when there is no target). */
export const pctOf = (value: number, target: number) => (target > 0 ? Math.round((value / target) * 100) : 0)

export const KCAL_PER_G = { protein: 4, carbs: 4, fat: 9 } as const
type Grams = { protein: number; carbs: number; fat: number }

/**
 * Share of calories from protein, carbs and fat (4/4/9 kcal per gram) as whole percentages that always sum to 100.
 * Each share is rounded, then any rounding gap (+-1 or 2) goes to the largest segment. Ties for largest go to the
 * first in protein, carbs, fat order. Returns null when there are no macro calories (nothing logged).
 */
export function macroSplit(g: Grams): Grams | null {
  const kcal = { protein: Math.max(0, g.protein) * 4, carbs: Math.max(0, g.carbs) * 4, fat: Math.max(0, g.fat) * 9 }
  const total = kcal.protein + kcal.carbs + kcal.fat
  if (!(total > 0)) return null
  const keys = ['protein', 'carbs', 'fat'] as const
  const out = { protein: 0, carbs: 0, fat: 0 }
  for (const k of keys) out[k] = Math.round((kcal[k] / total) * 100)
  const gap = 100 - (out.protein + out.carbs + out.fat)
  const largest = keys.reduce((a, k) => (kcal[k] > kcal[a] ? k : a), keys[0])
  out[largest] += gap
  return out
}

// ---------- History chart scale (v1.1) ----------

export const ceil500 = (n: number) => Math.ceil(n / 500) * 500

/**
 * Symmetric kcal scale for the balance chart (same reach up and down from zero).
 * scale = max(500, 2 x |goal|, robust max) rounded up to 500, where the robust max ignores the largest 10% of
 * |values| (at least one) when there are two or more bars. Bars past the scale are drawn clipped with a cap.
 * So one +2,500 spike does not squash a week of +/-400 days, but two or more big days still set the scale.
 */
export function balanceScale(values: number[], goal: number): number {
  const abs = values.map((v) => Math.abs(v)).sort((a, b) => b - a)
  const drop = Math.max(1, Math.floor(abs.length / 10))
  const robust = abs.length > drop ? abs[drop] : (abs[0] ?? 0)
  return Math.max(500, ceil500(2 * Math.abs(goal)), ceil500(robust))
}

/** Protein chart scale: max(1.25 x target, biggest value). */
export const proteinScale = (values: number[], target: number) => Math.max(target * 1.25, ...values, 1)
