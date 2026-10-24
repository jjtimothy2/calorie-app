import type { ReactNode } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useFirstVisit } from './motion'

/**
 * Phone or installed app: full-bleed. Desktop browser tab (framed): a 390x844 phone frame, as in the mockup.
 * v1.1: pinned with fixed inset-0 instead of h-dvh. iOS (Safari and standalone) can report a dvh taller than what
 * is visible, which pushed the tab bar and the + button under the toolbar or home indicator.
 */
export function PhoneFrame({ children }: { children: ReactNode }) {
  return (
    <div className="fixed inset-0 flex justify-center framed:items-center framed:py-6" data-testid="frame">
      <div className="relative flex h-full w-full flex-col overflow-hidden bg-bg framed:h-[844px] framed:max-h-full framed:w-[390px] framed:rounded-[44px] framed:shadow-[0_20px_50px_rgba(0,0,0,.18)]">
        {children}
      </div>
    </div>
  )
}

/** v1.3: every screen crossfades in with a slight slide; its cards rise in, 60 ms apart, on the first visit only. */
export function Screen({ children, className = '', stagger = true }: { children: ReactNode; className?: string; stagger?: boolean }) {
  const first = useFirstVisit(useLocation().pathname)
  return <main className={`page-in flex flex-1 flex-col gap-3.5 overflow-y-auto px-5 pb-5 ${first && stagger ? 'stagger' : ''} ${className}`}>{children}</main>
}

/** Small-caps date line over a Fraunces screen title. */
export function Title({ eyebrow, children, id }: { eyebrow?: ReactNode; children: ReactNode; id?: string }) {
  return (
    <div>
      {eyebrow && <div className="eyebrow">{eyebrow}</div>}
      <h1 className="title text-[32px] leading-tight" id={id}>{children}</h1>
    </div>
  )
}

function Ico({ d }: { d: string }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  )
}

export function TabBar() {
  const nav = useNavigate()
  const tab = ({ isActive }: { isActive: boolean }) =>
    `tap flex min-w-[60px] flex-col items-center gap-1 px-1 py-1 ${isActive ? 'font-bold text-ink' : 'text-mute'}`
  return (
    // The + sits in the bar's own row (lifted 20px over the content above) and the bar pads the home indicator
    // with env(safe-area-inset-bottom), so the button never reaches into the safe area or gets clipped.
    <nav aria-label="Main" className="pb-safe-bar relative z-10 flex shrink-0 items-center justify-around border-t border-line bg-card px-1 pt-2 text-xs">
      <NavLink to="/" end className={tab}>
        <Ico d="M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z" />
        Today
      </NavLink>
      <NavLink to="/nutrition" className={tab}>
        <Ico d="M12 21a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM12 5V2M12 13l3-3" />
        Nutrition
      </NavLink>
      <button
        type="button"
        aria-label="Log food"
        onClick={() => nav('/log')}
        data-testid="plus"
        className="fab -mt-6 grid h-[60px] w-[60px] shrink-0 place-items-center rounded-full bg-ink text-bg shadow-[0_8px_20px_rgba(42,36,32,.28)]"
      >
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
      </button>
      <NavLink to="/history" className={tab}>
        <Ico d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
        History
      </NavLink>
      <NavLink to="/settings" className={tab}>
        <Ico d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0" />
        Me
      </NavLink>
    </nav>
  )
}
