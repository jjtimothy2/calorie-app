// v1.9: "My foods". A named quick add is saved as one of the user's own foods, under its own storage key so the
// v2 state shape (calorie-app:v2) never changes. Pure helpers (no React), so unit tests can import them.
import type { Macros } from './types'

export const FOODS_KEY = 'calorie-app:foods'
export const FOODS_VERSION = 1
/** Every user food id starts with this, so it can never clash with a built-in food id. */
export const USER_PREFIX = 'u_'
/** Serving label on entries logged from a user food (formatAmount makes it "2 servings"). */
export const USER_SERVING = '1 serving'

export type UserFood = Macros & { id: string; name: string; createdAt: number; updatedAt: number }
export type FoodsFile = { version: typeof FOODS_VERSION; foods: UserFood[] }

export const isUserFoodId = (id: string | null | undefined): id is string => typeof id === 'string' && id.startsWith(USER_PREFIX)
/** De-dupe key: trimmed, inner spaces collapsed, case-insensitive. */
export const normName = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase()
export const cleanName = (s: string) => s.trim().replace(/\s+/g, ' ')

const num = (v: unknown, max = 100_000) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 && v < max ? v : 0)

/** Parse whatever is stored (or restored). Never throws; drops broken rows and later duplicates by name. */
export function parseFoods(raw: unknown): UserFood[] {
  const list = typeof raw === 'object' && raw !== null && Array.isArray((raw as FoodsFile).foods) ? (raw as FoodsFile).foods : []
  const seen = new Set<string>()
  const out: UserFood[] = []
  for (const f of list as unknown[]) {
    if (typeof f !== 'object' || f === null) continue
    const r = f as Record<string, unknown>
    if (!isUserFoodId(r.id as string) || typeof r.name !== 'string' || !cleanName(r.name)) continue
    const kcal = num(r.kcal, 10_000)
    if (!kcal) continue
    const key = normName(r.name)
    if (seen.has(key)) continue
    seen.add(key)
    const createdAt = num(r.createdAt, Number.MAX_SAFE_INTEGER)
    out.push({ id: r.id as string, name: cleanName(r.name), kcal: Math.round(kcal), protein: num(r.protein), carbs: num(r.carbs), fat: num(r.fat), createdAt, updatedAt: num(r.updatedAt, Number.MAX_SAFE_INTEGER) || createdAt })
  }
  return out
}

export function readFoods(): UserFood[] {
  try {
    const raw = localStorage.getItem(FOODS_KEY)
    return raw ? parseFoods(JSON.parse(raw)) : []
  } catch {
    return []
  }
}

export const foodsFile = (foods: UserFood[]): FoodsFile => ({ version: FOODS_VERSION, foods })

export const findByName = (foods: UserFood[], name: string) => {
  const k = normName(name)
  return foods.find((f) => normName(f.name) === k)
}

/**
 * Save a named quick add: the same name (case-insensitive, trimmed) updates that food with the new numbers and keeps
 * its id; a new name adds a food. Returns the new list and the saved food.
 */
export function upsertFood(foods: UserFood[], input: Macros & { name: string }, makeId: () => string, now = Date.now()): { foods: UserFood[]; food: UserFood } {
  const name = cleanName(input.name)
  const macros = { kcal: Math.round(input.kcal), protein: input.protein || 0, carbs: input.carbs || 0, fat: input.fat || 0 }
  const cur = findByName(foods, name)
  if (cur) {
    const food = { ...cur, ...macros, updatedAt: now } // keeps the name as first saved
    return { foods: foods.map((f) => (f.id === cur.id ? food : f)), food }
  }
  const food: UserFood = { id: USER_PREFIX + makeId(), name, ...macros, createdAt: now, updatedAt: now }
  return { foods: [...foods, food], food }
}

/** Edit one food in place. Fails (returns null) when the new name belongs to another of the user's foods. */
export function editFood(foods: UserFood[], id: string, input: Macros & { name: string }, now = Date.now()): UserFood[] | null {
  const name = cleanName(input.name)
  const other = findByName(foods, name)
  if (other && other.id !== id) return null
  return foods.map((f) => (f.id === id ? { ...f, name, kcal: Math.round(input.kcal), protein: input.protein || 0, carbs: input.carbs || 0, fat: input.fat || 0, updatedAt: now } : f))
}
