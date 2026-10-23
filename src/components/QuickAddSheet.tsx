import { useState } from 'react'
import { newId, useStore } from '../lib/store'
import { MEALS, MEAL_LABEL, type Entry, type Meal } from '../lib/types'
import { AfterThis, DeleteButton } from './FoodSheet'
import { Sheet } from './Sheet'
import { Button, Chip } from './ui'

type Props =
  | { mode: 'add'; meal: Meal; date: string; remaining: number; onDone: (e: Entry) => void; onClose: () => void }
  | { mode: 'edit'; entry: Entry; remaining: number; onDone: () => void; onClose: () => void }

const input = 'w-full rounded-xl border border-line bg-bg px-3 py-3 text-[17px]'

export function QuickAddSheet(props: Props) {
  const { dispatch } = useStore()
  const e = props.mode === 'edit' ? props.entry : null
  const [name, setName] = useState(e ? e.name : '')
  const [kcal, setKcal] = useState(e ? String(Math.round(e.kcal * e.qty)) : '')
  const [p, setP] = useState(e && e.protein ? String(e.protein * e.qty) : '')
  const [c, setC] = useState(e && e.carbs ? String(e.carbs * e.qty) : '')
  const [f, setF] = useState(e && e.fat ? String(e.fat * e.qty) : '')
  const [meal, setMeal] = useState<Meal>(e ? e.meal : props.mode === 'add' ? props.meal : 'snacks')
  const k = Math.round(Number(kcal))
  const valid = Number.isFinite(k) && k > 0 && k < 10000

  const save = () => {
    if (!valid) return
    const entry: Entry = {
      id: e ? e.id : newId(),
      date: props.mode === 'add' ? props.date : props.entry.date,
      meal,
      foodId: null,
      name: name.trim() || 'Quick add',
      servingLabel: 'Quick add',
      servingMult: 1,
      qty: 1,
      kcal: k,
      protein: Number(p) || 0,
      carbs: Number(c) || 0,
      fat: Number(f) || 0,
      createdAt: e ? e.createdAt : Date.now(),
    }
    if (props.mode === 'add') {
      dispatch({ type: 'addEntry', entry })
      props.onDone(entry)
    } else {
      dispatch({ type: 'updateEntry', entry })
      props.onDone()
    }
  }

  return (
    <Sheet label={props.mode === 'add' ? 'Quick add calories' : 'Edit quick add'} onClose={props.onClose}>
      <h2 className="text-xl font-bold">{props.mode === 'add' ? 'Quick add' : 'Edit quick add'}</h2>
      <form className="flex flex-col gap-3" onSubmit={(ev) => { ev.preventDefault(); save() }}>
        <label className="flex flex-col gap-1 text-[15px] font-semibold">
          Calories (kcal)
          <input data-autofocus className={input} type="number" inputMode="numeric" min={1} required value={kcal} onChange={(ev) => setKcal(ev.target.value)} name="kcal" />
        </label>
        <label className="flex flex-col gap-1 text-[15px] font-semibold">
          Name <span className="font-normal text-mute">(optional)</span>
          <input className={input} value={name} onChange={(ev) => setName(ev.target.value)} name="name" placeholder="e.g. Office cake" />
        </label>
        <fieldset className="grid grid-cols-3 gap-2">
          <legend className="mb-1 text-[15px] font-semibold">Macros, grams <span className="font-normal text-mute">(optional)</span></legend>
          {([['Protein', p, setP], ['Carbs', c, setC], ['Fat', f, setF]] as const).map(([l, v, set]) => (
            <label key={l} className="flex flex-col gap-1 text-[13px] text-mute">
              {l}
              <input className={input} type="number" inputMode="decimal" min={0} value={v} onChange={(ev) => set(ev.target.value)} />
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
          {props.mode === 'add' ? `Add ${valid ? k : ''} kcal`.replace('  ', ' ') : 'Save'}
        </Button>
        {props.mode === 'edit' && <DeleteButton id={props.entry.id} onDone={props.onDone} />}
      </form>
    </Sheet>
  )
}
