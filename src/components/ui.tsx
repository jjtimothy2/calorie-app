import type { ButtonHTMLAttributes, ReactNode } from 'react'

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-[20px] border border-line bg-card p-4 ${className}`}>{children}</div>
}

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'ghost' | 'danger' }
export function Button({ variant = 'primary', className = '', ...rest }: BtnProps) {
  const v =
    variant === 'primary'
      ? 'bg-g-ink text-white'
      : variant === 'ghost'
        ? 'bg-g-soft text-g-soft-ink'
        : 'bg-card text-over-ink border border-line'
  return (
    <button
      type="button"
      className={`w-full rounded-2xl p-4 text-center text-[17px] font-bold disabled:opacity-50 ${v} ${className}`}
      {...rest}
    />
  )
}

export function Chip({ on, className = '', ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { on?: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      className={`rounded-full border px-3.5 py-2.5 text-[15px] font-semibold ${
        on ? 'border-g-ink bg-g-ink text-white' : 'border-line bg-card text-ink'
      } ${className}`}
      {...rest}
    />
  )
}

export function Dots({ step, total }: { step: number; total: number }) {
  return (
    <div className="flex justify-center gap-1.5" aria-label={`Step ${step + 1} of ${total}`} role="img">
      {Array.from({ length: total }, (_, i) => (
        <i key={i} className={`h-2 rounded-full ${i === step ? 'w-6 bg-g' : 'w-2 bg-line'}`} />
      ))}
    </div>
  )
}

export function Illustrative({ className = '' }: { className?: string }) {
  return <p className={`text-center text-xs text-mute ${className}`}>Illustrative data. Values are approximate.</p>
}
