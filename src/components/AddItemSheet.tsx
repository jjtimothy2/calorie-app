// v1.10.1: Add item in an AI meal's breakdown. Pick a food (favourites and saved foods first, then recent, any food
// when searching) or Quick add; the new entry joins the meal's group, so Home's row and the sheet total update.
import { useMemo, useState } from 'react'
import { FOODS, FOOD_BY_ID, type Food } from '../data/foods'
import { foodEmoji } from '../data/foodEmoji'
import { fmt } from '../lib/calc'
import { useStore } from '../lib/store'
import { USER_SERVING, type UserFood } from '../lib/myFoods'
import type { Entry, Meal } from '../lib/types'
import { FoodSheet, type EntryGroup } from './FoodSheet'
import { MyFoodSheet, SavedMark } from './MyFoodSheet'
import { QuickAddSheet } from './QuickAddSheet'
import { Sheet } from './Sheet'

type Props = { group: EntryGroup; title: string; meal: Meal; date: string; remaining: number; onDone: (e: Entry) => void; onClose: () => void }

export function AddItemSheet({ group, title, meal, date, remaining, onDone, onClose }: Props) {
  const { state, recentFoodIds, myFoods, myFoodById } = useStore()
  const [q, setQ] = useState('')
  const [picked, setPicked] = useState<Food | null>(null)
  const [mine, setMine] = useState<UserFood | null>(null)
  const [quick, setQuick] = useState(false)
  const asFood = useMemo(() => new Map(myFoods.map((m) => [m.id, { id: m.id, name: m.name, category: 'My foods', servingLabel: USER_SERVING, grams: 0, kcal: m.kcal, protein: m.protein, carbs: m.carbs, fat: m.fat } as Food])), [myFoods])
  const list = useMemo(() => {
    const any = (id: string) => FOOD_BY_ID.get(id) ?? asFood.get(id)
    const needle = q.trim().toLowerCase()
    if (needle) {
      const fav = new Set(state.favourites)
      const rank = (f: Food) => (fav.has(f.id) || asFood.has(f.id) ? 0 : 10) + (f.name.toLowerCase().startsWith(needle) ? 0 : 2)
      return [...asFood.values(), ...FOODS]
        .filter((f) => f.name.toLowerCase().includes(needle) || f.category.toLowerCase().includes(needle))
        .sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name))
        .slice(0, 40)
    }
    const seen = new Set<string>()
    const out: Food[] = []
    for (const id of [...state.favourites, ...[...myFoods].sort((a, b) => b.updatedAt - a.updatedAt).map((m) => m.id), ...recentFoodIds]) {
      const f = any(id)
      if (f && !seen.has(id)) { seen.add(id); out.push(f) }
    }
    return out.slice(0, 40)
  }, [q, state.favourites, recentFoodIds, myFoods, asFood])

  if (picked) return <FoodSheet key={picked.id} mode="add" food={picked} meal={meal} date={date} remaining={remaining} group={group} onClose={() => setPicked(null)} onDone={onDone} />
  if (mine) return <MyFoodSheet key={mine.id} mode="add" food={mine} meal={meal} date={date} remaining={remaining} group={group} onClose={() => setMine(null)} onDone={onDone} />
  if (quick) return <QuickAddSheet mode="add" meal={meal} date={date} remaining={remaining} group={group} onClose={() => setQuick(false)} onDone={onDone} />

  const pick = (f: Food) => { const m = myFoodById.get(f.id); if (m) setMine(m); else setPicked(f) }
  return (
    <Sheet label={`Add an item to ${title}`} onClose={onClose}>
      <div data-testid="add-item-sheet" className="flex flex-col gap-3">
        <div>
          <h2 className="title text-[24px] leading-tight">Add item</h2>
          <p className="truncate text-[15px] text-mute">To {title}</p>
        </div>
        <div className="flex items-center gap-2 rounded-2xl border border-line bg-bg px-3.5">
          <span aria-hidden="true" className="text-mute">⌕</span>
          <input
            type="search"
            aria-label="Search foods"
            placeholder="Search foods, e.g. tempe"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            data-testid="add-item-search"
            className="h-12 w-full appearance-none bg-transparent text-[17px] outline-none placeholder:text-mute [&::-webkit-search-cancel-button]:hidden"
          />
        </div>
        <button type="button" onClick={() => setQuick(true)} className="tap flex min-h-12 items-center gap-3 rounded-2xl bg-g-soft px-4 text-left text-[16px] font-bold text-g-soft-ink" data-testid="add-item-quick">
          Add Calories
        </button>
        {!q.trim() && list.length > 0 && <p className="-mb-2 text-[13px] font-semibold text-mute">Favourites, my foods and recent</p>}
        <ul aria-label="Foods" data-testid="add-item-list">
          {list.map((f) => (
            <li key={f.id} className="border-b border-line">
              <button type="button" onClick={() => pick(f)} className="flex min-h-12 w-full items-center gap-3 py-2 text-left" aria-label={`${f.name}${asFood.has(f.id) ? ', saved food' : ''}, ${fmt(f.kcal)} kcal. Choose amount`}>
                <span className="tile" aria-hidden="true">{foodEmoji(f.name)}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-base font-semibold">{state.favourites.includes(f.id) && <span aria-hidden="true" className="text-carbs">★ </span>}{f.name}{asFood.has(f.id) && <SavedMark />}</span>
                  <span className="block truncate text-[13px] text-mute">{asFood.has(f.id) ? f.servingLabel : `${f.servingLabel} (${f.grams} g)`}</span>
                </span>
                <b className="num text-[17px]">{fmt(f.kcal)}</b>
              </button>
            </li>
          ))}
          {list.length === 0 && (
            <li className="py-5 text-center text-[15px] text-mute">{q.trim() ? 'No match. Try Add Calories.' : 'Search for a food, or use Add Calories.'}</li>
          )}
        </ul>
      </div>
    </Sheet>
  )
}
