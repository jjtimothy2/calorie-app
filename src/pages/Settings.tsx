import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { BodyFields, GoalFields, validBody, type Draft } from '../components/ProfileFields'
import { Screen } from '../components/Layout'
import { Button, Card } from '../components/ui'
import { computeTarget, fmt } from '../lib/calc'
import { useStore } from '../lib/store'

export default function Settings() {
  const { state, dispatch } = useStore()
  const nav = useNavigate()
  const p = state.profile!
  const [d, setD] = useState<Draft>({ age: p.age, sex: p.sex, heightCm: p.heightCm, weightKg: p.weightKg, activity: p.activity, goal: p.goal })
  const [target, setTarget] = useState(p.target)
  const [msg, setMsg] = useState('')
  const suggested = validBody(d) ? computeTarget(d) : 0
  const ok = validBody(d) && target >= 800 && target <= 6000

  return (
    <Screen>
      <header className="flex items-center gap-2">
        <Link to="/" aria-label="Back to Today" className="grid h-11 w-11 place-items-center text-xl text-mute">←</Link>
        <h1 className="text-[28px] font-bold tracking-tight">Settings</h1>
      </header>
      <form className="flex flex-col gap-3.5" onSubmit={(e) => { e.preventDefault(); if (ok) { dispatch({ type: 'setProfile', profile: { ...d, target } }); setMsg('Saved.') } }}>
        <BodyFields d={d} set={setD} />
        <GoalFields d={d} set={setD} />
        <Card>
          <label className="flex items-center justify-between gap-3 text-base font-semibold">
            Daily target (kcal)
            <input type="number" name="target" inputMode="numeric" min={800} max={6000} value={target} onChange={(e) => setTarget(Number(e.target.value))} className="w-28 rounded-xl border border-line bg-bg px-3 py-2 text-right text-[17px]" />
          </label>
          <div className="mt-2 flex items-center justify-between text-[15px] text-mute">
            <span>Suggested: {suggested ? fmt(suggested) : '–'}</span>
            <button type="button" className="font-bold text-g-ink" onClick={() => suggested && setTarget(suggested)}>Use suggested</button>
          </div>
        </Card>
        <Button type="submit" disabled={!ok}>Save changes</Button>
        <p role="status" className="text-center text-[15px] text-g-ink">{msg}</p>
      </form>
      <Card className="flex flex-col gap-3">
        <h2 className="text-[17px] font-bold">Demo tools</h2>
        <p className="text-[15px] text-mute">Fill the last 6 days with sample meals around your target so History can be demoed. Today stays as it is.</p>
        <Button variant="ghost" onClick={() => { dispatch({ type: 'loadDemoWeek', target: p.target }); nav('/history') }}>Load demo week</Button>
        <Button variant="danger" onClick={() => { if (confirm('Delete all data on this device?')) { dispatch({ type: 'reset' }); nav('/onboarding', { replace: true }) } }}>Reset all data</Button>
      </Card>
      <p className="text-center text-xs text-mute">Prototype v0. Everything is stored on this device only. Food values are illustrative.</p>
    </Screen>
  )
}
