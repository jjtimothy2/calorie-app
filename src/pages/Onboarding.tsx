import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ACTIVITY_SHORT, validBody, type Draft } from '../components/ProfileFields'
import { Button, Progress } from '../components/ui'
import { RestoreLink } from '../components/Backup'
import { Sheet } from '../components/Sheet'
import { useCountUp } from '../components/motion'
import { WelcomeArt } from '../components/WelcomeArt'
import { useInstall } from '../lib/install'
import { ACTIVITY, calcBmr, dailyPlan, fmt, kgWeek, longDay, paceCheck, safeDeficit, saferPlan, shortDay, type SafeDeficit } from '../lib/calc'
import { byWhenDate, ByWhenPicker, goalWeightError, goalWeightOk, PaceWarning, skipGoalKg, SKIP_BY_WHEN, UnsafeCard, type ByWhen } from '../components/GoalPlan'
import { normaliseProfile, useStore } from '../lib/store'
import type { Activity, Goal, Sex } from '../lib/types'

/**
 * v1.8 calmer onboarding (Reed's mock for Jordy): a welcome, then one question per screen with a thin progress bar,
 * a target reveal and an optional extras screen. UX only: the Draft, calcBmr, dailyPlan and the stored profile are
 * what v1.7 saved (bmrCustom false, goal weight defaults to the current weight), except daily movement now starts
 * on (Jordy, v1.8) and the 20% cap is gone.
 * Goal-date plan: the pace step is gone. Lose and Gain ask for a goal weight and a date right after the goal; the
 * target is |weight - goal| x 7,700 / days, with a soft warning (never a block) when it looks fast.
 */
type Step = 'welcome' | 'sex' | 'age' | 'body' | 'goal' | 'goalWeight' | 'byWhen' | 'watch' | 'activity' | 'target' | 'extras'

/** The question order. Keep skips Goal weight and By when; watch users skip Activity (their watch counts movement). */
const orderFor = (goal: Goal, watch: boolean | null): Step[] => ['welcome', 'sex', 'age', 'body', 'goal', ...(goal === 'keep' ? [] : ['goalWeight', 'byWhen'] as Step[]), 'watch', ...(watch === true ? [] : ['activity' as Step]), 'target', 'extras']

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

type OBDraft = Draft & { goalWeightKg: number; goalDate: string | null }

/** Where the /onboarding route sends a person once their profile is saved (Home unless an extra picked Me). */
export const afterOnboarding = { to: '/' }

export default function Onboarding() {
  const { dispatch, today } = useStore()
  const [step, setStep] = useState<Step>('welcome')
  useEffect(() => { afterOnboarding.to = '/' }, [])
  const [how, setHow] = useState(false)
  // Cards only show a tick once the person has picked them (the draft keeps v1.7's defaults underneath).
  const [answered, setAnswered] = useState<Set<keyof OBDraft>>(new Set())
  const [d, setD] = useState<OBDraft>({ age: NaN, sex: 'female', heightCm: NaN, weightKg: NaN, activity: 'light', goal: 'lose', goalWeightKg: NaN, goalDate: null })
  const [byWhen, setByWhen] = useState<ByWhen | null>(null)
  // Goal weight and By when can both be skipped: a 5% first goal and 6 months, noted on the result screen.
  const [skipped, setSkipped] = useState<{ kg?: boolean; date?: boolean }>({})
  const skipKg = () => { setD({ ...d, goalWeightKg: skipGoalKg(d.goal, d.weightKg) }); setSkipped({ ...skipped, kg: true }); next() }
  const skipDate = () => { setByWhen(SKIP_BY_WHEN); setD({ ...d, goalDate: byWhenDate(SKIP_BY_WHEN, today) }); setSkipped({ ...skipped, date: true }); next() }
  // v1.10: asked before Activity. Yes turns daily movement off (the watch counts it) and skips Activity.
  const [watch, setWatch] = useState<boolean | null>(null)
  // The plan starts today at today's weight. Keep has no goal date (normaliseProfile sets goal weight = weight).
  const profile = () => normaliseProfile({ ...d, goalWeightKg: d.goal === 'keep' ? d.weightKg : d.goalWeightKg, goalDate: d.goal === 'keep' ? null : d.goalDate, planFrom: { date: today, kg: d.weightKg }, bmr: calcBmr(d), bmrCustom: false, includeMovement: watch !== true }, today)
  const plan = validBody(d) ? dailyPlan(profile()) : null
  // v1.15: a Lose plan shows its daily deficit (capped to a safe size) instead of the daily target.
  const lose = d.goal === 'lose' && !!plan && plan.gap > 0

  // Question order (see orderFor).
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
  const pick = (patch: Partial<OBDraft>) => {
    const nd = { ...d, ...patch }
    setD(nd)
    setAnswered(new Set([...answered, ...(Object.keys(patch) as (keyof OBDraft)[])]))
    const from = step
    setTimeout(() => next(from, nd.goal), 220)
  }

  const finish = (then = '/') => {
    // v1.15: a Lose date over the safe cap has no Continue, so it never gets saved from here.
    if (lose && safeDeficit(profile(), plan!).unsafe) { go('target'); return }
    // The /onboarding route redirects as soon as a profile exists (App.tsx), so it takes the destination from here
    // rather than racing a second navigate (extras -> AI key setup in Me).
    afterOnboarding.to = then
    dispatch({ type: 'setProfile', profile: profile() })
  }

  const qIndex = flow.indexOf(step)
  const progress = step === 'target' ? 1 : qIndex >= 0 ? (qIndex + 1) / (flow.length + 1) : 0

  const ageOk = d.age >= 14 && d.age <= 100
  const bodyOk = d.heightCm >= 120 && d.heightCm <= 230 && d.weightKg >= 30 && d.weightKg <= 300
  const gwOk = goalWeightOk(d.goal, d.weightKg, d.goalWeightKg)
  const gwError = goalWeightError(d.goal, d.weightKg, d.goalWeightKg)
  const dateOk = !!d.goalDate && d.goalDate > today

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
              <InstallHint />
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

        {step === 'goalWeight' && (
          <Question title="What's your goal weight?" hint={`You're ${d.weightKg} kg now. Pick a weight to ${d.goal === 'gain' ? 'gain' : 'lose'} to.`} footer={<StepFooter ok={gwOk} onNext={() => { setSkipped({ ...skipped, kg: false }); next() }} onSkip={skipKg} />}>
            <form className="flex flex-1 flex-col items-center justify-center pb-16" onSubmit={(e) => { e.preventDefault(); if (gwOk) { setSkipped({ ...skipped, kg: false }); next() } }} data-testid="ob-goal-weight">
              <BigNumber value={d.goalWeightKg} onChange={(n) => setD({ ...d, goalWeightKg: n })} unit="kg" label="Goal weight in kilograms" name="goalWeightKg" autoFocus testid="ob-goal-kg" />
              <p className={`mt-5 min-h-[22px] text-center text-[15px] ${gwError ? 'font-semibold text-carbs-ink' : 'text-mute'}`} data-testid="ob-goal-kg-hint">
                {gwError ?? (gwOk ? `That's ${Math.round(Math.abs(d.weightKg - d.goalWeightKg) * 10) / 10} kg to ${d.goal === 'gain' ? 'gain' : 'lose'}.` : '')}
              </p>
            </form>
          </Question>
        )}

        {step === 'byWhen' && (
          <Question title="By when?" hint="Pick a date. You can change it later in Me." footer={<StepFooter ok={dateOk} onNext={() => { setSkipped({ ...skipped, date: false }); next() }} onSkip={skipDate} />}>
            <ByWhenPicker value={byWhen} date={d.goalDate} today={today} fromKg={d.weightKg} goalKg={d.goalWeightKg}
              onPick={(by, date) => { setByWhen(by); setD({ ...d, goalDate: date }) }} />
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

        {step === 'target' && plan && (lose
          ? <DeficitTarget d={d} plan={plan} s={safeDeficit(profile(), plan)} safer={saferPlan(profile())} watch={watch === true} skipped={skipped} onSafer={(date) => { setByWhen('custom'); setD({ ...d, goalDate: date }); setSkipped({ ...skipped, date: false }) }} onChangeGoal={() => go('goalWeight')} onHow={() => setHow(true)} onNext={() => next()} />
          : <Target d={d} plan={plan} watch={watch === true} today={today} skipped={skipped} onTry={(date) => { setByWhen('custom'); setD({ ...d, goalDate: date }) }} onHow={() => setHow(true)} onNext={() => next()} />)}

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

      {how && plan && (lose
        ? <HowSheetDeficit d={d} plan={plan} s={safeDeficit(profile(), plan)} watch={watch === true} onClose={() => setHow(false)} />
        : <HowSheet d={d} plan={plan} watch={watch === true} onClose={() => setHow(false)} />)}
    </main>
  )
}

/** Continue, with a quiet Skip under it (Goal weight and By when). */
function StepFooter({ ok, onNext, onSkip }: { ok: boolean; onNext: () => void; onSkip: () => void }) {
  return (
    <div className="flex flex-col gap-1">
      <Button disabled={!ok} onClick={onNext} data-testid="ob-next">Continue</Button>
      <button type="button" onClick={onSkip} className="min-h-11 self-center px-3 text-[16px] font-bold text-mute" data-testid="ob-step-skip">Skip for now</button>
    </div>
  )
}

function Question({ title, hint, children, footer }: { title: string; hint?: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="flex flex-1 flex-col">
      <h1 className="title mt-8 text-[34px] leading-[1.1] [@media(max-height:700px)]:mt-4">{title}</h1>
      {hint && <p className="mt-2 text-[16px] text-mute">{hint}</p>}
      <div className="mt-8 flex flex-1 flex-col [@media(max-height:700px)]:mt-4">{children}</div>
      {footer && <div className="sticky bottom-0 bg-bg pt-4">{footer}</div>}
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

/** "Lose about 0.4 kg a week" (Keep: "Keeps your current weight"). */
function goalLine(goal: Goal, plan: Plan) {
  if (goal === 'keep' || plan.gap === 0) return 'Keeps your current weight'
  return `${goal === 'lose' ? 'Lose' : 'Gain'} about ${kgWeek(plan.weeklyKg)} kg a week`
}

function Target({ d, plan, watch, today, skipped, onTry, onHow, onNext }: { d: OBDraft; plan: Plan; watch: boolean; today: string; skipped: { kg?: boolean; date?: boolean }; onTry: (date: string) => void; onHow: () => void; onNext: () => void }) {
  const shown = useCountUp(plan.target, undefined, 800, 150)
  const p = normaliseProfile({ ...d, goalWeightKg: d.goal === 'keep' ? d.weightKg : d.goalWeightKg, goalDate: d.goal === 'keep' ? null : d.goalDate, planFrom: { date: today, kg: d.weightKg }, bmr: plan.bmr, includeMovement: !watch }, today)
  const check = paceCheck(p, plan)
  return (
    <div className="flex flex-1 flex-col" data-testid="ob-target">
      <div className="flex flex-1 flex-col items-center justify-center text-center">
        <div className="eyebrow">Your daily target</div>
        <div className="num mt-3 text-[96px] leading-none text-g-ink" data-testid="target">{fmt(shown)}</div>
        <div className="mt-2 text-[17px] text-mute">kcal a day</div>
        <p className="mt-7 text-[20px] font-bold" data-testid="goal-line">{goalLine(d.goal, plan)}</p>
        {d.goal !== 'keep' && d.goalDate && <p className="mt-1 text-[16px] text-mute" data-testid="goal-date-line">{d.goalWeightKg} kg by {longDay(d.goalDate)}</p>}
        {d.goal !== 'keep' && (skipped.kg || skipped.date) && (
          <p className="mt-3 max-w-[320px] text-[15px] leading-snug text-mute" data-testid="ob-skipped-note">
            {skipped.kg && skipped.date ? 'We picked a first goal of 5% of your weight in 6 months.' : skipped.kg ? 'We picked a first goal of 5% of your weight.' : 'We picked 6 months.'}
          </p>
        )}
        <PaceWarning check={check} weeklyKg={plan.weeklyKg} sex={d.sex} onTry={onTry} className="mt-5 w-full max-w-[340px]" />
        {watch && <div className="mt-4 w-full max-w-[340px]"><WatchNote /></div>}
        <button type="button" onClick={onHow} className="mt-5 px-2 py-1 text-[16px] font-bold text-g-ink underline decoration-g/40 underline-offset-4" data-testid="ob-how">How we worked this out</button>
      </div>
      <p className="pb-3 text-center text-[14px] text-mute">You can change any of this in Me.</p>
      <Button onClick={onNext} data-testid="ob-next">Continue</Button>
    </div>
  )
}

/** "1,795" with a real minus sign for negatives ("−330"). */
const signed = (n: number) => (n < 0 ? `−${fmt(-n)}` : fmt(n))
/** kg to go as the plan uses it (up to 2 decimals), so kg × 7,700 is exactly the total shown. */
const kgText = (kg: number) => String(Math.round(kg * 100) / 100)

/**
 * v1.15 Lose result: the hero is the daily deficit, the same number Home measures against (profile.dailyGoal), with
 * "You'd eat about X kcal a day" (plan base minus the deficit) under it. A date that needs more than the safe cap mutes
 * the deficit, says why with what it would leave to eat, and offers the earliest safe date or a new goal. No Continue.
 */
function DeficitTarget({ d, plan, s, safer, watch, skipped, onSafer, onChangeGoal, onHow, onNext }: {
  d: OBDraft; plan: Plan; s: SafeDeficit; safer: ReturnType<typeof saferPlan>; watch: boolean; skipped: { kg?: boolean; date?: boolean }
  onSafer: (date: string) => void; onChangeGoal: () => void; onHow: () => void; onNext: () => void
}) {
  const shown = useCountUp(s.deficit, undefined, 800, 150)
  const unsafe = s.unsafe
  return (
    <div className="flex flex-1 flex-col" data-testid="ob-target" data-state={unsafe ? 'unsafe' : 'safe'}>
      <div className="flex flex-1 flex-col items-center justify-center text-center">
        <div className="eyebrow">Your daily deficit</div>
        <div className={`num mt-3 text-[96px] leading-none [@media(max-height:700px)]:mt-1 [@media(max-height:700px)]:text-[76px] ${unsafe ? 'text-mute-soft' : 'text-g-ink'}`} data-testid="deficit">{fmt(shown)}</div>
        <div className="mt-2 text-[17px] text-mute [@media(max-height:700px)]:mt-1">kcal a day</div>
        <p className={`mt-3 text-[17px] [@media(max-height:700px)]:mt-2 ${unsafe ? 'text-mute' : 'font-semibold text-ink'}`} data-testid="eat-line">
          {unsafe && s.eat <= 0 ? `More than you burn in a day (${fmt(s.planBase)} kcal)` : `You'd eat about ${fmt(s.eat)} kcal a day`}
        </p>
        {!unsafe && <p className="mt-6 text-[20px] font-bold [@media(max-height:700px)]:mt-4" data-testid="goal-line">{goalLine(d.goal, plan)}</p>}
        {d.goalDate && <p className={`text-[16px] text-mute ${unsafe ? 'mt-2' : 'mt-1'}`} data-testid="goal-date-line">{d.goalWeightKg} kg by {longDay(d.goalDate)}</p>}
        {!unsafe && watch && <p className="mt-1 text-[15px] text-mute" data-testid="watch-sooner">Likely sooner, since your watch adds burn on top.</p>}
        {(skipped.kg || skipped.date) && (
          <p className="mt-3 max-w-[320px] text-[15px] leading-snug text-mute" data-testid="ob-skipped-note">
            {skipped.kg && skipped.date ? 'We picked a first goal of 5% of your weight in 6 months.' : skipped.kg ? 'We picked a first goal of 5% of your weight.' : 'We picked 6 months.'}
          </p>
        )}
        {unsafe && <UnsafeCard s={s} weeklyKg={plan.weeklyKg} safer={safer} goalKg={d.goalWeightKg} className="mt-4 w-full max-w-[340px] [@media(max-height:700px)]:mt-3" />}
        {watch && <div className="mt-3 w-full max-w-[340px]"><WatchNote /></div>}
        <button type="button" onClick={onHow} className="mt-3 min-h-11 px-2 py-1 text-[16px] font-bold text-g-ink underline decoration-g/40 underline-offset-4" data-testid="ob-how">How we worked this out</button>
      </div>
      <div className="sticky bottom-0 -mx-5 bg-bg px-5 pt-2" data-testid="ob-target-actions">
        {unsafe ? (
          <>
            {safer && <Button onClick={() => onSafer(safer.date)} data-testid="ob-safer">Use safer date ({longDay(safer.date)})</Button>}
            <button type="button" onClick={onChangeGoal} className="tap mt-1 min-h-12 w-full rounded-[18px] px-4 text-[17px] font-bold text-g-ink" data-testid="ob-change-goal">Change goal</button>
          </>
        ) : (
          <>
            <p className="pb-3 text-center text-[14px] text-mute">You can change any of this in Me.</p>
            <Button onClick={onNext} data-testid="ob-next">Continue</Button>
          </>
        )}
      </div>
    </div>
  )
}

/**
 * v1.15 Lose breakdown. Resting burn + daily movement = daily burn (plan base), minus the daily deficit = what you'd
 * eat. Every number is the one on the result screen, and the sentence under it adds up to them exactly.
 */
function HowSheetDeficit({ d, plan, s, watch, onClose }: { d: OBDraft; plan: Plan; s: SafeDeficit; watch: boolean; onClose: () => void }) {
  const kg = kgText(plan.kgToGo)
  const total = Math.round(plan.kgToGo * 7700)
  const rest = plan.planBase - (watch ? 0 : plan.movement)
  const baseName = watch ? 'Plan base' : 'Your daily burn'
  const row = (k: ReactNode, v: string, testid: string, bold?: boolean) => (
    <div className={`flex items-start justify-between gap-3 border-b border-line py-3 text-[16px] ${bold ? 'font-bold' : ''}`} data-testid={testid}><span>{k}</span><b className="num shrink-0 font-semibold" data-testid={`${testid}-v`}>{v}</b></div>
  )
  return (
    <Sheet label="How we worked this out" onClose={onClose}>
      <div data-testid="ob-how-sheet" className="flex flex-col gap-4">
        <h2 className="title text-[26px]">How we worked this out</h2>
        <div className="rounded-[18px] border border-line px-4">
          {row('Resting burn (BMR)', `${fmt(rest)} kcal`, 'how-bmr')}
          {watch ? row('Daily movement', 'From your watch', 'how-move') : row(`Daily movement (${ACTIVITY_SHORT[d.activity].toLowerCase()})`, `+${fmt(plan.movement)} kcal`, 'how-move')}
          {row(baseName, `${fmt(plan.planBase)} kcal`, 'how-base', true)}
          {row(<>Daily deficit<span className="block text-[14px] font-normal text-mute" data-testid="how-deficit-sub">Lose {kg} kg by {d.goalDate ? longDay(d.goalDate) : ''}</span></>, `−${fmt(s.deficit)} kcal`, 'how-deficit')}
          <div className="flex justify-between py-3 text-[16px]" data-testid="how-eat"><b>You'd eat</b><b className={`num ${s.unsafe ? 'text-carbs-ink' : 'text-g-ink'}`} data-testid="how-eat-v">{signed(s.eat)} kcal</b></div>
        </div>
        {s.unsafe && <p className="text-[15px] font-semibold leading-snug text-carbs-ink" data-testid="how-unsafe">This date isn't safe. The safe cap is {fmt(s.cap)} kcal a day.</p>}
        <p className="text-[15px] leading-snug text-mute" data-testid="ob-how-why">
          BMR uses the Mifflin-St Jeor formula with your age, height, weight and sex. About 7,700 kcal is one kg, so {kg} kg × 7,700 = {fmt(total)} kcal.
          {' '}Over {fmt(plan.days)} days that's {fmt(total)} ÷ {fmt(plan.days)} = {fmt(s.deficit)} kcal a day (rounded), about {kgWeek(plan.weeklyKg)} kg a week.
          {' '}{fmt(plan.planBase)} − {fmt(s.deficit)} = {signed(s.eat)} kcal to eat.
        </p>
        <p className="text-[15px] leading-snug text-mute" data-testid="ob-how-cap">
          A safe deficit is at most {fmt(s.cap)} kcal a day. That's the lower of 1% of your weight a week ({fmt(s.capPace)} kcal) and your {watch ? 'plan base' : 'daily burn'} minus the {fmt(s.floor)} kcal minimum ({signed(s.capFloor)} kcal). It only limits the deficit, it never raises what you eat.
        </p>
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
        <p className="text-[15px] leading-snug text-mute">Each time you log your weight in Me, the plan is worked out again from what's left over the days left.</p>
        <p className="text-[15px] leading-snug text-mute">{watch ? 'Daily movement is off because your watch counts it. Each day, add its active calories with Quick add burn and your budget grows to match. That extra burn comes on top, so you will likely get there sooner.' : 'Got a watch later? Turn daily movement off in Me.'}</p>
        <Button variant="ghost" onClick={onClose} data-testid="ob-how-close">Got it</Button>
      </div>
    </Sheet>
  )
}

function HowSheet({ d, plan, watch, onClose }: { d: OBDraft; plan: Plan; watch: boolean; onClose: () => void }) {
  // BMR + movement = daily burn, then the goal takes off (or adds) the daily gap to give the target.
  const rows: [string, string, boolean?][] = [
    ['Resting burn (BMR)', `${fmt(plan.bmr)} kcal`],
    watch ? ['Daily movement', 'From your watch'] : [`Daily movement (${ACTIVITY_SHORT[d.activity].toLowerCase()})`, `+${fmt(plan.movement)} kcal`],
    [watch ? 'Plan base' : 'Your daily burn', `${fmt(plan.planBase)} kcal`, true],
  ]
  const kg = Math.round(plan.kgToGo * 10) / 10
  const by = d.goalDate ? shortDay(d.goalDate) : ''
  if (d.goal === 'lose' && plan.planDeficit > 0) rows.push([`Lose ${kg} kg by ${by}`, `−${fmt(plan.planDeficit)} kcal`])
  if (d.goal === 'gain' && plan.planDeficit < 0) rows.push([`Gain ${kg} kg by ${by}`, `+${fmt(-plan.planDeficit)} kcal`])
  const why =
    d.goal === 'keep' || plan.gap === 0
      ? `Keep matches your ${watch ? 'resting' : 'daily'} burn.`
      : `About 7,700 kcal is one kg, so ${kg} kg × 7,700 kcal ÷ ${fmt(plan.days)} days is about ${fmt(Math.abs(plan.planDeficit))} kcal a day, about ${kgWeek(plan.weeklyKg)} kg a week.`
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
        <p className="text-[15px] leading-snug text-mute">Each time you log your weight in Me, the plan is worked out again from what's left over the days left.</p>
        <p className="text-[15px] leading-snug text-mute">{watch ? 'Daily movement is off because your watch counts it. Each day, add its active calories with Quick add burn and your budget grows to match.' : 'Got a watch later? Turn daily movement off in Me.'}</p>
        <Button variant="ghost" onClick={onClose} data-testid="ob-how-close">Got it</Button>
      </div>
    </Sheet>
  )
}

/**
 * v1.10.1: Add to Home Screen hint on the welcome screen. iOS gets Safari's steps; Chrome and Android get an Install
 * button when the browser offers one, else a menu hint. Hidden when already running from the Home Screen.
 */
function InstallHint() {
  const st = useInstall()
  if (st.kind === 'hidden') return null
  return (
    <div className="mb-1 flex items-center gap-3 rounded-[18px] border border-line bg-card px-3.5 py-3 text-left" data-testid="ob-install" data-kind={st.kind}>
      <span className="tile !h-10 !w-10 shrink-0 text-g">{st.kind === 'ios' ? <ShareIcon /> : <PlusSquareIcon />}</span>
      <p className="min-w-0 flex-1 text-[14px] leading-snug text-mute">
        <b className="block text-[15px] text-ink">{st.kind === 'prompt' ? 'Install the app' : 'Add to Home Screen'}</b>
        {st.kind === 'ios' ? 'Tap Share, then Add to Home Screen.' : st.kind === 'prompt' ? 'Opens full screen and works offline.' : 'Open your browser menu, then Install app or Add to Home screen.'}
      </p>
      {st.kind === 'prompt' && (
        <button type="button" onClick={() => { void st.install() }} className="tap min-h-11 shrink-0 rounded-full bg-g-soft px-4 text-[15px] font-bold text-g-soft-ink" data-testid="ob-install-btn">Install</button>
      )}
    </div>
  )
}

function PlusSquareIcon() {
  return <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="4" /><path d="M12 8.5v7M8.5 12h7" /></svg>
}

function ShareIcon() {
  return <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 15V3.5M8 7.5l4-4 4 4" /><path d="M8 10.5H6.5a1.5 1.5 0 0 0-1.5 1.5v7.5A1.5 1.5 0 0 0 6.5 21h11a1.5 1.5 0 0 0 1.5-1.5V12a1.5 1.5 0 0 0-1.5-1.5H16" /></svg>
}
function SparkIcon() {
  return <svg viewBox="0 0 24 24" className="h-6 w-6" fill="currentColor" aria-hidden="true"><path d="M12 2.5c.5 4.6 2.9 7 7.5 7.5-4.6.5-7 2.9-7.5 7.5-.5-4.6-2.9-7-7.5-7.5 4.6-.5 7-2.9 7.5-7.5z" /><path d="M19 15c.2 1.8 1.2 2.8 3 3-1.8.2-2.8 1.2-3 3-.2-1.8-1.2-2.8-3-3 1.8-.2 2.8-1.2 3-3z" /></svg>
}
