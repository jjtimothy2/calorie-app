import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { BodyFields, GoalFields, goalBlurb, PACE_LABEL, paceHint, targetSum, validBody, type Draft } from '../components/ProfileFields'
import { Screen, TabBar } from '../components/Layout'
import { Button, Card } from '../components/ui'
import { BackupCard } from '../components/Backup'
import { MyFoodsCard } from '../components/MyFoodSheet'
import { AiCard } from '../components/AiCard'
import { clearAi } from '../lib/ai'
import { Info } from '../components/Info'
import { calcBmr, CARB_FLOOR, dailyPlan, fmt, macroPlan, movementKcal, PROTEIN_PER_KG, FAT_FLOOR_PER_KG } from '../lib/calc'
import { useStore } from '../lib/store'

const numInput = 'w-28 rounded-xl border border-line bg-bg px-3 py-2 text-right text-[17px]'

export default function Settings() {
  const { state, dispatch } = useStore()
  const nav = useNavigate()
  const [params] = useSearchParams()
  const p = state.profile!
  // v1.3.3: no goal weight field; a stored goalWeightKg rides along untouched in ...p.
  const [d, setDraft] = useState<Draft>({ age: p.age, sex: p.sex, heightCm: p.heightCm, weightKg: p.weightKg, activity: p.activity, goal: p.goal, pace: p.pace })
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
  const base = { ...p, ...d, bmr, bmrCustom, includeMovement }
  const plan = dailyPlan({ ...base, macros })
  const movement = plan.movement
  const draftProfile = { ...base, macros, target: plan.target, dailyGoal: plan.dailyGoal }
  // v1.3.2: macros are built on maintenance (plan.maintenance) at the current weight. Placeholders show what "auto"
  // would be given the other boxes: fat follows maintenance and weight, carbs follow protein and fat.
  const w = d.weightKg
  const autoFat = macroPlan(plan.maintenance, w, { protein: macros.protein, carbs: null, fat: null }).fat
  const auto = { ...macroPlan(plan.maintenance, w, { protein: macros.protein, carbs: null, fat: macros.fat }), fat: autoFat }
  const ok = validBody(d) && bmr >= 800 && bmr <= 4000 && macOk

  const save = () => {
    if (!ok) return
    dispatch({ type: 'setProfile', profile: { ...draftProfile, macros } })
    setMsg('Saved.')
  }

  const macroRow = (k: 'protein' | 'carbs' | 'fat', label: string, hint: string) => (
    <label className="flex items-center justify-between gap-3 text-base font-semibold">
      <span>
        {label} (g)
        <span className="block text-[13px] font-normal text-mute">{mac[k] ? 'Custom' : hint}</span>
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
        <p className="text-[15px] text-mute">Your body, goal and daily targets</p>
      </header>
      <form className="flex flex-col gap-3.5" onSubmit={(e) => { e.preventDefault(); save() }}>
        <BodyFields d={d} set={setD} />
        <GoalFields d={d} set={setD} paceHint={paceHint(d.goal, plan)} />
        <Card className="flex flex-col gap-3">
          <h2 className="title text-[21px]">Daily balance</h2>
          <div className="flex items-center justify-between gap-3 text-base font-semibold">
            <span className="flex items-center">
              <label htmlFor="bmr">BMR (kcal)</label>
              <Info title="BMR" id="bmr">
                <p>Basal metabolic rate: the calories your body burns at complete rest. It is the base of your daily balance and your target.</p>
                <p>Calculated with the Mifflin-St Jeor formula: 10 × weight (kg) + 6.25 × height (cm) − 5 × age, plus 5 for men or minus 161 for women. Changing your weight, height, age or sex recalculates it.</p>
                <p>If you know yours from a body scan or your watch, type it here. Use calculated goes back to the formula.</p>
              </Info>
            </span>
            <input id="bmr" type="number" name="bmr" inputMode="numeric" min={800} max={4000} value={bmr} onChange={(e) => { setBmr(Number(e.target.value)); setBmrCustom(true) }} className={numInput} />
          </div>
          <div className="-mt-1 flex items-center justify-between text-[15px] text-mute">
            <span data-testid="bmr-calculated">Calculated: {calculated ? fmt(calculated) : '–'}</span>
            <button type="button" className="font-bold text-g-ink" onClick={() => { if (calculated) { setBmr(calculated); setBmrCustom(false) } }}>Use calculated</button>
          </div>
          <div className="flex items-center justify-between gap-3 border-t border-line pt-3 text-base font-semibold">
            <span>
              <label htmlFor="movement" className="cursor-pointer">Include daily movement</label>
              <span className="block text-[13px] font-normal text-mute" data-testid="movement-hint">+{fmt(movementKcal({ bmr, activity: d.activity, includeMovement: true }))} kcal a day. Leave off if you use a watch.</span>
            </span>
            <input id="movement" type="checkbox" role="switch" name="movement" checked={includeMovement} onChange={(e) => setIncludeMovement(e.target.checked)} className="h-6 w-6 shrink-0 cursor-pointer accent-g-ink" />
          </div>
          <div className="flex flex-col gap-0.5 border-t border-line pt-3">
            <div className="flex items-center justify-between gap-3 text-base font-semibold">
              <span className="flex items-center">
                Daily target
                <Info title="Daily target" id="target">
                  <p data-testid="budget-line">
                    BMR {fmt(bmr)}{includeMovement ? ` + movement ${fmt(movement)}` : ''}
                    {plan.planDeficit > 0 ? ` − ${fmt(plan.planDeficit)} deficit` : plan.planDeficit < 0 ? (d.goal === 'gain' && !plan.floored ? ` + ${fmt(-plan.planDeficit)} surplus` : `, held at the ${fmt(plan.floor)} kcal minimum`) : ''} = <b>{fmt(plan.target)} kcal</b> on a rest day, plus whatever you burn exercising.
                  </p>
                  <p data-testid="pace-line">{d.goal === 'keep' ? (plan.atMinimum ? `Keep weight: ${goalBlurb(d.goal, plan)}.` : 'Keep weight: no deficit.') : `${PACE_LABEL(d.pace)}: ${goalBlurb(d.goal, plan)}.`} {includeMovement ? '' : 'With movement off the plan starts from your BMR. '}The target never goes under {fmt(plan.floor)} kcal{includeMovement && plan.floor === bmr ? ' (your BMR)' : ''}.</p>
                  <p>The minimum is 1,500 kcal for men and 1,200 kcal for women (and never under your BMR when daily movement is on). When your goal would take the target below it, the target stays at the minimum: you're at the minimum intake, the daily goal is 0, and your watch or exercise burn creates your deficit. Keep and Lose never show a surplus goal.</p>
                </Info>
              </span>
              <span className="num text-[20px]" data-testid="settings-target">{fmt(plan.target)} kcal</span>
            </div>
            <p className="text-right text-[13px] text-mute" data-testid="target-sum">{targetSum(d.goal, plan, includeMovement)}</p>
          </div>
        </Card>
        <Card className="flex flex-col gap-3">
          <h2 className="title flex items-center text-[21px]">
            Macro targets
            <Info title="Macro targets" id="macros">
              <p data-testid="macro-rule">Your macro goals are fixed for the day. They are built on your maintenance calories, {fmt(plan.maintenance)} kcal ({includeMovement ? 'BMR plus daily movement' : 'your BMR'}), at your current weight, not on your deficit or surplus target, and logged exercise never changes them.</p>
              <p>Protein is {PROTEIN_PER_KG} g per kg of current weight. Fat gets 25% of maintenance, never under {FAT_FLOOR_PER_KG} g per kg. Carbs take the rest, at least {CARB_FLOOR} g (protein eases first if needed).</p>
              <p>Type a number to set your own; leave a box empty for auto.</p>
            </Info>
          </h2>
          {macroRow('protein', 'Protein', `Auto · ${PROTEIN_PER_KG} g per kg`)}
          {macroRow('carbs', 'Carbs', 'Auto · the rest')}
          {macroRow('fat', 'Fat', 'Auto · 25% of maintenance')}
          <div className="flex justify-end border-t border-line pt-3 text-[13px]">
            <button type="button" className="shrink-0 px-1 font-bold text-g-ink" onClick={() => setMac({ protein: '', carbs: '', fat: '' })}>Use auto</button>
          </div>
        </Card>
        <Button type="submit" disabled={!ok}>Save changes</Button>
        <p role="status" className="text-center text-[15px] text-g-ink">{msg}</p>
      </form>
      <AiCard focus={params.get('ai') === '1'} />
      <MyFoodsCard />
      <BackupCard />
      <Card className="flex flex-col gap-3">
        <h2 className="title text-[21px]">Data</h2>
        <Button variant="danger" onClick={() => { if (confirm('Delete all data on this device? Export a backup first if you want to keep it.')) { dispatch({ type: 'reset' }); clearAi(); nav('/onboarding', { replace: true }) } }}>Reset all data</Button>
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
