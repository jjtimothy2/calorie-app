// Unit checks for v1.1 to v1.3.2: daily target from pace (20% cap; plain BMR base with movement off since v1.3.1, a 1,500 / 1,200 kcal floor,
// a Lose goal never under 0 since v1.3.2), macros (v1.3.2: fixed, built on maintenance at the current weight: protein 1.6 g/kg,
// fat max(25% of maintenance, 0.6 g/kg), carbs the rest with a 100 g floor), chart scales, storage + backup migration.
import { execSync } from 'node:child_process'
import { readdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import assert from 'node:assert/strict'
const out = 'node_modules/.tmp/calc'
rmSync(out, { recursive: true, force: true })
execSync(`npx tsc --ignoreConfig --outDir ${out} src/lib/calc.ts src/lib/migrate.ts src/lib/backup.ts --module esnext --target es2022 --skipLibCheck --lib es2022,dom`)
// Node needs file extensions on ESM imports: rename to .mjs and patch relative imports.
for (const f of readdirSync(out).filter((f) => f.endsWith('.js'))) {
  const src = readFileSync(`${out}/${f}`, 'utf8').replace(/from '(\.\/[^']+)'/g, "from '$1.mjs'")
  writeFileSync(`${out}/${f.replace(/\.js$/, '.mjs')}`, src)
}
const load = (m) => import(new URL(`../${out}/${m}.mjs`, import.meta.url))
const { dailyPlan, homeBase, liveDay, dayView, summarise, dayBase, goalMessage, macroPlan, macroSplit, macroTargets, pctOf, targetFloor, splitMacros, overBy, movementKcal, balanceScale, proteinScale, calcBmr } = await load('calc')
const { migrateState, normaliseProfile } = await load('migrate')
globalThis.localStorage = { length: 0, key: () => null, getItem: () => null, setItem() {} }
const { parseBackup, BACKUP_SCHEMA, STATE_KEY, LEGACY_STATE_KEY } = await load('backup')
const auto = { protein: null, carbs: null, fat: null }
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
t('v1.3.2 example: male 92 kg, BMR 1900, Movement off -> maintenance 1900, P147 F55 C204; target 1520, goal 380', () => {
  const p = dailyPlan(male92)
  assert.equal(p.maintenance, 1900)
  // Protein 1.6 x 92 = 147; fat max(475, 0.6 x 92 x 9 = 496.8) = 55 g; carbs (1900 - 588 - 496.8) / 4 = 204.
  assert.deepEqual([p.protein, p.fat, p.carbs], [147, 55, 204])
  assert.deepEqual([p.protein, p.fat, p.carbs], ref(1900, 92))
  assert.equal(p.adjusted, false)
  assert.equal(p.target, 1520) // 1900 - min(550, 20% = 380); the calorie target is unchanged by the macro rule
  assert.equal(p.dailyGoal, 380)
  assert.equal(p.atMinimum, false)
})
t('v1.3.2 example: same, Movement on (light) -> maintenance 2613, P147 F73 C343; target 2090, goal 523', () => {
  const p = dailyPlan({ ...male92, includeMovement: true })
  assert.equal(p.movement, 713) // round(1900 x 0.375)
  assert.equal(p.maintenance, 2613)
  // Fat max(653.25, 496.8) = 73 g; carbs (2613 - 588 - 653.25) / 4 = 343.
  assert.deepEqual([p.protein, p.fat, p.carbs], [147, 73, 343])
  assert.deepEqual([p.protein, p.fat, p.carbs], ref(2613, 92))
  assert.equal(p.target, 2090) // round(2613 - 522.6)
  assert.equal(p.dailyGoal, 523)
})
t('v1.3.2: macros follow maintenance, not the pace, goal or floor (same macros for lose, keep and gain)', () => {
  for (const includeMovement of [false, true]) {
    const want = dailyPlan({ ...male92, includeMovement, goal: 'keep' })
    for (const goal of ['lose', 'keep', 'gain']) for (const pace of ['gentle', 'standard', 'faster']) {
      const p = dailyPlan({ ...male92, includeMovement, goal, pace })
      assert.deepEqual([p.protein, p.fat, p.carbs], [want.protein, want.fat, want.carbs], `${goal} ${pace} ${includeMovement}`)
      assert.equal(p.maintenance, want.target) // Keep's target is maintenance
    }
  }
})
t('v1.3.2: protein uses the CURRENT weight; goal weight changes nothing', () => {
  const a = dailyPlan({ ...male92, goalWeightKg: 70 })
  const b = dailyPlan({ ...male92, goalWeightKg: 110 })
  assert.deepEqual(a, b)
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
t('v1.3.2: Reed profile (68 kg woman, BMR 1600) -> Movement on 1760 / P109 F61 C304, off 1280 / P109 F44 C191', () => {
  const on = dailyPlan(reed)
  assert.equal(on.movement, 600) // 1600 x 0.375
  assert.equal(on.target, 1760) // 2200 - min(550, 20% = 440)
  assert.equal(on.dailyGoal, 440)
  assert.equal(on.capped, true)
  assert.deepEqual([on.protein, on.fat, on.carbs], [109, 61, 304]) // maintenance 2200: fat 550 kcal, carbs 1214 / 4
  assert.deepEqual([on.protein, on.fat, on.carbs], ref(2200, 68))
  const off = dailyPlan({ ...reed, includeMovement: false })
  assert.equal(off.planBase, 1600)
  assert.equal(off.target, 1280) // 1600 - min(550, 20% of BMR = 320)
  assert.equal(off.planDeficit, 320)
  assert.equal(off.floored, false)
  assert.deepEqual([off.protein, off.fat, off.carbs], [109, 44, 191]) // maintenance 1600: fat 400 kcal, carbs 764 / 4
  assert.equal(off.dailyGoal, 320)
  for (const sex of ['female', 'male']) assert.deepEqual([dailyPlan({ ...reed, sex }).target, dailyPlan({ ...reed, sex }).dailyGoal], [1760, 440])
})

// ---------- Floors and the Lose goal (v1.3.2) ----------
t('floor: 1,500 kcal for men, 1,200 for women; anything else gets 1,200', () => {
  assert.equal(targetFloor('male'), 1500)
  assert.equal(targetFloor('female'), 1200)
  assert.equal(targetFloor(undefined), 1200)
  assert.equal(targetFloor('other'), 1200)
  assert.equal(dailyPlan({ ...reed, includeMovement: false, goal: 'keep' }).target, 1600)
  assert.equal(dailyPlan({ ...reed, includeMovement: false, goal: 'gain' }).target, 1920) // + min(550, 320)
})
t('v1.3.2 floor Lose: goal = base - floor when the floor applies (male BMR 1600 -> 1500, goal 100)', () => {
  const m = dailyPlan({ ...reed, sex: 'male', includeMovement: false })
  assert.deepEqual([m.target, m.floored, m.planDeficit, m.dailyGoal, m.atMinimum], [1500, true, 100, 100, false])
  const f = dailyPlan({ ...reed, bmr: 1400, includeMovement: false }) // 1400 - 280 = 1120 -> 1200 floor
  assert.deepEqual([f.target, f.floored, f.dailyGoal, f.atMinimum], [1200, true, 200, false])
  const on = dailyPlan({ ...reed, sex: 'male', bmr: 1300, activity: 'sedentary' }) // base 1560, 1560 - 312 = 1248 -> 1500
  assert.deepEqual([on.target, on.floored, on.dailyGoal, on.atMinimum], [1500, true, 60, false])
})
t('v1.3.2 floor Lose: base at or under the floor -> goal 0 and atMinimum, never a surplus', () => {
  const f = dailyPlan({ ...reed, bmr: 1200, includeMovement: false }) // woman: base 1200 = floor
  assert.deepEqual([f.target, f.planDeficit, f.dailyGoal, f.atMinimum], [1200, 0, 0, true])
  const m = dailyPlan({ ...reed, sex: 'male', bmr: 1200, includeMovement: false }) // man: base 1200 < 1500
  assert.deepEqual([m.target, m.planDeficit, m.dailyGoal, m.atMinimum], [1500, -300, 0, true]) // was a -300 "surplus goal"
  const on = dailyPlan({ ...reed, sex: 'male', bmr: 1200, activity: 'sedentary' }) // movement on: base 1440 < 1500
  assert.deepEqual([on.target, on.dailyGoal, on.atMinimum], [1500, 0, true])
  assert.equal(normaliseProfile({ age: 70, sex: 'male', heightCm: 160, weightKg: 55, activity: 'light', goal: 'lose', bmr: 1200, bmrCustom: true, includeMovement: false }).dailyGoal, 0)
  // Keep and Gain are not clamped (they never were a Lose goal); atMinimum is Lose only.
  assert.equal(dailyPlan({ ...reed, bmr: 1200, includeMovement: false, goal: 'keep' }).atMinimum, false)
  assert.equal(dailyPlan({ ...reed, sex: 'male', bmr: 1200, includeMovement: false, goal: 'gain' }).dailyGoal, 1200 - 1500)
  // Sweep: a Lose goal is never negative, and 0 only when the floor holds the whole base.
  for (const sex of ['female', 'male']) for (const bmr of [900, 1100, 1200, 1300, 1500, 1700, 2000]) for (const includeMovement of [true, false]) for (const pace of ['gentle', 'standard', 'faster']) {
    const p = dailyPlan({ ...reed, sex, bmr, includeMovement, pace, activity: 'sedentary' })
    assert.ok(p.dailyGoal >= 0, `${sex} ${bmr} ${includeMovement}`)
    if (p.dailyGoal === 0) assert.ok(p.floored && p.planBase <= p.floor && p.atMinimum)
    else assert.equal(p.dailyGoal, p.planBase - p.target)
  }
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
const prof = (x) => normaliseProfile({ age: 34, sex: 'female', heightCm: 168, weightKg: 68, activity: 'light', goal: 'lose', bmr: 1600, bmrCustom: true, pace: 'standard', ...x })
t('v1.3.1 acceptance: Movement off balance goal Keep = 0, Lose = +320, Gain = -320', () => {
  assert.equal(prof({ includeMovement: false, goal: 'keep' }).dailyGoal, 0) // no implied surplus: target = BMR = Home burn
  assert.equal(prof({ includeMovement: false, goal: 'keep' }).target, 1600)
  const lose = prof({ includeMovement: false })
  assert.equal(lose.target, 1280)
  assert.equal(lose.dailyGoal, 320) // was 384 in v1.3
  assert.equal(dailyPlan(lose).planDeficit, 320)
  assert.equal(prof({ includeMovement: false, goal: 'gain' }).target, 1920)
  assert.equal(prof({ includeMovement: false, goal: 'gain' }).dailyGoal, -320) // 1600 - 1920
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
  const d = liveDay({ entries: [food(day, 1280)], exercises: [] }, off, day)
  assert.equal(d.baseBurn, undefined)
  assert.ok(!('baseBurn' in d))
  assert.equal(d.movement, 0)
  assert.equal(d.balance, 320) // eat exactly the target -> right on the goal
  assert.equal(d.goal, 320)
  assert.equal(goalMessage(d.balance, d.goal, true), 'Right on your 320 goal. Nice work.')
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
t('v1.2.1: Movement on is unchanged (no base burn, BMR + movement, goal 440)', () => {
  const on = prof({ includeMovement: true })
  const d = liveDay({ entries: [food(day, 1760)], exercises: [] }, on, day)
  assert.equal(d.baseBurn, undefined)
  assert.equal(d.balance, 440)
  assert.equal(d.goal, 440)
  assert.equal(prof({ includeMovement: true, goal: 'keep' }).dailyGoal, 0)
  assert.ok(!('baseBurn' in summarise(d, false)))
})
t('v1.3.1: closing a Movement-off day freezes BMR and goal; older closed days (incl. v1.3 base burn) keep theirs', () => {
  const off = prof({ includeMovement: false })
  const s = summarise(liveDay({ entries: [food(day, 1500)], exercises: [] }, off, day), false)
  assert.deepEqual([s.baseBurn, s.bmr, s.balance, s.goal], [undefined, 1600, 100, 320])
  assert.ok(!('baseBurn' in s))
  const oldDay = { bmr: 1600, movement: 0, burned: 0, eaten: 1500, balance: 100, goal: 64, protein: 0, closedAt: 1, auto: true } // closed under v1.2
  const v13Day = { bmr: 1600, movement: 0, baseBurn: 1920, burned: 0, eaten: 1500, balance: 420, goal: 384, protein: 0, closedAt: 2, auto: true } // closed under v1.3
  const state = { profile: off, entries: [food('2026-10-21', 1500), food('2026-10-22', 1500), food(day, 1500)], exercises: [], closedDays: { '2026-10-21': v13Day, '2026-10-22': oldDay, '2026-10-23': s }, favourites: [] }
  const v = dayView(state, '2026-10-22')
  assert.deepEqual([v.balance, v.goal, v.baseBurn, dayBase(v)], [100, 64, undefined, 1600]) // untouched
  const v13 = dayView(state, '2026-10-21')
  assert.deepEqual([v13.balance, v13.goal, v13.baseBurn, dayBase(v13)], [420, 384, 1920, 1920]) // not recomputed
  assert.deepEqual([dayView(state, '2026-10-23').goal, dayView(state, '2026-10-23').balance], [320, 100])
  // Loading old state (a v1.3 Movement-off profile stored with target 1536 / goal 384) re-derives the profile only.
  const m = migrateState({ version: 2, ...state, profile: { ...off, target: 1536, dailyGoal: 384 } })
  assert.deepEqual([m.profile.target, m.profile.dailyGoal], [1280, 320])
  assert.deepEqual(m.closedDays['2026-10-22'], oldDay)
  assert.deepEqual(m.closedDays['2026-10-21'], v13Day)
})

// ---------- Target rules ----------
t('pace: Gentle 275, Standard 550, Faster 825 kcal, capped at 20% of BMR + movement, movement on never under BMR', () => {
  const big = { ...reed, bmr: 2000, activity: 'active' } // movement 1450, base 3450, cap 690
  assert.equal(dailyPlan({ ...big, pace: 'gentle' }).target, 3450 - 275)
  assert.equal(dailyPlan({ ...big, pace: 'standard' }).target, 3450 - 550)
  assert.equal(dailyPlan({ ...big, pace: 'faster' }).target, 3450 - 690)
  assert.equal(dailyPlan({ ...big, pace: 'faster' }).capped, true)
  const sed = { ...reed, bmr: 1500, activity: 'sedentary' } // base 1800, 20% = 360 -> 1440 < BMR
  assert.equal(dailyPlan(sed).target, 1500) // movement on keeps the v1.1 BMR floor
  assert.equal(dailyPlan({ ...sed, includeMovement: false }).target, 1200) // off (v1.3.1): 1500 - 300 = 1200, right on the floor
  assert.equal(dailyPlan({ ...reed, goal: 'keep' }).target, 2200)
  assert.equal(dailyPlan({ ...reed, goal: 'keep' }).dailyGoal, 0)
  assert.equal(dailyPlan({ ...reed, goal: 'gain', pace: 'gentle' }).target, 2475)
  assert.equal(dailyPlan({ ...reed, goal: 'gain', pace: 'faster' }).target, 2640) // surplus capped at 440 too
  assert.equal(dailyPlan({ ...reed, goal: 'gain', pace: 'faster' }).dailyGoal, -440)
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
      assert.ok(p.target >= (sex === 'male' ? 1500 : 1200), `target ${p.target} under the ${sex} floor`)
      if (includeMovement) assert.ok(p.target >= bmr, 'movement on: target under BMR')
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
  // In a plan: maintenance 900 (custom low BMR) triggers the same fallback; the target is the 1,200 floor, untouched,
  // and the Lose goal is 0 at the minimum (v1.3.2; was a -300 surplus goal).
  const low = dailyPlan({ ...reed, weightKg: 68, bmr: 900, includeMovement: false })
  assert.deepEqual([low.target, low.dailyGoal, low.atMinimum, low.maintenance, low.macroKcal, low.protein, low.carbs, low.adjusted], [1200, 0, true, 900, 1096, 82, 100, true])
  // A heavy, low-BMR profile with Movement off also trips it: 150 kg, BMR 1400 -> protein 240 g would leave carbs short.
  const heavy = dailyPlan({ ...reed, weightKg: 150, bmr: 1400, includeMovement: false })
  assert.equal(heavy.adjusted, true)
  assert.equal(heavy.carbs, 100)
  assert.equal(heavy.target, 1200)
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
  assert.deepEqual([fat70.target, fat70.fat, fat70.protein, fat70.carbs], [1280, 70, 109, 134]) // carbs (1600 - 436 - 630) / 4 = 133.5

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
t('migration v1 -> v2: Movement kept, goal weight = current weight, pace Standard, logs untouched', () => {
  const snapshot = JSON.stringify(v1)
  const s = migrateState(JSON.parse(snapshot))
  assert.equal(s.version, 2)
  assert.equal(s.profile.includeMovement, true)
  assert.equal(s.profile.goalWeightKg, 68)
  assert.equal(s.profile.pace, 'standard')
  assert.equal(s.profile.bmr, 1600) // custom BMR kept
  assert.equal(s.profile.bmrCustom, true)
  assert.deepEqual(s.profile.macros, { protein: null, carbs: null, fat: 70 }) // overrides kept
  assert.equal(s.profile.target, 1760)
  assert.equal(s.profile.dailyGoal, 440)
  assert.deepEqual(s.entries, entries)
  assert.deepEqual(s.exercises, exercises)
  assert.deepEqual(s.closedDays, closedDays) // frozen days keep their old goal of 500
  assert.deepEqual(s.favourites, ['banana'])
  assert.equal(JSON.stringify(v1), snapshot) // input not mutated
  const off = migrateState({ ...v1, profile: { ...v1Profile, includeMovement: false } })
  assert.equal(off.profile.includeMovement, false)
  // v1.3.1: re-derived on load from plain BMR (1600 - 320 = 1280), no storage change. v1.3.2: the typed 70 g fat no
  // longer raises the target (it was 1358 in v1.3.1), since macros are built on maintenance, not on the target.
  assert.equal(off.profile.target, 1280)
  assert.equal(off.profile.dailyGoal, 320)
  assert.equal(migrateState({ ...v1, profile: { ...v1Profile, includeMovement: false, macros: auto } }).profile.target, 1280)
  // v0 profile without the movement field keeps the old behaviour (movement counted).
  const { includeMovement, bmr, bmrCustom, dailyGoal, ...v0 } = v1Profile
  const m0 = migrateState({ ...v1, profile: v0 })
  assert.equal(m0.profile.includeMovement, true)
  assert.equal(m0.profile.bmr, calcBmr(v0))
})
t('migration: v2 is stable, unknown or newer versions are refused', () => {
  const s = migrateState(v1)
  assert.deepEqual(migrateState(JSON.parse(JSON.stringify(s))), s)
  assert.equal(migrateState({ ...v1, version: 3 }), null)
  assert.equal(migrateState(null), null)
  assert.equal(migrateState({ ...v1, profile: null }).profile, null)
})
t('normaliseProfile: a new profile can start with movement off; goal weight and pace are kept', () => {
  const p = normaliseProfile({ age: 30, sex: 'female', heightCm: 165, weightKg: 68, activity: 'light', goal: 'lose', includeMovement: false, goalWeightKg: 62, pace: 'gentle' })
  assert.equal(p.includeMovement, false)
  assert.equal(p.goalWeightKg, 62)
  assert.equal(p.pace, 'gentle')
  assert.equal(p.bmr, 1400)
  assert.equal(p.target, 1200) // v1.3.1: 1400 - 275 gentle = 1125, held at the 1,200 floor
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
t('backup: schema 1 (state v1, old key) and schema 2 (state v2) both parse; newer schema refused', () => {
  assert.equal(BACKUP_SCHEMA, 2)
  assert.equal(STATE_KEY, 'calorie-app:v2')
  const old = parseBackup(JSON.stringify({ app: 'calorie-counter', schema: 1, exportedAt: '2026-10-01T00:00:00Z', data: { [LEGACY_STATE_KEY]: v1 } }))
  assert.equal(old.ok, true)
  assert.equal(old.state.version, 1)
  assert.equal(migrateState(old.state).profile.pace, 'standard')
  const cur = parseBackup(JSON.stringify({ app: 'calorie-counter', schema: 2, exportedAt: '2026-10-01T00:00:00Z', data: { [STATE_KEY]: migrateState(v1) } }))
  assert.equal(cur.ok, true)
  assert.equal(cur.summary.entries, 1)
  const newer = parseBackup(JSON.stringify({ app: 'calorie-counter', schema: 3, data: {} }))
  assert.equal(newer.ok, false)
})

t('overage', () => {
  assert.equal(overBy(43, 29), 14)
  assert.equal(overBy(29.4, 29), 0)
  assert.equal(overBy(29, 29), 0)
  assert.equal(overBy(10, 0), 0)
  assert.equal(movementKcal({ bmr: 1400, activity: 'light', includeMovement: true }), 525)
})
console.log(results.join('\n'))
