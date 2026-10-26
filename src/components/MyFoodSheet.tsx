// v1.9: "My foods". Log one of your own foods (or edit an entry made from one), and edit or delete the food itself.
import { useState } from 'react'
import { createPortal } from 'react-dom'
import { foodEmoji } from '../data/foodEmoji'
import { fmt, round1 } from '../lib/calc'
import { formatAmount } from '../lib/amount'
import { entryFromUserFood, useStore } from '../lib/store'
import { USER_SERVING, type UserFood } from '../lib/myFoods'
import { MEALS, MEAL_LABEL, type Entry, type Meal } from '../lib/types'
import { AfterThis, DeleteButton } from './FoodSheet'
import { Sheet, Stepper } from './Sheet'
import { Button, Chip } from './ui'

/** Small "Mine" tag next to a user food's name. */
export function MineTag() {
  return <span className="ml-1.5 inline-block rounded-full bg-g-soft px-2 py-0.5 align-[2px] text-[11px] font-bold uppercase tracking-wide text-g-soft-ink" data-testid="mine-tag">Mine</span>
}

const macroLine = (f: { protein: number; carbs: number; fat: number }) =>
  f.protein || f.carbs || f.fat ? `P ${round1(f.protein)} · C ${round1(f.carbs)} · F ${round1(f.fat)} g` : 'No macros'

type Props =
  | { mode: 'add'; food: UserFood; meal: Meal; date: string; remaining: number; onDone: (e: Entry) => void; onClose: () => void }
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
      const entry = entryFromUserFood(food, { meal, date: props.date, qty })
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
          <h2 className="title text-[24px] leading-tight">{init ? init.name : food.name}<MineTag /></h2>
          <div className="text-[15px] text-mute">Your food · {fmt(food.kcal)} kcal a serving</div>
        </div>
        <button type="button" onClick={() => setEditing(true)} className="tap shrink-0 px-1 py-1 text-[15px] font-bold text-g-ink" data-testid="myfood-edit">Edit food</button>
      </div>
      <Stepper value={qty} onChange={setQty} label={formatAmount(USER_SERVING, qty)} />
      {props.mode === 'edit' && (
        <div className="flex flex-wrap gap-2" role="group" aria-label="Meal">
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
      <AfterThis remaining={props.remaining - totals.kcal} />
      <Button data-autofocus onClick={save}>
        {props.mode === 'add' ? `Add ${fmt(totals.kcal)} kcal` : `Save · ${fmt(totals.kcal)} kcal`}
      </Button>
      {props.mode === 'edit' && <DeleteButton id={props.entry.id} onDone={props.onDone} />}
    </Sheet>
  )
}

const input = 'w-full rounded-xl border border-line bg-bg px-3 py-3 text-[17px]'

/** Edit a food's name and numbers, or delete it. Past log entries are never changed. */
export function MyFoodEditSheet({ food, onClose, onDeleted }: { food: UserFood; onClose: () => void; onDeleted?: () => void }) {
  const { updateMyFood, deleteMyFood } = useStore()
  const [name, setName] = useState(food.name)
  const [kcal, setKcal] = useState(String(food.kcal))
  const [p, setP] = useState(food.protein ? String(food.protein) : '')
  const [c, setC] = useState(food.carbs ? String(food.carbs) : '')
  const [f, setF] = useState(food.fat ? String(food.fat) : '')
  const [error, setError] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
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
          <input data-autofocus className={input} value={name} required onChange={(ev) => { setName(ev.target.value); setError('') }} name="food-name" />
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
              <input className={input} type="number" inputMode="decimal" min={0} value={v} onChange={(ev) => set(ev.target.value)} name={`food-${l.toLowerCase()}`} />
            </label>
          ))}
        </fieldset>
        {error && <p role="alert" className="text-[15px] font-semibold text-danger" data-testid="myfood-error">{error}</p>}
        <p className="text-[13px] text-mute">Changes apply next time you log it. What you already logged stays as it is.</p>
        <Button type="submit" disabled={!valid}>Save food</Button>
        {confirmDelete ? (
          <div className="flex flex-col gap-2 rounded-[18px] border border-line bg-bg p-3" role="group" aria-label="Confirm delete">
            <p className="text-[15px] font-semibold">Delete {food.name} from your foods? Past entries stay in your log.</p>
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

/** Me screen card: the user's own foods, newest change first. */
export function MyFoodsCard() {
  const { myFoods } = useStore()
  const [open, setOpen] = useState<UserFood | null>(null)
  const list = [...myFoods].sort((a, b) => b.updatedAt - a.updatedAt)
  return (
    <div className="rounded-[22px] border border-line bg-card p-4" data-testid="myfoods-card">
      <h2 className="title text-[21px]">My foods</h2>
      {list.length === 0 ? (
        <p className="mt-1 text-[15px] text-mute" data-testid="myfoods-empty">Give a quick add a name and it's saved here, ready to find in search.</p>
      ) : (
        <>
          <p className="text-[13px] text-mute">Saved from named quick adds. Tap one to edit or delete it.</p>
          <ul className="mt-2" aria-label="My foods">
            {list.map((f) => (
              <li key={f.id}>
                <button type="button" onClick={() => setOpen(f)} className="flex w-full items-center gap-3 border-t border-line py-2.5 text-left" aria-label={`${f.name}, ${f.kcal} kcal. Edit or delete`}>
                  <span className="tile" aria-hidden="true">{foodEmoji(f.name)}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-base font-semibold">{f.name}</span>
                    <span className="block text-[13px] text-mute">{macroLine(f)}</span>
                  </span>
                  <b className="num text-[17px]">{fmt(f.kcal)}</b>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
      {/* The card sits inside the scrolling page; the sheet belongs to the app frame like every other sheet. */}
      {open && createPortal(<MyFoodEditSheet key={open.id} food={open} onClose={() => setOpen(null)} />, document.getElementById('app-frame') ?? document.body)}
    </div>
  )
}
