import { useState } from 'react'
import { fmt } from '../lib/calc'
import { newId, useStore } from '../lib/store'
import { MEALS, MEAL_LABEL, type Entry, type Meal } from '../lib/types'
import { cleanName, findByName, USER_SERVING } from '../lib/myFoods'
import { SavedMark, MyFoodEditSheet } from './MyFoodSheet'
import { AfterThis, DeleteButton } from './FoodSheet'
import { Sheet } from './Sheet'
import { Button, Chip } from './ui'

type Props =
  | { mode: 'add'; meal: Meal; date: string; remaining: number; onDone: (e: Entry) => void; onClose: () => void }
  | { mode: 'edit'; entry: Entry; remaining: number; onDone: () => void; onClose: () => void }

const input = 'w-full rounded-xl border border-line bg-bg px-3 py-3 text-[17px]'

export function QuickAddSheet(props: Props) {
  const { dispatch, myFoods, myFoodById, saveMyFood } = useStore()
  const e = props.mode === 'edit' ? props.entry : null
  const [name, setName] = useState(e ? e.name : '')
  const [kcal, setKcal] = useState(e ? String(Math.round(e.kcal * e.qty)) : '')
  const [p, setP] = useState(e && e.protein ? String(+(e.protein * e.qty).toFixed(1)) : '')
  const [c, setC] = useState(e && e.carbs ? String(+(e.carbs * e.qty).toFixed(1)) : '')
  const [f, setF] = useState(e && e.fat ? String(+(e.fat * e.qty).toFixed(1)) : '')
  const [meal, setMeal] = useState<Meal>(e ? e.meal : props.mode === 'add' ? props.meal : 'snacks')
  // v1.9: an entry logged from one of your foods is edited here too (its own numbers); the food itself via "Edit food".
  const mineFood = e?.foodId ? myFoodById.get(e.foodId) : undefined
  const [editFood, setEditFood] = useState(false)
  const k = Math.round(Number(kcal))
  const valid = Number.isFinite(k) && k > 0 && k < 10000

  // v1.9: a named quick add is saved to My foods (the same name updates that food). Editing an old entry never does.
  const named = props.mode === 'add' && cleanName(name).length > 0
  const existing = named ? findByName(myFoods, name) : undefined

  const save = () => {
    if (!valid) return
    const macros = { kcal: k, protein: Number(p) || 0, carbs: Number(c) || 0, fat: Number(f) || 0 }
    const q = e?.foodId && e.qty > 0 ? e.qty : 1
    const mine = named ? saveMyFood({ name, ...macros }) : null
    const entry: Entry = {
      id: e ? e.id : newId(),
      date: props.mode === 'add' ? props.date : props.entry.date,
      meal,
      foodId: mine ? mine.id : e ? e.foodId : null,
      name: mine ? mine.name : name.trim() || 'Quick add',
      servingLabel: mine ? USER_SERVING : e?.foodId ? e.servingLabel : 'Quick add',
      servingMult: 1,
      // Values are stored per 1 qty; an entry of 2 servings keeps its amount and the totals are split back.
      qty: q,
      kcal: k / q,
      protein: (Number(p) || 0) / q,
      carbs: (Number(c) || 0) / q,
      fat: (Number(f) || 0) / q,
      createdAt: e ? e.createdAt : Date.now(),
      ...(e?.source ? { source: e.source } : {}),
      ...(e?.groupId ? { groupId: e.groupId, groupName: e.groupName } : {}),
    }
    if (props.mode === 'add') {
      dispatch({ type: 'addEntry', entry })
      props.onDone(entry)
    } else {
      dispatch({ type: 'updateEntry', entry })
      props.onDone()
    }
  }

  if (editFood && mineFood) return <MyFoodEditSheet food={mineFood} onClose={() => setEditFood(false)} onDeleted={() => setEditFood(false)} />

  return (
    <Sheet label={props.mode === 'add' ? 'Quick add calories' : 'Edit quick add'} onClose={props.onClose}>
      <div className="flex items-start justify-between gap-3">
        <h2 className="title text-[24px] leading-tight">{props.mode === 'add' ? 'Quick add' : e?.source === 'photo' ? 'Edit item' : 'Edit quick add'}{mineFood && <SavedMark className="ml-2 h-[18px] w-[18px] align-[1px]" />}</h2>
        {mineFood && (
          <button type="button" onClick={() => setEditFood(true)} className="tap shrink-0 px-1 py-1 text-[15px] font-bold text-g-ink" data-testid="myfood-edit">Edit food</button>
        )}
      </div>
      <form className="flex flex-col gap-3" onSubmit={(ev) => { ev.preventDefault(); save() }}>
        <label className="flex flex-col gap-1 text-[15px] font-semibold">
          Calories (kcal)
          <input data-autofocus className={input} type="number" inputMode="numeric" min={1} required value={kcal} onChange={(ev) => setKcal(ev.target.value)} name="kcal" />
        </label>
        <label className="flex flex-col gap-1 text-[15px] font-semibold">
          Name <span className="font-normal text-mute">(optional)</span>
          <input className={input} value={name} onChange={(ev) => setName(ev.target.value)} name="name" placeholder="e.g. Office cake" aria-describedby={props.mode === 'add' ? 'qa-name-hint' : undefined} />
          {props.mode === 'add' && (
            <span id="qa-name-hint" className="text-[13px] font-normal text-mute" data-testid="qa-name-hint">
              {existing ? `Updates ${existing.name} in My foods.` : named ? 'Saved to My foods, so you can search for it next time.' : 'Give it a name to save it to My foods.'}
            </span>
          )}
        </label>
        <fieldset className="grid grid-cols-3 gap-2">
          <legend className="mb-1 text-[15px] font-semibold">Macros, grams <span className="font-normal text-mute">(optional)</span></legend>
          {([['Protein', p, setP], ['Carbs', c, setC], ['Fat', f, setF]] as const).map(([l, v, set]) => (
            <label key={l} className="flex flex-col gap-1 text-[13px] text-mute">
              {l}
              <input className={input} type="number" inputMode="decimal" min={0} step="any" value={v} onChange={(ev) => set(ev.target.value)} />
            </label>
          ))}
        </fieldset>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Meal">
          {MEALS.map((m) => (
            <Chip key={m} on={meal === m} onClick={() => setMeal(m)}>{MEAL_LABEL[m]}</Chip>
          ))}
        </div>
        <AfterThis remaining={props.remaining - (valid ? k : 0)} />
        <Button type="submit" disabled={!valid}>
          {props.mode === 'add' ? `Add ${valid ? fmt(k) + ' ' : ''}kcal` : 'Save'}
        </Button>
        {props.mode === 'edit' && <DeleteButton id={props.entry.id} onDone={props.onDone} />}
      </form>
    </Sheet>
  )
}
