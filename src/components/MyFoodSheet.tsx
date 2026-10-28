// v1.9: "My foods". Log one of your own foods (or edit an entry made from one), and edit or delete the food itself.
import { useState } from 'react'
import { foodEmoji } from '../data/foodEmoji'
import { fmt, round1 } from '../lib/calc'
import { formatAmount } from '../lib/amount'
import { entryFromUserFood, useStore } from '../lib/store'
import { USER_SERVING, type UserFood } from '../lib/myFoods'
import { MEALS, MEAL_LABEL, type Entry, type Meal } from '../lib/types'
import { AfterThis, DeleteButton, FavStar, groupFields, type EntryGroup } from './FoodSheet'
import { Sheet, Stepper } from './Sheet'
import { Button, Chip } from './ui'

/** v1.10: a small muted bookmark next to a saved food's name (no visible text, Jordy). Screen readers hear "Saved food". */
export function SavedMark({ className = 'ml-1.5 h-[15px] w-[15px] align-[-2px]' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" role="img" aria-label="Saved food" data-testid="saved-mark" className={`inline-block shrink-0 text-mute-soft ${className}`} fill="currentColor">
      <path d="M7 3.5h10A1.5 1.5 0 0 1 18.5 5v15.2a.6.6 0 0 1-.95.49L12 16.8l-5.55 3.89a.6.6 0 0 1-.95-.49V5A1.5 1.5 0 0 1 7 3.5z" />
    </svg>
  )
}

export const macroLine = (f: { protein: number; carbs: number; fat: number }) =>
  f.protein || f.carbs || f.fat ? `P ${round1(f.protein)} · C ${round1(f.carbs)} · F ${round1(f.fat)} g` : 'No macros'

type Props =
  | { mode: 'add'; food: UserFood; meal: Meal; date: string; remaining: number; onDone: (e: Entry) => void; onClose: () => void; group?: EntryGroup }
  | { mode: 'edit'; food: UserFood; entry: Entry; remaining: number; onDone: () => void; onClose: () => void }

export function MyFoodSheet(props: Props) {
  const { dispatch, myFoodById } = useStore()
  const init = props.mode === 'edit' ? props.entry : null
  const [editing, setEditing] = useState(false)
  const [qty, setQty] = useState(init ? init.qty : 1)
  const [meal, setMeal] = useState<Meal>(init ? init.meal : props.mode === 'add' ? props.meal : 'snacks')
  // Live copy, so an edit made in the editor shows straight away.
  const food = myFoodById.get(props.food.id) ?? props.food
  if (editing) return <MyFoodEditSheet food={food} onClose={() => setEditing(false)} onDeleted={props.onClose} />
  // An edited entry keeps its own logged numbers; a new one uses the food's current numbers.
  const per = init ?? food
  const totals = { kcal: Math.round(per.kcal * qty), p: per.protein * qty, c: per.carbs * qty, f: per.fat * qty }

  const save = () => {
    if (props.mode === 'add') {
      const entry = { ...entryFromUserFood(food, { meal, date: props.date, qty }), ...groupFields(props.group) }
      dispatch({ type: 'addEntry', entry })
      props.onDone(entry)
    } else {
      dispatch({ type: 'updateEntry', entry: { ...props.entry, qty, meal } })
      props.onDone()
    }
  }

  return (
    <Sheet label={props.mode === 'add' ? `Add ${food.name}` : `Edit ${init!.name}`} onClose={props.onClose}>
      <div className="flex items-start justify-between gap-3">
        <span className="tile h-12 w-12 text-[26px]" aria-hidden="true">{foodEmoji(food.name)}</span>
        <div className="min-w-0 flex-1">
          <h2 className="title text-[24px] leading-tight">{init ? init.name : food.name}<SavedMark className="ml-2 h-[18px] w-[18px] align-[1px]" /></h2>
          <div className="text-[15px] text-mute">{fmt(food.kcal)} kcal a serving</div>
        </div>
        <button type="button" onClick={() => setEditing(true)} className="tap -mt-1.5 min-h-11 shrink-0 px-1 text-[15px] font-bold text-g-ink" data-testid="myfood-edit">Edit food</button>
        <FavStar id={food.id} />
      </div>
      <Stepper value={qty} onChange={setQty} label={formatAmount(USER_SERVING, qty)} unit={USER_SERVING} />
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
    </Sheet>
  )
}

const input = 'w-full rounded-xl border border-line bg-bg px-3 py-3 text-[17px]'

/** Edit a food's name and numbers, or delete it. Past log entries are never changed. */
export function MyFoodEditSheet({ food, onClose, onDeleted, startDelete = false }: { food: UserFood; onClose: () => void; onDeleted?: () => void; startDelete?: boolean }) {
  const { updateMyFood, deleteMyFood } = useStore()
  const [name, setName] = useState(food.name)
  const [kcal, setKcal] = useState(String(food.kcal))
  const [p, setP] = useState(food.protein ? String(food.protein) : '')
  const [c, setC] = useState(food.carbs ? String(food.carbs) : '')
  const [f, setF] = useState(food.fat ? String(food.fat) : '')
  const [error, setError] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(startDelete)
  const k = Math.round(Number(kcal))
  const valid = Number.isFinite(k) && k > 0 && k < 10000 && name.trim().length > 0

  const save = () => {
    if (!valid) return
    const ok = updateMyFood(food.id, { name, kcal: k, protein: Number(p) || 0, carbs: Number(c) || 0, fat: Number(f) || 0 })
    if (!ok) { setError(`You already have a food called "${name.trim()}".`); return }
    onClose()
  }

  return (
    <Sheet label={`Edit ${food.name}`} onClose={onClose}>
      <h2 className="title text-[24px] leading-tight">Edit food</h2>
      <form className="flex flex-col gap-3" onSubmit={(ev) => { ev.preventDefault(); save() }} data-testid="myfood-form">
        <label className="flex flex-col gap-1 text-[15px] font-semibold">
          Name
          <input className={input} value={name} required onChange={(ev) => { setName(ev.target.value); setError('') }} name="food-name" />
        </label>
        <label className="flex flex-col gap-1 text-[15px] font-semibold">
          Calories a serving (kcal)
          <input className={input} type="number" inputMode="numeric" min={1} required value={kcal} onChange={(ev) => setKcal(ev.target.value)} name="food-kcal" />
        </label>
        <fieldset className="grid grid-cols-3 gap-2">
          <legend className="mb-1 text-[15px] font-semibold">Macros, grams <span className="font-normal text-mute">(optional)</span></legend>
          {([['Protein', p, setP], ['Carbs', c, setC], ['Fat', f, setF]] as const).map(([l, v, set]) => (
            <label key={l} className="flex flex-col gap-1 text-[13px] text-mute">
              {l}
              <input className={input} type="number" inputMode="decimal" min={0} step="any" value={v} onChange={(ev) => set(ev.target.value)} name={`food-${l.toLowerCase()}`} />
            </label>
          ))}
        </fieldset>
        {error && <p role="alert" className="text-[15px] font-semibold text-danger" data-testid="myfood-error">{error}</p>}
        <p className="text-[13px] text-mute">Changes apply next time you log it. What you already logged stays as it is.</p>
        <Button type="submit" disabled={!valid}>Save food</Button>
        {confirmDelete ? (
          <div className="flex flex-col gap-2 rounded-[18px] border border-line bg-bg p-3" role="group" aria-label="Confirm delete">
            <p className="text-[15px] font-semibold">Delete {food.name} from My foods? Past entries stay in your log.</p>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => setConfirmDelete(false)}>Keep</Button>
              <Button variant="danger" data-testid="myfood-delete-confirm" onClick={() => { deleteMyFood(food.id); (onDeleted ?? onClose)() }}>Delete</Button>
            </div>
          </div>
        ) : (
          <Button variant="danger" onClick={() => setConfirmDelete(true)} data-testid="myfood-delete">Delete food</Button>
        )}
      </form>
    </Sheet>
  )
}
