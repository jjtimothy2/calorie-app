// v1.15: the Lose result shows the daily deficit (the number Home measures against) with "You'd eat about X kcal a
// day". Safe cap = min(weight x 0.01 x 7,700 / 7, plan base - floor), floor 1,500 men / 1,200 women. A date that needs
// more mutes the deficit and offers the earliest safe date or Change goal (no Continue). Watch path: plan base = resting
// burn. The How sheet adds up exactly. Gain and Keep unchanged. Saved plans over the cap keep their numbers and get a
// one-time Home card (Use safer date with Undo, or Keep my plan, stored as state.capCardDismissed). Re-plans in Me.
// WebKit (iPhone 14) at 390x844 and 375x667. Screenshots: screenshots/v115-*.png.
// Usage: npm run build && npx vite preview --port 4174 & node tests/v115.mjs
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
const signedNum = (t) => { const m = t.replace(/,/g, '').match(/([−+-]?)(\d+)/); return (m[1] === '−' || m[1] === '-' ? -1 : 1) * Number(m[2]) }

// Independent maths (not the app's code): the deficit is planBase - round(planBase - gap), eat = planBase - deficit.
const FLOOR = { male: 1500, female: 1200 }
const bmrOf = (sex, kg, cm, age) => Math.round(10 * kg + 6.25 * cm - 5 * age + (sex === 'male' ? 5 : -161))
const deficitOf = (base, gap) => (gap > 0 ? base - Math.round(base - gap) : 0)
const capOf = (sex, startKg, base) => Math.max(0, Math.floor(Math.min((startKg * 0.01 * 7700) / 7, base - FLOOR[sex]) + 1e-9))
const plan = (base, kg, days) => { const d = deficitOf(base, (kg * 7700) / Math.max(7, days)); return { deficit: d, eat: base - d } }
const safeDays = (base, kg, cap) => { for (let d = 7; d <= 3650; d++) if (plan(base, kg, d).deficit <= cap) return d; return null }

const AI = JSON.stringify({ provider: 'gemini', key: 'test-key-not-real' })
const FOODS = JSON.stringify({ version: 1, foods: [] })
const V2 = JSON.stringify({ version: 2, profile: null, entries: [], exercises: [], closedDays: {}, favourites: [] })
const V1 = JSON.stringify({ version: 1, profile: null, entries: [] })

const browser = await webkit.launch()
const open = async (w, h, v3) => {
  const ctx = await browser.newContext({ ...devices['iPhone 14'], viewport: { width: w, height: h }, deviceScaleFactor: 2, serviceWorkers: 'block', reducedMotion: 'reduce' })
  await ctx.addInitScript(([v3, v2, v1, ai, foods]) => {
    if (localStorage.getItem('calorie-app:seeded')) return
    localStorage.setItem('calorie-app:seeded', '1')
    if (v3) localStorage.setItem('calorie-app:v3', v3)
    localStorage.setItem('calorie-app:v2', v2); localStorage.setItem('calorie-app:v1', v1); localStorage.setItem('calorie-app:ai', ai); localStorage.setItem('calorie-app:foods', foods)
    localStorage.setItem('calorie-app:backup', JSON.stringify({ lastExportAt: Date.now(), dismissedAt: null }))
  }, [v3 ? JSON.stringify(v3) : null, V2, V1, AI, FOODS])
  const page = await ctx.newPage()
  page.on('console', (m) => { if ((m.type() === 'error' || m.type() === 'warning') && !/service worker/i.test(m.text())) errors.push(`${w}x${h}: ${m.type()}: ${m.text()}`) })
  page.on('pageerror', (er) => errors.push(`${w}x${h}: pageerror: ${er.message}`))
  return { ctx, page }
}
const stored = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('calorie-app:v3')))
const raw = (page, k) => page.evaluate((k) => localStorage.getItem(k), k)
const untouched = async (page) => {
  assert.equal(await raw(page, 'calorie-app:v2'), V2, 'v2 byte-identical')
  assert.equal(await raw(page, 'calorie-app:v1'), V1, 'v1 byte-identical')
  assert.equal(await raw(page, 'calorie-app:ai'), AI, ':ai byte-identical')
  assert.equal(await raw(page, 'calorie-app:foods'), FOODS, ':foods byte-identical')
}
const flat = async (page, what) => {
  const r = await page.evaluate(() => [document.documentElement.scrollWidth, innerWidth])
  assert.ok(r[0] <= r[1], `${what}: ${r[0]}px wide at ${r[1]}`)
}
const inView = async (page, loc, what) => {
  const b = await loc.boundingBox(), vh = page.viewportSize().height, vw = page.viewportSize().width
  assert.ok(b && b.y >= 0 && b.y + b.height <= vh + 0.5 && b.x >= 0 && b.x + b.width <= vw + 0.5, `${what} in view: ${JSON.stringify(b)} at ${vw}x${vh}`)
}
const cleanCopy = (t, what) => { assert.doesNotMatch(t, /—/, `${what}: em dash`); assert.doesNotMatch(t, /;/, `${what}: semicolon`) }
const shot = async (page, name, tag) => { await page.waitForTimeout(250); await page.screenshot({ path: `${OUT}v115-${name}-${tag}.png` }) }

/** Onboarding to the result. by: '1m' | '3m' | '6m' | '1y' | a date key. act: an activity, or null for the watch. */
const onboard = async (page, { sex, age, cm, kg, goal = 'lose', gw, by, act }) => {
  await page.goto(BASE + '/')
  await page.getByTestId('ob-start').click()
  await page.getByTestId(`ob-sex-${sex}`).click()
  await page.fill('input[name=age]', String(age)); await page.getByTestId('ob-next').click()
  await page.fill('input[name=heightCm]', String(cm)); await page.fill('input[name=weightKg]', String(kg)); await page.getByTestId('ob-next').click()
  await page.getByTestId(`ob-goal-${goal}`).click()
  if (goal !== 'keep') {
    await page.fill('input[name=goalWeightKg]', String(gw)); await page.getByTestId('ob-next').click()
    await page.getByTestId('by-when').waitFor()
    if (/^\d{4}-/.test(by)) { await page.getByTestId('by-custom').click(); await page.getByTestId('by-date').fill(by) } else await page.getByTestId(`by-${by}`).click()
    await page.getByTestId('ob-next').click()
  }
  if (act) { await page.getByTestId('ob-watch-no').click(); await page.getByTestId(`ob-act-${act}`).click() } else await page.getByTestId('ob-watch-yes').click()
  await page.getByTestId('ob-target').waitFor()
}
const byDate = (by) => (/^\d{4}-/.test(by) ? by : addMonthsKey(TODAY, { '1m': 1, '3m': 3, '6m': 6, '1y': 12 }[by]))

// Dimas: male 38, 176 cm, 88 -> 78 kg. BMR 1,795 + sedentary 359 = 2,154 daily burn.
const DIMAS = { sex: 'male', age: 38, cm: 176, kg: 88, gw: 78, act: 'sedentary' }
const D_BMR = bmrOf('male', 88, 176, 38), D_BASE = D_BMR + Math.round(D_BMR * 0.2)
const D_CAP = capOf('male', 88, D_BASE)
// Sari: female 30, 164 cm, 78 -> 72 kg, sedentary. Her burn sits near the 1,200 floor, so the floor sets her cap.
const SARI = { sex: 'female', age: 30, cm: 164, kg: 78, gw: 72, act: 'sedentary' }
const S_BMR = bmrOf('female', 78, 164, 30), S_BASE = S_BMR + Math.round(S_BMR * 0.2)
const S_CAP = capOf('female', 78, S_BASE)

/** The How sheet adds up exactly: rest + movement = base, base - deficit = eat, and the sentence uses the same numbers. */
const sheetSums = async (page, { deficit, eat, base, watch, kg }) => {
  await page.getByTestId('ob-how').click()
  const sheet = page.getByTestId('ob-how-sheet')
  await sheet.waitFor()
  const v = async (id) => (await page.getByTestId(`${id}-v`).innerText())
  const rest = signedNum(await v('how-bmr')), bse = signedNum(await v('how-base')), def = signedNum(await v('how-deficit')), e = signedNum(await v('how-eat'))
  if (watch) { assert.equal(await v('how-move'), 'From your watch'); assert.equal(rest, bse); assert.match(await page.getByTestId('how-base').innerText(), /Plan base/) }
  else { const mv = signedNum(await v('how-move')); assert.equal(rest + mv, bse, 'rest + movement = burn'); assert.match(await page.getByTestId('how-base').innerText(), /Your daily burn/) }
  assert.deepEqual([bse, -def, e], [base, deficit, eat])
  assert.equal(bse + def, e, 'base - deficit = eat')
  assert.match(await page.getByTestId('how-deficit-sub').innerText(), new RegExp(`^Lose ${kg} kg by \\d+ \\w+ \\d{4}$`))
  const why = await page.getByTestId('ob-how-why').innerText()
  assert.ok(why.includes(`${kg} kg × 7,700 = ${fmt(kg * 7700)} kcal`), why)
  assert.ok(why.includes(`= ${fmt(deficit)} kcal a day (rounded)`), why)
  assert.ok(why.includes(`${fmt(base)} − ${fmt(deficit)} = ${eat < 0 ? '−' + fmt(-eat) : fmt(eat)} kcal to eat`), why)
  cleanCopy(await sheet.innerText(), 'how sheet')
  return sheet
}
const closeSheet = async (page) => { await page.getByTestId('ob-how-close').click(); await page.getByTestId('ob-how-sheet').waitFor({ state: 'detached' }) }

for (const [w, h] of [[390, 844], [375, 667]]) {
  const tag = `${w}x${h}`

  await step(`${tag} 1-3 Dimas, 1 month: deficit 2,484 leaves nothing to eat, over the cap 654, muted, card, Use safer date and Change goal, no Continue`, async () => {
    const { ctx, page } = await open(w, h, null)
    await onboard(page, { ...DIMAS, by: '1m' })
    const days = between(TODAY, byDate('1m')), ask = plan(D_BASE, 10, days)
    assert.deepEqual([D_BMR, D_BASE, D_CAP], [1795, 2154, 654])
    const t = page.getByTestId('ob-target')
    assert.equal(await t.getAttribute('data-state'), 'unsafe')
    assert.match(await page.locator('main').innerText(), /Your daily deficit/i)
    assert.equal(await num(page.getByTestId('deficit')), ask.deficit)
    assert.match(await page.getByTestId('deficit').getAttribute('class'), /text-mute-soft/)
    if (ask.eat <= 0) assert.equal(await page.getByTestId('eat-line').innerText(), `More than you burn in a day (${fmt(D_BASE)} kcal)`)
    const card = await page.getByTestId('unsafe-card').innerText()
    assert.match(card, /This date isn't safe/)
    assert.match(card, ask.eat <= 0 ? /leave nothing to eat\. The safe minimum is 1,500 kcal a day/ : /leave about/)
    const sd = safeDays(D_BASE, 10, D_CAP), safeDate = addDaysKey(TODAY, sd), safe = plan(D_BASE, 10, sd)
    assert.match(card, new RegExp(`a ${fmt(safe.deficit)} kcal deficit, eating about ${fmt(safe.eat)} kcal a day, 78 kg by ${longDay(safeDate)}`))
    assert.equal(await page.getByTestId('ob-safer').innerText(), `Use safer date (${longDay(safeDate)})`)
    assert.equal(await page.getByTestId('ob-change-goal').innerText(), 'Change goal')
    assert.equal(await page.getByTestId('ob-next').count(), 0)
    assert.equal(await page.getByTestId('pace-warning').count(), 0) // 2: PaceWarning replaced for Lose
    cleanCopy(await page.locator('main').innerText(), 'over-cap screen')
    await flat(page, 'over-cap'); await inView(page, page.getByTestId('ob-safer'), 'Use safer date'); await inView(page, page.getByTestId('ob-change-goal'), 'Change goal')
    await shot(page, 'over-cap', tag)
    // The sheet on the unsafe plan still adds up (eat may go under 0), with the cap said openly.
    await sheetSums(page, { ...ask, base: D_BASE, watch: false, kg: 10 })
    assert.match(await page.getByTestId('how-unsafe').innerText(), /safe cap is 654 kcal a day/)
    assert.match(await page.getByTestId('ob-how-cap').innerText(), /at most 654 kcal a day[\s\S]*968 kcal[\s\S]*1,500 kcal minimum \(654 kcal\)[\s\S]*never raises what you eat/)
    await closeSheet(page)
    // Change goal goes back to goal weight.
    await page.getByTestId('ob-change-goal').click()
    await page.getByTestId('ob-goal-weight').waitFor()
    assert.equal(await page.inputValue('input[name=goalWeightKg]'), '78')
    await ctx.close()
  })

  await step(`${tag} 4 Dimas safer date: capped deficit, eat-about line, kg a week, goal by date, Continue, saved plan matches Home`, async () => {
    const { ctx, page } = await open(w, h, null)
    await onboard(page, { ...DIMAS, by: '1m' })
    const sd = safeDays(D_BASE, 10, D_CAP), safeDate = addDaysKey(TODAY, sd), safe = plan(D_BASE, 10, sd)
    await page.getByTestId('ob-safer').click()
    assert.equal(await page.getByTestId('ob-target').getAttribute('data-state'), 'safe')
    assert.equal(await num(page.getByTestId('deficit')), safe.deficit)
    assert.ok(safe.deficit <= D_CAP)
    assert.equal(await page.getByTestId('eat-line').innerText(), `You'd eat about ${fmt(safe.eat)} kcal a day`)
    const wk = Math.round(((10 * 7700) / sd) * 7 / 7700 * 10) / 10
    assert.equal(await page.getByTestId('goal-line').innerText(), `Lose about ${wk} kg a week`)
    assert.equal(await page.getByTestId('goal-date-line').innerText(), `78 kg by ${longDay(safeDate)}`)
    assert.equal(await page.getByTestId('unsafe-card').count(), 0)
    assert.equal(await page.getByTestId('watch-sooner').count(), 0)
    await page.getByTestId('ob-next').waitFor()
    cleanCopy(await page.locator('main').innerText(), 'safer screen')
    await flat(page, 'safer'); await inView(page, page.getByTestId('ob-next'), 'Continue')
    await shot(page, 'safer', tag)
    const sheet = await sheetSums(page, { ...safe, base: D_BASE, watch: false, kg: 10 })
    await page.waitForTimeout(200); await shot(page, 'how-sheet', tag)
    assert.match(await sheet.innerText(), /Daily movement \(desk job\)|Daily movement \(/)
    await closeSheet(page)
    await page.getByTestId('ob-next').click(); await page.getByTestId('ob-skip').click()
    await page.waitForURL(BASE + '/'); await page.getByTestId('balance').waitFor()
    const p = (await stored(page)).profile
    assert.deepEqual([p.goalDate, p.dailyGoal, p.target, p.bmr, p.includeMovement], [safeDate, safe.deficit, safe.eat, 1795, true])
    assert.equal(await page.getByTestId('ring-goal').innerText(), `goal ${safe.deficit}`) // 1: the same number Home measures against
    assert.equal(await page.getByTestId('cap-card').count(), 0)
    await untouched(page)
    await ctx.close()
  })

  await step(`${tag} 1 a safe Dimas plan (6 months): deficit hero, eat line, no card`, async () => {
    const { ctx, page } = await open(w, h, null)
    await onboard(page, { ...DIMAS, by: '6m' })
    const ok = plan(D_BASE, 10, between(TODAY, byDate('6m')))
    assert.equal(await page.getByTestId('ob-target').getAttribute('data-state'), 'safe')
    assert.equal(await num(page.getByTestId('deficit')), ok.deficit)
    assert.equal(await page.getByTestId('eat-line').innerText(), `You'd eat about ${fmt(ok.eat)} kcal a day`)
    assert.equal(await page.getByTestId('unsafe-card').count() + await page.getByTestId('pace-warning').count(), 0)
    await flat(page, 'target ok'); await inView(page, page.getByTestId('ob-next'), 'Continue')
    await shot(page, 'target-ok', tag)
    await ctx.close()
  })

  await step(`${tag} 2 Sari near the 1,200 floor: the floor sets her cap, shown openly, the safer date leaves at least 1,200, the target is never raised`, async () => {
    const { ctx, page } = await open(w, h, null)
    await onboard(page, { ...SARI, by: '1m' })
    assert.equal(S_CAP, S_BASE - 1200) // floor part is the smaller one
    const ask = plan(S_BASE, 6, between(TODAY, byDate('1m')))
    assert.ok(ask.eat > 0 && ask.eat < 1200, String(ask.eat))
    assert.equal(await num(page.getByTestId('deficit')), ask.deficit)
    assert.equal(await page.getByTestId('eat-line').innerText(), `You'd eat about ${fmt(ask.eat)} kcal a day`) // not raised
    assert.match(await page.getByTestId('unsafe-card').innerText(), new RegExp(`leave about ${fmt(ask.eat)} kcal a day to eat, under the safe minimum of 1,200`))
    const sd = safeDays(S_BASE, 6, S_CAP), safe = plan(S_BASE, 6, sd)
    assert.ok(safe.eat >= 1200 && safe.eat <= 1201, String(safe.eat))
    await page.getByTestId('ob-safer').click()
    assert.equal(await num(page.getByTestId('deficit')), safe.deficit)
    assert.equal(await page.getByTestId('goal-date-line').innerText(), `72 kg by ${longDay(addDaysKey(TODAY, sd))}`)
    await sheetSums(page, { ...safe, base: S_BASE, watch: false, kg: 6 })
    assert.match(await page.getByTestId('ob-how-cap').innerText(), new RegExp(`at most ${fmt(S_CAP)} kcal a day[\\s\\S]*1,200 kcal minimum`))
    await closeSheet(page)
    // 3 months is safe for her: a 502-ish deficit, eating under her burn but over 1,200.
    await ctx.close()
  })

  await step(`${tag} 5 watch path: plan base = resting burn 1,795, cap 295, "Likely sooner" under the date, watch note, sheet says From your watch`, async () => {
    const { ctx, page } = await open(w, h, null)
    await onboard(page, { ...DIMAS, by: '1m', act: null })
    const cap = capOf('male', 88, D_BMR)
    assert.equal(cap, 295)
    assert.equal(await page.getByTestId('ob-target').getAttribute('data-state'), 'unsafe')
    assert.match(await page.getByTestId('unsafe-card').innerText(), /nothing to eat|leave about/)
    const sd = safeDays(D_BMR, 10, cap), safe = plan(D_BMR, 10, sd)
    await page.getByTestId('ob-safer').click()
    assert.equal(await num(page.getByTestId('deficit')), safe.deficit)
    assert.equal(await page.getByTestId('eat-line').innerText(), `You'd eat about ${fmt(safe.eat)} kcal a day`)
    assert.ok(safe.eat >= 1500)
    assert.equal(await page.getByTestId('goal-date-line').innerText(), `78 kg by ${longDay(addDaysKey(TODAY, sd))}`)
    assert.equal(await page.getByTestId('watch-sooner').innerText(), 'Likely sooner, since your watch adds burn on top.')
    await page.getByTestId('ob-watch-note').waitFor()
    cleanCopy(await page.locator('main').innerText(), 'watch screen')
    await flat(page, 'watch'); await inView(page, page.getByTestId('ob-next'), 'Continue')
    await shot(page, 'watch', tag)
    await sheetSums(page, { ...safe, base: D_BMR, watch: true, kg: 10 })
    await closeSheet(page)
    await page.getByTestId('ob-next').click(); await page.getByTestId('ob-skip').click()
    await page.waitForURL(BASE + '/'); await page.getByTestId('balance').waitFor()
    const p = (await stored(page)).profile
    assert.deepEqual([p.includeMovement, p.dailyGoal, p.target], [false, safe.deficit, safe.eat])
    await ctx.close()
  })
}

await step('8 Gain and Keep stay as before: daily target hero, Gain 1 month keeps the soft 1% note with Continue', async () => {
  const { ctx, page } = await open(390, 844, null)
  // Gain: male 32, 175 cm, 92 -> 95 kg, sedentary. 1,859 + 372 = 2,231 + 3 x 7,700 / days.
  await onboard(page, { sex: 'male', age: 32, cm: 175, kg: 92, goal: 'gain', gw: 95, by: '6m', act: 'sedentary' })
  const days = between(TODAY, byDate('6m'))
  assert.equal(await num(page.getByTestId('target')), Math.round(2231 + (3 * 7700) / days))
  assert.equal(await page.getByTestId('deficit').count() + await page.getByTestId('pace-warning').count(), 0)
  assert.match(await page.locator('main').innerText(), /Your daily target/i)
  await page.getByTestId('ob-how').click()
  assert.match(await page.getByRole('dialog').innerText(), /Daily target/)
  await page.getByTestId('ob-how-close').click()
  await onboard(page, { sex: 'male', age: 32, cm: 175, kg: 92, goal: 'gain', gw: 97, by: '1m', act: 'sedentary' })
  await page.getByTestId('pace-warning').waitFor()
  assert.equal(await page.getByTestId('ob-next').isDisabled(), false)
  await onboard(page, { sex: 'male', age: 32, cm: 175, kg: 92, goal: 'keep', act: 'sedentary' })
  assert.equal(await num(page.getByTestId('target')), 2231)
  assert.equal(await page.getByTestId('goal-line').innerText(), 'Keeps your current weight')
  assert.equal(await page.getByTestId('deficit').count(), 0)
  await ctx.close()
})

// ---------- 9: existing users over the cap ----------
const PF = addDaysKey(TODAY, -2)
// Jordy-like saved plan (v1.13.1 re-derived): male 92 kg, BMR 1,859, movement off, 79 kg in 182 days = 550 a day, eat 1,309.
const JORDY = { age: 32, sex: 'male', heightCm: 175, weightKg: 92, activity: 'light', goal: 'lose', bmr: 1859, bmrCustom: false, includeMovement: false, goalWeightKg: 79, macros: { protein: null, carbs: null, fat: null }, target: 1309, dailyGoal: 550, goalDate: addDaysKey(PF, 182), planFrom: { date: PF, kg: 92 }, goalAssumed: true, goalAssumedV: 2 }
const v3 = (profile) => ({ version: 3, profile, entries: [], exercises: [], closedDays: {}, favourites: [], weights: [{ date: PF, kg: 92 }] })
const J_CAP = capOf('male', 92, 1859), J_DAYS = safeDays(1859, 13, J_CAP), J_SAFE = plan(1859, 13, J_DAYS), J_DATE = addDaysKey(PF, J_DAYS)

for (const [w, h] of [[390, 844], [375, 667]]) {
  const tag = `${w}x${h}`
  await step(`${tag} 9 Jordy-like plan over the cap: numbers unchanged on load, one Home card, Use safer date applies the capped plan, Undo restores it exactly`, async () => {
    const { ctx, page } = await open(w, h, v3(JORDY))
    await page.goto(BASE + '/'); await page.getByTestId('balance').waitFor()
    const s0 = await stored(page)
    assert.deepEqual([s0.profile.target, s0.profile.dailyGoal, s0.profile.goalDate, s0.profile.planFrom], [1309, 550, JORDY.goalDate, JORDY.planFrom])
    assert.equal('capCardDismissed' in s0, false)
    assert.equal(await page.getByTestId('ring-goal').innerText(), 'goal 550')
    const card = page.getByTestId('cap-card')
    await card.waitFor()
    const t = await card.innerText()
    assert.equal(J_CAP, 359)
    assert.match(t, /Your daily deficit is over the safe limit/)
    assert.match(t, /takes 550 kcal a day off your resting burn and leaves about 1,309 kcal to eat/)
    assert.match(t, /safe limit for you is 359 kcal a day/)
    assert.match(t, new RegExp(`a ${fmt(J_SAFE.deficit)} kcal deficit, eating about ${fmt(J_SAFE.eat)} kcal a day, 79 kg by ${longDay(J_DATE)}`))
    assert.match(t, /Nothing changes unless you tap/)
    cleanCopy(t, 'home card')
    assert.equal(await page.getByTestId('cap-use').innerText(), `Use safer date (${longDay(J_DATE)})`)
    await flat(page, 'home card')
    await card.scrollIntoViewIfNeeded()
    await inView(page, page.getByTestId('cap-use'), 'card Use safer date'); await inView(page, page.getByTestId('cap-dismiss'), 'card Keep my plan')
    await shot(page, 'home-card', tag)
    const before = await raw(page, 'calorie-app:v3')
    await page.getByTestId('cap-use').click()
    const a = await page.getByTestId('cap-applied').innerText()
    assert.match(a, new RegExp(`Goal date is now ${longDay(J_DATE)}\\. Your daily deficit is ${fmt(J_SAFE.deficit)} kcal, so you'd eat about ${fmt(J_SAFE.eat)} kcal a day`))
    const s1 = await stored(page)
    assert.deepEqual([s1.profile.goalDate, s1.profile.dailyGoal, s1.profile.target, s1.profile.planFrom, s1.capCardDismissed], [J_DATE, J_SAFE.deficit, J_SAFE.eat, JORDY.planFrom, TODAY])
    assert.equal(await page.getByTestId('ring-goal').innerText(), `goal ${J_SAFE.deficit}`)
    await page.getByTestId('cap-undo').click()
    assert.equal(await raw(page, 'calorie-app:v3'), before, 'Undo restores the exact saved state')
    await card.waitFor()
    assert.equal(await page.getByTestId('ring-goal').innerText(), 'goal 550')
    await untouched(page)
    await ctx.close()
  })
}

await step('9 Keep my plan hides the card for good (capCardDismissed in v3), numbers unchanged, also after a reload', async () => {
  const { ctx, page } = await open(390, 844, v3(JORDY))
  await page.goto(BASE + '/'); await page.getByTestId('cap-card').waitFor()
  const p0 = (await stored(page)).profile
  await page.getByTestId('cap-dismiss').click()
  assert.equal(await page.getByTestId('cap-card').count(), 0)
  let s = await stored(page)
  assert.equal(s.capCardDismissed, TODAY)
  assert.deepEqual(s.profile, p0)
  await page.reload(); await page.getByTestId('balance').waitFor(); await page.waitForTimeout(300)
  assert.equal(await page.getByTestId('cap-card').count(), 0)
  s = await stored(page)
  assert.deepEqual([s.capCardDismissed, s.profile], [TODAY, p0])
  // Me still offers the safer date (same cap), but nothing changes on its own.
  await page.goto(BASE + '/settings'); await page.getByTestId('weight-card').waitFor()
  assert.match(await page.getByTestId('push-prompt').innerText(), new RegExp(`This date isn't safe now[\\s\\S]*1,309[\\s\\S]*1,500[\\s\\S]*earliest safe date is ${longDay(J_DATE)}`))
  assert.deepEqual((await stored(page)).profile, p0)
  await untouched(page)
  await ctx.close()
})

await step('9 not shown under the cap (movement on: 550 of 2,556, cap 1,012), Gain, Keep, or a reached goal', async () => {
  for (const prof of [{ ...JORDY, includeMovement: true, target: 2006 }, { ...JORDY, goal: 'gain', goalWeightKg: 95 }, { ...JORDY, goal: 'keep', goalDate: null, goalWeightKg: 92 }, { ...JORDY, weightKg: 78.5 }]) {
    const { ctx, page } = await open(390, 844, v3(prof))
    await page.goto(BASE + '/'); await page.getByTestId('balance').waitFor(); await page.waitForTimeout(300)
    assert.equal(await page.getByTestId('cap-card').count(), 0, `${prof.goal} ${prof.includeMovement}`)
    await ctx.close()
  }
})

await step('re-plans: a weigh-in over the cap offers the safer date (Keep leaves the plan), the Me goal sheet blocks an unsafe date until the safer one', async () => {
  const { ctx, page } = await open(390, 844, v3({ ...JORDY, goalAssumed: undefined }))
  await page.goto(BASE + '/settings'); await page.getByTestId('weight-card').waitFor()
  const p0 = (await stored(page)).profile
  await page.getByTestId('log-weight').click()
  await page.getByTestId('weigh-kg').fill('91.8')
  await page.getByTestId('weigh-save').click()
  const res = page.getByTestId('weigh-result')
  const pr = res.getByTestId('push-prompt')
  await pr.waitFor()
  const pt = await pr.innerText()
  assert.match(pt, /This date isn't safe now/)
  cleanCopy(pt, 'weigh-in prompt')
  assert.match(await res.getByTestId('push-date').innerText(), /^Use safer date \(\d+ \w+\)$/)
  const after = (await stored(page)).profile
  assert.equal(after.goalDate, p0.goalDate) // re-planned from 91.8 kg, date kept, nothing raised silently
  await res.getByTestId('push-keep').click()
  assert.equal((await stored(page)).profile.goalDate, p0.goalDate)
  await page.getByTestId('weigh-done').click()
  // Goal sheet: Lose preview in deficit terms, 1 month is not safe, Save waits for the safer date.
  await page.getByTestId('edit-goal').click(); await page.getByTestId('goal-sheet').waitFor()
  await page.getByTestId('by-1m').click()
  assert.match(await page.getByTestId('by-1m').innerText(), /not safe/)
  await page.getByTestId('goal-preview').getByTestId('unsafe-card').waitFor()
  assert.equal(await page.getByTestId('goal-save').isDisabled(), true)
  await page.getByTestId('goal-safer').click()
  assert.equal(await page.getByTestId('goal-save').isDisabled(), false)
  const pv = await page.getByTestId('goal-preview').innerText()
  assert.match(pv, /kcal deficit a day[\s\S]*You'd eat about 1,5\d\d kcal a day/)
  cleanCopy(pv, 'goal preview')
  await page.getByTestId('goal-save').click(); await page.getByTestId('goal-sheet').waitFor({ state: 'detached' })
  const p = (await stored(page)).profile
  assert.ok(p.target >= 1500 && p.dailyGoal <= 359, `${p.target} ${p.dailyGoal}`)
  await untouched(page)
  await ctx.close()
})

await browser.close()
console.log(results.join('\n'))
console.log(`\nDimas: BMR ${D_BMR} + ${D_BASE - D_BMR} = ${D_BASE}, cap ${D_CAP}, 1 month (${between(TODAY, byDate('1m'))} days) asks ${plan(D_BASE, 10, between(TODAY, byDate('1m'))).deficit}, safer ${addDaysKey(TODAY, safeDays(D_BASE, 10, D_CAP))} (${safeDays(D_BASE, 10, D_CAP)} days) = ${JSON.stringify(plan(D_BASE, 10, safeDays(D_BASE, 10, D_CAP)))}`)
console.log(`Sari: BMR ${S_BMR}, base ${S_BASE}, cap ${S_CAP}. Jordy-like: cap ${J_CAP}, safer ${J_DATE} (${J_DAYS} days) = ${JSON.stringify(J_SAFE)}`)
if (errors.length) { console.log(errors.join('\n')); process.exit(1) }
console.log(`\n${results.length} v1.15 checks passed, no console errors`)
