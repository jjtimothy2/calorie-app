// v1.22.2: the Me goal sheet uses the same unsafe-date card as onboarding ("Not safe on food alone" / "This pace is
// fast") and offers Keep my date, which saves the goal (exerciseTopUp when the eat target is under the floor).
// Use safer date and a disabled Save goal still work as in v1.15. Chromium at 390x844.
// Usage: npm run build && npx vite preview --port 4174 & node tests/v1222.mjs
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
const addMonths = (k, n) => { const [y, m, d] = k.split('-').map(Number); const last = new Date(y, m - 1 + n + 1, 0).getDate(); return key(new Date(y, m - 1 + n, Math.min(d, last))) }

const profile = {
  age: 32, sex: 'male', heightCm: 175, weightKg: 92, activity: 'light', goal: 'lose',
  bmr: 1859, bmrCustom: false, includeMovement: false, goalWeightKg: 79,
  macros: { protein: null, carbs: null, fat: null }, target: 1309, dailyGoal: 550,
  goalDate: addDays(TODAY, 182), planFrom: { date: TODAY, kg: 92 },
}
const v3Of = (p, extra = {}) => JSON.stringify({ version: 3, profile: p, entries: [], exercises: [], closedDays: {}, favourites: [], weights: [{ date: TODAY, kg: 92 }], ...extra })

const browser = await chromium.launch()
const open = async (v3) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, serviceWorkers: 'block', reducedMotion: 'reduce' })
  await ctx.addInitScript((v3) => {
    localStorage.setItem('calorie-app:v3', v3)
    localStorage.setItem('calorie-app:backup', JSON.stringify({ lastExportAt: Date.now(), dismissedAt: null }))
  }, v3)
  const page = await ctx.newPage()
  page.on('console', (m) => { if ((m.type() === 'error' || m.type() === 'warning') && !/service worker/i.test(m.text())) errors.push(`${m.type()}: ${m.text()}`) })
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
  await page.goto(BASE + '/settings')
  await page.getByTestId('edit-goal').click()
  await page.getByTestId('goal-sheet').waitFor()
  return { ctx, page }
}
const stored = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('calorie-app:v3')))

await step('Me unsafe Lose date: onboarding wording, Save stays disabled, Keep my date saves the goal with exerciseTopUp', async () => {
  const { ctx, page } = await open(v3Of(profile))
  await page.getByTestId('by-1m').click()
  const card = page.getByTestId('goal-preview').getByTestId('unsafe-card')
  await card.waitFor()
  const text = await card.innerText()
  assert.match(text, /^Not safe on food alone\./)
  assert.match(text, /The safe minimum is 1,500 kcal a day/)
  assert.match(text, /keep eating at least 1,500 and burn about .+ kcal a day in exercise\. Log it with Quick add burn\./)
  assert.equal(await card.getAttribute('data-reason'), 'low')
  assert.equal(await page.getByTestId('goal-save').isDisabled(), true)
  assert.ok(await page.getByTestId('goal-safer').count() === 1)
  assert.equal(await page.getByTestId('goal-keep-date').innerText(), "Keep my date, I'll add exercise")
  const wantDate = addMonths(TODAY, 1)
  await page.getByTestId('goal-keep-date').click()
  await page.getByTestId('goal-sheet').waitFor({ state: 'detached' })
  const s = await stored(page)
  assert.equal(s.profile.goalWeightKg, 79)
  assert.equal(s.profile.goalDate, wantDate)
  assert.equal(s.profile.exerciseTopUp, true)
  await ctx.close()
})

await step('Me: Use safer date still clears the warning and lets Save goal through', async () => {
  const { ctx, page } = await open(v3Of(profile))
  await page.getByTestId('by-1m').click()
  await page.getByTestId('goal-preview').getByTestId('unsafe-card').waitFor()
  await page.getByTestId('goal-safer').click()
  assert.equal(await page.getByTestId('unsafe-card').count(), 0)
  assert.equal(await page.getByTestId('goal-keep-date').count(), 0)
  assert.equal(await page.getByTestId('goal-save').isDisabled(), false)
  await page.getByTestId('goal-save').click()
  await page.getByTestId('goal-sheet').waitFor({ state: 'detached' })
  const s = await stored(page)
  assert.ok(s.profile.goalDate > addMonths(TODAY, 1), s.profile.goalDate)
  assert.notEqual(s.profile.exerciseTopUp, true)
  await ctx.close()
})

await browser.close()
console.log(results.join('\n'))
if (errors.length) { console.log(errors.join('\n')); process.exit(1) }
console.log(`\n${results.length} v1.22.2 checks passed, no console errors`)
