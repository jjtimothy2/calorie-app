import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { BodyFields, GoalFields, goalBlurb, goalWeightOf, PACE_LABEL, validBody, validGoalWeight, type Draft } from '../components/ProfileFields'
import { Screen, TabBar } from '../components/Layout'
import { Button, Card } from '../components/ui'
import { BackupCard } from '../components/Backup'
import { calcBmr, CARB_FLOOR, dailyPlan, fmt, macroPlan, movementKcal, NO_MOVEMENT_FACTOR, PROTEIN_PER_KG, FAT_FLOOR_PER_KG } from '../lib/calc'
import { useStore } from '../lib/store'

const numInput = 'w-28 rounded-xl border border-line bg-bg px-3 py-2 text-right text-[17px]'

export default function Settings() {
  const { state, dispatch } = useStore()
  const nav = useNavigate()
  const p = state.profile!
  // Goal weight shows blank when it equals the current weight (blank = follow the current weight).
  const [d, setDraft] = useState<Draft>({ age: p.age, sex: p.sex, heightCm: p.heightCm, weightKg: p.weightKg, activity: p.activity, goal: p.goal, goalWeightKg: p.goalWeightKg === p.weightKg ? NaN : p.goalWeightKg, pace: p.pace })
  const [bmr, setBmr] = useState(p.bmr)
  const [bmrCustom, setBmrCustom] = useState(p.bmrCustom)
  const [includeMovement, setIncludeMovement] = useState(p.includeMovement)
  const [msg, setMsg] = useState('')
  const [mac, setMac] = useState({ protein: p.macros.protein?.toString() ?? '', carbs: p.macros.carbs?.toString() ?? '', fat: p.macros.fat?.toString() ?? '' })
  const calculated = validBody(d) ? calcBmr(d) : 0

  // Body changes (weight, height, age, sex) recalculate BMR. The target follows from BMR, movement and pace.
  const setD = (n: Draft) => {
    const body = n.weightKg !== d.weightKg || n.heightCm !== d.heightCm || n.age !== d.age || n.sex !== d.sex
    if (body && validBody(n)) { setBmr(calcBmr(n)); setBmrCustom(false) }
    setDraft(n)
  }
  const toG = (v: string) => (v.trim() === '' ? null : Math.round(Number(v)))
  const macros = { protein: toG(mac.protein), carbs: toG(mac.carbs), fat: toG(mac.fat) }
  const macOk = Object.values(macros).every((v) => v == null || (Number.isFinite(v) && v > 0 && v < 1000))
  const gw = goalWeightOf(d)
  const base = { ...p, ...d, goalWeightKg: gw, bmr, bmrCustom, includeMovement }
  const plan = dailyPlan({ ...base, macros })
  const movement = plan.movement
  const draftProfile = { ...base, macros, target: plan.target, dailyGoal: plan.dailyGoal }
  // Placeholders show what "auto" would be given the other boxes: fat follows the target, carbs follow protein and fat.
  const pre = dailyPlan({ ...base, macros: { protein: null, carbs: null, fat: null } }).target
  const autoFat = macroPlan(pre, gw, { protein: macros.protein, carbs: null, fat: null }).fat
  const auto = { ...macroPlan(pre, gw, { protein: macros.protein, carbs: null, fat: macros.fat }), fat: autoFat }
  const autoProtein = macroPlan(pre, gw).protein
  const ok = validBody(d) && validGoalWeight(d) && bmr >= 800 && bmr <= 4000 && macOk

  const save = () => {
    if (!ok) return
    dispatch({ type: 'setProfile', profile: { ...draftProfile, macros } })
    setMsg('Saved.')
  }

  const macroRow = (k: 'protein' | 'carbs' | 'fat', label: string, hint: string) => (
    <label className="flex items-center justify-between gap-3 text-base font-semibold">
      <span>
        {label} (g)
        <span className="block text-[13px] font-normal text-mute">{mac[k] ? 'Custom' : `Auto: ${hint}`}</span>
        {k === 'carbs' && macros.carbs != null && macros.carbs > 0 && macros.carbs < CARB_FLOOR && (
          <span className="block text-[13px] font-normal text-mute" data-testid="carbs-low-hint">Below the {CARB_FLOOR} g we suggest. That's fine if it's on purpose.</span>
        )}
      </span>
      <input type="number" name={`macro-${k}`} inputMode="numeric" min={1} max={999} placeholder={String(auto[k])} value={mac[k]} onChange={(e) => setMac({ ...mac, [k]: e.target.value })} className={numInput} />
    </label>
  )

  return (
    <>
    <Screen>
      <header>
        <h1 className="title text-[32px] leading-tight">Me</h1>
        <p className="text-[15px] text-mute">Your body, goal and daily targets.</p>
      </header>
      <form className="flex flex-col gap-3.5" onSubmit={(e) => { e.preventDefault(); save() }}>
        <BodyFields d={d} set={setD} />
        <GoalFields d={d} set={setD} />
        <Card className="flex flex-col gap-3">
          <h2 className="title text-[21px]">Daily balance</h2>
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
          <p className="border-t border-line pt-3 text-[15px] text-mute" data-testid="budget-line">
            BMR {fmt(bmr)}{includeMovement ? ` + movement ${fmt(movement)}` : ` × ${NO_MOVEMENT_FACTOR} = ${fmt(plan.planBase)}`}
            {plan.planDeficit > 0 ? ` − ${fmt(plan.planDeficit)} deficit` : plan.planDeficit < 0 ? ` + ${fmt(-plan.planDeficit)} ${plan.floored ? 'to the minimum' : 'surplus'}` : ''} = <b className="text-ink">{fmt(plan.target)} kcal</b> on a rest day, plus whatever you burn exercising.
            <span className="mt-1 block" data-testid="pace-line">{d.goal === 'keep' ? 'Keep weight: no deficit.' : `${PACE_LABEL(d.pace)}: ${goalBlurb(d.goal, plan)}.`} {includeMovement ? '' : `With movement off the plan starts from BMR × ${NO_MOVEMENT_FACTOR}. `}Deficits are capped at 20% and the target never goes under {fmt(plan.floor)} kcal{includeMovement && plan.floor === bmr ? ' (your BMR)' : ''}.</span>
          </p>
        </Card>
        <Card className="flex flex-col gap-3">
          <h2 className="title text-[21px]">Macro targets</h2>
          {macroRow('protein', 'Protein', `${autoProtein} g (${PROTEIN_PER_KG} g per kg goal weight)`)}
          {macroRow('carbs', 'Carbs', `${auto.carbs} g`)}
          {macroRow('fat', 'Fat', `${auto.fat} g`)}
          <div className="flex items-center justify-between border-t border-line pt-3 text-[13px] text-mute">
            <span data-testid="macro-rule">Fat gets 25% of your calories, never under {FAT_FLOOR_PER_KG} g per kg of goal weight. Carbs take the rest, at least {CARB_FLOOR} g (protein eases first if needed). Leave a box empty for auto.</span>
            <button type="button" className="shrink-0 px-1 font-bold text-g-ink" onClick={() => setMac({ protein: '', carbs: '', fat: '' })}>Use auto</button>
          </div>
        </Card>
        <Button type="submit" disabled={!ok}>Save changes</Button>
        <p role="status" className="text-center text-[15px] text-g-ink">{msg}</p>
      </form>
      <BackupCard />
      <Card className="flex flex-col gap-3">
        <h2 className="title text-[21px]">Data</h2>
        <Button variant="danger" onClick={() => { if (confirm('Delete all data on this device? Export a backup first if you want to keep it.')) { dispatch({ type: 'reset' }); nav('/onboarding', { replace: true }) } }}>Reset all data</Button>
      </Card>
      <details className="rounded-[22px] border border-line bg-card p-4 text-[15px]" data-testid="developer">
        <summary className="cursor-pointer font-bold">Developer</summary>
        <div className="mt-3 flex flex-col gap-3">
          <p className="text-mute">Replace the last 6 days with sample meals and workouts. Today stays as it is.</p>
          <Button variant="ghost" onClick={() => { dispatch({ type: 'loadDemoWeek' }); nav('/history') }}>Load demo week</Button>
        </div>
      </details>
      <p className="text-center text-xs text-mute">Everything is stored on this device only. Food and exercise values are illustrative.</p>
    </Screen>
    <TabBar />
    </>
  )
}
