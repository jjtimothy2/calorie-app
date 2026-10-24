// Unit checks for v1.1 to v1.3.1: daily target from pace (20% cap; plain BMR base with movement off since v1.3.1, a 1,500 / 1,200 kcal floor), macros (protein 1.6 g/kg goal weight,
// fat 25% with a 0.6 g/kg floor, carbs the rest with a 100 g floor), chart scales, storage + backup migration.
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
const { dailyPlan, homeBase, liveDay, dayView, summarise, dayBase, goalMessage, macroPlan, macroSplit, pctOf, targetFloor, splitMacros, overBy, movementKcal, balanceScale, proteinScale, calcBmr } = await load('calc')
const { migrateState, normaliseProfile } = await load('migrate')
globalThis.localStorage = { length: 0, key: () => null, getItem: () => null, setItem() {} }
const { parseBackup, BACKUP_SCHEMA, STATE_KEY, LEGACY_STATE_KEY } = await load('backup')
const auto = { protein: null, carbs: null, fat: null }
const results = []
const t = (name, fn) => { fn(); results.push('PASS ' + name) }

// ---------- Acceptance (Reed's CR4) ----------
const reed = { sex: 'female', bmr: 1600, activity: 'light', includeMovement: true, goal: 'lose', pace: 'standard', goalWeightKg: 68, macros: auto }
t('acceptance: 68 kg, BMR 1600 + movement 600, Standard -> 1760 / P109 F49 C221', () => {
  // Movement 600 comes from the activity factor in the app; force it with a BMR whose light movement is 600.
  const p = { ...reed, bmr: 1600 }
  const plan = dailyPlan({ ...p, activity: 'light', includeMovement: true })
  assert.equal(plan.movement, 600) // 1600 x 0.375
  assert.equal(plan.target, 1760) // 2200 - min(550, 20% = 440)
  assert.deepEqual([plan.protein, plan.fat, plan.carbs], [109, 49, 221])
  assert.equal(plan.dailyGoal, 440)
  assert.equal(plan.capped, true)
})
t('v1.3.1 acceptance: woman, BMR 1600, goal weight 68, Standard, Movement off -> 1280 / P109 F41 C119', () => {
  const plan = dailyPlan({ ...reed, includeMovement: false })
  assert.equal(plan.planBase, 1600) // plain BMR (v1.2 to v1.3 used BMR x 1.2 = 1920)
  assert.equal(plan.target, 1280) // 1600 - min(550, 20% of BMR = 320)
  assert.equal(plan.planDeficit, 320)
  assert.equal(plan.capped, true)
  assert.equal(plan.floored, false)
  // Fat max(25% = 320, 0.6 x 68 x 9 = 367.2) = 367.2 kcal = 41 g; carbs (1280 - 436 - 367.2) / 4 = 119.
  assert.deepEqual([plan.protein, plan.fat, plan.carbs], [109, 41, 119])
  assert.equal(plan.dailyGoal, 320) // Home counts BMR 1600, so the balance goal is the 320 deficit
})
t('v1.3.1 acceptance: same profile, male, Movement off -> target on the 1,500 floor', () => {
  const plan = dailyPlan({ ...reed, sex: 'male', includeMovement: false })
  assert.equal(plan.planBase, 1600)
  assert.equal(plan.target, 1500) // 1280 would be under the 1,500 floor for men
  assert.equal(plan.floored, true)
  assert.equal(plan.planDeficit, 100) // the floor shrinks the deficit from 320 to 100
  assert.equal(plan.dailyGoal, 100)
  // Fat max(25% = 375, 367.2) = 375 kcal = 42 g; carbs (1500 - 436 - 375) / 4 = 172.
  assert.deepEqual([plan.protein, plan.fat, plan.carbs], [109, 42, 172])
})
t('v1.2: Movement on is unchanged (1760 / P109 F49 C221 for women and men)', () => {
  for (const sex of ['female', 'male']) {
    const plan = dailyPlan({ ...reed, sex })
    assert.deepEqual([plan.target, plan.protein, plan.fat, plan.carbs, plan.dailyGoal], [1760, 109, 49, 221, 440])
  }
})
t('v1.2 floor: 1,500 kcal for men, 1,200 for women; anything else gets 1,200', () => {
  assert.equal(targetFloor('male'), 1500)
  assert.equal(targetFloor('female'), 1200)
  assert.equal(targetFloor(undefined), 1200)
  assert.equal(targetFloor('other'), 1200)
  const small = { ...reed, bmr: 1200, includeMovement: false } // 1200 - 240 = 960
  const f = dailyPlan(small)
  assert.equal(f.target, 1200)
  assert.equal(f.floored, true)
  assert.equal(f.planDeficit, 0) // held at the floor, which here equals BMR
  const m = dailyPlan({ ...small, sex: 'male' }) // 960 < 1500
  assert.equal(m.target, 1500)
  assert.equal(m.planDeficit, -300) // the floor sits above the plan base
  assert.equal(m.dailyGoal, -300) // goal against BMR 1200: a surplus
  // Keep and gain with movement off also start from plain BMR (v1.3.1).
  assert.equal(dailyPlan({ ...reed, includeMovement: false, goal: 'keep' }).target, 1600)
  assert.equal(dailyPlan({ ...reed, includeMovement: false, goal: 'gain' }).target, 1920) // + min(550, 320)
})
t('macroPlan matches the acceptance numbers directly', () => {
  assert.deepEqual(macroPlan(1760, 68, auto), { target: 1760, protein: 109, fat: 49, carbs: 221, adjusted: false })
  assert.deepEqual(macroPlan(1536, 68, auto), { target: 1536, protein: 109, fat: 43, carbs: 179, adjusted: false })
  assert.deepEqual(macroPlan(1280, 68, auto), { target: 1280, protein: 109, fat: 41, carbs: 119, adjusted: false })
  assert.deepEqual(splitMacros(1760, 68, auto), { protein: 109, carbs: 221, fat: 49 })
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
t('goal weight drives protein and the fat floor, not the target', () => {
  const p = dailyPlan({ ...reed, goalWeightKg: 60 })
  assert.equal(p.target, 1760)
  assert.equal(p.protein, 96) // round(1.6 x 60)
  assert.equal(p.fat, 49) // 25% of 1760 beats 0.6 x 60
})

// ---------- Carb floor ----------
t('carbs never under 100 g for any profile (sweep of 30-200 kg, BMR 800-3000, every pace and goal, movement on/off)', () => {
  let n = 0, adjusted = 0
  for (const kg of [30, 45, 60, 68, 80, 100, 130, 160, 200]) for (const bmr of [800, 950, 1100, 1300, 1600, 2000, 2500, 3000])
    for (const goal of ['lose', 'keep', 'gain']) for (const pace of ['gentle', 'standard', 'faster']) for (const includeMovement of [true, false]) for (const activity of ['sedentary', 'light', 'very']) {
      for (const sex of ['female', 'male']) {
      const p = dailyPlan({ sex, bmr, activity, includeMovement, goal, pace, goalWeightKg: kg, macros: auto })
      n++
      assert.ok(p.carbs >= 100, `carbs ${p.carbs} for ${kg} kg / BMR ${bmr} / ${goal} ${pace} ${includeMovement}`)
      assert.ok(p.target >= (sex === 'male' ? 1500 : 1200), `target ${p.target} under the ${sex} floor`)
      if (includeMovement) assert.ok(p.target >= bmr, 'movement on: target under BMR')
      assert.ok(p.protein >= Math.round(1.2 * kg) && p.protein <= Math.round(1.6 * kg), 'protein range')
      assert.ok(p.fat >= Math.round(0.6 * kg), 'fat floor')
      assert.ok(Math.abs(p.protein * 4 + p.carbs * 4 + p.fat * 9 - p.target) <= 8, `kcal add up: ${p.target}`)
      if (p.adjusted) adjusted++
      }
    }
  results.push(`  (${n} profiles, ${adjusted} needed protein lowered or the target raised)`)
})
t('carb floor order: protein drops first (to 1.2 g/kg), then the target rises with carbs held at 100 g', () => {
  // 1100 kcal, 68 kg: fat max(275, 367.2) = 367.2 kcal, carbs (1100 - 436 - 367.2) / 4 = 74 < 100.
  const a = macroPlan(1100, 68, auto) // protein lowered to floor((1100 - 367 - 400) / 4) = 83 (>= 82 minimum)
  assert.deepEqual(a, { target: 1100, protein: 83, fat: 41, carbs: 100, adjusted: true })
  const b = macroPlan(900, 68, auto) // protein at 1.2 x 68 = 82 still leaves carbs short -> target raised
  assert.equal(b.protein, 82)
  assert.equal(b.carbs, 100)
  assert.equal(b.target, 82 * 4 + 400 + Math.ceil(0.6 * 68 * 9)) // fat floor wins over 25%: ceil(728 + 367.2) = 1096
  // The 1,200 floor sits above this, so the plan target is 1,200 and the balance goal follows (BMR 900 - 1200, v1.3.1).
  const low = dailyPlan({ ...reed, bmr: 900, includeMovement: false })
  assert.equal(low.target, 1200)
  assert.equal(low.dailyGoal, 900 - 1200)
  assert.ok(low.carbs >= 100)
  // A typed protein is kept; the target rises instead.
  assert.deepEqual(macroPlan(1100, 68, { ...auto, protein: 109 }), { target: 1204, protein: 109, fat: 41, carbs: 100, adjusted: true })
})
t('overrides are used as typed', () => {
  assert.deepEqual(macroPlan(1760, 68, { protein: 120, carbs: null, fat: 60 }), { target: 1760, protein: 120, fat: 60, carbs: 185, adjusted: false })
  assert.equal(macroPlan(1760, 68, { ...auto, carbs: 250 }).carbs, 250)
  assert.equal(macroPlan(1760, 68, { ...auto, carbs: 60 }).carbs, 60) // v1.2 A3: a typed value under 100 g is kept (the UI only hints)
  assert.equal(dailyPlan({ ...reed, macros: { ...auto, carbs: 60 } }).carbs, 60)
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
  // v1.3.1: re-derived on load from plain BMR (1600 - 320 = 1280), no storage change. This profile keeps a typed 70 g fat
  // (630 kcal), so carbs would fall under 100 g even with protein at 82 g: the target-raise fallback lifts it to 82 x 4 + 400 + 630.
  assert.equal(off.profile.target, 1358)
  assert.equal(off.profile.dailyGoal, 1600 - 1358)
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
