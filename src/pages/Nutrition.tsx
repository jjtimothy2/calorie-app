import { useState } from 'react'
import { Screen, TabBar } from '../components/Layout'
import { Card, Chip, Illustrative } from '../components/ui'
import { formatAmount } from '../lib/amount'
import { entryTotals, fmt, lastNDays, macroTargets, round1, sumEntries } from '../lib/calc'
import { useStore } from '../lib/store'
import type { Entry } from '../lib/types'

function ProteinRing({ value, target, size = 180, stroke = 18 }: { value: number; target: number; size?: number; stroke?: number }) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const pct = target ? Math.max(0, Math.min(1, value / target)) : 0
  return (
    <div className="relative mx-auto" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--color-line)" strokeWidth={stroke} />
        <circle className="ring-arc" cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--color-protein)" strokeWidth={stroke}
          strokeLinecap={pct > 0 && pct < 1 ? 'round' : 'butt'} strokeDasharray={c} strokeDashoffset={c * (1 - pct)} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center" aria-hidden="true">
        <div className="text-[40px] font-extrabold leading-tight tracking-tight">{fmt(value)} g</div>
        <div className="text-[15px] text-mute">of {fmt(target)} g protein</div>
      </div>
    </div>
  )
}

function Bar({ label, value, target, color, id }: { label: string; value: number; target: number; color: string; id: string }) {
  const pct = target ? Math.min(100, (value / target) * 100) : 0
  return (
    <div data-testid={id}>
      <div className="flex justify-between text-base"><span>{label}</span><span><b>{fmt(value)}</b> <span className="text-mute">/ {fmt(target)} g</span></span></div>
      <div className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-line" role="progressbar" aria-label={`${label} ${fmt(value)} of ${fmt(target)} grams`} aria-valuemin={0} aria-valuemax={target} aria-valuenow={Math.round(value)}>
        <i className="block h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  )
}

/** Group entries by food (or quick add name) and rank by protein. */
function topSources(entries: Entry[], n = 5) {
  const map = new Map<string, { name: string; label: string; protein: number; servingLabel: string; qty: number; same: boolean }>()
  for (const e of entries) {
    const k = e.foodId ?? 'q:' + e.name
    const p = entryTotals(e).protein
    const cur = map.get(k)
    if (cur) { cur.protein += p; cur.same &&= cur.servingLabel === e.servingLabel; cur.qty += e.qty }
    else map.set(k, { name: e.name, label: '', protein: p, servingLabel: e.servingLabel, qty: e.qty, same: !!e.foodId })
  }
  return [...map.values()]
    .filter((x) => x.protein >= 0.5)
    .sort((a, b) => b.protein - a.protein)
    .slice(0, n)
    .map((x) => ({ ...x, label: x.same ? `${x.name}, ${formatAmount(x.servingLabel, x.qty)}` : x.name }))
}

export default function Nutrition() {
  const { state, today } = useStore()
  const [range, setRange] = useState<'today' | 'week'>('today')
  const profile = state.profile!
  const t = macroTargets(profile)
  const days = range === 'today' ? [today] : lastNDays(7, today)
  const entries = state.entries.filter((e) => days.includes(e.date))
  const loggedDays = new Set(entries.map((e) => e.date)).size || 1
  const sum = sumEntries(entries)
  const per = range === 'today' ? sum : { kcal: sum.kcal / loggedDays, protein: sum.protein / loggedDays, carbs: sum.carbs / loggedDays, fat: sum.fat / loggedDays }
  const p = Math.round(per.protein)
  const left = t.protein - p
  const perKg = round1(t.protein / profile.weightKg)
  const sources = topSources(entries)

  return (
    <>
      <Screen>
        <h1 className="text-[28px] font-bold tracking-tight">Nutrition</h1>
        <div className="flex gap-2" role="group" aria-label="Range">
          <Chip on={range === 'today'} onClick={() => setRange('today')}>Today</Chip>
          <Chip on={range === 'week'} onClick={() => setRange('week')}>This week</Chip>
        </div>
        <Card className="flex flex-col items-center gap-3 py-5 text-center">
          <ProteinRing value={p} target={t.protein} />
          <p className="text-[15px] text-mute">
            <span className="font-semibold text-ink" data-testid="protein-progress">{fmt(p)} of {fmt(t.protein)} g</span>
            {range === 'week' && ' a day on average'}.{' '}
            {left > 0 ? `${fmt(left)} g to go.` : 'Target hit.'} About {perKg} g per kg body weight.
          </p>
        </Card>
        <Card className="flex flex-col gap-3.5">
          <Bar label="Carbs" value={per.carbs} target={t.carbs} color="var(--color-carbs)" id="nutri-carbs" />
          <Bar label="Fat" value={per.fat} target={t.fat} color="var(--color-fat)" id="nutri-fat" />
        </Card>
        <Card className="py-3">
          <h2 className="mb-1 text-[17px] font-bold">Top protein sources {range === 'today' ? 'today' : 'this week'}</h2>
          {sources.length ? (
            <ul data-testid="protein-sources">
              {sources.map((s) => (
                <li key={s.label} className="flex justify-between gap-3 border-b border-line py-3 text-base last:border-0">
                  <span>{s.label}</span>
                  <b className="tabular-nums text-protein-ink">{fmt(s.protein)} g</b>
                </li>
              ))}
            </ul>
          ) : (
            <p className="py-2 text-[15px] text-mute">Log food to see where your protein comes from.</p>
          )}
        </Card>
        <p className="text-center text-xs text-mute">Targets: protein {PROTEIN_HINT}, carbs and fat split the rest. Change them under Me.</p>
        <Illustrative />
      </Screen>
      <TabBar />
    </>
  )
}

const PROTEIN_HINT = '1.6 g per kg by default'
