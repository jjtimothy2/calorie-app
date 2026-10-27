// v1.12: past days. A note on Home and Log while a past day is picked, so today's food never goes to yesterday by
// accident, and the ‹ › day switcher on Home.
import { useRef } from 'react'
import { useStore } from '../lib/store'
import { addDays, dayName, keyDate } from '../lib/calc'

const longDate = (d: string) => keyDate(d).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' })

/** Amber note: which past day is being edited, with Back to today. Renders nothing on today. */
export function PastDayNote({ compact = false }: { compact?: boolean }) {
  const { logDate, today, setLogDate } = useStore()
  if (logDate >= today) return null
  const name = dayName(logDate, today)
  return (
    <div role="note" data-testid="past-day-note" className="flex items-center gap-3 rounded-2xl bg-carbs-soft py-2 pl-4 pr-2 text-[15px] text-carbs-ink">
      <span className="min-w-0 flex-1 leading-snug">
        <b className="font-bold">{compact ? `Adding to ${name}` : `Editing ${name}`}</b>
        {name === 'Yesterday' ? `, ${longDate(logDate)}` : ''}.
        {!compact && <span className="block text-[13px]">Anything you add or change goes to this day.</span>}
      </span>
      <button type="button" onClick={() => setLogDate(today)} data-testid="back-to-today" className="tap min-h-11 shrink-0 rounded-full bg-card px-3.5 text-[15px] font-bold text-carbs-ink">
        Back to today
      </button>
    </div>
  )
}

const Chevron = ({ left }: { left?: boolean }) => (
  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={left ? 'm14.5 6-6 6 6 6' : 'm9.5 6 6 6-6 6'} />
  </svg>
)

/** ‹ › buttons: previous day, next day (none past today). */
export function DaySwitcher() {
  const { logDate, today, setLogDate } = useStore()
  const prev = addDays(logDate, -1), next = addDays(logDate, 1)
  const prevRef = useRef<HTMLButtonElement>(null)
  // Reaching today disables Next, so keep keyboard focus on the switcher instead of losing it.
  const goNext = () => { setLogDate(next); if (next >= today) prevRef.current?.focus() }
  const btn = 'tap grid h-11 w-11 place-items-center rounded-full border border-line bg-card text-ink disabled:opacity-40 disabled:cursor-default'
  return (
    <div className="flex items-center gap-1.5" role="group" aria-label="Choose day" data-testid="day-switcher">
      <button ref={prevRef} type="button" className={btn} onClick={() => setLogDate(prev)} aria-label={`Previous day, ${dayName(prev, today)}`} data-testid="day-prev"><Chevron left /></button>
      <button type="button" className={btn} onClick={goNext} disabled={logDate >= today} aria-label={logDate >= today ? 'Next day, not available' : `Next day, ${dayName(next, today)}`} data-testid="day-next"><Chevron /></button>
      <span className="sr-only" aria-live="polite">{logDate < today ? `Showing ${dayName(logDate, today)}` : 'Showing today'}</span>
    </div>
  )
}
