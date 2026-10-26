import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { BalanceTrendChart, type TrendDay } from '../components/BalanceTrendChart'
import { ProteinChart } from '../components/ProteinChart'
import { Screen, TabBar } from '../components/Layout'
import { Card, Chip, Illustrative } from '../components/ui'
import { dayView, fmt, KCAL_PER_KG, lastNDays, macroTargets, round1, streak } from '../lib/calc'
import { rolling } from '../lib/trend'
import { useStore } from '../lib/store'

const parse = (k: string) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d) }
const dayMonth = (k: string) => parse(k).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
/** '19 – 25 Oct', or '28 Sep – 4 Oct' across a month. */
const range = (a: string, b: string) => {
  const A = parse(a), B = parse(b)
  return A.getMonth() === B.getMonth() ? `${A.getDate()} – ${dayMonth(b)}` : `${dayMonth(a)} – ${dayMonth(b)}`
}
const signedK = (n: number) => (n > 0 ? `+${fmt(n)}` : n < 0 ? `−${fmt(-n)}` : '0')

export default function History() {
  const { state, today } = useStore()
  const [n, setN] = useState<7 | 30>(7)
  const [view, setView] = useState<'balance' | 'protein'>('balance')
  // Paging + scrubbing for the balance chart. page 0 = the latest n days.
  const [page, setPage] = useState(0)
  const [scrub, setScrub] = useState<number | null>(null)
  const setRange = (r: 7 | 30) => { setN(r); setPage(0); setScrub(null) }
  const pTarget = macroTargets(state.profile!).protein
  const goal = state.profile!.dailyGoal
  // Whole history (rounded up to full periods) so the chart can swipe back; the cards below show the settled period.
  const first = useMemo(() => [...state.entries.map((e) => e.date), ...state.exercises.map((e) => e.date), ...Object.keys(state.closedDays)].sort()[0] ?? today, [state, today])
  const span = Math.round((parse(today).getTime() - parse(first).getTime()) / 864e5) + 1
  const N = Math.min(364, Math.max(n, Math.ceil(span / n) * n))
  const all = useMemo(() => lastNDays(N, today).map((key) => ({ key, ...dayView(state, key) })), [N, state, today])
  const trend: TrendDay[] = useMemo(() => {
    const avg = rolling(all.map((d) => (d.closed ? d.balance : null)))
    return all.map((d, i) => ({
      key: d.key,
      label: n === 7 ? parse(d.key).toLocaleDateString('en-GB', { weekday: 'short' }) : String(parse(d.key).getDate()),
      tick: n === 7 || (N - 1 - i) % 5 === 2, // never at a page edge, so labels are not cut while paging
      value: d.closed || d.logged ? Math.round(d.balance) : null,
      open: !d.closed,
      avg: avg[i] == null ? null : Math.round(avg[i]!),
    }))
  }, [all, n, N])
  const pg = Math.min(page, N / n - 1)
  const days = all.slice(N - n * (pg + 1), N - n * pg)
  const sel = scrub != null ? trend[scrub] : null
  const selDay = scrub != null ? all[scrub] : null
  // Only closed days count toward the total. Today counts once it is closed.
  const closed = days.filter((d) => d.closed)
  const total = closed.reduce((s, d) => s + d.balance, 0)
  const kg = -total / KCAL_PER_KG
  const s = streak(state.entries, today)
  const bars = days.map((d) => ({ key: d.key, label: n === 7 ? parse(d.key).toLocaleDateString('en-GB', { weekday: 'short' }) : String(parse(d.key).getDate()) }))
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
            <Chip on={view === 'balance'} onClick={() => { setView('balance'); setPage(0); setScrub(null) }}>Balance</Chip>
            <Chip on={view === 'protein'} onClick={() => { setView('protein'); setPage(0); setScrub(null) }}>Protein</Chip>
          </div>
          <div className="flex gap-1.5" role="group" aria-label="Range">
            <Chip on={n === 7} onClick={() => setRange(7)} className="px-3" aria-label="7d (7 days)">7d</Chip>
            <Chip on={n === 30} onClick={() => setRange(30)} className="px-3" aria-label="30d (30 days)">30d</Chip>
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
          {sel && selDay ? (
            <div className="flex justify-between gap-3" data-testid="scrub-header">
              <div>
                <div className="eyebrow">{parse(sel.key).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}</div>
                <div className={`num text-[32px] leading-tight ${sel.value != null && sel.value < 0 ? 'text-over-ink' : 'text-g-ink'}`} data-testid="scrub-value">
                  {sel.value == null ? '–' : signedK(sel.value)}
                </div>
                <div className="text-[13px] text-mute">{sel.value == null ? 'No logs' : `kcal ${sel.value < 0 ? 'surplus' : sel.value > 0 ? 'deficit' : 'even'} · ${selDay.closed ? 'closed' : 'open, so far'}`}</div>
              </div>
              <div className="text-right">
                <div className="eyebrow">7-day avg</div>
                <div className="num text-[32px] leading-tight" data-testid="scrub-avg">{sel.avg == null ? '–' : signedK(sel.avg)}</div>
                <div className="text-[13px] text-mute">kcal a day</div>
              </div>
            </div>
          ) : (
            <div className="flex justify-between gap-3">
              <div>
                <div className="eyebrow whitespace-nowrap" data-testid="period-range">{n === 7 ? 'Week' : '30 days'} · {range(days[0].key, days[days.length - 1].key)}</div>
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
                <div className="text-[13px] text-mute">at 7,700 kcal per kg</div>
              </div>
            </div>
          )}
          <div className="mt-3">
            <BalanceTrendChart key={n} days={trend} n={n} goal={goal} page={pg} onPage={(p) => { setPage(p); setScrub(null) }} scrub={scrub} onScrub={setScrub} />
          </div>
          <div className="mt-1.5 flex items-center justify-center gap-3 text-xs text-mute">
            <span className="inline-flex items-center gap-1.5"><svg width="16" height="6" aria-hidden="true"><path d="M1 4 C5 0 11 6 15 2" stroke="var(--color-ink)" strokeOpacity=".82" strokeWidth="2" fill="none" strokeLinecap="round" /></svg>7-day average</span>
            <span>Hold to see a day · swipe for {n === 7 ? 'weeks' : 'months'}</span>
          </div>
          <p className="sr-only">{`${range(days[0].key, days[days.length - 1].key)}. ${closed.length} closed days, total ${fmt(Math.abs(total))} kcal ${total < 0 ? 'surplus' : 'deficit'}.`}</p>
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
