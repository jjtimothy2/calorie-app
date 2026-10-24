import { useState } from 'react'
import { Link } from 'react-router-dom'
import { BalanceChart } from '../components/BalanceChart'
import { ProteinChart } from '../components/ProteinChart'
import { Screen, TabBar } from '../components/Layout'
import { Card, Chip, Illustrative } from '../components/ui'
import { dayView, fmt, KCAL_PER_KG, lastNDays, macroTargets, round1, streak } from '../lib/calc'
import { useStore } from '../lib/store'

const parse = (k: string) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d) }

export default function History() {
  const { state, today } = useStore()
  const [n, setN] = useState<7 | 30>(7)
  const [view, setView] = useState<'balance' | 'protein'>('balance')
  const pTarget = macroTargets(state.profile!).protein
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
  const pDays = days.filter((d) => d.closed || d.logged)
  const hit = pDays.filter((d) => Math.round(d.protein) >= pTarget).length
  const pAvg = pDays.length ? pDays.reduce((s, d) => s + d.protein, 0) / pDays.length : 0
  const pBars = days.map((d) => ({ key: d.key, label: bars.find((b) => b.key === d.key)!.label, value: d.closed || d.logged ? Math.round(d.protein) : null, today: d.key === today }))

  return (
    <>
      <Screen>
        <header className="flex items-center justify-between">
          <h1 className="title text-[32px] leading-tight">History</h1>
          <span className="rounded-full border border-line bg-card px-3.5 py-2.5 text-[15px] font-semibold" data-testid="streak">
            <span aria-hidden="true">🔥 </span>{s} day streak
          </span>
        </header>
        <div className="flex items-center justify-between gap-2">
          <div className="flex gap-2" role="group" aria-label="View">
            <Chip on={view === 'balance'} onClick={() => setView('balance')}>Balance</Chip>
            <Chip on={view === 'protein'} onClick={() => setView('protein')}>Protein</Chip>
          </div>
          <div className="flex gap-1.5" role="group" aria-label="Range">
            <Chip on={n === 7} onClick={() => setN(7)} className="px-3" aria-label="7d (7 days)">7d</Chip>
            <Chip on={n === 30} onClick={() => setN(30)} className="px-3" aria-label="30d (30 days)">30d</Chip>
          </div>
        </div>
        {view === 'protein' ? (<>
        <Card>
          <div className="flex justify-between gap-3">
            <div>
              <div className="eyebrow">Hit protein</div>
              <div className="num text-[32px] leading-tight text-protein-ink" data-testid="protein-hit">{hit} / {n}</div>
              <div className="text-[13px] text-mute">days {n === 7 ? 'this week' : 'in 30 days'}</div>
            </div>
            <div className="text-right">
              <div className="eyebrow">Daily average</div>
              <div className="num text-[32px] leading-tight" data-testid="protein-avg">{pDays.length ? `${fmt(pAvg)} g` : '–'}</div>
              <div className="text-[13px] text-mute">target {fmt(pTarget)} g</div>
            </div>
          </div>
          <p className="sr-only">{`Hit protein ${hit} of ${n} days. Daily average ${fmt(pAvg)} grams, target ${fmt(pTarget)} grams.`}</p>
          <div className="mt-3"><ProteinChart bars={pBars} target={pTarget} /></div>
          <p className="mt-1.5 text-center text-xs text-mute">Dashed line is your {fmt(pTarget)} g target. Solid bars hit it. Today is faded.</p>
        </Card>
        <Card className="py-1">
          <ul aria-label="Daily protein" data-testid="protein-list">
            {[...days].reverse().map((d) => {
              const g = Math.round(d.protein)
              const has = d.closed || d.logged
              const ok = has && g >= pTarget
              return (
                <li key={d.key} className="flex items-center justify-between border-b border-line py-3 last:border-0">
                  <span className="text-base font-semibold">{d.key === today ? 'Today' : parse(d.key).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}</span>
                  {has ? (
                    <span className={ok ? 'font-semibold' : 'text-mute'}>{fmt(g)} g{ok && <span aria-label=", target hit"> ✓</span>}</span>
                  ) : <span className="text-[13px] text-mute">No logs</span>}
                </li>
              )
            })}
          </ul>
        </Card>
        </>) : (<>
        <Card>
          <div className="flex justify-between gap-3">
            <div>
              <div className="eyebrow">{n === 7 ? 'Week balance' : '30-day balance'}</div>
              <div className={`num text-[32px] leading-tight ${tone}`} data-testid="week-total" data-value={Math.round(total)}>
                {closed.length ? fmt(Math.abs(total)) : '–'}
              </div>
              <div className="text-[13px] text-mute">{closed.length ? `kcal ${total < 0 ? 'surplus' : 'deficit'} · ${closed.length} closed day${closed.length === 1 ? '' : 's'}` : 'No closed days yet'}</div>
            </div>
            <div className="text-right">
              <div className="eyebrow">Est. change</div>
              <div className="num text-[32px] leading-tight" data-testid="est-change">
                {closed.length ? `${kg > 0 ? '+' : kg < 0 ? '−' : ''}${Math.abs(round1(kg)).toFixed(1)} kg` : '–'}
              </div>
              <div className="text-[13px] text-mute">estimate, 7,700 kcal per kg</div>
            </div>
          </div>
          <div className="mt-3"><BalanceChart bars={bars} goal={goal} /></div>
          <p className="mt-1.5 text-center text-xs text-mute">Up is deficit (green), down is surplus (orange). Faint lines mark even and ± your daily goal. Very big days are cut short and show their value. Open days are faded.</p>
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
        </>)}
        <Illustrative />
      </Screen>
      <TabBar />
    </>
  )
}
