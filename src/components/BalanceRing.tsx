import { useContext, type ReactNode } from 'react'
import { fmt, zoneInk, type GaugeZone } from '../lib/calc'
import { COUNT_MS, CountHold, Ticker, useCountUp } from './motion'

/**
 * v1.16: the ring moved to BalanceGauge; this file keeps the equation card.
 * BMR + Movement + Exercise - Eaten = Deficit / Surplus / Even (v1.19.1; was Balance). Movement is null when the daily movement setting is off.
 * Movement off (v1.3.1): BMR + Exercise - Eaten = Deficit / Surplus / Even. baseBurn only comes from days closed by v1.2.1 to v1.3 with
 * Movement off; those keep their closed numbers, so the first term shows that day's burn (BMR x 1.2) and still adds up.
 */
export function Equation({ bmr, movement, baseBurn, burned, eaten, balance, zone }: { bmr: number; movement: number | null; baseBurn?: number; burned: number; eaten: number; balance: number; zone?: GaugeZone }) {
  const surplus = Math.round(balance) < 0, even = Math.round(balance) === 0
  // v1.21: Exercise, Eaten and the last term count to their new values with the gauge's counter (same 600 ms, easing
  // and hold). The last term counts the signed balance, so its word follows the number through 0 (Deficit, Even, Surplus).
  const hold = useContext(CountHold)
  const shownBal = Math.round(useCountUp(balance, 'eq-balance', COUNT_MS, 0, hold))
  const last = shownBal === 0 ? 'Even' : shownBal < 0 ? 'Surplus' : 'Deficit'
  const count = (v: number, id: string) => <Ticker value={v} format={(n) => fmt(Math.round(n))} id={id} />
  // v1.16: the last term's number takes the gauge zone's ink, so an on-target Gain day is green, not orange.
  const tone = zone ? zoneInk(zone) : surplus ? 'text-over-ink' : 'text-g-ink'
  const item = (label: string, v: ReactNode, id: string, cls = 'text-ink') => (
    <div className="flex flex-col-reverse items-center text-center" data-term={label}>
      <span className="mt-0.5">{label}</span>
      <b className={`num block text-[19px] leading-tight ${cls}`} data-testid={id}>{v}</b>
    </div>
  )
  const op = (s: string) => <span className="-mt-4 font-display text-[17px] text-mute-soft" aria-hidden="true">{s}</span>
  return (
    <div className="flex items-center justify-between text-[11px] text-mute" data-testid="equation" aria-label={`${baseBurn != null ? `Burn ${fmt(baseBurn)}, BMR ${fmt(bmr)} times 1.2 as closed,` : `BMR ${fmt(bmr)}`}${baseBurn == null && movement != null ? ` plus movement ${fmt(movement)}` : ''} plus exercise ${fmt(burned)} minus eaten ${fmt(eaten)} equals ${even ? '0, even' : `${fmt(Math.abs(balance))} ${surplus ? 'surplus' : 'deficit'}`}`} role="group">
      {baseBurn != null ? item('Burn', fmt(baseBurn), 'eq-base') : item('BMR', fmt(bmr), 'eq-bmr')}
      {baseBurn == null && movement != null && <>{op('+')}{item('Movement', fmt(movement), 'eq-movement')}</>}
      {op('+')}
      {item('Exercise', count(burned, 'eq-burned'), 'eq-burned', 'text-ex-ink')}
      {op('−')}
      {item('Eaten', count(eaten, 'eq-eaten'), 'eaten')}
      {op('=')}
      {item(last, fmt(Math.abs(shownBal)), 'eq-balance', tone)}
    </div>
  )
}
