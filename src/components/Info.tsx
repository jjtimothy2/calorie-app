import { useCallback, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Sheet } from './Sheet'
import { Button } from './ui'

/**
 * v1.3.2: a small info button next to a setting's label (v1.3.3: a circled "i", 20px visible inside a 44px tap area). Tapping it opens a bottom sheet with the explanation, so the Me page
 * reads as a clean list. The sheet traps focus, closes on Escape, the backdrop or Close, and gives focus back to the button.
 */
export function Info({ title, id, children }: { title: string; id: string; children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const close = useCallback(() => setOpen(false), [])
  const host = typeof document !== 'undefined' ? document.getElementById('app-frame') ?? document.body : null
  return (
    <>
      <button
        type="button"
        aria-label={`About ${/^[A-Z]{2,}/.test(title) ? title : title.toLowerCase()}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        data-testid={`info-${id}`}
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen(true) }}
        className="-my-3 -mr-3 ml-[-6px] inline-grid h-11 w-11 shrink-0 place-items-center rounded-full text-mute transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-[-6px] focus-visible:outline-g-ink"
      >
        <svg aria-hidden="true" width="20" height="20" viewBox="0 0 20 20" fill="none" data-icon="info">
          <circle cx="10" cy="10" r="8.6" stroke="currentColor" strokeWidth="1.5" />
          <circle cx="10" cy="6.3" r="1.15" fill="currentColor" />
          <path d="M10 9.2v5.3" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
        </svg>
      </button>
      {open && host && createPortal(
        <Sheet label={title} onClose={close}>
          <h2 className="title text-[22px]">{title}</h2>
          <div className="flex flex-col gap-2.5 text-[16px] leading-relaxed text-ink" data-testid={`info-sheet-${id}`}>{children}</div>
          <Button data-autofocus onClick={close}>Close</Button>
        </Sheet>,
        host,
      )}
    </>
  )
}
