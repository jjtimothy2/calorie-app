import type { ReactNode } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'

/** Phone or installed app: full-bleed. Desktop browser tab (framed): a 390x844 phone frame, as in the mockup. */
export function PhoneFrame({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-dvh justify-center framed:items-center framed:py-6">
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
    <nav aria-label="Main" className="pb-safe-bar flex min-h-[78px] shrink-0 items-center justify-around border-t border-line bg-card px-1 pt-2 text-xs">
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
        className="-mt-6 grid h-14 w-14 shrink-0 place-items-center rounded-full bg-g-ink text-3xl text-white shadow-[0_6px_16px_rgba(31,157,85,.4)]"
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
