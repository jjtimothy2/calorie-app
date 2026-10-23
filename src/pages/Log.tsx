import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { FoodSheet } from '../components/FoodSheet'
import { QuickAddSheet } from '../components/QuickAddSheet'
import { Screen } from '../components/Layout'
import { Chip } from '../components/ui'
import { FOODS, FOOD_BY_ID, type Food } from '../data/foods'
import { dateKey, defaultMeal, entryTotals, fmt, sumEntries } from '../lib/calc'
import { entryFromFood, useStore } from '../lib/store'
import { MEALS, MEAL_LABEL, type Entry, type Meal } from '../lib/types'

type Tab = 'recent' | 'fav' | 'all'

export default function Log() {
  const { state, dispatch, recentFoodIds } = useStore()
  const [params, setParams] = useSearchParams()
  const nav = useNavigate()
  const meal = (MEALS as string[]).includes(params.get('meal') ?? '') ? (params.get('meal') as Meal) : defaultMeal()
  const today = dateKey()
  const eaten = sumEntries(state.entries.filter((e) => e.date === today)).kcal
  const remaining = state.profile!.target - eaten
  const [q, setQ] = useState('')
  const [tab, setTab] = useState<Tab>(recentFoodIds.length ? 'recent' : 'all')
  const [picked, setPicked] = useState<Food | null>(null)
  const [quick, setQuick] = useState(false)
  const [toast, setToast] = useState<{ entry: Entry; text: string } | null>(null)
  const timer = useRef<number | undefined>(undefined)
  useEffect(() => () => window.clearTimeout(timer.current), [])

  const showToast = (entry: Entry) => {
    window.clearTimeout(timer.current)
    setToast({ entry, text: `Added ${entry.name} · ${fmt(entryTotals(entry).kcal)} kcal` })
    timer.current = window.setTimeout(() => setToast(null), 4000)
  }

  const list = useMemo(() => {
    const fav = new Set(state.favourites)
    const recentRank = new Map(recentFoodIds.map((id, i) => [id, i]))
    let pool: Food[] =
      tab === 'recent' ? recentFoodIds.map((id) => FOOD_BY_ID.get(id)!)
      : tab === 'fav' ? state.favourites.map((id) => FOOD_BY_ID.get(id)!).filter(Boolean)
      : FOODS
    const needle = q.trim().toLowerCase()
    if (needle) {
      pool = pool.filter((f) => f.name.toLowerCase().includes(needle) || f.category.toLowerCase().includes(needle))
      const score = (f: Food) =>
        (fav.has(f.id) ? 0 : 10) + (recentRank.has(f.id) ? 0 : 5) + (f.name.toLowerCase().startsWith(needle) ? 0 : 2)
      pool = [...pool].sort((a, b) => score(a) - score(b) || a.name.localeCompare(b.name))
    } else if (tab === 'all') {
      pool = [...pool].sort((a, b) => (fav.has(b.id) ? 1 : 0) - (fav.has(a.id) ? 1 : 0) || (recentRank.get(a.id) ?? 99) - (recentRank.get(b.id) ?? 99))
    }
    return pool.slice(0, 60)
  }, [q, tab, state.favourites, recentFoodIds])

  const oneTap = (f: Food) => {
    const entry = entryFromFood(f.id, { meal, date: today })
    dispatch({ type: 'addEntry', entry })
    showToast(entry)
  }

  return (
    <>
      <Screen>
        <header className="flex items-center justify-between gap-2">
          <Link to="/" aria-label="Close and go back to Today" className="grid h-11 w-11 place-items-center text-xl text-mute">✕</Link>
          <label className="flex items-center gap-1 text-xl font-bold">
            <span>Add to</span>
            <select
              aria-label="Meal"
              value={meal}
              onChange={(e) => setParams({ meal: e.target.value }, { replace: true })}
              className="rounded-lg bg-transparent font-bold text-g-ink"
            >
              {MEALS.map((m) => <option key={m} value={m}>{MEAL_LABEL[m]}</option>)}
            </select>
          </label>
          <button type="button" onClick={() => setQuick(true)} className="px-1 py-2 text-[15px] font-bold text-g-ink">Quick add</button>
        </header>
        <div className="flex items-center gap-2.5 rounded-2xl border-2 border-g-ink bg-card px-4 py-3 focus-within:ring-2 focus-within:ring-g">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="text-mute" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
          <input
            autoFocus
            type="search"
            aria-label="Search foods"
            placeholder="Search foods, e.g. tempe"
            value={q}
            onChange={(e) => { setQ(e.target.value); if (e.target.value && tab !== 'all' && !q) setTab('all') }}
            className="w-full bg-transparent text-[17px] outline-none placeholder:text-mute"
          />
        </div>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Food list">
          <Chip on={tab === 'recent'} onClick={() => setTab('recent')}>Recent</Chip>
          <Chip on={tab === 'fav'} onClick={() => setTab('fav')}>Favourites</Chip>
          <Chip on={tab === 'all'} onClick={() => setTab('all')}>All foods</Chip>
        </div>
        <ul aria-label="Foods" data-testid="food-list">
          {list.map((f) => (
            <li key={f.id} className="flex items-center justify-between gap-2 border-b border-line">
              <button type="button" className="flex-1 py-3 text-left" onClick={() => setPicked(f)} aria-label={`${f.name}, ${f.servingLabel}, ${f.kcal} kcal. Choose amount`}>
                <div className="text-base font-semibold">{state.favourites.includes(f.id) && <span aria-hidden="true" className="text-carbs">★ </span>}{f.name}</div>
                <div className="text-[13px] text-mute">{f.servingLabel} ({f.grams} g)</div>
              </button>
              <div className="flex items-center gap-3">
                <b className="tabular-nums">{f.kcal}</b>
                <button type="button" onClick={() => oneTap(f)} aria-label={`Add one serving of ${f.name} to ${MEAL_LABEL[meal]}`} className="grid h-[34px] w-[34px] place-items-center rounded-full bg-g-soft text-[22px] font-bold text-g-soft-ink">+</button>
              </div>
            </li>
          ))}
          {list.length === 0 && (
            <li className="py-6 text-center text-[15px] text-mute">
              {tab === 'recent' && !q ? 'No recent foods yet.' : tab === 'fav' && !q ? 'No favourites yet. Tap ☆ on a food to save it.' : 'No match.'}{' '}
              <button type="button" className="font-bold text-g-ink underline" onClick={() => setQuick(true)}>Quick add calories</button>
            </li>
          )}
        </ul>
        <p className="mt-auto text-center text-xs text-mute">
          Tap + to add one serving instantly. Tap the row to change the amount.<br />Food values are illustrative.
        </p>
      </Screen>
      {toast && (
        <div role="status" className="anim-fade absolute inset-x-4 bottom-4 z-20 flex items-center justify-between gap-3 rounded-2xl bg-ink px-4 py-3 text-[15px] text-white shadow-lg" data-testid="toast">
          <span>{toast.text}</span>
          <span className="flex gap-3">
            <button type="button" className="font-bold underline" onClick={() => { dispatch({ type: 'deleteEntry', id: toast.entry.id }); setToast(null) }}>Undo</button>
            <button type="button" className="font-bold text-g-soft" onClick={() => nav('/')}>Done</button>
          </span>
        </div>
      )}
      {picked && (
        <FoodSheet key={picked.id} mode="add" food={picked} meal={meal} date={today} remaining={remaining} onClose={() => setPicked(null)} onDone={(e) => { setPicked(null); showToast(e) }} />
      )}
      {quick && (
        <QuickAddSheet mode="add" meal={meal} date={today} remaining={remaining} onClose={() => setQuick(false)} onDone={(e) => { setQuick(false); showToast(e) }} />
      )}
    </>
  )
}
