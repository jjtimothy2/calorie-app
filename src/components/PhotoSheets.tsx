// v1.5: AI photo estimate sheets (ported from Reed's mock). Photo + note -> estimate -> adjust -> log.
// v1.6: AI estimate. Text, photo or both -> estimate -> adjust -> log. The AI's numbers are used as they are.
// The photo is a downscaled data URL held in React state only; nothing here is saved except the logged entries.
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { FOODS } from '../data/foods'
import { foodEmoji } from '../data/foodEmoji'
import {
  AiError, MODELS, PROVIDER_LABEL, errorText, estimateMeal, gramStep, itemMacros, noteHas, portionLabel, toPhotoItems, toggleNoteChip,
  type AiErrorKind, type AiSettings, type PhotoItem, type PhotoMacros,
  scaleLine,
} from '../lib/ai'
import { fmt } from '../lib/calc'
import { Sheet } from './Sheet'
import { Button, Chip } from './ui'

export const NOTE_CHIPS = ['Shared', 'Half eaten', 'Extra sambal', 'Santan', 'No rice']
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

/** v1.6: the AI button's sparkle (one big four-point star and a small one). */
export function SparkleIcon({ className = 'h-6 w-6' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <path d="M10 3c.5 3.6 2.4 5.5 6 6-3.6.5-5.5 2.4-6 6-.5-3.6-2.4-5.5-6-6 3.6-.5 5.5-2.4 6-6z" />
      <path d="M18 13c.3 2 1.2 2.9 3 3.2-1.8.3-2.7 1.2-3 3.2-.3-2-1.2-2.9-3-3.2 1.8-.3 2.7-1.2 3-3.2z" />
    </svg>
  )
}

/** Tapped the AI button with no key saved yet. */
export function NoKeySheet({ onClose, onSetup }: { onClose: () => void; onSetup: () => void }) {
  return (
    <Sheet label="Set up AI estimates" onClose={onClose}>
      <div className="mx-auto grid h-16 w-16 place-items-center rounded-full border border-line bg-card text-g"><SparkleIcon className="h-8 w-8" /></div>
      <h2 className="title text-center text-[26px] leading-tight">AI estimate</h2>
      <p className="text-center text-[16px] leading-snug text-mute">
        Say what you ate, or snap your plate, and an AI lists it with rough calories, protein, carbs and fat. You check the amounts, then log.
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

type Phase = { k: 'input' } | { k: 'loading' } | { k: 'results'; dish: string; scaleRef: string; items: PhotoItem[] } | { k: 'error'; kind: AiErrorKind }
export type LogItem = { item: PhotoItem; grams: number }

type Props = {
  settings: AiSettings
  /** Downscaled JPEG data URL, or null (text only). */
  photo: string | null
  /** The last photo couldn't be read. */
  photoError: boolean
  onPickPhoto: () => void
  onRemovePhoto: () => void
  onClose: () => void
  onQuickAdd: () => void
  onFixKey: () => void
  onLog: (rows: LogItem[]) => void
}

const Thumb = ({ photo, dim = false }: { photo: string | null; dim?: boolean }) => photo
  ? <img src={photo} alt="Your meal photo" className={`h-14 w-14 shrink-0 rounded-[14px] object-cover ${dim ? 'opacity-60' : ''}`} />
  : <span className="grid h-14 w-14 shrink-0 place-items-center rounded-[14px] border border-line bg-card text-g" aria-hidden="true"><SparkleIcon className="h-7 w-7" /></span>

export function AiFlow({ settings, photo, photoError, onPickPhoto, onRemovePhoto, onClose, onQuickAdd, onFixKey, onLog }: Props) {
  const [note, setNote] = useState('')
  const [phase, setPhase] = useState<Phase>({ k: 'input' })
  const noteRef = useRef<HTMLTextAreaElement>(null)
  const typing = useRef(false)
  const ctl = useRef<AbortController | null>(null)
  useEffect(() => () => ctl.current?.abort(), [])
  // A new or removed photo goes back to the input step; the text is kept.
  useEffect(() => { ctl.current?.abort(); setPhase({ k: 'input' }) }, [photo])
  const back = () => { ctl.current?.abort(); setPhase({ k: 'input' }) }
  const [textFirst, setTextFirst] = useState(false)
  // v1.6.2: a photo, 2+ typed characters, or a chip.
  const ready = !!photo || note.trim().length >= 2 || NOTE_CHIPS.some((c) => noteHas(note, c))

  const run = async () => {
    if (!ready) return
    ctl.current?.abort()
    const c = new AbortController()
    ctl.current = c
    setPhase({ k: 'loading' })
    try {
      const est = await estimateMeal(settings, photo, note, { signal: c.signal })
      if (c.signal.aborted) return
      setPhase({ k: 'results', dish: est.dish || 'Your meal', scaleRef: est.scaleRef, items: toPhotoItems(est, FOODS) })
    } catch (e) {
      if (c.signal.aborted) return
      setPhase({ k: 'error', kind: e instanceof AiError ? e.kind : 'failed' })
    }
  }

  if (phase.k === 'results') return <Results dish={phase.dish} scaleRef={phase.scaleRef} items={phase.items} photo={photo} note={note} onEdit={back} onClose={onClose} onLog={onLog} />

  if (phase.k === 'error') {
    const t = errorText(phase.kind, settings.provider)
    const retry = phase.kind === 'offline' || phase.kind === 'busy' || phase.kind === 'failed'
    return (
      <Sheet label="AI estimate" onClose={onClose}>
        <div className="flex items-center gap-3" data-testid="photo-error" data-kind={phase.kind}>
          <Thumb photo={photo} />
          <h2 className="title text-[24px] leading-tight">{t.title}</h2>
        </div>
        <p className="text-[16px] leading-snug">{t.body}</p>
        <div className="flex gap-2.5">
          <Button variant="ghost" className={ghost} onClick={back}>Edit</Button>
          {phase.kind === 'key' ? (
            <Button className="flex-1" data-autofocus onClick={onFixKey}>Check key in Me</Button>
          ) : retry ? (
            <Button className="flex-1" data-autofocus onClick={run}>Try again</Button>
          ) : (
            <Button className="flex-1" data-autofocus onClick={back}>Add more detail</Button>
          )}
        </div>
        <button type="button" className="tap -mt-1 py-2 text-center text-[16px] font-bold text-g-ink underline" onClick={onQuickAdd}>
          Use Quick add instead
        </button>
      </Sheet>
    )
  }

  const loading = phase.k === 'loading'
  // v1.6.2 photo-first sheet. The frame is big until the text field is tapped with no photo yet; then it folds into a
  // slim "Add a photo" strip (one element, its height animates, so the field and chips slide with it). A photo always
  // keeps it big. The textarea never remounts, so the v1.5.2 focus handling is untouched.
  const strip = textFirst && !photo
  const askWhat = strip
  return (
    <Sheet label="AI estimate" onClose={onClose}>
      <h2 className="title flex items-center gap-2 text-[26px] leading-tight"><SparkleIcon className="h-6 w-6 text-g" />AI estimate</h2>
      {photo ? (
        <div className="frame-h relative shrink-0 overflow-hidden rounded-2xl border border-line bg-bg" data-testid="photo-added">
          <img src={photo} alt="Your meal photo" className={`h-full w-full object-cover ${loading ? 'opacity-60' : ''}`} />
          <span className="sr-only">Photo added</span>
          {!loading && <div className="absolute inset-x-2 bottom-2 flex justify-end gap-2">
            <button type="button" onClick={onPickPhoto} className="tap rounded-full bg-card/95 px-4 py-2 text-[15px] font-bold text-g-ink shadow-sm">Change</button>
            <button type="button" onClick={onRemovePhoto} aria-label="Remove photo" className="tap grid h-10 w-10 place-items-center rounded-full bg-card/95 text-[18px] text-ink shadow-sm">✕</button>
          </div>}
        </div>
      ) : (
        <button
          type="button"
          onClick={() => { setTextFirst(false); onPickPhoto() }}
          onTransitionEnd={(e) => { if (e.target === e.currentTarget && e.propertyName === 'height' && document.activeElement === noteRef.current) e.currentTarget.closest('[role=dialog]')?.querySelector<HTMLElement>('[data-keep-visible]')?.scrollIntoView({ block: 'nearest' }) }}
          disabled={loading}
          data-testid="add-photo"
          data-state={strip ? 'strip' : 'big'}
          aria-label={strip ? 'Add a photo (optional)' : 'Tap to take a photo'}
          className={`frame-anim relative block w-full shrink-0 overflow-hidden rounded-2xl text-left disabled:opacity-50 ${strip ? 'h-[56px] bg-card' : 'frame-h bg-bg'}`}
        >
          <span aria-hidden="true" className={`pointer-events-none absolute inset-0 rounded-2xl border-2 border-dashed border-line transition-opacity duration-[280ms] ease-out ${strip ? 'opacity-100' : 'opacity-0'}`} />
          <span aria-hidden="true" className={`absolute inset-0 flex flex-col items-center justify-center gap-2 text-center transition-opacity duration-[280ms] ease-out ${strip ? 'opacity-0' : 'opacity-100'}`}>
            <span className="grid h-14 w-14 place-items-center rounded-full border border-line bg-card text-g"><CameraIcon className="h-7 w-7" /></span>
            <span className="text-[17px] font-bold">Tap to take a photo</span>
            <span className="-mt-1.5 text-[14px] text-mute">Camera or library</span>
          </span>
          <span aria-hidden="true" className={`absolute inset-x-0 top-0 flex h-[56px] items-center gap-3 px-4 transition-opacity duration-[280ms] ease-out ${strip ? 'opacity-100' : 'opacity-0'}`}>
            <CameraIcon className="h-6 w-6 shrink-0 text-g" />
            <span className="text-[16px] font-bold">Add a photo <span className="font-normal text-mute">(optional)</span></span>
          </span>
        </button>
      )}
      {/* v1.6.1: a size reference in the shot gives better grams. Folds away with the frame. */}
      {!photo && (
        <div className={`-mt-1.5 grid transition-[grid-template-rows,opacity] duration-[280ms] ease-out ${strip ? 'grid-rows-[0fr] opacity-0' : 'grid-rows-[1fr] opacity-100'}`} aria-hidden={strip}>
          <p className="overflow-hidden px-1 text-[13px] leading-snug text-mute [text-wrap:balance]" data-testid="photo-tip">Tip: put a spoon or your hand in the shot for better portions.</p>
        </div>
      )}
      <div className="-mb-1.5 grid px-1 text-[15px] font-bold" data-testid="note-label">
        <span aria-hidden={askWhat} className={`col-start-1 row-start-1 transition-opacity duration-[280ms] ease-out ${askWhat ? 'opacity-0' : 'opacity-100'}`}>Add a note <span className="font-normal text-mute">(optional)</span></span>
        <span aria-hidden={!askWhat} className={`col-start-1 row-start-1 transition-opacity duration-[280ms] ease-out ${askWhat ? 'opacity-100' : 'opacity-0'}`}>What did you eat?</span>
      </div>
      <textarea
        ref={noteRef}
        rows={2}
        value={note}
        disabled={loading}
        onFocus={() => { if (!photo) setTextFirst(true) }}
        onChange={(e) => setNote(e.target.value)}
        maxLength={300}
        aria-label={askWhat ? 'What did you eat?' : 'Add a note (optional)'}
        placeholder="e.g. 2 slices martabak manis, half a plate"
        className="w-full shrink-0 resize-none rounded-xl border border-line bg-bg px-3 py-3 text-[17px] font-normal leading-snug placeholder:text-mute"
      />
      {photoError && <p role="alert" className="-mt-1 text-[15px] leading-snug text-danger" data-testid="photo-problem">Couldn’t open that photo. Try another one; JPEG and PNG work everywhere.</p>}
      <div className="flex flex-wrap gap-2" role="group" aria-label="Quick notes">
        {/* A chip tapped while typing keeps the keyboard up (focus stays in the text); otherwise it never opens it. */}
        {NOTE_CHIPS.map((c) => (
          <Chip
            key={c}
            on={noteHas(note, c)}
            disabled={loading}
            onPointerDown={() => { typing.current = document.activeElement === noteRef.current }}
            onMouseDown={(e) => { if (document.activeElement === noteRef.current) e.preventDefault() }}
            onClick={() => { setNote((n) => toggleNoteChip(n, c)); if (typing.current) noteRef.current?.focus({ preventScroll: true }); typing.current = false }}
          >{c}</Chip>
        ))}
      </div>
      {loading ? (<>
        <p className="mt-1 text-center text-[16px] font-semibold" role="status" aria-live="polite"><SparkleIcon className="photo-pulse mr-1.5 inline-block h-[18px] w-[18px] align-[-3px] text-g" />Looking at your meal…</p>
        <Button variant="ghost" className="-mt-1" onClick={back}>Cancel</Button>
      </>) : (
        <Button className="mt-1" data-keep-visible disabled={!ready} onClick={run}><SparkleIcon className="mr-2 inline-block h-5 w-5 align-[-3px]" />Estimate</Button>
      )}
      <p className="-mt-2 text-center text-[13px] text-mute">{ready || loading ? `Sent to ${PROVIDER_LABEL[settings.provider]} (${MODELS[settings.provider]}). Photos aren’t saved.` : 'Describe your meal or add a photo to estimate.'}</p>
    </Sheet>
  )
}

function Results({ dish, scaleRef, items, photo, note, onEdit, onClose, onLog }: { dish: string; scaleRef: string; items: PhotoItem[]; photo: string | null; note: string; onEdit: () => void; onClose: () => void; onLog: (rows: LogItem[]) => void }) {
  const [rows, setRows] = useState(() => items.map((it) => ({ it, g: it.grams })))
  const view = rows.map((r) => ({ ...r, m: itemMacros(r.it, r.g), step: gramStep(r.it.grams) }))
  const total = view.reduce<PhotoMacros>((a, r) => ({ kcal: a.kcal + r.m.kcal, protein: a.protein + r.m.protein, carbs: a.carbs + r.m.carbs, fat: a.fat + r.m.fat }), { kcal: 0, protein: 0, carbs: 0, fat: 0 })
  const set = (key: string, d: number) => setRows((x) => x.map((r) => (r.it.key === key ? { ...r, g: Math.max(gramStep(r.it.grams), r.g + d) } : r)))
  const remove = (key: string) => setRows((x) => x.filter((r) => r.it.key !== key))
  const n = rows.length
  const sized = scaleLine(scaleRef, !!photo)
  return (
    <Sheet label="AI estimate" onClose={onClose}>
      <div className="flex items-center gap-3">
        <Thumb photo={photo} />
        <div className="min-w-0">
          <h2 className="title text-[26px] leading-tight" data-testid="photo-dish">{dish}</h2>
          <p className="text-[15px] text-mute" data-testid="photo-source">{photo ? 'Estimated from your photo' : 'Estimated from your description'}</p>
          {/* v1.6.1: how the photo was sized; one line, cut with an ellipsis rather than wrapping. Text only: nothing. */}
          {sized && <p className="truncate text-[13px] text-mute" data-testid="photo-scale" title={sized}>{sized}</p>}
        </div>
      </div>
      {note.trim() && <p className="-mt-1 rounded-xl bg-bg px-3 py-2 text-[15px]" data-testid="photo-note"><span className="text-mute">{photo ? 'Your note: ' : 'You said: '}</span>{note.trim()}</p>}
      <ul aria-label="Estimated items" className="flex flex-col">
        {view.map((r) => (
          <li key={r.it.key} className="flex flex-col gap-1.5 border-b border-line py-2">
            <div className="flex items-center gap-3">
              <span className="tile" aria-hidden="true">{foodEmoji(r.it.emojiName)}</span>
              <div className="min-w-0 flex-1 text-[17px] font-semibold leading-tight">{r.it.name}</div>
              <b className="num text-[20px] leading-none" data-testid="item-kcal">{fmt(r.m.kcal)}<span className="ml-1 font-sans text-[13px] font-normal text-mute">kcal</span></b>
              <button type="button" onClick={() => remove(r.it.key)} aria-label={`Remove ${r.it.name}`} className="tap -mr-1 grid h-8 w-8 place-items-center rounded-full text-[18px] text-mute">✕</button>
            </div>
            <div className="flex items-center justify-between gap-3 pl-[52px]">
              <div className="min-w-0 flex-1 leading-tight">
                <MacroLine portion={portionLabel(r.it, r.g)} m={r.m} />
              </div>
              <div className="flex items-center gap-1 rounded-xl bg-bg p-1">
                <button type="button" className={sb} aria-label={`Less ${r.it.name}`} disabled={r.g <= r.step} onClick={() => set(r.it.key, -r.step)}>−</button>
                <span className="w-[56px] text-center text-[15px] font-bold" aria-live="polite" data-testid="item-grams">{r.g} g</span>
                <button type="button" className={sb} aria-label={`More ${r.it.name}`} onClick={() => set(r.it.key, r.step)}>+</button>
              </div>
            </div>
          </li>
        ))}
        {!n && <li className="py-3 text-center text-[15px] text-mute">All items removed. Edit, or close and use Quick add.</li>}
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
        <Button variant="ghost" className={ghost} onClick={onEdit}>Edit</Button>
        <Button className="flex-1" disabled={!n} onClick={() => onLog(rows.map((r) => ({ item: r.it, grams: r.g })))}>Log {n} {n === 1 ? 'item' : 'items'}</Button>
      </div>
    </Sheet>
  )
}
