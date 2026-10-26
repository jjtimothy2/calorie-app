import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { FoodSheet } from '../components/FoodSheet'
import { QuickAddSheet } from '../components/QuickAddSheet'
import { CameraIcon, NoKeySheet, PhotoFlow, type LogItem } from '../components/PhotoSheets'
import { Screen } from '../components/Layout'
import { Button, Chip } from '../components/ui'
import { Sheet } from '../components/Sheet'
import { ExerciseForm, ExerciseQuickSheet } from '../components/ExerciseForm'
import { FOODS, FOOD_BY_ID, type Food } from '../data/foods'
import { foodEmoji } from '../data/foodEmoji'
import { dayView, defaultMeal, entryTotals, fmt, verdict } from '../lib/calc'
import { entryFromFood, newId, useStore } from '../lib/store'
import { readAi, type AiSettings } from '../lib/ai'
import { downscalePhoto } from '../lib/photo'
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
  const [toast, setToast] = useState<{ ids: string[]; text: string } | null>(null)
  const timer = useRef<number | undefined>(undefined)
  const keyboard = useKeyboardOpen()
  const bar = !day.closed && !keyboard
  useEffect(() => () => window.clearTimeout(timer.current), [])

  const showToast = (entry: Entry) => {
    window.clearTimeout(timer.current)
    setToast({ ids: [entry.id], text: `Added ${entry.name} · ${fmt(entryTotals(entry).kcal)} kcal` })
    timer.current = window.setTimeout(() => setToast(null), 4000)
  }
  // v1.5: AI photo estimate. The photo is a downscaled data URL in memory only, dropped when the sheets close.
  const online = useOnline()
  const fileRef = useRef<HTMLInputElement>(null)
  const [photo, setPhoto] = useState<{ url: string; ai: AiSettings } | null>(null)
  const [noKey, setNoKey] = useState(false)
  const [photoErr, setPhotoErr] = useState(false)
  const openCamera = () => {
    if (!online) return
    if (!readAi()) { setNoKey(true); return }
    fileRef.current?.click()
  }
  const onFile = async (file: File | undefined) => {
    if (fileRef.current) fileRef.current.value = '' // same photo can be picked again
    const ai = readAi()
    if (!file || !ai) return
    try { setPhoto({ url: await downscalePhoto(file), ai }) } catch { setPhotoErr(true); setPhoto(null) }
  }
  const logPhoto = (rows: LogItem[]) => {
    const added: Entry[] = rows.map(({ item, grams }) => {
      if (item.food) return { ...entryFromFood(item.food.id, { meal, date: today, mult: grams / item.food.grams, servingLabel: `${grams} g` }), source: 'photo' as const }
      const r = grams / item.ai.grams
      return {
        id: newId(), date: today, meal, foodId: null, name: item.ai.name, servingLabel: `${grams} g`, servingMult: 1, qty: 1,
        kcal: Math.round(item.ai.kcal * r), protein: +(item.ai.protein * r).toFixed(1), carbs: +(item.ai.carbs * r).toFixed(1), fat: +(item.ai.fat * r).toFixed(1),
        createdAt: Date.now(), source: 'photo' as const,
      }
    })
    for (const entry of added) dispatch({ type: 'addEntry', entry })
    setPhoto(null)
    window.clearTimeout(timer.current)
    const kcal = added.reduce((a, e) => a + entryTotals(e).kcal, 0)
    setToast({ ids: added.map((e) => e.id), text: `Added ${added.length} ${added.length === 1 ? 'item' : 'items'} from photo · ${fmt(kcal)} kcal` })
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
          <span className="h-11 w-11" aria-hidden="true" />
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
            <p className="mt-auto text-center text-xs text-mute">From a watch? Use Quick add burn below. Estimates are illustrative.</p>
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
      {/* v1.3.4: Quick add lives in a sticky full-width bar at the bottom of Log (Reed, option 1). Hidden when the
          day is closed, and while the on-screen keyboard is up so it never rides up over the list. */}
      {!day.closed && !keyboard && (
        <div className="flex shrink-0 items-center gap-3 border-t border-line bg-bg px-5 pt-3 pb-safe-qa" data-testid="qa-bar">
          {/* v1.5: AI photo estimate (Reed's mock). Food mode only. Offline it says so instead of opening anything. */}
          {mode === 'food' && (online ? (
            <button type="button" onClick={openCamera} aria-label="Estimate from a photo" data-testid="camera-btn" className="tap grid h-[56px] w-[56px] shrink-0 place-items-center rounded-full border-2 border-line bg-card text-ink">
              <CameraIcon />
            </button>
          ) : (
            <span role="note" data-testid="camera-offline" className="flex h-[56px] shrink-0 items-center gap-1.5 rounded-full border-2 border-dashed border-line px-3 text-[13px] font-semibold leading-tight text-mute">
              <CameraIcon className="h-5 w-5" /><span>Needs<br />internet</span>
            </span>
          ))}
          <button type="button" onClick={() => (mode === 'food' ? setQuick(true) : setQuickEx(true))} className="tap flex min-w-0 flex-1 items-center justify-center gap-2 rounded-[18px] bg-ink p-4 text-[17px] font-bold text-bg shadow-[0_8px_20px_rgba(42,36,32,.22)]">
            <span aria-hidden="true">⚡</span>{mode === 'food' ? 'Quick add calories' : 'Quick add burn'}
          </button>
        </div>
      )}
      {toast && (
        <div role="status" className={`anim-fade ${bar ? 'bottom-above-qa' : 'bottom-safe'} absolute inset-x-4 z-20 flex items-center justify-between gap-3 rounded-[18px] bg-ink px-4 py-3 text-[15px] text-bg shadow-lg`} data-testid="toast">
          <span>{toast.text}</span>
          <span className="flex gap-3">
            <button type="button" className="font-bold underline" onClick={() => { for (const id of toast.ids) dispatch({ type: 'deleteEntry', id }); setToast(null) }}>Undo</button>
            <button type="button" className="font-bold text-g-soft" onClick={() => nav('/')}>Done</button>
          </span>
        </div>
      )}
      {exToast && (
        <div role="status" className={`anim-fade ${bar ? 'bottom-above-qa' : 'bottom-safe'} absolute inset-x-4 z-20 flex items-center justify-between gap-3 rounded-[18px] bg-ink px-4 py-3 text-[15px] text-bg shadow-lg`} data-testid="toast">
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
      <input ref={fileRef} type="file" accept="image/*" className="hidden" tabIndex={-1} aria-hidden="true" data-testid="photo-input" onChange={(e) => onFile(e.target.files?.[0])} />
      {noKey && <NoKeySheet onClose={() => setNoKey(false)} onSetup={() => nav('/settings?ai=1')} />}
      {photoErr && (
        <Sheet label="Photo problem" onClose={() => setPhotoErr(false)}>
          <h2 className="title text-[24px]">Couldn’t open that photo</h2>
          <p className="text-[16px] leading-snug">Try another photo, or take a new one. JPEG and PNG work everywhere.</p>
          <Button data-autofocus onClick={() => { setPhotoErr(false); fileRef.current?.click() }}>Pick another photo</Button>
          <button type="button" className="tap -mt-1 py-2 text-center text-[16px] font-bold text-g-ink underline" onClick={() => { setPhotoErr(false); setQuick(true) }}>Use Quick add instead</button>
        </Sheet>
      )}
      {photo && (
        <PhotoFlow
          settings={photo.ai}
          photo={photo.url}
          onRetake={() => fileRef.current?.click()}
          onClose={() => setPhoto(null)}
          onQuickAdd={() => { setPhoto(null); setQuick(true) }}
          onFixKey={() => { setPhoto(null); nav('/settings?ai=1') }}
          onLog={logPhoto}
        />
      )}
      {quick && (
        <QuickAddSheet mode="add" meal={meal} date={today} remaining={remaining} onClose={() => setQuick(false)} onDone={(e) => { setQuick(false); showToast(e) }} />
      )}
    </>
  )
}

/** navigator.onLine, kept live. */
function useOnline() {
  const [on, setOn] = useState(() => typeof navigator === 'undefined' || navigator.onLine !== false)
  useEffect(() => {
    const up = () => setOn(true), down = () => setOn(false)
    window.addEventListener('online', up)
    window.addEventListener('offline', down)
    return () => { window.removeEventListener('online', up); window.removeEventListener('offline', down) }
  }, [])
  return on
}

/**
 * True while an on-screen keyboard takes a big bite out of the visual viewport (iOS keeps the layout height, Android
 * shrinks it; both shrink visualViewport). Compared with the tallest height seen at this width, so a desktop window
 * or rotation never counts.
 */
function useKeyboardOpen() {
  const [open, setOpen] = useState(false)
  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return
    let w = vv.width, max = vv.height
    const check = () => {
      if (Math.abs(vv.width - w) > 1) { w = vv.width; max = vv.height }
      max = Math.max(max, vv.height)
      setOpen(max - vv.height > 150)
    }
    vv.addEventListener('resize', check)
    return () => vv.removeEventListener('resize', check)
  }, [])
  return open
}
