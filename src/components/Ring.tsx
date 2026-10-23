import { fmt } from '../lib/calc'

export function Ring({ eaten, target, size = 190, stroke = 17 }: { eaten: number; target: number; size?: number; stroke?: number }) {
  const left = target - eaten
  const over = left < 0
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const pct = target > 0 ? Math.min(1, eaten / target) : 0
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
          stroke={over ? 'var(--color-over)' : 'var(--color-g)'}
          strokeWidth={stroke}
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct)}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center" data-testid="ring">
        <div className={`text-[40px] font-extrabold tracking-tight ${over ? 'text-over-ink' : ''}`} data-testid="kcal-left">
          {fmt(Math.abs(left))}
        </div>
        <div className="text-[15px] text-mute">{over ? 'kcal over' : 'kcal left'}</div>
      </div>
    </div>
  )
}
