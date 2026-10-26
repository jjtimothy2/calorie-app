import { useEffect, useLayoutEffect, useRef, type FocusEvent, type ReactNode } from 'react'

const FIELD = 'input:not([type=checkbox]):not([type=radio]):not([type=file]), textarea, select'

/**
 * Bottom sheet. v1.5.2: the focus effect runs once on mount. It used to depend on onClose, and parents pass an inline
 * onClose, so any parent re-render (Log re-renders when the iOS keyboard opens) tore it down and re-ran it: focus
 * jumped back to the sheet, the field blurred and the keyboard closed again ("the note field only nudges").
 * Also follows the on-screen keyboard (visualViewport) so the focused field and the button under it stay visible.
 * v1.6.4: the keyboard offset is written straight to the sheet (CSS `translate`, rAF-throttled, a short eased transition)
 * instead of React state + `bottom`, so the sheet glides with the keyboard edge with no re-render or layout jump.
 * v1.7: the first focus is a layout effect, so a sheet opened from a tap focuses its field inside that same tap (iOS only
 * raises the keyboard for a focus in the user gesture; "Type it" relies on this).
 */
export function Sheet({ label, onClose, children }: { label: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const close = useRef(onClose)
  close.current = onClose
  useLayoutEffect(() => {
    const prev = document.activeElement as HTMLElement | null
    const first = ref.current?.querySelector<HTMLElement>('[data-autofocus]') ?? ref.current
    first?.focus({ preventScroll: true })
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close.current()
      if (e.key === 'Tab' && ref.current) {
        const f = ref.current.querySelectorAll<HTMLElement>('button, input, select, textarea, a[href], [tabindex]:not([tabindex="-1"])')
        if (!f.length) return
        const a = f[0], b = f[f.length - 1]
        if (e.shiftKey && document.activeElement === a) { e.preventDefault(); b.focus() }
        else if (!e.shiftKey && document.activeElement === b) { e.preventDefault(); a.focus() }
      }
    }
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('keydown', onKey); if (prev?.isConnected) prev.focus?.({ preventScroll: true }) }
  }, [])
  // Keyboard height = the part of the layout viewport the visual viewport no longer shows at the bottom. Whenever the
  // visual viewport changes with a field focused, keep that field (and the sheet's main button, if marked) in view.
  useEffect(() => {
    const vv = window.visualViewport
    const el = ref.current
    if (!vv || !el) return
    let t = 0, raf = 0, last = 0
    const apply = () => {
      raf = 0
      const kb = Math.max(0, Math.round(document.documentElement.clientHeight - vv.height - vv.offsetTop))
      if (kb === last) return
      last = kb
      el.style.translate = kb ? `0 ${-kb}px` : ''
      el.style.maxHeight = kb ? `${Math.round(vv.height - 12)}px` : ''
      el.dataset.kb = String(kb)
      if (kb) el.dataset.keyboard = 'open'
      else delete el.dataset.keyboard
    }
    const update = () => {
      if (!raf) raf = requestAnimationFrame(apply)
      clearTimeout(t)
      t = window.setTimeout(() => {
        const a = document.activeElement as HTMLElement | null
        if (!a || !ref.current?.contains(a) || !a.matches(FIELD)) return
        ref.current.querySelector<HTMLElement>('[data-keep-visible]')?.scrollIntoView({ block: 'nearest' })
        a.scrollIntoView({ block: 'nearest' })
      }, 80)
    }
    update()
    vv.addEventListener('resize', update)
    vv.addEventListener('scroll', update)
    return () => { clearTimeout(t); cancelAnimationFrame(raf); vv.removeEventListener('resize', update); vv.removeEventListener('scroll', update) }
  }, [])
  const onFocus = (e: FocusEvent<HTMLDivElement>) => {
    const el = e.target as HTMLElement
    if (el.matches(FIELD)) setTimeout(() => { if (document.activeElement === el) el.scrollIntoView({ block: 'nearest' }) }, 300)
  }
  return (
    <div className="absolute inset-0 z-30">
      <div className="anim-fade absolute inset-0 bg-[rgba(42,36,32,.42)]" onClick={() => close.current()} aria-hidden="true" />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        onFocus={onFocus}
        className="anim-sheet sheet-kb absolute inset-x-0 bottom-0 flex max-h-[92%] flex-col gap-4 overflow-y-auto overscroll-contain rounded-t-[28px] bg-card px-5 pb-safe-sheet pt-3.5"
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
