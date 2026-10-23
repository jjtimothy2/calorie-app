import { Link, useNavigate, useParams } from 'react-router-dom'
import { Screen } from '../components/Layout'
import { Button, Card } from '../components/ui'
import { dayView, fmt, goalMessage } from '../lib/calc'
import { useStore } from '../lib/store'

const parse = (k: string) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d) }

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
  const row = 'flex justify-between border-b border-line py-3.5 text-base last:border-0'
  return (
    <Screen className="items-center justify-center gap-4 text-center">
      <span className={`rounded-full px-3 py-1.5 text-[13px] font-bold ${closed ? 'bg-g-soft text-g-soft-ink' : 'bg-line text-ink'}`} data-testid="verdict-pill">
        {closed ? (d.closed!.auto ? 'Closed at midnight' : 'Day closed') : 'Still open'}
      </span>
      <div className="text-[15px] text-mute">{label}</div>
      <h1 className="sr-only">Verdict: {b === 0 ? 'even' : `${surplus ? 'surplus' : 'deficit'} ${fmt(Math.abs(b))} kcal`}</h1>
      <div className={`text-[64px] font-extrabold leading-none tracking-tight ${tone}`} data-testid="verdict-number" aria-hidden="true">{fmt(Math.abs(b))}</div>
      <div className="text-xl font-bold" data-testid="verdict-text" aria-hidden="true">{b === 0 ? 'kcal, even' : `kcal ${surplus ? 'surplus' : 'deficit'}`}</div>
      <p className="max-w-[280px] text-[15px] text-mute" data-testid="verdict-message">{goalMessage(d.balance, d.goal, true)}</p>
      <Card className="w-full py-0 text-left">
        <div className={row}><span>BMR</span><b className="font-semibold tabular-nums">{fmt(d.bmr)}</b></div>
        {d.movement > 0 && <div className={row}><span>Daily movement</span><b className="font-semibold tabular-nums">+ {fmt(d.movement)}</b></div>}
        <div className={row}><span>Exercise burned</span><b className="font-semibold tabular-nums text-ex-ink">+ {fmt(d.burned)}</b></div>
        <div className={row}><span>Food eaten</span><b className="font-semibold tabular-nums">− {fmt(d.eaten)}</b></div>
        <div className={row}><b>Balance</b><b className={`tabular-nums ${tone}`} data-testid="verdict-balance">{b === 0 ? 'even' : `${fmt(Math.abs(b))} ${surplus ? 'surplus' : 'deficit'}`}</b></div>
      </Card>
      <Button onClick={() => nav(-1)} data-autofocus>Done</Button>
      {closed && date === today && (
        <button type="button" className="px-2 py-2 text-[15px] font-bold text-g-ink" onClick={() => { dispatch({ type: 'reopenDay', date }); nav('/') }}>Reopen day</button>
      )}
      {!closed && date === today && (
        <button type="button" className="px-2 py-2 text-[15px] font-bold text-g-ink" onClick={() => dispatch({ type: 'closeDay', date })}>Close day</button>
      )}
    </Screen>
  )
}
