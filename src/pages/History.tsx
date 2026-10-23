import { useState } from 'react'
import { Link } from 'react-router-dom'
import { BalanceChart } from '../components/BalanceChart'
import { Screen, TabBar } from '../components/Layout'
import { Card, Chip, Illustrative } from '../components/ui'
import { dayView, fmt, KCAL_PER_KG, lastNDays, round1, streak } from '../lib/calc'
import { useStore } from '../lib/store'

const parse = (k: string) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d) }

export default function History() {
  const { state, today } = useStore()
  const [n, setN] = useState<7 | 30>(7)
  const goal = state.profile!.dailyGoal
  const days = lastNDays(n, today).map((key) => ({ key, ...dayView(state, key) }))
  // Only closed days count toward the total. Today counts once it is closed.
  const closed = days.filter((d) => d.closed)
  const total = closed.reduce((s, d) => s + d.balance, 0)
  const kg = -total / KCAL_PER_KG
  const s = streak(state.entries, today)
  const bars = days.map((d) => ({
    key: d.key,
    label: n === 7 ? parse(d.key).toLocaleDateString('en-GB', { weekday: 'short' }) : String(parse(d.key).getDate()),
    value: d.closed || d.logged ? Math.round(d.balance) : null,
    open: !d.closed,
  }))
  const tone = total < 0 ? 'text-over-ink' : 'text-g-ink'

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
          <div className="flex justify-between gap-3">
            <div>
              <div className="text-[15px] text-mute">{n === 7 ? 'Week balance' : '30-day balance'}</div>
              <div className={`text-[30px] font-extrabold leading-tight tracking-tight ${tone}`} data-testid="week-total" data-value={Math.round(total)}>
                {closed.length ? fmt(Math.abs(total)) : '–'}
              </div>
              <div className="text-[13px] text-mute">{closed.length ? `kcal ${total < 0 ? 'surplus' : 'deficit'} · ${closed.length} closed day${closed.length === 1 ? '' : 's'}` : 'No closed days yet'}</div>
            </div>
            <div className="text-right">
              <div className="text-[15px] text-mute">Est. change</div>
              <div className="text-[30px] font-extrabold leading-tight tracking-tight" data-testid="est-change">
                {closed.length ? `${kg > 0 ? '+' : kg < 0 ? '−' : ''}${Math.abs(round1(kg)).toFixed(1)} kg` : '–'}
              </div>
              <div className="text-[13px] text-mute">estimate, 7,700 kcal per kg</div>
            </div>
          </div>
          <div className="mt-3"><BalanceChart bars={bars} goal={goal} /></div>
          <p className="mt-1.5 text-center text-xs text-mute">Up is deficit (green), down is surplus (orange). Dashed line is your goal. Open days are faded.</p>
        </Card>
        <Card className="py-1">
          <ul aria-label="Daily balance" data-testid="day-list">
            {[...days].reverse().map((d) => {
              const b = Math.round(d.balance)
              const sur = b < 0
              const has = d.closed || d.logged
              return (
                <li key={d.key} data-day={d.key} className="border-b border-line last:border-0">
                  <Link to={`/day/${d.key}`} className="flex items-center justify-between py-3">
                    <span>
                      <span className="block text-base font-semibold">{d.key === today ? 'Today' : parse(d.key).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}</span>
                      <span className="text-[13px] text-mute">{d.closed ? 'Closed' : has ? 'Open, so far' : 'No logs'}</span>
                    </span>
                    {has ? (
                      <span className={`rounded-full px-3 py-1.5 text-[13px] font-bold ${sur ? 'bg-over-soft text-over-soft-ink' : 'bg-g-soft text-g-soft-ink'}`} data-testid="day-pill">
                        {b === 0 ? 'Even' : `${sur ? 'Surplus' : 'Deficit'} ${fmt(Math.abs(b))}`}
                      </span>
                    ) : <span aria-hidden="true" className="text-mute">›</span>}
                  </Link>
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
