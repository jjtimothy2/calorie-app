// v1.10: items logged together from one AI estimate share Entry.groupId. Home shows them as one row (title, total,
// item count, sparkle), and this sheet shows the breakdown: each item with kcal and macros, edit or remove per item,
// and delete all. Entries without a groupId (older data, single-item estimates) stay single rows. Totals never change:
// every item is still its own entry, so Log, History and closed days add up exactly as before.
import { useState } from 'react'
import { foodEmoji } from '../data/foodEmoji'
import { aiAmount, formatAmount } from '../lib/amount'
import { entryTotals, fmt, round1, sumEntries } from '../lib/calc'
import { useStore } from '../lib/store'
import { MEALS, MEAL_LABEL, type Entry, type Meal } from '../lib/types'
import { SparkleIcon } from './PhotoSheets'
import { Sheet } from './Sheet'
import { Button } from './ui'

export type HomeRow = { kind: 'entry'; entry: Entry } | { kind: 'group'; id: string; items: Entry[]; lead: Entry; kcal: number }

/** One meal's entries as Home rows, in logged order. A group sits where its first item was logged. */
export function groupRows(list: Entry[]): HomeRow[] {
  const byGroup = new Map<string, Entry[]>()
  for (const e of list) if (e.groupId) byGroup.set(e.groupId, [...(byGroup.get(e.groupId) ?? []), e])
  const out: HomeRow[] = []
  const done = new Set<string>()
  for (const e of list) {
    const items = e.groupId ? byGroup.get(e.groupId)! : null
    if (!items || items.length < 2) { out.push({ kind: 'entry', entry: e }); continue }
    if (done.has(e.groupId!)) continue
    done.add(e.groupId!)
    const lead = items.reduce((a, b) => (entryTotals(b).kcal > entryTotals(a).kcal ? b : a))
    out.push({ kind: 'group', id: e.groupId!, items, lead, kcal: sumEntries(items).kcal })
  }
  return out
}

/** The AI's meal name, else the first item and a count, else "AI estimate". */
export function groupTitle(items: Entry[]) {
  const name = items.find((e) => e.groupName)?.groupName?.trim()
  if (name && name !== 'Your meal') return name
  if (!items.length) return 'AI estimate'
  return items.length === 1 ? items[0].name : `${items[0].name} and ${items.length - 1} more`
}

/**
 * v1.13.3: the meal pill (Log's cream pill over a native picker) shows the group's meal. The sheet has no Save, so a
 * change applies at once: onMove moves every item of the group in one update and Home shows the 5 s Undo snackbar.
 */
export function AiGroupSheet({ items, onEdit, onAdd, onMove, onClose }: { items: Entry[]; onEdit: (e: Entry) => void; onAdd?: () => void; onMove?: (meal: Meal) => void; onClose: () => void }) {
  const { dispatch } = useStore()
  const [confirm, setConfirm] = useState(false)
  const t = sumEntries(items)
  const title = groupTitle(items)
  const remove = (id: string) => { dispatch({ type: 'deleteEntry', id }); if (items.length <= 1) onClose() }
  const count = `${items.length} ${items.length === 1 ? 'item' : 'items'}`
  const removeAll = () => { for (const e of items) dispatch({ type: 'deleteEntry', id: e.id }); onClose() }
  return (
    <Sheet label={title} onClose={onClose}>
      <div className="flex flex-col gap-4" data-testid="ai-group-sheet">
        <div>
          <div className="flex items-center gap-1.5 text-[13px] font-semibold text-mute">
            <SparkleIcon className="h-3.5 w-3.5 text-g" gradient />
            <span>AI estimate · {count}</span>
          </div>
          <h2 className="title mt-1 text-[26px] leading-tight">{title}</h2>
          {onMove && (
            <label className="mt-2.5 flex items-center gap-2 text-[15px] font-semibold text-mute" data-no-drag>
              <span>Meal</span>
              <span className="relative flex h-11 min-w-0 items-center gap-1.5 rounded-full border border-line bg-card pl-4 pr-3 focus-within:outline-3 focus-within:outline-offset-2 focus-within:outline-g-ink" data-testid="group-meal-pill">
                <span className="truncate font-display text-[18px] font-semibold leading-none text-g-ink" aria-hidden="true">{MEAL_LABEL[items[0].meal]}</span>
                <svg viewBox="0 0 24 24" className="h-[18px] w-[18px] shrink-0 text-g-ink" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 9.5 6 6 6-6" /></svg>
                <select
                  aria-label="Meal"
                  value={items[0].meal}
                  onChange={(ev) => onMove(ev.target.value as Meal)}
                  data-testid="group-meal"
                  className="absolute -inset-px h-[calc(100%+2px)] w-[calc(100%+2px)] cursor-pointer appearance-none rounded-full text-[16px] opacity-0 focus:outline-none"
                >
                  {MEALS.map((m) => <option key={m} value={m}>{MEAL_LABEL[m]}</option>)}
                </select>
              </span>
            </label>
          )}
        </div>
        <div className="flex items-end justify-between rounded-[18px] bg-tile px-4 py-3">
          <div>
            <div className="num text-[34px] leading-none" data-testid="ai-group-total">{fmt(t.kcal)}</div>
            <div className="mt-1 text-[13px] text-mute">kcal in total</div>
          </div>
          <div className="flex gap-1.5 text-[13px] font-semibold">
            <span className="rounded-full bg-protein-soft px-2.5 py-1 text-protein-ink">P {Math.round(t.protein)} g</span>
            <span className="rounded-full bg-carbs-soft px-2.5 py-1 text-carbs-ink">C {Math.round(t.carbs)} g</span>
            <span className="rounded-full bg-fat-soft px-2.5 py-1 text-fat-ink">F {Math.round(t.fat)} g</span>
          </div>
        </div>
        <ul className="rounded-[18px] border border-line bg-card px-3" aria-label="Items">
          {items.map((e, i) => {
            const x = entryTotals(e)
            return (
              <li key={e.id} className={`flex items-center gap-2 py-2.5 ${i ? 'border-t border-line' : ''}`} data-testid="ai-group-item">
                <button type="button" onClick={() => onEdit(e)} className="flex min-w-0 flex-1 items-center gap-3 text-left" aria-label={`Edit ${e.name}, ${fmt(x.kcal)} kcal`}>
                  <span className="tile" aria-hidden="true">{foodEmoji(e.name)}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[16px] font-semibold leading-snug">{e.name}</span>
                    <span className="block truncate text-[12px] text-mute">{e.foodId ? formatAmount(e.servingLabel, e.qty) : aiAmount(e.servingLabel, e.qty)}</span>
                    <span className="block text-[12px] text-mute">P {round1(x.protein)} · C {round1(x.carbs)} · F {round1(x.fat)} g</span>
                  </span>
                  <span className="num text-[18px]">{fmt(x.kcal)}</span>
                </button>
                <button type="button" onClick={() => remove(e.id)} aria-label={`Remove ${e.name}`} data-testid="ai-group-remove" className="tap -mr-1 grid h-11 w-11 shrink-0 place-items-center rounded-full text-mute-soft">
                  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
                </button>
              </li>
            )
          })}
        </ul>
        {onAdd && (
          <button type="button" onClick={onAdd} className="tap -mt-1 flex min-h-12 items-center justify-center gap-2 rounded-[18px] border border-dashed border-line text-[16px] font-bold text-g-ink" data-testid="ai-group-add">
            <span aria-hidden="true" className="text-[20px] leading-none">+</span>Add item
          </button>
        )}
        <p className="-mt-1 text-center text-[13px] text-mute">Tap an item to change its amount or macros.</p>
        <Button variant="ghost" onClick={onClose}>Done</Button>
        {confirm ? (
          <div className="flex gap-2">
            <Button variant="ghost" className="flex-1" onClick={() => setConfirm(false)}>Keep</Button>
            <Button variant="danger" className="flex-1" onClick={removeAll} data-testid="ai-group-delete-confirm">Delete {count}</Button>
          </div>
        ) : (
          <button type="button" onClick={() => setConfirm(true)} className="tap min-h-11 rounded-full py-1 text-[16px] font-bold text-danger" data-testid="ai-group-delete">Delete whole meal</button>
        )}
      </div>
    </Sheet>
  )
}
