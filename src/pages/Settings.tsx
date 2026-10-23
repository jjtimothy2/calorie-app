import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { BodyFields, GoalFields, validBody, type Draft } from '../components/ProfileFields'
import { Screen } from '../components/Layout'
import { Button, Card, Chip } from '../components/ui'
import { calcBmr, defaultDailyGoal, fmt, foodBudget, movementKcal } from '../lib/calc'
import { useStore } from '../lib/store'

type Dir = 'deficit' | 'even' | 'surplus'
const numInput = 'w-28 rounded-xl border border-line bg-bg px-3 py-2 text-right text-[17px]'

export default function Settings() {
  const { state, dispatch } = useStore()
  const nav = useNavigate()
  const p = state.profile!
  const [d, setDraft] = useState<Draft>({ age: p.age, sex: p.sex, heightCm: p.heightCm, weightKg: p.weightKg, activity: p.activity, goal: p.goal })
  const [bmr, setBmr] = useState(p.bmr)
  const [bmrCustom, setBmrCustom] = useState(p.bmrCustom)
  const [includeMovement, setIncludeMovement] = useState(p.includeMovement)
  const [dir, setDir] = useState<Dir>(p.dailyGoal > 0 ? 'deficit' : p.dailyGoal < 0 ? 'surplus' : 'even')
  const [amount, setAmount] = useState(Math.abs(p.dailyGoal) || 500)
  const [msg, setMsg] = useState('')
  const calculated = validBody(d) ? calcBmr(d) : 0

  // Body changes (weight, height, age, sex) recalculate BMR. Goal changes reset the daily goal.
  const setD = (n: Draft) => {
    const body = n.weightKg !== d.weightKg || n.heightCm !== d.heightCm || n.age !== d.age || n.sex !== d.sex
    if (body && validBody(n)) { setBmr(calcBmr(n)); setBmrCustom(false) }
    if (n.goal !== d.goal) {
      const g = defaultDailyGoal(n.goal)
      setDir(g > 0 ? 'deficit' : g < 0 ? 'surplus' : 'even')
      if (g) setAmount(Math.abs(g))
    }
    setDraft(n)
  }
  const dailyGoal = dir === 'even' ? 0 : dir === 'deficit' ? amount : -amount
  const movement = movementKcal({ bmr, activity: d.activity, includeMovement })
  const budget = foodBudget({ bmr, activity: d.activity, includeMovement, dailyGoal })
  const ok = validBody(d) && bmr >= 800 && bmr <= 4000 && (dir === 'even' || (amount > 0 && amount <= 1500))

  const save = () => {
    if (!ok) return
    dispatch({ type: 'setProfile', profile: { ...p, ...d, bmr, bmrCustom, includeMovement, dailyGoal, target: budget } })
    setMsg('Saved.')
  }

  return (
    <Screen>
      <header className="flex items-center gap-2">
        <Link to="/" aria-label="Back to Today" className="grid h-11 w-11 place-items-center text-xl text-mute">←</Link>
        <h1 className="text-[28px] font-bold tracking-tight">Settings</h1>
      </header>
      <form className="flex flex-col gap-3.5" onSubmit={(e) => { e.preventDefault(); save() }}>
        <BodyFields d={d} set={setD} />
        <GoalFields d={d} set={setD} />
        <Card className="flex flex-col gap-3">
          <h2 className="text-[17px] font-bold">Daily balance</h2>
          <label className="flex items-center justify-between gap-3 text-base font-semibold">
            BMR (kcal)
            <input type="number" name="bmr" inputMode="numeric" min={800} max={4000} value={bmr} onChange={(e) => { setBmr(Number(e.target.value)); setBmrCustom(true) }} className={numInput} />
          </label>
          <div className="-mt-1 flex items-center justify-between text-[15px] text-mute">
            <span data-testid="bmr-calculated">Calculated: {calculated ? fmt(calculated) : '–'}</span>
            <button type="button" className="font-bold text-g-ink" onClick={() => { if (calculated) { setBmr(calculated); setBmrCustom(false) } }}>Use calculated</button>
          </div>
          <label className="flex cursor-pointer items-center justify-between gap-3 border-t border-line pt-3 text-base font-semibold">
            <span>
              Include daily movement
              <span className="block text-[13px] font-normal text-mute">Adds {fmt(movementKcal({ bmr, activity: d.activity, includeMovement: true }))} kcal a day from your activity level</span>
            </span>
            <input type="checkbox" role="switch" name="movement" checked={includeMovement} onChange={(e) => setIncludeMovement(e.target.checked)} className="h-6 w-6 shrink-0 accent-g-ink" />
          </label>
          <fieldset className="border-t border-line pt-3">
            <legend className="sr-only">Daily goal</legend>
            <div className="mb-2 text-base font-semibold" aria-hidden="true">Daily goal</div>
            <div className="flex flex-wrap gap-2">
              <Chip on={dir === 'deficit'} onClick={() => setDir('deficit')}>Deficit</Chip>
              <Chip on={dir === 'even'} onClick={() => setDir('even')}>Break even</Chip>
              <Chip on={dir === 'surplus'} onClick={() => setDir('surplus')}>Surplus</Chip>
            </div>
            {dir !== 'even' && (
              <label className="mt-3 flex items-center justify-between gap-3 text-base">
                {dir === 'deficit' ? 'Deficit' : 'Surplus'} per day (kcal)
                <input type="number" name="goalAmount" inputMode="numeric" min={50} max={1500} step={50} value={amount} onChange={(e) => setAmount(Number(e.target.value))} className={numInput} />
              </label>
            )}
          </fieldset>
          <p className="border-t border-line pt-3 text-[15px] text-mute" data-testid="budget-line">
            BMR {fmt(bmr)}{includeMovement ? ` + movement ${fmt(movement)}` : ''} means you can eat about <b className="text-ink">{fmt(budget)} kcal</b> on a rest day, plus whatever you burn exercising.
          </p>
        </Card>
        <Button type="submit" disabled={!ok}>Save changes</Button>
        <p role="status" className="text-center text-[15px] text-g-ink">{msg}</p>
      </form>
      <Card className="flex flex-col gap-3">
        <h2 className="text-[17px] font-bold">Demo tools</h2>
        <p className="text-[15px] text-mute">Fill the last 6 days with sample meals and workouts so History can be demoed. Today stays as it is.</p>
        <Button variant="ghost" onClick={() => { dispatch({ type: 'loadDemoWeek' }); nav('/history') }}>Load demo week</Button>
        <Button variant="danger" onClick={() => { if (confirm('Delete all data on this device?')) { dispatch({ type: 'reset' }); nav('/onboarding', { replace: true }) } }}>Reset all data</Button>
      </Card>
      <p className="text-center text-xs text-mute">Prototype v1. Everything is stored on this device only. Food and exercise values are illustrative.</p>
    </Screen>
  )
}
