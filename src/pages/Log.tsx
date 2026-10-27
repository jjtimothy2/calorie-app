import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { FoodSheet } from '../components/FoodSheet'
import { QuickAddSheet } from '../components/QuickAddSheet'
import { AiFlow, CameraIcon, GalleryIcon, NoKeySheet, PencilIcon, SparkleIcon, type LogItem } from '../components/PhotoSheets'
import { Screen } from '../components/Layout'
import { PastDayNote } from '../components/PastDay'
import { Button, Chip } from '../components/ui'
import { ExerciseForm, ExerciseQuickSheet } from '../components/ExerciseForm'
import { FOODS, FOOD_BY_ID, type Food } from '../data/foods'
import { foodEmoji } from '../data/foodEmoji'
import { dayView, defaultMeal, entryTotals, fmt, verdict } from '../lib/calc'
import { entryFromFood, entryFromUserFood, newId, useStore } from '../lib/store'
import { USER_SERVING, type UserFood } from '../lib/myFoods'
import { SavedMark, MyFoodSheet, MyFoodEditSheet, macroLine } from '../components/MyFoodSheet'
import { readAi, type AiSettings } from '../lib/ai'
import { downscalePhoto } from '../lib/photo'
import { MEALS, MEAL_LABEL, type Entry, type ExerciseEntry, type Meal } from '../lib/types'

type Tab = 'recent' | 'fav' | 'mine' | 'all'

// v1.11: the Add Calories / Quick add burn button is solid green #178046 (the g-ink token) with cream card text, no emoji.
// 17 px bold counts as normal text for WCAG, so it needs 4.5:1: cream #FFFDF8 on #178046 is 4.9:1 (white on the lighter
// palette green #2F8F5B would be 4.0:1 and fail).
const QA_BTN = 'bg-g-ink text-card shadow-[0_8px_20px_rgba(23,128,70,.25)]'

export default function Log() {
  const { state, dispatch, recentFoodIds, today: realToday, logDate: today, myFoods, myFoodById, land } = useStore()
  const [params, setParams] = useSearchParams()
  const nav = useNavigate()
  const meal = (MEALS as string[]).includes(params.get('meal') ?? '') ? (params.get('meal') as Meal) : defaultMeal()
  const mode = params.get('mode') === 'exercise' ? 'exercise' : 'food'
  // v1.12: everything here writes to the picked day (named today below; it is the real today unless a past day was
  // picked on Home). Only today locks when closed; a past day recalculates instead.
  const day = dayView(state, today)
  const locked = !!day.closed && today >= realToday
  const remaining = day.balance - day.goal
  const [quickEx, setQuickEx] = useState(false)
  const [q, setQ] = useState('')
  const [tab, setTab] = useState<Tab>(recentFoodIds.length ? 'recent' : 'all')
  const [picked, setPicked] = useState<Food | null>(null)
  const [pickedMine, setPickedMine] = useState<UserFood | null>(null)
  const [quick, setQuick] = useState(false)
  // v1.10.1: My foods moved here from Me. New food (optionally named from the search text), edit and delete.
  const [newFood, setNewFood] = useState<string | null>(null)
  const [editMine, setEditMine] = useState<{ food: UserFood; del: boolean } | null>(null)
  // Only "Saved to My foods" shows here now; a logged food or exercise goes to Home (v1.13.2).
  const [toast, setToast] = useState<{ text: string } | null>(null)
  const timer = useRef<number | undefined>(undefined)
  const keyboard = useKeyboardOpen()
  const bar = !locked && !keyboard
  useEffect(() => () => window.clearTimeout(timer.current), [])

  // v1.13.2: after a food or exercise is logged, go to Home on the day it was logged to (a picked past day too). Home
  // scrolls to the new row(s), highlights them and shows the "Added ..." snackbar with Undo (Landing in the store).
  const showToast = (entry: Entry) => {
    land({ kind: 'food', date: entry.date, ids: [entry.id], text: `Added ${entry.name} · ${fmt(entryTotals(entry).kcal)} kcal` })
    nav('/')
  }
  const savedToast = (f: UserFood) => {
    window.clearTimeout(timer.current)
    setToast({ text: `Saved ${f.name} to My foods` })
    timer.current = window.setTimeout(() => setToast(null), 3000)
  }
  // v1.5: AI photo estimate. v1.6: AI estimate, photo optional. The photo is a downscaled data URL in memory only,
  // dropped when the sheet closes.
  const online = useOnline()
  const fileRef = useRef<HTMLInputElement>(null)
  const [aiFlow, setAiFlow] = useState<{ ai: AiSettings; photo: string | null; photoError: boolean } | null>(null)
  const [noKey, setNoKey] = useState(false)
  // v1.7: the AI button opens a pill menu instead of the sheet with a live camera.
  // v1.7.1: three pills (Take photo / From library / Type it). Focus only moves into the menu when it was opened from
  // the keyboard (click detail 0), so a tap never lights up a pill.
  const captureRef = useRef<HTMLInputElement>(null)
  const aiBtnRef = useRef<HTMLButtonElement>(null)
  const [aiMenu, setAiMenu] = useState<{ right: number; bottom: number; kb: boolean } | null>(null)
  // v1.7.1: which picker gave the current photo, so Retake reopens the same one.
  const [photoSrc, setPhotoSrc] = useState<'camera' | 'library'>('camera')
  const openAi = (ev?: { detail: number }) => {
    if (!online) return
    const ai = readAi()
    if (!ai) { setNoKey(true); return }
    const b = aiBtnRef.current, host = b?.closest<HTMLElement>('[data-ai-host]') ?? b?.offsetParent
    if (!b || !host) return
    const r = b.getBoundingClientRect(), h = (host as HTMLElement).getBoundingClientRect()
    setAiMenu({ right: h.right - r.right, bottom: h.bottom - r.bottom, kb: ev?.detail === 0 })
  }
  // Both pickers are opened synchronously inside the tap (iOS only opens them from a user gesture).
  const takePhoto = () => { setAiMenu(null); captureRef.current?.click() }
  const fromLibrary = () => { setAiMenu(null); fileRef.current?.click() }
  const typeIt = () => { const ai = readAi(); setAiMenu(null); if (ai) setAiFlow({ ai, photo: null, photoError: false }) }
  const onFile = async (file: Blob | undefined, src: 'camera' | 'library') => {
    if (fileRef.current) fileRef.current.value = '' // same photo can be picked again
    if (captureRef.current) captureRef.current.value = ''
    if (!file) return // camera cancelled: nothing opens
    setPhotoSrc(src)
    const ai = readAi()
    try {
      const url = await downscalePhoto(file)
      setAiFlow((f) => (f ? { ...f, photo: url, photoError: false } : ai ? { ai, photo: url, photoError: false } : f))
    } catch { setAiFlow((f) => (f ? { ...f, photoError: true } : ai ? { ai, photo: null, photoError: true } : f)) }
  }
  const logAi = (rows: LogItem[], dish: string) => {
    // v1.10: one groupId for everything logged from this estimate, so Home can show it as one meal row.
    const groupId = rows.length > 1 ? newId() : undefined
    // v1.6: always the AI's own numbers, scaled by grams. Marked as from AI (source 'photo', kept for older data).
    const added: Entry[] = rows.map(({ item, grams }) => {
      const r = grams / item.ai.grams
      return {
        id: newId(), date: today, meal, foodId: null, name: item.ai.name,
        servingLabel: grams === item.ai.grams && item.ai.portion ? `${item.ai.portion} (${grams} g)` : `${grams} g`, servingMult: 1, qty: 1,
        kcal: Math.round(item.ai.kcal * r), protein: +(item.ai.protein * r).toFixed(1), carbs: +(item.ai.carbs * r).toFixed(1), fat: +(item.ai.fat * r).toFixed(1),
        createdAt: Date.now(), source: 'photo' as const,
        ...(groupId ? { groupId, groupName: dish } : {}),
      }
    })
    for (const entry of added) dispatch({ type: 'addEntry', entry })
    setAiFlow(null)
    const kcal = added.reduce((a, e) => a + entryTotals(e).kcal, 0)
    land({ kind: 'food', date: today, ids: added.map((e) => e.id), text: `Added ${added.length} ${added.length === 1 ? 'item' : 'items'} from AI · ${fmt(kcal)} kcal` })
    nav('/')
  }
  const showExToast = (e: ExerciseEntry) => {
    land({ kind: 'exercise', date: e.date, ids: [e.id], text: `Added ${e.name} · ${fmt(e.kcal)} kcal burned` })
    nav('/')
  }
  const setMode = (m: 'food' | 'exercise') => {
    const next = new URLSearchParams(params)
    if (m === 'exercise') next.set('mode', 'exercise')
    else next.delete('mode')
    setParams(next, { replace: true })
  }

  // v1.9: the user's own foods sit in the same list as built-in foods (Recent, search, All foods) with a bookmark icon (v1.10, was a Mine tag).
  const mineAsFood = useMemo(() => new Map(myFoods.map((m) => [m.id, { id: m.id, name: m.name, category: 'My foods', servingLabel: USER_SERVING, grams: 0, kcal: m.kcal, protein: m.protein, carbs: m.carbs, fat: m.fat } as Food])), [myFoods])
  const anyFood = (id: string) => FOOD_BY_ID.get(id) ?? mineAsFood.get(id)
  const list = useMemo(() => {
    const fav = new Set(state.favourites)
    const recentRank = new Map(recentFoodIds.map((id, i) => [id, i]))
    const top = (f: Food) => fav.has(f.id) || mineAsFood.has(f.id)
    let pool: Food[] =
      tab === 'recent' ? recentFoodIds.map(anyFood).filter((f): f is Food => !!f)
      // v1.10.1: saved foods can be favourites too (u_ ids). An id with no food behind it (an old backup) is skipped.
      : tab === 'fav' ? state.favourites.map(anyFood).filter((f): f is Food => !!f)
      : tab === 'mine' ? [...myFoods].sort((a, b) => b.updatedAt - a.updatedAt).map((m) => mineAsFood.get(m.id)!).filter(Boolean)
      : [...mineAsFood.values(), ...FOODS]
    const needle = q.trim().toLowerCase()
    if (needle) {
      pool = pool.filter((f) => f.name.toLowerCase().includes(needle) || f.category.toLowerCase().includes(needle))
      const score = (f: Food) =>
        (top(f) ? 0 : 10) + (recentRank.has(f.id) ? 0 : 5) + (f.name.toLowerCase().startsWith(needle) ? 0 : 2)
      pool = [...pool].sort((a, b) => score(a) - score(b) || a.name.localeCompare(b.name))
    } else if (tab === 'all') {
      pool = [...pool].sort((a, b) => (top(b) ? 1 : 0) - (top(a) ? 1 : 0) || (recentRank.get(a.id) ?? 99) - (recentRank.get(b.id) ?? 99))
    }
    return pool.slice(0, 60)

  }, [q, tab, state.favourites, recentFoodIds, mineAsFood, myFoods])

  const oneTap = (f: Food) => {
    const mine = myFoodById.get(f.id)
    const entry = mine ? entryFromUserFood(mine, { meal, date: today }) : entryFromFood(f.id, { meal, date: today })
    dispatch({ type: 'addEntry', entry })
    showToast(entry)
  }
  const pick = (f: Food) => {
    const mine = myFoodById.get(f.id)
    if (mine) setPickedMine(mine)
    else setPicked(f)
  }

  const quickLink = (row?: boolean) => <button type="button" className={`tap font-bold text-g-ink underline ${row ? 'min-h-11 px-1.5' : '-my-3 inline-block py-3'}`} onClick={() => setQuick(true)}>Add Calories</button>

  return (
    <>
      <Screen>
        <header className="flex items-center justify-between gap-1">
          <Link to="/" aria-label="Close and go back to Today" className="grid h-11 w-11 shrink-0 place-items-center text-xl text-mute">✕</Link>
          {mode === 'food' ? (
            // v1.11: the meal is a 44 px card pill like the chips (16 px left, 12 px right of a chevron), sized to the
            // current meal. The native <select> sits invisibly on top, so a tap still opens the system picker.
            <label className="title flex min-w-0 items-center gap-2 text-[24px]">
              <span className="shrink-0">Add to</span>
              <span className="relative flex h-11 min-w-0 items-center gap-1.5 rounded-full border border-line bg-card pl-4 pr-3 focus-within:outline-3 focus-within:outline-offset-2 focus-within:outline-g-ink" data-testid="meal-pill">
                <span className="truncate font-display font-semibold leading-none text-g-ink" aria-hidden="true">{MEAL_LABEL[meal]}</span>
                <svg viewBox="0 0 24 24" className="h-[18px] w-[18px] shrink-0 text-g-ink" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 9.5 6 6 6-6" /></svg>
                <select
                  aria-label="Meal"
                  value={meal}
                  onChange={(e) => { const n = new URLSearchParams(params); n.set('meal', e.target.value); setParams(n, { replace: true }) }}
                  className="absolute -inset-px h-[calc(100%+2px)] w-[calc(100%+2px)] cursor-pointer appearance-none rounded-full opacity-0 focus:outline-none"
                >
                  {MEALS.map((m) => <option key={m} value={m}>{MEAL_LABEL[m]}</option>)}
                </select>
              </span>
            </label>
          ) : (
            <h1 className="title text-[24px]">Log exercise</h1>
          )}
          {/* v1.11: mirrors the close button to keep the title centred, but only takes room that is left over (basis 0,
              up to 44 px), so on a 375 px phone "Beverages" never loses a fraction of a pixel to it and truncates. */}
          <span className="h-11 min-w-0 max-w-11 flex-1 basis-0" aria-hidden="true" />
        </header>
        <div className="flex gap-2" role="group" aria-label="What to log">
          <Chip on={mode === 'food'} onClick={() => setMode('food')}><span aria-hidden="true">🍽 </span>Food</Chip>
          <Chip on={mode === 'exercise'} onClick={() => setMode('exercise')}><span aria-hidden="true">🏃 </span>Exercise</Chip>
        </div>
        <PastDayNote compact />
        {locked ? (
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
            onChange={(e) => { setQ(e.target.value); if (e.target.value && tab !== 'all' && tab !== 'mine' && !q) setTab('all') }}
            className="w-full appearance-none bg-transparent text-[17px] outline-none placeholder:text-mute focus:outline-none focus-visible:outline-none [&::-webkit-search-cancel-button]:hidden"
          />
        </div>
        {/* v1.10.1: four chips are wider than a phone, so the row scrolls sideways (the page never does). */}
        <div className="chip-row -mx-5 flex shrink-0 gap-2 overflow-x-auto px-5" role="group" aria-label="Food list" data-testid="food-tabs">
          <Chip className="shrink-0" on={tab === 'recent'} onClick={() => setTab('recent')}>Recent</Chip>
          <Chip className="shrink-0" on={tab === 'fav'} onClick={() => setTab('fav')}>Favourites</Chip>
          <Chip className="shrink-0" on={tab === 'mine'} onClick={(e) => { setTab('mine'); e.currentTarget.scrollIntoView({ block: 'nearest', inline: 'nearest' }) }} data-testid="tab-mine">My foods</Chip>
          <Chip className="shrink-0" on={tab === 'all'} onClick={(e) => { setTab('all'); e.currentTarget.scrollIntoView({ block: 'nearest', inline: 'nearest' }) }}>All foods</Chip>
        </div>
        {tab === 'mine' && (
          <button type="button" onClick={() => setNewFood('')} className="tap -mb-1 flex min-h-12 items-center justify-center gap-2 rounded-[18px] border border-dashed border-line text-[16px] font-bold text-g-ink" data-testid="myfoods-new">
            <span aria-hidden="true" className="text-[20px] leading-none">+</span>New food
          </button>
        )}
        <ul aria-label={tab === 'mine' ? 'My foods' : 'Foods'} data-testid="food-list">
          {list.map((f) => (
            <li key={f.id} className="flex items-center justify-between gap-2 border-b border-line">
              <button type="button" className="flex flex-1 items-center gap-3 py-2.5 text-left" onClick={() => pick(f)} aria-label={`${f.name}${mineAsFood.has(f.id) ? ', saved food' : ''}, ${f.servingLabel}, ${f.kcal} kcal. Choose amount`}>
                <span className="tile" aria-hidden="true">{foodEmoji(f.name)}</span>
                <span className="min-w-0">
                <div className="text-base font-semibold">{state.favourites.includes(f.id) && <span aria-hidden="true" className="text-carbs">★ </span>}{f.name}{mineAsFood.has(f.id) && <SavedMark />}</div>
                <div className="text-[13px] text-mute">{tab === 'mine' ? macroLine(f) : mineAsFood.has(f.id) ? f.servingLabel : `${f.servingLabel} (${f.grams} g)`}</div>
                </span>
              </button>
              {tab === 'mine' && myFoodById.get(f.id) ? (
                <div className="flex items-center">
                  <b className="num mr-1 text-[17px]">{f.kcal}</b>
                  <button type="button" onClick={() => setEditMine({ food: myFoodById.get(f.id)!, del: false })} aria-label={`Edit ${f.name}`} data-testid="myfood-row-edit" className="tap grid h-11 w-11 place-items-center rounded-full text-mute">
                    <PencilIcon className="h-5 w-5" />
                  </button>
                  <button type="button" onClick={() => setEditMine({ food: myFoodById.get(f.id)!, del: true })} aria-label={`Delete ${f.name}`} data-testid="myfood-row-delete" className="tap -mr-2 grid h-11 w-11 place-items-center rounded-full text-mute">
                    <TrashIcon />
                  </button>
                </div>
              ) : (
              <div className="flex items-center gap-3">
                <b className="num text-[17px]">{f.kcal}</b>
                <button type="button" onClick={() => oneTap(f)} aria-label={`Add one serving of ${f.name} to ${MEAL_LABEL[meal]}`} className="fab grid h-[34px] w-[34px] place-items-center rounded-full bg-g-soft text-[22px] font-bold text-g-soft-ink">+</button>
              </div>
              )}
            </li>
          ))}
          {list.length === 0 && (tab === 'mine' && !q.trim() ? (
            <li className="py-6 text-center text-[15px] text-mute" data-testid="myfoods-empty">No saved foods yet. Tap New food, or give a quick add a name.</li>
          ) : (
            <li className="py-6 text-center text-[15px] text-mute" data-testid="list-empty">
              {tab === 'recent' && !q ? <>No recent foods yet.{' '}{quickLink()}</> : tab === 'fav' && !q ? <>No favourites yet. Tap ☆ on a food to save it.{' '}{quickLink()}</> : (
                // v1.10.1: two 44 px links on their own line, so they never overlap when the text wraps on a small phone.
                <>
                  <span className="block">No match.</span>
                  <span className="mt-1 flex flex-wrap items-center justify-center gap-x-1">
                    <button type="button" className="tap min-h-11 px-1.5 font-bold text-g-ink underline" onClick={() => setNewFood(q.trim())} data-testid="save-to-mine">Save to my foods</button>
                    <span>or</span>
                    {quickLink(true)}
                  </span>
                </>
              )}
            </li>
          ))}
        </ul>
        <p className="mt-auto text-center text-xs text-mute">
          Tap + to add one serving instantly. Tap the row to change the amount.<br />Food values are illustrative.
        </p>
        </>)}
      </Screen>
      {/* v1.3.4: Quick add lives in a sticky full-width bar at the bottom of Log (Reed, option 1). Hidden when the
          day is closed, and while the on-screen keyboard is up so it never rides up over the list. */}
      {!locked && !keyboard && (
        // v1.11: 20 px on both sides (plus the safe area), the same gutter as the page, so the button's left edge and the
        // AI button's right edge line up with the search box and list. Was 20 px left, 8 px right. Both buttons are 56 px tall.
        <div className="px-safe-bar flex shrink-0 items-center gap-3 border-t border-line bg-bg pt-3 pb-safe-qa" data-testid="qa-bar">
          <button type="button" onClick={() => (mode === 'food' ? setQuick(true) : setQuickEx(true))} className={`tap flex h-14 min-w-0 flex-1 items-center justify-center gap-2 rounded-[18px] text-[17px] font-bold ${QA_BTN}`} data-testid="qa-btn">
            {mode === 'food' ? 'Add Calories' : 'Quick add burn'}
          </button>
          {/* v1.5: AI photo estimate (Reed's mock). Food mode only. Offline it says so instead of opening anything.
              v1.5.2: on the right (easier for the thumb), 56 px target. v1.11: 20 px from the edge plus the safe area, like the page.
              v1.6: the AI button; the photo is optional inside the sheet.
              v1.6.1 (Reed): sparkle only, no label; card background, line border, green sparkle. */}
          {mode === 'food' && (online ? (
            <button ref={aiBtnRef} type="button" onClick={(e) => openAi(e)} aria-label="Estimate with AI" aria-haspopup="menu" aria-expanded={!!aiMenu} data-testid="ai-btn" className="tap grid h-[56px] w-[56px] shrink-0 place-items-center rounded-full border-2 border-line bg-card text-g">
              <SparkleIcon gradient className="h-[34px] w-[34px]" />
            </button>
          ) : (
            <span role="note" data-testid="ai-offline" className="flex h-[56px] shrink-0 items-center gap-1.5 rounded-full border-2 border-dashed border-line px-3 text-[13px] font-semibold leading-tight text-mute">
              <SparkleIcon className="h-5 w-5" /><span>Needs<br />internet</span>
            </span>
          ))}
        </div>
      )}
      {toast && (
        <div role="status" className={`anim-fade ${bar ? 'bottom-above-qa' : 'bottom-safe'} absolute inset-x-4 z-20 flex items-center justify-between gap-3 rounded-[18px] bg-ink px-4 py-3 text-[15px] text-bg shadow-lg`} data-testid="toast">
          <span>{toast.text}</span>
        </div>
      )}
      {quickEx && (
        <ExerciseQuickSheet date={today} onClose={() => setQuickEx(false)} onDone={(e) => { setQuickEx(false); if (e) showExToast(e) }} />
      )}
      {picked && (
        <FoodSheet key={picked.id} mode="add" food={picked} meal={meal} date={today} remaining={remaining} onClose={() => setPicked(null)} onDone={(e) => { setPicked(null); showToast(e) }} />
      )}
      {pickedMine && (
        <MyFoodSheet key={pickedMine.id} mode="add" food={pickedMine} meal={meal} date={today} remaining={remaining} onClose={() => setPickedMine(null)} onDone={(e) => { setPickedMine(null); showToast(e) }} />
      )}
      <input ref={fileRef} type="file" accept="image/*" className="hidden" tabIndex={-1} aria-hidden="true" data-testid="photo-input" onChange={(e) => onFile(e.target.files?.[0], 'library')} />
      <input ref={captureRef} type="file" accept="image/*" capture="environment" className="hidden" tabIndex={-1} aria-hidden="true" data-testid="photo-capture" onChange={(e) => onFile(e.target.files?.[0], 'camera')} />
      {aiMenu && <AiMenu pos={aiMenu} fromKeyboard={aiMenu.kb} onClose={(kb) => { setAiMenu(null); if (aiMenu.kb || kb) aiBtnRef.current?.focus({ preventScroll: true }) }} onTakePhoto={takePhoto} onFromLibrary={fromLibrary} onTypeIt={typeIt} />}
      {noKey && <NoKeySheet onClose={() => setNoKey(false)} onSetup={() => nav('/settings?ai=1')} />}
      {aiFlow && (
        <AiFlow
          settings={aiFlow.ai}
          photo={aiFlow.photo}
          photoError={aiFlow.photoError}
          photoSource={photoSrc}
          onTakePhoto={() => captureRef.current?.click()}
          onChoosePhoto={() => fileRef.current?.click()}
          onRemovePhoto={() => setAiFlow((f) => (f ? { ...f, photo: null, photoError: false } : f))}
          onClose={() => setAiFlow(null)}
          onQuickAdd={() => { setAiFlow(null); setQuick(true) }}
          onFixKey={() => { setAiFlow(null); nav('/settings?ai=1') }}
          onLog={logAi}
        />
      )}
      {newFood !== null && (
        <QuickAddSheet mode="new" name={newFood} onClose={() => setNewFood(null)} onDone={(f) => { setNewFood(null); savedToast(f) }} />
      )}
      {editMine && (
        <MyFoodEditSheet key={editMine.food.id} food={editMine.food} startDelete={editMine.del} onClose={() => setEditMine(null)} />
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

/**
 * v1.7: pills rising above the AI button, over a light scrim. The sparkle is redrawn on top (tap = close).
 * Escape or a tap outside closes; arrow keys and Tab move between pills.
 * v1.7.1: three pills, bottom to top: Take photo (closest to the thumb), From library, Type it. No border or ring on
 * tap (pill-press); focus only moves into the menu when it was opened from the keyboard.
 */
function AiMenu({ pos, fromKeyboard, onClose, onTakePhoto, onFromLibrary, onTypeIt }: { pos: { right: number; bottom: number }; fromKeyboard: boolean; onClose: (kb?: boolean) => void; onTakePhoto: () => void; onFromLibrary: () => void; onTypeIt: () => void }) {
  const box = useRef<HTMLDivElement>(null)
  const close = useRef(onClose)
  close.current = onClose
  useEffect(() => {
    const items = () => Array.from(box.current?.querySelectorAll<HTMLElement>('[role=menuitem]') ?? [])
    if (fromKeyboard) items()[0]?.focus({ preventScroll: true })
    const k = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); close.current(true); return }
      if (!['ArrowUp', 'ArrowDown', 'Tab', 'Home', 'End'].includes(e.key)) return
      const list = items()
      if (!list.length) return
      e.preventDefault()
      const i = list.indexOf(document.activeElement as HTMLElement)
      // Nothing focused yet (opened by touch): Down/Tab start at the top pill, Up/Shift+Tab at the bottom one.
      const back = e.key === 'ArrowUp' || (e.key === 'Tab' && e.shiftKey)
      const n = i < 0 ? (e.key === 'End' || back ? list.length - 1 : 0) : e.key === 'Home' ? 0 : e.key === 'End' ? list.length - 1
        : (i + ((e.key === 'ArrowUp' || (e.key === 'Tab' && e.shiftKey)) ? -1 : 1) + list.length) % list.length
      list[n].focus()
    }
    document.addEventListener('keydown', k)
    return () => document.removeEventListener('keydown', k)
  }, []) // fromKeyboard is fixed for the menu's life
  const pill = 'anim-pop-in tap pill-press flex h-[52px] items-center gap-2.5 rounded-full bg-card pl-4 pr-5 text-[17px] font-bold text-ink shadow-[0_8px_24px_rgba(42,36,32,.16)]'
  return (
    <div className="absolute inset-0 z-30" data-testid="ai-menu">
      <div className="anim-fade absolute inset-0 bg-[rgba(42,36,32,.22)]" onClick={() => onClose()} aria-hidden="true" data-testid="ai-menu-scrim" />
      <div ref={box} role="menu" aria-label="Estimate with AI" className="absolute flex flex-col items-end gap-2.5" style={{ right: pos.right, bottom: pos.bottom + 56 + 14 }}>
        <button role="menuitem" type="button" onClick={onTypeIt} className={pill} style={{ animationDelay: '80ms' }} data-testid="menu-type">
          <PencilIcon className="h-[22px] w-[22px] text-g" />Type it
        </button>
        <button role="menuitem" type="button" onClick={onFromLibrary} className={pill} style={{ animationDelay: '40ms' }} data-testid="menu-library">
          <GalleryIcon className="h-[22px] w-[22px] text-g" />From library
        </button>
        <button role="menuitem" type="button" onClick={onTakePhoto} className={pill} data-testid="menu-photo">
          <CameraIcon className="h-[22px] w-[22px] text-g" />Take photo
        </button>
      </div>
      <button type="button" onClick={() => onClose()} aria-label="Close AI menu" tabIndex={-1} className="tap absolute grid h-[56px] w-[56px] place-items-center rounded-full border-2 border-line bg-card text-g" style={{ right: pos.right, bottom: pos.bottom }}>
        <SparkleIcon gradient className="h-[34px] w-[34px]" />
      </button>
    </div>
  )
}

function TrashIcon() {
  return <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4.5 7h15M9.5 7V4.8c0-.4.4-.8.8-.8h3.4c.4 0 .8.4.8.8V7M6.5 7l.8 12.2c.1.9.8 1.6 1.7 1.6h6c.9 0 1.6-.7 1.7-1.6L17.5 7" /></svg>
}
