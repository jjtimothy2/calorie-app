import { createContext, useContext, useEffect, useMemo, useReducer, type ReactNode } from 'react'
import type { Entry, Profile, State } from './types'
import { FOOD_BY_ID, FOODS } from '../data/foods'
import { addDays, dateKey } from './calc'

export const STORAGE_KEY = 'calorie-app:v1'
const empty: State = { version: 1, profile: null, entries: [], favourites: [] }

function load(): State {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return empty
    const s = JSON.parse(raw) as State
    if (s.version !== 1) return empty
    return { ...empty, ...s }
  } catch {
    return empty
  }
}

type Action =
  | { type: 'setProfile'; profile: Profile }
  | { type: 'addEntry'; entry: Entry }
  | { type: 'updateEntry'; entry: Entry }
  | { type: 'deleteEntry'; id: string }
  | { type: 'toggleFav'; foodId: string }
  | { type: 'loadDemoWeek'; target: number }
  | { type: 'reset' }

export const newId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36)

export function entryFromFood(foodId: string, opts: Pick<Entry, 'meal' | 'date'> & { mult?: number; servingLabel?: string; qty?: number }): Entry {
  const f = FOOD_BY_ID.get(foodId)
  if (!f) throw new Error(`Unknown food ${foodId}`)
  const mult = opts.mult ?? 1
  return {
    id: newId(),
    date: opts.date,
    meal: opts.meal,
    foodId,
    name: f.name,
    servingLabel: opts.servingLabel ?? `${f.servingLabel} (${f.grams} g)`,
    servingMult: mult,
    qty: opts.qty ?? 1,
    kcal: f.kcal * mult,
    protein: f.protein * mult,
    carbs: f.carbs * mult,
    fat: f.fat * mult,
    createdAt: Date.now(),
  }
}

/** Deterministic-ish sample week for demoing History (replaces the previous 6 days, keeps today). */
function demoWeek(state: State, target: number): Entry[] {
  const today = dateKey()
  const keep = state.entries.filter((e) => e.date === today || e.date < addDays(today, -6))
  const plan: [string, 'breakfast' | 'lunch' | 'dinner' | 'snacks', number][][] = [
    [['oatmeal', 'breakfast', 1], ['nasi-goreng', 'lunch', 1], ['soto-ayam', 'dinner', 1], ['banana', 'snacks', 1]],
    [['bubur-ayam', 'breakfast', 1], ['gado-gado', 'lunch', 1], ['sate-ayam-with-peanut-sauce', 'dinner', 1], ['es-teh-manis', 'snacks', 2]],
    [['scrambled-eggs', 'breakfast', 1], ['nasi-padang-rice-rendang', 'lunch', 1], ['ayam-bakar', 'dinner', 1], ['nasi-putih-white-rice', 'dinner', 1]],
    [['granola', 'breakfast', 1], ['mie-goreng', 'lunch', 1], ['pecel-lele', 'dinner', 1], ['martabak-manis', 'snacks', 2]],
    [['nasi-uduk', 'breakfast', 1], ['bakso-meatball-soup', 'lunch', 1], ['tempe-goreng', 'dinner', 3], ['nasi-putih-white-rice', 'dinner', 1]],
    [['greek-yogurt-plain', 'breakfast', 1], ['caesar-salad-with-chicken', 'lunch', 1], ['rendang-daging', 'dinner', 1], ['nasi-putih-white-rice', 'dinner', 1], ['almonds', 'snacks', 1]],
  ]
  // Scale each day's portions so totals land around the target (some under, a couple over).
  const factors = [0.95, 1.1, 0.97, 0.9, 1.08, 0.98]
  const out: Entry[] = []
  plan.forEach((day, i) => {
    const date = addDays(today, i - 6)
    const items = day.filter(([id]) => FOOD_BY_ID.has(id))
    const base = items.reduce((s, [id, , q]) => s + FOOD_BY_ID.get(id)!.kcal * q, 0)
    const scale = (target * factors[i]) / base
    items.forEach(([foodId, meal, qty], j) => {
      const q = Math.max(0.5, Math.round(qty * scale * 2) / 2)
      out.push({ ...entryFromFood(foodId, { meal, date, qty: q }), createdAt: Date.now() - (6 - i) * 86400000 + j })
    })
  })
  return [...keep, ...out]
}

function reducer(state: State, a: Action): State {
  switch (a.type) {
    case 'setProfile':
      return { ...state, profile: a.profile }
    case 'addEntry':
      return { ...state, entries: [...state.entries, a.entry] }
    case 'updateEntry':
      return { ...state, entries: state.entries.map((e) => (e.id === a.entry.id ? a.entry : e)) }
    case 'deleteEntry':
      return { ...state, entries: state.entries.filter((e) => e.id !== a.id) }
    case 'toggleFav':
      return {
        ...state,
        favourites: state.favourites.includes(a.foodId)
          ? state.favourites.filter((x) => x !== a.foodId)
          : [...state.favourites, a.foodId],
      }
    case 'loadDemoWeek':
      return { ...state, entries: demoWeek(state, a.target) }
    case 'reset':
      return empty
  }
}

type Ctx = { state: State; dispatch: React.Dispatch<Action>; recentFoodIds: string[] }
const StoreCtx = createContext<Ctx | null>(null)

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, load)
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  }, [state])
  const recentFoodIds = useMemo(() => {
    const seen = new Set<string>()
    const out: string[] = []
    for (const e of [...state.entries].sort((a, b) => b.createdAt - a.createdAt)) {
      if (e.foodId && !seen.has(e.foodId) && FOOD_BY_ID.has(e.foodId)) {
        seen.add(e.foodId)
        out.push(e.foodId)
      }
      if (out.length >= 8) break
    }
    return out
  }, [state.entries])
  return <StoreCtx.Provider value={{ state, dispatch, recentFoodIds }}>{children}</StoreCtx.Provider>
}

export function useStore() {
  const c = useContext(StoreCtx)
  if (!c) throw new Error('useStore outside provider')
  return c
}

export { FOODS }
