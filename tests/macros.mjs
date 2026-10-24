// Unit checks for v1.1: daily target from pace (20% cap, BMR floor), macros (protein 1.6 g/kg goal weight,
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
const { dailyPlan, macroPlan, splitMacros, overBy, movementKcal, balanceScale, proteinScale, calcBmr } = await load('calc')
const { migrateState, normaliseProfile } = await load('migrate')
globalThis.localStorage = { length: 0, key: () => null, getItem: () => null, setItem() {} }
const { parseBackup, BACKUP_SCHEMA, STATE_KEY, LEGACY_STATE_KEY } = await load('backup')
const auto = { protein: null, carbs: null, fat: null }
const results = []
const t = (name, fn) => { fn(); results.push('PASS ' + name) }

// ---------- Acceptance (Reed's CR4) ----------
const reed = { bmr: 1600, activity: 'light', includeMovement: true, goal: 'lose', pace: 'standard', goalWeightKg: 68, macros: auto }
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
t('acceptance: same profile, Movement off -> 1600 / P109 F44 C191', () => {
  const plan = dailyPlan({ ...reed, includeMovement: false })
  assert.equal(plan.target, 1600) // 1600 - 320 = 1280 is under BMR, so BMR
  assert.deepEqual([plan.protein, plan.fat, plan.carbs], [109, 44, 191])
  assert.equal(plan.dailyGoal, 0)
})
t('macroPlan matches the acceptance numbers directly', () => {
  assert.deepEqual(macroPlan(1760, 68, auto), { target: 1760, protein: 109, fat: 49, carbs: 221, adjusted: false })
  assert.deepEqual(macroPlan(1600, 68, auto), { target: 1600, protein: 109, fat: 44, carbs: 191, adjusted: false })
  assert.deepEqual(splitMacros(1760, 68, auto), { protein: 109, carbs: 221, fat: 49 })
})

// ---------- Target rules ----------
t('pace: Gentle 275, Standard 550, Faster 825 kcal, capped at 20% of BMR + movement, never under BMR', () => {
  const big = { ...reed, bmr: 2000, activity: 'active' } // movement 1450, base 3450, cap 690
  assert.equal(dailyPlan({ ...big, pace: 'gentle' }).target, 3450 - 275)
  assert.equal(dailyPlan({ ...big, pace: 'standard' }).target, 3450 - 550)
  assert.equal(dailyPlan({ ...big, pace: 'faster' }).target, 3450 - 690)
  assert.equal(dailyPlan({ ...big, pace: 'faster' }).capped, true)
  const sed = { ...reed, bmr: 1500, activity: 'sedentary' } // base 1800, 20% = 360 -> 1440 < BMR
  assert.equal(dailyPlan(sed).target, 1500)
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
    for (const goal of ['lose', 'keep', 'gain']) for (const pace of ['gentle', 'standard', 'faster']) for (const includeMovement of [true, false]) for (const activity of ['sedentary', 'very']) {
      const p = dailyPlan({ bmr, activity, includeMovement, goal, pace, goalWeightKg: kg, macros: auto })
      n++
      assert.ok(p.carbs >= 100, `carbs ${p.carbs} for ${kg} kg / BMR ${bmr} / ${goal} ${pace} ${includeMovement}`)
      assert.ok(p.target >= bmr, 'target under BMR')
      assert.ok(p.protein >= Math.round(1.2 * kg) && p.protein <= Math.round(1.6 * kg), 'protein range')
      assert.ok(p.fat >= Math.round(0.6 * kg), 'fat floor')
      assert.ok(Math.abs(p.protein * 4 + p.carbs * 4 + p.fat * 9 - p.target) <= 8, `kcal add up: ${p.target}`)
      if (p.adjusted) adjusted++
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
  assert.equal(dailyPlan({ ...reed, bmr: 900, includeMovement: false }).dailyGoal, 900 - b.target) // balance goal follows
  // A typed protein is kept; the target rises instead.
  assert.deepEqual(macroPlan(1100, 68, { ...auto, protein: 109 }), { target: 1204, protein: 109, fat: 41, carbs: 100, adjusted: true })
})
t('overrides are used as typed', () => {
  assert.deepEqual(macroPlan(1760, 68, { protein: 120, carbs: null, fat: 60 }), { target: 1760, protein: 120, fat: 60, carbs: 185, adjusted: false })
  assert.equal(macroPlan(1760, 68, { ...auto, carbs: 250 }).carbs, 250)
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
  assert.equal(off.profile.target, 1600)
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
  assert.equal(p.target, p.bmr)
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
