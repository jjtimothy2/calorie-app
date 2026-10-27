import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from 'react'
import { STATE_VERSION, type Entry, type ExerciseEntry, type Intensity, type Macros, type Meal, type Profile, type State } from './types'
import { editFood, FOODS_KEY, foodsFile, readFoods, upsertFood, USER_SERVING, type UserFood } from './myFoods'
import { FOOD_BY_ID, FOODS } from '../data/foods'
import { exerciseKcal, ACTIVITY_BY_ID } from '../data/activities'
import { addDays, dateKey, dayBase, liveDay, summarise } from './calc'
import { migrateState, normaliseProfile } from './migrate'

import { LEGACY_STATE_KEY, STATE_KEY } from './backup'
export const STORAGE_KEY = STATE_KEY
const empty: State = { version: STATE_VERSION, profile: null, entries: [], exercises: [], closedDays: {}, favourites: [] }

export { normaliseProfile }

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
    // v2 key first; otherwise migrate the app 1.0 data (left in place under its old key).
    const raw = localStorage.getItem(STORAGE_KEY) ?? localStorage.getItem(LEGACY_STATE_KEY)
    if (!raw) return empty
    // v1 data (app 1.0) is migrated in place; the next save writes it back as v2.
    const merged = migrateState(JSON.parse(raw))
    return merged ? autoClose(merged) : empty
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
  | { type: 'removeFav'; foodId: string }
  | { type: 'addExercise'; entry: ExerciseEntry }
  | { type: 'updateExercise'; entry: ExerciseEntry }
  | { type: 'deleteExercise'; id: string }
  | { type: 'closeDay'; date: string }
  | { type: 'reopenDay'; date: string }
  | { type: 'autoClose'; today: string }
  | { type: 'loadDemoWeek' }
  | { type: 'reset' }
  | { type: 'restore'; state: State }

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

/** v1.9: an entry from one of the user's own foods. Values are per serving, like a built-in food at mult 1. */
export function entryFromUserFood(f: UserFood, opts: { meal: Meal; date: string; qty?: number }): Entry {
  return {
    id: newId(), date: opts.date, meal: opts.meal, foodId: f.id, name: f.name, servingLabel: USER_SERVING, servingMult: 1, qty: opts.qty ?? 1,
    kcal: f.kcal, protein: f.protein, carbs: f.carbs, fat: f.fat, createdAt: Date.now(),
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
  const plan: [string, Meal, number][][] = [
    [['oatmeal', 'breakfast', 1], ['nasi-goreng', 'lunch', 1], ['soto-ayam', 'dinner', 1], ['banana', 'snacks', 1]],
    [['bubur-ayam', 'breakfast', 1], ['gado-gado', 'lunch', 1], ['sate-ayam-with-peanut-sauce', 'dinner', 1], ['es-teh-manis', 'beverages', 2]],
    [['scrambled-eggs', 'breakfast', 1], ['nasi-padang-rice-rendang', 'lunch', 1], ['ayam-bakar', 'dinner', 1], ['nasi-putih-white-rice', 'dinner', 1]],
    [['granola', 'breakfast', 1], ['mie-goreng', 'lunch', 1], ['pecel-lele', 'dinner', 1], ['martabak-manis', 'snacks', 2]],
    [['nasi-uduk', 'breakfast', 1], ['bakso-meatball-soup', 'lunch', 1], ['tempe-goreng', 'dinner', 3], ['nasi-putih-white-rice', 'dinner', 1]],
    [['greek-yogurt-plain', 'breakfast', 1], ['caesar-salad-with-chicken', 'lunch', 1], ['rendang-daging', 'dinner', 1], ['nasi-putih-white-rice', 'dinner', 1], ['almonds', 'snacks', 1]],
  ]
  // Protein-forward extras at a fixed serving, so some demo days hit the protein target.
  const extras: [string, Meal][][] = [
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

/**
 * v1.12: a past day was changed (food or exercise added, edited or deleted). A closed past day keeps the baseline it
 * was closed with (BMR, movement, base burn, goal) and only its eaten, burned, protein and balance follow the logs, so
 * History and the verdict stay right without re-planning the day from today's profile. A past day with no summary yet
 * is closed the same way the midnight auto-close does it.
 */
export function refreshPastDay(s: State, date: string, today = dateKey()): State {
  if (!s.profile || date >= today) return s
  const old = s.closedDays[date]
  if (!old) return autoClose(s, today)
  const live = liveDay(s, s.profile, date)
  const next = { ...old, burned: live.burned, eaten: live.eaten, protein: live.protein, balance: dayBase(old) + live.burned - live.eaten }
  return { ...s, closedDays: { ...s.closedDays, [date]: next } }
}

const ENTRY_EDITS = new Set(['addEntry', 'updateEntry', 'deleteEntry', 'addExercise', 'updateExercise', 'deleteExercise'])

function reducer(state: State, a: Action): State {
  if (!ENTRY_EDITS.has(a.type)) return apply(state, a)
  // The days this edit touches: the entry's own day, plus its old day for an update or delete.
  const before = 'id' in a ? (a.type === 'deleteEntry' ? state.entries : state.exercises).find((e) => e.id === a.id)?.date
    : 'entry' in a ? (a.type === 'updateEntry' ? state.entries : state.exercises).find((e) => e.id === a.entry.id)?.date : undefined
  const dates = new Set([before, 'entry' in a ? a.entry.date : undefined].filter((d): d is string => !!d))
  const today = dateKey()
  // Today, once closed, is locked until it is reopened. v1.12: past days are not; they recalculate instead.
  if ('entry' in a && [...dates].some((d) => d >= today && isClosed(state, d))) return state
  let next = apply(state, a)
  if (next === state) return state
  for (const d of dates) next = refreshPastDay(next, d, today)
  return next
}

function apply(state: State, a: Action): State {
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
    case 'removeFav':
      return state.favourites.includes(a.foodId) ? { ...state, favourites: state.favourites.filter((x) => x !== a.foodId) } : state
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
    case 'restore': {
      // Already validated by parseBackup (v1 or v2); migrate the same way load() does.
      const s = migrateState(a.state)
      return s ? autoClose(s) : state
    }
  }
}

type FoodInput = Macros & { name: string }
type Ctx = {
  state: State
  dispatch: React.Dispatch<Action>
  /** Built-in and user food ids (u_...), most recent first. */
  recentFoodIds: string[]
  today: string
  /** v1.9: the user's own foods (calorie-app:foods), oldest first. */
  myFoods: UserFood[]
  myFoodById: Map<string, UserFood>
  /** Save a named quick add as a user food (same name updates it). Returns the saved food. */
  saveMyFood: (f: FoodInput) => UserFood
  /** Returns false when the name is already used by another of the user's foods. */
  updateMyFood: (id: string, f: FoodInput) => boolean
  /** Past entries are kept; they stay in the log as they were. */
  deleteMyFood: (id: string) => void
  /** v1.12: the day Home and Log show and write to. Today unless a past day was picked; never saved, so the app opens on today. */
  logDate: string
  /** Pick a day to view and edit (clamped to today). */
  setLogDate: (date: string) => void
}
const StoreCtx = createContext<Ctx | null>(null)

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, rawDispatch] = useReducer(reducer, undefined, load)
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  }, [state])
  // v1.9: user foods live next to the state, under their own key. Nothing is written until there is a food, so a
  // device that never saves one keeps exactly the keys it had.
  const [myFoods, setMyFoods] = useState<UserFood[]>(readFoods)
  const foodsRef = useRef(myFoods)
  const setFoods = useCallback((f: UserFood[]) => { foodsRef.current = f; setMyFoods(f) }, [])
  useEffect(() => {
    if (myFoods.length || localStorage.getItem(FOODS_KEY) !== null) localStorage.setItem(FOODS_KEY, JSON.stringify(foodsFile(myFoods)))
  }, [myFoods])
  const dispatch = useCallback((a: Action) => {
    rawDispatch(a)
    // A restore has already written the backup's foods (restoreExtraKeys); a reset clears them.
    if (a.type === 'restore') setFoods(readFoods())
    if (a.type === 'reset') { localStorage.removeItem(FOODS_KEY); setFoods([]) }
  }, [setFoods])
  const saveMyFood = useCallback((f: FoodInput) => {
    const r = upsertFood(foodsRef.current, f, newId)
    setFoods(r.foods)
    return r.food
  }, [setFoods])
  const updateMyFood = useCallback((id: string, f: FoodInput) => {
    const next = editFood(foodsRef.current, id, f)
    if (!next) return false
    setFoods(next)
    return true
  }, [setFoods])
  // v1.10.1: a deleted saved food also leaves Favourites.
  const deleteMyFood = useCallback((id: string) => {
    setFoods(foodsRef.current.filter((f) => f.id !== id))
    rawDispatch({ type: 'removeFav', foodId: id })
  }, [setFoods])
  const myFoodById = useMemo(() => new Map(myFoods.map((f) => [f.id, f])), [myFoods])
  // Track the calendar day so an open app rolls over (and auto-closes yesterday) at midnight.
  const [today, setToday] = useState(dateKey)
  useEffect(() => {
    const tick = () => setToday(dateKey())
    const id = window.setInterval(tick, 30_000)
    document.addEventListener('visibilitychange', tick)
    return () => { window.clearInterval(id); document.removeEventListener('visibilitychange', tick) }
  }, [])
  useEffect(() => { dispatch({ type: 'autoClose', today }) }, [today])
  // v1.12: the picked day lives in memory only. It goes back to today at midnight, on a reload, and after the app
  // has been in the background for 5 minutes, so today's food never lands on yesterday by accident.
  const [picked, setPicked] = useState<string | null>(null)
  const logDate = picked && picked < today ? picked : today
  const setLogDate = useCallback((d: string) => setPicked(d < dateKey() ? d : null), [])
  useEffect(() => { setPicked(null) }, [today])
  useEffect(() => {
    let hiddenAt = 0
    const vis = () => {
      if (document.visibilityState === 'hidden') hiddenAt = Date.now()
      else if (hiddenAt && Date.now() - hiddenAt > 5 * 60_000) setPicked(null)
    }
    document.addEventListener('visibilitychange', vis)
    return () => document.removeEventListener('visibilitychange', vis)
  }, [])
  const recentFoodIds = useMemo(() => {
    const seen = new Set<string>()
    const out: string[] = []
    for (const e of [...state.entries].sort((a, b) => b.createdAt - a.createdAt)) {
      if (e.foodId && !seen.has(e.foodId) && (FOOD_BY_ID.has(e.foodId) || myFoodById.has(e.foodId))) {
        seen.add(e.foodId)
        out.push(e.foodId)
      }
      if (out.length >= 8) break
    }
    return out
  }, [state.entries, myFoodById])
  const value = useMemo(
    () => ({ state, dispatch, recentFoodIds, today, myFoods, myFoodById, saveMyFood, updateMyFood, deleteMyFood, logDate, setLogDate }),
    [state, dispatch, recentFoodIds, today, myFoods, myFoodById, saveMyFood, updateMyFood, deleteMyFood, logDate, setLogDate],
  )
  return <StoreCtx.Provider value={value}>{children}</StoreCtx.Provider>
}

export function useStore() {
  const c = useContext(StoreCtx)
  if (!c) throw new Error('useStore outside provider')
  return c
}

export { FOODS }
