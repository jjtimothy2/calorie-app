import type { ReactNode } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'

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

export function Screen({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <main className={`flex flex-1 flex-col gap-3.5 overflow-y-auto px-5 pb-5 ${className}`}>{children}</main>
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
    `flex min-w-[60px] flex-col items-center gap-1 px-1 py-1 ${isActive ? 'font-bold text-g-ink' : 'text-mute'}`
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
        className="-mt-5 grid h-14 w-14 shrink-0 place-items-center rounded-full bg-g-ink text-3xl text-white shadow-[0_6px_16px_rgba(31,157,85,.4)]"
      >
        +
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
