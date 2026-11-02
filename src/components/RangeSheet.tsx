// v1.18 History custom range: "Pick dates" sheet with quick picks (This month, Last month, 90 days), From and To
// native date pickers (16 px+, no autofocus), "Show these dates" and Cancel. To is at most today, From at least the
// first logged day. To before From shows an inline error and disables the button.
import { useId, useState } from 'react'
import { addDays } from '../lib/calc'
import { Sheet } from './Sheet'
import { Button, Chip } from './ui'

export type DateRange = { from: string; to: string }

const pad = (n: number) => String(n).padStart(2, '0')
const parse = (k: string) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d) }
const key = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] // v1.19: never 'Sept'
const short = (k: string) => { const d = parse(k); return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}` }

/** Quick picks, clamped to the first logged day. A pick that ends before it is off. */
export function quickPicks(today: string, first: string): (DateRange & { id: string; label: string; off: boolean })[] {
  const t = parse(today)
  const clamp = (r: DateRange) => ({ from: r.from < first ? first : r.from, to: r.to, off: r.to < first })
  return [
    { id: 'month', label: 'This month', ...clamp({ from: key(new Date(t.getFullYear(), t.getMonth(), 1)), to: today }) },
    { id: 'last', label: 'Last month', ...clamp({ from: key(new Date(t.getFullYear(), t.getMonth() - 1, 1)), to: key(new Date(t.getFullYear(), t.getMonth(), 0)) }) },
    { id: '90', label: '90 days', ...clamp({ from: addDays(today, -89), to: today }) },
  ]
}

export function RangeSheet({ initial, first, today, onApply, onClose }: {
  initial: DateRange; first: string; today: string; onApply: (r: DateRange) => void; onClose: () => void
}) {
  const [from, setFrom] = useState(initial.from)
  const [to, setTo] = useState(initial.to)
  const errId = useId()
  const picks = quickPicks(today, first)
  const backwards = !!from && !!to && to < from
  const outside = !backwards && ((!!from && from < first) || (!!to && to > today))
  const ok = !!from && !!to && !backwards && !outside
  const row = 'flex min-h-[60px] items-center justify-between gap-3 rounded-[22px] border border-line bg-card py-2 pl-5 pr-3 text-[17px] font-bold'
  const field = 'h-11 min-w-0 rounded-xl border bg-bg px-3 text-[17px] font-normal'
  return (
    <Sheet label="Pick dates" onClose={onClose}>
      <form className="flex flex-col gap-4" data-testid="range-sheet" onSubmit={(e) => { e.preventDefault(); e.stopPropagation(); if (ok) onApply({ from, to }) }}>
        <h2 className="title text-[26px]">Pick dates</h2>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Quick picks">
          {picks.map((p) => (
            <Chip key={p.id} on={!p.off && p.from === from && p.to === to} disabled={p.off} className="disabled:opacity-40" data-testid={`pick-${p.id}`}
              onClick={() => { setFrom(p.from); setTo(p.to) }}>{p.label}</Chip>
          ))}
        </div>
        <label className={row}>
          From
          <input type="date" min={first} max={today} value={from} onChange={(e) => setFrom(e.target.value)} data-testid="range-from"
            aria-invalid={backwards || (outside && from < first) || undefined} aria-describedby={backwards || outside ? errId : undefined}
            className={`${field} ${outside && from < first ? 'border-danger' : 'border-line'}`} />
        </label>
        <label className={row}>
          To
          <input type="date" min={first} max={today} value={to} onChange={(e) => setTo(e.target.value)} data-testid="range-to"
            aria-invalid={backwards || (outside && to > today) || undefined} aria-describedby={backwards || outside ? errId : undefined}
            className={`${field} ${backwards || (outside && to > today) ? 'border-danger' : 'border-line'}`} />
        </label>
        {(backwards || outside) && (
          <p id={errId} role="alert" className="-mt-2 px-2 text-[14px] text-danger" data-testid="range-err">
            {backwards ? 'End date is before start date' : `Pick dates from ${short(first)} to today`}
          </p>
        )}
        <div className="flex flex-col gap-2" data-keep-visible>
          <Button type="submit" disabled={!ok} data-testid="range-apply">Show these dates</Button>
          <Button variant="danger" className="!text-ink" onClick={onClose} data-testid="range-cancel">Cancel</Button>
        </div>
      </form>
    </Sheet>
  )
}
