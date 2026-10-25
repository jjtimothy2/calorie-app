import { useCallback, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Sheet } from './Sheet'
import { Button } from './ui'

/**
 * v1.3.2: a small (?) next to a setting's label. Tapping it opens a bottom sheet with the explanation, so the Me page
 * reads as a clean list. The sheet traps focus, closes on Escape, the backdrop or Close, and gives focus back to the (?).
 */
export function Info({ title, id, children }: { title: string; id: string; children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const close = useCallback(() => setOpen(false), [])
  const host = typeof document !== 'undefined' ? document.getElementById('app-frame') ?? document.body : null
  return (
    <>
      <button
        type="button"
        aria-label={`About ${title.toLowerCase()}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        data-testid={`info-${id}`}
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen(true) }}
        className="ml-1.5 inline-grid h-[22px] w-[22px] shrink-0 place-items-center rounded-full border border-line bg-bg align-[1px] text-[13px] font-bold leading-none text-mute"
      >
        ?
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
