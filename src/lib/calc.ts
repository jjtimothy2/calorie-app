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

export const PROTEIN_PER_KG = 1.6 // of current weight (v1.3.2; goal weight before)
export const PROTEIN_MIN_PER_KG = 1.2 // protein is lowered towards this before carbs drop under the floor
export const FAT_SHARE = 0.25 // of maintenance calories (v1.3.2; of the daily target before)
export const FAT_FLOOR_PER_KG = 0.6 // of current weight; fat never defaults below this
export const CARB_FLOOR = 100 // g

/** v1.1 to v1.12 paces, kg a week. Only used to migrate older data to a goal date (see migrate.ts). */
export const PACE: Record<Pace, { label: string; kg: number }> = {
  gentle: { label: 'Gentle', kg: 0.25 },
  standard: { label: 'Standard', kg: 0.5 },
  faster: { label: 'Faster', kg: 0.75 },
}
export const PACES = Object.keys(PACE) as Pace[]

/**
 * Macro goals (pure, for unit tests). v1.3.2: built on MAINTENANCE calories at the current weight (the burn Home
 * counts before logged exercise: BMR, or BMR + movement), not on the deficit or surplus target, and never on exercise.
 * Protein = round(1.6 x current weight). Fat = max(25% of maintenance, 0.6 g x current weight) (kcal kept unrounded).
 * Carbs = (maintenance - protein x 4 - fat kcal) / 4, never under 100 g: protein drops first (down to 1.2 g/kg),
 * then carbs are held at 100 g and the kcal the split is built on is raised to fit (returned as kcal; this never
 * changes the calorie target). That fallback only triggers for a low BMR against a heavy weight or a big typed
 * fat value. Overrides are used as typed.
 */
export function macroPlan(maintenance: number, weightKg: number, o: MacroOverrides = { protein: null, carbs: null, fat: null }) {
  let kcal = maintenance
  const fatKcalAt = (t: number) => (o.fat != null ? o.fat * 9 : Math.max(FAT_SHARE * t, FAT_FLOOR_PER_KG * weightKg * 9))
  const carbsAt = (t: number, p: number) => (t - p * 4 - fatKcalAt(t)) / 4
  let protein = o.protein ?? Math.round(PROTEIN_PER_KG * weightKg)
  if (o.carbs != null) return { kcal, protein, fat: Math.round(fatKcalAt(kcal) / 9), carbs: o.carbs, adjusted: false }
  let adjusted = false
  if (carbsAt(kcal, protein) < CARB_FLOOR && o.protein == null) {
    protein = Math.max(Math.round(PROTEIN_MIN_PER_KG * weightKg), Math.floor((kcal - fatKcalAt(kcal) - CARB_FLOOR * 4) / 4))
    adjusted = true
  }
  if (carbsAt(kcal, protein) < CARB_FLOOR) {
    // Hold carbs at the floor and raise the split's kcal until protein + fat + 100 g carbs fit.
    const fixed = protein * 4 + CARB_FLOOR * 4
    let t: number
    if (o.fat != null) t = fixed + o.fat * 9
    else {
      const share = fixed / (1 - FAT_SHARE) // fat at 25% of the raised kcal
      t = FAT_SHARE * share >= FAT_FLOOR_PER_KG * weightKg * 9 ? share : fixed + FAT_FLOOR_PER_KG * weightKg * 9
    }
    kcal = Math.ceil(t - 1e-9)
    adjusted = true
  }
  return { kcal, protein, fat: Math.round(fatKcalAt(kcal) / 9), carbs: Math.round(carbsAt(kcal, protein)), adjusted }
}

/** v1 split kept for reference: callers now use macroPlan. */
export function splitMacros(maintenance: number, weightKg: number, o: MacroOverrides) {
  const { protein, carbs, fat } = macroPlan(maintenance, weightKg, o)
  return { protein, carbs, fat }
}

export type PlanInput = Pick<Profile, 'sex' | 'bmr' | 'activity' | 'includeMovement' | 'goal' | 'weightKg' | 'macros' | 'goalWeightKg' | 'goalDate' | 'planFrom'>
export type GoalInput = Pick<Profile, 'goal' | 'weightKg' | 'goalWeightKg' | 'goalDate' | 'planFrom'>

/** Shortest plan the maths uses: a goal date under a week away (or already gone) is planned as 7 days. */
export const MIN_PLAN_DAYS = 7
/** Soft warning: more than 1% of body weight a week. */
export const FAST_WEEKLY_SHARE = 0.01

/**
 * Minimum intake: 1,500 kcal a day for men, 1,200 for women. Any other or missing value gets the lower 1,200.
 * v1.2 to v1.12 this was a hard floor the target could never go under, v1.13 to v1.14 only a soft warning. v1.15: it
 * limits the size of a Lose deficit (safeDeficit) and is shown openly. It never raises a saved target by itself.
 */
export const targetFloor = (sex: Sex | string | undefined) => (sex === 'male' ? 1500 : 1200)

/** Whole days from a to b (YYYY-MM-DD local dates), b minus a. */
export const daysBetween = (a: string, b: string) => Math.round((keyDate(b).getTime() - keyDate(a).getTime()) / 86_400_000)

/** Calendar months later, clamped to the month's last day (31 Jan + 1 month = 28 or 29 Feb). */
export function addMonths(key: string, n: number): string {
  const [y, m, d] = key.split('-').map(Number)
  const last = new Date(y, m - 1 + n + 1, 0).getDate()
  return dateKey(new Date(y, m - 1 + n, Math.min(d, last)))
}

/** kg still to go from the plan start, in the goal's direction. 0 for Keep or once the goal weight is reached. */
export function kgToGo(p: GoalInput): number {
  if (p.goal === 'keep' || !p.goalDate) return 0
  const left = p.goal === 'lose' ? p.planFrom.kg - p.goalWeightKg : p.goalWeightKg - p.planFrom.kg
  return Math.max(0, Math.round(left * 100) / 100)
}

/** Days the plan has left: plan start to goal date, never under MIN_PLAN_DAYS. 0 for Keep. */
export const planDays = (p: GoalInput) => (p.goalDate ? Math.max(MIN_PLAN_DAYS, daysBetween(p.planFrom.date, p.goalDate)) : 0)

/** Daily gap (kcal) = kg to go x 7,700 / days to the goal date. Unrounded. */
export function dailyGap(p: GoalInput): number {
  const kg = kgToGo(p)
  return kg > 0 ? (kg * KCAL_PER_KG) / planDays(p) : 0
}

/** True once a Lose or Gain goal weight is reached (the current weight is at or past it). */
export const goalReached = (p: GoalInput) =>
  p.goal !== 'keep' && !!p.goalDate && (p.goal === 'lose' ? p.weightKg <= p.goalWeightKg : p.weightKg >= p.goalWeightKg)

/**
 * Daily target (goal-date plan).
 * Plan base: BMR + movement when Movement is on, plain BMR when it is off (v1.3.1).
 * Gap: |plan start weight - goal weight| x 7,700 / days from the plan start to the goal date (see dailyGap).
 * Lose: base - gap. Gain: base + gap. Keep (or a reached goal): the base. No floor: a low target only warns (paceCheck).
 * planDeficit is what the plan takes off its base (negative for a surplus); dailyGoal = planDeficit, the balance goal
 * against what Home counts as the burn (homeBase).
 * Macros (v1.3.2) come from maintenance = the plan base, at the current weight, and don't follow the target.
 */
export function dailyPlan(p: PlanInput) {
  const movement = movementKcal(p)
  const base = p.bmr + movement
  const planBase = Math.round(p.includeMovement ? base : p.bmr)
  const gap = dailyGap(p)
  let target = planBase
  // Never under 0 (a goal date days away can ask for more than the whole burn); the warning says why.
  if (p.goal === 'lose') target = Math.max(0, Math.round(planBase - gap))
  if (p.goal === 'gain') target = Math.round(planBase + gap)
  const planDeficit = planBase - target
  const m = macroPlan(planBase, p.weightKg, p.macros)
  return {
    bmr: p.bmr, movement, base, planBase, maintenance: planBase, planDeficit, target, dailyGoal: planDeficit,
    gap, days: planDays(p), kgToGo: kgToGo(p), weeklyKg: (gap * 7) / KCAL_PER_KG,
    protein: m.protein, carbs: m.carbs, fat: m.fat, macroKcal: m.kcal, adjusted: m.adjusted,
  }
}

export type PaceCheck = {
  /** More than 1% of body weight a week. */
  fast: boolean
  /** Lose only: the target is under 1,500 (men) / 1,200 (women). */
  low: boolean
  warn: boolean
  /** Earliest goal date that clears both checks, or null when no date can (the base is already at or under the line). */
  suggest: string | null
}

/**
 * Pace check. Checks use the plan start weight. Gain: a soft warning over 1% of body weight a week (never blocks).
 * v1.15 Lose: the safe deficit cap (safeDeficit), with suggest = the earliest date that fits it.
 */
export function paceCheck(p: PlanInput, plan = dailyPlan(p)): PaceCheck {
  const none = { fast: false, low: false, warn: false, suggest: null }
  if (p.goal === 'keep' || plan.gap === 0) return none
  // v1.15: Lose plans use the safe deficit cap (safeDeficit), so every Lose screen agrees on what is safe.
  if (p.goal === 'lose') {
    const s = safeDeficit(p, plan)
    return { fast: s.fast, low: s.low, warn: s.unsafe, suggest: s.safeDate }
  }
  // Gain (as in v1.13): only the 1% a week check. Earliest date: days >= kg x 7 / (1% of weight).
  const fast = plan.weeklyKg > FAST_WEEKLY_SHARE * p.planFrom.kg + 1e-9
  if (!fast) return none
  let days = Math.max(MIN_PLAN_DAYS, Math.ceil((plan.kgToGo * 7) / (FAST_WEEKLY_SHARE * p.planFrom.kg) - 1e-9))
  // Rounding: step on until the date really clears the check (at most a day or two).
  for (let i = 0; i < 5; i++) {
    const c = dailyPlan({ ...p, goalDate: addDays(p.planFrom.date, days) })
    if (c.weeklyKg <= FAST_WEEKLY_SHARE * p.planFrom.kg + 1e-9) break
    days++
  }
  return { fast, low: false, warn: true, suggest: addDays(p.planFrom.date, days) }
}

/**
 * v1.15: the deficit a Lose plan takes off its plan base, in whole kcal. One rounding for every screen: it is
 * planBase - round(planBase - gap), so it is exactly dailyPlan's planDeficit (what Home measures against) whenever the
 * gap fits in the plan base, and "You'd eat" = planBase - deficit is exactly the target.
 */
export const deficitOf = (planBase: number, gap: number) => (gap > 0 ? planBase - Math.round(planBase - gap) : 0)

/** v1.15: plans further out than this get no "safer date" (the plan base is too close to the floor to make room). */
export const MAX_SAFE_DAYS = 3650

export type SafeDeficit = {
  /** The deficit this date asks for (deficitOf). Can be more than the plan base, then eat is negative. */
  deficit: number
  /** planBase - deficit. */
  eat: number
  planBase: number
  /** The safe cap, whole kcal: floor(min(capPace, capFloor)), never under 0. */
  cap: number
  /** 1% of the plan start weight a week, in kcal a day: kg x 0.01 x 7,700 / 7. */
  capPace: number
  /** planBase - floor: the most that still leaves the floor to eat. */
  capFloor: number
  /** 1,500 kcal for men, 1,200 for women. Only limits the deficit, never raises a target. */
  floor: number
  /** The deficit is over the cap. */
  unsafe: boolean
  /** Over the 1% a week part of the cap. */
  fast: boolean
  /** Over the floor part of the cap (would leave under the floor to eat). */
  low: boolean
  /** Earliest goal date (from the plan start) whose deficit fits the cap. Null when safe, or when no date can. */
  safeDate: string | null
}

/**
 * v1.15 safe cap for a Lose plan: deficit <= min(weight x 0.01 x 7,700 / 7, plan base - floor). The weight is the plan
 * start weight. dailyPlan itself is not capped (saved plans keep their numbers); the cap only picks the date.
 * Gain and Keep: never unsafe here (Gain keeps the v1.13 pace check).
 */
export function safeDeficit(p: PlanInput, plan = dailyPlan(p)): SafeDeficit {
  const floor = targetFloor(p.sex)
  const capPace = (p.planFrom.kg * FAST_WEEKLY_SHARE * KCAL_PER_KG) / 7
  const capFloor = plan.planBase - floor
  const cap = Math.max(0, Math.floor(Math.min(capPace, capFloor) + 1e-9))
  const lose = p.goal === 'lose' && plan.gap > 0
  const deficit = lose ? deficitOf(plan.planBase, plan.gap) : 0
  const out = { deficit, eat: plan.planBase - deficit, planBase: plan.planBase, cap, capPace, capFloor, floor }
  const unsafe = lose && deficit > cap
  if (!unsafe) return { ...out, unsafe: false, fast: false, low: false, safeDate: null }
  const fast = deficit > Math.floor(capPace + 1e-9)
  const low = deficit > capFloor
  return { ...out, unsafe, fast, low, safeDate: safeDateFor(p, cap, plan.planBase) }
}

/** v1.15: the plan a safer date gives (same rounding as every other Lose screen). Null when there is no safer date. */
export function saferPlan(p: PlanInput, s = safeDeficit(p)) {
  if (!s.safeDate) return null
  const plan = dailyPlan({ ...p, goalDate: s.safeDate })
  const deficit = deficitOf(plan.planBase, plan.gap)
  return { date: s.safeDate, deficit, eat: plan.planBase - deficit, weeklyKg: plan.weeklyKg, plan }
}

/** Earliest date from the plan start whose deficit (deficitOf) is at most cap. */
function safeDateFor(p: PlanInput, cap: number, planBase: number): string | null {
  if (cap < 1) return null
  const k = kgToGo(p) * KCAL_PER_KG
  // deficitOf(base, k / days) <= cap  <=>  k / days <= cap + 0.5, so start there and check (float rounding).
  let days = Math.max(MIN_PLAN_DAYS, Math.ceil(k / (cap + 0.5) - 1e-9))
  while (days > MIN_PLAN_DAYS && deficitOf(planBase, k / (days - 1)) <= cap) days--
  while (deficitOf(planBase, k / days) > cap) days++
  if (days > MAX_SAFE_DAYS) return null
  return addDays(p.planFrom.date, days)
}

/** Where the plan line says the weight should be on a day (straight line from the plan start to the goal). */
export function expectedKg(p: GoalInput, date: string): number {
  if (p.goal === 'keep' || !p.goalDate) return p.planFrom.kg
  const total = daysBetween(p.planFrom.date, p.goalDate)
  if (total <= 0) return p.goalWeightKg
  const t = Math.min(1, Math.max(0, daysBetween(p.planFrom.date, date) / total))
  return p.planFrom.kg + (p.goalWeightKg - p.planFrom.kg) * t
}

/** Ahead or behind counts past 0.2 kg either side of the plan line (scale noise). */
export const ON_TRACK_KG = 0.2
export type WeighIn = 'reached' | 'ahead' | 'onTrack' | 'behind'
/** How a new weigh-in compares with the plan it was made under (before re-planning). */
export function weighInStatus(p: GoalInput, kg: number, date: string): WeighIn | null {
  if (p.goal === 'keep' || !p.goalDate) return null
  if (p.goal === 'lose' ? kg <= p.goalWeightKg : kg >= p.goalWeightKg) return 'reached'
  const toward = (expectedKg(p, date) - kg) * (p.goal === 'lose' ? 1 : -1)
  return toward > ON_TRACK_KG ? 'ahead' : toward < -ON_TRACK_KG ? 'behind' : 'onTrack'
}

/** "27 Apr 2027" */
export const longDay = (key: string) => keyDate(key).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
/** "1 Oct" */
export const shortDay = (key: string) => keyDate(key).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
/** Weekly change for display, to 0.1 kg ("0.4"). Under 0.05 shows as "under 0.1". */
export const kgWeek = (weekly: number) => (weekly < 0.05 ? 'under 0.1' : (Math.round(weekly * 10) / 10).toFixed(1))

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

/** Food target on a rest day (from the goal-date plan, see dailyPlan). */
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

/** v1.12: a YYYY-MM-DD key as a local Date. */
export const keyDate = (k: string) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d) }
/** v1.12: "Today", "Yesterday", or a short date such as "Mon 26 Oct". */
export function dayName(date: string, today = dateKey()): string {
  if (date === today) return 'Today'
  if (date === addDays(today, -1)) return 'Yesterday'
  return keyDate(date).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
}
