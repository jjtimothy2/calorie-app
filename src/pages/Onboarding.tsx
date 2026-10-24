import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { BodyFields, GoalFields, goalBlurb, goalWeightOf, GOAL_LABEL, ACTIVITY_SHORT, PACE_LABEL, validBody, validGoalWeight, type Draft } from '../components/ProfileFields'
import { Screen } from '../components/Layout'
import { Button, Card, Dots } from '../components/ui'
import { RestoreLink } from '../components/Backup'
import { calcBmr, dailyPlan, fmt, movementKcal, NO_MOVEMENT_FACTOR } from '../lib/calc'
import { normaliseProfile, useStore } from '../lib/store'

export default function Onboarding() {
  const { dispatch } = useStore()
  const nav = useNavigate()
  const [step, setStep] = useState(0)
  const [d, setD] = useState<Draft>({ age: NaN, sex: 'female', heightCm: NaN, weightKg: NaN, activity: 'light', goal: 'lose', goalWeightKg: NaN, pace: 'standard' })
  // v1.1: new profiles start with daily movement off (turn it on in Me).
  const profile = () => normaliseProfile({ ...d, goalWeightKg: goalWeightOf(d), bmr: calcBmr(d), bmrCustom: false, includeMovement: false })
  const plan = validBody(d) ? dailyPlan(profile()) : null
  const target = plan?.target ?? 0

  const finish = () => {
    dispatch({ type: 'setProfile', profile: profile() })
    nav('/', { replace: true })
  }

  return (
    <Screen>
      <Dots step={step} total={3} />
      {step === 0 && (
        <form className="flex flex-1 flex-col gap-3.5" onSubmit={(e) => { e.preventDefault(); if (validBody(d)) setStep(1) }}>
          <h1 className="text-[28px] font-bold tracking-tight">About you</h1>
          <p className="text-[15px] text-mute">A few numbers to work out your daily calories. Stored on this device only.</p>
          <BodyFields d={d} set={setD} />
          <div className="flex-1" />
          <Button type="submit" disabled={!validBody(d)}>Next</Button>
          <RestoreLink />
        </form>
      )}
      {step === 1 && (
        <form className="flex flex-1 flex-col gap-3.5" onSubmit={(e) => { e.preventDefault(); if (validGoalWeight(d)) setStep(2) }}>
          <h1 className="text-[28px] font-bold tracking-tight">Your goal</h1>
          <GoalFields d={d} set={setD} />
          <div className="flex-1" />
          <Button type="submit" disabled={!validGoalWeight(d)}>See my target</Button>
          <Button variant="ghost" onClick={() => setStep(0)}>Back</Button>
        </form>
      )}
      {step === 2 && (
        <div className="flex flex-1 flex-col gap-3.5">
          <h1 className="text-[28px] font-bold tracking-tight">Your daily target</h1>
          <p className="text-[15px] text-mute">Based on what you told us. You can change it anytime.</p>
          <Card className="p-6 text-center">
            <div className="text-[15px] text-mute">Calories per day</div>
            <div className="text-[56px] font-extrabold tracking-tight text-g-ink" data-testid="target">{fmt(target)}</div>
            <div className="text-[15px] text-mute" data-testid="goal-line">{plan ? goalBlurb(d.goal, plan) : ''}</div>
          </Card>
          <Card className="py-0">
            {[['Goal', GOAL_LABEL[d.goal]], ...(d.goal === 'keep' ? [] : [['Pace', PACE_LABEL(d.pace)]]), ['Current weight', `${d.weightKg} kg`], ['Goal weight', `${goalWeightOf(d)} kg`], ['Height', `${d.heightCm} cm`], ['Activity', ACTIVITY_SHORT[d.activity]]].map(([k, v]) => (
              <div key={k} className="flex justify-between border-b border-line py-3.5 text-base last:border-0"><span>{k}</span><b className="font-semibold">{v}</b></div>
            ))}
          </Card>
          {plan && (
            <p className="text-[15px] text-mute" data-testid="onboard-macros">
              Protein {plan.protein} g, carbs {plan.carbs} g, fat {plan.fat} g. Daily movement is off, so this starts from your BMR × {NO_MOVEMENT_FACTOR} ({fmt(plan.bmr)} × {NO_MOVEMENT_FACTOR} = {fmt(plan.planBase)}){d.goal === 'keep' ? '' : `, ${d.goal === 'gain' ? 'plus' : 'minus'} your pace`}, and never goes under {fmt(plan.floor)} kcal. Turn it on in Me to add about {fmt(movementKcal({ bmr: plan.bmr, activity: d.activity, includeMovement: true }))} kcal from your activity level.
            </p>
          )}
          <div className="flex-1" />
          <Button onClick={finish} disabled={!plan}>Start logging</Button>
          <Button variant="ghost" onClick={() => setStep(1)}>Back</Button>
        </div>
      )}
    </Screen>
  )
}
