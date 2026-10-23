import { useMemo, useState } from 'react'
import { FOOD_BY_ID, servingsFor, type Food } from '../data/foods'
import { fmt, round1 } from '../lib/calc'
import { entryFromFood, useStore } from '../lib/store'
import { MEALS, MEAL_LABEL, type Entry, type Meal } from '../lib/types'
import { Sheet, Stepper } from './Sheet'
import { Button, Chip, Illustrative } from './ui'

type Props =
  | { mode: 'add'; food: Food; meal: Meal; date: string; remaining: number; onDone: (e: Entry) => void; onClose: () => void }
  | { mode: 'edit'; entry: Entry; remaining: number; onDone: () => void; onClose: () => void }

export function FoodSheet(props: Props) {
  const { state, dispatch } = useStore()
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
  const fav = state.favourites.includes(food.id)
  const short = isCustom ? `${Math.max(1, grams)} g` : servings[idx].label.replace(/ \(.*\)$/, '')
  const qtyLabel = qty === 1 ? short : `${qty} × ${short}`

  const save = () => {
    const base = entryFromFood(food.id, { meal, date: props.mode === 'add' ? props.date : props.entry.date, mult, qty, servingLabel })
    if (props.mode === 'add') {
      dispatch({ type: 'addEntry', entry: base })
      props.onDone(base)
    } else {
      dispatch({ type: 'updateEntry', entry: { ...base, id: props.entry.id, createdAt: props.entry.createdAt } })
      props.onDone()
    }
  }

  return (
    <Sheet label={props.mode === 'add' ? `Add ${food.name}` : `Edit ${food.name}`} onClose={props.onClose}>
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-xl font-bold">{food.name}</h2>
          <div className="text-[15px] text-mute">{food.category}</div>
        </div>
        <button
          type="button"
          aria-pressed={fav}
          aria-label={fav ? 'Remove from favourites' : 'Add to favourites'}
          onClick={() => dispatch({ type: 'toggleFav', foodId: food.id })}
          className={`text-[24px] leading-none ${fav ? 'text-carbs' : 'text-mute'}`}
        >
          {fav ? '★' : '☆'}
        </button>
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
      <Stepper value={qty} onChange={setQty} label={qtyLabel} />
      {props.mode === 'edit' && (
        <div className="flex flex-wrap gap-2" role="group" aria-label="Meal">
          {MEALS.map((m) => (
            <Chip key={m} on={meal === m} onClick={() => setMeal(m)}>{MEAL_LABEL[m]}</Chip>
          ))}
        </div>
      )}
      <div className="grid grid-cols-3 gap-2.5 rounded-[20px] border border-line bg-bg p-4">
        <div><small className="text-[13px] text-mute">Protein</small><b className="block text-[15px]">{round1(totals.p)}g</b></div>
        <div><small className="text-[13px] text-mute">Carbs</small><b className="block text-[15px]">{round1(totals.c)}g</b></div>
        <div><small className="text-[13px] text-mute">Fat</small><b className="block text-[15px]">{round1(totals.f)}g</b></div>
      </div>
      <AfterThis remaining={props.remaining - totals.kcal} />
      <Button data-autofocus onClick={save}>
        {props.mode === 'add' ? `Add ${fmt(totals.kcal)} kcal` : `Save · ${fmt(totals.kcal)} kcal`}
      </Button>
      {props.mode === 'edit' && <DeleteButton id={props.entry.id} onDone={props.onDone} />}
      <Illustrative />
    </Sheet>
  )
}

export function AfterThis({ remaining }: { remaining: number }) {
  const over = remaining < 0
  return (
    <div className="flex justify-between text-base">
      <span className="text-mute">After this</span>
      <b className={over ? 'text-over-ink' : ''}>{fmt(Math.abs(remaining))} kcal {over ? 'over' : 'left'}</b>
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
