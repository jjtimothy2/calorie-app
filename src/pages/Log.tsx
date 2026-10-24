import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { FoodSheet } from '../components/FoodSheet'
import { QuickAddSheet } from '../components/QuickAddSheet'
import { Screen } from '../components/Layout'
import { Button, Chip } from '../components/ui'
import { ExerciseForm, ExerciseQuickSheet } from '../components/ExerciseForm'
import { FOODS, FOOD_BY_ID, type Food } from '../data/foods'
import { foodEmoji } from '../data/foodEmoji'
import { dayView, defaultMeal, entryTotals, fmt, verdict } from '../lib/calc'
import { entryFromFood, useStore } from '../lib/store'
import { MEALS, MEAL_LABEL, type Entry, type ExerciseEntry, type Meal } from '../lib/types'

type Tab = 'recent' | 'fav' | 'all'

export default function Log() {
  const { state, dispatch, recentFoodIds, today } = useStore()
  const [params, setParams] = useSearchParams()
  const nav = useNavigate()
  const meal = (MEALS as string[]).includes(params.get('meal') ?? '') ? (params.get('meal') as Meal) : defaultMeal()
  const mode = params.get('mode') === 'exercise' ? 'exercise' : 'food'
  const day = dayView(state, today)
  const remaining = day.balance - day.goal
  const [quickEx, setQuickEx] = useState(false)
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
  const [exToast, setExToast] = useState<ExerciseEntry | null>(null)
  const showExToast = (e: ExerciseEntry) => {
    window.clearTimeout(timer.current)
    setToast(null)
    setExToast(e)
    timer.current = window.setTimeout(() => setExToast(null), 4000)
  }
  const setMode = (m: 'food' | 'exercise') => {
    const next = new URLSearchParams(params)
    if (m === 'exercise') next.set('mode', 'exercise')
    else next.delete('mode')
    setParams(next, { replace: true })
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
          {mode === 'food' ? (
            <label className="title flex items-center gap-1 text-[24px]">
              <span>Add to</span>
              <select
                aria-label="Meal"
                value={meal}
                onChange={(e) => { const n = new URLSearchParams(params); n.set('meal', e.target.value); setParams(n, { replace: true }) }}
                className="rounded-lg bg-transparent font-display font-semibold text-g-ink"
              >
                {MEALS.map((m) => <option key={m} value={m}>{MEAL_LABEL[m]}</option>)}
              </select>
            </label>
          ) : (
            <h1 className="title text-[24px]">Log exercise</h1>
          )}
          <button type="button" disabled={!!day.closed} onClick={() => (mode === 'food' ? setQuick(true) : setQuickEx(true))} className="px-1 py-2 text-[15px] font-bold text-g-ink disabled:opacity-40">Quick add</button>
        </header>
        <div className="flex gap-2" role="group" aria-label="What to log">
          <Chip on={mode === 'food'} onClick={() => setMode('food')}><span aria-hidden="true">🍽 </span>Food</Chip>
          <Chip on={mode === 'exercise'} onClick={() => setMode('exercise')}><span aria-hidden="true">🏃 </span>Exercise</Chip>
        </div>
        {day.closed ? (
          <div className="flex flex-col gap-3 rounded-[22px] border border-line bg-card p-4 text-center" data-testid="day-locked">
            <p className="text-base font-semibold">Today is closed: {verdict(day.balance)}.</p>
            <p className="text-[15px] text-mute">Reopen it to log more.</p>
            <Button variant="ghost" onClick={() => dispatch({ type: 'reopenDay', date: today })}>Reopen day</Button>
          </div>
        ) : mode === 'exercise' ? (
          <>
            <ExerciseForm date={today} onSaved={showExToast} onQuickAdd={() => setQuickEx(true)} />
            <p className="mt-auto text-center text-xs text-mute">From a watch? Use Quick add to type the calories. Estimates are illustrative.</p>
          </>
        ) : (<>
        <div className="flex items-center gap-2.5 rounded-2xl border-2 border-line bg-card px-4 py-3 focus-within:border-g-ink">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="text-mute" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
          <input
            autoFocus
            type="search"
            aria-label="Search foods"
            placeholder="Search foods, e.g. tempe"
            value={q}
            onChange={(e) => { setQ(e.target.value); if (e.target.value && tab !== 'all' && !q) setTab('all') }}
            className="w-full appearance-none bg-transparent text-[17px] outline-none placeholder:text-mute focus:outline-none focus-visible:outline-none [&::-webkit-search-cancel-button]:hidden"
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
              <button type="button" className="flex flex-1 items-center gap-3 py-2.5 text-left" onClick={() => setPicked(f)} aria-label={`${f.name}, ${f.servingLabel}, ${f.kcal} kcal. Choose amount`}>
                <span className="tile" aria-hidden="true">{foodEmoji(f.name)}</span>
                <span className="min-w-0">
                <div className="text-base font-semibold">{state.favourites.includes(f.id) && <span aria-hidden="true" className="text-carbs">★ </span>}{f.name}</div>
                <div className="text-[13px] text-mute">{f.servingLabel} ({f.grams} g)</div>
                </span>
              </button>
              <div className="flex items-center gap-3">
                <b className="num text-[17px]">{f.kcal}</b>
                <button type="button" onClick={() => oneTap(f)} aria-label={`Add one serving of ${f.name} to ${MEAL_LABEL[meal]}`} className="fab grid h-[34px] w-[34px] place-items-center rounded-full bg-g-soft text-[22px] font-bold text-g-soft-ink">+</button>
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
        </>)}
      </Screen>
      {toast && (
        <div role="status" className="anim-fade bottom-safe absolute inset-x-4 z-20 flex items-center justify-between gap-3 rounded-[18px] bg-ink px-4 py-3 text-[15px] text-bg shadow-lg" data-testid="toast">
          <span>{toast.text}</span>
          <span className="flex gap-3">
            <button type="button" className="font-bold underline" onClick={() => { dispatch({ type: 'deleteEntry', id: toast.entry.id }); setToast(null) }}>Undo</button>
            <button type="button" className="font-bold text-g-soft" onClick={() => nav('/')}>Done</button>
          </span>
        </div>
      )}
      {exToast && (
        <div role="status" className="anim-fade bottom-safe absolute inset-x-4 z-20 flex items-center justify-between gap-3 rounded-[18px] bg-ink px-4 py-3 text-[15px] text-bg shadow-lg" data-testid="toast">
          <span>Added {exToast.name} · {fmt(exToast.kcal)} kcal burned</span>
          <span className="flex gap-3">
            <button type="button" className="font-bold underline" onClick={() => { dispatch({ type: 'deleteExercise', id: exToast.id }); setExToast(null) }}>Undo</button>
            <button type="button" className="font-bold text-g-soft" onClick={() => nav('/')}>Done</button>
          </span>
        </div>
      )}
      {quickEx && (
        <ExerciseQuickSheet date={today} onClose={() => setQuickEx(false)} onDone={(e) => { setQuickEx(false); if (e) showExToast(e) }} />
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
