import { useState } from 'react'
import { Link } from 'react-router-dom'
import { FoodSheet } from '../components/FoodSheet'
import { MacroCard } from '../components/MacroCard'
import { QuickAddSheet } from '../components/QuickAddSheet'
import { Screen, TabBar } from '../components/Layout'
import { Ring } from '../components/Ring'
import { Card } from '../components/ui'
import { dateKey, entryTotals, fmt, streak, sumEntries } from '../lib/calc'
import { FOOD_BY_ID } from '../data/foods'
import { formatAmount } from '../lib/amount'
import { useStore } from '../lib/store'
import { MEALS, MEAL_LABEL, type Entry } from '../lib/types'

export default function Home() {
  const { state } = useStore()
  const today = dateKey()
  const entries = state.entries.filter((e) => e.date === today).sort((a, b) => a.createdAt - b.createdAt)
  const totals = sumEntries(entries)
  const target = state.profile!.target
  const s = streak(state.entries, today)
  const [editing, setEditing] = useState<Entry | null>(null)
  const dateLabel = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' })
  const remainingExcl = (e: Entry) => target - totals.kcal + entryTotals(e).kcal

  return (
    <>
      <Screen className="gap-3">
        <header className="flex items-center justify-between">
          <div>
            <div className="text-[15px] text-mute">{dateLabel}</div>
            <h1 className="text-[28px] font-bold tracking-tight">Today</h1>
          </div>
          <div className="flex items-center gap-2">
            <span className="rounded-full border border-line bg-card px-3.5 py-2.5 text-[15px] font-semibold" data-testid="streak">
              <span aria-hidden="true">🔥 </span>{s} {s === 1 ? 'day' : 'days'}<span className="sr-only"> streak</span>
            </span>
            <Link to="/settings" aria-label="Settings" className="grid h-11 w-11 place-items-center rounded-full border border-line bg-card text-mute">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></svg>
            </Link>
          </div>
        </header>
        <Card>
          <Ring eaten={totals.kcal} target={target} />
          <div className="mt-2 flex justify-around text-sm text-mute">
            <span>Target <b className="text-ink" data-testid="target">{fmt(target)}</b></span>
            <span>Eaten <b className="text-ink" data-testid="eaten">{fmt(totals.kcal)}</b></span>
          </div>
        </Card>
        <MacroCard totals={totals} target={target} />
        {entries.length === 0 && (
          <p className="text-center text-[15px] text-mute" data-testid="empty">Nothing logged yet today. Tap + to add your first meal.</p>
        )}
        {MEALS.map((m) => {
          const list = entries.filter((e) => e.meal === m)
          const sum = sumEntries(list).kcal
          return (
            <Card key={m}>
              <section aria-label={MEAL_LABEL[m]} data-testid={`meal-${m}`}>
                <div className="flex items-center justify-between">
                  <h2 className="text-[17px] font-bold">{MEAL_LABEL[m]}{list.length > 0 && ` · ${fmt(sum)}`}</h2>
                  <Link to={`/log?meal=${m}`} className="px-1 py-1 text-[15px] font-bold text-g-ink" aria-label={`Add to ${MEAL_LABEL[m]}`}>+ Add</Link>
                </div>
                {list.length > 0 && (
                  <ul className="mt-2">
                    {list.map((e) => (
                      <li key={e.id}>
                        <button type="button" onClick={() => setEditing(e)} className="flex w-full justify-between gap-3 border-t border-line py-2.5 text-left text-[15px]" aria-label={`Edit ${e.name}, ${fmt(entryTotals(e).kcal)} kcal`}>
                          <span>{e.name}{e.foodId && <span className="text-mute">, {formatAmount(e.servingLabel, e.qty)}</span>}</span>
                          <span className="tabular-nums">{fmt(entryTotals(e).kcal)}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </Card>
          )
        })}
      </Screen>
      <TabBar />
      {editing && editing.foodId && FOOD_BY_ID.has(editing.foodId) ? (
        <FoodSheet key={editing.id} mode="edit" entry={editing} remaining={remainingExcl(editing)} onDone={() => setEditing(null)} onClose={() => setEditing(null)} />
      ) : editing ? (
        <QuickAddSheet key={editing.id} mode="edit" entry={editing} remaining={remainingExcl(editing)} onDone={() => setEditing(null)} onClose={() => setEditing(null)} />
      ) : null}
    </>
  )
}
