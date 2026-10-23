// Unit check for the macro split (protein 1.6 g/kg, fat >= 0.6 g/kg or 40% of the rest, carbs take what is left) and overage.
import { execSync } from 'node:child_process'
import { renameSync } from 'node:fs'
import assert from 'node:assert/strict'
const out = 'node_modules/.tmp/calc'
execSync(`npx tsc --ignoreConfig --outDir ${out} src/lib/calc.ts --module esnext --target es2022 --skipLibCheck`)
renameSync(`${out}/calc.js`, `${out}/calc.mjs`)
const { splitMacros, overBy, foodBudget, movementKcal } = await import(new URL(`../${out}/calc.mjs`, import.meta.url))
const auto = { protein: null, carbs: null, fat: null }
const kcal = (m) => m.protein * 4 + m.carbs * 4 + m.fat * 9

// 68 kg test profile from onboarding: BMR 1400, light activity, movement on, lose 500 -> budget 1425.
const onboard = { bmr: 1400, activity: 'light', includeMovement: true, dailyGoal: 500 }
assert.equal(movementKcal(onboard), 525)
assert.equal(foodBudget(onboard), 1425)
assert.deepEqual(splitMacros(1425, 68, auto), { protein: 109, carbs: 148, fat: 44 }) // 40% share (44) beats the floor (41)
// e2e profile: custom BMR 1600 + movement 600 - 500 = 1700
assert.deepEqual(splitMacros(1700, 68, auto), { protein: 109, carbs: 190, fat: 56 })
assert.deepEqual(splitMacros(1700, 68, { ...auto, protein: 110 }), { protein: 110, carbs: 189, fat: 56 })
// Floor kicks in on a small budget: 40% of 664 kcal is 30 g, the floor is 0.6 x 68 = 41 g, carbs get the rest.
assert.deepEqual(splitMacros(1100, 68, auto), { protein: 109, carbs: 74, fat: 41 })
assert.deepEqual(splitMacros(1200, 90, auto), { protein: 144, carbs: 35, fat: 54 }) // floor 54 g
assert.deepEqual(splitMacros(500, 90, auto), { protein: 144, carbs: 0, fat: 54 }) // carbs never negative
// Overrides: fat override feeds carbs, carbs override is kept as is.
assert.deepEqual(splitMacros(1700, 68, { protein: 110, carbs: null, fat: 70 }), { protein: 110, carbs: 158, fat: 70 })
assert.deepEqual(splitMacros(1700, 68, { protein: null, carbs: 250, fat: null }), { protein: 109, carbs: 250, fat: 56 })
// Calories add up to the budget (within rounding) whenever the floor does not have to eat into carbs.
for (const b of [1300, 1425, 1700, 2100, 2600]) for (const kg of [50, 68, 85]) {
  const m = splitMacros(b, kg, auto)
  assert.ok(m.fat >= Math.round(0.6 * kg), `fat floor ${b}/${kg}`)
  if (m.carbs > 0) assert.ok(Math.abs(kcal(m) - b) <= 6, `kcal ${b}/${kg}: ${kcal(m)}`)
}
// Overage
assert.equal(overBy(43, 29), 14)
assert.equal(overBy(29.4, 29), 0)
assert.equal(overBy(29, 29), 0)
assert.equal(overBy(10, 0), 0)
console.log('PASS macro split: protein 1.6 g/kg, fat floor 0.6 g/kg, carbs take the rest, overrides, overage')
