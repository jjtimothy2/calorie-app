import { useMemo, useState } from 'react'
import { ACTIVITIES, ACTIVITY_BY_ID, INTENSITY_LABEL, exerciseKcal } from '../data/activities'
import { fmt } from '../lib/calc'
import { exerciseEntry, newId, useStore } from '../lib/store'
import type { ExerciseEntry, Intensity } from '../lib/types'
import { Sheet } from './Sheet'
import { Button, Chip } from './ui'

const POPULAR = ['walking', 'running', 'badminton', 'gym-weights', 'futsal', 'cycling', 'swimming', 'yoga']
const INTENSITIES: Intensity[] = ['light', 'moderate', 'vigorous']

export function MinutesStepper({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  const btn = 'grid h-12 w-12 place-items-center rounded-xl border border-line bg-card text-2xl font-bold disabled:opacity-40'
  const step = value >= 60 ? 15 : 5
  return (
    <div className="flex items-center justify-between rounded-2xl bg-bg p-2">
      <button type="button" className={btn} aria-label="Decrease duration" disabled={value <= 5} onClick={() => onChange(Math.max(5, value - (value > 60 ? 15 : 5)))}>−</button>
      <b className="text-[22px]" aria-live="polite" data-testid="minutes">{value} min</b>
      <button type="button" className={btn} aria-label="Increase duration" onClick={() => onChange(Math.min(600, value + step))}>+</button>
    </div>
  )
}

type Props = {
  date: string
  initial?: ExerciseEntry
  onSaved: (e: ExerciseEntry) => void
  onQuickAdd?: () => void
}

/** Activity picker + duration + intensity. Used inline on the Log screen and inside the edit sheet. */
export function ExerciseForm({ date, initial, onSaved, onQuickAdd }: Props) {
  const { state, dispatch } = useStore()
  const weight = state.profile!.weightKg
  const [q, setQ] = useState('')
  const [activityId, setActivityId] = useState<string | null>(initial?.activityId ?? null)
  const [minutes, setMinutes] = useState(initial?.minutes ?? 30)
  const [intensity, setIntensity] = useState<Intensity>(initial?.intensity ?? 'moderate')
  const list = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) {
      const ids = activityId && !POPULAR.includes(activityId) ? [activityId, ...POPULAR] : POPULAR
      return ids.map((id) => ACTIVITY_BY_ID.get(id)!)
    }
    return ACTIVITIES.filter((a) => a.name.toLowerCase().includes(needle))
  }, [q, activityId])
  const kcal = activityId ? exerciseKcal(activityId, intensity, minutes, weight) : 0

  const save = () => {
    if (!activityId) return
    const base = exerciseEntry({ date, activityId, minutes, intensity, weightKg: weight })
    if (initial) {
      const e = { ...base, id: initial.id, createdAt: initial.createdAt }
      dispatch({ type: 'updateExercise', entry: e })
      onSaved(e)
    } else {
      dispatch({ type: 'addExercise', entry: base })
      onSaved(base)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2.5 rounded-2xl border-2 border-line bg-card px-4 py-3 focus-within:border-g-ink">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="text-mute" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
        <input
          type="search"
          aria-label="Search activity"
          placeholder="Search activity"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="w-full appearance-none bg-transparent text-[17px] outline-none placeholder:text-mute focus:outline-none focus-visible:outline-none [&::-webkit-search-cancel-button]:hidden"
        />
      </div>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Activity" data-testid="activity-list">
        {list.map((a) => (
          <Chip key={a.id} on={activityId === a.id} onClick={() => setActivityId(a.id)}>{a.name}</Chip>
        ))}
        {list.length === 0 && (
          <p className="text-[15px] text-mute">No match. {onQuickAdd && <button type="button" className="font-bold text-g-ink underline" onClick={onQuickAdd}>Quick add calories</button>}</p>
        )}
      </div>
      <MinutesStepper value={minutes} onChange={setMinutes} />
      <div className="flex flex-wrap gap-2" role="group" aria-label="Intensity">
        {INTENSITIES.map((i) => (
          <Chip key={i} on={intensity === i} onClick={() => setIntensity(i)}>{INTENSITY_LABEL[i]}</Chip>
        ))}
      </div>
      <div className="flex justify-between text-base">
        <span className="text-mute">Estimated burn</span>
        <b className="text-ex-ink" data-testid="est-burn">{activityId ? `${fmt(kcal)} kcal` : 'Pick an activity'}</b>
      </div>
      <Button onClick={save} disabled={!activityId}>{initial ? `Save · ${fmt(kcal)} kcal` : 'Add exercise'}</Button>
    </div>
  )
}

const input = 'w-full rounded-xl border border-line bg-bg px-3 py-3 text-[17px]'

/** Type burned calories straight from a watch. Add or edit. */
export function ExerciseQuickSheet({ date, initial, onDone, onClose }: { date: string; initial?: ExerciseEntry; onDone: (e: ExerciseEntry | null) => void; onClose: () => void }) {
  const { dispatch } = useStore()
  const [kcal, setKcal] = useState(initial ? String(initial.kcal) : '')
  const [name, setName] = useState(initial ? initial.name : '')
  const [minutes, setMinutes] = useState(initial && initial.minutes ? String(initial.minutes) : '')
  const k = Math.round(Number(kcal))
  const valid = Number.isFinite(k) && k > 0 && k < 5000
  const save = () => {
    if (!valid) return
    const e: ExerciseEntry = {
      id: initial?.id ?? newId(),
      date: initial?.date ?? date,
      activityId: null,
      name: name.trim() || 'Exercise',
      minutes: Math.max(0, Math.round(Number(minutes) || 0)),
      intensity: 'moderate',
      kcal: k,
      createdAt: initial?.createdAt ?? Date.now(),
    }
    if (initial) dispatch({ type: 'updateExercise', entry: e })
    else dispatch({ type: 'addExercise', entry: e })
    onDone(e)
  }
  return (
    <Sheet label={initial ? 'Edit exercise' : 'Quick add exercise'} onClose={onClose}>
      <h2 className="title text-[24px] leading-tight">{initial ? 'Edit exercise' : 'Quick add exercise'}</h2>
      <form className="flex flex-col gap-3" onSubmit={(ev) => { ev.preventDefault(); save() }}>
        <label className="flex flex-col gap-1 text-[15px] font-semibold">
          Calories burned (kcal)
          <input data-autofocus className={input} type="number" inputMode="numeric" min={1} required name="burn" value={kcal} onChange={(ev) => setKcal(ev.target.value)} />
        </label>
        <label className="flex flex-col gap-1 text-[15px] font-semibold">
          Name <span className="font-normal text-mute">(optional)</span>
          <input className={input} name="exname" value={name} onChange={(ev) => setName(ev.target.value)} placeholder="e.g. Morning run (watch)" />
        </label>
        <label className="flex flex-col gap-1 text-[15px] font-semibold">
          Minutes <span className="font-normal text-mute">(optional)</span>
          <input className={input} type="number" inputMode="numeric" min={0} name="exminutes" value={minutes} onChange={(ev) => setMinutes(ev.target.value)} />
        </label>
        <Button type="submit" disabled={!valid}>{initial ? 'Save' : `Add ${valid ? fmt(k) + ' ' : ''}kcal`}</Button>
        {initial && <Button variant="danger" onClick={() => { dispatch({ type: 'deleteExercise', id: initial.id }); onDone(null) }}>Delete exercise</Button>}
      </form>
    </Sheet>
  )
}

/** Edit sheet for an activity-based exercise entry. */
export function ExerciseEditSheet({ entry, onClose }: { entry: ExerciseEntry; onClose: () => void }) {
  const { dispatch } = useStore()
  return (
    <Sheet label={`Edit ${entry.name}`} onClose={onClose}>
      <h2 className="title text-[24px] leading-tight">Edit exercise</h2>
      <ExerciseForm date={entry.date} initial={entry} onSaved={onClose} />
      <Button variant="danger" onClick={() => { dispatch({ type: 'deleteExercise', id: entry.id }); onClose() }}>Delete exercise</Button>
      <p className="text-center text-xs text-mute">Estimates use MET x body weight x hours. Illustrative.</p>
    </Sheet>
  )
}

export function exerciseLine(e: ExerciseEntry): string {
  if (!e.activityId) return e.minutes ? `${e.name}, ${e.minutes} min` : e.name
  return `${e.name}, ${e.minutes} min · ${INTENSITY_LABEL[e.intensity].toLowerCase()}`
}
