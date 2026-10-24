// v1.3.1 Movement-off screenshots + checks (Reed's acceptance profile). Usage: BASE_URL=https://jjtimothy2.github.io/calorie-app node scripts/v131-shots.mjs
import { chromium } from 'playwright'
import assert from 'node:assert/strict'
const BASE = (process.env.BASE_URL ?? 'http://localhost:4174/calorie-app').replace(/\/$/, '')
const OUT = new URL('../screenshots/', import.meta.url).pathname
const pad = (n) => String(n).padStart(2, '0')
const T = ((d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`)(new Date())
const now = Date.now()
let n = 0
const e = (meal, name, kcal, protein, carbs, fat) => ({ id: 'e' + ++n, date: T, meal, foodId: null, name, servingLabel: '1 portion', servingMult: 1, qty: 1, kcal, protein, carbs, fat, createdAt: now - 1e6 + n })
const SEED = {
  version: 1,
  profile: { age: 30, sex: 'female', heightCm: 165, weightKg: 68, activity: 'light', goal: 'lose', pace: 'standard', goalWeightKg: 68, bmr: 1600, bmrCustom: true, includeMovement: false, macros: { protein: null, carbs: null, fat: null } },
  entries: [e('breakfast', 'Bubur ayam', 372, 18, 52, 10), e('lunch', 'Gado-gado', 420, 18, 38, 22), e('dinner', 'Sate ayam', 220, 21, 8, 11)],
  exercises: [{ id: 'x1', date: T, activityId: null, name: 'Morning walk', minutes: 30, intensity: 'moderate', kcal: 140, createdAt: now - 5e5 }],
  closedDays: {}, favourites: [],
}
const errors = []
const b = await chromium.launch()
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, reducedMotion: 'reduce' })
const p = await ctx.newPage()
p.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`${m.type()}: ${m.text()}`) }); p.on('pageerror', (x) => errors.push(x.message))
await p.goto(BASE + '/'); await p.evaluate((s) => { localStorage.clear(); localStorage.setItem('calorie-app:v1', JSON.stringify(s)) }, SEED)
await p.goto(BASE + '/'); await p.getByTestId('balance').waitFor(); await p.waitForTimeout(400)
const terms = await p.getByTestId('equation').locator('[data-term]').evaluateAll((els) => els.map((x) => x.getAttribute('data-term')))
const prof = await p.evaluate(() => JSON.parse(localStorage.getItem('calorie-app:v2')).profile)
const home = { terms, bmr: await p.getByTestId('eq-bmr').innerText(), balance: await p.getByTestId('eq-balance').innerText(), goal: await p.getByTestId('ring-goal').innerText(), baseBurnText: /Base burn|× 1\.2/.test(await p.locator('body').innerText()), target: prof.target, dailyGoal: prof.dailyGoal }
console.log('home', JSON.stringify(home))
assert.deepEqual(terms, ['BMR', 'Exercise', 'Eaten', 'Balance']); assert.equal(home.bmr, '1,600'); assert.equal(home.baseBurnText, false)
assert.deepEqual([prof.target, prof.dailyGoal], [1280, 320])
assert.equal(home.balance, '728') // 1600 + 140 - 1012
await p.screenshot({ path: `${OUT}v131-home.png` })
await p.goto(BASE + '/nutrition'); await p.getByTestId('cal-text').waitFor(); await p.waitForTimeout(400)
const nut = { cal: await p.getByTestId('cal-text').innerText(), protein: await p.getByTestId('protein-progress').innerText(), carbs: await p.getByTestId('nutri-carbs-text').innerText(), fat: await p.getByTestId('nutri-fat-text').innerText(), hint: await p.getByTestId('targets-hint').innerText() }
console.log('nutrition', JSON.stringify(nut))
assert.match(nut.cal, /of 1,420 kcal/); assert.match(nut.protein, /of 109 g/); assert.match(nut.carbs, /of 119 g/); assert.match(nut.fat, /of 41 g/)
await p.screenshot({ path: `${OUT}v131-nutrition.png` })
const sw = await p.evaluate(async () => (await caches.keys()).join(','))
console.log('caches', sw)
await b.close()
console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no console errors')
