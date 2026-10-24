import { fmt, goalLabel } from '../lib/calc'
import type { CSSProperties } from 'react'
import { Ticker, useRingFrom } from './motion'

/**
 * Ring for the daily balance (positive = deficit, green; negative = surplus, orange).
 * Fill shows progress toward the daily goal.
 */
export function BalanceRing({ balance, goal, size = 230, stroke = 12, closed = false }: { balance: number; goal: number; size?: number; stroke?: number; closed?: boolean }) {
  const b = Math.round(balance)
  const surplus = b < 0
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  let pct: number
  if (goal > 0) pct = b / goal
  else if (goal < 0) pct = -b / -goal
  else pct = 1 - Math.min(1, Math.abs(b) / 500) // keep: full when even
  pct = Math.max(0, Math.min(1, pct))
  const offset = c * (1 - pct)
  const from = useRingFrom('balance', c, offset)
  const label = b === 0 ? 'Even' : `${surplus ? 'Surplus' : 'Deficit'}${closed ? '' : ' so far'}`
  return (
    <div className="relative mx-auto my-1" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--color-track)" strokeWidth={stroke} />
        <circle
          className="ring-arc"
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={surplus ? 'var(--color-over)' : 'var(--color-g)'}
          strokeWidth={stroke}
          strokeLinecap={pct > 0 && pct < 1 ? 'round' : 'butt'}
          strokeDasharray={c}
          strokeDashoffset={offset}
          style={{ '--from': `${from}px` } as CSSProperties}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center" data-testid="ring" data-state={surplus ? 'surplus' : 'deficit'}>
        <div className="eyebrow" data-testid="balance-label">{label}</div>
        <div className={`num text-[64px] leading-none ${surplus ? 'text-over-ink' : 'text-g-ink'}`} style={{ fontSize: size > 200 ? 64 : 44 }} data-testid="balance">
          <Ticker value={Math.abs(b)} format={(n) => fmt(Math.round(n))} id="balance" />
        </div>
        <div className="mt-1 text-[13px] text-mute" data-testid="ring-goal">{goal === 0 ? 'goal: even' : `goal ${fmt(Math.abs(goal))}${goal < 0 ? ' surplus' : ''}`}</div>
        <span className="sr-only">{`Balance ${fmt(Math.abs(b))} kcal ${surplus ? 'surplus' : 'deficit'}. Goal ${goalLabel(goal)}.`}</span>
      </div>
    </div>
  )
}

/**
 * BMR + Movement + Exercise - Eaten = Balance. Movement is null when the daily movement setting is off.
 * Movement off (v1.3.1): BMR + Exercise - Eaten = Balance. baseBurn only comes from days closed by v1.2.1 to v1.3 with
 * Movement off; those keep their closed numbers, so the first term shows that day's burn (BMR x 1.2) and still adds up.
 */
export function Equation({ bmr, movement, baseBurn, burned, eaten, balance }: { bmr: number; movement: number | null; baseBurn?: number; burned: number; eaten: number; balance: number }) {
  const surplus = Math.round(balance) < 0
  const item = (label: string, v: string, id: string, cls = 'text-ink') => (
    <div className="flex flex-col-reverse items-center text-center" data-term={label}>
      <span className="mt-0.5">{label}</span>
      <b className={`num block text-[19px] leading-tight ${cls}`} data-testid={id}>{v}</b>
    </div>
  )
  const op = (s: string) => <span className="-mt-4 font-display text-[17px] text-mute-soft" aria-hidden="true">{s}</span>
  return (
    <div className="flex items-center justify-between text-[11px] text-mute" data-testid="equation" aria-label={`${baseBurn != null ? `Burn ${fmt(baseBurn)}, BMR ${fmt(bmr)} times 1.2 as closed,` : `BMR ${fmt(bmr)}`}${baseBurn == null && movement != null ? ` plus movement ${fmt(movement)}` : ''} plus exercise ${fmt(burned)} minus eaten ${fmt(eaten)} equals balance ${fmt(Math.abs(balance))} ${surplus ? 'surplus' : 'deficit'}`} role="group">
      {baseBurn != null ? item('Burn', fmt(baseBurn), 'eq-base') : item('BMR', fmt(bmr), 'eq-bmr')}
      {baseBurn == null && movement != null && <>{op('+')}{item('Movement', fmt(movement), 'eq-movement')}</>}
      {op('+')}
      {item('Exercise', fmt(burned), 'eq-burned', 'text-ex-ink')}
      {op('−')}
      {item('Eaten', fmt(eaten), 'eaten')}
      {op('=')}
      {item('Balance', `${surplus ? '−' : ''}${fmt(Math.abs(balance))}`, 'eq-balance', surplus ? 'text-over-ink' : 'text-g-ink')}
    </div>
  )
}
