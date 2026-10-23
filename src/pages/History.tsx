import { useState } from 'react'
import { BarChart } from '../components/BarChart'
import { Screen, TabBar } from '../components/Layout'
import { Card, Chip, Illustrative } from '../components/ui'
import { dateKey, fmt, lastNDays, streak, sumEntries } from '../lib/calc'
import { useStore } from '../lib/store'

const parse = (k: string) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d) }

export default function History() {
  const { state } = useStore()
  const [n, setN] = useState<7 | 30>(7)
  const today = dateKey()
  const target = state.profile!.target
  const days = lastNDays(n, today).map((key) => {
    const list = state.entries.filter((e) => e.date === key)
    return { key, kcal: sumEntries(list).kcal, logged: list.length > 0 }
  })
  const logged = days.filter((d) => d.logged)
  const complete = logged.filter((d) => d.key !== today)
  const avgPool = complete.length ? complete : logged
  const avg = avgPool.length ? avgPool.reduce((s, d) => s + d.kcal, 0) / avgPool.length : 0
  const onTarget = logged.filter((d) => d.kcal <= target).length
  const s = streak(state.entries, today)
  const bars = days.map((d) => ({
    key: d.key,
    label: n === 7 ? parse(d.key).toLocaleDateString('en-GB', { weekday: 'short' }) : String(parse(d.key).getDate()),
    value: d.kcal,
    partial: d.key === today,
  }))

  return (
    <>
      <Screen>
        <header className="flex items-center justify-between">
          <h1 className="text-[28px] font-bold tracking-tight">History</h1>
          <span className="rounded-full border border-line bg-card px-3.5 py-2.5 text-[15px] font-semibold" data-testid="streak">
            <span aria-hidden="true">🔥 </span>{s} day streak
          </span>
        </header>
        <div className="flex gap-2" role="group" aria-label="Range">
          <Chip on={n === 7} onClick={() => setN(7)}>7 days</Chip>
          <Chip on={n === 30} onClick={() => setN(30)}>30 days</Chip>
        </div>
        <Card>
          <div className="flex justify-between">
            <div><div className="text-[15px] text-mute">Daily average</div><div className="text-[32px] font-extrabold tracking-tight" data-testid="avg">{logged.length ? fmt(avg) : '–'}</div></div>
            <div className="text-right"><div className="text-[15px] text-mute">On target</div><div className="text-[32px] font-extrabold tracking-tight text-g-ink" data-testid="on-target">{onTarget}/{n}</div></div>
          </div>
          <div className="mt-2"><BarChart bars={bars} target={target} /></div>
          <p className="mt-1.5 text-center text-xs text-mute">Dashed line is your {fmt(target)} target. Orange means over. Today is faded.</p>
        </Card>
        <Card className="py-1">
          <ul aria-label="Daily totals" data-testid="day-list">
            {[...days].reverse().map((d) => {
              const over = d.kcal > target
              return (
                <li key={d.key} className="flex items-center justify-between border-b border-line py-3 last:border-0">
                  <span className="text-base font-semibold">{d.key === today ? 'Today' : parse(d.key).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}</span>
                  {d.logged ? (
                    <span className={over ? 'font-semibold text-over-ink' : ''}>{fmt(d.kcal)} <span className="text-[13px] text-mute">kcal{over ? ' · over' : ''}</span></span>
                  ) : (
                    <span className="text-[13px] text-mute">No logs</span>
                  )}
                </li>
              )
            })}
          </ul>
        </Card>
        <Illustrative />
      </Screen>
      <TabBar />
    </>
  )
}
