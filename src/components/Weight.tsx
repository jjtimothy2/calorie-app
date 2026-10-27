import { useEffect, useRef, useState, type PointerEvent, type ReactNode } from 'react'
import { addDays, dailyPlan, daysBetween, fmt, goalReached, kgWeek, longDay, paceCheck, round1, shortDay, weighInStatus, type WeighIn } from '../lib/calc'
import { useStore } from '../lib/store'
import { deleteWeight, lastWeigh, logWeight, shouldNudge as nudgeDue } from '../lib/weigh'
import { WEIGH_KEY } from '../lib/backup'
import type { Goal, Profile, WeightEntry } from '../lib/types'
import { createPortal } from 'react-dom'
import { Sheet } from './Sheet'
import { Button, Card, Chip } from './ui'
import { GOAL_LABEL } from './ProfileFields'
import { ByWhenPicker, goalWeightError, goalWeightOk, PaceWarning, type ByWhen } from './GoalPlan'

const readDismissed = (): string | null => {
  try { return (JSON.parse(localStorage.getItem(WEIGH_KEY) ?? 'null') as { dismissedAt?: string } | null)?.dismissedAt ?? null } catch { return null }
}

/** Home: "Weighed in lately?" with a Log weight button. Dismiss hides it for a week (device-only). */
export function WeighInNudge() {
  const { state, today } = useStore()
  // Follows the weight log, so a weigh-in from the sheet (or Me) hides it straight away.
  const [dismissedAt, setDismissedAt] = useState(readDismissed)
  const show = nudgeDue(state.weights, today, dismissedAt)
  const [open, setOpen] = useState(false)
  const last = lastWeigh(state.weights)
  if (!state.profile || !last) return null
  const dismiss = () => { localStorage.setItem(WEIGH_KEY, JSON.stringify({ dismissedAt: today })); setDismissedAt(today) }
  return (
    <>
      {show && (
        <div role="note" className="flex items-center gap-3 rounded-2xl bg-g-soft py-3 pl-4 pr-2 text-[15px] text-g-soft-ink" data-testid="weigh-nudge">
          <span className="flex-1 leading-snug"><b className="block">Weighed in lately?</b>Last time was {shortDay(last.date)}. A weekly weigh-in keeps your target on track.</span>
          <button type="button" onClick={() => setOpen(true)} className="tap min-h-11 shrink-0 rounded-full bg-card px-4 text-[15px] font-bold text-g-soft-ink" data-testid="weigh-nudge-log">Log weight</button>
          <button type="button" onClick={dismiss} aria-label="Dismiss weigh-in reminder" className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-xl font-bold">×</button>
        </div>
      )}
      {open && inFrame(<LogWeightSheet onClose={() => setOpen(false)} />)}
    </>
  )
}

/** Line chart of the weight log, start to now, with a dashed goal line. */
export function WeightChart({ weights, goalKg, showGoal }: { weights: WeightEntry[]; goalKg: number; showGoal: boolean }) {
  const W = 320, H = 132, L = 6, R = 52, T = 10, B = 22
  if (!weights.length) return null
  const kgs = weights.map((w) => w.kg).concat(showGoal ? [goalKg] : [])
  let lo = Math.min(...kgs), hi = Math.max(...kgs)
  const pad = Math.max(0.6, (hi - lo) * 0.12)
  lo -= pad; hi += pad
  const t0 = weights[0].date, span = Math.max(1, daysBetween(t0, weights[weights.length - 1].date))
  const x = (d: string) => (weights.length === 1 ? (L + W - R) / 2 : L + (daysBetween(t0, d) / span) * (W - L - R))
  const y = (kg: number) => T + ((hi - kg) / (hi - lo)) * (H - T - B)
  const path = weights.map((w, i) => `${i ? 'L' : 'M'}${x(w.date).toFixed(1)} ${y(w.kg).toFixed(1)}`).join(' ')
  const last = weights[weights.length - 1]
  // Near the goal the two right-hand labels would overlap: move the weight label off the goal line (above or below).
  const gap = showGoal ? y(last.kg) - y(goalKg) : 99
  const labelY = y(last.kg) + 4.5 + (Math.abs(gap) < 15 ? (gap <= 0 ? -1 : 1) * (15 - Math.abs(gap)) : 0)
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="block w-full" role="img" aria-label={`Weight from ${shortDay(t0)} to ${shortDay(last.date)}`} data-testid="weight-chart">
      {showGoal && (
        <g>
          <line x1={L} x2={W - R + 4} y1={y(goalKg)} y2={y(goalKg)} stroke="var(--color-mute)" strokeWidth="1.5" strokeDasharray="4 5" />
          <text x={W - R + 8} y={y(goalKg) + 4.5} fontSize="13" fontWeight="700" fill="var(--color-mute)">{round1(goalKg)} kg</text>
        </g>
      )}
      <path d={path} fill="none" stroke="var(--color-g)" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
      {weights.map((w) => <circle key={w.date} cx={x(w.date)} cy={y(w.kg)} r="3" fill="var(--color-card)" stroke="var(--color-g)" strokeWidth="2" />)}
      <circle cx={x(last.date)} cy={y(last.kg)} r="5" fill="var(--color-g)" />
      <text x={x(last.date) + 9} y={labelY} fontSize="13" fontWeight="700" fill="var(--color-g-ink)">{round1(last.kg)}</text>
      <text x={L} y={H - 4} fontSize="12" fill="var(--color-mute)">{shortDay(t0)}</text>
      {weights.length > 1 && <text x={W - R} y={H - 4} fontSize="12" textAnchor="end" fill="var(--color-mute)">{shortDay(last.date)}</text>}
    </svg>
  )
}

/** "Down 2.3 kg since 1 Oct" */
export function trendLine(weights: WeightEntry[]) {
  if (!weights.length) return 'No weigh-ins yet. Log one to start your trend.'
  if (weights.length < 2) return weights.length ? `Started at ${round1(weights[0].kg)} kg on ${shortDay(weights[0].date)}. Log weekly to see a trend.` : ''
  const diff = round1(weights[weights.length - 1].kg - weights[0].kg)
  const since = shortDay(weights[0].date)
  return diff === 0 ? `Same as ${since}` : `${diff < 0 ? 'Down' : 'Up'} ${Math.abs(diff)} kg since ${since}`
}

/** Me: the weight trend, the goal (with Edit), Log weight, and a push-date prompt when the plan has got fast. */
export function WeightCard() {
  const { state, dispatch } = useStore()
  const p = state.profile!
  const [sheet, setSheet] = useState<'log' | 'goal' | 'all' | null>(null)
  const plan = dailyPlan(p)
  const check = paceCheck(p, plan)
  const reached = goalReached(p)
  const hasGoal = p.goal !== 'keep' && !!p.goalDate
  return (
    <>
      {reached && <GoalReachedCard p={p} onKeep={() => dispatch({ type: 'setProfile', profile: keepProfile(p) })} onNew={() => setSheet('goal')} />}
      <Card className="flex flex-col gap-3">
        <section aria-label="Weight" data-testid="weight-card" className="flex flex-col gap-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="title text-[21px]">Weight</h2>
              <p className="text-[15px] text-mute" data-testid="weight-trend">{trendLine(state.weights)}</p>
            </div>
            <div className="num text-[30px] leading-none" data-testid="weight-now">{round1(p.weightKg)}<span className="ml-1 text-[15px] text-mute">kg</span></div>
          </div>
          {state.weights.length > 0 && (
            <button type="button" onClick={() => setSheet('all')} className="tap -mx-1 rounded-[14px] px-1 text-left" aria-label="See all weigh-ins" data-testid="weight-chart-open">
              <WeightChart weights={state.weights} goalKg={p.goalWeightKg} showGoal={hasGoal} />
            </button>
          )}
          {state.weights.length > 0 && (
            <button type="button" onClick={() => setSheet('all')} className="tap -mt-1 flex min-h-11 items-center justify-between rounded-[14px] text-[15px]" data-testid="see-weighins">
              <span className="text-mute">{state.weights.length} {state.weights.length === 1 ? 'weigh-in' : 'weigh-ins'}</span>
              <span className="font-bold text-g-ink">See all ›</span>
            </button>
          )}
          <div className="flex items-center justify-between gap-3 border-t border-line pt-3">
            <div className="flex flex-col leading-snug">
              <b className="text-[16px]" data-testid="goal-summary">{hasGoal ? `Goal ${round1(p.goalWeightKg)} kg by ${longDay(p.goalDate!)}` : 'Goal: keep your weight'}</b>
              {hasGoal && !reached && <span className="text-[14px] text-mute">About {kgWeek(plan.weeklyKg)} kg a week · {fmt(plan.target)} kcal a day</span>}
            </div>
            <button type="button" onClick={() => setSheet('goal')} className="tap min-h-11 shrink-0 rounded-full border border-line px-4 text-[15px] font-bold text-g-ink" data-testid="edit-goal">Edit</button>
          </div>
          {p.goalAssumed && <p className="rounded-[14px] bg-bg px-3 py-2 text-[14px] leading-snug text-mute" data-testid="goal-assumed">We set this from your old pace, keeping the same daily target. Tap Edit to pick your own goal weight and date.</p>}
          {!reached && check.warn && check.suggest && (
            <div role="note" className="flex items-center gap-3 rounded-[18px] bg-carbs-soft px-4 py-3 text-[15px] leading-snug text-carbs-ink" data-testid="push-prompt">
              <span className="flex-1"><b>That's a fast pace now.</b> Push goal date to {longDay(check.suggest)}?</span>
              <button type="button" onClick={() => dispatch({ type: 'setProfile', profile: { ...p, goalDate: check.suggest } })} className="tap min-h-11 shrink-0 rounded-full bg-card px-4 font-bold" data-testid="push-date">Push</button>
            </div>
          )}
          {!reached && check.warn && !check.suggest && <PaceWarning check={check} weeklyKg={plan.weeklyKg} sex={p.sex} />}
          <Button variant="ghost" onClick={() => setSheet('log')} data-testid="log-weight">Log weight</Button>
        </section>
      </Card>
      {sheet === 'log' && inFrame(<LogWeightSheet onClose={() => setSheet(null)} onNewGoal={() => setSheet('goal')} />)}
      {sheet === 'goal' && inFrame(<GoalSheet fresh={reached} onClose={() => setSheet(null)} />)}
      {sheet === 'all' && inFrame(<WeighInsSheet onClose={() => setSheet(null)} />)}
    </>
  )
}

const keepProfile = (p: Profile): Profile => ({ ...p, goal: 'keep', goalWeightKg: p.weightKg, goalDate: null, goalAssumed: undefined })

export function GoalReachedCard({ p, onKeep, onNew }: { p: Profile; onKeep: () => void; onNew: () => void }) {
  return (
    <div className="flex flex-col gap-3 rounded-[22px] bg-g-soft p-5 text-g-soft-ink" data-testid="goal-passed">
      <div className="text-[34px] leading-none" aria-hidden="true">🎉</div>
      <h2 className="title text-[24px] text-ink">You reached {round1(p.goalWeightKg)} kg</h2>
      <p className="text-[15px] leading-snug">{p.goalDate && `Your goal was ${round1(p.goalWeightKg)} kg by ${longDay(p.goalDate)}. `}Nice work. Keep your weight from here, or set a new goal.</p>
      <div className="flex gap-2">
        <Button onClick={onKeep} className="!p-3.5" data-testid="switch-keep">Switch to Keep</Button>
        <Button variant="danger" onClick={onNew} className="!border-g/30 !p-3.5 !text-g-soft-ink" data-testid="new-goal">Set a new goal</Button>
      </div>
    </div>
  )
}

/**
 * Sheets sit in #app-frame (like Info), not inside the card, so they cover the screen and stay at the bottom. React
 * events still bubble to the Me form through the portal, so the sheet's own submit stops there (or Me saves its draft).
 */
const inFrame = (node: ReactNode) => createPortal(node, document.getElementById('app-frame') ?? document.body)
const parseKg = (v: string) => { const n = Number(v.replace(',', '.').trim()); return v.trim() && Number.isFinite(n) ? n : NaN }

/** Log weight: a decimal weight (defaults to the last one) and a date (defaults to today), then how it compares. */
export function LogWeightSheet({ onClose, onNewGoal }: { onClose: () => void; onNewGoal?: () => void }) {
  const { state, dispatch, today } = useStore()
  const p = state.profile!
  const last = lastWeigh(state.weights)
  const [kg, setKg] = useState(String(round1(last?.kg ?? p.weightKg)))
  const [date, setDate] = useState(today)
  const [done, setDone] = useState<null | { status: WeighIn | null; latest: boolean; before: number; after: Profile; kg: number; date: string }>(null)
  const n = parseKg(kg)
  const ok = n >= 30 && n <= 300 && !!date && date <= today
  const save = () => {
    if (!ok) return
    const latest = !state.weights.some((w) => w.date > date)
    const status = latest ? weighInStatus(p, n, date) : null
    const after = logWeight(state, date, n).profile!
    dispatch({ type: 'logWeight', date, kg: n })
    setDone({ status, latest, before: p.target, after, kg: round1(n), date })
  }
  return (
    <Sheet label="Log weight" onClose={onClose}>
      {!done ? (
        <form className="flex flex-col gap-4" data-testid="log-weight-sheet" onSubmit={(e) => { e.preventDefault(); e.stopPropagation(); save() }}>
          <h2 className="title text-[26px]">Log weight</h2>
          <div className="flex flex-col items-center gap-1 rounded-[22px] border border-line bg-card px-5 py-5">
            <span className="flex items-end gap-2">
              <input data-autofocus className="big-num num w-[4.2em] border-b-2 border-line bg-transparent pb-1 text-center text-[64px] leading-none text-ink caret-g outline-none focus:border-g" type="text" inputMode="decimal" aria-label="Weight in kilograms" value={kg} onChange={(e) => setKg(e.target.value)} data-testid="weigh-kg" />
              <span className="pb-3 text-[20px] text-mute">kg</span>
            </span>
            {last && <span className="mt-1 text-[14px] text-mute">Last: {round1(last.kg)} kg on {shortDay(last.date)}</span>}
          </div>
          <label className="flex items-center justify-between rounded-[22px] border border-line bg-card py-3 pl-5 pr-3 text-[17px] font-bold">
            Date
            <input type="date" max={today} value={date} onChange={(e) => setDate(e.target.value)} className="rounded-xl border border-line bg-bg px-3 py-2 text-[17px] font-normal" data-testid="weigh-date" />
          </label>
          <div className="flex gap-2" data-keep-visible>
            <Button variant="danger" className="!text-ink" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={!ok} data-testid="weigh-save">Save</Button>
          </div>
        </form>
      ) : (
        <WeighResult r={done} onClose={onClose} onNewGoal={onNewGoal} />
      )}
    </Sheet>
  )
}

function WeighResult({ r, onClose, onNewGoal }: { r: { status: WeighIn | null; latest: boolean; before: number; after: Profile; kg: number; date: string }; onClose: () => void; onNewGoal?: () => void }) {
  const { dispatch, today } = useStore()
  const p = r.after
  const plan = dailyPlan(p)
  const check = paceCheck(p, plan)
  const [pushed, setPushed] = useState(false)
  const when = r.date === today ? 'today' : `on ${shortDay(r.date)}`
  if (r.status === 'reached') {
    return (
      <div className="flex flex-col gap-4" data-testid="weigh-result" data-status="reached">
        <GoalReachedCard p={p} onKeep={() => { dispatch({ type: 'setProfile', profile: keepProfile(p) }); onClose() }} onNew={() => { onClose(); onNewGoal?.() }} />
        <Button variant="ghost" onClick={onClose} data-testid="weigh-done">Done</Button>
      </div>
    )
  }
  const goalBy = p.goalDate ? `${round1(p.goalWeightKg)} kg by ${shortDay(p.goalDate)}` : ''
  const change = plan.target === r.before ? `Your target stays ${fmt(plan.target)} kcal a day.` : `Your target is now ${fmt(plan.target)} kcal a day (was ${fmt(r.before)}).`
  const head =
    !r.latest ? `Saved for ${shortDay(r.date)}` :
    r.status === 'ahead' ? 'Ahead of plan' :
    r.status === 'behind' ? 'A little behind plan' :
    r.status === 'onTrack' ? 'Right on track' : 'Weight saved'
  const body =
    !r.latest ? 'It goes into your trend. Your current weight is your latest weigh-in, so the plan stays the same.' :
    r.status === 'ahead' ? `Nice. You're ahead of where the plan expected, so you can eat a little more and still reach ${goalBy}. ${change}` :
    r.status === 'behind' ? `No stress, weight goes up and down. To still reach ${goalBy}, the plan spreads what's left over the days left. ${change}` :
    r.status === 'onTrack' ? `You're where the plan expected. ${change}` :
    `${change}`
  return (
    <div className="flex flex-col gap-4" data-testid="weigh-result" data-status={r.latest ? r.status ?? 'keep' : 'backfill'}>
      <div>
        <div className="eyebrow">{r.kg} kg {when}</div>
        <h2 className="title mt-1 text-[26px]">{head}</h2>
      </div>
      <p className="text-[16px] leading-snug text-ink">{body}</p>
      {r.latest && check.warn && !pushed && (
        check.suggest ? (
          <div role="note" className="flex flex-col gap-2 rounded-[18px] bg-carbs-soft px-4 py-3 text-[15px] leading-snug text-carbs-ink" data-testid="push-prompt">
            <p><b>That's a fast pace now.</b> {plan.weeklyKg > 0 && `About ${kgWeek(plan.weeklyKg)} kg a week from here.`} Push goal date to {longDay(check.suggest)}?</p>
            <div className="flex gap-2">
              <button type="button" onClick={() => { dispatch({ type: 'setProfile', profile: { ...p, goalDate: check.suggest } }); setPushed(true) }} className="tap min-h-11 rounded-full bg-card px-4 font-bold" data-testid="push-date">Push to {shortDay(check.suggest)}</button>
              <button type="button" onClick={() => setPushed(true)} className="tap min-h-11 rounded-full px-3 font-bold" data-testid="push-keep">Keep {p.goalDate ? shortDay(p.goalDate) : 'date'}</button>
            </div>
          </div>
        ) : <PaceWarning check={check} weeklyKg={plan.weeklyKg} sex={p.sex} />
      )}
      {pushed && <p className="text-[15px] text-mute" data-testid="push-done">Goal date: {p.goalDate && longDay(p.goalDate)}.</p>}
      <Button onClick={onClose} data-testid="weigh-done">Done</Button>
    </div>
  )
}

/** Edit the goal: Lose / Keep / Gain, goal weight and date, with the live result and the soft warning. */
export function GoalSheet({ onClose, fresh }: { onClose: () => void; fresh?: boolean }) {
  const { state, dispatch, today } = useStore()
  const p = state.profile!
  const [goal, setGoal] = useState<Goal>(p.goal)
  const startGw = p.goal === 'keep' || fresh ? '' : String(round1(p.goalWeightKg))
  const [gw, setGw] = useState(startGw)
  const [by, setBy] = useState<ByWhen | null>(p.goalDate && !fresh ? 'custom' : null)
  const [date, setDate] = useState<string | null>(fresh ? null : p.goalDate)
  const g = parseKg(gw)
  const err = goal === 'keep' ? null : goalWeightError(goal, p.weightKg, g)
  const ok = goal === 'keep' || (goalWeightOk(goal, p.weightKg, g) && !!date && date > today)
  const draft: Profile = goal === 'keep'
    ? keepProfile(p)
    : { ...p, goal, goalWeightKg: Number.isNaN(g) ? p.weightKg : round1(g), goalDate: date ?? addDays(today, 182), planFrom: { date: today, kg: p.weightKg }, goalAssumed: undefined }
  const plan = dailyPlan(draft)
  const check = ok ? paceCheck(draft, plan) : null
  const save = () => { if (ok) { dispatch({ type: 'setProfile', profile: draft }); onClose() } }
  return (
    <Sheet label="Your goal" onClose={onClose}>
      <div className="flex flex-col gap-4" data-testid="goal-sheet">
        <h2 className="title text-[26px]">Your goal</h2>
        <div className="flex flex-wrap gap-2">
          {(['lose', 'keep', 'gain'] as Goal[]).map((x) => <Chip key={x} on={goal === x} onClick={() => setGoal(x)} data-testid={`goal-${x}`}>{GOAL_LABEL[x]}</Chip>)}
        </div>
        {goal !== 'keep' && (
          <>
            <label className="flex items-center justify-between rounded-[22px] border border-line bg-card py-3 pl-5 pr-3 text-[17px] font-bold">
              <span>Goal weight<span className="block text-[13px] font-normal text-mute">Now {round1(p.weightKg)} kg</span></span>
              <span className="flex items-center gap-2">
                <input type="text" inputMode="decimal" value={gw} placeholder="0" onChange={(e) => setGw(e.target.value)} className="w-24 rounded-xl border border-line bg-bg px-3 py-2 text-right text-[17px] font-normal" data-testid="goal-kg" aria-label="Goal weight in kilograms" />
                <span className="w-6 font-normal text-mute">kg</span>
              </span>
            </label>
            {err && <p className="-mt-2 px-2 text-[14px] font-semibold text-carbs-ink" data-testid="goal-kg-error">{err}</p>}
            <div>
              <div className="mb-2 text-[15px] font-semibold">By when?</div>
              <ByWhenPicker compact value={by} date={date} today={today} fromKg={p.weightKg} goalKg={g} onPick={(b, d) => { setBy(b); setDate(d) }} />
            </div>
          </>
        )}
        {ok && (
          <div className="flex flex-col gap-2 rounded-[18px] border border-line px-4 py-3" data-testid="goal-preview">
            <p className="text-[16px]"><b className="num">About {fmt(plan.target)} kcal a day</b>{goal !== 'keep' && <span className="text-mute"> · about {kgWeek(plan.weeklyKg)} kg a week</span>}</p>
            {check && <PaceWarning check={check} weeklyKg={plan.weeklyKg} sex={p.sex} onTry={(d) => { setBy('custom'); setDate(d) }} />}
          </div>
        )}
        <div className="flex gap-2" data-keep-visible>
          <Button variant="danger" className="!text-ink" onClick={onClose}>Cancel</Button>
          <Button disabled={!ok} onClick={save} data-testid="goal-save">Save goal</Button>
        </div>
      </div>
    </Sheet>
  )
}

/** Width of the red Delete button a row slides over to show. */
const REVEAL = 96

/**
 * One weigh-in row. Swipe left to show Delete (past half way it stays open; a tap on the row closes it). Edit mode shows
 * Delete on every row, the way to delete without a swipe (keyboard, screen readers, a mouse). Vertical drags scroll.
 */
function SwipeRow({ shown, editing = false, onShow, onDelete, label, children, testid }: { shown: boolean; editing?: boolean; onShow: (open: boolean) => void; onDelete: () => void; label: string; children: ReactNode; testid: string }) {
  const [dx, setDx] = useState<number | null>(null)
  const drag = useRef<{ x: number; y: number; base: number; axis: 'x' | 'y' | null; now: number } | null>(null)
  // The click that ends a swipe must not count as a tap (a tap on an open row closes it).
  const swiped = useRef(false)
  const base = shown ? -REVEAL : 0
  const down = (e: PointerEvent<HTMLDivElement>) => { swiped.current = false; if (editing) return; drag.current = { x: e.clientX, y: e.clientY, base, axis: null, now: base } }
  const move = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current
    if (!d) return
    const mx = e.clientX - d.x, my = e.clientY - d.y
    if (!d.axis && Math.max(Math.abs(mx), Math.abs(my)) > 8) {
      d.axis = Math.abs(mx) > Math.abs(my) ? 'x' : 'y'
      if (d.axis === 'x') e.currentTarget.setPointerCapture?.(e.pointerId)
    }
    if (d.axis !== 'x') return
    d.now = Math.min(0, Math.max(-REVEAL * 1.25, d.base + mx))
    setDx(d.now)
  }
  const up = () => {
    const d = drag.current
    drag.current = null
    swiped.current = d?.axis === 'x'
    if (d?.axis === 'x') onShow(d.now < -REVEAL / 2)
    setDx(null)
  }
  // Edit mode narrows the row instead of sliding it, so the date stays readable next to Delete.
  const x = editing ? 0 : dx ?? base
  return (
    <li className="relative overflow-hidden rounded-[18px] border border-line bg-card" data-testid={testid} data-open={shown ? 'true' : 'false'}>
      <button type="button" onClick={onDelete} tabIndex={shown ? 0 : -1} aria-hidden={!shown} aria-label={`Delete ${label}`}
        className="absolute inset-y-0 right-0 grid place-items-center bg-danger text-[16px] font-bold text-white" style={{ width: REVEAL, opacity: editing || x < 0 ? 1 : 0 }} data-testid="weighin-delete">Delete</button>
      <div
        onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
        onClick={() => { if (swiped.current) swiped.current = false; else if (shown && !editing) onShow(false) }}
        className="relative flex min-h-[64px] items-center gap-3 bg-card px-4 py-2.5 select-none"
        style={{ transform: `translateX(${x}px)`, marginRight: editing ? REVEAL : 0, transition: dx === null ? 'transform .2s ease-out, margin-right .2s ease-out' : 'none', touchAction: 'pan-y' }}
      >
        {children}
      </div>
    </li>
  )
}

/** All weigh-ins, newest first, with swipe-to-delete, an Edit mode and an Undo toast. */
export function WeighInsSheet({ onClose }: { onClose: () => void }) {
  const { state, dispatch } = useStore()
  const [editing, setEditing] = useState(false)
  const [open, setOpen] = useState<string | null>(null)
  const [toast, setToast] = useState<null | { text: string; sub: string; weights: WeightEntry[]; profile: Profile }>(null)
  const timer = useRef(0)
  useEffect(() => () => clearTimeout(timer.current), [])
  const rows = [...state.weights].reverse()
  const del = (e: WeightEntry) => {
    const latest = lastWeigh(state.weights)?.date === e.date
    const after = deleteWeight(state, e.date)
    const snap = { weights: state.weights, profile: state.profile! }
    dispatch({ type: 'deleteWeight', date: e.date })
    setOpen(null)
    const sub = latest && after.weights.length && after.profile
      ? `Weight now ${round1(after.profile.weightKg)} kg · ${fmt(after.profile.target)} kcal a day`
      : !after.weights.length ? `Your weight stays ${round1(state.profile!.weightKg)} kg` : 'Only your trend changes'
    setToast({ text: `Deleted ${round1(e.kg)} kg on ${shortDay(e.date)}`, sub, ...snap })
    clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setToast(null), 5000)
  }
  const undo = () => { if (!toast) return; dispatch({ type: 'restoreWeights', weights: toast.weights, profile: toast.profile }); clearTimeout(timer.current); setToast(null) }
  return (
    <Sheet label="All weigh-ins" onClose={onClose}>
      <div className="flex flex-col gap-3" data-testid="weighins-sheet">
        <div className="flex items-center justify-between gap-3">
          <h2 className="title text-[26px]">All weigh-ins</h2>
          {rows.length > 0 && (
            <button type="button" onClick={() => { setEditing(!editing); setOpen(null) }} aria-pressed={editing}
              className="tap min-h-11 shrink-0 rounded-full border border-line px-4 text-[15px] font-bold text-g-ink" data-testid="weighins-edit">{editing ? 'Done' : 'Edit'}</button>
          )}
        </div>
        <p className="-mt-2 text-[15px] text-mute">{rows.length ? `${rows.length} ${rows.length === 1 ? 'weigh-in' : 'weigh-ins'} · swipe left or tap Edit to delete` : 'No weigh-ins yet.'}</p>
        <ul className="flex flex-col gap-2" aria-label="Weigh-ins">
          {rows.map((w, i) => {
            const older = rows[i + 1]
            const diff = older ? round1(w.kg - older.kg) : null
            const note = i === 0 ? 'Latest · your current weight' : diff === null ? 'First weigh-in' : diff === 0 ? 'Same as before' : `${diff < 0 ? 'Down' : 'Up'} ${Math.abs(diff)} kg`
            return (
              <SwipeRow key={w.date} testid="weighin-row" editing={editing} shown={editing || open === w.date} onShow={(o) => setOpen(o ? w.date : null)} onDelete={() => del(w)} label={`${round1(w.kg)} kg on ${longDay(w.date)}`}>
                <span className="flex flex-1 flex-col leading-snug">
                  <b className="text-[17px]">{longDay(w.date)}</b>
                  <span className={`text-[14px] ${i === 0 ? 'font-semibold text-g-ink' : 'text-mute'}`}>{note}</span>
                </span>
                <span className="num text-[24px]">{round1(w.kg)}<span className="ml-1 text-[14px] text-mute">kg</span></span>
              </SwipeRow>
            )
          })}
        </ul>
        {rows.length > 0 && <p className="text-[14px] leading-snug text-mute">Deleting your latest weigh-in sets your weight back to the one before it and re-plans your daily target.</p>}
        {toast && (
          <div role="status" className="anim-fade sticky bottom-0 z-10 flex items-center justify-between gap-3 rounded-[18px] bg-ink px-4 py-3 text-[15px] text-bg shadow-lg" data-testid="weighin-toast">
            <span className="flex flex-col leading-snug"><span>{toast.text}</span><span className="text-[13px] opacity-80">{toast.sub}</span></span>
            <button type="button" className="tap min-h-11 shrink-0 px-1 font-bold underline" onClick={undo} data-testid="weighin-undo">Undo</button>
          </div>
        )}
        <Button variant="danger" className="!text-ink" onClick={onClose} data-testid="weighins-close">Close</Button>
      </div>
    </Sheet>
  )
}
