import { useRef, useState } from 'react'
import { aiAmount, formatAmount } from '../lib/amount'
import { fmt } from '../lib/calc'
import { newId, useStore } from '../lib/store'
import { MEALS, MEAL_LABEL, type Entry, type Meal } from '../lib/types'
import { cleanName, findByName, USER_SERVING, type UserFood } from '../lib/myFoods'
import { SavedMark, MyFoodEditSheet } from './MyFoodSheet'
import { AfterThis, DeleteButton, groupFields, type EntryGroup } from './FoodSheet'
import { Sheet, Stepper } from './Sheet'
import { Button, Chip } from './ui'

type Props =
  | { mode: 'add'; meal: Meal; date: string; remaining: number; onDone: (e: Entry) => void; onClose: () => void; group?: EntryGroup }
  | { mode: 'edit'; entry: Entry; remaining: number; onDone: () => void; onClose: () => void; onAddItem?: () => void }
  // v1.10.1: New food in My foods. The same form with Save; nothing is logged.
  | { mode: 'new'; name?: string; onDone: (f: UserFood) => void; onClose: () => void }

const input = 'w-full rounded-xl border border-line bg-bg px-3 py-3 text-[17px]'

// v1.13.3: opening an existing entry to edit focuses no field (no iOS keyboard); the Sheet focuses its own container
// (role=dialog, tabIndex -1), so screen readers land inside and Escape still closes it. New items focus a field at once.
export function QuickAddSheet(props: Props) {
  const { dispatch, myFoods, myFoodById, saveMyFood } = useStore()
  const e = props.mode === 'edit' ? props.entry : null
  const [name, setName] = useState(e ? e.name : props.mode === 'new' ? cleanName(props.name ?? '') : '')
  const [kcal, setKcal] = useState(e ? String(Math.round(e.kcal * e.qty)) : '')
  const [p, setP] = useState(e && e.protein ? String(+(e.protein * e.qty).toFixed(1)) : '')
  const [c, setC] = useState(e && e.carbs ? String(+(e.carbs * e.qty).toFixed(1)) : '')
  const [f, setF] = useState(e && e.fat ? String(+(e.fat * e.qty).toFixed(1)) : '')
  const [meal, setMeal] = useState<Meal>(e ? e.meal : props.mode === 'add' ? props.meal : 'snacks')
  // Edit: a Servings stepper. The fields show totals for the amount; `per` holds one serving (what an entry stores per
  // qty), so stepping never drifts from rounding. Typing a field sets `per` from that total.
  const [qty, setQtyState] = useState(e && e.qty > 0 ? e.qty : 1)
  const per = useRef({ kcal: e ? e.kcal : 0, p: e ? e.protein : 0, c: e ? e.carbs : 0, f: e ? e.fat : 0 })
  const typed = (key: 'kcal' | 'p' | 'c' | 'f', set: (v: string) => void) => (v: string) => { set(v); per.current[key] = (Number(v) || 0) / qty }
  const setQty = (n: number) => {
    const b = per.current
    setQtyState(n)
    if (kcal.trim() !== '') setKcal(String(Math.round(b.kcal * n))) // an emptied field stays empty (Save stays off)
    if (p !== '') setP(String(+(b.p * n).toFixed(1)))
    if (c !== '') setC(String(+(b.c * n).toFixed(1)))
    if (f !== '') setF(String(+(b.f * n).toFixed(1)))
  }
  // AI items keep their grams ("1 plate (300 g)" x 2 reads "2 plates (600 g)"); quick adds count servings.
  const unit = !e ? '' : (e.source === 'photo' || e.foodId) && e.servingLabel !== 'Quick add' ? e.servingLabel : '1 serving'
  const amount = !e ? '' : e.source === 'photo' ? aiAmount(unit, qty) : formatAmount(unit, qty)
  // v1.9: an entry logged from one of your foods is edited here too (its own numbers); the food itself via "Edit food".
  const mineFood = e?.foodId ? myFoodById.get(e.foodId) : undefined
  const [editFood, setEditFood] = useState(false)
  const k = Math.round(Number(kcal))
  const isNew = props.mode === 'new'
  const valid = Number.isFinite(k) && k > 0 && k < 10000 && (!isNew || cleanName(name).length > 0)

  // v1.9: a named quick add is saved to My foods (the same name updates that food). Editing an old entry never does.
  const named = props.mode !== 'edit' && cleanName(name).length > 0
  const existing = named ? findByName(myFoods, name) : undefined

  const save = () => {
    if (!valid) return
    const macros = { kcal: k, protein: Number(p) || 0, carbs: Number(c) || 0, fat: Number(f) || 0 }
    const q = props.mode === 'edit' ? qty : 1
    const mine = named ? saveMyFood({ name, ...macros }) : null
    if (props.mode === 'new') { if (mine) props.onDone(mine); return }
    const entry: Entry = {
      id: e ? e.id : newId(),
      date: props.mode === 'add' ? props.date : props.entry.date,
      meal,
      foodId: mine ? mine.id : e ? e.foodId : null,
      name: mine ? mine.name : name.trim() || 'Quick add',
      // An AI item keeps its own amount label ("1 piece (120 g)"); main reset it to 'Quick add' on every edit.
      servingLabel: mine ? USER_SERVING : e?.foodId || e?.source === 'photo' ? e.servingLabel : 'Quick add',
      servingMult: 1,
      // Values are stored per 1 qty; an entry of 2 servings keeps its amount and the totals are split back.
      qty: q,
      kcal: k / q,
      protein: (Number(p) || 0) / q,
      carbs: (Number(c) || 0) / q,
      fat: (Number(f) || 0) / q,
      createdAt: e ? e.createdAt : Date.now(),
      ...(e?.source ? { source: e.source } : {}),
      ...(e?.groupId ? { groupId: e.groupId, ...(e.groupName ? { groupName: e.groupName } : {}) } : {}),
      ...(props.mode === 'add' ? groupFields(props.group) : {}),
    }
    if (props.mode === 'add') {
      dispatch({ type: 'addEntry', entry })
      props.onDone(entry)
    } else if (props.mode === 'edit') {
      dispatch({ type: 'updateEntry', entry })
      props.onDone()
    }
  }

  if (editFood && mineFood) return <MyFoodEditSheet food={mineFood} onClose={() => setEditFood(false)} onDeleted={() => setEditFood(false)} />

  const kcalField = (
    <label className="flex flex-col gap-1 text-[15px] font-semibold">
      {isNew ? 'Calories a serving (kcal)' : props.mode === 'edit' ? 'Calories, total (kcal)' : 'Calories (kcal)'}
      <input data-autofocus={props.mode === 'add' || (isNew && name) ? true : undefined} className={input} type="number" inputMode="numeric" min={1} required value={kcal} onChange={(ev) => typed('kcal', setKcal)(ev.target.value)} name="kcal" aria-describedby={props.mode !== 'edit' ? 'qa-kcal-hint' : undefined} />
      {props.mode !== 'edit' && <span id="qa-kcal-hint" className="text-[13px] font-normal text-mute" data-testid="qa-kcal-hint">From a label, menu or your own count</span>}
    </label>
  )
  const hint = existing ? `Updates ${existing.name} in My foods.` : isNew ? 'Saved to My foods. Nothing is logged.' : named ? 'Saved to My foods, so you can search for it next time.' : 'Give it a name to save it to My foods.'
  const nameField = (
    <label className="flex flex-col gap-1 text-[15px] font-semibold">
      <span>Name {!isNew && <span className="font-normal text-mute">(optional)</span>}</span>
      <input data-autofocus={isNew && !name ? true : undefined} required={isNew} className={input} value={name} onChange={(ev) => setName(ev.target.value)} name="name" placeholder="e.g. Office cake" aria-describedby={props.mode !== 'edit' ? 'qa-name-hint' : undefined} />
      {props.mode !== 'edit' && <span id="qa-name-hint" className="text-[13px] font-normal text-mute" data-testid="qa-name-hint">{hint}</span>}
    </label>
  )
  const label = props.mode === 'new' ? 'New food' : props.mode === 'add' ? (props.group ? 'Add Calories for this meal' : 'Add Calories') : 'Edit quick add'
  const title = props.mode === 'new' ? 'New food' : props.mode === 'add' ? 'Add Calories' : e?.source === 'photo' ? 'Edit item' : 'Edit quick add'

  return (
    <Sheet label={label} onClose={props.onClose}>
      <div className="flex items-start justify-between gap-3">
        <h2 className="title text-[24px] leading-tight">{title}{mineFood && <SavedMark className="ml-2 h-[18px] w-[18px] align-[1px]" />}</h2>
        {mineFood && (
          <button type="button" onClick={() => setEditFood(true)} className="tap -mt-1.5 min-h-11 shrink-0 px-1 text-[15px] font-bold text-g-ink" data-testid="myfood-edit">Edit food</button>
        )}
      </div>
      <form className="flex flex-col gap-3" onSubmit={(ev) => { ev.preventDefault(); save() }} data-testid={isNew ? 'newfood-form' : undefined}>
        {props.mode === 'edit' && <Stepper value={qty} onChange={setQty} label={amount} unit={unit} title="Servings" />}
        {isNew ? <>{nameField}{kcalField}</> : <>{kcalField}{nameField}</>}
        <fieldset className="grid grid-cols-3 gap-2">
          <legend className="mb-1 text-[15px] font-semibold">Macros, grams <span className="font-normal text-mute">(optional)</span></legend>
          {([['Protein', p, setP, 'p'], ['Carbs', c, setC, 'c'], ['Fat', f, setF, 'f']] as const).map(([l, v, set, key]) => (
            <label key={l} className="flex flex-col gap-1 text-[13px] text-mute">
              {l}
              <input className={input} type="number" inputMode="decimal" min={0} step="any" value={v} onChange={(ev) => typed(key, set)(ev.target.value)} />
            </label>
          ))}
        </fieldset>
        {props.mode !== 'new' && !(props.mode === 'add' && props.group) && (
          <div className="flex flex-wrap gap-2" role="group" aria-label="Meal" data-no-drag>
            {MEALS.map((m) => (
              <Chip key={m} on={meal === m} onClick={() => setMeal(m)}>{MEAL_LABEL[m]}</Chip>
            ))}
          </div>
        )}
        {props.mode !== 'new' && <AfterThis remaining={props.remaining - (valid ? k : 0)} date={props.mode === 'edit' ? props.entry.date : props.date} />}
        <Button type="submit" disabled={!valid} data-testid={isNew ? 'newfood-save' : undefined}>
          {props.mode === 'add' ? `Add ${valid ? fmt(k) + ' ' : ''}kcal` : props.mode === 'edit' && valid ? `Save · ${fmt(k)} kcal` : 'Save'}
        </Button>
        {props.mode === 'edit' && props.onAddItem && (
          <Button variant="ghost" onClick={props.onAddItem} data-testid="ai-add-item">+ Add item to this meal</Button>
        )}
        {props.mode === 'edit' && <DeleteButton id={props.entry.id} onDone={props.onDone} />}
      </form>
    </Sheet>
  )
}
