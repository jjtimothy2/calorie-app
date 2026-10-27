import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { BalanceRing, Equation } from '../components/BalanceRing'
import { ExerciseEditSheet, ExerciseQuickSheet, exerciseLine } from '../components/ExerciseForm'
import { FoodSheet } from '../components/FoodSheet'
import { ProteinCard } from '../components/ProteinCard'
import { QuickAddSheet } from '../components/QuickAddSheet'
import { SparkleIcon } from '../components/PhotoSheets'
import { AiGroupSheet, groupRows, groupTitle } from '../components/AiGroupSheet'
import { AddItemSheet } from '../components/AddItemSheet'
import type { EntryGroup } from '../components/FoodSheet'
import { Screen, TabBar, Title } from '../components/Layout'
import { DaySwitcher, PastDayNote } from '../components/PastDay'
import { reducedMotion, useNewRows } from '../components/motion'
import { foodEmoji } from '../data/foodEmoji'
import { Button, Card } from '../components/ui'
import { dayName, dayView, keyDate, entryTotals, fmt, goalMessage, macroTargets, streak, sumEntries, verdict } from '../lib/calc'
import { FOOD_BY_ID } from '../data/foods'
import { formatAmount } from '../lib/amount'
import { newId, useStore, type Landing } from '../lib/store'
import { readMeta, shouldRemind, writeMeta } from '../lib/backup'
import { WeighInNudge } from '../components/Weight'
import { MEALS, MEAL_LABEL, type Entry, type ExerciseEntry } from '../lib/types'

export default function Home() {
  const { state, dispatch, today, logDate: date, setLogDate, landing, land } = useStore()
  const nav = useNavigate()
  // v1.12: Home shows the picked day (today unless a past day was chosen). A past day is never locked: closed or not,
  // its food and exercise can be changed, and a closed one recalculates (store refreshPastDay).
  const past = date < today
  const entries = state.entries.filter((e) => e.date === date).sort((a, b) => a.createdAt - b.createdAt)
  const exercises = state.exercises.filter((e) => e.date === date).sort((a, b) => a.createdAt - b.createdAt)
  const totals = sumEntries(entries)
  const day = dayView(state, date)
  const closed = !!day.closed
  const locked = closed && !past
  const profile = state.profile!
  const s = streak(state.entries, today)
  const [editing, setEditing] = useState<Entry | null>(null)
  const [editingEx, setEditingEx] = useState<ExerciseEntry | null>(null)
  // v1.10: an open AI meal (its groupId). Editing one of its items hides the sheet, and it comes back after.
  const [group, setGroup] = useState<string | null>(null)
  const groupItems = group ? entries.filter((e) => e.groupId === group) : []
  // v1.10.1: Add item. From the breakdown, or from a single AI item's edit sheet (seed), which then becomes a group.
  const [adding, setAdding] = useState<{ group: EntryGroup; title: string; meal: Entry['meal']; date: string; seed?: Entry } | null>(null)
  const addToGroup = () => {
    if (!group || !groupItems.length) return
    const name = groupItems.find((e) => e.groupName)?.groupName
    setAdding({ group: { id: group, ...(name ? { name } : {}) }, title: groupTitle(groupItems), meal: groupItems[0].meal, date: groupItems[0].date })
  }
  const addToSingle = (e: Entry) => {
    setEditing(null)
    setAdding({ group: { id: e.groupId ?? newId(), ...(e.groupName ? { name: e.groupName } : {}) }, title: e.groupName ?? e.name, meal: e.meal, date: e.date, seed: e })
  }
  const added = () => {
    if (!adding) return
    const seed = adding.seed && state.entries.find((x) => x.id === adding.seed!.id)
    if (seed && seed.groupId !== adding.group.id) dispatch({ type: 'updateEntry', entry: { ...seed, groupId: adding.group.id } })
    setAdding(null)
    setGroup(adding.group.id)
  }
  const dateLabel = keyDate(date).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' })
  // Food you can still eat today while hitting the daily goal.
  const left = day.balance - day.goal
  const remainingExcl = (e: Entry) => left + entryTotals(e).kcal
  const burned = day.burned
  const [remind, setRemind] = useState(() => shouldRemind(state, readMeta()))
  const title = dayName(date, today)
  const fresh = useNewRows([...entries.map((e) => e.id), ...exercises.map((e) => e.id)])
  const dismiss = () => { writeMeta({ dismissedAt: Date.now() }); setRemind(false) }
  // v1.13.2: just logged on Log (store landing): show that day, scroll to the meal (or Exercise) card with the new
  // row(s), highlight them about 1.5 s (reduced motion: jump, no fade, a brief highlight) and show the snackbar.
  const [flash, setFlash] = useState<Set<string>>(() => new Set())
  const [snack, setSnack] = useState<Landing | null>(null)
  const timers = useRef<number[]>([])
  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), [])
  useEffect(() => {
    if (!landing) return
    if (landing.date !== date) { setLogDate(landing.date); return } // runs again once Home shows that day
    const l = landing
    land(null)
    const reduce = reducedMotion()
    timers.current.forEach((t) => window.clearTimeout(t))
    setSnack(l)
    setFlash(new Set(l.ids))
    timers.current = [
      window.setTimeout(() => setFlash(new Set()), reduce ? 1000 : 1500),
      window.setTimeout(() => setSnack(null), 5000),
    ]
    requestAnimationFrame(() => requestAnimationFrame(() => scrollToRows(l.ids, reduce)))
  }, [landing, date, land, setLogDate])
  const undo = () => {
    if (!snack) return
    for (const id of snack.ids) dispatch(snack.kind === 'food' ? { type: 'deleteEntry', id } : { type: 'deleteExercise', id })
    timers.current.forEach((t) => window.clearTimeout(t))
    setSnack(null)
    setFlash(new Set())
  }
  const lit = (ids: string[]) => (ids.some((id) => flash.has(id)) ? ' row-flash' : '')

  return (
    <>
      <Screen className="gap-3">
        <header className="flex items-end justify-between">
          <Title eyebrow={dateLabel} id="day-title">{title}</Title>
          <div className="mb-1 flex items-center gap-2">
            {!past && (
              <span className="rounded-full border border-line bg-card px-3 py-2 text-[15px] font-semibold" data-testid="streak">
                <span aria-hidden="true">🔥 </span>{s} {s === 1 ? 'day' : 'days'}<span className="sr-only"> streak</span>
              </span>
            )}
            <DaySwitcher />
          </div>
        </header>
        <PastDayNote />
        {remind && !past && (
          <div role="note" className="flex items-center gap-3 rounded-2xl bg-g-soft px-4 py-3 text-[15px] text-g-soft-ink" data-testid="backup-reminder">
            <span className="flex-1">No backup for a week. Your data lives only on this device. <Link to="/settings" className="font-bold underline">Back up now</Link></span>
            <button type="button" onClick={dismiss} aria-label="Dismiss backup reminder" className="-mr-1 grid h-9 w-9 shrink-0 place-items-center rounded-full text-xl font-bold">×</button>
          </div>
        )}
        {!past && <WeighInNudge />}
        <section aria-label="Balance" className="flex flex-col gap-2.5">
          {closed && (
            <div className="mb-1 flex items-center justify-between">
              <span className="rounded-full bg-g-soft px-3 py-1.5 text-[13px] font-bold text-g-soft-ink" data-testid="closed-pill">{past ? 'Closed · updates as you edit' : 'Day closed'}</span>
              <Link to={`/day/${date}`} className="px-1 py-1 text-[15px] font-bold text-g-ink">View verdict ›</Link>
            </div>
          )}
          <BalanceRing balance={day.balance} goal={day.goal} closed={closed} />
          <Card className="px-3.5 py-3.5">
          <Equation bmr={day.bmr} baseBurn={day.baseBurn} movement={day.baseBurn == null && (day.closed ? day.movement > 0 : profile.includeMovement) ? day.movement : null} burned={burned} eaten={day.eaten} balance={day.balance} />
          <p className="mt-2.5 border-t border-line pt-2.5 text-center text-[14px] text-mute" data-testid="goal-progress">{goalMessage(day.balance, day.goal, closed)}</p>
          </Card>
        </section>
        <ProteinCard totals={totals} targets={macroTargets(profile)} />
        <Card>
          <section aria-label="Exercise" data-testid="exercise-card">
            <div className="flex items-center justify-between">
              <h2 className="eyebrow text-[15px] font-semibold text-ink">Exercise{exercises.length > 0 && <span className="text-mute"> · {fmt(burned)} kcal</span>}</h2>
              {!locked && <Link to="/log?mode=exercise" className="tap px-1 py-1 text-[15px] font-bold text-g-ink" aria-label="Add exercise">+ Add</Link>}
            </div>
            {exercises.length > 0 && (
              <ul className="mt-2">
                {exercises.map((e) => (
                  <li key={e.id} className={fresh.has(e.id) ? 'row-in' : ''}>
                    <button type="button" disabled={locked} onClick={() => setEditingEx(e)} data-ids={e.id} className={`land-row flex w-full items-center gap-3 border-t border-line py-2.5 text-left text-[15px] disabled:cursor-default${lit([e.id])}`} aria-label={`Edit ${e.name}, ${fmt(e.kcal)} kcal burned`}>
                      <span className="tile" aria-hidden="true">🏃</span>
                      <span className="flex-1">{exerciseLine(e)}</span>
                      <span className="num text-[18px] text-ex-ink">+{fmt(e.kcal)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </Card>
        {entries.length === 0 && (
          <p className="text-center text-[15px] text-mute" data-testid="empty">{past ? 'Nothing logged on this day. Tap + Add to fill it in.' : 'Nothing logged yet today. Tap + to add your first meal.'}</p>
        )}
        {MEALS.map((m) => {
          const list = entries.filter((e) => e.meal === m)
          const sum = sumEntries(list).kcal
          return (
            <Card key={m}>
              <section aria-label={MEAL_LABEL[m]} data-testid={`meal-${m}`}>
                <div className="flex items-center justify-between">
                  <h2 className="eyebrow text-[15px] font-semibold text-ink">{MEAL_LABEL[m]}{list.length > 0 && <span className="text-mute"> · {fmt(sum)} kcal</span>}</h2>
                  {!locked && <Link to={`/log?meal=${m}`} className="tap px-1 py-1 text-[15px] font-bold text-g-ink" aria-label={`Add to ${MEAL_LABEL[m]}`}>+ Add</Link>}
                </div>
                {list.length > 0 && (
                  <ul className="mt-2">
                    {groupRows(list).map((row) => row.kind === 'group' ? (
                      <li key={row.id} className={row.items.some((e) => fresh.has(e.id)) ? 'row-in' : ''}>
                        {/* v1.10: items from one AI estimate show as one row. Tap for the breakdown. */}
                        <button type="button" disabled={locked} onClick={() => setGroup(row.id)} data-testid="ai-group-row" data-ids={row.items.map((x) => x.id).join(' ')} className={`land-row flex w-full items-center gap-3 border-t border-line py-2.5 text-left disabled:cursor-default${lit(row.items.map((x) => x.id))}`} aria-label={`${groupTitle(row.items)}, ${row.items.length} items from AI, ${fmt(row.kcal)} kcal. Open breakdown`}>
                          <span className="tile relative" aria-hidden="true">
                            {foodEmoji(row.lead.name)}
                            <span className="absolute -bottom-1 -right-1 grid h-[18px] w-[18px] place-items-center rounded-full border border-line bg-card text-g"><SparkleIcon className="h-2.5 w-2.5" /></span>
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[16px] font-semibold leading-snug">{groupTitle(row.items)}</span>
                            <span className="block text-[12px] text-mute">{MEAL_LABEL[m]} · {row.items.length} items · <SparkleIcon className="inline-block h-3 w-3 align-[-1px]" /> AI</span>
                          </span>
                          <span className="num text-[18px]">{fmt(row.kcal)}</span>
                          <svg viewBox="0 0 24 24" className="-ml-1 h-4 w-4 shrink-0 text-mute-soft" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m9 5 7 7-7 7" /></svg>
                        </button>
                      </li>
                    ) : (() => { const e = row.entry; return (
                      <li key={e.id} className={fresh.has(e.id) ? 'row-in' : ''}>
                        <button type="button" disabled={locked} onClick={() => setEditing(e)} data-ids={e.id} className={`land-row flex w-full items-center gap-3 border-t border-line py-2.5 text-left disabled:cursor-default${lit([e.id])}`} aria-label={`Edit ${e.name}, ${fmt(entryTotals(e).kcal)} kcal`}>
                          <span className="tile" aria-hidden="true">{foodEmoji(e.name)}</span>
                          <span className="min-w-0 flex-1">
                            <span className="block text-[16px] font-semibold leading-snug">{e.name}</span>
                            <span className="block text-[12px] text-mute">{MEAL_LABEL[m]}{e.foodId ? ` · ${formatAmount(e.servingLabel, e.qty)}` : e.source === 'photo' ? ` · ${e.servingLabel}` : ' · quick add'}{e.source === 'photo' && <> · <SparkleIcon className="inline-block h-3 w-3 align-[-1px]" /> AI</>}</span>
                          </span>
                          <span className="num text-[18px]">{fmt(entryTotals(e).kcal)}</span>
                        </button>
                      </li>
                    ) })())}
                  </ul>
                )}
              </section>
            </Card>
          )
        })}
        {past ? (
          <Button variant="ghost" onClick={() => setLogDate(today)} data-testid="back-to-today-bottom">Back to today</Button>
        ) : closed ? (
          <Button variant="ghost" onClick={() => dispatch({ type: 'reopenDay', date: today })}>Reopen day</Button>
        ) : (
          <>
            <Button variant="ghost" onClick={() => { dispatch({ type: 'closeDay', date: today }); nav(`/day/${today}`) }}>Close day</Button>
            <p className="-mt-1 text-center text-[13px] text-mute">Locks today as <span data-testid="close-preview">{verdict(day.balance)}</span>. Days close by themselves at midnight.</p>
          </>
        )}
      </Screen>
      <TabBar />
      {snack && (
        <div role="status" key={snack.key} className="anim-fade bottom-above-tab absolute inset-x-4 z-20 flex items-center justify-between gap-3 rounded-[18px] bg-ink px-4 py-3 text-[15px] text-bg shadow-lg" data-testid="toast">
          <span>{snack.text}</span>
          <button type="button" className="tap -my-2 min-h-11 shrink-0 px-1 font-bold underline" onClick={undo}>Undo</button>
        </div>
      )}
      {editing && editing.foodId && FOOD_BY_ID.has(editing.foodId) ? (
        <FoodSheet key={editing.id} mode="edit" entry={editing} remaining={remainingExcl(editing)} onDone={() => setEditing(null)} onClose={() => setEditing(null)} />
      ) : editing ? (
        <QuickAddSheet key={editing.id} mode="edit" entry={editing} remaining={remainingExcl(editing)} onDone={() => setEditing(null)} onClose={() => setEditing(null)} onAddItem={editing.source === 'photo' && !group ? () => addToSingle(editing) : undefined} />
      ) : null}
      {group && !editing && !adding && groupItems.length > 0 && (
        <AiGroupSheet key={group} items={groupItems} onEdit={(e) => setEditing(e)} onAdd={addToGroup} onClose={() => setGroup(null)} />
      )}
      {adding && (
        <AddItemSheet group={adding.group} title={adding.title} meal={adding.meal} date={adding.date} remaining={left} onDone={added} onClose={() => setAdding(null)} />
      )}
      {editingEx && editingEx.activityId ? (
        <ExerciseEditSheet key={editingEx.id} entry={editingEx} onClose={() => setEditingEx(null)} />
      ) : editingEx ? (
        <ExerciseQuickSheet key={editingEx.id} date={date} initial={editingEx} onDone={() => setEditingEx(null)} onClose={() => setEditingEx(null)} />
      ) : null}
    </>
  )
}

/**
 * v1.13.2: scroll Home's list so the card the new row(s) went into starts at the top, unless that would leave the
 * rows under the snackbar, then just far enough to show them. The gaps come from the rows' CSS scroll-margin
 * (.land-row: clear of the top edge, and of the snackbar over the tab bar at the bottom).
 */
function scrollToRows(ids: string[], reduce: boolean) {
  const rows = ids.map((id) => document.querySelector<HTMLElement>(`[data-ids~="${id}"]`)).filter((x): x is HTMLElement => !!x)
  const first = rows[0], main = first?.closest('main')
  if (!first || !main) return
  const m = main.getBoundingClientRect(), cs = getComputedStyle(first)
  const mt = parseFloat(cs.scrollMarginTop) || 0, mb = parseFloat(cs.scrollMarginBottom) || 0
  const top = Math.min(...rows.map((r) => r.getBoundingClientRect().top)), bottom = Math.max(...rows.map((r) => r.getBoundingClientRect().bottom))
  const card = (first.closest('section')?.parentElement ?? first).getBoundingClientRect()
  const cur = main.scrollTop
  let want = cur + card.top - m.top - mt
  const shift = want - cur
  if (bottom - shift > m.bottom - mb) want = cur + bottom - (m.bottom - mb) // the card is taller than the room left
  if (top - (want - cur) < m.top + mt) want = cur + top - m.top - mt // never past the first new row
  want = Math.max(0, Math.min(want, main.scrollHeight - main.clientHeight))
  main.scrollTo({ top: want, behavior: reduce ? 'auto' : 'smooth' })
}
