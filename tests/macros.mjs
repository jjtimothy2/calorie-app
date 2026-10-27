// Unit checks for v1.1 to v1.13 (v1.13: goal weight + goal date replace the pace, gap = kg to go x 7,700 / days, no floor, soft warning, weight log): daily target (no cap since v1.8; plain BMR base with movement off since v1.3.1;
// a Lose goal never under 0 since v1.3.2), macros (v1.3.2: fixed, built on maintenance at the current weight: protein 1.6 g/kg,
// fat max(25% of maintenance, 0.6 g/kg), carbs the rest with a 100 g floor), chart scales, storage + backup migration.
import { execSync } from 'node:child_process'
import { readdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import assert from 'node:assert/strict'
const out = 'node_modules/.tmp/calc'
rmSync(out, { recursive: true, force: true })
execSync(`npx tsc --ignoreConfig --outDir ${out} src/lib/calc.ts src/lib/migrate.ts src/lib/backup.ts src/lib/trend.ts src/lib/weigh.ts --module esnext --target es2022 --skipLibCheck --lib es2022,dom`)
// Node needs file extensions on ESM imports: rename to .mjs and patch relative imports.
for (const f of readdirSync(out).filter((f) => f.endsWith('.js'))) {
  const src = readFileSync(`${out}/${f}`, 'utf8').replace(/from '(\.\/[^']+)'/g, "from '$1.mjs'")
  writeFileSync(`${out}/${f.replace(/\.js$/, '.mjs')}`, src)
}
const load = (m) => import(new URL(`../${out}/${m}.mjs`, import.meta.url))
const { dailyPlan: planOf, paceCheck: checkOf, dailyGap, kgToGo, planDays, goalReached, expectedKg, weighInStatus, addMonths, daysBetween, addDays, MIN_PLAN_DAYS, homeBase, liveDay, dayView, summarise, dayBase, goalMessage, macroPlan, macroSplit, macroTargets, pctOf, targetFloor, splitMacros, overBy, movementKcal, balanceScale, proteinScale, calcBmr, dateKey } = await load('calc')
const { migrateState, normaliseProfile, legacyGoal, LEGACY_PLAN_DAYS } = await load('migrate')
globalThis.localStorage = { length: 0, key: () => null, getItem: () => null, setItem() {} }
const { parseBackup, BACKUP_SCHEMA, STATE_KEY, V2_STATE_KEY, LEGACY_STATE_KEY, isStateKey } = await load('backup')
const { logWeight, deleteWeight, shouldNudge, WEIGH_DAYS } = await load('weigh')
const auto = { protein: null, carbs: null, fat: null }
// v1.13 goal-date plan: gap = kg to go x 7,700 / days to the goal date. The older tests below were written for the
// Gentle / Standard / Faster paces (275 / 550 / 825 kcal a day). A profile with no goalDate is planned here as the
// goal that gives that same gap: 5 / 10 / 15 kg over 140 days from T0 (5 x 7,700 / 140 = 275), so their numbers carry over.
const T0 = '2026-10-27', D140 = '2027-03-16'
const PACE_KG = { gentle: 5, standard: 10, faster: 15 }
const withGoal = (p) => {
  if (p.goalDate !== undefined) return p
  const kg = PACE_KG[p.pace ?? 'standard']
  return { ...p, goalWeightKg: p.goal === 'gain' ? p.weightKg + kg : p.weightKg - kg, goalDate: p.goal === 'keep' ? null : D140, planFrom: { date: T0, kg: p.weightKg } }
}
const dailyPlan = (p) => planOf(withGoal(p))
const paceCheck = (p) => checkOf(withGoal(p))
const results = []
const t = (name, fn) => { fn(); results.push('PASS ' + name) }

const reed = { sex: 'female', bmr: 1600, activity: 'light', includeMovement: true, goal: 'lose', pace: 'standard', weightKg: 68, goalWeightKg: 68, macros: auto }
// Reference for the v1.3.2 macro rule, written out independently of calc.ts (no fallback needed for these profiles).
const ref = (maintenance, kg) => {
  const protein = Math.round(1.6 * kg)
  const fatKcal = Math.max(0.25 * maintenance, 0.6 * kg * 9)
  return [protein, Math.round(fatKcal / 9), Math.round((maintenance - protein * 4 - fatKcal) / 4)]
}

// ---------- v1.3.2 acceptance (Reed + Jordy) ----------
const male92 = { sex: 'male', bmr: 1900, activity: 'light', includeMovement: false, goal: 'lose', pace: 'standard', weightKg: 92, goalWeightKg: 80, macros: auto }
t('v1.3.2 example: male 92 kg, BMR 1900, Movement off -> maintenance 1900, P147 F55 C204; v1.13 target 1350 (no floor, soft warning), goal 550', () => {
  const p = dailyPlan(male92)
  assert.equal(p.maintenance, 1900)
  // Protein 1.6 x 92 = 147; fat max(475, 0.6 x 92 x 9 = 496.8) = 55 g; carbs (1900 - 588 - 496.8) / 4 = 204.
  assert.deepEqual([p.protein, p.fat, p.carbs], [147, 55, 204])
  assert.deepEqual([p.protein, p.fat, p.carbs], ref(1900, 92))
  assert.equal(p.adjusted, false)
  assert.equal(p.target, 1350) // v1.13: 1900 - 550, no floor (v1.8 held it at 1,500); macros don't move
  assert.equal(p.dailyGoal, 550)
  assert.ok(!('floored' in p) && !('atMinimum' in p))
  assert.deepEqual(paceCheck(male92), { fast: false, low: true, warn: true, suggest: addDays(T0, 193) }) // 10 kg x 7,700 / (1900 - 1500) = 192.5 days
})
t('v1.3.2 example: same, Movement on (light) -> maintenance 2613, P147 F73 C343; v1.8 target 2063, goal 550', () => {
  const p = dailyPlan({ ...male92, includeMovement: true })
  assert.equal(p.movement, 713) // round(1900 x 0.375)
  assert.equal(p.maintenance, 2613)
  // Fat max(653.25, 496.8) = 73 g; carbs (2613 - 588 - 653.25) / 4 = 343.
  assert.deepEqual([p.protein, p.fat, p.carbs], [147, 73, 343])
  assert.deepEqual([p.protein, p.fat, p.carbs], ref(2613, 92))
  assert.equal(p.target, 2063) // v1.8: 2613 - 550 (v1.7: round(2613 - 20% cap 522.6) = 2090)
  assert.equal(p.dailyGoal, 550)
})
t('v1.3.2: macros follow maintenance, not the goal or its date (same macros for lose, keep and gain)', () => {
  for (const includeMovement of [false, true]) {
    const want = dailyPlan({ ...male92, includeMovement, goal: 'keep' })
    for (const goal of ['lose', 'keep', 'gain']) for (const pace of ['gentle', 'standard', 'faster']) {
      const p = dailyPlan({ ...male92, includeMovement, goal, pace })
      assert.deepEqual([p.protein, p.fat, p.carbs], [want.protein, want.fat, want.carbs], `${goal} ${pace} ${includeMovement}`)
      assert.equal(p.maintenance, want.target) // Keep's target is maintenance
    }
  }
})
t('v1.3.2: protein uses the CURRENT weight; goal weight moves the target (v1.13) but never the macros', () => {
  const g = (kg) => planOf({ ...withGoal(male92), goalWeightKg: kg })
  const a = g(70), b = g(85)
  assert.deepEqual([a.protein, a.fat, a.carbs], [b.protein, b.fat, b.carbs])
  assert.equal(a.target, 1900 - 1210) // 22 kg x 7,700 / 140
  assert.equal(b.target, 1900 - 385) // 7 kg x 7,700 / 140
  assert.equal(a.protein, 147) // 1.6 x 92, not 1.6 x 70 = 112
  assert.equal(dailyPlan({ ...male92, weightKg: 80 }).protein, 128) // 1.6 x 80
  assert.equal(dailyPlan({ ...male92, weightKg: 80 }).fat, 53) // max(475, 432) = 475 kcal
})
t('v1.3.2: logged exercise never changes macro goals (Home and Nutrition read the same fixed targets)', () => {
  const pr = normaliseProfile({ age: 40, sex: 'male', heightCm: 180, weightKg: 92, activity: 'light', goal: 'lose', bmr: 1900, bmrCustom: true, includeMovement: false, pace: 'standard' })
  const d = '2026-10-25'
  const state0 = { profile: pr, entries: [], exercises: [], closedDays: {}, favourites: [] }
  const state1 = { ...state0, exercises: [{ id: 'x', date: d, activityId: null, name: 'run', minutes: 60, intensity: 'hard', kcal: 800, createdAt: 1 }] }
  assert.deepEqual(macroTargets(state1.profile), { protein: 147, carbs: 204, fat: 55 })
  assert.deepEqual(macroTargets(state1.profile), macroTargets(state0.profile))
  // Exercise only moves the calorie side: the balance gains the burn, the goal and macros stay.
  const v0 = dayView(state0, d), v1 = dayView(state1, d)
  assert.equal(v1.balance - v0.balance, 800)
  assert.equal(v1.goal, v0.goal)
})
t('v1.3.2: Reed profile (68 kg woman, BMR 1600) -> Movement on 1650 / P109 F61 C304, off 1050 / P109 F44 C191 (v1.13 no floor)', () => {
  const on = dailyPlan(reed)
  assert.equal(on.movement, 600) // 1600 x 0.375
  assert.equal(on.target, 1650) // v1.8: 2200 - 550 (v1.7: 1760 with the 20% cap)
  assert.equal(on.dailyGoal, 550)
  assert.ok(!('capped' in on))
  assert.deepEqual([on.protein, on.fat, on.carbs], [109, 61, 304]) // maintenance 2200: fat 550 kcal, carbs 1214 / 4
  assert.deepEqual([on.protein, on.fat, on.carbs], ref(2200, 68))
  const off = dailyPlan({ ...reed, includeMovement: false })
  assert.equal(off.planBase, 1600)
  assert.equal(off.target, 1050) // v1.13: 1600 - 550, no floor (v1.8 held it at 1,200)
  assert.equal(off.planDeficit, 550)
  assert.deepEqual([off.protein, off.fat, off.carbs], [109, 44, 191]) // maintenance 1600: fat 400 kcal, carbs 764 / 4
  assert.equal(off.dailyGoal, 550)
  assert.equal(paceCheck({ ...reed, includeMovement: false }).low, true) // under 1,200: the soft warning, never a block
  for (const sex of ['female', 'male']) assert.deepEqual([dailyPlan({ ...reed, sex }).target, dailyPlan({ ...reed, sex }).dailyGoal], [1650, 550])
})

// ---------- No floor (v1.13): the 1,500 / 1,200 line is a soft warning only ----------
t('warning line: 1,500 kcal for men, 1,200 for women; anything else gets 1,200', () => {
  assert.equal(targetFloor('male'), 1500)
  assert.equal(targetFloor('female'), 1200)
  assert.equal(targetFloor(undefined), 1200)
  assert.equal(targetFloor('other'), 1200)
  assert.equal(dailyPlan({ ...reed, includeMovement: false, goal: 'keep' }).target, 1600)
  assert.equal(dailyPlan({ ...reed, includeMovement: false, goal: 'gain' }).target, 2150) // + 550, no cap
})
t('v1.13 Lose: target = base - gap at any base, no floor, never under 0', () => {
  const m = dailyPlan({ ...reed, sex: 'male', includeMovement: false })
  assert.deepEqual([m.target, m.planDeficit, m.dailyGoal], [1050, 550, 550])
  const f = dailyPlan({ ...reed, bmr: 1200, includeMovement: false })
  assert.deepEqual([f.target, f.dailyGoal], [650, 550])
  // 10 kg in 7 days asks for 11,000 kcal a day: the target stops at 0 and the warning has no date earlier than the line allows.
  const fast = planOf({ ...withGoal(reed), goalDate: addDays(T0, 7) })
  assert.deepEqual([fast.target, fast.gap, fast.dailyGoal], [0, 11000, 2200])
  // Sweep: a Lose goal is never negative and always base - target; Keep is the base; Gain a surplus.
  for (const goal of ['lose', 'keep', 'gain']) for (const sex of ['female', 'male']) for (const bmr of [800, 1000, 1200, 1500, 2000, 2400]) for (const includeMovement of [true, false]) for (const pace of ['gentle', 'standard', 'faster']) {
    const p = dailyPlan({ ...reed, goal, sex, bmr, includeMovement, pace, activity: 'sedentary' })
    assert.ok(p.target >= 0)
    assert.equal(p.dailyGoal, p.planBase - p.target)
    if (goal === 'lose') assert.ok(p.dailyGoal > 0, `${sex} ${bmr}`)
    if (goal === 'keep') assert.deepEqual([p.target, p.dailyGoal, p.gap], [p.planBase, 0, 0])
    if (goal === 'gain') assert.ok(p.dailyGoal < 0)
  }
})

// ---------- v1.13 goal-date maths ----------
t('v1.13 gap: |start - goal| x 7,700 / days; weekly kg = gap x 7 / 7,700', () => {
  const base = { ...reed, weightKg: 92, goalWeightKg: 80, goalDate: '2027-04-27', planFrom: { date: T0, kg: 92 } }
  assert.equal(daysBetween(T0, '2027-04-27'), 182)
  assert.equal(kgToGo(base), 12)
  assert.equal(planDays(base), 182)
  assert.ok(Math.abs(dailyGap(base) - 12 * 7700 / 182) < 1e-9) // 507.7
  const p = planOf(base)
  assert.equal(p.target, 2200 - 508)
  assert.ok(Math.abs(p.weeklyKg - 12 / 26) < 1e-9) // 0.46 kg a week
  // Gain: + gap.
  const g = planOf({ ...base, goal: 'gain', weightKg: 60, goalWeightKg: 66, planFrom: { date: T0, kg: 60 } })
  assert.equal(g.target, 2200 + Math.round(6 * 7700 / 182))
  // The plan runs from planFrom (the last re-plan), not from today.
  assert.equal(planOf({ ...base, planFrom: { date: '2026-10-01', kg: 92 } }).days, 208)
  // A date in the past or under a week away is planned as 7 days.
  for (const d of ['2026-10-01', T0, '2026-10-30']) assert.equal(planDays({ ...base, goalDate: d }), MIN_PLAN_DAYS)
  // Keep, a reached goal, or a goal on the wrong side: no gap.
  assert.equal(dailyGap({ ...base, goal: 'keep' }), 0)
  assert.equal(dailyGap({ ...base, goalWeightKg: 95 }), 0)
  assert.equal(goalReached({ ...base, weightKg: 79.9 }), true)
  assert.equal(goalReached({ ...base, weightKg: 80.1 }), false)
  assert.equal(goalReached({ ...base, goal: 'gain', weightKg: 80, goalWeightKg: 80 }), true)
  // By when: 3 / 6 / 12 months (end of month clamps).
  assert.deepEqual([addMonths(T0, 3), addMonths(T0, 6), addMonths(T0, 12), addMonths('2026-08-31', 6)], ['2027-01-27', '2027-04-27', '2027-10-27', '2027-02-28'])
})
t('v1.13 soft warning: over 1% of body weight a week, or a Lose target under 1,500 / 1,200; the earliest date clears both', () => {
  const base = { ...reed, sex: 'male', bmr: 1859, activity: 'light', weightKg: 92, goalWeightKg: 80, planFrom: { date: T0, kg: 92 } }
  const at = (d) => checkOf({ ...base, goalDate: d })
  assert.deepEqual(at('2027-04-27'), { fast: false, low: false, warn: false, suggest: null }) // 0.46 kg a week, 2,048 kcal
  const two = at('2026-12-27') // 61 days: 1.38 kg a week, 1,041 kcal
  assert.deepEqual([two.fast, two.low, two.warn, two.suggest], [true, true, true, '2027-01-27'])
  // The suggested date clears both and the day before does not.
  assert.equal(at(two.suggest).warn, false)
  assert.equal(at(addDays(two.suggest, -1)).warn, true)
  // 1% a week exactly is fine: 92 kg -> 0.92 kg a week; 12 kg needs 91.3 days.
  assert.equal(checkOf({ ...base, includeMovement: true, bmr: 3000, goalDate: addDays(T0, 92) }).fast, false)
  assert.equal(checkOf({ ...base, includeMovement: true, bmr: 3000, goalDate: addDays(T0, 91) }).fast, true)
  // Gain only checks the speed; Keep never warns.
  const gain = { ...base, goal: 'gain', weightKg: 60, goalWeightKg: 70, planFrom: { date: T0, kg: 60 } }
  const gc = checkOf({ ...gain, goalDate: addDays(T0, 30) })
  assert.deepEqual([gc.fast, gc.low], [true, false])
  assert.equal(gc.suggest, addDays(T0, Math.ceil(10 * 7 / 0.6)))
  assert.equal(checkOf({ ...base, goal: 'keep', goalDate: null }).warn, false)
  // Movement off with a base at or under the line: no date can clear it, so no suggestion (the copy says what helps).
  const low = checkOf({ ...base, sex: 'female', bmr: 1150, includeMovement: false, goalDate: '2027-10-27' })
  assert.deepEqual([low.low, low.warn, low.suggest], [true, true, null])
})
t('v1.13 weigh-ins: ahead / on track / behind vs the plan line (0.2 kg either side), reached past the goal', () => {
  const p = { ...reed, weightKg: 90.6, goalWeightKg: 80, goalDate: '2027-01-10', planFrom: { date: '2026-10-20', kg: 90.6 } } // 82 days
  assert.ok(Math.abs(expectedKg(p, '2026-10-27') - (90.6 - 10.6 * 7 / 82)) < 1e-9) // 89.7
  assert.equal(expectedKg(p, '2027-03-01'), 80)
  assert.equal(weighInStatus(p, 89.2, '2026-10-27'), 'ahead')
  assert.equal(weighInStatus(p, 89.8, '2026-10-27'), 'onTrack')
  assert.equal(weighInStatus(p, 91.2, '2026-10-27'), 'behind')
  assert.equal(weighInStatus(p, 79.9, '2026-10-27'), 'reached')
  assert.equal(weighInStatus({ ...p, goal: 'keep', goalDate: null }, 91, '2026-10-27'), null)
})
t('v1.3.3: BMR stays as stored when a custom BMR profile is normalised (no D change: Me still recalculates on body edits)', () => {
  const p = normaliseProfile({ age: 35, sex: 'male', heightCm: 180, weightKg: 100, activity: 'light', goal: 'lose', bmr: 1900, bmrCustom: true, includeMovement: false })
  assert.deepEqual([p.bmr, p.bmrCustom], [1900, true])
  assert.equal(calcBmr(p), 1955) // Mifflin for 100 kg, 180 cm, 35: 1000 + 1125 - 175 + 5; the typed 1900 is kept
  // v1.13: old data (pace, no goal date) with a goal weight under the current weight keeps it and gets a date that keeps
  // the v1.12 target. Here v1.12 held 1900 - 550 = 1350 at the 1,500 floor (deficit 400): 20 kg x 7,700 / 400 = 385 days.
  const raw = { age: 35, sex: 'male', heightCm: 180, weightKg: 100, activity: 'light', goal: 'lose', bmr: 1900, bmrCustom: true, includeMovement: false, pace: 'standard' }
  const g = normaliseProfile({ ...raw, goalWeightKg: 80 }, T0)
  assert.deepEqual([g.goalWeightKg, g.goalDate, g.goalAssumed, g.target, g.dailyGoal], [80, addDays(T0, 385), true, 1500, 400])
  assert.ok(!('pace' in g))
  // Not floored (Movement on): 20 kg at 0.5 kg a week = 280 days, the deficit stays 550.
  const on = normaliseProfile({ ...raw, includeMovement: true, goalWeightKg: 80 }, T0)
  assert.deepEqual([on.goalDate, on.dailyGoal], [addDays(T0, 280), 550])
})
t('macroPlan builds on the kcal it is given (maintenance)', () => {
  assert.deepEqual(macroPlan(1900, 92, auto), { kcal: 1900, protein: 147, fat: 55, carbs: 204, adjusted: false })
  assert.deepEqual(macroPlan(2200, 68, auto), { kcal: 2200, protein: 109, fat: 61, carbs: 304, adjusted: false })
  assert.deepEqual(macroPlan(1600, 68, auto), { kcal: 1600, protein: 109, fat: 44, carbs: 191, adjusted: false })
  assert.deepEqual(splitMacros(1600, 68, auto), { protein: 109, carbs: 191, fat: 44 })
})

// ---------- Home balance with Movement off (v1.3.1: plain BMR) ----------
const day = '2026-10-24'
const food = (date, kcal) => ({ id: 'f' + kcal, date, meal: 'lunch', foodId: null, name: 'x', servingLabel: '1', servingMult: 1, qty: 1, kcal, protein: 0, carbs: 0, fat: 0, createdAt: 1 })
const run = (date, kcal) => ({ id: 'r' + kcal, date, activityId: null, name: 'run', minutes: 30, intensity: 'moderate', kcal, createdAt: 2 })
// v1.13: these profiles carry a goal date (10 kg over 140 days = 550 a day), so they test the goal-date plan, not the migration.
const prof = (x) => normaliseProfile(withGoal({ age: 34, sex: 'female', heightCm: 168, weightKg: 68, activity: 'light', goal: 'lose', bmr: 1600, bmrCustom: true, pace: 'standard', ...x }))
t('v1.3.1 acceptance: Movement off balance goal Keep = 0, Lose = +550 (v1.13 no floor), Gain = -550', () => {
  assert.equal(prof({ includeMovement: false, goal: 'keep' }).dailyGoal, 0) // no implied surplus: target = BMR = Home burn
  assert.equal(prof({ includeMovement: false, goal: 'keep' }).target, 1600)
  const lose = prof({ includeMovement: false })
  assert.equal(lose.target, 1050) // v1.13: no floor (v1.8 held it at 1,200)
  assert.equal(lose.dailyGoal, 550) // 400 in v1.8, 384 in v1.3, 320 in v1.3.1 to v1.7
  assert.equal(dailyPlan(lose).planDeficit, 550)
  assert.equal(prof({ includeMovement: false, goal: 'gain' }).target, 2150)
  assert.equal(prof({ includeMovement: false, goal: 'gain' }).dailyGoal, -550) // 1600 - 2150
  for (const goal of ['lose', 'keep', 'gain']) for (const pace of ['gentle', 'standard', 'faster']) {
    const p = dailyPlan({ ...reed, includeMovement: false, goal, pace })
    assert.equal(p.dailyGoal, p.planDeficit, `${goal} ${pace}`)
  }
})
t('v1.3.1: Home burn is plain BMR with Movement off (no base burn), BMR + movement with it on', () => {
  assert.equal(homeBase({ bmr: 1600, activity: 'light', includeMovement: false }), 1600)
  assert.equal(homeBase({ bmr: 1600, activity: 'light', includeMovement: true }), 2200)
  assert.equal(homeBase({ bmr: 1401, activity: 'light', includeMovement: false }), 1401)
  const off = prof({ includeMovement: false })
  const d = liveDay({ entries: [food(day, 1050)], exercises: [] }, off, day)
  assert.equal(d.baseBurn, undefined)
  assert.ok(!('baseBurn' in d))
  assert.equal(d.movement, 0)
  assert.equal(d.balance, 550) // eat exactly the target -> right on the goal
  assert.equal(d.goal, 550)
  assert.equal(goalMessage(d.balance, d.goal, true), 'Right on your 550 goal. Nice work.')
  assert.equal(dayBase(d), 1600)
  const keep = liveDay({ entries: [food(day, 1600)], exercises: [] }, prof({ includeMovement: false, goal: 'keep' }), day)
  assert.equal(keep.balance, 0)
  assert.equal(keep.goal, 0)
  // Exercise adds on top, same as before: target + burned - eaten is what is left.
  const ex = liveDay({ entries: [food(day, 1000)], exercises: [run(day, 300)] }, off, day)
  assert.deepEqual(macroTargets(off), { protein: 109, carbs: 191, fat: 44 }) // fixed, exercise or not
  assert.equal(ex.balance, 1600 + 300 - 1000)
  assert.equal(ex.balance - ex.goal, off.target + 300 - 1000)
})
t('v1.2.1: Movement on is unchanged (no base burn, BMR + movement, goal 550 since v1.8)', () => {
  const on = prof({ includeMovement: true })
  const d = liveDay({ entries: [food(day, 1650)], exercises: [] }, on, day)
  assert.equal(d.baseBurn, undefined)
  assert.equal(d.balance, 550)
  assert.equal(d.goal, 550)
  assert.equal(prof({ includeMovement: true, goal: 'keep' }).dailyGoal, 0)
  assert.ok(!('baseBurn' in summarise(d, false)))
})
t('v1.3.1: closing a Movement-off day freezes BMR and goal; older closed days (incl. v1.3 base burn) keep theirs', () => {
  const off = prof({ includeMovement: false })
  const s = summarise(liveDay({ entries: [food(day, 1500)], exercises: [] }, off, day), false)
  assert.deepEqual([s.baseBurn, s.bmr, s.balance, s.goal], [undefined, 1600, 100, 550])
  assert.ok(!('baseBurn' in s))
  const oldDay = { bmr: 1600, movement: 0, burned: 0, eaten: 1500, balance: 100, goal: 64, protein: 0, closedAt: 1, auto: true } // closed under v1.2
  const v13Day = { bmr: 1600, movement: 0, baseBurn: 1920, burned: 0, eaten: 1500, balance: 420, goal: 384, protein: 0, closedAt: 2, auto: true } // closed under v1.3
  const state = { profile: off, entries: [food('2026-10-21', 1500), food('2026-10-22', 1500), food(day, 1500)], exercises: [], closedDays: { '2026-10-21': v13Day, '2026-10-22': oldDay, '2026-10-23': s }, favourites: [] }
  const v = dayView(state, '2026-10-22')
  assert.deepEqual([v.balance, v.goal, v.baseBurn, dayBase(v)], [100, 64, undefined, 1600]) // untouched
  const v13 = dayView(state, '2026-10-21')
  assert.deepEqual([v13.balance, v13.goal, v13.baseBurn, dayBase(v13)], [420, 384, 1920, 1920]) // not recomputed
  assert.deepEqual([dayView(state, '2026-10-23').goal, dayView(state, '2026-10-23').balance], [550, 100])
  // Loading old state (a v1.3 Movement-off profile stored with target 1536 / goal 384) re-derives the profile only.
  const m = migrateState({ version: 2, ...state, profile: { ...off, target: 1536, dailyGoal: 384 } })
  assert.deepEqual([m.profile.target, m.profile.dailyGoal], [1050, 550])
  assert.deepEqual(m.closedDays['2026-10-22'], oldDay)
  assert.deepEqual(m.closedDays['2026-10-21'], v13Day)
})

// ---------- Target rules ----------
t('gap: 5 / 10 / 15 kg over 140 days = 275 / 550 / 825 kcal (the old paces), no cap, no BMR floor since v1.13', () => {
  const big = { ...reed, bmr: 2000, activity: 'active' } // movement 1450, base 3450 (no cap since v1.8)
  assert.equal(dailyPlan({ ...big, pace: 'gentle' }).target, 3450 - 275)
  assert.equal(dailyPlan({ ...big, pace: 'standard' }).target, 3450 - 550)
  assert.equal(dailyPlan({ ...big, pace: 'faster' }).target, 3450 - 825) // v1.7: 3450 - 690 (20% cap)
  assert.ok(!('capped' in dailyPlan({ ...big, pace: 'faster' })))
  const sed = { ...reed, bmr: 1500, activity: 'sedentary' } // base 1800 - 550 = 1250 < BMR
  assert.equal(dailyPlan(sed).target, 1250) // v1.13: no BMR floor with movement on either (v1.1 to v1.12 held it at BMR)
  assert.equal(dailyPlan({ ...sed, includeMovement: false }).target, 950) // off: 1500 - 550, no 1,200 floor
  assert.equal(dailyPlan({ ...reed, goal: 'keep' }).target, 2200)
  assert.equal(dailyPlan({ ...reed, goal: 'keep' }).dailyGoal, 0)
  assert.equal(dailyPlan({ ...reed, goal: 'gain', pace: 'gentle' }).target, 2475)
  assert.equal(dailyPlan({ ...reed, goal: 'gain', pace: 'faster' }).target, 3025) // v1.8: + 825, no cap (v1.7: 2640)
  assert.equal(dailyPlan({ ...reed, goal: 'gain', pace: 'faster' }).dailyGoal, -825)
})
// ---------- Carb floor ----------
t('carbs never under 100 g for any profile (sweep of 30-200 kg, BMR 800-3000, every pace and goal, movement on/off)', () => {
  let n = 0, adjusted = 0
  for (const kg of [30, 45, 60, 68, 80, 100, 130, 160, 200]) for (const bmr of [800, 950, 1100, 1300, 1600, 2000, 2500, 3000])
    for (const goal of ['lose', 'keep', 'gain']) for (const pace of ['gentle', 'standard', 'faster']) for (const includeMovement of [true, false]) for (const activity of ['sedentary', 'light', 'very']) {
      for (const sex of ['female', 'male']) {
      const p = dailyPlan({ sex, bmr, activity, includeMovement, goal, pace, weightKg: kg, goalWeightKg: 70, macros: auto })
      n++
      assert.ok(p.carbs >= 100, `carbs ${p.carbs} for ${kg} kg / BMR ${bmr} / ${goal} ${pace} ${includeMovement}`)
      assert.ok(p.target >= 0, `target ${p.target} under 0`) // v1.13: no 1,500 / 1,200 or BMR floor
      assert.ok(p.protein >= Math.round(1.2 * kg) && p.protein <= Math.round(1.6 * kg), 'protein range')
      assert.ok(p.fat >= Math.round(0.6 * kg), 'fat floor')
      assert.ok(Math.abs(p.protein * 4 + p.carbs * 4 + p.fat * 9 - p.macroKcal) <= 8, `kcal add up: ${p.macroKcal}`)
      if (p.adjusted) assert.ok(p.macroKcal >= p.maintenance); else assert.equal(p.macroKcal, p.maintenance)
      if (goal === 'lose') assert.ok(p.dailyGoal >= 0, 'lose goal never a surplus')
      if (p.adjusted) adjusted++
      }
    }
  results.push(`  (${n} profiles, ${adjusted} needed protein lowered or the macro kcal raised)`)
})
t('carb floor order: protein drops first (to 1.2 g/kg), then the macro kcal rise with carbs held at 100 g (the calorie target never does)', () => {
  // 1100 kcal, 68 kg: fat max(275, 367.2) = 367.2 kcal, carbs (1100 - 436 - 367.2) / 4 = 74 < 100.
  const a = macroPlan(1100, 68, auto) // protein lowered to floor((1100 - 367 - 400) / 4) = 83 (>= 82 minimum)
  assert.deepEqual(a, { kcal: 1100, protein: 83, fat: 41, carbs: 100, adjusted: true })
  const b = macroPlan(900, 68, auto) // protein at 1.2 x 68 = 82 still leaves carbs short -> macro kcal raised
  assert.equal(b.protein, 82)
  assert.equal(b.carbs, 100)
  assert.equal(b.kcal, 82 * 4 + 400 + Math.ceil(0.6 * 68 * 9)) // fat floor wins over 25%: ceil(728 + 367.2) = 1096
  // In a plan: maintenance 900 (custom low BMR) triggers the same fallback; the target is 900 - 550 = 350, untouched
  // by the macros (v1.13: no floor, the soft warning says it is low).
  const low = dailyPlan({ ...reed, weightKg: 68, bmr: 900, includeMovement: false })
  assert.deepEqual([low.target, low.dailyGoal, low.maintenance, low.macroKcal, low.protein, low.carbs, low.adjusted], [350, 550, 900, 1096, 82, 100, true])
  assert.equal(paceCheck({ ...reed, weightKg: 68, bmr: 900, includeMovement: false }).suggest, null)
  // A heavy, low-BMR profile with Movement off also trips it: 150 kg, BMR 1400 -> protein 240 g would leave carbs short.
  const heavy = dailyPlan({ ...reed, weightKg: 150, bmr: 1400, includeMovement: false })
  assert.equal(heavy.adjusted, true)
  assert.equal(heavy.carbs, 100)
  assert.equal(heavy.target, 1400 - 550)
  // A typed protein is kept; the macro kcal rise instead.
  assert.deepEqual(macroPlan(1100, 68, { ...auto, protein: 109 }), { kcal: 1204, protein: 109, fat: 41, carbs: 100, adjusted: true })
})
t('overrides are used as typed', () => {
  assert.deepEqual(macroPlan(1760, 68, { protein: 120, carbs: null, fat: 60 }), { kcal: 1760, protein: 120, fat: 60, carbs: 185, adjusted: false })
  assert.equal(macroPlan(1760, 68, { ...auto, carbs: 250 }).carbs, 250)
  assert.equal(macroPlan(1760, 68, { ...auto, carbs: 60 }).carbs, 60) // v1.2 A3: a typed value under 100 g is kept (the UI only hints)
  assert.equal(dailyPlan({ ...reed, macros: { ...auto, carbs: 60 } }).carbs, 60)
  // v1.3.2: a big typed fat no longer lifts the calorie target (v1.3.1 raised 1280 to 1358 for 70 g fat).
  const fat70 = dailyPlan({ ...reed, includeMovement: false, macros: { ...auto, fat: 70 } })
  assert.deepEqual([fat70.target, fat70.fat, fat70.protein, fat70.carbs], [1050, 70, 109, 134]) // v1.13 target: 1600 - 550, no floor // carbs (1600 - 436 - 630) / 4 = 133.5

})

// ---------- Chart scales (CR1) ----------
t('balance scale: robust symmetric scale, the +2,500 spike is clipped', () => {
  assert.equal(balanceScale([380, -420, 2500, 350, -300, 410, 1225], 440), 1500) // 2nd largest 1225 -> 1500
  assert.equal(balanceScale([380, -420, 2500, 350, -300, 410], 440), 1000) // 2 x 440 = 880 -> 1000
  assert.equal(balanceScale([380, -420, 2500, 350, -300, 410], 500), 1000)
  assert.equal(balanceScale([380, -420, 350], 0), 500) // floor 500
  assert.equal(balanceScale([2500], 500), 2500) // a single bar is never clipped
  assert.equal(balanceScale([2500, 2400, 300], 500), 2500) // two big days set the scale
  assert.equal(balanceScale([], 300), 1000)
  assert.equal(balanceScale([-1800, 200, 100], 0), 500) // surplus spike clipped too
})
const { trendScale, proteinTrendScale, barLabel, rolling } = await load('trend')
t('v1.4.1 trend scale: lopsided, fixed, closed days never cut off; labels', () => {
  assert.deepEqual(trendScale([1001, 3232, 410, -820, 45], 337), { top: 3600, bottom: 950 }) // Jordy: 3,232 + 10% -> 3,600
  assert.deepEqual(trendScale([300, -100], 337), { top: 400, bottom: 150 }) // v1.4.2: bottom only fits the surplus (100 + 10%, min 50 steps)
  assert.deepEqual(trendScale([300, 120], 337), { top: 400, bottom: 0 }) // no surplus: no bottom scale (the chart keeps a pixel margin)
  assert.deepEqual(trendScale([], 0), { top: 50, bottom: 0 })
  assert.deepEqual(trendScale([-2000, 500], 500), { top: 550, bottom: 2200 })
  assert.deepEqual(trendScale([200, -50], -300), { top: 250, bottom: 350 }) // gaining: the surplus goal line sits below zero and fits
  assert.deepEqual(proteinTrendScale([120, 182, 95], 147), { top: 210, bottom: 0 }) // 182 + 10% -> 210 g
  assert.deepEqual(proteinTrendScale([60, 80], 147), { top: 170, bottom: 0 }) // target 147 + 10% -> 170 g
  assert.deepEqual(proteinTrendScale([], 0), { top: 10, bottom: 0 })
  for (const v of [1001, 3232, 45, -820, 9999]) { const s = trendScale([v, 100], 337); assert.ok(v <= s.top && -v <= s.bottom && v * 1.09 <= s.top + (v < 0 ? Infinity : 0)) }
  assert.deepEqual([barLabel(3232, false), barLabel(-820, false), barLabel(45, true), barLabel(1559, true), barLabel(-60, true)], ['3,232', '820', '45', '1.6k', '60'])
  // The 7-day average never exceeds the biggest closed value, so it always fits the scale unclamped.
  const vals = [1001, 3232, null, 410]; const top = trendScale(vals.filter((v) => v != null), 337).top
  assert.ok(rolling(vals).every((a) => a == null || a <= top))
})
t('protein scale: max(1.25 x target, biggest value)', () => {
  assert.equal(proteinScale([60, 90], 100), 125)
  assert.equal(proteinScale([60, 180], 100), 180)
})

// ---------- Migration (state v1 -> v2) ----------
const v1Profile = { age: 34, sex: 'female', heightCm: 168, weightKg: 68, activity: 'light', goal: 'lose', target: 1700, bmr: 1600, bmrCustom: true, includeMovement: true, dailyGoal: 500, macros: { protein: null, carbs: null, fat: 70 } }
const entries = [{ id: 'a', date: '2026-10-20', meal: 'lunch', foodId: null, name: 'x', servingLabel: '1', servingMult: 1, qty: 1, kcal: 500, protein: 20, carbs: 50, fat: 10, createdAt: 1 }]
const exercises = [{ id: 'e', date: '2026-10-20', activityId: null, name: 'run', minutes: 30, intensity: 'moderate', kcal: 300, createdAt: 2 }]
const closedDays = { '2026-10-20': { bmr: 1600, movement: 600, burned: 300, eaten: 500, balance: 2000, goal: 500, protein: 20, closedAt: 3, auto: true } }
const v1 = { version: 1, profile: v1Profile, entries, exercises, closedDays, favourites: ['banana'] }
const TODAY = dateKey()
t('migration v1 -> v3: Movement kept, the old Standard pace becomes 13 kg over 182 days (same 550 deficit), logs untouched', () => {
  const snapshot = JSON.stringify(v1)
  const s = migrateState(JSON.parse(snapshot))
  assert.equal(s.version, 3)
  assert.equal(s.profile.includeMovement, true)
  // v1.13: no goal weight was asked for (it equals the current weight), so the goal is current - 0.5 kg x 26 weeks.
  assert.deepEqual([s.profile.goalWeightKg, s.profile.goalDate, s.profile.goalAssumed], [55, addDays(TODAY, 182), true])
  assert.deepEqual(s.profile.planFrom, { date: TODAY, kg: 68 })
  assert.ok(!('pace' in s.profile))
  assert.equal(s.profile.bmr, 1600) // custom BMR kept
  assert.equal(s.profile.bmrCustom, true)
  assert.deepEqual(s.profile.macros, { protein: null, carbs: null, fat: 70 }) // overrides kept
  assert.equal(s.profile.target, 1650) // the same as v1.12: 2200 - 550
  assert.equal(s.profile.dailyGoal, 550)
  assert.deepEqual(s.weights, [{ date: TODAY, kg: 68 }]) // the weight log starts with the current weight
  assert.deepEqual(s.entries, entries)
  assert.deepEqual(s.exercises, exercises)
  assert.deepEqual(s.closedDays, closedDays) // frozen days keep their old goal of 500
  assert.deepEqual(s.favourites, ['banana'])
  assert.equal(JSON.stringify(v1), snapshot) // input not mutated
  const off = migrateState({ ...v1, profile: { ...v1Profile, includeMovement: false } })
  assert.equal(off.profile.includeMovement, false)
  // Movement off: plain BMR, 1600 - 550 = 1050, which v1.12 held at the 1,200 floor. v1.13 keeps the v1.12 number on
  // upgrade (deficit 400, goal date later to match); the typed 70 g fat never moves it.
  assert.equal(off.profile.target, 1200)
  assert.equal(off.profile.dailyGoal, 400)
  assert.equal(off.profile.goalAssumed, true)
  // v0 profile without the movement field keeps the old behaviour (movement counted).
  const { includeMovement, bmr, bmrCustom, dailyGoal, ...v0 } = v1Profile
  const m0 = migrateState({ ...v1, profile: v0 })
  assert.equal(m0.profile.includeMovement, true)
  assert.equal(m0.profile.bmr, calcBmr(v0))
})
t('migration v2 -> v3: every pace and goal keeps its old daily deficit; a real goal weight keeps it and gets a date', () => {
  const KG = { gentle: 0.25, standard: 0.5, faster: 0.75 }, KCAL = { gentle: 275, standard: 550, faster: 825 }
  for (const pace of ['gentle', 'standard', 'faster']) for (const goal of ['lose', 'gain']) {
    const v2 = { version: 2, profile: { ...v1Profile, goal, pace, goalWeightKg: 68 }, entries: [], exercises: [], closedDays: {}, favourites: [] }
    const p = migrateState(v2, T0).profile
    // Lose Faster: v1.12 held 2200 - 825 = 1375 at the Movement-on BMR floor (1600), so that number is kept instead.
    if (goal === 'lose' && pace === 'faster') {
      assert.deepEqual([p.target, p.dailyGoal], [1600, 600])
      assert.ok(daysBetween(T0, p.goalDate) >= LEGACY_PLAN_DAYS && daysBetween(T0, p.goalDate) <= LEGACY_PLAN_DAYS + 14)
      continue
    }
    assert.equal(p.goalDate, addDays(T0, LEGACY_PLAN_DAYS))
    assert.equal(p.goalWeightKg, Math.round((68 + (goal === 'lose' ? -1 : 1) * KG[pace] * 26) * 10) / 10)
    assert.equal(p.dailyGoal, goal === 'lose' ? KCAL[pace] : -KCAL[pace], `${goal} ${pace}`)
  }
  // Goal weight on the right side (set by hand before v1.3.3): kept, date = kg to go at the old pace.
  assert.deepEqual(legacyGoal({ ...v1Profile, pace: 'standard' }, 62, T0), { goalWeightKg: 62, goalDate: addDays(T0, 84), goalAssumed: true }) // 6 kg / 0.5 = 12 weeks
  assert.deepEqual(legacyGoal({ ...v1Profile, goal: 'gain', pace: 'faster' }, 71, T0), { goalWeightKg: 71, goalDate: addDays(T0, 28), goalAssumed: true }) // 3 kg / 0.75 = 4 weeks
  const kept = migrateState({ version: 2, profile: { ...v1Profile, pace: 'standard', goalWeightKg: 62 }, entries: [], exercises: [], closedDays: {}, favourites: [] }, T0).profile
  assert.deepEqual([kept.goalWeightKg, kept.dailyGoal], [62, 550])
  // Keep: no date, the stored goal weight is kept (unused), no note.
  const keep = migrateState({ version: 2, profile: { ...v1Profile, goal: 'keep', pace: 'faster', goalWeightKg: 50 }, entries: [], exercises: [], closedDays: {}, favourites: [] }, T0).profile
  assert.deepEqual([keep.goalDate, keep.goalWeightKg, keep.dailyGoal, 'goalAssumed' in keep], [null, 50, 0, false])
  // An unknown pace is read as Standard.
  assert.equal(migrateState({ version: 2, profile: { ...v1Profile, pace: 'zoom' }, entries: [], exercises: [], closedDays: {}, favourites: [] }, T0).profile.dailyGoal, 550)
})
t('v1.13 migration keeps the v1.12 daily target: Jordy-like profile (male 92 kg, Movement off, floored) and a sweep', () => {
  // Jordy-like v2 profile: Mifflin BMR, Movement off (watch), Standard. v1.12: 1859 - 550 = 1309, held at 1,500.
  const jordy = { age: 32, sex: 'male', heightCm: 175, weightKg: 92, activity: 'light', goal: 'lose', pace: 'standard', bmr: 1859, bmrCustom: false, includeMovement: false, goalWeightKg: 92, target: 1500, dailyGoal: 359, macros: { protein: null, carbs: null, fat: null } }
  const j = migrateState({ version: 2, profile: jordy, entries: [], exercises: [], closedDays: {}, favourites: [] }, T0).profile
  assert.deepEqual([j.target, j.dailyGoal, j.bmr, j.goalAssumed], [1500, 359, 1859, true])
  // Sweep: every lose/gain profile whose v1.12 plan had something to cut keeps its exact target and goal.
  let n = 0
  for (const sex of ['male', 'female']) for (const bmr of [1150, 1400, 1600, 1859, 2100, 2600]) for (const includeMovement of [true, false])
    for (const pace of ['gentle', 'standard', 'faster']) for (const goal of ['lose', 'gain']) for (const weightKg of [55, 68, 92, 130]) for (const gwOff of [0, -6.3, 4.1]) {
      const old = { age: 40, sex, heightCm: 170, weightKg, activity: 'moderate', goal, pace, bmr, bmrCustom: true, includeMovement, goalWeightKg: weightKg + gwOff, macros: { protein: null, carbs: null, fat: null } }
      const base = includeMovement ? Math.round(bmr * 1.55) : bmr
      const want = (goal === 'lose' ? -1 : 1) * { gentle: 275, standard: 550, faster: 825 }[pace]
      const floor = includeMovement ? Math.max(bmr, sex === 'male' ? 1500 : 1200) : (sex === 'male' ? 1500 : 1200)
      const v112 = Math.max(floor, Math.round(base + want))
      if (goal === 'lose' && v112 >= base) continue // nothing left to cut: can't be matched without a floor (caveat)
      const p = migrateState({ version: 2, profile: old, entries: [], exercises: [], closedDays: {}, favourites: [] }, T0).profile
      assert.equal(p.target, v112, JSON.stringify(old))
      assert.equal(p.dailyGoal, base - v112)
      n++
    }
  console.log(`  (${n} migrated profiles keep their v1.12 target)`)
})
t('migration: v3 is stable, a weight log is kept and cleaned, unknown or newer versions are refused', () => {
  const s = migrateState(v1)
  assert.deepEqual(migrateState(JSON.parse(JSON.stringify(s))), s)
  const w = migrateState({ ...s, weights: [{ date: '2026-10-08', kg: 91.4 }, { date: '2026-10-01', kg: 92 }, { date: 'bad', kg: 90 }, { date: '2026-10-08', kg: 91.2 }, { date: '2026-10-09', kg: -1 }] })
  assert.deepEqual(w.weights, [{ date: '2026-10-01', kg: 92 }, { date: '2026-10-08', kg: 91.2 }])
  assert.equal(migrateState({ ...v1, version: 4 }), null)
  assert.equal(migrateState(null), null)
  assert.equal(migrateState({ ...v1, profile: null }).profile, null)
})
t('normaliseProfile: a new profile can start with movement off; goal weight and goal date are kept', () => {
  const p = normaliseProfile({ age: 30, sex: 'female', heightCm: 165, weightKg: 68, activity: 'light', goal: 'lose', includeMovement: false, goalWeightKg: 62, goalDate: addDays(T0, 168), planFrom: { date: T0, kg: 68 } })
  assert.equal(p.includeMovement, false)
  assert.deepEqual([p.goalWeightKg, p.goalDate], [62, addDays(T0, 168)])
  assert.ok(!('goalAssumed' in p))
  assert.equal(p.bmr, 1400)
  assert.equal(p.target, 1400 - 275) // 6 kg x 7,700 / 168 = 275; 1,125 is under the 1,200 line: a warning, no floor
})

// ---------- Nutrition (v1.2) ----------
t('split: 100 g P, 100 g C, 89 g F -> 25/25/50 (4/4/9 kcal per g)', () => {
  assert.deepEqual(macroSplit({ protein: 100, carbs: 100, fat: 89 }), { protein: 25, carbs: 25, fat: 50 })
})
t('split edge cases: always sums to 100, gap goes to the largest, empty is null', () => {
  assert.equal(macroSplit({ protein: 0, carbs: 0, fat: 0 }), null)
  assert.deepEqual(macroSplit({ protein: 30, carbs: 0, fat: 0 }), { protein: 100, carbs: 0, fat: 0 })
  assert.deepEqual(macroSplit({ protein: 0, carbs: 0, fat: 5 }), { protein: 0, carbs: 0, fat: 100 })
  // Thirds: 33.3 x 3 rounds to 99 -> +1 on the first largest (protein, tie order P, C, F).
  assert.deepEqual(macroSplit({ protein: 9, carbs: 9, fat: 4 }), { protein: 34, carbs: 33, fat: 33 })
  // Rounds up to 101: 4 + 4 + 9 kcal = 23.5, 23.5, 52.9 -> 24 + 24 + 53, so the largest (fat) gives 1 back.
  assert.deepEqual(macroSplit({ protein: 1, carbs: 1, fat: 1 }), { protein: 24, carbs: 24, fat: 52 })
  assert.deepEqual(macroSplit({ protein: 59, carbs: 129, fat: 22 }), { protein: 25, carbs: 54, fat: 21 }) // fixture day
  assert.deepEqual(macroSplit({ protein: 109, carbs: 179, fat: 43 }), { protein: 28, carbs: 47, fat: 25 }) // target split, movement-off example
  let n = 0
  for (let p = 0; p <= 60; p += 3) for (let c = 0; c <= 60; c += 4) for (let f = 0; f <= 30; f += 1.5) {
    const s = macroSplit({ protein: p, carbs: c, fat: f })
    if (!s) continue
    n++
    assert.equal(s.protein + s.carbs + s.fat, 100, `${p}/${c}/${f}`)
    for (const v of Object.values(s)) assert.ok(v >= 0 && v <= 100)
  }
  results.push(`  (${n} split combinations sum to 100)`)
})
t('pctOf: whole percent, 0 without a target', () => {
  assert.equal(pctOf(75, 109), 69)
  assert.equal(pctOf(70, 49), 143)
  assert.equal(pctOf(975, 1760), 55)
  assert.equal(pctOf(10, 0), 0)
})

// ---------- Backup compatibility ----------
t('backup: schema 1 (state v1, old key), 2 (state v2) and 3 (state v3) all parse; newer schema refused', () => {
  assert.equal(BACKUP_SCHEMA, 3)
  assert.equal(STATE_KEY, 'calorie-app:v3')
  assert.ok(isStateKey(V2_STATE_KEY) && isStateKey(LEGACY_STATE_KEY) && isStateKey(STATE_KEY) && !isStateKey('calorie-app:foods'))
  const old = parseBackup(JSON.stringify({ app: 'calorie-counter', schema: 1, exportedAt: '2026-10-01T00:00:00Z', data: { [LEGACY_STATE_KEY]: v1 } }))
  assert.equal(old.ok, true)
  assert.equal(old.state.version, 1)
  assert.equal(migrateState(old.state).profile.dailyGoal, 550)
  const v2 = { ...v1, version: 2, profile: { ...v1Profile, pace: 'gentle', goalWeightKg: 68 } }
  const two = parseBackup(JSON.stringify({ app: 'calorie-counter', schema: 2, exportedAt: '2026-10-01T00:00:00Z', data: { [V2_STATE_KEY]: v2 } }))
  assert.equal(two.ok, true)
  assert.equal(migrateState(two.state).profile.dailyGoal, 275)
  const cur = parseBackup(JSON.stringify({ app: 'calorie-counter', schema: 3, exportedAt: '2026-10-01T00:00:00Z', data: { [STATE_KEY]: migrateState(v1) } }))
  assert.equal(cur.ok, true)
  assert.equal(cur.summary.entries, 1)
  const newer = parseBackup(JSON.stringify({ app: 'calorie-counter', schema: 4, data: {} }))
  assert.equal(newer.ok, false)
})

// ---------- Weight log (v1.13) ----------
const mePro = normaliseProfile({ age: 32, sex: 'male', heightCm: 175, weightKg: 90.6, activity: 'light', goal: 'lose', includeMovement: true, goalWeightKg: 80, goalDate: '2027-04-27', planFrom: { date: '2026-10-20', kg: 90.6 } })
const meState = { version: 3, profile: mePro, entries: [], exercises: [], closedDays: {}, favourites: [], weights: [{ date: '2026-10-01', kg: 92 }, { date: '2026-10-20', kg: 90.6 }] }
t('logWeight: the latest weigh-in becomes the current weight, re-works BMR and re-plans from that day to the same goal', () => {
  const s = logWeight(meState, '2026-10-27', 89.74)
  assert.deepEqual(s.weights.at(-1), { date: '2026-10-27', kg: 89.7 })
  assert.deepEqual([s.profile.weightKg, s.profile.planFrom, s.profile.goalWeightKg, s.profile.goalDate], [89.7, { date: '2026-10-27', kg: 89.7 }, 80, '2027-04-27'])
  assert.equal(s.profile.bmr, calcBmr({ ...mePro, weightKg: 89.7 }))
  assert.ok(Math.abs(s.profile.dailyGoal - (9.7 * 7700) / 182) <= 1, `gap ${s.profile.dailyGoal}`) // 9.7 kg over 182 days = 410
  // Same day again replaces it; a backfilled (older) weigh-in only goes into the trend, the plan stays.
  const again = logWeight(s, '2026-10-27', 89.5)
  assert.equal(again.weights.filter((w) => w.date === '2026-10-27').length, 1)
  assert.equal(again.profile.weightKg, 89.5)
  const back = logWeight(s, '2026-10-10', 91.5)
  assert.deepEqual(back.weights.map((w) => w.date), ['2026-10-01', '2026-10-10', '2026-10-20', '2026-10-27'])
  assert.deepEqual(back.profile, s.profile)
  // A typed BMR is kept.
  const custom = logWeight({ ...meState, profile: { ...mePro, bmr: 1900, bmrCustom: true } }, '2026-10-27', 89.7)
  assert.equal(custom.profile.bmr, 1900)
  // No profile yet: just logged.
  assert.deepEqual(logWeight({ ...meState, profile: null, weights: [] }, '2026-10-27', 70).weights, [{ date: '2026-10-27', kg: 70 }])
})
t('deleteWeight: the latest goes back to the weigh-in before and re-plans; older ones only change the trend; the only one keeps the weight', () => {
  const s = logWeight(meState, '2026-10-27', 89.7)
  const d = deleteWeight(s, '2026-10-27')
  assert.deepEqual(d.weights, meState.weights)
  // Back to 90.6 kg, the plan restarts on 20 Oct (the plan was started by the deleted weigh-in), BMR worked out again.
  assert.equal(d.profile.weightKg, 90.6)
  assert.deepEqual(d.profile.planFrom, { date: '2026-10-20', kg: 90.6 })
  assert.equal(d.profile.bmr, mePro.bmr)
  assert.equal(d.profile.target, mePro.target)
  // An older weigh-in: trend only.
  const o = deleteWeight(s, '2026-10-01')
  assert.deepEqual(o.weights.map((w) => w.date), ['2026-10-20', '2026-10-27'])
  assert.deepEqual(o.profile, s.profile)
  // Goal set after the weigh-in before (plan start 25 Oct): keep that start day, with the earlier weight.
  const later = { ...s, profile: { ...s.profile, planFrom: { date: '2026-10-25', kg: 90.2 } }, weights: [{ date: '2026-10-20', kg: 90.6 }, { date: '2026-10-26', kg: 90 }] }
  assert.deepEqual(deleteWeight(later, '2026-10-26').profile.planFrom, { date: '2026-10-25', kg: 90.6 })
  // A typed BMR is kept.
  const custom = deleteWeight({ ...s, profile: { ...s.profile, bmr: 1900, bmrCustom: true } }, '2026-10-27')
  assert.equal(custom.profile.bmr, 1900)
  // The only weigh-in: the log empties, the profile stays as it is, and a v3 reload keeps the log empty.
  const one = { ...meState, weights: [{ date: '2026-10-20', kg: 90.6 }] }
  const e = deleteWeight(one, '2026-10-20')
  assert.deepEqual(e.weights, [])
  assert.deepEqual(e.profile, one.profile)
  assert.deepEqual(migrateState(JSON.parse(JSON.stringify(e)), T0).weights, [])
  // An unknown day changes nothing.
  assert.equal(deleteWeight(s, '2026-09-01'), s)
})
t('1 month goal date (v1.13): 27 Oct to 27 Nov is 31 days; 4 kg from 68 kg is 0.9 kg a week, over 1%, so it warns (and only warns)', () => {
  const date = addMonths(T0, 1)
  assert.equal(date, '2026-11-27')
  const p = normaliseProfile({ age: 30, sex: 'female', heightCm: 165, weightKg: 68, activity: 'light', goal: 'lose', includeMovement: true, goalWeightKg: 64, goalDate: date, planFrom: { date: T0, kg: 68 } }, T0)
  const plan = planOf(p)
  // 4 x 7,700 / 31 = 994 a day: 1,925 - 994 = 931.
  assert.equal(plan.target, 931)
  const c = checkOf(p, plan)
  assert.deepEqual([c.warn, c.fast, c.low], [true, true, true])
  assert.ok(c.suggest > date)
})
t('weigh-in nudge: shows once the last weigh-in is 7+ days old, hides for 7 days after Dismiss', () => {
  const w = [{ date: '2026-10-20', kg: 90.6 }]
  assert.equal(WEIGH_DAYS, 7)
  assert.equal(shouldNudge(w, '2026-10-26', null), false) // 6 days
  assert.equal(shouldNudge(w, '2026-10-27', null), true) // 7 days
  assert.equal(shouldNudge(w, '2026-10-30', '2026-10-27'), false) // dismissed 3 days ago
  assert.equal(shouldNudge(w, '2026-11-03', '2026-10-27'), true) // dismissed a week ago, still no weigh-in
  assert.equal(shouldNudge([], '2026-10-27', null), false)
})

t('overage', () => {
  assert.equal(overBy(43, 29), 14)
  assert.equal(overBy(29.4, 29), 0)
  assert.equal(overBy(29, 29), 0)
  assert.equal(overBy(10, 0), 0)
  assert.equal(movementKcal({ bmr: 1400, activity: 'light', includeMovement: true }), 525)
})
console.log(results.join('\n'))
