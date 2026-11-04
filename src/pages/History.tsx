import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { BalanceTrendChart, type TrendDay } from '../components/BalanceTrendChart'
import { Screen, TabBar } from '../components/Layout'
import { RangeSheet, type DateRange } from '../components/RangeSheet'
import { Card, Chip, Illustrative } from '../components/ui'
import { addDays, dayView, onTrackGoal, fmt, KCAL_PER_KG, lastNDays, macroTargets, round1, streak } from '../lib/calc'
import { rolling } from '../lib/trend'
import { useStore } from '../lib/store'

const parse = (k: string) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d) }
// v1.19: fixed 3-letter months everywhere on History. WebKit's en-GB short month for September is 'Sept'.
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const dayMonth = (k: string) => { const d = parse(k); return `${d.getDate()} ${MONTHS[d.getMonth()]}` }
/** 'Sun 1 Nov' */
const wdm = (k: string) => `${WD[parse(k).getDay()]} ${dayMonth(k)}`
/** Keep each date on one line: '3 Nov 2025 – 2 Nov 2026' wraps only at the dash. */
const nowrap = (t: string) => {
  const [a, b] = t.split(' – ')
  if (b == null) return <span className="whitespace-nowrap">{a}</span>
  return <><span className="whitespace-nowrap">{a} –</span> <span className="whitespace-nowrap">{b}</span></>
}
/** '19 – 25 Oct', or '28 Sep – 4 Oct' across a month. */
const range = (a: string, b: string) => {
  const A = parse(a), B = parse(b)
  return A.getMonth() === B.getMonth() && A.getFullYear() === B.getFullYear() ? `${A.getDate()} – ${dayMonth(b)}` : `${dayMonth(a)} – ${dayMonth(b)}`
}
const signedK = (n: number) => (n > 0 ? `+${fmt(n)}` : n < 0 ? `−${fmt(-n)}` : '0')
/** v1.18 custom range: '3 – 28 Oct', '28 Sep – 4 Oct', one day '3 Oct'; years: '28 Dec 2025 – 3 Jan 2026'. */
const spanLabel = (a: string, b: string, years = false) => {
  if (a === b) return years ? `${dayMonth(a)} ${a.slice(0, 4)}` : dayMonth(a)
  if (!years || a.slice(0, 4) === b.slice(0, 4)) return range(a, b)
  const y = (k: string) => `${dayMonth(k)} ${k.slice(0, 4)}`
  return `${y(a)} – ${y(b)}`
}
const daysFrom = (a: string, b: string) => { const out: string[] = []; for (let k = a; k <= b; k = addDays(k, 1)) out.push(k); return out }
/** Tick every `step` bars, away from the plot edges when a label is wider than its bar slot. */
const tickAt = (i: number, count: number, halfW: number, pad = 6) => {
  const slot = 302 / count
  const step = Math.max(1, Math.ceil((halfW * 2 + pad) / slot))
  if (step > 1 && i % step !== Math.floor(step / 2)) return false
  return !((i === 0 || i === count - 1) && slot / 2 < halfW)
}
// v1.19 bars by range length: daily for 1 to 31 days, weekly (Monday to Sunday, cut to the range) for 32 to 182
// days, monthly (calendar months, cut to the range) from 183 days. No cap on the range length. A bucket cut short by
// the range edge is a "part" bar: lighter, dashed outline, a legend key and "part week" / "part month" on hold.
const DAILY_MAX = 31
const WEEKLY_MAX = 182
const monthName = (k: string, long = false) => (long ? `${MONTHS_LONG[parse(k).getMonth()]} ${k.slice(0, 4)}` : MONTHS[parse(k).getMonth()])
/** Custom pill: '3 – 28 Oct'; across years both years: '3 Nov ’25 – 2 Nov ’26'. */
const chipLabel = (a: string, b: string) => a.slice(0, 4) === b.slice(0, 4) ? spanLabel(a, b) : `${dayMonth(a)} ’${a.slice(2, 4)} – ${dayMonth(b)} ’${b.slice(2, 4)}`
/** v1.19: day ticks for 8 to 31 bars. The first tick and the first tick in a new month carry the month ('4 Oct … 1 Nov'),
 * and the last bar is always labelled with its month (drawn end-aligned). Ticks are kept left to right only when they
 * clear the tick before them and the last label; a dropped month tick hands its month to the next kept tick. */
const tw = (t: string) => [...t].reduce((w, c) => w + (c === ' ' ? 3.6 : /\d/.test(c) ? 7.8 : 7.4), 0)
const dayTicks = (keys: string[]) => {
  const L = keys.length, slot = 302 / L
  const labels: (string | null)[] = keys.map(() => null)
  const lastLabel = dayMonth(keys[L - 1])
  const lastLeft = L * slot - 1.5 - tw(lastLabel)
  let prevRight = -Infinity, month = -1
  for (let i = 0; i < L - 1; i++) {
    if (!tickAt(i, L, 9)) continue
    const dt = parse(keys[i])
    const t = dt.getMonth() !== month ? dayMonth(keys[i]) : String(dt.getDate())
    const c = (i + 0.5) * slot, w = tw(t)
    if (c - w / 2 < prevRight + 4 || c + w / 2 > lastLeft - 4) continue
    labels[i] = t; prevRight = c + w / 2; month = dt.getMonth()
  }
  labels[L - 1] = lastLabel
  return labels
}
const daysInMonth = (k: string) => { const d = parse(k); return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate() }
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
  // v1.21.4: with a kept-date exercise gap the line is the deficit a day is on track at once the gap is burned.
  const goal = onTrackGoal(state.profile!)
  // Whole history (rounded up to full periods) so the chart can swipe back; the cards below show the settled period.
  const first = useMemo(() => [...state.entries.map((e) => e.date), ...state.exercises.map((e) => e.date), ...Object.keys(state.closedDays)].sort()[0] ?? today, [state, today])
  const span = Math.round((parse(today).getTime() - parse(first).getTime()) / 864e5) + 1
  const N = Math.min(364, Math.max(n, Math.ceil(span / n) * n))
  const all = useMemo(() => lastNDays(N, today).map((key) => ({ key, ...dayView(state, key) })), [N, state, today])
  const trend: TrendDay[] = useMemo(() => {
    const avg = rolling(all.map((d) => (d.closed ? d.balance : null)))
    // v1.19 (point 17): 30d pages use the custom-range day ticks, page by page (pages are fixed 30-day slices).
    // Pages run back from today, so slice from the end; a short oldest page is ticked as its full 30 days.
    const ticks: (string | null)[] = all.map(() => null)
    if (n === 30) for (let e = N; e > 0; e -= 30) {
      const t = dayTicks(daysFrom(addDays(all[e - 1].key, -29), all[e - 1].key))
      for (let j = 0; j < 30; j++) if (e - 30 + j >= 0) ticks[e - 30 + j] = t[j]
    }
    return all.map((d, i) => ({
      key: d.key,
      label: n === 7 ? WD[parse(d.key).getDay()] : ticks[i] ?? String(parse(d.key).getDate()),
      tick: n === 7 || ticks[i] != null,
      anchor: n === 30 && (N - 1 - i) % 30 === 0 ? ('end' as const) : undefined,
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
    if (L <= DAILY_MAX) {
      const bAvg = rolling(ext.map((d) => (d.closed ? d.balance : null))).slice(6)
      const pAvg = rolling(ext.map((d) => (d.closed ? d.protein : null))).slice(6)
      const short = L <= 7
      const labels = short ? rd.map((d) => WD[parse(d.key).getDay()]) : dayTicks(keys)
      const base = rd.map((d, i) => ({
        key: d.key, label: labels[i] ?? String(parse(d.key).getDate()), tick: labels[i] != null, open: !d.closed,
        anchor: !short && i === L - 1 ? ('end' as const) : undefined,
      }))
      const bal: TrendDay[] = base.map((t, i) => ({ ...t, value: rd[i].closed || rd[i].logged ? Math.round(rd[i].balance) : null, avg: bAvg[i] == null ? null : Math.round(bAvg[i]!) }))
      const pro: TrendDay[] = base.map((t, i) => {
        const v = rd[i].closed || rd[i].logged ? Math.round(rd[i].protein) : null
        return { ...t, value: v, hit: v != null && v >= pTarget, avg: pAvg[i] == null ? null : Math.round(pAvg[i]!) }
      })
      return { days: rd, weekly: false as const, unit: 'day' as const, bal, pro, weeks: [] as typeof rd[], gaps: 0, parts: false }
    }
    // Weekly / monthly: Monday-start weeks or calendar months, cut to the range. A bar is the bucket's daily average over
    // logged days only (closed days; a bucket with only today open uses today), so the goal / target line still applies;
    // holding one shows its total and average. A bucket cut by the range edge is a "part" bar (lighter, dashed).
    const unit: 'week' | 'month' = L <= WEEKLY_MAX ? 'week' : 'month'
    const weeks: typeof rd[] = []
    for (const d of rd) { if (!weeks.length || (unit === 'week' ? parse(d.key).getDay() === 1 : d.key.endsWith('-01'))) weeks.push([]); weeks[weeks.length - 1].push(d) }
    const W = weeks.length
    const bal: TrendDay[] = [], pro: TrendDay[] = []
    const fullLen = (w: typeof rd) => (unit === 'week' ? 7 : daysInMonth(w[0].key))
    weeks.forEach((w, i) => {
      const part = w.length < fullLen(w)
      const t = unit === 'week'
        ? { key: w[0].key, label: dayMonth(w[0].key), tick: tickAt(i, W, 22), part }
        // v1.19.1: month ticks are single initials (N D J F …) from the fixed list; the full name stays on the tick's label.
        : { key: w[0].key, label: monthName(w[0].key)[0], full: monthName(w[0].key, true), tick: tickAt(i, W, 5, 2), part }
      const cl = w.filter((d) => d.closed), lg = w.filter((d) => d.closed || d.logged)
      const bDays = cl.length ? cl : lg
      bal.push({ ...t, open: !cl.length, value: bDays.length ? Math.round(bDays.reduce((a, d) => a + d.balance, 0) / bDays.length) : null, avg: null })
      const pv = lg.length ? Math.round(lg.reduce((a, d) => a + d.protein, 0) / lg.length) : null
      pro.push({ ...t, open: lg.some((d) => !d.closed), value: pv, hit: pv != null && pv >= pTarget, avg: null })
    })
    const gaps = rd.filter((d) => !d.closed && !d.logged).length
    return { days: rd, weekly: true as const, unit, bal, pro, weeks, gaps, parts: bal.some((b) => b.part) }
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
  const periodLabel = nowrap(custom ? `Custom · ${spanLabel(custom.from, custom.to, true)}` : `${n === 7 ? 'Week' : '30 days'} · ${range(days[0].key, days[days.length - 1].key)}`)
  const nDays = days.length
  // v1.10.2: before the first closed day there is no history yet, so say so (today still shows below).
  const noHistory = Object.keys(state.closedDays).length === 0
  // From goes back as far as the first logged day (no other cap).
  const minFrom = first < today ? first : today
  const onPage = (p: number) => { setPage(p); setScrub(null) }
  const legend = (
    <div className="mt-1.5 flex items-center justify-center gap-3 text-xs text-mute" data-testid="chart-legend">
      {!C?.weekly && !(C && C.days.length === 1) && <span className="inline-flex items-center gap-1.5"><svg width="16" height="6" aria-hidden="true"><path d="M1 4 C5 0 11 6 15 2" stroke="var(--color-ink)" strokeOpacity=".82" strokeWidth="2" fill="none" strokeLinecap="round" /></svg>7-day average</span>}
      {C?.parts && <span className="inline-flex items-center gap-1.5" data-testid="part-key"><svg width="10" height="10" aria-hidden="true"><rect x=".5" y=".5" width="9" height="9" rx="2" fill={view === 'protein' ? 'var(--color-protein)' : 'var(--color-g)'} fillOpacity=".4" stroke={view === 'protein' ? 'var(--color-protein)' : 'var(--color-g)'} strokeDasharray="2 1.5" /></svg>part {C.unit}</span>}
      <span data-testid="chart-hint">{C ? `Hold to see a ${C.unit}` : `Hold to see a day · swipe for ${n === 7 ? 'weeks' : 'months'}`}</span>
    </div>
  )
  const gapNote = C?.weekly && C.gaps > 0 ? (
    <p className="mt-1 text-center text-xs text-mute" data-testid="gap-note">Averages use logged days only · {C.gaps} day{C.gaps === 1 ? '' : 's'} with no logs</p>
  ) : null
  const chartKey = custom ? `${custom.from}_${custom.to}` : String(n)
  const chartProps = C
    ? { n: cTrend.length, page: 0, onPage: () => {}, swipe: false, unit: C.unit }
    : { n, page: pg, onPage }
  // Weekly hold header: the week's dates, total and daily average.
  const wk = selWeek && (() => {
    const cl = selWeek.filter((d) => d.closed), lg = selWeek.filter((d) => d.closed || d.logged)
    const total = cl.reduce((a, d) => a + d.balance, 0)
    const pHit = lg.filter((d) => Math.round(d.protein) >= pTarget).length
    const len = selWeek.length
    const full = C!.unit === 'month' ? daysInMonth(selWeek[0].key) : 7
    const part = len < full
    const name = C!.unit === 'month' && !part ? monthName(selWeek[0].key, true) : spanLabel(selWeek[0].key, selWeek[len - 1].key)
    return { label: part ? `${name} · part ${C!.unit}` : name, cl, lg, total, pHit, len, logged: lg.length < len ? `${lg.length} of ${len} days logged` : null }
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
        <ViewControls view={view} setView={(v) => { setView(v); setScrub(null) }} n={n} custom={custom} setRange={setRange} pick={() => setPicking(true)} />
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
                <div className="num text-[32px] leading-tight" data-testid="scrub-avg">{wk.pHit} / {wk.lg.length}</div>
                <div className="text-[13px] text-mute">target {fmt(pTarget)} g</div>
              </div>
            </div>
          ) : pSel && selDay ? (
            <div className="flex justify-between gap-3" data-testid="scrub-header">
              <div>
                <div className="eyebrow">{wdm(pSel.key)}</div>
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
                <div className="num text-[32px] leading-tight text-protein-ink" data-testid="protein-hit">{hit} / {pDays.length}</div>
                <div className="text-[13px] text-mute">{pDays.length < nDays ? 'logged days hit protein' : 'days hit protein'}</div>
              </div>
              <div className="shrink-0 text-right">
                <div className="eyebrow">Daily average</div>
                <div className="num text-[32px] leading-tight" data-testid="protein-avg">{pDays.length ? `${fmt(pAvg)} g` : '–'}</div>
                <div className="text-[13px] text-mute">target {fmt(pTarget)} g</div>
              </div>
            </div>
          )}
          <p className="sr-only">{`${spanLabel(days[0].key, days[days.length - 1].key, !!custom)}. Hit protein ${hit} of ${pDays.length} logged days. Daily average ${fmt(pAvg)} grams, target ${fmt(pTarget)} grams.`}</p>
          <div className="mt-3">
            <BalanceTrendChart key={`protein-${chartKey}`} variant="protein" days={cPTrend} {...chartProps} goal={pTarget} scrub={scrub} onScrub={setScrub} />
          </div>
          {legend}
          {gapNote}
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
                  <span className="text-base font-semibold">{d.key === today ? 'Today' : wdm(d.key)}</span>
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
                <div className="text-[13px] text-mute">{wk.cl.length ? `kcal ${wk.total < 0 ? 'surplus' : 'deficit'} · ${wk.logged ?? `${wk.cl.length} closed day${wk.cl.length === 1 ? '' : 's'}`}` : sel.value == null ? 'No logs' : 'open, so far'}</div>
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
                <div className="eyebrow">{wdm(sel.key)}</div>
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
                  {closed.length ? `${round1(kg) > 0 ? '+' : round1(kg) < 0 ? '−' : ''}${Math.abs(round1(kg)).toFixed(1)} kg` : '–'}
                </div>
                <div className="text-[13px] text-mute">at 7,700 kcal per kg</div>
              </div>
            </div>
          )}
          <div className="mt-3">
            <BalanceTrendChart key={`balance-${chartKey}`} days={cTrend} {...chartProps} goal={goal} scrub={scrub} onScrub={setScrub} />
          </div>
          {legend}
          {gapNote}
          <p className="sr-only">{`${spanLabel(days[0].key, days[days.length - 1].key, !!custom)}. ${closed.length} closed days, total ${fmt(Math.abs(total))} kcal ${total < 0 ? 'surplus' : 'deficit'}.`}</p>
        </Card>
        <Card className="py-1">
          <ul aria-label="Daily calories" data-testid="day-list">
            {[...days].reverse().map((d) => {
              const b = Math.round(d.balance)
              const sur = b < 0
              const has = d.closed || d.logged
              return (
                <li key={d.key} data-day={d.key} className="border-b border-line last:border-0">
                  <Link to={`/day/${d.key}`} className="flex items-center justify-between py-3">
                    <span>
                      <span className="block text-base font-semibold">{d.key === today ? 'Today' : wdm(d.key)}</span>
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
        <RangeSheet initial={custom ?? { from: days[0].key < minFrom ? minFrom : days[0].key, to: days[days.length - 1].key }} first={minFrom} today={today}
          onApply={apply} onClose={() => setPicking(false)} />
      )}
      <TabBar />
    </>
  )
}

// v1.19 view switch: a full-width segmented Calories / Protein track with a sliding white thumb, then small outlined
// date pills (7d, 30d, Custom). v1.20: right-aligned; the selected pill is a soft green tint, so the switch stays the main control.
type Ctl = { view: 'balance' | 'protein'; setView: (v: 'balance' | 'protein') => void; n: 7 | 30; custom: DateRange | null; setRange: (r: 7 | 30) => void; pick: () => void }
const customAria = (c: DateRange | null) => (c ? `Custom range, ${spanLabel(c.from, c.to, true)}. Change dates` : 'Custom range')
const VIEWS = [['balance', 'Calories'], ['protein', 'Protein']] as const

function ViewControls(p: Ctl) {
  return (
    <div className="flex flex-col gap-2.5" data-testid="history-controls">
      <div className="relative flex rounded-full bg-track p-1" role="group" aria-label="View">
        <span aria-hidden="true" data-testid="view-thumb" className="absolute inset-y-1 left-1 w-[calc(50%-4px)] rounded-full bg-card shadow-[0_1px_3px_rgba(42,36,32,.16)] transition-transform duration-300 ease-out motion-reduce:transition-none"
          style={{ transform: p.view === 'protein' ? 'translateX(100%)' : 'none' }} />
        {VIEWS.map(([v, t]) => (
          <button key={v} type="button" aria-pressed={p.view === v} onClick={() => p.setView(v)} data-testid={`view-${v}`}
            className={`tap relative h-11 flex-1 rounded-full text-[15px] font-semibold ${p.view === v ? 'text-ink' : 'text-mute'}`}>{t}</button>
        ))}
      </div>
      <div className="flex justify-end gap-1.5" role="group" aria-label="Range" data-testid="range-row">
        <OutlinePill on={!p.custom && p.n === 7} onClick={() => p.setRange(7)} className="px-3" aria-label="7d (7 days)">7d</OutlinePill>
        <OutlinePill on={!p.custom && p.n === 30} onClick={() => p.setRange(30)} className="px-3" aria-label="30d (30 days)">30d</OutlinePill>
        <OutlinePill on={!!p.custom} onClick={p.pick} className="whitespace-nowrap px-3" aria-label={customAria(p.custom)} aria-haspopup="dialog" data-testid="range-custom">
          {p.custom ? chipLabel(p.custom.from, p.custom.to) : 'Custom'}
        </OutlinePill>
      </div>
    </div>
  )
}

/** Small date pill. On: soft green tint fill (--color-chip-on), green line, g-soft-ink text. Off: card, light line, mute text. 44 px tall. */
function OutlinePill({ on, className = '', ...rest }: Parameters<typeof Chip>[0]) {
  return <button type="button" aria-pressed={on} className={`tap h-11 rounded-full border text-[14px] font-semibold ${on ? 'border-chip-on-line bg-chip-on text-g-soft-ink' : 'border-line bg-card text-mute'} ${className}`} {...rest} />
}
