import { Link, useNavigate, useParams } from 'react-router-dom'
import { Screen } from '../components/Layout'
import { Button, Card } from '../components/ui'
import { Confetti, Ticker } from '../components/motion'
import { dayView, fmt, goalMessage, KCAL_PER_KG, lastNDays, pctOf, round1, streak } from '../lib/calc'
import { useStore } from '../lib/store'

const parse = (k: string) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d) }

/**
 * v1.3 presentation only: a headline for the day from the existing goal maths (no new calculation stored or changed).
 * Progress is the balance as a share of the daily goal, in the goal's direction.
 */
function headline(balance: number, goal: number, closed: boolean) {
  const b = Math.round(balance)
  const pre = closed ? 'You hit' : 'So far you are at'
  if (goal === 0) {
    const hit = Math.abs(b) <= 100
    return hit ? { emoji: '🎯', text: closed ? 'You stayed even' : 'Right around even', hit } : { emoji: '🌱', text: `${fmt(Math.abs(b))} kcal from even`, hit }
  }
  const p = goal > 0 ? pctOf(b, goal) : pctOf(-b, -goal)
  if (p >= 100) return { emoji: '🎯', text: closed ? 'You hit your goal' : 'Goal reached', hit: true }
  if (p > 0) return { emoji: p >= 80 ? '🎯' : '💪', text: `${pre} ${p}% of your goal`, hit: false }
  return { emoji: '🌱', text: closed ? 'Tomorrow is a fresh start' : 'Still time today', hit: false }
}

/** End of day verdict for a closed day (or a live preview for an open one). */
export default function Verdict() {
  const { date = '' } = useParams()
  const { state, dispatch, today } = useStore()
  const nav = useNavigate()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date > today) return <Screen><p>Unknown day.</p><Link to="/" className="font-bold text-g-ink">Back to Today</Link></Screen>
  const d = dayView(state, date)
  const b = Math.round(d.balance)
  const surplus = b < 0
  const closed = !!d.closed
  const label = parse(date).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' })
  const tone = surplus ? 'text-over-ink' : 'text-g-ink'
  const row = 'flex justify-between border-b border-line py-3 text-[15px] last:border-0'
  const h = headline(d.balance, d.goal, closed)
  // Stats strip, same sums as History: streak, est. kg over the closed days of the 7 days ending on this date, protein.
  const s = streak(state.entries, date)
  const week = lastNDays(7, date).map((k) => dayView(state, k)).filter((x) => x.closed)
  const kg = -week.reduce((t, x) => t + x.balance, 0) / KCAL_PER_KG
  const kgText = week.length ? `${kg > 0 ? '+' : kg < 0 ? '−' : ''}${Math.abs(round1(kg)).toFixed(1)}` : '–'
  const stat = (v: string, l: string) => (
    <div className="flex-1"><div className="num text-[26px] leading-tight">{v}</div><div className="text-[12px] text-mute">{l}</div></div>
  )
  return (
    <Screen stagger={false} className={`relative items-center gap-0 pt-10 text-center ${surplus ? 'bg-[linear-gradient(180deg,#F6F1E7,#F8E9DF)]' : 'bg-[linear-gradient(180deg,#F6F1E7,#EAF3E9)]'}`}>
      {closed && h.hit && <Confetti />}
      <div className="eyebrow mt-2"><span data-testid="verdict-pill">{closed ? (d.closed!.auto ? 'Closed at midnight' : 'Day closed') : 'Still open'}</span> · {label}</div>
      <div className="pop relative mt-5 text-[60px] leading-none" aria-hidden="true">{h.hit && <span className="glow" />}{h.emoji}</div>
      <h1 className="sr-only">Verdict: {b === 0 ? 'even' : `${surplus ? 'surplus' : 'deficit'} ${fmt(Math.abs(b))} kcal`}</h1>
      <p className="rise-in title mt-3 max-w-[320px] text-[36px] leading-[1.1]">{h.text}</p>
      <div className={`num mt-5 text-[96px] leading-none ${tone}`} data-testid="verdict-number" aria-hidden="true"><Ticker value={Math.abs(b)} format={(n) => fmt(Math.round(n))} id={`verdict-${date}`} delay={200} /></div>
      <div className="mt-1 text-base text-mute" data-testid="verdict-text" aria-hidden="true">{b === 0 ? 'kcal, even' : `kcal ${surplus ? 'surplus' : 'deficit'}`}</div>
      <p className="mt-2 max-w-[290px] text-[14px] text-mute" data-testid="verdict-message">{goalMessage(d.balance, d.goal, true)}</p>
      <Card className="rise-late mt-6 flex w-full justify-around px-3 py-4" >
        {stat(String(s), `day streak`)}
        {stat(kgText, 'kg this week (est.)')}
        {stat(`${fmt(d.protein || 0)} g`, 'protein')}
      </Card>
      <div className="rise-late mt-5 flex w-full flex-col gap-1">
        <Button onClick={() => nav(-1)} data-autofocus aria-label={closed ? 'Done, see you tomorrow' : 'Done'} className="h-14 py-0">{closed ? 'See you tomorrow' : 'Done'}</Button>
        {closed && date === today && (
          <button type="button" className="tap px-2 py-2.5 text-[15px] font-bold text-g-ink" onClick={() => { dispatch({ type: 'reopenDay', date }); nav('/') }}>Reopen day</button>
        )}
        {!closed && date === today && (
          <button type="button" className="tap px-2 py-2.5 text-[15px] font-bold text-g-ink" onClick={() => dispatch({ type: 'closeDay', date })}>Close day</button>
        )}
      </div>
      <Card className="rise-late mt-4 w-full py-1 text-left">
        <div className="eyebrow pt-2.5">How it adds up</div>
        {d.baseBurn != null ? (
          <div className={row}><span>Burn <span className="text-mute">(BMR {fmt(d.bmr)} × 1.2, as closed)</span></span><b className="num font-semibold" data-testid="verdict-base">{fmt(d.baseBurn)}</b></div>
        ) : <div className={row}><span>BMR</span><b className="num font-semibold" data-testid="verdict-bmr">{fmt(d.bmr)}</b></div>}
        {d.baseBurn == null && d.movement > 0 && <div className={row}><span>Daily movement</span><b className="num font-semibold">+ {fmt(d.movement)}</b></div>}
        <div className={row}><span>Exercise burned</span><b className="num font-semibold text-ex-ink">+ {fmt(d.burned)}</b></div>
        <div className={row}><span>Food eaten</span><b className="num font-semibold">− {fmt(d.eaten)}</b></div>
        <div className={row}><b>Balance</b><b className={`num ${tone}`} data-testid="verdict-balance">{b === 0 ? 'even' : `${fmt(Math.abs(b))} ${surplus ? 'surplus' : 'deficit'}`}</b></div>
      </Card>
    </Screen>
  )
}
