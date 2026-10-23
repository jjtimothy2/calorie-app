import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { BodyFields, GoalFields, goalBlurb, GOAL_LABEL, ACTIVITY_SHORT, validBody, type Draft } from '../components/ProfileFields'
import { Screen } from '../components/Layout'
import { Button, Card, Dots } from '../components/ui'
import { computeTarget, fmt } from '../lib/calc'
import { useStore } from '../lib/store'

export default function Onboarding() {
  const { dispatch } = useStore()
  const nav = useNavigate()
  const [step, setStep] = useState(0)
  const [d, setD] = useState<Draft>({ age: NaN, sex: 'female', heightCm: NaN, weightKg: NaN, activity: 'light', goal: 'lose' })
  const [editing, setEditing] = useState(false)
  const [custom, setCustom] = useState<number | null>(null)
  const computed = validBody(d) ? computeTarget(d) : 0
  const target = custom ?? computed
  const targetOk = target >= 800 && target <= 6000

  const finish = () => {
    dispatch({ type: 'setProfile', profile: { ...d, target } })
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
        </form>
      )}
      {step === 1 && (
        <form className="flex flex-1 flex-col gap-3.5" onSubmit={(e) => { e.preventDefault(); setStep(2) }}>
          <h1 className="text-[28px] font-bold tracking-tight">Your goal</h1>
          <GoalFields d={d} set={setD} />
          <div className="flex-1" />
          <Button type="submit">See my target</Button>
          <Button variant="ghost" onClick={() => setStep(0)}>Back</Button>
        </form>
      )}
      {step === 2 && (
        <div className="flex flex-1 flex-col gap-3.5">
          <h1 className="text-[28px] font-bold tracking-tight">Your daily target</h1>
          <p className="text-[15px] text-mute">Based on what you told us. You can change it anytime.</p>
          <Card className="p-6 text-center">
            <div className="text-[15px] text-mute">Calories per day</div>
            {editing ? (
              <label className="my-1 block">
                <span className="sr-only">Daily calorie target</span>
                <input
                  autoFocus
                  type="number"
                  inputMode="numeric"
                  name="target"
                  min={800}
                  max={6000}
                  value={Number.isNaN(target) ? '' : target}
                  onChange={(e) => setCustom(Number(e.target.value))}
                  className="w-48 rounded-xl border-2 border-g-ink bg-bg py-1 text-center text-[48px] font-extrabold text-g-ink"
                />
              </label>
            ) : (
              <div className="text-[56px] font-extrabold tracking-tight text-g-ink" data-testid="target">{fmt(target)}</div>
            )}
            <div className="text-[15px] text-mute" data-testid="goal-line">{goalBlurb(d)}</div>
          </Card>
          <Card className="py-0">
            {[['Goal', GOAL_LABEL[d.goal]], ['Current weight', `${d.weightKg} kg`], ['Height', `${d.heightCm} cm`], ['Activity', ACTIVITY_SHORT[d.activity]]].map(([k, v]) => (
              <div key={k} className="flex justify-between border-b border-line py-3.5 text-base last:border-0"><span>{k}</span><b className="font-semibold">{v}</b></div>
            ))}
          </Card>
          <div className="flex-1" />
          <Button onClick={finish} disabled={!targetOk}>Start logging</Button>
          <Button variant="ghost" onClick={() => setEditing((x) => !x)}>{editing ? 'Done editing' : 'Edit target'}</Button>
        </div>
      )}
    </Screen>
  )
}
