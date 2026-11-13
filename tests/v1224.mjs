// v1.22.4: the Home burn line follows the live balance, not the static topUp, once eaten has
// passed the safe minimum. Chromium at 390x844.
// Usage: npm run build && npx vite preview --port 4174 & node tests/v1224.mjs
import { chromium } from 'playwright'
import assert from 'node:assert/strict'

const BASE = (process.env.BASE_URL ?? 'http://localhost:4174/calorie-app').replace(/\/$/, '')
const results = [], errors = []
const step = async (name, fn) => {
  const t = Date.now()
  try { await fn(); results.push(`PASS ${name} (${Date.now() - t} ms)`) }
  catch (e) { results.push(`FAIL ${name}: ${e.message}`); console.log(results.join('\n')); console.log(errors.join('\n')); throw e }
}
const pad = (n) => String(n).padStart(2, '0')
const key = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const TODAY = key(new Date())
const addDays = (k, n) => { const [y, m, d] = k.split('-').map(Number); return key(new Date(y, m - 1, d + n)) }
const fmt = (n) => n.toLocaleString('en-US')
const food = (kcal) => ({ id: 'f1', date: TODAY, meal: 'lunch', foodId: null, name: 'Test meal', servingLabel: '1 serving', servingMult: 1, qty: 1, kcal, protein: 10, carbs: 10, fat: 5, createdAt: 1 })

// Owner's live case: female, BMR 1,198, movement off, 569 kcal deficit (eat 629, under the 1,200 floor).
const BMR = 1198, GOAL = 569, EATEN = 2366, FLOOR = 1200
const EAT = BMR - GOAL // 629
const TOPUP = FLOOR - EAT // 571
const SURPLUS = EATEN - BMR // 1,168
const OVER = GOAL + SURPLUS // 1,737

const browser = await chromium.launch()
const open = async (entries = []) => {
  // 31 days and 2.29 kg give an exact 569 deficit after kgToGo's 0.01 rounding (a 1-month date does not).
  const date = addDays(TODAY, 31)
  const profile = {
    age: 30, sex: 'female', heightCm: 160, weightKg: 70, activity: 'sedentary', goal: 'lose',
    bmr: BMR, bmrCustom: true, includeMovement: false, goalWeightKg: 67.71, goalDate: date,
    planFrom: { date: TODAY, kg: 70 }, macros: { protein: null, carbs: null, fat: null },
    target: 0, dailyGoal: 0, exerciseTopUp: true,
  }
  const v3 = JSON.stringify({ version: 3, profile, entries, exercises: [], closedDays: {}, favourites: [], weights: [{ date: TODAY, kg: 70 }] })
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, serviceWorkers: 'block', reducedMotion: 'reduce' })
  await ctx.addInitScript((v3) => {
    localStorage.setItem('calorie-app:v3', v3)
    localStorage.setItem('calorie-app:backup', JSON.stringify({ lastExportAt: Date.now(), dismissedAt: Date.now() }))
  }, v3)
  const page = await ctx.newPage()
  page.on('console', (m) => { if ((m.type() === 'error' || m.type() === 'warning') && !/service worker/i.test(m.text())) errors.push(`${m.type()}: ${m.text()}`) })
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
  await page.goto(BASE + '/')
  await page.getByTestId('ring').waitFor()
  return { ctx, page }
}
const stored = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('calorie-app:v3')))

await step('owner case: eaten 2,366 past the floor, burn line is 1,737 to be on track, not static topUp 571', async () => {
  const { ctx, page } = await open([food(EATEN)])
  const p = (await stored(page)).profile
  assert.equal(p.bmr, BMR)
  assert.equal(p.dailyGoal, GOAL, `planned deficit ${p.dailyGoal}`)
  assert.equal(p.target, EAT)
  assert.equal(p.exerciseTopUp, true)
  const msg = await page.getByTestId('ring').getAttribute('data-message')
  assert.equal(msg, `${fmt(OVER)} kcal over your ${fmt(GOAL)} goal.`)
  assert.equal(await page.getByTestId('ring').getAttribute('data-zone'), 'red')
  assert.equal(await page.getByTestId('ring').getAttribute('data-state'), 'surplus')
  const line = page.getByTestId('burn-line')
  assert.equal(await line.getAttribute('data-mode'), 'track')
  assert.equal(Number(await line.getAttribute('data-left')), OVER)
  assert.equal((await line.innerText()).replace(/\s+/g, ' ').trim(), `Burn ${fmt(OVER)} kcal to be on track`)
  assert.doesNotMatch(await line.innerText(), /safe minimum/)
  assert.notEqual(Number(await line.getAttribute('data-left')), TOPUP)
  assert.equal((await page.getByTestId('ideas-text').innerText()).trim(), 'Lighter ideas for later')
  await ctx.close()
})

await step('before eating up to the floor: burn line still uses remaining topUp (571), not the gauge leftover', async () => {
  const { ctx, page } = await open()
  const p = (await stored(page)).profile
  assert.equal(p.target, EAT)
  assert.equal(await page.getByTestId('ring').getAttribute('data-message'), `${fmt(EAT)} kcal left to eat.`)
  const line = page.getByTestId('burn-line')
  assert.equal(await line.getAttribute('data-mode'), 'floor')
  assert.equal(Number(await line.getAttribute('data-left')), TOPUP)
  assert.equal((await line.innerText()).replace(/\s+/g, ' ').trim(), `Burn ${fmt(TOPUP)} more to eat the safe minimum and stay on track`)
  assert.equal((await page.getByTestId('ideas-text').innerText()).trim(), 'What should I eat?')
  await ctx.close()
})

await browser.close()
console.log(results.join('\n'))
if (errors.length) { console.log(errors.join('\n')); process.exit(1) }
console.log(`\n${results.length} v1.22.4 checks passed, no console errors`)
