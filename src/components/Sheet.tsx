import { useEffect, useRef, type ReactNode } from 'react'

export function Sheet({ label, onClose, children }: { label: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null
    const first = ref.current?.querySelector<HTMLElement>('[data-autofocus]') ?? ref.current
    first?.focus({ preventScroll: true })
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'Tab' && ref.current) {
        const f = ref.current.querySelectorAll<HTMLElement>('button, input, select, [tabindex]:not([tabindex="-1"])')
        if (!f.length) return
        const a = f[0], b = f[f.length - 1]
        if (e.shiftKey && document.activeElement === a) { e.preventDefault(); b.focus() }
        else if (!e.shiftKey && document.activeElement === b) { e.preventDefault(); a.focus() }
      }
    }
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('keydown', onKey); prev?.focus?.() }
  }, [onClose])
  return (
    <div className="absolute inset-0 z-30">
      <div className="anim-fade absolute inset-0 bg-[rgba(42,36,32,.42)]" onClick={onClose} aria-hidden="true" />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        className="anim-sheet absolute inset-x-0 bottom-0 flex max-h-[92%] flex-col gap-4 overflow-y-auto rounded-t-[28px] bg-card px-5 pb-safe-sheet pt-3.5"
      >
        <div className="mx-auto h-[5px] w-10 shrink-0 rounded-full bg-line" />
        {children}
      </div>
    </div>
  )
}

/** Whole steps above 1, half steps below (0.5 minimum). */
export function Stepper({ value, onChange, label, min = 0.5 }: { value: number; onChange: (n: number) => void; label: string; min?: number }) {
  const inc = () => onChange(value < 1 ? value + 0.5 : value + 1)
  const dec = () => onChange(Math.max(min, value <= 1 ? 0.5 : value - 1))
  const btn = 'grid h-12 w-12 place-items-center rounded-xl border border-line bg-card text-2xl font-bold disabled:opacity-40'
  return (
    <div className="flex items-center justify-between rounded-2xl bg-bg p-2">
      <button type="button" className={btn} aria-label="Decrease amount" disabled={value <= min} onClick={dec}>−</button>
      <b className="text-[22px]" aria-live="polite" data-testid="qty">{label}</b>
      <button type="button" className={btn} aria-label="Increase amount" onClick={inc}>+</button>
    </div>
  )
}
