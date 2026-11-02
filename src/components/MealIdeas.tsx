// v1.20 Meal Ideas. Opened from Home's "What should I eat?" / "Still hungry? Light ideas" link. Asks the user's AI
// (Gemini or OpenAI, same model as the estimate) for 3 ideas that fit the kcal left and protein to go; "Log this" opens
// the AI result sheet (Edit comes back here) and logs to the meal the sheet opened with. No key, offline or an error:
// picks from the user's own foods, so it never dead-ends. Chips re-ask with a preference; "Show other ideas" gives 3
// new ones, 5 times a day. Focus goes to the sheet, never an input.
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { FOODS, FOOD_BY_ID, type Food } from '../data/foods'
import { aiServingLabel } from '../lib/amount'
import { AiError, PROVIDER_LABEL, errorText, normName, perServing, readAi, type AiErrorKind } from '../lib/ai'
import { dayView, defaultMeal, entryTotals, fmt, macroTargets, sumEntries } from '../lib/calc'
import {
  MAX_REFRESH, PREFS, askIdeas, clock, countRefresh, ideasView, localPicks, mealTitle, mealWord, refreshesUsed,
  type AiIdea, type Candidate, type Pref,
} from '../lib/ideas'
import { USER_SERVING, type UserFood } from '../lib/myFoods'
import { newId, useStore } from '../lib/store'
import type { Entry } from '../lib/types'
import { FoodSheet } from './FoodSheet'
import { MyFoodSheet } from './MyFoodSheet'
import { Results, SparkleIcon, type LogItem } from './PhotoSheets'
import { useOnline } from './PlusMenu'
import { Sheet } from './Sheet'
import { Button, Chip } from './ui'

type Phase =
  | { k: 'nokey' }
  | { k: 'offline' }
  | { k: 'loading'; prev: AiIdea[] | null }
  | { k: 'ideas'; ideas: AiIdea[] }
  | { k: 'error'; kind: AiErrorKind }
type Child = null | { k: 'result'; idea: AiIdea } | { k: 'food'; food: Food } | { k: 'mine'; food: UserFood }

const pill = 'whitespace-nowrap rounded-full bg-g-soft px-2.5 py-0.5 text-[13px] font-semibold text-g-soft-ink'
const logBtn = 'tap min-h-11 shrink-0 rounded-full border border-g bg-card px-4 text-[15px] font-bold text-g-ink'

export function MealIdeas({ onClose }: { onClose: () => void }) {
  const { state, dispatch, today, myFoods, myFoodById, recentFoodIds, land } = useStore()
  const go = useNavigate()
  const online = useOnline()
  // Fixed when the sheet opens: logging goes to this meal and day even if the clock moves on.
  const [opened] = useState(() => ({ meal: defaultMeal(), time: clock(new Date()), date: today, ai: readAi() }))
  const { meal, date, ai } = opened
  const label = ai ? PROVIDER_LABEL[ai.provider] : 'AI'
  const day = dayView(state, date)
  const view = ideasView(day.balance, day.goal)
  const entries = state.entries.filter((e) => e.date === date)
  const proteinTarget = state.profile ? macroTargets(state.profile).protein : 0
  const toGo = Math.max(0, proteinTarget - Math.round(sumEntries(entries).protein))
  const hit = proteinTarget > 0 && toGo <= 0
  const kcalLeft = Math.max(0, Math.round(day.balance - day.goal))

  const [phase, setPhase] = useState<Phase>(() => (!ai ? { k: 'nokey' } : !online ? { k: 'offline' } : { k: 'loading', prev: null }))
  const [prefs, setPrefs] = useState<Pref[]>([])
  const [used, setUsed] = useState(() => refreshesUsed(today))
  const [child, setChild] = useState<Child>(null)
  const shown = useRef<string[]>([])
  const ctl = useRef<AbortController | null>(null)
  useEffect(() => () => ctl.current?.abort(), [])

  const ask = async (kind: 'first' | 'refresh' | 'pref', p: Pref[] = prefs) => {
    if (!ai) return setPhase({ k: 'nokey' })
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return setPhase({ k: 'offline' })
    ctl.current?.abort()
    const c = new AbortController()
    ctl.current = c
    const prev = phase.k === 'ideas' ? phase.ideas : phase.k === 'loading' ? phase.prev : null
    setPhase({ k: 'loading', prev })
    try {
      const ideas = await askIdeas(ai, {
        meal, time: opened.time, cap: view.cap, over: view.over, kcalLeft, proteinToGo: hit || !proteinTarget ? null : toGo,
        eatenToday: [...new Set(entries.map((e) => e.name))], prefs: p, avoid: kind === 'refresh' ? shown.current : [],
      }, { signal: c.signal })
      if (c.signal.aborted) return
      if (kind === 'refresh') setUsed(countRefresh(today))
      shown.current = [...shown.current, ...ideas.map((i) => i.name)]
      setPhase({ k: 'ideas', ideas })
    } catch (e) {
      if (c.signal.aborted) return
      const kind = e instanceof AiError ? e.kind : 'failed'
      setPhase(kind === 'offline' ? { k: 'offline' } : { k: 'error', kind })
    }
  }
  const first = useRef(false)
  useEffect(() => {
    if (first.current) return
    first.current = true
    if (phase.k === 'loading') void ask('first')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const cancel = () => {
    ctl.current?.abort()
    if (phase.k === 'loading' && phase.prev) setPhase({ k: 'ideas', ideas: phase.prev })
    else onClose()
  }
  const togglePref = (p: Pref) => {
    const next = prefs.includes(p) ? prefs.filter((x) => x !== p) : [...prefs, p]
    setPrefs(next)
    void ask('pref', next)
  }
  const toKeyInMe = () => { onClose(); go('/settings?ai=1&kb=0') }

  // Local picks from Favourites, My foods, recents and built-ins.
  const fav = new Set(state.favourites)
  const recent = new Map(recentFoodIds.map((id, i) => [id, i]))
  const cands: Candidate[] = [
    ...myFoods.map((f) => ({ id: f.id, name: f.name, kcal: f.kcal, protein: f.protein, category: 'My foods', serving: USER_SERVING, fav: fav.has(f.id), recent: recent.get(f.id) ?? -1, mine: true })),
    ...FOODS.map((f) => ({ id: f.id, name: f.name, kcal: f.kcal, protein: f.protein, category: f.category, serving: `${f.servingLabel} (${f.grams} g)`, fav: fav.has(f.id), recent: recent.get(f.id) ?? -1, mine: false })),
  ]
  const eatenIds = new Set(entries.map((e) => e.foodId).filter((x): x is string => !!x))
  const eatenNames = new Set(entries.map((e) => normName(e.name)))
  const aiIdeas = phase.k === 'ideas' ? phase.ideas : phase.k === 'loading' && phase.prev ? phase.prev : []
  for (const i of aiIdeas) eatenNames.add(normName(i.name))
  const picks = localPicks(cands, { cap: view.cap, proteinHit: hit, eatenIds, eatenNames, n: 6 })
  const topUp = phase.k === 'ideas' ? picks.slice(0, Math.max(0, 3 - aiIdeas.length)) : []
  const capped = used >= MAX_REFRESH
  const lower = phase.k === 'ideas' ? (capped ? picks.slice(topUp.length, topUp.length + 3) : []) : phase.k === 'loading' ? [] : picks.slice(0, 3)

  const openPick = (c: Candidate) => {
    if (c.mine) { const f = myFoodById.get(c.id); if (f) setChild({ k: 'mine', food: f }) }
    else { const f = FOOD_BY_ID.get(c.id); if (f) setChild({ k: 'food', food: f }) }
  }
  const landed = (e: Entry) => {
    land({ kind: 'food', date: e.date, ids: [e.id], text: `Added ${e.name} · ${fmt(entryTotals(e).kcal)} kcal` })
    onClose()
  }
  const logIdea = (rows: LogItem[], dish: string) => {
    const groupId = rows.length > 1 ? newId() : undefined
    const added: Entry[] = rows.map(({ item, servings }) => {
      const p = perServing(item)
      return {
        id: newId(), date, meal, foodId: null, name: item.ai.name,
        servingLabel: aiServingLabel(item.ai.portion, item.ai.grams), servingMult: 1, qty: servings,
        kcal: p.kcal, protein: p.protein, carbs: p.carbs, fat: p.fat, createdAt: Date.now(), source: 'photo' as const,
        ...(groupId ? { groupId, groupName: dish } : {}),
      }
    })
    for (const entry of added) dispatch({ type: 'addEntry', entry })
    const kcal = added.reduce((a, e) => a + entryTotals(e).kcal, 0)
    land({ kind: 'food', date, ids: added.map((e) => e.id), text: `Added ${added.length} ${added.length === 1 ? 'item' : 'items'} from AI · ${fmt(kcal)} kcal` })
    onClose()
  }

  if (child?.k === 'result') {
    const idea = child.idea
    const item = { key: 'idea', name: idea.name, grams: idea.grams, emojiName: idea.name, ai: idea }
    return <Results dish={idea.name} scaleRef="" items={[item]} photo={null} note="" source={`Suggested by ${label}`} onEdit={() => setChild(null)} onClose={onClose} onLog={logIdea} />
  }
  if (child?.k === 'food') return <FoodSheet mode="add" food={child.food} meal={meal} date={date} remaining={kcalLeft} onDone={landed} onClose={() => setChild(null)} />
  if (child?.k === 'mine') return <MyFoodSheet mode="add" food={child.food} meal={meal} date={date} remaining={kcalLeft} onDone={landed} onClose={() => setChild(null)} />

  const title = view.over ? "You're over today's goal" : `${mealTitle(meal)} ideas`
  const loading = phase.k === 'loading'
  const showChips = !!ai && !view.over && (phase.k === 'ideas' || phase.k === 'loading')

  const pickCard = (c: Candidate) => (
    <li key={c.id} className="flex flex-col gap-1.5 rounded-2xl border border-line bg-card px-3.5 py-3" data-testid="idea" data-source="local">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1 break-words text-[17px] font-semibold leading-tight" data-testid="idea-name">{c.name}</div>
        <b className="num shrink-0 whitespace-nowrap text-[17px] leading-tight" data-testid="idea-kcal">{fmt(c.kcal)} <span className="font-sans text-[13px] font-normal text-mute">kcal</span></b>
      </div>
      <div className="flex items-center gap-2">
        <span className={pill} data-testid="idea-protein">{fmt(c.protein)} g protein</span>
        <span className="min-w-0 flex-1 truncate text-[13px] text-mute" data-testid="idea-serving">{c.serving}</span>
        <button type="button" className={logBtn} onClick={() => openPick(c)} aria-label={`Log this: ${c.name}`}>Log this</button>
      </div>
    </li>
  )
  const ideaCard = (i: AiIdea, n: number) => (
    <li key={`${i.name}-${n}`} className="flex flex-col gap-1 rounded-2xl border border-line bg-card px-3.5 py-3" data-testid="idea" data-source="ai">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1 break-words text-[17px] font-semibold leading-tight" data-testid="idea-name">{i.name}</div>
        <b className="num shrink-0 whitespace-nowrap text-[17px] leading-tight" data-testid="idea-kcal">{fmt(i.kcal)} <span className="font-sans text-[13px] font-normal text-mute">kcal</span></b>
      </div>
      {i.why && <p className="text-[14px] leading-snug text-mute" data-testid="idea-why">{i.why}</p>}
      <div className="mt-0.5 flex items-center gap-2">
        <span className={pill} data-testid="idea-protein">{fmt(i.protein)} g protein</span>
        <span className="min-w-0 flex-1 truncate text-[13px] text-mute" data-testid="idea-serving">{aiServingLabel(i.portion, i.grams)}</span>
        <button type="button" className={logBtn} onClick={() => setChild({ k: 'result', idea: i })} aria-label={`Log this: ${i.name}`}>Log this</button>
      </div>
    </li>
  )
  const muted = (sub: string, action: string, onAction: () => void, testid: string) => (
    <div className="flex flex-col gap-3 rounded-2xl bg-[#efe7d8] px-4 py-3.5" data-testid={testid}>
      <div className="flex items-center gap-3 text-mute">
        <SparkleIcon className="h-6 w-6 shrink-0" />
        <div className="leading-tight">
          <div className="text-[17px] font-semibold">Ideas from AI</div>
          <div className="text-[13px]" data-testid="ideas-sub">{sub}</div>
        </div>
      </div>
      <Button onClick={onAction}>{action}</Button>
    </div>
  )

  return (
    <Sheet label={title} onClose={onClose}>
      <div>
        <h2 className="title text-[26px] leading-tight" data-testid="ideas-title">{title}</h2>
        <p className="mt-0.5 text-[15px] text-mute" data-testid="ideas-head">
          {view.over && view.term ? (
            <>{view.head} · <b className={view.term.ink} data-testid="ideas-term">{view.term.text}</b></>
          ) : (
            <>{view.head}{proteinTarget > 0 && <> · {hit ? <b className="text-g-ink" data-testid="ideas-hit">Target hit</b> : `${fmt(toGo)} g protein to go`}</>}</>
          )}
        </p>
      </div>
      {view.over && <Button onClick={onClose}>I'm done for today</Button>}
      {showChips && (
        <div className="flex flex-wrap gap-2" role="group" aria-label="Preferences">
          {PREFS.map((p) => <Chip key={p} on={prefs.includes(p)} disabled={loading} onClick={() => togglePref(p)}>{p}</Chip>)}
        </div>
      )}

      {phase.k === 'nokey' && muted('Need AI key', 'Add a key in Me', toKeyInMe, 'ideas-nokey')}
      {phase.k === 'offline' && muted('Needs internet', 'Try again', () => void ask('first'), 'ideas-offline')}
      {phase.k === 'error' && (() => {
        const t = errorText(phase.kind, ai!.provider)
        const fix = phase.kind === 'key' || phase.kind === 'model'
        return (
          <div className="flex flex-col gap-2.5 rounded-2xl border border-line bg-card px-4 py-3.5" data-testid="ideas-error" data-kind={phase.kind}>
            <h3 className="text-[18px] font-bold leading-tight">{t.title}</h3>
            <p className="text-[15px] leading-snug">{t.body}</p>
            {fix ? <Button onClick={() => { onClose(); go('/settings?ai=1') }}>Check key in Me</Button> : <Button onClick={() => void ask('first')}>Try again</Button>}
          </div>
        )
      })()}

      {loading && (
        <div className="flex flex-col gap-2.5" data-testid="ideas-loading">
          {view.over && <h3 className="text-[15px] font-bold text-mute">Light ideas under 150 kcal</h3>}
          <p className="text-[15px] text-mute" role="status"><span className="photo-pulse">✦</span> Asking {label} for {mealWord(meal)} ideas…</p>
          <ul className="flex flex-col gap-2.5" aria-hidden="true">
            {[0, 1, 2].map((n) => (
              <li key={n} className="flex flex-col gap-2 rounded-2xl border border-line bg-card px-3.5 py-3" data-testid="idea-skeleton">
                <div className="h-4 w-3/5 animate-pulse rounded bg-line" />
                <div className="h-3 w-2/5 animate-pulse rounded bg-line" />
                <div className="flex items-center justify-between"><div className="h-5 w-24 animate-pulse rounded-full bg-line" /><div className="h-11 w-24 animate-pulse rounded-full bg-line" /></div>
              </li>
            ))}
          </ul>
          <Button variant="ghost" className="!bg-transparent" onClick={cancel}>Cancel</Button>
        </div>
      )}

      {phase.k === 'ideas' && (
        <div className="flex flex-col gap-2.5">
          {view.over && <h3 className="text-[15px] font-bold text-mute">Light ideas under 150 kcal</h3>}
          <ul className="flex flex-col gap-2.5" aria-label={view.over ? 'Light ideas' : 'Ideas'} data-testid="ideas-list">
            {aiIdeas.map(ideaCard)}
            {topUp.map(pickCard)}
          </ul>
          {!aiIdeas.length && !topUp.length && <p className="text-center text-[15px] text-mute">Nothing fits what's left today.</p>}
          {capped
            ? <p className="py-2 text-center text-[15px] text-mute" data-testid="ideas-capped">That's all the ideas for today</p>
            : <button type="button" className="tap mx-auto min-h-11 px-4 text-[16px] font-bold text-g-ink" onClick={() => void ask('refresh')} data-testid="ideas-more">Show other ideas</button>}
          <p className="text-center text-[13px] leading-snug text-mute" data-testid="ideas-foot">Ideas from {label}. Numbers are rough, check them before logging.</p>
        </div>
      )}

      {lower.length > 0 && (
        <div className="flex flex-col gap-2.5" data-testid="ideas-picks">
          <h3 className="text-[15px] font-bold">Picks from your foods that fit</h3>
          <ul className="flex flex-col gap-2.5" aria-label="Picks from your foods">{lower.map(pickCard)}</ul>
          {phase.k !== 'ideas' && <p className="text-center text-[13px] text-mute">From Favourites, My foods, recents and built-ins.</p>}
        </div>
      )}
      {phase.k !== 'ideas' && phase.k !== 'loading' && !lower.length && <p className="text-center text-[15px] text-mute" data-testid="ideas-none">Nothing from your foods fits what's left today.</p>}
    </Sheet>
  )
}
