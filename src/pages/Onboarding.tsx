import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ACTIVITY_SHORT, validBody, type Draft } from '../components/ProfileFields'
import { Button, Progress } from '../components/ui'
import { RestoreLink } from '../components/Backup'
import { Sheet } from '../components/Sheet'
import { useCountUp } from '../components/motion'
import { WelcomeArt } from '../components/WelcomeArt'
import { ACTIVITY, calcBmr, dailyPlan, fmt, KCAL_PER_KG, PACE, PACES, paceKcal } from '../lib/calc'
import { normaliseProfile, useStore } from '../lib/store'
import type { Activity, Goal, Sex } from '../lib/types'

/**
 * v1.8 calmer onboarding (Reed's mock for Jordy): a welcome, then one question per screen with a thin progress bar,
 * a target reveal and an optional extras screen. UX only: the Draft, calcBmr, dailyPlan and the stored profile are
 * what v1.7 saved (bmrCustom false, goal weight defaults to the current weight), except daily movement now starts
 * on (Jordy, v1.8) and the 20% cap is gone. Activity is asked before pace so the pace chips can show real numbers.
 */
type Step = 'welcome' | 'sex' | 'age' | 'body' | 'goal' | 'watch' | 'pace' | 'activity' | 'target' | 'extras'

/** v1.10: the question order. Watch users skip Activity (their watch counts movement), Keep skips Pace. */
const orderFor = (goal: Goal, watch: boolean | null): Step[] => ['welcome', 'sex', 'age', 'body', 'goal', 'watch', ...(watch === true ? [] : ['activity' as Step]), ...(goal === 'keep' ? [] : ['pace' as Step]), 'target', 'extras']

/** Real wording of the burn button in Log (exercise mode). */
const WATCH_LINE = 'Add your watch’s active calories each day with Quick add burn.'

const GOALS: { g: Goal; title: string; hint: string }[] = [
  { g: 'lose', title: 'Lose weight', hint: 'Eat a little under what you burn' },
  { g: 'keep', title: 'Keep my weight', hint: 'Stay where you are, eat with a plan' },
  { g: 'gain', title: 'Gain weight', hint: 'A small, steady surplus' },
]
const ACT_HINT: Record<Activity, string> = {
  sedentary: 'Desk job, little exercise',
  light: 'Exercise 1 to 3 days a week',
  moderate: 'Exercise 3 to 5 days a week',
  active: 'Exercise 6 to 7 days a week',
  very: 'Physical job or training twice a day',
}

/** kg a week from the plan's daily deficit or surplus (7,700 kcal per kg), to the nearest 0.05. */
const weekKg = (kcal: number) => Math.round(((Math.abs(kcal) * 7) / KCAL_PER_KG) * 20) / 20

/** Where the /onboarding route sends a person once their profile is saved (Home unless an extra picked Me). */
export const afterOnboarding = { to: '/' }

export default function Onboarding() {
  const { dispatch } = useStore()
  const [step, setStep] = useState<Step>('welcome')
  useEffect(() => { afterOnboarding.to = '/' }, [])
  const [how, setHow] = useState(false)
  // Cards only show a tick once the person has picked them (the draft keeps v1.7's defaults underneath).
  const [answered, setAnswered] = useState<Set<keyof Draft>>(new Set())
  const [d, setD] = useState<Draft>({ age: NaN, sex: 'female', heightCm: NaN, weightKg: NaN, activity: 'light', goal: 'lose', pace: 'standard' })
  // v1.10: asked before Activity. Yes turns daily movement off (the watch counts it) and skips Activity.
  const [watch, setWatch] = useState<boolean | null>(null)
  const profile = () => normaliseProfile({ ...d, bmr: calcBmr(d), bmrCustom: false, includeMovement: watch !== true })
  const plan = validBody(d) ? dailyPlan(profile()) : null

  // Question order. Activity comes before pace (pace results depend on it). Pace is skipped for Keep.
  const order = orderFor(d.goal, watch)
  const flow: Step[] = order.filter((s) => s !== 'welcome' && s !== 'target' && s !== 'extras')
  const go = (s: Step) => setStep(s)
  const next = (from: Step = step, goal = d.goal, w = watch) => {
    const o = orderFor(goal, w)
    go(o[o.indexOf(from) + 1])
  }
  const pickWatch = (w: boolean) => {
    setWatch(w)
    setTimeout(() => next('watch', d.goal, w), 220)
  }
  const back = () => go(order[Math.max(0, order.indexOf(step) - 1)])
  // Auto-advance: show the picked card for a beat, then move on.
  const pick = (patch: Partial<Draft>) => {
    const nd = { ...d, ...patch }
    setD(nd)
    setAnswered(new Set([...answered, ...(Object.keys(patch) as (keyof Draft)[])]))
    const from = step
    setTimeout(() => next(from, nd.goal), 220)
  }

  const finish = (then = '/') => {
    // The /onboarding route redirects as soon as a profile exists (App.tsx), so it takes the destination from here
    // rather than racing a second navigate (extras -> AI key setup in Me).
    afterOnboarding.to = then
    dispatch({ type: 'setProfile', profile: profile() })
  }

  const qIndex = flow.indexOf(step)
  const progress = step === 'target' ? 1 : qIndex >= 0 ? (qIndex + 1) / (flow.length + 1) : 0

  const ageOk = d.age >= 14 && d.age <= 100
  const bodyOk = d.heightCm >= 120 && d.heightCm <= 230 && d.weightKg >= 30 && d.weightKg <= 300

  return (
    <main className="flex flex-1 flex-col overflow-y-auto px-5 pb-5" data-testid="onboarding">
      {step !== 'welcome' && step !== 'extras' && (
        <div className="-mx-2 flex h-11 shrink-0 items-center gap-2">
          <button type="button" onClick={back} aria-label="Back" data-testid="ob-back" className="tap grid h-11 w-11 shrink-0 place-items-center rounded-full text-ink">
            <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 5-7 7 7 7" /></svg>
          </button>
          <Progress value={progress} label={step === 'target' ? 'All questions answered' : `Question ${qIndex + 1} of ${flow.length}`} />
          <div className="w-11 shrink-0" />
        </div>
      )}

      <div key={step} className="step-in flex flex-1 flex-col">
        {step === 'welcome' && (
          <div className="flex flex-1 flex-col" data-testid="ob-welcome">
            <div className="flex flex-1 flex-col items-center justify-center text-center">
              <WelcomeArt className="mb-7" />
              <h1 className="title text-[40px] leading-[1.05]">Calorie counter</h1>
              <p className="mt-3 max-w-[290px] text-[18px] leading-snug text-mute">Know your daily calories in a minute. Everything stays on your phone.</p>
            </div>
            <div className="flex flex-col gap-2">
              <Button onClick={() => go('sex')} data-testid="ob-start">Get started</Button>
              <RestoreLink label="Restore a backup" />
            </div>
          </div>
        )}

        {step === 'sex' && (
          <Question title="What's your sex?" hint="Used only for the calorie formula.">
            <div className="flex flex-col gap-3">
              {(['female', 'male'] as Sex[]).map((s) => (
                <Option key={s} on={answered.has('sex') && d.sex === s} onClick={() => pick({ sex: s })} title={s === 'female' ? 'Female' : 'Male'} testid={`ob-sex-${s}`} big />
              ))}
            </div>
          </Question>
        )}

        {step === 'age' && (
          <Question title="How old are you?" hint="Your burn slows a little each decade." footer={<Button disabled={!ageOk} onClick={() => next()} data-testid="ob-next">Continue</Button>}>
            <form className="flex flex-1 flex-col items-center justify-center pb-16" onSubmit={(e) => { e.preventDefault(); if (ageOk) next() }}>
              <BigNumber value={d.age} onChange={(n) => setD({ ...d, age: n })} unit="years" label="Age in years" name="age" autoFocus testid="ob-age" />
            </form>
          </Question>
        )}

        {step === 'body' && (
          <Question title="Your height and weight" hint="Today's weight is fine. You can update it anytime." footer={<Button disabled={!bodyOk} onClick={() => next()} data-testid="ob-next">Continue</Button>}>
            <form className="flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); if (bodyOk) next() }}>
              <Field label="Height"><BigNumber value={d.heightCm} onChange={(n) => setD({ ...d, heightCm: n })} unit="cm" label="Height in centimetres" name="heightCm" autoFocus testid="ob-height" small /></Field>
              <Field label="Weight"><BigNumber value={d.weightKg} onChange={(n) => setD({ ...d, weightKg: n })} unit="kg" label="Weight in kilograms" name="weightKg" testid="ob-weight" small /></Field>
              <button type="submit" hidden />
            </form>
          </Question>
        )}

        {step === 'goal' && (
          <Question title="What's your goal?">
            <div className="flex flex-col gap-3">
              {GOALS.map(({ g, title, hint }) => (
                <Option key={g} on={answered.has('goal') && d.goal === g} onClick={() => pick({ goal: g })} title={title} hint={hint} testid={`ob-goal-${g}`} />
              ))}
            </div>
          </Question>
        )}

        {step === 'pace' && (
          <Question title={d.goal === 'gain' ? 'How fast should you gain?' : 'How fast should you lose?'} hint={watch === true ? 'Worked out from your resting burn. Your watch adds the rest.' : 'Slower is easier to stick with.'} footer={<Button onClick={() => next()} data-testid="ob-next">Continue</Button>}>
            <div className="flex flex-col gap-3" data-testid="ob-pace">
              {PACES.map((p) => {
                // Each chip shows this person's real result for that pace (after the floor), not the nominal kg.
                const r = dailyPlan({ ...profile(), pace: p })
                const on = d.pace === p
                return (
                  <button key={p} type="button" aria-pressed={on} onClick={() => setD({ ...d, pace: p })} data-testid={`ob-pace-${p}`}
                    className={`opt flex h-[68px] items-center justify-between rounded-full border-2 px-6 text-[17px] font-bold ${on ? 'border-ink bg-ink text-bg' : 'border-line bg-card text-ink'}`}>
                    <span>{PACE[p].label}</span>
                    <span className="flex flex-col items-end leading-tight">
                      <span className="num text-[17px] font-semibold">{fmt(r.target)} kcal</span>
                      <span className={`text-[14px] font-semibold ${on ? 'text-bg/75' : 'text-mute'}`}>{r.atMinimum ? 'at the minimum' : `about ${weekKg(r.planDeficit)} kg a week`}</span>
                    </span>
                  </button>
                )
              })}
              <p className="px-2 pt-1 text-center text-[15px] text-mute" data-testid="ob-pace-hint">
                {plan ? paceLine(d.goal, d.pace, plan, watch === true) : ''}
              </p>
              {watch === true && <WatchNote />}
            </div>
          </Question>
        )}

        {step === 'watch' && (
          <Question title="Do you wear a watch that tracks your burn?" hint="Like an Apple Watch, Garmin or Fitbit.">
            <div className="flex flex-col gap-3" data-testid="ob-watch">
              <WatchOption on={watch === true} onClick={() => pickWatch(true)} title="Yes, I use a watch" hint="It counts my movement" icon={<WatchIcon />} testid="ob-watch-yes" />
              <WatchOption on={watch === false} onClick={() => pickWatch(false)} title="No" hint="I’ll tell you how active I am" icon={<WalkIcon />} testid="ob-watch-no" />
            </div>
          </Question>
        )}

        {step === 'activity' && (
          <Question title="How active is a normal week?">
            <div className="flex flex-col gap-2.5">
              {(Object.keys(ACTIVITY) as Activity[]).map((a) => (
                <Option key={a} on={answered.has('activity') && d.activity === a} onClick={() => pick({ activity: a })} title={ACTIVITY_SHORT[a]} hint={ACT_HINT[a]} testid={`ob-act-${a}`} compact />
              ))}
            </div>
          </Question>
        )}

        {step === 'target' && plan && <Target d={d} plan={plan} watch={watch === true} onHow={() => setHow(true)} onNext={() => next()} />}

        {step === 'extras' && (
          <div className="flex flex-1 flex-col pt-6" data-testid="ob-extras">
            <div className="flex justify-end">
              <button type="button" onClick={() => finish()} className="px-2 py-1 text-[16px] font-bold text-mute" data-testid="ob-skip">Skip</button>
            </div>
            <h1 className="title mt-4 text-[34px] leading-[1.1]">Two optional extras</h1>
            <p className="mt-2 text-[16px] text-mute">Both live in Me later, so there's no rush.</p>
            <div className="mt-7 flex flex-col gap-3">
              <div className="flex gap-4 rounded-[22px] border border-line bg-card p-5" data-testid="ob-a2hs">
                <span className="tile !h-12 !w-12 text-g"><ShareIcon /></span>
                <div className="flex flex-col gap-1">
                  <b className="text-[17px]">Add to Home Screen</b>
                  <p className="text-[15px] leading-snug text-mute">In Safari, tap Share, then Add to Home Screen. It opens full screen and works offline.</p>
                </div>
              </div>
              <button type="button" onClick={() => finish('/settings?ai=1')} className="opt flex gap-4 rounded-[22px] border border-line bg-card p-5 text-left" data-testid="ob-ai">
                <span className="tile !h-12 !w-12 text-g"><SparkIcon /></span>
                <span className="flex flex-1 flex-col gap-1">
                  <b className="text-[17px]">Set up AI photo estimates</b>
                  <span className="text-[15px] leading-snug text-mute">Snap your plate for a rough count. Uses your own API key.</span>
                </span>
                <span className="self-center text-mute-soft" aria-hidden="true"><svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 5 7 7-7 7" /></svg></span>
              </button>
            </div>
            <div className="flex-1" />
            <Button onClick={() => finish()} data-testid="ob-done">Done</Button>
          </div>
        )}
      </div>

      {how && plan && <HowSheet d={d} plan={plan} watch={watch === true} onClose={() => setHow(false)} />}
    </main>
  )
}

function Question({ title, hint, children, footer }: { title: string; hint?: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="flex flex-1 flex-col">
      <h1 className="title mt-8 text-[34px] leading-[1.1]">{title}</h1>
      {hint && <p className="mt-2 text-[16px] text-mute">{hint}</p>}
      <div className="mt-8 flex flex-1 flex-col">{children}</div>
      {footer && <div className="pt-4">{footer}</div>}
    </div>
  )
}

function Option({ on, onClick, title, hint, testid, big, compact }: { on: boolean; onClick: () => void; title: string; hint?: string; testid: string; big?: boolean; compact?: boolean }) {
  return (
    <button type="button" aria-pressed={on} onClick={onClick} data-testid={testid}
      className={`opt flex w-full items-center gap-4 rounded-[22px] border-2 text-left ${big ? 'min-h-[88px] px-6' : compact ? 'min-h-[70px] px-5 py-3' : 'min-h-[84px] px-5 py-4'} ${on ? 'border-ink bg-card' : 'border-line bg-card'}`}>
      <span className="flex flex-1 flex-col gap-0.5">
        <span className={`${big ? 'text-[21px]' : 'text-[18px]'} font-bold`}>{title}</span>
        {hint && <span className="text-[15px] leading-snug text-mute">{hint}</span>}
      </span>
      <span aria-hidden="true" className={`grid h-7 w-7 shrink-0 place-items-center rounded-full border-2 ${on ? 'border-ink bg-ink text-bg' : 'border-line'}`}>
        {on && <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>}
      </span>
    </button>
  )
}

/** v1.10: a big card for the watch question, with an icon so the two answers read at a glance. */
function WatchOption({ on, onClick, title, hint, icon, testid }: { on: boolean; onClick: () => void; title: string; hint: string; icon: ReactNode; testid: string }) {
  return (
    <button type="button" aria-pressed={on} onClick={onClick} data-testid={testid}
      className={`opt flex min-h-[104px] w-full items-center gap-4 rounded-[22px] border-2 bg-card px-5 py-4 text-left ${on ? 'border-ink' : 'border-line'}`}>
      <span className="tile !h-14 !w-14 shrink-0 text-g" aria-hidden="true">{icon}</span>
      <span className="flex flex-1 flex-col gap-0.5">
        <span className="text-[20px] font-bold">{title}</span>
        <span className="text-[15px] leading-snug text-mute">{hint}</span>
      </span>
      <span aria-hidden="true" className={`grid h-7 w-7 shrink-0 place-items-center rounded-full border-2 ${on ? 'border-ink bg-ink text-bg' : 'border-line'}`}>
        {on && <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>}
      </span>
    </button>
  )
}

/** The one thing a watch user has to do each day. */
function WatchNote() {
  return (
    <div className="flex items-start gap-3 rounded-[18px] bg-g-soft px-4 py-3 text-left text-[15px] leading-snug text-g-soft-ink" data-testid="ob-watch-note">
      <span className="mt-0.5 shrink-0" aria-hidden="true"><WatchIcon className="h-5 w-5" /></span>
      <span>{WATCH_LINE}</span>
    </div>
  )
}

function WatchIcon({ className = 'h-7 w-7' }: { className?: string }) {
  return <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="3.5" /><path d="M9 6l.6-3h4.8L15 6M9 18l.6 3h4.8L15 18M12 9.5V12l1.6 1.2" /></svg>
}
function WalkIcon() {
  return <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="13" cy="4.5" r="1.8" /><path d="M10 21l2-6 2.5 2.5V21M8 11.5l3-3.5h2.5l2.5 3.5H19M11 8l-1.5 5.5" /></svg>
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex items-center justify-between rounded-[22px] border border-line bg-card py-3 pl-5 pr-4">
      <span className="text-[17px] font-bold">{label}</span>
      {children}
    </label>
  )
}

function BigNumber({ value, onChange, unit, label, name, autoFocus, testid, small }: { value: number; onChange: (n: number) => void; unit: string; label: string; name: string; autoFocus?: boolean; testid: string; small?: boolean }) {
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => { if (autoFocus) ref.current?.focus({ preventScroll: true }) }, [autoFocus])
  const v = Number.isNaN(value) ? '' : String(value)
  return (
    <span className={`relative flex items-end gap-2`}>
      <input
        ref={ref}
        className={`big-num num border-b-2 border-line bg-transparent text-center text-ink caret-g outline-none placeholder:text-line focus:border-g focus-visible:outline-none ${small ? 'pb-1 text-[48px]' : 'pb-2 text-[88px]'} leading-none`}
        style={{ width: `${Math.max(2, v.length) * 0.62 + 0.3}em` }}
        type="number"
        inputMode="decimal"
        aria-label={label}
        name={name}
        placeholder="0"
        value={v}
        data-testid={testid}
        onChange={(e) => onChange(e.target.value === '' ? NaN : Number(e.target.value))}
      />
      <span className={`${small ? 'w-7 pb-3 text-[17px]' : 'absolute bottom-5 left-full ml-1 text-[20px]'} text-mute`}>{unit}</span>
    </span>
  )
}

type Plan = ReturnType<typeof dailyPlan>

/** The floor in words: your BMR when that is what holds the target, else the 1,500 / 1,200 kcal minimum. */
const floorName = (plan: Plan) => (plan.floor === plan.bmr ? `your resting burn (${fmt(plan.floor)} kcal)` : `the ${fmt(plan.floor)} kcal minimum`)

/** One line under the pace chips, from the real plan for the picked pace (after the floor). */
function paceLine(goal: Goal, pace: Draft['pace'], plan: Plan, watch = false) {
  if (plan.atMinimum) return `You're already at ${floorName(plan)}. Exercise creates your deficit.`
  if (plan.floored) return `${PACE[pace].label} is held at ${floorName(plan)}, so it works out to about ${weekKg(plan.planDeficit)} kg a week, not ${PACE[pace].kg}.`
  return `About ${fmt(Math.abs(plan.planDeficit))} kcal a day ${goal === 'gain' ? 'over' : 'under'} your ${fmt(plan.planBase)} kcal ${watch ? 'resting' : 'daily'} burn.`
}

function goalLine(goal: Goal, plan: Plan) {
  if (goal === 'keep' || plan.atMinimum) return goal === 'keep' && !plan.atMinimum ? 'Keeps your current weight' : 'Your exercise creates the deficit'
  const kg = weekKg(plan.planDeficit)
  return `${goal === 'lose' ? 'Lose' : 'Gain'} about ${kg} kg a week`
}

function Target({ d, plan, watch, onHow, onNext }: { d: Draft; plan: Plan; watch: boolean; onHow: () => void; onNext: () => void }) {
  const shown = useCountUp(plan.target, undefined, 800, 150)
  return (
    <div className="flex flex-1 flex-col" data-testid="ob-target">
      <div className="flex flex-1 flex-col items-center justify-center text-center">
        <div className="eyebrow">Your daily target</div>
        <div className="num mt-3 text-[96px] leading-none text-g-ink" data-testid="target">{fmt(shown)}</div>
        <div className="mt-2 text-[17px] text-mute">kcal a day</div>
        <p className="mt-8 text-[20px] font-bold" data-testid="goal-line">{goalLine(d.goal, plan)}</p>
        {plan.floored && <p className="mt-1.5 max-w-[280px] text-[15px] text-mute" data-testid="floor-line">Held at {floorName(plan)}, the lowest we go.</p>}
        {watch && <div className="mt-6 w-full max-w-[320px]"><WatchNote /></div>}
        <button type="button" onClick={onHow} className="mt-6 px-2 py-1 text-[16px] font-bold text-g-ink underline decoration-g/40 underline-offset-4" data-testid="ob-how">How we worked this out</button>
      </div>
      <p className="pb-3 text-center text-[14px] text-mute">You can change any of this in Me.</p>
      <Button onClick={onNext} data-testid="ob-next">Continue</Button>
    </div>
  )
}

function HowSheet({ d, plan, watch, onClose }: { d: Draft; plan: Plan; watch: boolean; onClose: () => void }) {
  const want = paceKcal(d.pace)
  const pace = PACE[d.pace].label
  // BMR + movement = daily burn, then the pace takes off (or adds) to give the target.
  const rows: [string, string, boolean?][] = [
    ['Resting burn (BMR)', `${fmt(plan.bmr)} kcal`],
    watch ? ['Daily movement', 'From your watch'] : [`Daily movement (${ACTIVITY_SHORT[d.activity].toLowerCase()})`, `+${fmt(plan.movement)} kcal`],
    [watch ? 'Plan base' : 'Your daily burn', `${fmt(plan.planBase)} kcal`, true],
  ]
  if (d.goal === 'lose' && plan.planDeficit > 0) rows.push([plan.floored ? `${pace} pace, held at the floor` : `${pace} pace`, `−${fmt(plan.planDeficit)} kcal`])
  if (d.goal === 'gain' && plan.planDeficit < 0) rows.push([`${pace} pace`, `+${fmt(-plan.planDeficit)} kcal`])
  if (d.goal === 'keep' && plan.target > plan.planBase) rows.push(['Raised to the minimum', `+${fmt(plan.target - plan.planBase)} kcal`])
  const kg = weekKg(plan.planDeficit)
  const why =
    d.goal === 'keep'
      ? `Keep matches your ${watch ? 'resting' : 'daily'} burn${plan.target > plan.planBase ? `, raised to ${floorName(plan)}` : ''}.`
      : plan.atMinimum
        ? `You're already at ${floorName(plan)}, so exercise creates your deficit.`
        : plan.floored
          ? `${pace} pace asks for ${fmt(want)} kcal a day, but the target never goes under ${floorName(plan)}. So it lands at ${fmt(plan.planDeficit)}, about ${kg} kg a week.`
          : `${pace} pace ${d.goal === 'gain' ? 'adds' : 'takes off'} ${fmt(want)} kcal a day, about ${kg} kg a week.${d.goal === 'lose' ? ` The target never goes under ${floorName(plan)}.` : ''}`
  return (
    <Sheet label="How we worked this out" onClose={onClose}>
      <div data-testid="ob-how-sheet" className="flex flex-col gap-4">
        <h2 className="title text-[26px]">How we worked this out</h2>
        <div className="rounded-[18px] border border-line px-4">
          {rows.map(([k, v, sum]) => (
            <div key={k} className={`flex justify-between border-b border-line py-3 text-[16px] ${sum ? 'font-bold' : ''}`}><span>{k}</span><b className="num font-semibold">{v}</b></div>
          ))}
          <div className="flex justify-between py-3 text-[16px]"><b>Daily target</b><b className="num text-g-ink">{fmt(plan.target)} kcal</b></div>
        </div>
        <p className="text-[15px] leading-snug text-mute" data-testid="ob-how-why">BMR uses the Mifflin-St Jeor formula with your age, height, weight and sex. {why}</p>
        <div>
          <div className="mb-2 text-[15px] font-bold">Macro goals</div>
          <div className="grid grid-cols-3 gap-2">
            {([['Protein', plan.protein, 'bg-protein-soft text-protein-ink'], ['Carbs', plan.carbs, 'bg-carbs-soft text-carbs-ink'], ['Fat', plan.fat, 'bg-fat-soft text-fat-ink']] as const).map(([k, g, c]) => (
              <div key={k} className={`rounded-2xl px-3 py-2.5 text-center ${c}`}>
                <div className="num text-[24px] leading-tight">{g} g</div>
                <div className="text-[13px] font-semibold">{k}</div>
              </div>
            ))}
          </div>
          <p className="mt-2 text-[15px] leading-snug text-mute">Set from your {watch ? 'resting' : 'daily'} burn ({fmt(plan.maintenance)} kcal) and current weight. They stay the same on exercise days.</p>
        </div>
        <p className="text-[15px] leading-snug text-mute">{watch ? 'Daily movement is off because your watch counts it. Each day, add its active calories with Quick add burn and your budget grows to match.' : 'Got a watch later? Turn daily movement off in Me.'}</p>
        <Button variant="ghost" onClick={onClose} data-testid="ob-how-close">Got it</Button>
      </div>
    </Sheet>
  )
}

function ShareIcon() {
  return <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 15V3.5M8 7.5l4-4 4 4" /><path d="M8 10.5H6.5a1.5 1.5 0 0 0-1.5 1.5v7.5A1.5 1.5 0 0 0 6.5 21h11a1.5 1.5 0 0 0 1.5-1.5V12a1.5 1.5 0 0 0-1.5-1.5H16" /></svg>
}
function SparkIcon() {
  return <svg viewBox="0 0 24 24" className="h-6 w-6" fill="currentColor" aria-hidden="true"><path d="M12 2.5c.5 4.6 2.9 7 7.5 7.5-4.6.5-7 2.9-7.5 7.5-.5-4.6-2.9-7-7.5-7.5 4.6-.5 7-2.9 7.5-7.5z" /><path d="M19 15c.2 1.8 1.2 2.8 3 3-1.8.2-2.8 1.2-3 3-.2-1.8-1.2-2.8-3-3 1.8-.2 2.8-1.2 3-3z" /></svg>
}
