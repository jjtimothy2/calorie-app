// v1.22.3: when a Lose date is kept (exerciseTopUp), the Today gauge uses the plan deficit / plan eat
// as the goal, not the safe minimum (1,500 / 1,200). The kept-date card and the burn line stay as
// guidance for eating at the floor by adding exercise. Chromium at 390x844.
// Usage: npm run build && npx vite preview --port 4174 & node tests/v1223.mjs
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
const addMonths = (k, n) => { const [y, m, d] = k.split('-').map(Number); const last = new Date(y, m - 1 + n + 1, 0).getDate(); return key(new Date(y, m - 1 + n, Math.min(d, last))) }
const between = (a, b) => { const [y1, m1, d1] = a.split('-').map(Number), [y2, m2, d2] = b.split('-').map(Number); return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 864e5) }
const deficitOf = (base, gap) => (gap > 0 ? base - Math.round(base - gap) : 0)
const plan = (base, kg, days) => { const d = deficitOf(base, (kg * 7700) / Math.max(7, days)); return { deficit: d, eat: base - d } }
const fmt = (n) => n.toLocaleString('en-US')

const browser = await chromium.launch()
const open = async (profile) => {
  const v3 = JSON.stringify({ version: 3, profile, entries: [], exercises: [], closedDays: {}, favourites: [], weights: [{ date: TODAY, kg: profile.weightKg }] })
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

await step('Sari-like kept date: Home shows the plan eat/deficit, not 1,200 left / a 1,200-based goal', async () => {
  const date = addMonths(TODAY, 1)
  const bmr = Math.round(10 * 78 + 6.25 * 164 - 5 * 30 - 161)
  const base = bmr + Math.round(bmr * 0.2)
  const ask = plan(base, 6, between(TODAY, date))
  assert.ok(ask.eat > 0 && ask.eat < 1200, String(ask.eat))
  const { ctx, page } = await open({
    age: 30, sex: 'female', heightCm: 164, weightKg: 78, activity: 'sedentary', goal: 'lose',
    bmr, bmrCustom: false, includeMovement: true, goalWeightKg: 72, goalDate: date,
    planFrom: { date: TODAY, kg: 78 }, macros: { protein: null, carbs: null, fat: null },
    target: 0, dailyGoal: 0, exerciseTopUp: true,
  })
  const p = (await stored(page)).profile
  assert.equal(p.target, ask.eat)
  assert.equal(p.dailyGoal, ask.deficit)
  assert.equal(await page.getByTestId('ring').getAttribute('data-message'), `${fmt(ask.eat)} kcal left to eat.`)
  assert.notEqual(await page.getByTestId('ring').getAttribute('data-message'), '1,200 kcal left to eat.')
  const goalTxt = await page.getByTestId('gauge-goal').textContent()
  assert.match(goalTxt, new RegExp(fmt(ask.deficit)))
  assert.doesNotMatch(goalTxt, new RegExp(fmt(base - 1200)))
  await page.getByTestId('cap-kept').waitFor()
  assert.equal(await page.getByTestId('burn-line').innerText(), `Burn ${fmt(1200 - ask.eat)} more to eat the safe minimum and stay on track`)
  await ctx.close()
})

await step('Jordy-like kept date (deficit larger than rest-day burn): gauge goal is the full plan deficit, not 359 / 1,500 left', async () => {
  const date = addMonths(TODAY, 1)
  const bmr = 1859, base = 1859
  const ask = plan(base, 13, between(TODAY, date))
  assert.ok(ask.deficit > base, `${ask.deficit} vs ${base}`)
  const { ctx, page } = await open({
    age: 32, sex: 'male', heightCm: 175, weightKg: 92, activity: 'light', goal: 'lose',
    bmr, bmrCustom: false, includeMovement: false, goalWeightKg: 79, goalDate: date,
    planFrom: { date: TODAY, kg: 92 }, macros: { protein: null, carbs: null, fat: null },
    target: 0, dailyGoal: 0, exerciseTopUp: true,
  })
  const p = (await stored(page)).profile
  assert.equal(p.dailyGoal, ask.deficit)
  assert.ok(p.target < 0)
  const msg = await page.getByTestId('ring').getAttribute('data-message')
  assert.notEqual(msg, '1,500 kcal left to eat.')
  const need = ask.deficit - base // kcal still to burn on a rest day to be on track
  assert.equal(msg, `Burn ${fmt(need)} kcal to be on track.`)
  assert.equal(await page.getByTestId('balance-label').textContent(), 'kcal to be on track')
  assert.equal(await page.getByTestId('ring').getAttribute('data-state'), 'past')
  assert.equal(await page.getByTestId('ring').getAttribute('data-zone'), 'light')
  const lo = Number(await page.getByTestId('ring').getAttribute('data-lo'))
  assert.ok(lo <= -ask.deficit, `scale includes the goal: lo ${lo} vs ${-ask.deficit}`)
  const goalTxt = await page.getByTestId('gauge-goal').textContent()
  assert.equal(goalTxt, `Goal −${fmt(ask.deficit)}`)
  const goalBox = await page.getByTestId('gauge-goal').boundingBox()
  const ringBox = await page.getByTestId('ring').boundingBox()
  assert.ok(goalBox && ringBox, 'goal label and gauge are visible')
  assert.ok(goalBox.x >= ringBox.x - 0.5, `goal label clipped on the left: x=${goalBox.x} ring=${ringBox.x}`)
  assert.ok(goalBox.x + goalBox.width <= ringBox.x + ringBox.width + 0.5, `goal label clipped on the right`)
  assert.doesNotMatch(goalTxt, /359/)
  assert.equal((await page.getByTestId('ideas-text').innerText()).trim(), 'What should I eat?')
  assert.match(await page.getByTestId('burn-line').innerText(), /eat the safe minimum and stay on track/)
  const left = Number(await page.getByTestId('burn-line').getAttribute('data-left'))
  assert.equal(left, 1500 - ask.eat) // eat is negative
  await page.getByTestId('cap-kept').waitFor()
  await page.goto(BASE + '/settings'); await page.getByTestId('settings-target').waitFor()
  assert.equal((await page.getByTestId('settings-target').innerText()).trim(), '0 kcal')
  assert.equal(await page.getByTestId('target-burn-first').innerText(), `Burn about ${fmt(-p.target)} kcal before eating to hit your date.`)
  await ctx.close()
})

await browser.close()
console.log(results.join('\n'))
if (errors.length) { console.log(errors.join('\n')); process.exit(1) }
console.log(`\n${results.length} v1.22.3 checks passed, no console errors`)
