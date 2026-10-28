import { useMemo, useState } from 'react'
import { FOOD_BY_ID, servingsFor, type Food } from '../data/foods'
import { foodEmoji } from '../data/foodEmoji'
import { dayView, fmt, goalMessage, round1 } from '../lib/calc'
import { formatAmount } from '../lib/amount'
import { entryFromFood, useStore } from '../lib/store'
import { MEALS, MEAL_LABEL, type Entry, type Meal } from '../lib/types'
import { Sheet, Stepper } from './Sheet'
import { Button, Chip, Illustrative } from './ui'

/** v1.10.1: Add item in an AI meal's breakdown. The new entry joins that group. */
export type EntryGroup = { id: string; name?: string }
export const groupFields = (g?: EntryGroup) => (g ? { groupId: g.id, ...(g.name ? { groupName: g.name } : {}) } : {})
/** Keep an edited entry's photo source and AI meal group. */
export const keptFields = (e: Entry) => ({ ...(e.source ? { source: e.source } : {}), ...(e.groupId ? { groupId: e.groupId } : {}), ...(e.groupName ? { groupName: e.groupName } : {}) })

/** v1.10.1: one star for built-in and saved foods, 44px target. */
export function FavStar({ id }: { id: string }) {
  const { state, dispatch } = useStore()
  const fav = state.favourites.includes(id)
  return (
    <button
      type="button"
      aria-pressed={fav}
      aria-label={fav ? 'Remove from favourites' : 'Add to favourites'}
      onClick={() => dispatch({ type: 'toggleFav', foodId: id })}
      className={`tap -mr-2 -mt-1.5 grid h-11 w-11 shrink-0 place-items-center text-[26px] leading-none ${fav ? 'text-carbs' : 'text-mute'}`}
      data-testid="fav-star"
    >
      {fav ? '★' : '☆'}
    </button>
  )
}

type Props =
  | { mode: 'add'; food: Food; meal: Meal; date: string; remaining: number; onDone: (e: Entry) => void; onClose: () => void; group?: EntryGroup }
  | { mode: 'edit'; entry: Entry; remaining: number; onDone: () => void; onClose: () => void }

export function FoodSheet(props: Props) {
  const { dispatch } = useStore()
  const food = props.mode === 'add' ? props.food : FOOD_BY_ID.get(props.entry.foodId!)!
  const servings = servingsFor(food)
  const init = props.mode === 'edit' ? props.entry : null
  const initIdx = init ? servings.findIndex((s) => Math.abs(s.mult - init.servingMult) < 1e-6) : 0
  const [idx, setIdx] = useState(initIdx === -1 ? servings.length : initIdx) // servings.length = Custom
  const [grams, setGrams] = useState(init ? Math.round(init.servingMult * food.grams) : food.grams)
  const [qty, setQty] = useState(init ? init.qty : 1)
  const [meal, setMeal] = useState<Meal>(init ? init.meal : props.mode === 'add' ? props.meal : 'snacks')
  const isCustom = idx === servings.length
  const mult = isCustom ? Math.max(1, grams) / food.grams : servings[idx].mult
  const servingLabel = isCustom ? `${Math.max(1, grams)} g` : servings[idx].label
  const totals = useMemo(
    () => ({ kcal: Math.round(food.kcal * mult * qty), p: food.protein * mult * qty, c: food.carbs * mult * qty, f: food.fat * mult * qty }),
    [food, mult, qty],
  )
  const qtyLabel = formatAmount(servingLabel, qty)

  const save = () => {
    const base = entryFromFood(food.id, { meal, date: props.mode === 'add' ? props.date : props.entry.date, mult, qty, servingLabel })
    if (props.mode === 'add') {
      const entry = { ...base, ...groupFields(props.group) }
      dispatch({ type: 'addEntry', entry })
      props.onDone(entry)
    } else {
      dispatch({ type: 'updateEntry', entry: { ...base, id: props.entry.id, createdAt: props.entry.createdAt, ...keptFields(props.entry) } })
      props.onDone()
    }
  }

  return (
    <Sheet label={props.mode === 'add' ? `Add ${food.name}` : `Edit ${food.name}`} onClose={props.onClose}>
      <div className="flex items-start justify-between gap-3">
        <span className="tile h-12 w-12 text-[26px]" aria-hidden="true">{foodEmoji(food.name)}</span>
        <div className="min-w-0 flex-1">
          <h2 className="title text-[24px] leading-tight">{food.name}</h2>
          <div className="text-[15px] text-mute">{food.category}</div>
        </div>
        <FavStar id={food.id} />
      </div>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Serving size">
        {servings.map((s, i) => (
          <Chip key={s.label} on={idx === i} onClick={() => setIdx(i)}>{s.label}</Chip>
        ))}
        <Chip on={isCustom} onClick={() => setIdx(servings.length)}>Custom</Chip>
      </div>
      {isCustom && (
        <label className="flex items-center justify-between gap-3 text-[15px]">
          <span>Grams per portion</span>
          <input
            type="number"
            inputMode="numeric"
            min={1}
            value={grams}
            onChange={(e) => setGrams(Number(e.target.value))}
            className="w-28 rounded-xl border border-line bg-bg px-3 py-2 text-right text-[17px]"
          />
        </label>
      )}
      <Stepper value={qty} onChange={setQty} label={qtyLabel} unit={servingLabel} />
      {props.mode === 'edit' && (
        <div className="flex flex-wrap gap-2" role="group" aria-label="Meal" data-no-drag>
          {MEALS.map((m) => (
            <Chip key={m} on={meal === m} onClick={() => setMeal(m)}>{MEAL_LABEL[m]}</Chip>
          ))}
        </div>
      )}
      <div className="grid grid-cols-3 gap-2.5 rounded-[22px] border border-line bg-bg p-4">
        <div><small className="text-[13px] text-mute">Protein</small><b className="block text-[15px]">{round1(totals.p)}g</b></div>
        <div><small className="text-[13px] text-mute">Carbs</small><b className="block text-[15px]">{round1(totals.c)}g</b></div>
        <div><small className="text-[13px] text-mute">Fat</small><b className="block text-[15px]">{round1(totals.f)}g</b></div>
      </div>
      <AfterThis remaining={props.remaining - totals.kcal} date={props.mode === 'edit' ? props.entry.date : props.date} />
      <Button data-autofocus={props.mode === 'add' ? true : undefined} onClick={save}>
        {props.mode === 'add' ? `Add ${fmt(totals.kcal)} kcal` : `Save · ${fmt(totals.kcal)} kcal`}
      </Button>
      {props.mode === 'edit' && <DeleteButton id={props.entry.id} onDone={props.onDone} />}
      <Illustrative />
    </Sheet>
  )
}

/**
 * The day after this change. `remaining` = balance - goal once the change is in (an edit passes the day total minus
 * the entry's old value; the sheet takes off the new one). v1.13.4: worded exactly like Home's goal line for that
 * day ("601 kcal past your 438 goal", "120 kcal to go to your 438 goal", surplus and break-even goals too). It used to
 * say "N kcal left" while Home said "N kcal past your goal" for the same day, and "past your goal" for the opposite case.
 */
export function AfterThis({ remaining, date }: { remaining: number; date: string }) {
  const { state } = useStore()
  const goal = state.profile ? dayView(state, date).goal : null
  const text = goal == null ? `${fmt(Math.abs(remaining))} kcal ${remaining < 0 ? 'over' : 'left'}` : goalMessage(Math.round(remaining + goal), goal, false).replace(/\.$/, '')
  return (
    <div className="flex items-baseline justify-between gap-3 text-base">
      <span className="shrink-0 text-mute">After this</span>
      <b className="text-right" data-testid="after-this">{text}</b>
    </div>
  )
}

export function DeleteButton({ id, onDone }: { id: string; onDone: () => void }) {
  const { dispatch } = useStore()
  return (
    <Button variant="danger" onClick={() => { dispatch({ type: 'deleteEntry', id }); onDone() }}>
      Delete entry
    </Button>
  )
}
