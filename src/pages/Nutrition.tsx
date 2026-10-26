import { isUserFoodId } from '../lib/myFoods'
import { useState } from 'react'
import { Screen, TabBar, Title } from '../components/Layout'
import { Card, Chip, Illustrative } from '../components/ui'
import { formatAmount } from '../lib/amount'
import { entryTotals, fmt, lastNDays, dailyPlan, macroSplit, overBy, pctOf, sumEntries, sumExercise } from '../lib/calc'
import { useStore } from '../lib/store'
import { Ticker, useRingFrom } from '../components/motion'
import { foodEmoji } from '../data/foodEmoji'
import type { CSSProperties } from 'react'
import type { Entry } from '../lib/types'

function ProteinRing({ value, target, size = 150, stroke = 12 }: { value: number; target: number; size?: number; stroke?: number }) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const pct = target ? Math.max(0, Math.min(1, value / target)) : 0
  // Over target: a darker second lap shows how far past it you are (capped at one extra lap).
  const extra = target ? Math.max(0, Math.min(1, value / target - 1)) : 0
  const from = useRingFrom('protein', c, c * (1 - pct))
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--color-track)" strokeWidth={stroke} />
        <circle className="ring-arc" cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--color-protein)" strokeWidth={stroke} style={{ '--from': `${from}px` } as CSSProperties}
          strokeLinecap={pct > 0 && pct < 1 ? 'round' : 'butt'} strokeDasharray={c} strokeDashoffset={c * (1 - pct)} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
        {extra > 0 && (
          <circle data-testid="protein-ring-over" className="ring-arc" style={{ '--from': `${c}px`, animationDelay: '.5s' } as CSSProperties} cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--color-protein-deep)" strokeWidth={stroke}
            strokeLinecap="butt" strokeDasharray={c} strokeDashoffset={c * (1 - extra)} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
        )}
      </svg>
      <div className="absolute inset-0 flex items-center justify-center" aria-hidden="true">
        <div className="num text-[40px] leading-none"><Ticker value={value} format={(n) => fmt(Math.round(n))} id="protein-g" /><span className="text-[20px]"> g</span></div>
      </div>
    </div>
  )
}

/** Small grey ring beside the calories number (visual only; the text carries the value). */
function MiniRing({ pct }: { pct: number }) {
  const size = 52, stroke = 7
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const p = Math.max(0, Math.min(1, pct / 100))
  const from = useRingFrom('kcal', c, c * (1 - p))
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true" className="shrink-0">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--color-track)" strokeWidth={stroke} />
      <circle className="ring-arc" style={{ '--from': `${from}px` } as CSSProperties} cx={size / 2} cy={size / 2} r={r} fill="none" stroke={pct > 100 ? 'var(--color-kcal-deep)' : 'var(--color-kcal)'} strokeWidth={stroke}
        strokeLinecap={p > 0 && p < 1 ? 'round' : 'butt'} strokeDasharray={c} strokeDashoffset={c * (1 - p)} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
    </svg>
  )
}

type MacroTone = 'protein' | 'carbs' | 'fat'
const TONE: Record<MacroTone, { bar: string; deep: string; ink: string }> = {
  protein: { bar: 'var(--color-protein)', deep: 'var(--color-protein-deep)', ink: 'text-protein-ink' },
  carbs: { bar: 'var(--color-carbs)', deep: 'var(--color-carbs-deep)', ink: 'text-carbs-ink' },
  fat: { bar: 'var(--color-fat)', deep: 'var(--color-fat-deep)', ink: 'text-fat-ink' },
}

/**
 * Macro row (carbs, fat): "Carbs 75 of 109 g, 69%". Over target the bar rescales to the total: the part past the target is a
 * darker shade, with a tick at the target, and the row adds "+X g over".
 */
function Bar({ label, value, target, tone, id }: { label: string; value: number; target: number; tone: MacroTone; id: string }) {
  const v = Math.round(value)
  const over = overBy(value, target)
  const pct = pctOf(v, target)
  const t = TONE[tone]
  const scale = over ? value : target
  const base = scale ? (Math.min(value, target) / scale) * 100 : 0
  return (
    <div data-testid={id} data-over={over || undefined}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-2 text-base">
        <span className="font-semibold">{label}</span>
        <span className="tabular-nums" data-testid={`${id}-text`}>
          <b className="num text-[17px]">{fmt(v)}</b> <span className="text-mute">of {fmt(target)} g, <span data-testid={`${id}-pct`}>{pct}%</span></span>
          {over > 0 && <>{' '}<b className={`ml-1 ${t.ink}`} data-testid={`${id}-over`}>+{fmt(over)} g over</b></>}
        </span>
      </div>
      <div className="relative mt-1.5 h-3 overflow-hidden rounded-full bg-track" role="progressbar"
        aria-label={`${label} ${fmt(v)} of ${fmt(target)} grams, ${pct}%${over ? `, ${fmt(over)} grams over` : ''}`} aria-valuemin={0} aria-valuemax={target} aria-valuenow={v}>
        <div className="grow-x relative flex h-full">
          <i className="bar-fill block h-full" style={{ width: `${base}%`, background: t.bar }} />
          {over > 0 && <i className="block h-full" style={{ width: `${100 - base}%`, background: t.deep }} />}
          {over > 0 && <i className="absolute inset-y-0 w-0.5 bg-card" style={{ left: `calc(${base}% - 1px)` }} aria-hidden="true" />}
        </div>
      </div>
    </div>
  )
}

/** B1: calories eaten against the daily food target. Neutral grey, info only; past the target it stays grey (orange is for a surplus). */
function CaloriesCard({ eaten, target, exercise, week }: { eaten: number; target: number; exercise: number; week: boolean }) {
  const e = Math.round(eaten)
  const over = target > 0 && e > target ? e - target : 0
  const pct = pctOf(e, target)
  const scale = over ? e : target
  const base = scale ? (Math.min(e, target) / scale) * 100 : 0
  return (
    <Card className="flex flex-col gap-2 px-[18px]" >
      <div data-testid="cal-card" data-over={over || undefined}>
        <div className="flex items-center justify-between gap-3">
          {/* inline-block pieces keep the text one sentence for screen readers ("Eaten 1,601 of 1,760 kcal, 91%") */}
          <p className="tabular-nums text-[15px] text-mute" data-testid="cal-text">
            <span className="eyebrow inline-block w-full">Eaten</span>{' '}
            <b className="num text-[34px] leading-tight text-ink"><Ticker value={e} format={(n) => fmt(Math.round(n))} id="kcal-eaten" /></b> <span>of {fmt(target)} kcal, <span data-testid="cal-pct">{pct}%</span></span>
            {over > 0 && <>{' '}<b className="ml-1 text-ink-soft" data-testid="cal-over">+{fmt(over)} kcal over</b></>}
          </p>
          <MiniRing pct={pct} />
        </div>
        <div className="relative mt-3 h-2.5 overflow-hidden rounded-full bg-track" role="progressbar"
          aria-label={`Calories eaten ${fmt(e)} of ${fmt(target)} kcal, ${pct}%${over ? `, ${fmt(over)} kcal over` : ''}`} aria-valuemin={0} aria-valuemax={target} aria-valuenow={e}>
          <div className="grow-x relative flex h-full">
            <i className="bar-fill block h-full" style={{ width: `${base}%`, background: 'var(--color-kcal)' }} />
            {over > 0 && <i className="block h-full" style={{ width: `${100 - base}%`, background: 'var(--color-kcal-deep)' }} />}
            {over > 0 && <i className="absolute inset-y-0 w-0.5 bg-card" style={{ left: `calc(${base}% - 1px)` }} aria-hidden="true" />}
          </div>
        </div>
        {(week || exercise > 0) && (
          <p className="mt-1.5 text-[13px] text-mute" data-testid="cal-note">
            {week ? 'A day on average over the days you logged. ' : ''}{exercise > 0 ? `Target includes ${fmt(exercise)} kcal of exercise${week ? ' a day' : ''}, as on Today. Macro goals stay the same.` : ''}
          </p>
        )}
      </div>
    </Card>
  )
}

const SPLIT = [
  { k: 'protein', label: 'Protein', color: 'var(--color-protein)', ink: 'text-protein-ink' },
  { k: 'carbs', label: 'Carbs', color: 'var(--color-split-carbs)', ink: 'text-carbs-ink' },
  { k: 'fat', label: 'Fat', color: 'var(--color-split-fat)', ink: 'text-fat-ink' },
] as const

/** B3: share of today's kcal from protein, carbs and fat (4/4/9), with faint ticks where the target split falls. */
function SplitBar({ grams, targets }: { grams: { protein: number; carbs: number; fat: number }; targets: { protein: number; carbs: number; fat: number } }) {
  const split = macroSplit(grams)
  const goal = macroSplit(targets)!
  const goalText = `protein ${goal.protein}%, carbs ${goal.carbs}%, fat ${goal.fat}%`
  if (!split) {
    return (
      <div className="border-t border-line pt-3.5" data-testid="split">
        <div className="eyebrow">Where your calories came from</div>
        <div className="mt-2 flex h-[22px] items-center justify-center rounded-full bg-track text-[13px] text-mute" role="img" aria-label="Calories split: nothing logged yet" data-testid="split-empty">
          Log food to see your split
        </div>
        <p className="mt-1.5 text-[13px] text-mute">Target: {goalText}.</p>
      </div>
    )
  }
  const marks = [goal.protein, goal.protein + goal.carbs]
  return (
    <div className="border-t border-line pt-3.5" data-testid="split" data-split={`${split.protein}/${split.carbs}/${split.fat}`} data-target={`${goal.protein}/${goal.carbs}/${goal.fat}`}>
      <div className="eyebrow">Where your calories came from</div>
      <div className="relative mt-2" role="img" aria-label={`Calories split: protein ${split.protein}%, carbs ${split.carbs}%, fat ${split.fat}%. Target ${goalText}.`}>
        <div className="grow-x flex h-[22px] gap-0.5 overflow-hidden rounded-full" aria-hidden="true">
          {SPLIT.map((s) => split[s.k] > 0 && <i key={s.k} className="block h-full" style={{ width: `${split[s.k]}%`, background: s.color }} data-testid={`split-${s.k}`} />)}
        </div>
        {marks.map((m, i) => (
          <i key={i} aria-hidden="true" data-testid="split-mark" className="absolute -inset-y-1 w-0.5 rounded-full bg-ink/30" style={{ left: `calc(${m}% - 1px)` }} />
        ))}
      </div>
      <ul className="mt-2.5 flex justify-between text-[13px]" aria-hidden="true">
        {SPLIT.map((s) => (
          <li key={s.k} className="flex items-center gap-1.5">
            <i className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: s.color }} />
            <span><b className={`num text-[15px] ${s.ink}`} data-testid={`split-${s.k}-pct`}>{split[s.k]}%</b> {s.label}</span>
          </li>
        ))}
      </ul>
      <p className="mt-1 text-[13px] text-mute" aria-hidden="true">Ticks show your target: {goalText}.</p>
    </div>
  )
}

/** Group entries by food (or quick add name) and rank by protein. */
function topSources(entries: Entry[], n = 5) {
  const map = new Map<string, { name: string; label: string; protein: number; servingLabel: string; qty: number; same: boolean; mine: boolean }>()
  for (const e of entries) {
    const k = e.foodId ?? 'q:' + e.name
    const p = entryTotals(e).protein
    const cur = map.get(k)
    if (cur) { cur.protein += p; cur.same &&= cur.servingLabel === e.servingLabel; cur.qty += e.qty }
    else map.set(k, { name: e.name, label: '', protein: p, servingLabel: e.servingLabel, qty: e.qty, same: !!e.foodId, mine: isUserFoodId(e.foodId) })
  }
  return [...map.values()]
    .filter((x) => x.protein >= 0.5)
    .sort((a, b) => b.protein - a.protein)
    .slice(0, n)
    // v1.9: one serving of your own food reads as just its name, like the quick add it came from.
    .map((x) => ({ ...x, label: x.same && !(x.mine && x.qty === 1) ? `${x.name}, ${formatAmount(x.servingLabel, x.qty)}` : x.name }))
}

export default function Nutrition() {
  const { state, today } = useStore()
  const [range, setRange] = useState<'today' | 'week'>('today')
  const profile = state.profile!
  const t = dailyPlan(profile)
  const days = range === 'today' ? [today] : lastNDays(7, today)
  const entries = state.entries.filter((e) => days.includes(e.date))
  const loggedDays = new Set(entries.map((e) => e.date)).size || 1
  const sum = sumEntries(entries)
  const per = range === 'today' ? sum : { kcal: sum.kcal / loggedDays, protein: sum.protein / loggedDays, carbs: sum.carbs / loggedDays, fat: sum.fat / loggedDays }
  const p = Math.round(per.protein)
  const left = t.protein - p
  const pOver = overBy(p, t.protein)
  const sources = topSources(entries)
  // Same food target Today works to: the plan target plus exercise logged that day (Today's "left" = target + burned - eaten).
  const burned = sumExercise(state.exercises.filter((x) => days.includes(x.date))) / (range === 'today' ? 1 : loggedDays)
  const pctP = pctOf(p, t.protein)

  return (
    <>
      <Screen>
        <Title eyebrow={new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' })}>Nutrition</Title>
        <div className="flex gap-2" role="group" aria-label="Range">
          <Chip on={range === 'today'} onClick={() => setRange('today')}>Today</Chip>
          <Chip on={range === 'week'} onClick={() => setRange('week')}>This week</Chip>
        </div>
        <CaloriesCard eaten={per.kcal} target={t.target + Math.round(burned)} exercise={Math.round(burned)} week={range === 'week'} />
        <Card className="flex items-center gap-4 px-[18px] py-[18px]">
          {/* v1.2.1: protein lives in the ring only (no macro row); its label carries the % ("75 of 109 g, 69%"). */}
          <ProteinRing value={p} target={t.protein} />
          <div className="min-w-0">
            <div className="eyebrow" aria-hidden="true">Protein</div>
            <div className="num text-[22px] leading-tight" aria-hidden="true" data-testid="protein-ring-label">of {fmt(t.protein)} g, {pctP}%</div>
            <p className="mt-1 text-[13px] text-mute">
              <span className="sr-only"><span data-testid="protein-progress">{fmt(p)} of {fmt(t.protein)} g, {pctP}%</span>{range === 'week' ? ' a day on average' : ''}. </span>
              {range === 'week' && <span aria-hidden="true">A day on average. </span>}
              {left > 0 ? `${fmt(left)} g to go.` : pOver ? <>Target hit, <b className="text-protein-ink" data-testid="protein-over">+{fmt(pOver)} g over</b>.</> : 'Target hit.'}
            </p>
          </div>
        </Card>
        <Card className="flex flex-col gap-4 px-[18px]">
          <Bar label="Carbs" value={per.carbs} target={t.carbs} tone="carbs" id="nutri-carbs" />
          <Bar label="Fat" value={per.fat} target={t.fat} tone="fat" id="nutri-fat" />
          <SplitBar grams={{ protein: per.protein, carbs: per.carbs, fat: per.fat }} targets={t} />
        </Card>
        <Card className="py-3">
          <h2 className="eyebrow mb-1">Top protein sources {range === 'today' ? 'today' : 'this week'}</h2>
          {sources.length ? (
            <ul data-testid="protein-sources">
              {sources.map((s) => (
                <li key={s.label} className="flex items-center gap-3 border-b border-line py-2.5 text-base last:border-0">
                  <span className="tile" aria-hidden="true">{foodEmoji(s.name)}</span>
                  <span className="flex-1">{s.label}</span>
                  <b className="num text-[17px] text-protein-ink">{fmt(s.protein)} g</b>
                </li>
              ))}
            </ul>
          ) : (
            <p className="py-2 text-[15px] text-mute">Log food to see where your protein comes from.</p>
          )}
        </Card>
        <p className="text-center text-xs text-mute" data-testid="targets-hint">Macro goals are fixed: they are built on your maintenance, {fmt(t.maintenance)} kcal ({profile.includeMovement ? 'BMR plus movement' : 'your BMR'}), at your current weight of {fmt(profile.weightKg)} kg, so they don't add up to your calorie target and logged exercise doesn't change them. Protein {PROTEIN_HINT}, fat 25% of maintenance (at least 0.6 g per kg), carbs the rest. Split uses 4 kcal per g of protein and carbs, 9 per g of fat. Change your weight, movement or macros under Me.</p>
        <Illustrative />
      </Screen>
      <TabBar />
    </>
  )
}

const PROTEIN_HINT = '1.6 g per kg'
