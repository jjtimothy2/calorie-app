// v1.13.1: no floor for upgraded users. v1.13 kept the v1.12 floored target on upgrade by picking a goal weight and
// date to match it; v1.13.1 re-derives that goal once from the old pace and kg left (the v2 data is still kept as a
// backup) and the target comes from the goal-date plan with no floor. A goal the user edited is left alone. Closed
// past days keep their baselines, past-day editing still works, today uses the new target, v2 / :ai / :foods untouched.
// WebKit with touch at 390x844 (motion on) and 375x667 (reduced motion). Screenshots: screenshots/v1131-*.png.
// Usage: npm run build && npx vite preview --port 4174 & node tests/v1131-nofloor.mjs
import { webkit, devices } from 'playwright'
import assert from 'node:assert/strict'

const BASE = (process.env.BASE_URL ?? 'http://localhost:4174/calorie-app').replace(/\/$/, '')
const OUT = new URL('../screenshots/', import.meta.url).pathname
const results = [], errors = []
const step = async (name, fn) => {
  const t = Date.now()
  try { await fn(); results.push(`PASS ${name} (${Date.now() - t} ms)`) } catch (e) { results.push(`FAIL ${name}: ${e.message}`); console.log(results.join('\n')); console.log(errors.join('\n')); throw e }
}
const pad = (n) => String(n).padStart(2, '0')
const key = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const ago = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return key(d) }
const TODAY = ago(0), YDAY = ago(1), U = ago(3) // U: the day v1.13 upgraded the data
const plus = (day, n) => { const [y, m, d] = day.split('-').map(Number); return key(new Date(y, m - 1, d + n)) }
const e = (id, date, meal, name, kcal, protein = 0) => ({ id, date, meal, foodId: null, name, servingLabel: 'Quick add', servingMult: 1, qty: 1, kcal, protein, carbs: 0, fat: 0, createdAt: Date.now() - 86400_000 })
const macros = { protein: null, carbs: null, fat: null }
// Jordy-like: male 92 kg, Mifflin BMR 1859, Movement off (watch), Standard pace. v1.12: 1859 - 550 = 1309, held at 1,500.
const old = { age: 32, sex: 'male', heightCm: 175, weightKg: 92, activity: 'light', goal: 'lose', pace: 'standard', bmr: 1859, bmrCustom: false, includeMovement: false, goalWeightKg: 92, macros, target: 1500, dailyGoal: 359 }
const entries = [e('t1', TODAY, 'breakfast', 'Nasi uduk', 420), e('y1', YDAY, 'lunch', 'Nasi padang', 900, 25)]
// Yesterday closed on v1.13's floor-kept baseline (goal 359).
const YSUM = { bmr: 1859, movement: 0, burned: 0, eaten: 900, balance: 959, goal: 359, protein: 25, closedAt: Date.now() - 3600_000, auto: true }
const V2 = JSON.stringify({ version: 2, profile: old, entries: entries.filter((x) => x.date !== TODAY), exercises: [], closedDays: {}, favourites: [] })
const { pace: _p, ...rest } = old
// What v1.13 wrote: a goal picked to keep 1,500 (8.4 kg over 180 days = 359 a day), goalAssumed, no goalAssumedV.
const V113 = { version: 3, profile: { ...rest, goalWeightKg: 83.6, goalDate: plus(U, 180), planFrom: { date: U, kg: 92 }, goalAssumed: true }, entries, exercises: [], closedDays: { [YDAY]: YSUM }, favourites: [], weights: [{ date: U, kg: 92 }] }
const AI = JSON.stringify({ provider: 'gemini', key: 'test-key-not-real' })
const FOODS = JSON.stringify({ version: 1, foods: [] })
const NOTE = 'We set this from your old pace. Tap Edit to pick your own goal weight and date.'

const browser = await webkit.launch()
const open = async (w, h, motion, v3) => {
  const ctx = await browser.newContext({ ...devices['iPhone 14'], viewport: { width: w, height: h }, deviceScaleFactor: 3, serviceWorkers: 'block', reducedMotion: motion })
  await ctx.addInitScript(([v3, v2, ai, foods]) => {
    if (!localStorage.getItem('calorie-app:v2')) {
      localStorage.setItem('calorie-app:v3', v3); localStorage.setItem('calorie-app:v2', v2); localStorage.setItem('calorie-app:ai', ai); localStorage.setItem('calorie-app:foods', foods)
      localStorage.setItem('calorie-app:backup', JSON.stringify({ lastExportAt: Date.now(), dismissedAt: null }))
    }
  }, [JSON.stringify(v3), V2, AI, FOODS])
  const page = await ctx.newPage()
  page.on('console', (m) => { if ((m.type() === 'error' || m.type() === 'warning') && !/service worker/i.test(m.text())) errors.push(`${w}x${h}: ${m.type()}: ${m.text()}`) })
  page.on('pageerror', (er) => errors.push(`${w}x${h}: pageerror: ${er.message}`))
  return { ctx, page }
}
const flat = async (page, what) => {
  await page.waitForTimeout(500)
  const r = await page.evaluate(() => [document.documentElement.scrollWidth, innerWidth, [...document.querySelectorAll('body *')].filter((el) => { const b = el.getBoundingClientRect(); return b.width > 0 && b.right > innerWidth + 0.5 }).map((el) => el.dataset.testid || el.tagName).slice(0, 4)])
  assert.ok(r[0] <= r[1], `${what}: ${r[0]}px wide at ${r[1]}`)
  assert.deepEqual(r[2], [], `${what}: elements past the right edge`)
}

for (const [w, h, motion] of [[390, 844, 'no-preference'], [375, 667, 'reduce']]) {
  const tag = `${w}x${h}`
  const { ctx, page } = await open(w, h, motion, V113)
  const st = () => page.evaluate(() => JSON.parse(localStorage.getItem('calorie-app:v3')))
  const dialog = page.getByRole('dialog')
  await step(`${tag} a v1.13 floor-kept profile is re-derived once: goal 79 kg in 182 days from the upgrade, 1,309 kcal (was 1,500), goal 550 today`, async () => {
    await page.goto(`${BASE}/`)
    await page.getByTestId('balance').waitFor()
    await page.waitForFunction(() => /goal 550/.test(document.querySelector('[data-testid=ring-goal]')?.textContent ?? ''), null, { timeout: 5000 })
    const s = await st()
    assert.deepEqual([s.profile.goalWeightKg, s.profile.goalDate, s.profile.target, s.profile.dailyGoal, s.profile.goalAssumed, s.profile.goalAssumedV], [79, plus(U, 182), 1309, 550, true, 2])
    assert.deepEqual(s.profile.planFrom, { date: U, kg: 92 })
    assert.deepEqual(s.closedDays[YDAY], YSUM, 'yesterday keeps the baseline it closed with (goal 359)')
    assert.deepEqual([s.entries, s.weights], [V113.entries, V113.weights])
    assert.equal(await page.evaluate(() => localStorage.getItem('calorie-app:v2')), V2, 'v2 backup byte-identical')
    assert.equal(await page.evaluate(() => localStorage.getItem('calorie-app:ai')), AI)
    assert.equal(await page.evaluate(() => localStorage.getItem('calorie-app:foods')), FOODS)
  })
  await step(`${tag} Me: Weight card note reworded (no "same daily target"), Goal 79 kg, 1,309 kcal with the soft under-1,500 warning (push date offer), no clamp`, async () => {
    await page.goto(`${BASE}/settings`)
    const card = page.getByTestId('weight-card')
    await card.waitFor()
    assert.equal(await page.getByTestId('goal-assumed').innerText(), NOTE)
    assert.doesNotMatch(await card.innerText(), /same daily target/)
    assert.match(await page.getByTestId('goal-summary').innerText(), /^Goal 79 kg by /)
    assert.equal(await page.getByTestId('settings-target').innerText(), '1,309 kcal')
    assert.match(await page.getByTestId('push-prompt').innerText(), /Push goal date to/)
    await flat(page, `${tag} Me`)
    await card.evaluate((el) => el.scrollIntoView({ block: 'start' }))
    await page.waitForTimeout(motion === 'reduce' ? 300 : 900)
    await page.screenshot({ path: `${OUT}v1131-me-weight-note-${tag}.png` })
  })
  await step(`${tag} once only: a reload (even with the old data changed) leaves the re-derived goal as it is`, async () => {
    const before = (await st()).profile
    await page.evaluate(() => { const v = JSON.parse(localStorage.getItem('calorie-app:v2')); v.profile.pace = 'faster'; localStorage.setItem('calorie-app:v2', JSON.stringify(v)) })
    await page.reload()
    await page.getByTestId('weight-card').waitFor()
    assert.deepEqual((await st()).profile, before)
    await page.evaluate((v2) => localStorage.setItem('calorie-app:v2', v2), V2)
  })
  await step(`${tag} past-day editing still works: add 250 kcal to yesterday, its closed summary recalculates on the old baseline (goal 359)`, async () => {
    await page.goto(`${BASE}/`)
    await page.getByTestId('balance').waitFor()
    await page.getByTestId('day-prev').click()
    await page.waitForFunction(() => document.querySelector('#day-title')?.textContent === 'Yesterday')
    assert.match(await page.getByTestId('past-day-note').innerText(), /Editing Yesterday/)
    await page.getByRole('link', { name: 'Add to Snacks' }).click()
    await page.getByTestId('qa-bar').waitFor()
    assert.match(await page.getByTestId('past-day-note').innerText(), /Adding to Yesterday/)
    await page.getByTestId('qa-btn').click()
    await dialog.locator('input[name=kcal]').fill('250')
    await dialog.locator('input[name=name]').fill('Pisang goreng')
    await dialog.getByRole('button', { name: 'Add 250 kcal' }).click()
    await page.getByTestId('toast').waitFor()
    const s = await st()
    assert.equal(s.entries.find((x) => x.name === 'Pisang goreng').date, YDAY)
    assert.deepEqual(s.closedDays[YDAY], { ...YSUM, eaten: 1150, balance: 709 })
    assert.equal(s.closedDays[TODAY], undefined, 'today stays open on the new target')
    assert.equal(s.profile.target, 1309)
  })
  await ctx.close()
}

await step('a goal the user edited after the v1.13 upgrade (no goalAssumed) is not touched, even with the v2 data there', async () => {
  const { goalAssumed: _g, ...edited } = V113.profile
  const { ctx, page } = await open(390, 844, 'reduce', { ...V113, profile: edited })
  await page.goto(`${BASE}/settings`)
  await page.getByTestId('weight-card').waitFor()
  const s = await page.evaluate(() => JSON.parse(localStorage.getItem('calorie-app:v3')))
  assert.deepEqual([s.profile.goalWeightKg, s.profile.goalDate, s.profile.target, 'goalAssumed' in s.profile, 'goalAssumedV' in s.profile], [83.6, plus(U, 180), 1500, false, false])
  assert.equal(await page.getByTestId('goal-assumed').count(), 0)
  await ctx.close()
})

await browser.close()
console.log(results.join('\n'))
if (errors.length) { console.log(errors.join('\n')); process.exit(1) }
console.log(`\n${results.length} v1.13.1 checks passed`)
