// v1.5: AI photo estimate sheets (ported from Reed's mock). Photo + note -> estimate -> adjust -> log.
// The photo is a downscaled data URL held in React state only; nothing here is saved except the logged entries.
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { FOODS } from '../data/foods'
import { foodEmoji } from '../data/foodEmoji'
import {
  AiError, MODELS, PROVIDER_LABEL, errorText, estimatePhoto, gramStep, itemMacros, noteHas, portionLabel, toPhotoItems, toggleNoteChip,
  type AiErrorKind, type AiSettings, type PhotoItem, type PhotoMacros,
} from '../lib/ai'
import { fmt } from '../lib/calc'
import { Sheet } from './Sheet'
import { Button, Chip } from './ui'

export const NOTE_CHIPS = ['Shared', 'Half eaten', 'Extra sambal', 'Santan', 'No rice']
const FOOD_NAMES = FOODS.map((f) => f.name)
const sb = 'grid h-8 w-8 place-items-center rounded-lg border border-line bg-card text-xl font-bold disabled:opacity-40'
const ghost = '!w-auto shrink-0 border border-line !bg-card px-5 !text-ink'

const MACROS = [
  { k: 'protein', letter: 'P', word: 'protein', ink: 'text-protein-ink', pill: 'bg-protein-soft text-protein-ink' },
  { k: 'carbs', letter: 'C', word: 'carbs', ink: 'text-carbs-ink', pill: 'bg-carbs-soft text-carbs-ink' },
  { k: 'fat', letter: 'F', word: 'fat', ink: 'text-fat-ink', pill: 'bg-fat-soft text-fat-ink' },
] as const

/** v1.5.1: "1 cup cooked · 4P 42C 0F" on one line. If it would wrap, the portion is dropped first (text never shrinks). */
function MacroLine({ portion, m }: { portion: string; m: PhotoMacros }) {
  const ref = useRef<HTMLSpanElement>(null)
  const [fits, setFits] = useState(true)
  const text = `${portion}|${MACROS.map((x) => fmt(m[x.k])).join(',')}`
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const check = () => {
      el.dataset.measure = '1' // show the portion while measuring
      const over = el.scrollWidth > el.clientWidth + 0.5
      delete el.dataset.measure
      setFits(!over)
    }
    check()
    const ro = new ResizeObserver(check)
    ro.observe(el)
    return () => ro.disconnect()
  }, [text])
  return (
    <span ref={ref} className="group block overflow-hidden whitespace-nowrap text-[15px] font-semibold" data-testid="item-macros">
      {portion && (
        <span className={`text-mute group-data-[measure]:!inline ${fits ? '' : 'hidden'}`} data-testid="item-portion">
          {portion}<span aria-hidden="true"> · </span><span className="sr-only">, </span>
        </span>
      )}
      {MACROS.map((x, i) => (
        <span key={x.k} className={x.ink} data-testid={`item-${x.k}`}>
          {i > 0 && ' '}
          <span aria-hidden="true">{fmt(m[x.k])}{x.letter}</span>
          <span className="sr-only">{`${fmt(m[x.k])} g ${x.word}${i < 2 ? ',' : ''}`}</span>
        </span>
      ))}
    </span>
  )
}

export function CameraIcon({ className = 'h-7 w-7' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 8h3l1.6-2.4A1 1 0 0 1 9.4 5h5.2a1 1 0 0 1 .8.6L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z" />
      <circle cx="12" cy="13" r="3.5" />
    </svg>
  )
}

/** Tapped the camera with no key saved yet. */
export function NoKeySheet({ onClose, onSetup }: { onClose: () => void; onSetup: () => void }) {
  return (
    <Sheet label="Set up photo estimates" onClose={onClose}>
      <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-bg text-ink"><CameraIcon className="h-8 w-8" /></div>
      <h2 className="title text-center text-[26px] leading-tight">Estimate from a photo</h2>
      <p className="text-center text-[16px] leading-snug text-mute">
        Snap your plate and an AI lists what’s on it with rough calories, protein, carbs and fat. You check the amounts, then log.
      </p>
      <ul className="flex flex-col gap-2 rounded-xl bg-bg px-4 py-3 text-[15px] leading-snug">
        <li>🔑 Uses your own Gemini or OpenAI API key. A free Gemini key from Google AI Studio works.</li>
        <li>📱 The key stays on this phone and is never in backups.</li>
        <li>🖼️ Photos go straight to the AI and are never saved.</li>
      </ul>
      <Button data-autofocus onClick={onSetup}>Add a key in Me</Button>
      <Button variant="ghost" className="-mt-2 !bg-transparent" onClick={onClose}>Not now</Button>
    </Sheet>
  )
}

type Phase = { k: 'note' } | { k: 'loading' } | { k: 'results'; dish: string; items: PhotoItem[] } | { k: 'error'; kind: AiErrorKind }
export type LogItem = { item: PhotoItem; grams: number }

type Props = {
  settings: AiSettings
  photo: string
  onRetake: () => void
  onClose: () => void
  onQuickAdd: () => void
  onFixKey: () => void
  onLog: (rows: LogItem[]) => void
}

export function PhotoFlow({ settings, photo, onRetake, onClose, onQuickAdd, onFixKey, onLog }: Props) {
  const [note, setNote] = useState('')
  const [phase, setPhase] = useState<Phase>({ k: 'note' })
  const ctl = useRef<AbortController | null>(null)
  useEffect(() => () => ctl.current?.abort(), [])
  // A new photo (Retake) starts over at the note step but keeps the note.
  useEffect(() => { ctl.current?.abort(); setPhase({ k: 'note' }) }, [photo])

  const run = async () => {
    ctl.current?.abort()
    const c = new AbortController()
    ctl.current = c
    setPhase({ k: 'loading' })
    try {
      const est = await estimatePhoto(settings, photo, note, FOOD_NAMES, { signal: c.signal })
      if (c.signal.aborted) return
      setPhase({ k: 'results', dish: est.dish || 'Your meal', items: toPhotoItems(est, FOODS) })
    } catch (e) {
      if (c.signal.aborted) return
      setPhase({ k: 'error', kind: e instanceof AiError ? e.kind : 'failed' })
    }
  }

  if (phase.k === 'results') return <Results dish={phase.dish} items={phase.items} photo={photo} note={note} onRetake={onRetake} onClose={onClose} onLog={onLog} />

  if (phase.k === 'error') {
    const t = errorText(phase.kind, settings.provider)
    const retry = phase.kind === 'offline' || phase.kind === 'busy' || phase.kind === 'failed'
    return (
      <Sheet label="Photo estimate" onClose={onClose}>
        <div className="flex items-center gap-3" data-testid="photo-error" data-kind={phase.kind}>
          <img src={photo} alt="Your meal photo" className="h-14 w-14 shrink-0 rounded-[14px] object-cover" />
          <h2 className="title text-[24px] leading-tight">{t.title}</h2>
        </div>
        <p className="text-[16px] leading-snug">{t.body}</p>
        <div className="flex gap-2.5">
          <Button variant="ghost" className={ghost} onClick={onRetake}>Retake</Button>
          {phase.kind === 'key' ? (
            <Button className="flex-1" data-autofocus onClick={onFixKey}>Check key in Me</Button>
          ) : retry ? (
            <Button className="flex-1" data-autofocus onClick={run}>Try again</Button>
          ) : (
            <Button className="flex-1" data-autofocus onClick={onRetake}>Take another photo</Button>
          )}
        </div>
        <button type="button" className="tap -mt-1 py-2 text-center text-[16px] font-bold text-g-ink underline" onClick={onQuickAdd}>
          Use Quick add instead
        </button>
      </Sheet>
    )
  }

  const loading = phase.k === 'loading'
  return (
    <Sheet label="Estimate from a photo" onClose={onClose}>
      <div className="relative">
        <img src={photo} alt="Your meal photo" className={`block max-h-[34vh] w-full rounded-[22px] object-cover ${loading ? 'opacity-60' : ''}`} />
        {!loading && (
          <button type="button" onClick={onRetake} className="absolute right-3 top-3 rounded-full bg-[rgba(42,36,32,.6)] px-3 py-1.5 text-[14px] font-semibold text-bg">Retake</button>
        )}
        {loading && (
          <div className="absolute inset-0 grid place-items-center" role="status" aria-live="polite">
            <span className="rounded-full bg-[rgba(42,36,32,.72)] px-4 py-2 text-[16px] font-semibold text-bg">
              <span className="photo-pulse" aria-hidden="true">✨ </span>Looking at your meal…
            </span>
          </div>
        )}
      </div>
      <label className="flex flex-col gap-1.5 text-[17px] font-semibold">
        <span>Add a note <span className="font-normal text-mute">(optional)</span></span>
        <textarea
          rows={3}
          value={note}
          disabled={loading}
          onChange={(e) => setNote(e.target.value)}
          maxLength={300}
          placeholder="Anything the photo can't show? Half portion, fried, no rice"
          className="w-full resize-none rounded-xl border border-line bg-bg px-3 py-3 text-[17px] font-normal leading-snug placeholder:text-mute"
        />
      </label>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Quick notes">
        {NOTE_CHIPS.map((c) => <Chip key={c} on={noteHas(note, c)} disabled={loading} onClick={() => setNote((n) => toggleNoteChip(n, c))}>{c}</Chip>)}
      </div>
      {loading ? (
        <Button variant="ghost" className="mt-1" onClick={() => { ctl.current?.abort(); setPhase({ k: 'note' }) }}>Cancel</Button>
      ) : (
        <Button className="mt-1" onClick={run}><span aria-hidden="true">✨ </span>Estimate</Button>
      )}
      <p className="-mt-2 text-center text-[13px] text-mute">Sent to {PROVIDER_LABEL[settings.provider]} ({MODELS[settings.provider]}). The photo isn’t saved.</p>
    </Sheet>
  )
}

function Results({ dish, items, photo, note, onRetake, onClose, onLog }: { dish: string; items: PhotoItem[]; photo: string; note: string; onRetake: () => void; onClose: () => void; onLog: (rows: LogItem[]) => void }) {
  const [rows, setRows] = useState(() => items.map((it) => ({ it, g: it.grams })))
  const view = rows.map((r) => ({ ...r, m: itemMacros(r.it, r.g), step: gramStep(r.it.grams) }))
  const total = view.reduce<PhotoMacros>((a, r) => ({ kcal: a.kcal + r.m.kcal, protein: a.protein + r.m.protein, carbs: a.carbs + r.m.carbs, fat: a.fat + r.m.fat }), { kcal: 0, protein: 0, carbs: 0, fat: 0 })
  const set = (key: string, d: number) => setRows((x) => x.map((r) => (r.it.key === key ? { ...r, g: Math.max(gramStep(r.it.grams), r.g + d) } : r)))
  const remove = (key: string) => setRows((x) => x.filter((r) => r.it.key !== key))
  const n = rows.length
  return (
    <Sheet label="Photo estimate" onClose={onClose}>
      <div className="flex items-center gap-3">
        <img src={photo} alt="Your meal photo" className="h-14 w-14 shrink-0 rounded-[14px] object-cover" />
        <div className="min-w-0">
          <h2 className="title text-[26px] leading-tight" data-testid="photo-dish">{dish}</h2>
          <p className="text-[15px] text-mute">Estimated from your photo</p>
        </div>
      </div>
      {note.trim() && <p className="-mt-1 rounded-xl bg-bg px-3 py-2 text-[15px]" data-testid="photo-note"><span className="text-mute">Your note: </span>{note.trim()}</p>}
      <ul aria-label="Estimated items" className="flex flex-col">
        {view.map((r) => (
          <li key={r.it.key} className="flex flex-col gap-1.5 border-b border-line py-2" data-matched={r.it.food ? 'yes' : 'no'}>
            <div className="flex items-center gap-3">
              <span className="tile" aria-hidden="true">{foodEmoji(r.it.name)}</span>
              <div className="min-w-0 flex-1 text-[17px] font-semibold leading-tight">{r.it.name}</div>
              <b className="num text-[20px] leading-none" data-testid="item-kcal">{fmt(r.m.kcal)}<span className="ml-1 font-sans text-[13px] font-normal text-mute">kcal</span></b>
              <button type="button" onClick={() => remove(r.it.key)} aria-label={`Remove ${r.it.name}`} className="tap -mr-1 grid h-8 w-8 place-items-center rounded-full text-[18px] text-mute">✕</button>
            </div>
            <div className="flex items-center justify-between gap-3 pl-[52px]">
              <div className="min-w-0 flex-1 leading-tight">
                <MacroLine portion={portionLabel(r.it, r.g)} m={r.m} />
                <span className="block text-[13px] text-mute">{r.it.food ? 'From our food list' : 'AI estimate'}</span>
              </div>
              <div className="flex items-center gap-1 rounded-xl bg-bg p-1">
                <button type="button" className={sb} aria-label={`Less ${r.it.name}`} disabled={r.g <= r.step} onClick={() => set(r.it.key, -r.step)}>−</button>
                <span className="w-[56px] text-center text-[15px] font-bold" aria-live="polite" data-testid="item-grams">{r.g} g</span>
                <button type="button" className={sb} aria-label={`More ${r.it.name}`} onClick={() => set(r.it.key, r.step)}>+</button>
              </div>
            </div>
          </li>
        ))}
        {!n && <li className="py-3 text-center text-[15px] text-mute">All items removed. Retake, or close and use Quick add.</li>}
      </ul>
      <div className="flex items-start justify-between gap-3">
        <span className="pt-1 text-[17px] font-semibold">Total</span>
        <div className="flex flex-col items-end gap-1.5">
          <b className="num text-[24px] leading-none" data-testid="photo-total">{fmt(total.kcal)} <span className="font-sans text-[14px] font-normal text-mute">kcal</span></b>
          <ul aria-label="Total macros" className="flex flex-wrap justify-end gap-1.5">
            {MACROS.map((x) => (
              <li key={x.k} className={`whitespace-nowrap rounded-full px-2.5 py-0.5 text-[13px] font-semibold ${x.pill}`} data-testid={`total-${x.k}`}>
                {fmt(total[x.k])} g {x.word[0].toUpperCase() + x.word.slice(1)}
              </li>
            ))}
          </ul>
        </div>
      </div>
      <p className="-mt-2 text-center text-[14px] text-mute">Estimates are rough. Adjust before logging.</p>
      <div className="flex gap-2.5">
        <Button variant="ghost" className={ghost} onClick={onRetake}>Retake</Button>
        <Button className="flex-1" disabled={!n} onClick={() => onLog(rows.map((r) => ({ item: r.it, grams: r.g })))}>Log {n} {n === 1 ? 'item' : 'items'}</Button>
      </div>
    </Sheet>
  )
}
