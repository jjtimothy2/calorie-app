import { useEffect, useId, useLayoutEffect, useRef, useState, type FocusEvent, type ReactNode } from 'react'

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
 * v1.13.4: swipe down to close, like an iOS sheet. Before this the handle was only a picture: a sheet whose content
 * fits does not scroll, so its overscroll-behavior did nothing and iOS handed the pan to the page, which rubber-banded
 * the whole app (sheet, backdrop and screen) with the finger. Now a downward drag from the handle, or from the content
 * when it is scrolled to the top, moves the sheet with the finger and fades the backdrop; letting go past 30% of its
 * height or with a flick closes it, anything less springs back. Content scrolled down scrolls first and the drag picks
 * up once it reaches the top. Fields, the meal pills and picker, steppers and swipe rows ([data-no-drag]) never start
 * a drag. Touch moves the sheet owns are cancelled, so nothing behind it moves. Reduced motion: no slides.
 */
export function Sheet({ label, onClose, children }: { label: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const shade = useRef<HTMLDivElement>(null)
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
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches
    // mode: null = undecided, 'drag' = the sheet follows the finger, 'off' = not ours (sideways, a field, a swipe row).
    let g: { mode: null | 'drag' | 'off'; handle: boolean; scrolled: boolean; x0: number; y0: number; y: number; top: number; off: number; samples: [number, number][] } | null = null
    let closing = false
    const set = (off: number) => {
      el.style.transform = off ? `translateY(${off}px)` : ''
      if (shade.current) shade.current.style.opacity = off ? String(Math.max(0, 1 - off / el.offsetHeight)) : ''
    }
    const start = (e: TouchEvent) => {
      if (closing || e.touches.length !== 1) { g = null; return }
      const t = e.touches[0], target = e.target as Element
      const off = !!target.closest?.('input, textarea, select, [contenteditable], [data-no-drag]')
      g = { mode: off ? 'off' : null, scrolled: false, handle: !!target.closest?.('[data-sheet-handle]'), x0: t.clientX, y0: t.clientY, y: t.clientY, top: 0, off: 0, samples: [[t.clientY, e.timeStamp]] }
    }
    const move = (e: TouchEvent) => {
      if (!g || g.mode === 'off') return
      const t = e.touches[0], dy = t.clientY - g.y
      g.y = t.clientY
      g.samples.push([t.clientY, e.timeStamp]); if (g.samples.length > 5) g.samples.shift()
      if (g.mode === null) {
        const ax = Math.abs(t.clientX - g.x0), ay = Math.abs(t.clientY - g.y0)
        if (ax > 8 && ax > ay) { g.mode = 'off'; return }
        // Down at the top (or on the handle) starts the drag, from where the finger went down (or, after the content
        // scrolled back to the top, from here); otherwise let the content scroll.
        if (dy > 0 && (g.handle || el.scrollTop <= 0)) {
          g.mode = 'drag'; g.top = g.scrolled ? t.clientY : g.y0
          el.dataset.drag = ''
        } else {
          // Nothing to scroll that way: cancel it so iOS does not rubber-band the page behind.
          const max = el.scrollHeight - el.clientHeight
          if ((dy < 0 && el.scrollTop >= max - 1) || (dy > 0 && el.scrollTop <= 0)) e.preventDefault()
          else g.scrolled = true
          return
        }
      }
      e.preventDefault()
      g.off = Math.max(0, t.clientY - g.top)
      set(g.off)
    }
    const end = (e: TouchEvent) => {
      if (!g || g.mode !== 'drag') { g = null; return }
      const s = g.samples, [y1, t1] = s[0], [y2, t2] = s[s.length - 1]
      // px per ms, + is down; a finger that stopped (over 100 ms still) before lifting is not a flick
      const v = t2 > t1 && e.timeStamp - t2 < 100 ? (y2 - y1) / (t2 - t1) : 0
      const h = el.offsetHeight, off = g.off
      g = null
      delete el.dataset.drag
      if (off > h * 0.3 || (v > 0.5 && off > 24)) {
        closing = true
        if (reduced()) { close.current(); return }
        set(h)
        let done = false
        const fin = () => { if (!done) { done = true; close.current() } }
        el.addEventListener('transitionend', fin, { once: true })
        setTimeout(fin, 260)
      } else set(0)
    }
    el.addEventListener('touchstart', start, { passive: true })
    el.addEventListener('touchmove', move, { passive: false })
    el.addEventListener('touchend', end)
    el.addEventListener('touchcancel', end)
    return () => {
      el.removeEventListener('touchstart', start)
      el.removeEventListener('touchmove', move)
      el.removeEventListener('touchend', end)
      el.removeEventListener('touchcancel', end)
    }
  }, [])
  const onFocus = (e: FocusEvent<HTMLDivElement>) => {
    const el = e.target as HTMLElement
    if (el.matches(FIELD)) setTimeout(() => { if (document.activeElement === el) el.scrollIntoView({ block: 'nearest' }) }, 300)
  }
  return (
    <div className="absolute inset-0 z-30">
      <div ref={shade} className="anim-fade sheet-shade absolute inset-0 bg-[rgba(42,36,32,.42)]" onClick={() => close.current()} aria-hidden="true" />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        onFocus={onFocus}
        className="anim-sheet sheet-kb absolute inset-x-0 bottom-0 flex max-h-[92%] flex-col gap-4 overflow-y-auto overscroll-none rounded-t-[28px] bg-card px-5 pb-safe-sheet pt-3.5"
        data-testid="sheet"
      >
        {/* The bar is 5 px; the grab area around it reaches the top edge and the gap below without moving the layout. */}
        <div className="relative mx-auto h-[5px] w-10 shrink-0 rounded-full bg-line" data-sheet-handle>
          <span className="absolute -inset-x-16 -top-3.5 -bottom-4" aria-hidden="true" />
        </div>
        {children}
      </div>
    </div>
  )
}

/** v1.10.1: a typed amount like "1.5", "0.75" or "1,5". Above 0, at most 99, rounded to 2 decimals. */
export const MAX_QTY = 99
export function parseQty(raw: string): number | null {
  const t = raw.trim().replace(',', '.')
  if (!/^(\d+\.?\d*|\.\d+)$/.test(t)) return null
  const n = Math.round(Number(t) * 100) / 100
  return n > 0 && n <= MAX_QTY ? n : null
}
const qtyText = (n: number) => String(Math.round(n * 100) / 100)

/**
 * Whole steps above 1, half steps below (0.5 minimum for the minus button). v1.10.1: tap the amount to type any
 * amount on the decimal keypad, e.g. 1.5 or 0.75. `unit` is one serving, shown beside the typed number.
 */
type StepperProps = {
  value: number; onChange: (n: number) => void; label: string; unit?: string; min?: number; title?: string
  /** v1.14.1: the small row stepper on the AI result sheet (32 px buttons, the number between; v1.14.2: 44 px hit areas). */
  compact?: boolean
  /** v1.14.1: per-row names for screen readers, e.g. "Less Nasi putih" / "More Nasi putih". */
  decLabel?: string; incLabel?: string; inputLabel?: string; numberLabel?: string
}
export function Stepper({ value, onChange, label, unit, min = 0.5, title, compact, decLabel = 'Decrease amount', incLabel = 'Increase amount', inputLabel = 'Servings', numberLabel }: StepperProps) {
  const [typing, setTyping] = useState(false)
  const [text, setText] = useState('')
  const input = useRef<HTMLInputElement>(null)
  const errId = useId()
  const inc = () => onChange(Math.min(MAX_QTY, value < 1 ? Math.min(1, Math.floor(value * 2 + 1e-9) / 2 + 0.5) : Math.floor(value + 1e-9) + 1))
  const dec = () => onChange(Math.max(min, value <= 1 ? 0.5 : Math.ceil(value - 1e-9) - 1))
  const typed = parseQty(text)
  // v1.14: empty counts as invalid too (0, empty, text or over 99); the last valid amount stays until a valid one is typed.
  const bad = typing && typed === null
  const open = () => { setText(qtyText(value)); setTyping(true) }
  useEffect(() => { if (typing) { input.current?.focus(); input.current?.select() } }, [typing])
  const done = () => { if (typed !== null) onChange(typed); setTyping(false) }
  const field = (cls: string) => (
    <input
      ref={input}
      type="text"
      inputMode="decimal"
      enterKeyHint="done"
      autoComplete="off"
      aria-label={inputLabel}
      aria-invalid={bad || undefined}
      aria-describedby={bad ? errId : undefined}
      value={text}
      onChange={(e) => { setText(e.target.value); const n = parseQty(e.target.value); if (n !== null) onChange(n) }}
      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); done() } }}
      onBlur={done}
      data-testid="qty-input"
      className={`${cls} rounded-xl border-2 bg-card text-center font-bold ${bad ? 'border-danger' : 'border-ink'}`}
    />
  )
  const err = (cls: string) => bad && <p id={errId} role="alert" className={`${cls} text-danger`} data-testid="qty-err">Enter an amount above 0, like 1.5 or 0.75.</p>
  if (compact) {
    // v1.14.1: sits at the end of a wrapping row; the error drops onto its own full-width line under the row.
    // v1.14.2: each target is 44x44 without changing the look: a ::before hit area reaches 6 px above and below,
    // and − / + reach 10 px outward (into the box padding and the row gap) and 2 px inward, half the 4 px gap, where
    // the number's area (2 px wider each side) meets them edge to edge without overlapping. While typing,
    // a label around the field carries the same area (a tap on its edge keeps the field open and focused).
    const hitY = 'relative before:absolute before:-top-1.5 before:-bottom-1.5'
    // − / + have a 1 px border and ::before is placed from the padding box, so their offsets are 1 px larger.
    const sb = `relative before:absolute before:-top-[7px] before:-bottom-[7px] grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-line bg-card text-xl font-bold disabled:opacity-40`
    return (
      <div className="contents" data-no-drag>
        <div className="flex shrink-0 items-center gap-1 rounded-xl bg-bg p-1" data-no-drag data-testid="row-stepper">
          <button type="button" className={`${sb} before:-left-[11px] before:-right-[3px]`} aria-label={decLabel} disabled={value <= min} onMouseDown={(e) => typing && e.preventDefault()} onClick={() => { setTyping(false); dec() }} data-testid="qty-dec">−</button>
          {typing
            ? <label className={`${hitY} flex before:-inset-x-0.5`} onMouseDown={(e) => e.target !== input.current && e.preventDefault()} data-testid="qty-hit">{field('h-8 w-[52px] px-1 text-[16px]')}</label>
            : (
              <button type="button" onClick={open} className={`tap ${hitY} h-8 min-w-[52px] rounded-lg px-1 text-[16px] font-bold before:-inset-x-0.5`} aria-label={`${numberLabel ?? label}. Tap to type an amount`} data-testid="qty-edit">
                <b aria-live="polite" data-testid="qty">{label}</b>
              </button>
            )}
          <button type="button" className={`${sb} before:-left-[3px] before:-right-[11px]`} aria-label={incLabel} onMouseDown={(e) => typing && e.preventDefault()} onClick={() => { setTyping(false); inc() }} data-testid="qty-inc">+</button>
        </div>
        {err('basis-full text-right text-[13px] leading-snug')}
      </div>
    )
  }
  const btn = 'grid h-12 w-12 shrink-0 place-items-center rounded-xl border border-line bg-card text-2xl font-bold disabled:opacity-40'
  return (
    <div className="flex flex-col gap-1" data-no-drag>
      {/* Edit sheets: a "Servings" heading, so the amount reads as something you can change. */}
      {title && (
        <div className="flex items-baseline justify-between gap-3 px-1">
          <span className="text-[15px] font-semibold">{title}</span>
          <span className="text-[13px] text-mute">Tap the number to type</span>
        </div>
      )}
      <div className="flex items-center justify-between gap-2 rounded-2xl bg-bg p-2">
        <button type="button" className={btn} aria-label={decLabel} disabled={value <= min} onMouseDown={(e) => typing && e.preventDefault()} onClick={() => { setTyping(false); dec() }}>−</button>
        {typing ? (
          <span className="flex min-w-0 flex-1 items-center justify-center gap-2">
            {field('h-12 w-[84px] px-2 text-[22px]')}
            {unit && <span className="min-w-0 truncate text-[15px] font-semibold text-mute">× {unit}</span>}
          </span>
        ) : (
          <button type="button" onClick={open} className="tap min-h-12 min-w-0 flex-1 rounded-xl px-2 text-[22px] font-bold" aria-label={`${numberLabel ?? label}. Tap to type an amount`} data-testid="qty-edit">
            <b aria-live="polite" data-testid="qty">{label}</b>
          </button>
        )}
        <button type="button" className={btn} aria-label={incLabel} onMouseDown={(e) => typing && e.preventDefault()} onClick={() => { setTyping(false); inc() }}>+</button>
      </div>
      {err('px-2 text-[14px]')}
    </div>
  )
}
