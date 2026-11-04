// v1.21.4 (Reed's two points, Jordy's go). 1. A kept date under the safe minimum (profile.exerciseTopUp): exercise
// closes the day's gap first (safe minimum - plan food, dailyPlan's topUp). The day's goal grows with the burn up to the
// gap, so left to eat stays at 1,200 - eaten until the gap is burned, then burn past it adds as usual. Under the
// equation: "Burn {n} more to stay on track", then "Burn goal done" in green. Closed days freeze that goal; Nutrition
// and Me agree. 2. The Home card: "You kept your date. Eat at least 1,200 a day and burn about {gap} kcal a day with
// Quick add burn to stay on track." with Use safer date. Profiles without the flag unchanged. WebKit at 390x844, 375x667.
// Screenshots: screenshots/v1214-*.png. Usage: npm run build && npx vite preview --port 4174 & node tests/v1214.mjs
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
const shot = async (page, name, tag) => { await page.waitForTimeout(250); await page.screenshot({ path: `${OUT}v1214-${name}-${tag}.png` }) }
const isPrimary = async (loc) => /bg-ink|bg-g\b|bg-g-ink/.test(await loc.getAttribute('class'))


// Sari: female 30, 164 cm, 78 -> 72 kg, sedentary, 1 month. Plan food is under 1,200, so a kept date holds food at 1,200
// (exerciseTopUp) and the rest is the exercise gap.
const S_BMR = bmrOf('female', 78, 164, 30), S_BASE = S_BMR + Math.round(S_BMR * 0.2)
const DATE = addMonthsKey(TODAY, 1), ASK = plan(S_BASE, 6, between(TODAY, DATE))
const GAP = 1200 - ASK.eat, GOAL = S_BASE - 1200
const YDAY = addDaysKey(TODAY, -1)
const profileOf = (flag) => ({ sex: 'female', age: 30, heightCm: 164, weightKg: 78, activity: 'sedentary', goal: 'lose', bmr: S_BMR, bmrCustom: false, includeMovement: true, goalWeightKg: 72, goalDate: DATE, planFrom: { date: TODAY, kg: 78 }, macros: { protein: null, carbs: null, fat: null }, ...(flag ? { target: 1200, dailyGoal: GOAL, exerciseTopUp: true } : { target: ASK.eat, dailyGoal: ASK.deficit }) })
const ex = (id, date, kcal) => ({ id, date, activityId: null, name: 'Watch workout', minutes: 0, intensity: 'moderate', kcal, createdAt: 1 })
const food = (id, date, kcal) => ({ id, date, meal: 'lunch', foodId: null, name: 'Test ' + id, servingLabel: '1 serving', servingMult: 1, qty: 1, kcal, protein: 10, carbs: 10, fat: 5, createdAt: 1 })
const seed = (flag, entries = [], exercises = []) => JSON.stringify({ version: 3, profile: profileOf(flag), entries, exercises, closedDays: {}, favourites: [], weights: [{ date: YDAY, kg: 78 }] })
const home = async (page) => { await page.goto(BASE + '/'); await page.getByTestId('balance').waitFor() }
const message = (page) => page.getByTestId('ring').getAttribute('data-message')
const burnText = (page) => page.getByTestId('burn-line').innerText()
const addBurn = async (page, kcal) => {
  await page.goto(BASE + '/log?mode=exercise')
  await page.getByTestId('qa-bar').getByRole('button', { name: 'Quick add burn' }).click()
  await page.fill('input[name=burn]', String(kcal))
  await page.fill('input[name=exname]', 'Watch workout')
  await page.getByRole('button', { name: `Add ${fmt(kcal)} kcal` }).click()
  await page.waitForURL(BASE + '/'); await page.getByTestId('balance').waitFor()
}
// The equation's own terms: BMR + Movement + Exercise - Eaten = Deficit, and the gauge goal is the day's goal.
const equation = async (page) => ({
  bmr: await num(page.getByTestId('eq-bmr')), movement: await num(page.getByTestId('eq-movement')), burned: await num(page.getByTestId('eq-burned')),
  eaten: await num(page.getByTestId('eaten')), deficit: await num(page.getByTestId('eq-balance')), goal: Number((await page.getByTestId('gauge-goal').textContent()).replace(/[^0-9]/g, '')),
})
const KEPT = `You kept your date. Eat at least 1,200 a day and burn about ${fmt(GAP)} kcal a day with Quick add burn to stay on track.`

assert.ok(ASK.eat < 1200 && GAP > 0, `Sari's plan food ${ASK.eat}`)

for (const [w, h] of [[390, 844], [375, 667]]) {
  const tag = `${w}x${h}`
  await step(`${tag} card copy with the flag, Use safer date stays, then the gap counts down: 0, partial, exact (Burn goal done), over`, async () => {
    const { ctx, page } = await open(w, h, seed(true))
    await home(page)
    // Card (point 2)
    const card = page.getByTestId('cap-card')
    assert.equal((await page.getByTestId('cap-kept').innerText()).replace(/\s+/g, ' '), KEPT)
    assert.equal(await page.getByTestId('cap-kept').locator('b').innerText(), 'You kept your date.')
    assert.doesNotMatch(await card.innerText(), /over the safe limit/)
    assert.match(await page.getByTestId('cap-use').innerText(), /^Use safer date \(\d+ \w+ \d{4}\)$/)
    await tall(page.getByTestId('cap-use'), 'cap-use')
    cleanCopy(await card.innerText(), 'card')
    await card.scrollIntoViewIfNeeded(); await shot(page, 'card', tag)
    // 0 burned: the whole gap left, 1,200 to eat, goal is dailyGoal
    assert.equal(await message(page), '1,200 kcal left to eat.')
    assert.equal(await burnText(page), `Burn ${fmt(GAP)} more to stay on track`)
    assert.equal(Number(await page.getByTestId('burn-line').getAttribute('data-left')), GAP)
    assert.match(await page.getByTestId('burn-line').getAttribute('class'), /text-mute/)
    let e = await equation(page)
    assert.deepEqual([e.bmr + e.movement, e.burned, e.eaten, e.deficit, e.goal], [S_BASE, 0, 0, S_BASE, GOAL])
    await page.getByTestId('burn-line').scrollIntoViewIfNeeded(); await shot(page, 'gap', tag)
    // partial: 300 closes part of the gap, left to eat stays 1,200, the goal grows by 300
    await addBurn(page, 300)
    assert.equal(await message(page), '1,200 kcal left to eat.')
    assert.equal(await burnText(page), `Burn ${fmt(GAP - 300)} more to stay on track`)
    e = await equation(page)
    assert.deepEqual([e.burned, e.deficit, e.goal], [300, S_BASE + 300, GOAL + 300])
    assert.equal(e.deficit - e.goal, 1200, 'left to eat = deficit - goal')
    // exact: the rest of the gap, Burn goal done in green, still 1,200
    await addBurn(page, GAP - 300)
    assert.equal(await message(page), '1,200 kcal left to eat.')
    assert.equal(await burnText(page), 'Burn goal done')
    assert.equal(await page.getByTestId('burn-line').getAttribute('data-done'), 'true')
    assert.match(await page.getByTestId('burn-line').getAttribute('class'), /text-g-ink/)
    e = await equation(page)
    assert.deepEqual([e.burned, e.goal], [GAP, ASK.deficit], 'goal reaches the full plan deficit')
    await page.getByTestId('burn-line').scrollIntoViewIfNeeded(); await shot(page, 'done', tag)
    // over: burn past the gap adds to left to eat as usual
    await addBurn(page, 250)
    assert.equal(await message(page), '1,450 kcal left to eat.')
    assert.equal(await burnText(page), 'Burn goal done')
    e = await equation(page)
    assert.deepEqual([e.burned, e.goal, e.deficit - e.goal], [GAP + 250, ASK.deficit, 1450])
    cleanCopy(await page.locator('main').innerText(), 'home')
    await flat(page, 'home')
    await untouched(page, ['exerciseTopUp'])
    await ctx.close()
  })
}

await step('food and burn together: left to eat = 1,200 + burn past the gap - eaten (Log and Nutrition agree)', async () => {
  const { ctx, page } = await open(390, 844, seed(true, [food('f1', TODAY, 500)], [ex('x1', TODAY, 400)]))
  await home(page)
  assert.equal(await message(page), '700 kcal left to eat.')
  assert.equal(await burnText(page), `Burn ${fmt(GAP - 400)} more to stay on track`)
  await ctx.close()
  const b = await open(390, 844, seed(true, [food('f1', TODAY, 500)], [ex('x1', TODAY, GAP + 100)]))
  await home(b.page)
  assert.equal(await message(b.page), '800 kcal left to eat.')
  // Nutrition's target counts only burn past the gap, like Home: 1,200 + 100
  await b.page.goto(BASE + '/nutrition'); await b.page.getByTestId('cal-card').waitFor()
  assert.match(await b.page.getByTestId('cal-text').innerText(), /of 1,300 kcal/)
  assert.match(await b.page.getByTestId('cal-note').innerText(), /Target includes 100 kcal of exercise/)
  await untouched(b.page, ['exerciseTopUp'])
  await b.ctx.close()
})

await step('a past day closes with the gap applied to its goal (no new summary fields), and the verdict agrees', async () => {
  const { ctx, page } = await open(390, 844, seed(true, [food('f1', YDAY, 900)], [ex('x1', YDAY, 300)]))
  await home(page)
  const s = await stored(page)
  const c = s.closedDays[YDAY]
  assert.ok(c, 'yesterday closed on load')
  assert.deepEqual(Object.keys(c).sort(), ['auto', 'balance', 'bmr', 'burned', 'closedAt', 'eaten', 'goal', 'movement', 'protein'])
  assert.equal(c.goal, GOAL + 300, 'frozen goal: dailyGoal + burn toward the gap')
  assert.equal(c.balance - c.goal, 1200 - 900, 'left to eat on that day: 300')
  await page.goto(BASE + `/day/${YDAY}`); await page.getByTestId('verdict-message').waitFor()
  assert.match(await page.getByTestId('verdict-message').innerText(), /300/)
  await untouched(page, ['exerciseTopUp'])
  await ctx.close()
})

await step('Me: the target line still reads 1,200 with the exercise part, and the info explains the gap', async () => {
  const { ctx, page } = await open(390, 844, seed(true))
  await page.goto(BASE + '/settings'); await page.getByTestId('weight-card').waitFor()
  assert.equal(await num(page.getByTestId('settings-target')), 1200)
  assert.match(await page.getByTestId('target-sum').innerText(), new RegExp(`\\+ ${fmt(GAP)} exercise$`))
  await page.getByRole('button', { name: 'About daily target' }).click()
  assert.match(await page.getByTestId('budget-line').innerText(), new RegExp(`= 1,200 kcal, the safe minimum\\. You kept your date, so burn about ${fmt(GAP)} kcal a day in exercise\\. The first ${fmt(GAP)} kcal you burn each day goes to that\\. Only exercise past it adds to what you can eat\\.$`))
  cleanCopy(await page.getByTestId('budget-line').innerText(), 'budget line')
  await ctx.close()
})

await step('no flag, no change: same plan without exerciseTopUp keeps the old card, no burn line, every burn adds to left to eat', async () => {
  const { ctx, page } = await open(390, 844, seed(false, [], [ex('x1', TODAY, 300)]))
  await home(page)
  assert.deepEqual((await stored(page)).profile, profileOf(false), 'profile unchanged')
  assert.equal(await page.getByTestId('burn-line').count(), 0)
  assert.equal(await page.getByTestId('cap-kept').count(), 0)
  assert.match(await page.getByTestId('cap-card').innerText(), /^Your daily deficit is over the safe limit\./)
  assert.equal(await message(page), `${fmt(ASK.eat + 300)} kcal left to eat.`)
  assert.equal(Number((await page.getByTestId('gauge-goal').textContent()).replace(/[^0-9]/g, '')), ASK.deficit)
  await page.goto(BASE + '/nutrition'); await page.getByTestId('cal-card').waitFor()
  assert.match(await page.getByTestId('cal-text').innerText(), new RegExp(`of ${fmt(ASK.eat + 300)} kcal`))
  await page.goto(BASE + '/settings'); await page.getByTestId('weight-card').waitFor()
  await page.getByRole('button', { name: 'About daily target' }).click()
  assert.doesNotMatch(await page.getByTestId('budget-line').innerText(), /first/)
  await untouched(page)
  await ctx.close()
})

await browser.close()
console.log(results.join('\n'))
if (errors.length) { console.log(errors.join('\n')); process.exit(1) }
console.log(`\n${results.length} v1.21.4 checks passed, no console errors`)
