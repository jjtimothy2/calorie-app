// v1.21.3 (Reed's spec, Jordy's go): onboarding no longer dead-ends on a Lose date over the safe cap.
// 1. Unsafe target: "Use safer date" plus two quiet buttons, the keep button and "Change goal". No safer date: the
//    keep button is the main one. 2. Too little food: "Not safe on food alone." card with the exercise a day it needs.
// 3. Over 1% a week only: "This pace is fast." card, no exercise line, "Keep my date". 4. Keep finishes onboarding with
// the date saved. Too little food: the food target is held at the safe minimum (optional profile.exerciseTopUp, Jordy
// picked option a), the deficit stays, it survives a reload and a weigh-in, and Use safer date (or a goal change) clears
// it while Undo brings it back. Pace only: no flag. Profiles without the flag (Jordy's) keep their numbers.
// 5. The Home "over the safe limit" card with "Use safer date" still shows. Safe path unchanged. v1, v2, :ai and :foods byte-identical. WebKit (iPhone 14) at 390x844 and 375x667.
// Screenshots: screenshots/v1213-*.png. Usage: npm run build && npx vite preview --port 4174 & node tests/v1213.mjs
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
const TODAY = key(new Date())
const addDaysKey = (k, n) => { const [y, m, d] = k.split('-').map(Number); return key(new Date(y, m - 1, d + n)) }
const addMonthsKey = (k, n) => { const [y, m, d] = k.split('-').map(Number); const last = new Date(y, m - 1 + n + 1, 0).getDate(); return key(new Date(y, m - 1 + n, Math.min(d, last))) }
const between = (a, b) => { const [y1, m1, d1] = a.split('-').map(Number), [y2, m2, d2] = b.split('-').map(Number); return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 864e5) }
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const longDay = (k) => { const [y, m, d] = k.split('-').map(Number); return `${d} ${MON[m - 1]} ${y}` }
const fmt = (n) => n.toLocaleString('en-US')
const num = async (loc) => Number((await loc.innerText()).replace(/[^0-9]/g, ''))

// Independent maths (not the app's code).
const bmrOf = (sex, kg, cm, age) => Math.round(10 * kg + 6.25 * cm - 5 * age + (sex === 'male' ? 5 : -161))
const deficitOf = (base, gap) => (gap > 0 ? base - Math.round(base - gap) : 0)
const plan = (base, kg, days) => { const d = deficitOf(base, (kg * 7700) / Math.max(7, days)); return { deficit: d, eat: base - d } }

const AI = JSON.stringify({ provider: 'gemini', key: 'test-key-not-real' })
const FOODS = JSON.stringify({ version: 1, foods: [] })
const IDEAS = JSON.stringify({ date: TODAY, count: 2 })
const V2 = JSON.stringify({ version: 2, profile: null, entries: [], exercises: [], closedDays: {}, favourites: [] })
const V1 = JSON.stringify({ version: 1, profile: null, entries: [] })
const PROFILE_KEYS = ['activity', 'age', 'bmr', 'bmrCustom', 'dailyGoal', 'goal', 'goalDate', 'goalWeightKg', 'heightCm', 'includeMovement', 'macros', 'planFrom', 'sex', 'target', 'weightKg']
const STATE_KEYS = ['closedDays', 'entries', 'exercises', 'favourites', 'profile', 'version', 'weights']

const browser = await webkit.launch()
const open = async (w, h, v3 = null) => {
  const ctx = await browser.newContext({ ...devices['iPhone 14'], viewport: { width: w, height: h }, deviceScaleFactor: 2, serviceWorkers: 'block', reducedMotion: 'reduce' })
  await ctx.addInitScript(([v2, v1, ai, foods, ideas, v3]) => {
    if (localStorage.getItem('calorie-app:seeded')) return
    localStorage.setItem('calorie-app:seeded', '1')
    if (v3) localStorage.setItem('calorie-app:v3', v3)
    localStorage.setItem('calorie-app:v2', v2); localStorage.setItem('calorie-app:v1', v1); localStorage.setItem('calorie-app:ai', ai); localStorage.setItem('calorie-app:foods', foods); localStorage.setItem('calorie-app:ideas', ideas)
    localStorage.setItem('calorie-app:backup', JSON.stringify({ lastExportAt: Date.now(), dismissedAt: null }))
  }, [V2, V1, AI, FOODS, IDEAS, v3])
  const page = await ctx.newPage()
  page.on('console', (m) => { if ((m.type() === 'error' || m.type() === 'warning') && !/service worker/i.test(m.text())) errors.push(`${w}x${h}: ${m.type()}: ${m.text()}`) })
  page.on('pageerror', (er) => errors.push(`${w}x${h}: pageerror: ${er.message}`))
  return { ctx, page }
}
const stored = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('calorie-app:v3')))
const raw = (page, k) => page.evaluate((k) => localStorage.getItem(k), k)
const untouched = async (page, extra = [], stateExtra = []) => {
  assert.equal(await raw(page, 'calorie-app:v2'), V2, 'v2 byte-identical')
  assert.equal(await raw(page, 'calorie-app:v1'), V1, 'v1 byte-identical')
  assert.equal(await raw(page, 'calorie-app:ai'), AI, ':ai byte-identical')
  assert.equal(await raw(page, 'calorie-app:foods'), FOODS, ':foods byte-identical')
  assert.equal(await raw(page, 'calorie-app:ideas'), IDEAS, ':ideas byte-identical')
  const s = await stored(page)
  assert.equal(s.version, 3)
  assert.deepEqual(Object.keys(s).sort(), [...STATE_KEYS, ...stateExtra].sort(), 'v3 state shape')
  assert.deepEqual(Object.keys(s.profile).sort(), [...PROFILE_KEYS, ...extra].sort(), 'v3 profile shape')
}
const flat = async (page, what) => {
  const r = await page.evaluate(() => [document.documentElement.scrollWidth, innerWidth])
  assert.ok(r[0] <= r[1], `${what}: ${r[0]}px wide at ${r[1]}`)
}
const inView = async (page, loc, what) => {
  const b = await loc.boundingBox(), vh = page.viewportSize().height, vw = page.viewportSize().width
  assert.ok(b && b.y >= 0 && b.y + b.height <= vh + 0.5 && b.x >= 0 && b.x + b.width <= vw + 0.5, `${what} in view: ${JSON.stringify(b)} at ${vw}x${vh}`)
}
const tall = async (loc, what) => { const b = await loc.boundingBox(); assert.ok(b.height >= 44 - 0.5, `${what}: ${b.height}px tall`) }
const cleanCopy = (t, what) => { assert.doesNotMatch(t, /—/, `${what}: em dash`); assert.doesNotMatch(t, /;/, `${what}: semicolon`) }
const shot = async (page, name, tag) => { await page.waitForTimeout(250); await page.screenshot({ path: `${OUT}v1213-${name}-${tag}.png` }) }
const isPrimary = async (loc) => /bg-ink|bg-g\b|bg-g-ink/.test(await loc.getAttribute('class'))

const onboard = async (page, { sex, age, cm, kg, gw, by, act }) => {
  await page.goto(BASE + '/')
  await page.getByTestId('ob-start').click()
  await page.getByTestId(`ob-sex-${sex}`).click()
  await page.fill('input[name=age]', String(age)); await page.getByTestId('ob-next').click()
  await page.fill('input[name=heightCm]', String(cm)); await page.fill('input[name=weightKg]', String(kg)); await page.getByTestId('ob-next').click()
  await page.getByTestId('ob-goal-lose').click()
  await page.fill('input[name=goalWeightKg]', String(gw)); await page.getByTestId('ob-next').click()
  await page.getByTestId('by-when').waitFor()
  if (/^\d{4}-/.test(by)) { await page.getByTestId('by-custom').click(); await page.getByTestId('by-date').fill(by) } else await page.getByTestId(`by-${by}`).click()
  await page.getByTestId('ob-next').click()
  await page.getByTestId('ob-watch-no').click(); await page.getByTestId(`ob-act-${act}`).click()
  await page.getByTestId('ob-target').waitFor()
}
const byDate = (by) => (/^\d{4}-/.test(by) ? by : addMonthsKey(TODAY, { '1m': 1, '3m': 3, '6m': 6, '1y': 12 }[by]))

// Sari: female 30, 164 cm, 78 -> 72 kg, sedentary, 1 month. Under the 1,200 floor, a safer date exists.
const SARI = { sex: 'female', age: 30, cm: 164, kg: 78, gw: 72, act: 'sedentary', by: '1m' }
const S_BMR = bmrOf('female', 78, 164, 30), S_BASE = S_BMR + Math.round(S_BMR * 0.2)
// Bima: male 30, 190 cm, 120 -> 100 kg, very active, 100 days. Eats well over 1,500 but loses over 1% a week.
const BIMA_DATE = addDaysKey(TODAY, 100)
const BIMA = { sex: 'male', age: 30, cm: 190, kg: 120, gw: 100, act: 'active', by: BIMA_DATE }
// Oma: female 80, 150 cm, 40 -> 36 kg, sedentary, 140 days. Burn under the floor: no safer date.
const OMA = { sex: 'female', age: 80, cm: 150, kg: 40, gw: 36, act: 'sedentary', by: addDaysKey(TODAY, 140) }
// Dimas (safe path): male 38, 176 cm, 88 -> 78 kg, sedentary, 6 months.
const DIMAS = { sex: 'male', age: 38, cm: 176, kg: 88, gw: 78, act: 'sedentary', by: '6m' }

for (const [w, h] of [[390, 844], [375, 667]]) {
  const tag = `${w}x${h}`

  await step(`${tag} 1+2 too little food: Not safe on food alone card with the exercise a day, Use safer date, then the two quiet buttons`, async () => {
    const { ctx, page } = await open(w, h)
    await onboard(page, SARI)
    const date = byDate('1m'), ask = plan(S_BASE, 6, between(TODAY, date))
    assert.ok(ask.eat > 0 && ask.eat < 1200, String(ask.eat))
    assert.equal(await page.getByTestId('ob-target').getAttribute('data-state'), 'unsafe')
    const card = page.getByTestId('unsafe-card')
    assert.equal(await card.getAttribute('data-reason'), 'low')
    assert.equal(await card.innerText(), `Not safe on food alone. You'd eat about ${fmt(ask.eat)} kcal a day, under the safe minimum of 1,200. To reach 72 kg by ${longDay(date)}, keep eating at least 1,200 and burn about ${fmt(1200 - ask.eat)} kcal a day in exercise. Log it with Quick add burn.`)
    assert.equal(await card.locator('b').innerText(), 'Not safe on food alone.')
    const acts = page.getByTestId('ob-target-actions').locator('button')
    assert.deepEqual(await acts.allInnerTexts(), [await page.getByTestId('ob-safer').innerText(), "Keep my date, I'll add exercise", 'Change goal'])
    assert.match(await page.getByTestId('ob-safer').innerText(), /^Use safer date \(\d+ \w+ \d{4}\)$/)
    assert.ok(await isPrimary(page.getByTestId('ob-safer')), 'safer is the main button')
    assert.ok(!(await isPrimary(page.getByTestId('ob-keep'))), 'keep is quiet')
    for (const id of ['ob-safer', 'ob-keep', 'ob-change-goal']) { await tall(page.getByTestId(id), id); await inView(page, page.getByTestId(id), id) }
    assert.equal(await page.getByTestId('ob-next').count(), 0)
    cleanCopy(await page.locator('main').innerText(), 'low screen')
    await flat(page, 'low')
    await shot(page, 'low', tag)
    await ctx.close()
  })

  await step(`${tag} 3 pace only: This pace is fast card, no exercise line, Keep my date`, async () => {
    const { ctx, page } = await open(w, h)
    await onboard(page, BIMA)
    assert.equal(await page.getByTestId('ob-target').getAttribute('data-state'), 'unsafe')
    const card = page.getByTestId('unsafe-card')
    assert.equal(await card.getAttribute('data-reason'), 'fast')
    const eat = await num(page.getByTestId('eat-line'))
    assert.ok(eat >= 1500, String(eat))
    const t = await card.innerText()
    assert.match(t, new RegExp(`^This pace is fast\\. About \\d\\.\\d kg a week is more than 1% of your weight\\. You'd still eat about ${fmt(eat)} kcal a day\\.$`))
    assert.equal(await page.getByTestId('unsafe-exercise').count(), 0)
    assert.doesNotMatch(t, /exercise/i)
    assert.equal(await page.getByTestId('ob-keep').innerText(), 'Keep my date')
    await page.getByTestId('ob-safer').waitFor()
    for (const id of ['ob-safer', 'ob-keep', 'ob-change-goal']) { await tall(page.getByTestId(id), id); await inView(page, page.getByTestId(id), id) }
    cleanCopy(await page.locator('main').innerText(), 'fast screen')
    await flat(page, 'fast')
    await shot(page, 'fast', tag)
    await ctx.close()
  })

  await step(`${tag} 1 no safer date: the keep button is the main button, Change goal stays quiet`, async () => {
    const { ctx, page } = await open(w, h)
    await onboard(page, OMA)
    assert.equal(await page.getByTestId('ob-safer').count(), 0)
    assert.equal(await page.getByTestId('unsafe-card').getAttribute('data-reason'), 'low')
    assert.match(await page.getByTestId('unsafe-card').innerText(), /^Not safe on food alone\. You'd eat about 712 kcal a day, under the safe minimum of 1,200\. To reach 36 kg by .+, keep eating at least 1,200 and burn about 488 kcal a day in exercise\. Log it with Quick add burn\.$/)
    assert.deepEqual(await page.getByTestId('ob-target-actions').locator('button').allInnerTexts(), ["Keep my date, I'll add exercise", 'Change goal'])
    assert.ok(await isPrimary(page.getByTestId('ob-keep')), 'keep is the main button')
    await inView(page, page.getByTestId('ob-change-goal'), 'Change goal')
    await shot(page, 'no-safer', tag)
    await ctx.close()
  })
}

await step('4+5 keep (keyboard): onboarding finishes with the entered date, the food target held at 1,200 (exerciseTopUp), Home shows 1,200 left to eat and the safe limit card', async () => {
  const { ctx, page } = await open(390, 844)
  await onboard(page, SARI)
  const date = byDate('1m'), ask = plan(S_BASE, 6, between(TODAY, date))
  await page.getByTestId('ob-keep').focus()
  await page.keyboard.press('Enter')
  await page.getByTestId('ob-done').waitFor()
  await page.getByTestId('ob-done').click()
  await page.waitForURL(BASE + '/'); await page.getByTestId('balance').waitFor()
  const p = (await stored(page)).profile
  assert.deepEqual([p.goal, p.goalWeightKg, p.goalDate, p.weightKg, p.planFrom], ['lose', 72, date, 78, { date: TODAY, kg: 78 }])
  assert.equal(p.exerciseTopUp, true, 'flag set on the low-intake keep')
  assert.equal(p.target, 1200, 'food target held at the safe minimum')
  assert.equal(p.dailyGoal, S_BASE - 1200, 'Home measures against the held target (base - 1,200)')
  assert.ok(p.dailyGoal < ask.deficit)
  await untouched(page, ['exerciseTopUp'])
  const cap = page.getByTestId('cap-card')
  await cap.waitFor()
  assert.match(await cap.innerText(), /^You kept your date\./) // v1.21.4: the kept-date copy
  assert.match(await page.getByTestId('cap-use').innerText(), /^Use safer date \(\d+ \w+ \d{4}\)$/)
  assert.equal(await page.getByTestId('ring').getAttribute('data-message'), '1,200 kcal left to eat.', 'Home: never under the minimum to eat')
  await shot(page, 'home-cap', '390x844')
  // A reload keeps the kept plan and the hold.
  await page.reload(); await page.getByTestId('balance').waitFor()
  const r = (await stored(page)).profile
  assert.deepEqual([r.goalDate, r.target, r.dailyGoal, r.exerciseTopUp], [date, 1200, S_BASE - 1200, true])
  // Me shows the sum with the exercise part.
  await page.goto(BASE + '/settings'); await page.getByTestId('weight-card').waitFor()
  assert.equal(await num(page.getByTestId('settings-target')), 1200)
  assert.match(await page.getByTestId('target-sum').innerText(), new RegExp(`− ${fmt(ask.deficit)} deficit \\+ ${fmt(1200 - ask.eat)} exercise$`))
  // A weigh-in re-plans (date kept): still held at 1,200, flag still there.
  await page.getByTestId('log-weight').click()
  await page.getByTestId('weigh-kg').fill('77.5')
  await page.getByTestId('weigh-save').click()
  await page.getByTestId('weigh-result').waitFor()
  const wi = (await stored(page)).profile
  assert.deepEqual([wi.planFrom.kg, wi.goalDate, wi.target, wi.exerciseTopUp], [77.5, date, 1200, true])
  assert.equal(wi.target + wi.dailyGoal, bmrOf('female', 77.5, 164, 30) + Math.round(bmrOf('female', 77.5, 164, 30) * 0.2), 'base - 1,200 at the new weight')
  await page.getByTestId('weigh-done').click()
  await page.reload(); await page.getByTestId('weight-card').waitFor()
  assert.deepEqual([(await stored(page)).profile.target, (await stored(page)).profile.exerciseTopUp], [1200, true])
  await untouched(page, ['exerciseTopUp'])
  await ctx.close()
})

await step('4 Use safer date clears the hold (back to the plain v3 profile), Undo brings it back', async () => {
  const { ctx, page } = await open(390, 844)
  await onboard(page, SARI)
  const date = byDate('1m')
  await page.getByTestId('ob-keep').click()
  await page.getByTestId('ob-done').click()
  await page.waitForURL(BASE + '/'); await page.getByTestId('cap-use').waitFor()
  assert.equal((await stored(page)).profile.exerciseTopUp, true)
  await page.getByTestId('cap-use').click()
  await page.getByTestId('cap-applied').waitFor()
  const p = (await stored(page)).profile
  assert.ok(!('exerciseTopUp' in p), 'flag cleared')
  assert.notEqual(p.goalDate, date)
  assert.ok(p.target >= 1200, `safer target ${p.target}`)
  assert.equal(p.target + p.dailyGoal, S_BASE, 'plain plan: target = base - deficit')
  await untouched(page, [], ['capCardDismissed']) // v1.15: Use safer date also hides the card (optional v3 field)
  await page.reload(); await page.getByTestId('balance').waitFor()
  assert.ok(!('exerciseTopUp' in (await stored(page)).profile), 'still cleared after a reload')
  await ctx.close()
  // Undo puts the kept plan back exactly, hold included.
  const b = await open(390, 844)
  await onboard(b.page, SARI)
  await b.page.getByTestId('ob-keep').click(); await b.page.getByTestId('ob-done').click()
  await b.page.waitForURL(BASE + '/'); await b.page.getByTestId('cap-use').click()
  await b.page.getByTestId('cap-undo').click()
  const u = (await stored(b.page)).profile
  assert.deepEqual([u.goalDate, u.target, u.exerciseTopUp], [date, 1200, true])
  await b.ctx.close()
})

await step('3+4 pace-only keep: no flag, the plan keeps its numbers', async () => {
  const { ctx, page } = await open(390, 844)
  await onboard(page, BIMA)
  const eat = await num(page.getByTestId('eat-line')), deficit = await num(page.getByTestId('deficit'))
  await page.getByTestId('ob-keep').click()
  await page.getByTestId('ob-done').click()
  await page.waitForURL(BASE + '/'); await page.getByTestId('balance').waitFor()
  const p = (await stored(page)).profile
  assert.deepEqual([p.goalDate, p.target, p.dailyGoal], [BIMA_DATE, eat, deficit])
  await untouched(page)
  await ctx.close()
})

await step('no flag, no change: a saved unsafe Lose plan (like Jordy\'s) loads and reloads with its own numbers', async () => {
  const date = byDate('1m'), ask = plan(S_BASE, 6, between(TODAY, date))
  const profile = { sex: 'female', age: 30, heightCm: 164, weightKg: 78, activity: 'sedentary', goal: 'lose', bmr: S_BMR, bmrCustom: false, includeMovement: true, goalWeightKg: 72, goalDate: date, planFrom: { date: TODAY, kg: 78 }, macros: { protein: null, carbs: null, fat: null }, target: ask.eat, dailyGoal: ask.deficit }
  const state = { version: 3, profile, entries: [], exercises: [], closedDays: {}, favourites: [], weights: [{ date: TODAY, kg: 78 }] }
  const { ctx, page } = await open(390, 844, JSON.stringify(state))
  await page.goto(BASE + '/'); await page.getByTestId('balance').waitFor()
  assert.deepEqual((await stored(page)).profile, profile, 'profile unchanged on load')
  await page.reload(); await page.getByTestId('balance').waitFor()
  assert.deepEqual((await stored(page)).profile, profile, 'profile unchanged on reload')
  assert.ok(ask.eat < 1200, 'still under the minimum: no hold without the flag')
  await page.goto(BASE + '/settings'); await page.getByTestId('weight-card').waitFor()
  assert.equal(await num(page.getByTestId('settings-target')), ask.eat)
  assert.doesNotMatch(await page.getByTestId('target-sum').innerText(), /exercise/)
  await untouched(page)
  await ctx.close()
})

await step('safe path unchanged: Continue, no keep button, saved plan as before', async () => {
  const { ctx, page } = await open(390, 844)
  await onboard(page, DIMAS)
  const bmr = bmrOf('male', 88, 176, 38), base = bmr + Math.round(bmr * 0.2), ok = plan(base, 10, between(TODAY, byDate('6m')))
  assert.equal(await page.getByTestId('ob-target').getAttribute('data-state'), 'safe')
  assert.equal(await page.getByTestId('ob-keep').count() + await page.getByTestId('unsafe-card').count() + await page.getByTestId('ob-change-goal').count(), 0)
  assert.equal(await page.getByTestId('ob-next').innerText(), 'Continue')
  assert.equal(await num(page.getByTestId('deficit')), ok.deficit)
  await page.getByTestId('ob-next').click(); await page.getByTestId('ob-skip').click()
  await page.waitForURL(BASE + '/'); await page.getByTestId('balance').waitFor()
  const p = (await stored(page)).profile
  assert.deepEqual([p.goalDate, p.dailyGoal, p.target], [byDate('6m'), ok.deficit, ok.eat])
  assert.equal(await page.getByTestId('cap-card').count(), 0)
  await untouched(page)
  await ctx.close()
})

await browser.close()
console.log(results.join('\n'))
if (errors.length) { console.log(errors.join('\n')); process.exit(1) }
console.log(`\n${results.length} v1.21.3 checks passed, no console errors`)
