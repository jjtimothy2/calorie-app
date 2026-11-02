import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { BalanceTrendChart, type TrendDay } from '../components/BalanceTrendChart'
import { Screen, TabBar } from '../components/Layout'
import { RangeSheet, type DateRange } from '../components/RangeSheet'
import { Card, Chip, Illustrative } from '../components/ui'
import { addDays, dayView, fmt, KCAL_PER_KG, lastNDays, macroTargets, round1, streak } from '../lib/calc'
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
/** v1.18 custom range: '3 – 28 Oct', '28 Sep – 4 Oct', one day '3 Oct'; years: '28 Dec 2025 – 3 Jan 2026'. */
const spanLabel = (a: string, b: string, years = false) => {
  if (a === b) return years ? parse(a).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : dayMonth(a)
  if (!years || a.slice(0, 4) === b.slice(0, 4)) return range(a, b)
  const y = (k: string) => parse(k).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
  return `${y(a)} – ${y(b)}`
}
const daysFrom = (a: string, b: string) => { const out: string[] = []; for (let k = a; k <= b; k = addDays(k, 1)) out.push(k); return out }
/** Tick every `step` bars, away from the plot edges when a label is wider than its bar slot. */
const tickAt = (i: number, count: number, halfW: number) => {
  const slot = 302 / count
  const step = Math.max(1, Math.ceil((halfW * 2 + 6) / slot))
  if (step > 1 && i % step !== Math.floor(step / 2)) return false
  return !((i === 0 || i === count - 1) && slot / 2 < halfW)
}
/** Up to 31 days: daily bars. Longer: weekly bars (weeks start Monday, cut to the range), labelled by week start. */
const WEEKLY_OVER = 31
// v1.18 (item 14): the custom range is remembered while the app is open, so leaving History and coming back keeps
// it. It is never stored: a reload starts at 7d again.
let remembered: DateRange | null = null

export default function History() {
  const { state, today } = useStore()
  const [n, setN] = useState<7 | 30>(7)
  const [view, setView] = useState<'balance' | 'protein'>('balance')
  // Paging + scrubbing, shared by the Balance and Protein charts (v1.4.2): switching tabs keeps the period. page 0 = the latest n days.
  const [page, setPage] = useState(0)
  const [scrub, setScrub] = useState<number | null>(null)
  const [custom, setCustom] = useState<DateRange | null>(remembered)
  const [picking, setPicking] = useState(false)
  const setRange = (r: 7 | 30) => { setN(r); setPage(0); setScrub(null); setCustom(null); remembered = null }
  const apply = (r: DateRange) => { setCustom(r); remembered = r; setScrub(null); setPicking(false) }
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
  const pTrend: TrendDay[] = useMemo(() => {
    const avg = rolling(all.map((d) => (d.closed ? d.protein : null)))
    return trend.map((t, i) => {
      const d = all[i]
      const v = d.closed || d.logged ? Math.round(d.protein) : null
      return { ...t, value: v, hit: v != null && v >= pTarget, avg: avg[i] == null ? null : Math.round(avg[i]!) }
    })
  }, [all, trend, pTarget])
  const pg = Math.min(page, N / n - 1)
  // v1.18 custom range: the range's own days (plus 6 before, for the 7-day average); weekly bars past 31 days.
  const C = useMemo(() => {
    if (!custom) return null
    const keys = daysFrom(custom.from, custom.to)
    const L = keys.length
    const ext = [...daysFrom(addDays(custom.from, -6), addDays(custom.from, -1)), ...keys].map((key) => ({ key, ...dayView(state, key) }))
    const rd = ext.slice(6)
    if (L <= WEEKLY_OVER) {
      const bAvg = rolling(ext.map((d) => (d.closed ? d.balance : null))).slice(6)
      const pAvg = rolling(ext.map((d) => (d.closed ? d.protein : null))).slice(6)
      const short = L <= 7
      const base = rd.map((d, i) => ({
        key: d.key,
        label: short ? parse(d.key).toLocaleDateString('en-GB', { weekday: 'short' }) : String(parse(d.key).getDate()),
        tick: short || tickAt(i, L, 9),
        open: !d.closed,
      }))
      const bal: TrendDay[] = base.map((t, i) => ({ ...t, value: rd[i].closed || rd[i].logged ? Math.round(rd[i].balance) : null, avg: bAvg[i] == null ? null : Math.round(bAvg[i]!) }))
      const pro: TrendDay[] = base.map((t, i) => {
        const v = rd[i].closed || rd[i].logged ? Math.round(rd[i].protein) : null
        return { ...t, value: v, hit: v != null && v >= pTarget, avg: pAvg[i] == null ? null : Math.round(pAvg[i]!) }
      })
      return { days: rd, weekly: false as const, bal, pro, weeks: [] as typeof rd[] }
    }
    // Weekly: Monday-start weeks cut to the range. A bar is the week's daily average (closed days; a week with only
    // today open uses today), so the goal / target line still applies; holding one shows its total and average.
    const weeks: typeof rd[] = []
    for (const d of rd) { if (!weeks.length || parse(d.key).getDay() === 1) weeks.push([]); weeks[weeks.length - 1].push(d) }
    const W = weeks.length
    const bal: TrendDay[] = [], pro: TrendDay[] = []
    weeks.forEach((w, i) => {
      const t = { key: w[0].key, label: dayMonth(w[0].key), tick: tickAt(i, W, 22) }
      const cl = w.filter((d) => d.closed), lg = w.filter((d) => d.closed || d.logged)
      const bDays = cl.length ? cl : lg
      bal.push({ ...t, open: !cl.length, value: bDays.length ? Math.round(bDays.reduce((a, d) => a + d.balance, 0) / bDays.length) : null, avg: null })
      const pv = lg.length ? Math.round(lg.reduce((a, d) => a + d.protein, 0) / lg.length) : null
      pro.push({ ...t, open: lg.some((d) => !d.closed), value: pv, hit: pv != null && pv >= pTarget, avg: null })
    })
    return { days: rd, weekly: true as const, bal, pro, weeks }
  }, [custom, state, pTarget])
  const days = C ? C.days : all.slice(N - n * (pg + 1), N - n * pg)
  const cTrend = C ? C.bal : trend, cPTrend = C ? C.pro : pTrend
  const sel = scrub != null ? cTrend[scrub] ?? null : null
  const pSel = scrub != null ? cPTrend[scrub] ?? null : null
  const selDay = scrub != null ? (C ? (C.weekly ? null : C.days[scrub]) : all[scrub]) ?? null : null
  const selWeek = scrub != null && C?.weekly ? C.weeks[scrub] ?? null : null
  // Only closed days count toward the total. Today counts once it is closed.
  const closed = days.filter((d) => d.closed)
  const total = closed.reduce((s, d) => s + d.balance, 0)
  const kg = -total / KCAL_PER_KG
  const s = streak(state.entries, today)
  const tone = total < 0 ? 'text-over-ink' : 'text-g-ink'
  const pDays = days.filter((d) => d.closed || d.logged)
  const hit = pDays.filter((d) => Math.round(d.protein) >= pTarget).length
  const pAvg = pDays.length ? pDays.reduce((s, d) => s + d.protein, 0) / pDays.length : 0
  const periodLabel = custom ? `Custom · ${spanLabel(custom.from, custom.to, true)}` : `${n === 7 ? 'Week' : '30 days'} · ${range(days[0].key, days[days.length - 1].key)}`
  const nDays = days.length
  // v1.10.2: before the first closed day there is no history yet, so say so (today still shows below).
  const noHistory = Object.keys(state.closedDays).length === 0
  const onPage = (p: number) => { setPage(p); setScrub(null) }
  const legend = (
    <div className="mt-1.5 flex items-center justify-center gap-3 text-xs text-mute" data-testid="chart-legend">
      {!C?.weekly && <span className="inline-flex items-center gap-1.5"><svg width="16" height="6" aria-hidden="true"><path d="M1 4 C5 0 11 6 15 2" stroke="var(--color-ink)" strokeOpacity=".82" strokeWidth="2" fill="none" strokeLinecap="round" /></svg>7-day average</span>}
      <span data-testid="chart-hint">{C ? `Hold to see a ${C.weekly ? 'week' : 'day'}` : `Hold to see a day · swipe for ${n === 7 ? 'weeks' : 'months'}`}</span>
    </div>
  )
  const chartKey = custom ? `${custom.from}_${custom.to}` : String(n)
  const chartProps = C
    ? { n: cTrend.length, page: 0, onPage: () => {}, swipe: false, unit: C.weekly ? ('week' as const) : ('day' as const) }
    : { n, page: pg, onPage }
  // Weekly hold header: the week's dates, total and daily average.
  const wk = selWeek && (() => {
    const cl = selWeek.filter((d) => d.closed), lg = selWeek.filter((d) => d.closed || d.logged)
    const total = cl.reduce((a, d) => a + d.balance, 0)
    const pHit = lg.filter((d) => Math.round(d.protein) >= pTarget).length
    return { label: spanLabel(selWeek[0].key, selWeek[selWeek.length - 1].key), cl, lg, total, pHit, len: selWeek.length }
  })()

  return (
    <>
      <Screen>
        <header className="flex items-center justify-between">
          <h1 className="title text-[32px] leading-tight">History</h1>
          <span className="rounded-full border border-line bg-card px-3.5 py-2.5 text-[15px] font-semibold" data-testid="streak">
            <span aria-hidden="true">🔥 </span>{s} day streak
          </span>
        </header>
        {noHistory && (
          <div data-testid="history-empty" role="status"><Card className="flex items-start gap-3">
            <span aria-hidden="true" className="text-[28px] leading-none">🗓️</span>
            <div>
              <p className="text-base font-semibold">Your history shows up here after your first full day.</p>
              <p className="mt-1 text-[13px] text-mute">Log what you eat today. Close the day when you are done, or it closes itself at midnight.</p>
            </div>
          </Card></div>
        )}
        <div className="flex flex-wrap items-center justify-between gap-2" data-testid="history-controls">
          <div className="flex gap-2" role="group" aria-label="View">
            <Chip on={view === 'balance'} onClick={() => { setView('balance'); setScrub(null) }}>Balance</Chip>
            <Chip on={view === 'protein'} onClick={() => { setView('protein'); setScrub(null) }}>Protein</Chip>
          </div>
          <div className="ml-auto flex gap-1.5" role="group" aria-label="Range">
            <Chip on={!custom && n === 7} onClick={() => setRange(7)} className="px-3" aria-label="7d (7 days)">7d</Chip>
            <Chip on={!custom && n === 30} onClick={() => setRange(30)} className="px-3" aria-label="30d (30 days)">30d</Chip>
            <Chip on={!!custom} onClick={() => setPicking(true)} className="whitespace-nowrap px-3" aria-label={custom ? `Custom range, ${spanLabel(custom.from, custom.to, true)}. Change dates` : 'Custom range'} aria-haspopup="dialog" data-testid="range-custom">
              {custom ? spanLabel(custom.from, custom.to) : 'Custom'}
            </Chip>
          </div>
        </div>
        {view === 'protein' ? (<>
        <Card>
          {pSel && wk ? (
            <div className="flex justify-between gap-3" data-testid="scrub-header" data-week={pSel.key}>
              <div>
                <div className="eyebrow">{wk.label}</div>
                <div className="num text-[32px] leading-tight text-protein-ink" data-testid="scrub-value">{pSel.value == null ? '–' : `${fmt(pSel.value)} g`}</div>
                <div className="text-[13px] text-mute">{pSel.value == null ? 'No logs' : `a day · ${pSel.hit ? 'target hit' : 'below target'}`}</div>
              </div>
              <div className="text-right">
                <div className="eyebrow">Days hit</div>
                <div className="num text-[32px] leading-tight" data-testid="scrub-avg">{wk.pHit} / {wk.len}</div>
                <div className="text-[13px] text-mute">target {fmt(pTarget)} g</div>
              </div>
            </div>
          ) : pSel && selDay ? (
            <div className="flex justify-between gap-3" data-testid="scrub-header">
              <div>
                <div className="eyebrow">{parse(pSel.key).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}</div>
                <div className="num text-[32px] leading-tight text-protein-ink" data-testid="scrub-value">{pSel.value == null ? '–' : `${fmt(pSel.value)} g`}</div>
                <div className="text-[13px] text-mute">{pSel.value == null ? 'No logs' : `${pSel.hit ? 'target hit' : 'below target'} · ${selDay.closed ? 'closed' : 'open, so far'}`}</div>
              </div>
              <div className="text-right">
                <div className="eyebrow">7-day avg</div>
                <div className="num text-[32px] leading-tight" data-testid="scrub-avg">{pSel.avg == null ? '–' : `${fmt(pSel.avg)} g`}</div>
                <div className="text-[13px] text-mute">a day</div>
              </div>
            </div>
          ) : (
            <div className="flex justify-between gap-3">
              <div className="min-w-0">
                <div className={`eyebrow ${custom ? '' : 'whitespace-nowrap'}`} data-testid="period-range">{periodLabel}</div>
                <div className="num text-[32px] leading-tight text-protein-ink" data-testid="protein-hit">{hit} / {nDays}</div>
                <div className="text-[13px] text-mute">days hit protein</div>
              </div>
              <div className="shrink-0 text-right">
                <div className="eyebrow">Daily average</div>
                <div className="num text-[32px] leading-tight" data-testid="protein-avg">{pDays.length ? `${fmt(pAvg)} g` : '–'}</div>
                <div className="text-[13px] text-mute">target {fmt(pTarget)} g</div>
              </div>
            </div>
          )}
          <p className="sr-only">{`${spanLabel(days[0].key, days[days.length - 1].key, !!custom)}. Hit protein ${hit} of ${nDays} days. Daily average ${fmt(pAvg)} grams, target ${fmt(pTarget)} grams.`}</p>
          <div className="mt-3">
            <BalanceTrendChart key={`protein-${chartKey}`} variant="protein" days={cPTrend} {...chartProps} goal={pTarget} scrub={scrub} onScrub={setScrub} />
          </div>
          {legend}
          <p className="mt-1 text-center text-xs text-mute">Dashed line is your {fmt(pTarget)} g target. Solid bars hit it.</p>
        </Card>
        <Card className="py-1">
          <ul aria-label="Daily protein" data-testid="protein-list">
            {[...days].reverse().map((d) => {
              const g = Math.round(d.protein)
              const has = d.closed || d.logged
              const ok = has && g >= pTarget
              return (
                <li key={d.key} data-day={d.key} className="flex items-center justify-between border-b border-line py-3 last:border-0">
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
          {sel && wk ? (
            <div className="flex justify-between gap-3" data-testid="scrub-header" data-week={sel.key}>
              <div>
                <div className="eyebrow">{wk.label}</div>
                <div className={`num text-[32px] leading-tight ${wk.cl.length ? (wk.total < 0 ? 'text-over-ink' : 'text-g-ink') : sel.value != null && sel.value < 0 ? 'text-over-ink' : 'text-g-ink'}`} data-testid="scrub-value">
                  {wk.cl.length ? signedK(Math.round(wk.total)) : sel.value == null ? '–' : signedK(sel.value)}
                </div>
                <div className="text-[13px] text-mute">{wk.cl.length ? `kcal ${wk.total < 0 ? 'surplus' : 'deficit'} · ${wk.cl.length} closed day${wk.cl.length === 1 ? '' : 's'}` : sel.value == null ? 'No logs' : 'open, so far'}</div>
              </div>
              <div className="text-right">
                <div className="eyebrow">Daily avg</div>
                <div className="num text-[32px] leading-tight" data-testid="scrub-avg">{sel.value == null ? '–' : signedK(sel.value)}</div>
                <div className="text-[13px] text-mute">kcal a day</div>
              </div>
            </div>
          ) : sel && selDay ? (
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
              <div className="min-w-0">
                <div className={`eyebrow ${custom ? '' : 'whitespace-nowrap'}`} data-testid="period-range">{periodLabel}</div>
                <div className={`num text-[32px] leading-tight ${tone}`} data-testid="week-total" data-value={Math.round(total)}>
                  {closed.length ? fmt(Math.abs(total)) : '–'}
                </div>
                <div className="text-[13px] text-mute">{closed.length ? `kcal ${total < 0 ? 'surplus' : 'deficit'} · ${closed.length} closed day${closed.length === 1 ? '' : 's'}` : 'No closed days yet'}</div>
              </div>
              <div className="shrink-0 text-right">
                <div className="eyebrow">Est. change</div>
                <div className="num text-[32px] leading-tight" data-testid="est-change">
                  {closed.length ? `${kg > 0 ? '+' : kg < 0 ? '−' : ''}${Math.abs(round1(kg)).toFixed(1)} kg` : '–'}
                </div>
                <div className="text-[13px] text-mute">at 7,700 kcal per kg</div>
              </div>
            </div>
          )}
          <div className="mt-3">
            <BalanceTrendChart key={`balance-${chartKey}`} days={cTrend} {...chartProps} goal={goal} scrub={scrub} onScrub={setScrub} />
          </div>
          {legend}
          <p className="sr-only">{`${spanLabel(days[0].key, days[days.length - 1].key, !!custom)}. ${closed.length} closed days, total ${fmt(Math.abs(total))} kcal ${total < 0 ? 'surplus' : 'deficit'}.`}</p>
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
      {picking && (
        <RangeSheet initial={custom ?? { from: days[0].key < first ? first : days[0].key, to: days[days.length - 1].key }} first={first < today ? first : today} today={today}
          onApply={apply} onClose={() => setPicking(false)} />
      )}
      <TabBar />
    </>
  )
}
