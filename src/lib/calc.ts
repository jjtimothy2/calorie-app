import type { Activity, Entry, Goal, Macros, Profile, Sex } from './types'

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

export function tdee(p: Omit<Profile, 'target'>): number {
  return bmr(p.sex, p.weightKg, p.heightCm, p.age) * ACTIVITY[p.activity].factor
}

/** ~7,700 kcal per kg of body weight; rounded to the nearest 0.25 kg a week. */
export function weeklyKg(dailyDelta: number): number {
  return Math.round(((Math.abs(dailyDelta) * 7) / 7700) * 4) / 4
}

export function computeTarget(p: Omit<Profile, 'target'>): number {
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

/** Simple macro split for display: 25% protein, 45% carbs, 30% fat. */
export function macroTargets(target: number) {
  return {
    protein: Math.round((target * 0.25) / 4),
    carbs: Math.round((target * 0.45) / 4),
    fat: Math.round((target * 0.3) / 9),
  }
}

export const fmt = (n: number) => Math.round(n).toLocaleString('en-US')
