import { createContext, useContext, useEffect, useMemo, useReducer, useState, type ReactNode } from 'react'
import type { Entry, ExerciseEntry, Intensity, Profile, State } from './types'
import { FOOD_BY_ID, FOODS } from '../data/foods'
import { exerciseKcal, ACTIVITY_BY_ID } from '../data/activities'
import { addDays, calcBmr, dateKey, defaultDailyGoal, foodBudget, liveDay, summarise } from './calc'

export const STORAGE_KEY = 'calorie-app:v1'
const empty: State = { version: 1, profile: null, entries: [], exercises: [], closedDays: {}, favourites: [] }

/** Fill v1/v2 profile fields for data saved by v0. */
export function normaliseProfile(p: Partial<Profile> & Pick<Profile, 'age' | 'sex' | 'heightCm' | 'weightKg' | 'activity' | 'goal'>): Profile {
  const bmr = typeof p.bmr === 'number' && p.bmr > 0 ? p.bmr : calcBmr(p)
  const base = {
    ...p,
    bmr,
    bmrCustom: p.bmrCustom ?? false,
    includeMovement: p.includeMovement ?? true,
    dailyGoal: typeof p.dailyGoal === 'number' ? p.dailyGoal : defaultDailyGoal(p.goal),
    macros: { protein: null, carbs: null, fat: null, ...(p.macros ?? {}) },
  }
  return { ...base, target: foodBudget(base) }
}

/** Close every past day that has logs but no summary yet (the midnight auto-close, computed on load). */
export function autoClose(s: State, today = dateKey()): State {
  if (!s.profile) return s
  const days = new Set([...s.entries.map((e) => e.date), ...s.exercises.map((e) => e.date)])
  let closed: State['closedDays'] | null = null
  for (const d of days) {
    if (d < today && !s.closedDays[d]) {
      closed ??= { ...s.closedDays }
      closed[d] = summarise(liveDay(s, s.profile, d), true)
    }
  }
  return closed ? { ...s, closedDays: closed } : s
}

function load(): State {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return empty
    const s = JSON.parse(raw) as State
    if (s.version !== 1) return empty
    const merged: State = { ...empty, ...s, profile: s.profile ? normaliseProfile(s.profile) : null }
    return autoClose(merged)
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
  | { type: 'addExercise'; entry: ExerciseEntry }
  | { type: 'updateExercise'; entry: ExerciseEntry }
  | { type: 'deleteExercise'; id: string }
  | { type: 'closeDay'; date: string }
  | { type: 'reopenDay'; date: string }
  | { type: 'autoClose'; today: string }
  | { type: 'loadDemoWeek' }
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

export function exerciseEntry(opts: { date: string; activityId: string | null; name?: string; minutes: number; intensity: Intensity; weightKg: number; kcal?: number }): ExerciseEntry {
  const a = opts.activityId ? ACTIVITY_BY_ID.get(opts.activityId) : undefined
  return {
    id: newId(),
    date: opts.date,
    activityId: a ? a.id : null,
    name: opts.name ?? a?.name ?? 'Exercise',
    minutes: opts.minutes,
    intensity: opts.intensity,
    kcal: a ? exerciseKcal(a.id, opts.intensity, opts.minutes, opts.weightKg) : Math.round(opts.kcal ?? 0),
    createdAt: Date.now(),
  }
}

// Illustrative sample activities for the demo week (oldest day first; null = rest day).
const DEMO_EX: ([string, number, Intensity] | null)[] = [
  ['walking', 40, 'moderate'], ['badminton', 60, 'moderate'], null, ['gym-weights', 50, 'moderate'], ['futsal', 60, 'vigorous'], ['running', 30, 'moderate'],
]

/** Deterministic-ish sample week for demoing History (replaces the previous 6 days, keeps today). */
function demoWeek(state: State, dayKcal: number[]): Entry[] {
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
  // Protein-forward extras at a fixed serving, so some demo days hit the protein target.
  const extras: [string, 'breakfast' | 'lunch' | 'dinner' | 'snacks'][][] = [
    [['chicken-breast-grilled', 'lunch'], ['whey-protein-shake', 'snacks']], [], [['whey-protein-shake', 'snacks'], ['chicken-breast-grilled', 'lunch'], ['tuna-canned-in-water', 'dinner']],
    [['chicken-breast-grilled', 'dinner'], ['whey-protein-shake', 'snacks'], ['tuna-canned-in-water', 'lunch']], [], [['whey-protein-shake', 'snacks']],
  ]
  const out: Entry[] = []
  plan.forEach((day, i) => {
    const date = addDays(today, i - 6)
    const items = day.filter(([id]) => FOOD_BY_ID.has(id))
    const fixed = extras[i].filter(([id]) => FOOD_BY_ID.has(id))
    const fixedKcal = fixed.reduce((s, [id]) => s + FOOD_BY_ID.get(id)!.kcal, 0)
    fixed.forEach(([foodId, meal], j) => {
      out.push({ ...entryFromFood(foodId, { meal, date, qty: 1 }), createdAt: Date.now() - (6 - i) * 86400000 + 50 + j })
    })
    const base = items.reduce((s, [id, , q]) => s + FOOD_BY_ID.get(id)!.kcal * q, 0)
    const scale = Math.max(0.2, dayKcal[i] - fixedKcal) / base
    items.forEach(([foodId, meal, qty], j) => {
      const q = Math.max(0.5, Math.round(qty * scale * 2) / 2)
      out.push({ ...entryFromFood(foodId, { meal, date, qty: q }), createdAt: Date.now() - (6 - i) * 86400000 + j })
    })
  })
  return [...keep, ...out]
}

function demoExercises(state: State, weightKg: number): ExerciseEntry[] {
  const today = dateKey()
  const keep = state.exercises.filter((e) => e.date === today || e.date < addDays(today, -6))
  const out: ExerciseEntry[] = []
  DEMO_EX.forEach((x, i) => {
    if (!x) return
    const date = addDays(today, i - 6)
    out.push({ ...exerciseEntry({ date, activityId: x[0], minutes: x[1], intensity: x[2], weightKg }), createdAt: Date.now() - (6 - i) * 86400000 })
  })
  return [...keep, ...out]
}

const isClosed = (s: State, date: string) => !!s.closedDays[date]

function reducer(state: State, a: Action): State {
  // A closed day is locked: ignore edits to it until it is reopened.
  if ((a.type === 'addEntry' || a.type === 'updateEntry' || a.type === 'addExercise' || a.type === 'updateExercise') && isClosed(state, a.entry.date)) return state
  switch (a.type) {
    case 'setProfile':
      return { ...state, profile: normaliseProfile(a.profile) }
    case 'addExercise':
      return { ...state, exercises: [...state.exercises, a.entry] }
    case 'updateExercise':
      return { ...state, exercises: state.exercises.map((e) => (e.id === a.entry.id ? a.entry : e)) }
    case 'deleteExercise':
      return { ...state, exercises: state.exercises.filter((e) => e.id !== a.id) }
    case 'closeDay':
      if (!state.profile) return state
      return { ...state, closedDays: { ...state.closedDays, [a.date]: summarise(liveDay(state, state.profile, a.date), false) } }
    case 'reopenDay': {
      const closedDays = { ...state.closedDays }
      delete closedDays[a.date]
      return { ...state, closedDays }
    }
    case 'autoClose':
      return autoClose(state, a.today)
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
    case 'loadDemoWeek': {
      const today = dateKey()
      const closedDays = Object.fromEntries(Object.entries(state.closedDays).filter(([d]) => d === today || d < addDays(today, -6)))
      if (!state.profile) return state
      const exercises = demoExercises(state, state.profile.weightKg)
      // Illustrative daily balances (positive = deficit): mostly deficit, two surplus days.
      const wanted = [520, -180, 430, 300, -120, 560]
      const dayKcal = wanted.map((w, i) => {
        const date = addDays(today, i - 6)
        return liveDay({ entries: [], exercises }, state.profile!, date).balance - w
      })
      const next: State = { ...state, entries: demoWeek(state, dayKcal), exercises, closedDays }
      return autoClose(next, today)
    }
    case 'reset':
      return empty
  }
}

type Ctx = { state: State; dispatch: React.Dispatch<Action>; recentFoodIds: string[]; today: string }
const StoreCtx = createContext<Ctx | null>(null)

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, load)
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  }, [state])
  // Track the calendar day so an open app rolls over (and auto-closes yesterday) at midnight.
  const [today, setToday] = useState(dateKey)
  useEffect(() => {
    const tick = () => setToday(dateKey())
    const id = window.setInterval(tick, 30_000)
    document.addEventListener('visibilitychange', tick)
    return () => { window.clearInterval(id); document.removeEventListener('visibilitychange', tick) }
  }, [])
  useEffect(() => { dispatch({ type: 'autoClose', today }) }, [today])
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
  return <StoreCtx.Provider value={{ state, dispatch, recentFoodIds, today }}>{children}</StoreCtx.Provider>
}

export function useStore() {
  const c = useContext(StoreCtx)
  if (!c) throw new Error('useStore outside provider')
  return c
}

export { FOODS }
