import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { AiFlow, CameraIcon, GalleryIcon, NoKeySheet, PencilIcon, type LogItem } from './PhotoSheets'
import { QuickAddSheet } from './QuickAddSheet'
import { reducedMotion } from './motion'
import { aiServingLabel } from '../lib/amount'
import { perServing, readAi, type AiSettings } from '../lib/ai'
import { dayView, defaultMeal, entryTotals, fmt } from '../lib/calc'
import { downscalePhoto } from '../lib/photo'
import { newId, useStore } from '../lib/store'
import type { Entry } from '../lib/types'

/** navigator.onLine, kept live. */
export function useOnline() {
  const [on, setOn] = useState(() => typeof navigator === 'undefined' || navigator.onLine !== false)
  useEffect(() => {
    const up = () => setOn(true), down = () => setOn(false)
    window.addEventListener('online', up)
    window.addEventListener('offline', down)
    return () => { window.removeEventListener('online', up); window.removeEventListener('offline', down) }
  }, [])
  return on
}

export function ManualIcon({ className = 'h-6 w-6' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M8 6h12M8 12h12M8 18h12" /><circle cx="4" cy="6" r=".6" fill="currentColor" /><circle cx="4" cy="12" r=".6" fill="currentColor" /><circle cx="4" cy="18" r=".6" fill="currentColor" />
    </svg>
  )
}

type Id = 'photo' | 'upload' | 'describe' | 'manual'
type Item = { id: Id; label: string; icon: ReactNode; ai: boolean }
// From the thumb upward: Take photo, Upload, Describe it, Manual.
const ITEMS: Item[] = [
  { id: 'photo', label: 'Take photo', icon: <CameraIcon className="h-[22px] w-[22px]" />, ai: true },
  { id: 'upload', label: 'Upload', icon: <GalleryIcon className="h-[22px] w-[22px]" />, ai: true },
  { id: 'describe', label: 'Describe it', icon: <PencilIcon className="h-[22px] w-[22px]" />, ai: true },
  { id: 'manual', label: 'Manual', icon: <ManualIcon className="h-[22px] w-[22px]" />, ai: false },
]
/** Close animation length (index.css .plus-out): 200 ms, or a 150 ms fade with reduced motion. */
const OUT_MS = () => (reducedMotion() ? 150 : 200)

const PLUS_ICON = <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
const FAB = 'fab grid h-[60px] w-[60px] shrink-0 place-items-center rounded-full bg-ink text-bg shadow-[0_8px_20px_rgba(42,36,32,.28)]'

/**
 * v1.17 Quick Log Menu (Reed, approved by Jordy). The bottom-nav + opens four stacked white pills over a scrim, from
 * the thumb up: Take photo, Upload, Describe it, Manual. The + turns into an x, the pills rise out of it one after
 * another with a light spring (about 200 ms); x, the scrim, Escape or the browser back closes it in reverse. Reduced
 * motion: a plain fade. The menu is a history entry, so back closes it instead of leaving the tab.
 * Take photo and Upload click their file input synchronously inside the tap (iOS only opens a picker from a user
 * gesture), Describe it opens the describe sheet, Manual opens Log (no autofocus). The AI result logs to the meal for
 * the time of day on the picked day, like Log. No key (online or offline): the AI pills say "Need AI key" and open
 * the setup sheet. Offline with a key: "Needs internet" and they do nothing. The file inputs, AI flow and sheets live here, portalled into the
 * phone frame so they cover the whole screen from any tab.
 */
export function PlusButton() {
  const nav = useNavigate()
  const { state, dispatch, logDate, land } = useStore()
  const online = useOnline()
  // off: closed. in: open (or opening). out: playing the close animation.
  const [phase, setPhase] = useState<'off' | 'in' | 'out'>('off')
  const [menu, setMenu] = useState<{ cx: number; bottom: number; key: boolean; kb: boolean } | null>(null)
  const [noKey, setNoKey] = useState(false)
  const [quick, setQuick] = useState(false)
  const [aiFlow, setAiFlow] = useState<{ ai: AiSettings; photo: string | null; photoError: boolean } | null>(null)
  const [photoSrc, setPhotoSrc] = useState<'camera' | 'library'>('camera')
  const btn = useRef<HTMLButtonElement>(null)
  const box = useRef<HTMLDivElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const captureRef = useRef<HTMLInputElement>(null)
  const pushed = useRef(false) // our history entry is on top
  const backing = useRef(false) // history.back() sent, its popstate not seen yet
  const pushLater = useRef(false) // menu reopened before that popstate: push once it lands
  const goLater = useRef<string | null>(null) // a navigation asked for before that popstate: run it once it lands
  const go = (path: string) => { if (backing.current) goLater.current = path; else nav(path) }
  const timer = useRef<number | undefined>(undefined)
  const [frame, setFrame] = useState<HTMLElement | null>(null)
  useEffect(() => setFrame(document.getElementById('app-frame')), [])
  useEffect(() => () => window.clearTimeout(timer.current), [])

  const live = useRef(phase)
  live.current = phase
  const shut = (focusPlus = false) => {
    if (live.current !== 'in') return
    live.current = 'out'
    setPhase('out')
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setPhase('off'), OUT_MS())
    if (focusPlus) btn.current?.focus({ preventScroll: true })
  }
  // Closing by x, scrim, Escape or a pill drops the history entry the menu pushed; back already did.
  const close = (focusPlus = false) => {
    shut(focusPlus)
    pushLater.current = false
    if (pushed.current) { pushed.current = false; backing.current = true; window.history.back() }
  }
  useEffect(() => {
    const pop = () => {
      // Our own back from closing (it lands a moment later): not the user pressing back.
      if (backing.current) {
        backing.current = false
        if (pushLater.current) { pushLater.current = false; window.history.pushState(window.history.state, ''); pushed.current = true }
        if (goLater.current) { const to = goLater.current; goLater.current = null; nav(to) }
        return
      }
      if (pushed.current) { pushed.current = false; shut() }
    }
    window.addEventListener('popstate', pop)
    return () => window.removeEventListener('popstate', pop)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const onPlus = (e: { detail: number }) => {
    const b = btn.current, f = frame
    if (!b || !f) return
    if (phase === 'in') { close(); return }
    const r = b.getBoundingClientRect(), h = f.getBoundingClientRect()
    window.clearTimeout(timer.current)
    setMenu({ cx: r.left + r.width / 2 - h.left, bottom: h.bottom - r.bottom, key: !!readAi(), kb: e.detail === 0 })
    live.current = 'in'
    setPhase('in')
    if (backing.current) pushLater.current = true
    else if (!pushed.current) { window.history.pushState(window.history.state, ''); pushed.current = true }
  }

  // Runs inside the tap: Take photo and Upload click their input before anything else.
  const run = (id: Id) => {
    if (id === 'manual') {
      // Replaces the menu's history entry, so back from Log returns to this tab (as the old + did).
      pushed.current = false
      pushLater.current = false
      live.current = 'off'
      setPhase('off')
      nav('/log', { replace: true })
      return
    }
    // No key wins over offline (Jordy: "if no key show Need AI key"): the setup sheet opens either way.
    const ai = readAi()
    if (!ai) { close(); setNoKey(true); return }
    if (!online) return // "Needs internet" (has a key): does nothing, the menu stays open
    if (id === 'photo') captureRef.current?.click()
    else if (id === 'upload') fileRef.current?.click()
    close()
    if (id === 'describe') setAiFlow({ ai, photo: null, photoError: false })
  }

  // Keyboard: Escape closes, arrows / Tab / Home / End move between pills (like the AI menu on Log).
  useEffect(() => {
    if (phase !== 'in') return
    const items = () => Array.from(box.current?.querySelectorAll<HTMLElement>('[role=menuitem]') ?? []).reverse() // top first
    if (menu?.kb) items()[0]?.focus({ preventScroll: true })
    const k = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); close(true); return }
      if (!['ArrowUp', 'ArrowDown', 'Tab', 'Home', 'End'].includes(e.key)) return
      const list = items()
      e.preventDefault()
      const i = list.indexOf(document.activeElement as HTMLElement)
      const back = e.key === 'ArrowUp' || (e.key === 'Tab' && e.shiftKey)
      const n = e.key === 'Home' ? 0 : e.key === 'End' ? list.length - 1 : i < 0 ? (back ? list.length - 1 : 0) : (i + (back ? -1 : 1) + list.length) % list.length
      list[n].focus()
    }
    document.addEventListener('keydown', k)
    return () => document.removeEventListener('keydown', k)
  }, [phase]) // eslint-disable-line react-hooks/exhaustive-deps

  const onFile = async (file: Blob | undefined, src: 'camera' | 'library') => {
    if (fileRef.current) fileRef.current.value = '' // the same photo can be picked again
    if (captureRef.current) captureRef.current.value = ''
    if (!file) return // picker cancelled: nothing opens
    setPhotoSrc(src)
    const ai = readAi()
    try {
      const url = await downscalePhoto(file)
      setAiFlow((f) => (f ? { ...f, photo: url, photoError: false } : ai ? { ai, photo: url, photoError: false } : f))
    } catch { setAiFlow((f) => (f ? { ...f, photoError: true } : ai ? { ai, photo: null, photoError: true } : f)) }
  }
  // Same as Log's AI logging, with the meal for the time of day (read when it is logged).
  const logAi = (rows: LogItem[], dish: string) => {
    const meal = defaultMeal()
    const groupId = rows.length > 1 ? newId() : undefined
    const added: Entry[] = rows.map(({ item, servings }) => {
      const p = perServing(item)
      return {
        id: newId(), date: logDate, meal, foodId: null, name: item.ai.name,
        servingLabel: aiServingLabel(item.ai.portion, item.ai.grams), servingMult: 1, qty: servings,
        kcal: p.kcal, protein: p.protein, carbs: p.carbs, fat: p.fat, createdAt: Date.now(), source: 'photo' as const,
        ...(groupId ? { groupId, groupName: dish } : {}),
      }
    })
    for (const entry of added) dispatch({ type: 'addEntry', entry })
    setAiFlow(null)
    const kcal = added.reduce((a, e) => a + entryTotals(e).kcal, 0)
    land({ kind: 'food', date: logDate, ids: added.map((e) => e.id), text: `Added ${added.length} ${added.length === 1 ? 'item' : 'items'} from AI · ${fmt(kcal)} kcal` })
    go('/')
  }
  const day = dayView(state, logDate)

  const sub = (it: Item) => (!it.ai ? null : !menu?.key ? 'Need AI key' : !online ? 'Needs internet' : null)
  const overlay = (
    <>
      {phase !== 'off' && menu && (
        <div className={`absolute inset-0 z-30 ${phase === 'out' ? 'plus-out pointer-events-none' : ''}`} data-testid="plus-overlay" data-phase={phase}>
          <div className="plus-scrim absolute inset-0 bg-[rgba(42,36,32,.32)]" onClick={() => close()} aria-hidden="true" data-testid="plus-scrim" />
          <div ref={box} role="menu" aria-label="Log food" data-testid="plus-menu" className="absolute flex -translate-x-1/2 flex-col-reverse items-stretch gap-2.5" style={{ left: menu.cx, bottom: menu.bottom + 60 + 14 }}>
            {ITEMS.map((it, i) => {
              const s = sub(it)
              const off = s === 'Needs internet'
              return (
                <button key={it.id} role="menuitem" type="button" onClick={() => run(it.id)} aria-disabled={off || undefined} aria-label={s ? `${it.label}. ${s}` : undefined}
                  data-testid={`plus-${it.id}`} data-muted={s ? '' : undefined} style={{ '--i': i } as CSSProperties}
                  className={`plus-pill tap pill-press flex h-11 w-[176px] items-center gap-2.5 rounded-full pl-4 pr-5 text-[17px] font-bold ${s ? 'bg-[#efe7d8] text-mute' : 'bg-card text-ink shadow-[0_8px_24px_rgba(42,36,32,.16)]'}`}>
                  <span className={`shrink-0 ${s ? '' : 'text-g'}`}>{it.icon}</span>
                  <span className="flex min-w-0 flex-col items-start whitespace-nowrap leading-tight">{it.label}{s && <span className="text-[12px] font-semibold" data-testid="plus-sub">{s}</span>}</span>
                </button>
              )
            })}
          </div>
          <button type="button" onClick={() => close(menu.kb)} aria-label="Close log menu" tabIndex={-1} data-testid="plus-close" className={`${FAB} plus-x absolute -translate-x-1/2`} style={{ left: menu.cx, bottom: menu.bottom }}>{PLUS_ICON}</button>
        </div>
      )}
      {noKey && <NoKeySheet onClose={() => setNoKey(false)} onSetup={() => { setNoKey(false); go('/settings?ai=1') }} />}
      {aiFlow && (
        <AiFlow settings={aiFlow.ai} photo={aiFlow.photo} photoError={aiFlow.photoError} photoSource={photoSrc}
          onTakePhoto={() => captureRef.current?.click()} onChoosePhoto={() => fileRef.current?.click()}
          onRemovePhoto={() => setAiFlow((f) => (f ? { ...f, photo: null, photoError: false } : f))}
          onClose={() => setAiFlow(null)} onQuickAdd={() => { setAiFlow(null); setQuick(true) }}
          onFixKey={() => { setAiFlow(null); go('/settings?ai=1') }} onLog={logAi} />
      )}
      {quick && (
        <QuickAddSheet mode="add" meal={defaultMeal()} date={logDate} remaining={day.balance - day.goal} onClose={() => setQuick(false)}
          onDone={(e) => { setQuick(false); land({ kind: 'food', date: e.date, ids: [e.id], text: `Added ${e.name} · ${fmt(entryTotals(e).kcal)} kcal` }); go('/') }} />
      )}
      <input ref={fileRef} type="file" accept="image/*" className="hidden" tabIndex={-1} aria-hidden="true" data-testid="plus-photo-input" onChange={(e) => onFile(e.target.files?.[0], 'library')} />
      <input ref={captureRef} type="file" accept="image/*" capture="environment" className="hidden" tabIndex={-1} aria-hidden="true" data-testid="plus-photo-capture" onChange={(e) => onFile(e.target.files?.[0], 'camera')} />
    </>
  )
  return (
    <>
      <button ref={btn} type="button" aria-label="Log food" aria-haspopup="menu" aria-expanded={phase === 'in'} onClick={onPlus} data-testid="plus" className={`${FAB} -mt-6`}>
        {PLUS_ICON}
      </button>
      {frame && createPortal(overlay, frame)}
    </>
  )
}
