import { fmt, goalLabel } from '../lib/calc'

/**
 * Ring for the daily balance (positive = deficit, green; negative = surplus, orange).
 * Fill shows progress toward the daily goal.
 */
export function BalanceRing({ balance, goal, size = 190, stroke = 17, closed = false }: { balance: number; goal: number; size?: number; stroke?: number; closed?: boolean }) {
  const b = Math.round(balance)
  const surplus = b < 0
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  let pct: number
  if (goal > 0) pct = b / goal
  else if (goal < 0) pct = -b / -goal
  else pct = 1 - Math.min(1, Math.abs(b) / 500) // keep: full when even
  pct = Math.max(0, Math.min(1, pct))
  const label = b === 0 ? 'Even' : `${surplus ? 'Surplus' : 'Deficit'}${closed ? '' : ' so far'}`
  return (
    <div className="relative mx-auto my-1" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--color-line)" strokeWidth={stroke} />
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
          strokeDashoffset={c * (1 - pct)}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center" data-testid="ring" data-state={surplus ? 'surplus' : 'deficit'}>
        <div className="text-[13px] text-mute" data-testid="balance-label">{label}</div>
        <div className={`text-[40px] font-extrabold leading-tight tracking-tight ${surplus ? 'text-over-ink' : 'text-g-ink'}`} data-testid="balance">
          {fmt(Math.abs(b))}
        </div>
        <div className="text-[15px] text-mute" data-testid="ring-goal">{goal === 0 ? 'goal: even' : `goal ${fmt(Math.abs(goal))}${goal < 0 ? ' surplus' : ''}`}</div>
        <span className="sr-only">{`Balance ${fmt(Math.abs(b))} kcal ${surplus ? 'surplus' : 'deficit'}. Goal ${goalLabel(goal)}.`}</span>
      </div>
    </div>
  )
}

/** BMR + Movement + Exercise - Eaten = Balance. Movement is null when the daily movement setting is off. */
export function Equation({ bmr, movement, burned, eaten, balance }: { bmr: number; movement: number | null; burned: number; eaten: number; balance: number }) {
  const surplus = Math.round(balance) < 0
  const item = (label: string, v: string, id: string, cls = 'text-ink') => (
    <div className="text-center" data-term={label}>
      {label}
      <b className={`block text-[16px] tabular-nums ${cls}`} data-testid={id}>{v}</b>
    </div>
  )
  const op = (s: string) => <span className="text-[16px] text-mute" aria-hidden="true">{s}</span>
  return (
    <div className="mt-2.5 flex items-center justify-between text-[12px] text-mute" data-testid="equation" aria-label={`BMR ${fmt(bmr)}${movement != null ? ` plus movement ${fmt(movement)}` : ''} plus exercise ${fmt(burned)} minus eaten ${fmt(eaten)} equals balance ${fmt(Math.abs(balance))} ${surplus ? 'surplus' : 'deficit'}`} role="group">
      {item('BMR', fmt(bmr), 'eq-bmr')}
      {movement != null && <>{op('+')}{item('Movement', fmt(movement), 'eq-movement')}</>}
      {op('+')}
      {item('Exercise', fmt(burned), 'eq-burned', 'text-ex-ink')}
      {op('−')}
      {item('Eaten', fmt(eaten), 'eaten')}
      {op('=')}
      {item('Balance', `${surplus ? '−' : ''}${fmt(Math.abs(balance))}`, 'eq-balance', surplus ? 'text-over-ink' : 'text-g-ink')}
    </div>
  )
}
