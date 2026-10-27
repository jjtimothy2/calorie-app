// Headless end-to-end run. Usage: npm run build && npx vite preview --port 4174 & node tests/e2e.mjs
import { chromium } from 'playwright'
import assert from 'node:assert/strict'
import { STATE as V1_STATE } from './v11-fixture.mjs'
import { chartChecks, reducedMotionChecks } from './v14-chart.mjs'
import { geometry, v141Checks } from './v141-chart.mjs'
import { v142Checks, v142ReducedMotion } from './v142-chart.mjs'

// The app is served under the GitHub Pages base path /calorie-app/ (see vite.config.ts).
const BASE = (process.env.BASE_URL ?? 'http://localhost:4174/calorie-app').replace(/\/$/, '')
const OUT = new URL('../screenshots/', import.meta.url).pathname
const errors = []
const results = []
const step = async (name, fn) => {
  const t = Date.now()
  try { await fn(); results.push(`PASS ${name} (${Date.now() - t} ms)`) }
  catch (e) { results.push(`FAIL ${name}: ${e.message}`); throw e }
}
const watch = (page) => {
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`${m.type()}: ${m.text()}`) })
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
  page.on('dialog', (d) => d.accept())
}
const num = async (loc) => Number((await loc.innerText()).replace(/[^0-9]/g, ''))
const color = (loc) => loc.evaluate((el) => getComputedStyle(el).color)
const GREEN = 'rgb(23, 128, 70)'
const ORANGE = 'rgb(194, 84, 47)'
const FAT_INK = 'rgb(47, 98, 201)'
const pad = (n) => String(n).padStart(2, '0')
const key = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const TODAY = key(new Date())
const YESTERDAY = key(new Date(Date.now() - 86400000))

const top = (p) => p.evaluate(() => { document.querySelectorAll('main, #root > div > div').forEach((el) => { el.scrollTop = 0 }); window.scrollTo(0, 0) })

// v1.3.2: Me explanations live in (?) sheets. Open one, read a testid inside it, close it with Escape.
const sheetText = async (pg, id, tid) => {
  await pg.getByTestId('info-' + id).click()
  const txt = await pg.getByRole('dialog').getByTestId(tid).innerText()
  await pg.keyboard.press('Escape')
  await pg.getByRole('dialog').waitFor({ state: 'detached' })
  return txt
}
const addDaysKey = (k, n) => { const [y, m, d] = k.split('-').map(Number); const t = new Date(y, m - 1, d + n); return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}` }
const browser = await chromium.launch()
try {
  // ---------- Mobile 390 ----------
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, reducedMotion: 'reduce' })
  const page = await ctx.newPage(); watch(page)
  const terms = () => page.locator('[data-testid=equation] [data-term]').evaluateAll((els) => els.map((e) => e.getAttribute('data-term')))
  const goHome = async () => { await page.getByRole('link', { name: 'Today', exact: true }).click(); await page.waitForURL(BASE + '/') }

  await step('onboarding (v1.13): goal weight, then By when (1 month / 3 months / 6 months / 1 year / Custom), both skippable, no pace', async () => {
    await page.goto(BASE + '/')
    await page.waitForURL('**/onboarding')
    await page.getByTestId('ob-welcome').waitFor()
    await page.getByTestId('ob-start').click()
    await page.getByTestId('ob-sex-female').click()
    await page.getByTestId('ob-age').waitFor()
    await page.fill('input[name=age]', '30')
    await page.getByTestId('ob-next').click()
    await page.fill('input[name=heightCm]', '165')
    await page.fill('input[name=weightKg]', '68')
    await page.getByTestId('ob-next').click()
    await page.getByTestId('ob-goal-lose').click()
    // Goal weight: the wrong side is refused; Skip uses a 5% first goal (68 x 0.95 = 64.6, to the nearest 0.5 kg).
    await page.getByTestId('ob-goal-weight').waitFor()
    await page.fill('input[name=goalWeightKg]', '70')
    assert.equal(await page.getByTestId('ob-next').isDisabled(), true)
    await page.getByTestId('ob-step-skip').click()
    await page.getByTestId('by-when').waitFor()
    await page.getByTestId('ob-back').click()
    assert.equal(await page.inputValue('input[name=goalWeightKg]'), '64.5')
    await page.fill('input[name=goalWeightKg]', '58')
    assert.match(await page.getByTestId('ob-goal-kg-hint').innerText(), /10 kg to lose/)
    await page.getByTestId('ob-next').click()
    // By when: three presets with their kg a week, plus Custom with a date input.
    await page.getByTestId('by-when').waitFor()
    assert.deepEqual(await page.locator('[data-testid^=by-]:not([data-testid=by-when]):not([data-testid=by-date])').evaluateAll((els) => els.map((e) => e.dataset.testid)), ['by-1m', 'by-3m', 'by-6m', 'by-1y', 'by-custom'])
    assert.match(await page.getByTestId('by-1m').innerText(), /^1 month\n[\s\S]*fast/)
    assert.match(await page.getByTestId('by-3m').innerText(), /fast/) // 10 kg in ~3 months is over 1% of 68 kg a week
    assert.equal(await page.getByTestId('ob-next').isDisabled(), true)
    await page.getByTestId('by-custom').click()
    await page.getByTestId('by-date').fill(addDaysKey(TODAY, 140))
    await page.getByTestId('ob-next').click()
    await page.getByTestId('ob-watch-no').click() // v1.10 watch question
    await page.getByTestId('ob-act-light').click()
    assert.equal(await page.getByTestId('ob-pace').count(), 0)
    // BMR = 10*68 + 6.25*165 - 5*30 - 161 = 1400; light movement 525 -> burn 1925. 10 kg x 7,700 / 140 days = 550 -> 1,375.
    await page.getByTestId('ob-target').waitFor()
    assert.equal(await num(page.getByTestId('target')), 1375)
    assert.match(await page.getByTestId('goal-line').innerText(), /0\.5 kg a week/)
    assert.match(await page.getByTestId('goal-date-line').innerText(), /^58 kg by /)
    assert.equal(await page.getByTestId('pace-warning').count(), 0)
    assert.doesNotMatch(await page.locator('main').innerText(), /Gentle|Standard|Faster/)
    await page.getByTestId('ob-next').click()
    await page.getByTestId('ob-extras').waitFor()
    await page.getByTestId('ob-skip').click()
    await page.waitForURL(BASE + '/')
    // v1.8: new profiles count daily movement, so Home shows BMR 1,400 + movement 525 and the goal is 550.
    assert.equal(await num(page.getByTestId('eq-bmr')), 1400)
    assert.equal(await num(page.getByTestId('eq-movement')), 525)
    assert.match(await page.getByTestId('ring-goal').innerText(), /goal 550/)
    assert.equal(await num(page.getByTestId('balance')), 1925)
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('calorie-app:v3')))
    assert.equal(saved.version, 3)
    assert.deepEqual([saved.profile.includeMovement, saved.profile.goalWeightKg, saved.profile.goalDate, saved.profile.target, saved.profile.bmrCustom, 'pace' in saved.profile], [true, 58, addDaysKey(TODAY, 140), 1375, false, false])
    assert.deepEqual(saved.weights, [{ date: TODAY, kg: 68 }])
  })
  await step('settings: height change recalculates BMR, custom BMR, movement toggle', async () => {
    await page.getByRole('link', { name: 'Me', exact: true }).click()
    // v1.13: weight lives in the weight card (Log weight), so Me's body fields are age, sex and height.
    assert.equal(await page.locator('main input[name=weightKg]').count(), 0)
    assert.match(await page.getByTestId('weight-now').innerText(), /68/)
    await page.fill('input[name=heightCm]', '169')
    assert.equal(await page.inputValue('input[name=bmr]'), '1425')
    await page.fill('input[name=heightCm]', '165')
    assert.equal(await page.inputValue('input[name=bmr]'), '1400')
    await page.fill('input[name=bmr]', '1600')
    const sw = page.getByRole('switch', { name: /Include daily movement/ })
    assert.equal(await sw.isChecked(), true) // v1.8: new profiles start with movement on
    // Reed's acceptance on the Me screen (v1.13 no floor): movement on -> 2200 - 550 = 1650, off -> 1600 - 550 = 1050.
    assert.match(await sheetText(page, 'target', 'budget-line'), /BMR 1,600 \+ movement 600 − 550 deficit = 1,650 kcal/)
    assert.equal(await page.getByTestId('settings-target').innerText(), '1,650 kcal')
    // v1.3.2: macros from maintenance 2200 at 68 kg: P109, fat 550 kcal = 61 g, carbs (2200 - 436 - 550) / 4 = 304.
    assert.equal(await page.getAttribute('input[name=macro-protein]', 'placeholder'), '109')
    assert.equal(await page.getAttribute('input[name=macro-fat]', 'placeholder'), '61')
    assert.equal(await page.getAttribute('input[name=macro-carbs]', 'placeholder'), '304')
    assert.match(await sheetText(page, 'target', 'plan-line'), /lose 10 kg by .* ÷ 140 days = 550 kcal a day/)
    await sw.uncheck()
    assert.match(await sheetText(page, 'target', 'budget-line'), /^BMR 1,600 − 550 deficit = 1,050 kcal/)
    const pl = await sheetText(page, 'target', 'plan-line')
    assert.match(pl, /starts from your BMR\./)
    // Movement off: maintenance 1600: fat max(400, 367.2) = 44 g, carbs (1600 - 436 - 400) / 4 = 191.
    assert.equal(await page.getAttribute('input[name=macro-protein]', 'placeholder'), '109')
    assert.equal(await page.getAttribute('input[name=macro-fat]', 'placeholder'), '44')
    assert.equal(await page.getAttribute('input[name=macro-carbs]', 'placeholder'), '191')
    await page.getByRole('button', { name: 'Save changes' }).click()
    await page.getByText('Saved.').waitFor()
    await goHome()
    assert.equal(await num(page.getByTestId('eq-bmr')), 1600) // v1.3.1: plain BMR
    assert.equal(await page.getByTestId('eq-base').count(), 0)
    assert.equal(await page.getByTestId('eq-movement').count(), 0) // hidden only because the toggle is off
    assert.deepEqual(await terms(), ['BMR', 'Exercise', 'Eaten', 'Balance'])
    assert.match(await page.getByTestId('ring-goal').innerText(), /goal 550/) // 1600 - 1050 = the plan deficit (v1.13 no floor)
  })
  // v1.13: the goal is edited in Me's weight card (Edit goal sheet), not with the Lose / Keep / Gain buttons.
  const setGoal = async (goal, kg, days) => {
    await page.getByRole('link', { name: 'Me', exact: true }).click()
    await page.getByTestId('edit-goal').click()
    await page.getByTestId('goal-sheet').waitFor()
    await page.getByTestId('goal-' + goal).click()
    if (goal !== 'keep') {
      await page.getByTestId('goal-kg').fill(String(kg))
      await page.getByTestId('by-custom').click()
      await page.getByTestId('by-date').fill(addDaysKey(TODAY, days))
    }
    await page.getByTestId('goal-save').click()
    await page.getByTestId('goal-sheet').waitFor({ state: 'detached' })
    await goHome()
  }
  await step('v1.3.1 Keep with movement off: balance goal 0 (break even, target = BMR 1,600); Gain and Lose by goal date', async () => {
    await setGoal('keep')
    assert.equal(await page.getByTestId('ring-goal').innerText(), 'goal: even')
    assert.deepEqual(await page.evaluate(() => { const p = JSON.parse(localStorage.getItem('calorie-app:v3')).profile; return [p.dailyGoal, p.target, p.goalDate] }), [0, 1600, null])
    // Gain 10 kg in 140 days: 1600 + 550 = 2150, so the balance goal is a 550 surplus.
    await setGoal('gain', 78, 140)
    assert.deepEqual(await page.evaluate(() => { const p = JSON.parse(localStorage.getItem('calorie-app:v3')).profile; return [p.dailyGoal, p.target] }), [-550, 2150])
    // Lose 8 kg in 154 days: 8 x 7,700 / 154 = 400 a day, target 1,200 (the steps below were written for a 400 goal).
    await setGoal('lose', 60, 154)
    assert.match(await page.getByTestId('ring-goal').innerText(), /goal 400/)
    assert.deepEqual(await page.evaluate(() => { const p = JSON.parse(localStorage.getItem('calorie-app:v3')).profile; return [p.dailyGoal, p.target] }), [400, 1200])
  })
  await step('acceptance (v1.3.1): BMR 1600 + 300 exercise - 1500 food = 400 deficit', async () => {
    await page.getByRole('link', { name: 'Add exercise' }).click()
    await page.getByRole('heading', { name: 'Log exercise' }).waitFor()
    // v1.3.4: Quick add is a sticky full-width bar at the bottom of Log, not a top-right link.
    assert.equal(await page.getByRole('button', { name: 'Quick add', exact: true }).count(), 0)
    assert.match(await page.getByTestId('qa-bar').innerText(), /^Quick add burn$/)
    const geo = async () => page.evaluate(() => {
      const r = (el) => el && el.getBoundingClientRect()
      const bar = r(document.querySelector('[data-testid=qa-bar]')), main = r(document.querySelector('main')), toast = r(document.querySelector('[data-testid=toast]'))
      return { barTop: bar.top, barBottom: bar.bottom, mainBottom: main.bottom, vh: innerHeight, toastBottom: toast?.bottom }
    })
    let g = await geo()
    assert.ok(g.mainBottom <= g.barTop + 0.5, 'the bar never covers the list (main ends above it)')
    assert.ok(Math.abs(g.barBottom - g.vh) < 1, 'bar sits at the bottom')
    await page.getByTestId('qa-bar').getByRole('button', { name: 'Quick add burn' }).click()
    await page.fill('input[name=burn]', '300')
    await page.fill('input[name=exname]', 'Watch workout')
    await page.getByRole('button', { name: 'Add 300 kcal' }).click()
    await page.getByTestId('toast').waitFor()
    g = await geo()
    assert.ok(g.toastBottom <= g.barTop - 8, `the Undo toast sits above the bar (${g.toastBottom} vs ${g.barTop})`)
    await page.screenshot({ path: OUT + 'v134-e2e-exercise-toast.png' })
    await page.getByRole('button', { name: 'Done' }).click()
    await page.waitForURL(BASE + '/')
    assert.equal(await num(page.getByTestId('eq-burned')), 300)
    await page.getByRole('link', { name: 'Add to Lunch' }).click()
    assert.equal(await page.getByRole('button', { name: 'Quick add', exact: true }).count(), 0)
    await page.getByTestId('qa-bar').getByRole('button', { name: 'Add Calories' }).click()
    assert.match(await page.getByRole('dialog').innerText(), /Lunch/) // opens for the current meal
    await page.fill('input[name=kcal]', '1500')
    await page.fill('input[name=name]', 'Big lunch')
    await page.getByRole('button', { name: 'Add 1,500 kcal' }).click()
    await page.getByRole('button', { name: 'Done' }).click()
    await page.waitForURL(BASE + '/')
    assert.equal(await num(page.getByTestId('eaten')), 1500)
    assert.equal(await num(page.getByTestId('balance')), 400)
    assert.equal(await page.getByTestId('balance-label').innerText(), 'Deficit so far')
    assert.equal(await page.getByTestId('ring').getAttribute('data-state'), 'deficit')
    assert.equal(await color(page.getByTestId('balance')), GREEN)
    assert.equal(await page.getByTestId('eq-balance').innerText(), '400')
    // v1.13: balance 400 = goal 400 (target 1200 + 300 exercise - 1500 eaten = 0 left).
    assert.equal(await page.getByTestId('goal-progress').innerText(), 'Right on your 400 goal.')
  })
  await step('log exercise: Food/Exercise switch, search, duration, intensity', async () => {
    await page.getByRole('button', { name: 'Log food' }).click()
    await page.getByRole('button', { name: 'Exercise' }).click()
    await page.waitForURL('**/log?mode=exercise')
    await page.getByLabel('Search activity').fill('badm')
    assert.equal(await page.getByTestId('activity-list').getByRole('button').count(), 1)
    await page.getByRole('button', { name: 'Badminton' }).click()
    for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'Increase duration' }).click()
    assert.equal(await page.getByTestId('minutes').innerText(), '45 min')
    // MET 5.5 x 68 kg x 0.75 h = 280.5 -> 281
    assert.equal(await page.getByTestId('est-burn').innerText(), '281 kcal')
    await page.getByRole('button', { name: 'Light' }).click()
    assert.equal(await page.getByTestId('est-burn').innerText(), '230 kcal') // 4.5 x 68 x .75 = 229.5
    await page.getByRole('button', { name: 'Moderate' }).click()
    await page.screenshot({ path: OUT + 'v1-mobile-log-exercise.png' })
    await page.getByRole('button', { name: 'Add exercise' }).click()
    await page.getByTestId('toast').waitFor()
    await page.getByRole('button', { name: 'Done' }).click()
    await page.waitForURL(BASE + '/')
    assert.equal(await num(page.getByTestId('eq-burned')), 581)
    assert.match(await page.getByTestId('exercise-card').innerText(), /Badminton, 45 min · moderate/)
    assert.equal(await num(page.getByTestId('balance')), 681) // 1600 + 581 - 1500
  })
  await step('edit and delete exercise, then refresh', async () => {
    await page.getByRole('button', { name: /^Edit Badminton/ }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Vigorous' }).click()
    await page.getByRole('button', { name: 'Save · 357 kcal' }).click() // 7 x 68 x .75
    assert.equal(await num(page.getByTestId('eq-burned')), 657)
    await page.getByRole('button', { name: /^Edit Watch workout/ }).click()
    await page.fill('input[name=burn]', '320')
    await page.getByRole('button', { name: 'Save' }).click()
    assert.equal(await num(page.getByTestId('eq-burned')), 677)
    await page.getByRole('button', { name: /^Edit Watch workout/ }).click()
    await page.getByRole('button', { name: 'Delete exercise' }).click()
    assert.equal(await num(page.getByTestId('eq-burned')), 357)
    await page.reload()
    assert.equal(await num(page.getByTestId('eq-burned')), 357)
    assert.match(await page.getByTestId('exercise-card').innerText(), /Badminton, 45 min · vigorous/)
    assert.doesNotMatch(await page.getByTestId('exercise-card').innerText(), /Watch workout/)
    // Back to the acceptance numbers: swap badminton for a 300 kcal quick add.
    await page.getByRole('button', { name: /^Edit Badminton/ }).click()
    await page.getByRole('button', { name: 'Delete exercise' }).click()
    assert.equal(await num(page.getByTestId('eq-burned')), 0)
  })
  await step('surplus shows in orange when food beats BMR + exercise', async () => {
    await page.getByRole('link', { name: 'Add to Dinner' }).click()
    await page.getByTestId('qa-bar').getByRole('button', { name: 'Add Calories' }).click()
    await page.fill('input[name=kcal]', '600')
    await page.fill('input[name=name]', 'Martabak')
    await page.getByRole('button', { name: 'Add 600 kcal' }).click()
    await page.getByRole('button', { name: 'Done' }).click()
    await page.waitForURL(BASE + '/')
    // 1600 + 0 - 2100 = -500
    assert.equal(await num(page.getByTestId('balance')), 500)
    assert.equal(await page.getByTestId('balance-label').innerText(), 'Surplus so far')
    assert.equal(await page.getByTestId('ring').getAttribute('data-state'), 'surplus')
    assert.equal(await color(page.getByTestId('balance')), ORANGE)
    assert.equal(await page.getByTestId('eq-balance').innerText(), '−500')
    assert.equal(await page.getByTestId('close-preview').innerText(), 'Surplus 500 kcal')
    await page.getByRole('button', { name: /^Edit Martabak/ }).click()
    await page.getByRole('button', { name: 'Delete entry' }).click()
  })
  await step('home with balance (badminton 45 min + food)', async () => {
    await page.getByRole('link', { name: 'Add exercise' }).click()
    await page.getByRole('button', { name: 'Badminton' }).click()
    for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'Increase duration' }).click()
    await page.getByRole('button', { name: 'Add exercise' }).click()
    await page.getByRole('button', { name: 'Done' }).click()
    await page.waitForURL(BASE + '/')
    // Daily movement back on (the default) for the rest of the run and the screenshots.
    await page.getByRole('link', { name: 'Me', exact: true }).click()
    await page.getByRole('switch', { name: /Include daily movement/ }).check()
    await page.getByRole('button', { name: 'Save changes' }).click()
    await page.getByText('Saved.').waitFor()
    await goHome()
    await setGoal('lose', 58, 140) // back to the 550 a day the rest of the run was written for (10 kg in 140 days)
    assert.equal(await num(page.getByTestId('eq-movement')), 600) // 1600 x 0.375
    assert.deepEqual(await terms(), ['BMR', 'Movement', 'Exercise', 'Eaten', 'Balance'])
    await page.getByRole('button', { name: /^Edit Big lunch/ }).click()
    await page.fill('input[name=kcal]', '1981')
    await page.getByRole('button', { name: 'Save' }).click()
    // 1600 + 600 + 281 - 1981 = 500
    assert.equal(await num(page.getByTestId('balance')), 500)
    assert.match(await page.getByTestId('equation').getAttribute('aria-label'), /BMR 1,600 plus movement 600 plus exercise 281 minus eaten 1,981 equals balance 500 deficit/)
    await top(page)
    await page.screenshot({ path: OUT + 'v1-mobile-home.png' })
  })
  await step('close day: verdict, locked, counts in History', async () => {
    await page.getByRole('button', { name: 'Close day' }).click()
    await page.waitForURL(`**/day/${TODAY}`)
    assert.equal(await page.getByTestId('verdict-pill').innerText(), 'Day closed')
    assert.equal(await num(page.getByTestId('verdict-number')), 500)
    assert.equal(await page.getByTestId('verdict-text').innerText(), 'kcal deficit')
    assert.equal(await color(page.getByTestId('verdict-number')), GREEN)
    assert.match(await page.getByTestId('verdict-message').innerText(), /You were 50 kcal short of your 550 goal/) // v1.8 goal: 2200 - 1650 (no cap)
    await page.screenshot({ path: OUT + 'v1-mobile-verdict.png' })
    await page.getByRole('button', { name: 'Done' }).click()
    await page.waitForURL(BASE + '/')
    await page.getByTestId('closed-pill').waitFor()
    assert.equal(await page.getByRole('link', { name: 'Add to Lunch' }).count(), 0)
    await page.getByRole('button', { name: 'Log food' }).click()
    await page.getByTestId('day-locked').waitFor()
    // v1.3.4: a closed day hides the Quick add bar on both tabs (not just disabled).
    assert.equal(await page.getByTestId('qa-bar').count(), 0)
    await page.getByRole('button', { name: 'Exercise' }).click()
    await page.getByTestId('day-locked').waitFor()
    assert.equal(await page.getByTestId('qa-bar').count(), 0)
    assert.equal(await page.getByRole('button', { name: /Quick add/ }).count(), 0)
    await page.getByRole('link', { name: /Close and go back/ }).click()
    await page.reload()
    await page.getByTestId('closed-pill').waitFor()
    await page.getByRole('link', { name: 'History' }).click()
    assert.equal(await page.getByTestId('week-total').getAttribute('data-value'), '500')
    const todayRow = page.locator(`[data-day="${TODAY}"]`)
    assert.match(await todayRow.innerText(), /Closed/)
    assert.equal(await todayRow.getByTestId('day-pill').innerText(), 'Deficit 500')
  })
  await step('demo week: up/down bars, weekly total and weight estimate', async () => {
    await page.getByRole('link', { name: 'Me', exact: true }).click()
    await page.locator('[data-testid=developer] summary').click()
    await page.getByRole('button', { name: 'Load demo week' }).click()
    await page.waitForURL('**/history')
    const bars = await page.locator('[data-bar][data-visible=yes]').evaluateAll((els) => els.map((e) => ({ v: Number(e.getAttribute('data-value')), k: e.getAttribute('data-kind') })))
    assert.equal(bars.length, 7)
    assert.ok(bars.filter((b) => b.k === 'surplus').length >= 2, 'surplus days: ' + JSON.stringify(bars))
    assert.ok(bars.filter((b) => b.k === 'deficit').length >= 3)
    const sum = bars.reduce((s, b) => s + b.v, 0)
    assert.equal(Number(await page.getByTestId('week-total').getAttribute('data-value')), sum)
    const kg = (Math.round((sum / 7700) * 10) / 10).toFixed(1)
    assert.equal(await page.getByTestId('est-change').innerText(), `−${kg} kg`)
    assert.match(await page.locator('main').innerText(), /7,700 kcal per kg/)
    const sur = page.getByTestId('day-pill').filter({ hasText: 'Surplus' }).first()
    assert.equal(await color(sur), 'rgb(163, 67, 31)')
    await page.getByRole('button', { name: '30 days' }).click()
    assert.equal(await page.locator('[data-bar][data-visible=yes]').count(), 30)
    await page.getByRole('button', { name: '7 days' }).click()
  })
  await step('reopen today: weekly total drops it, today is faded', async () => {
    const closedTotal = Number(await page.getByTestId('week-total').getAttribute('data-value'))
    await goHome()
    await page.getByRole('button', { name: 'Reopen day' }).click()
    await page.getByRole('button', { name: 'Close day' }).waitFor()
    await page.getByRole('link', { name: 'History' }).click()
    assert.equal(Number(await page.getByTestId('week-total').getAttribute('data-value')), closedTotal - 500)
    assert.match(await page.locator(`[data-day="${TODAY}"]`).innerText(), /Open, so far/)
    await page.screenshot({ path: OUT + 'v1-mobile-history.png' })
  })
  await step('past days auto-close on load', async () => {
    await page.evaluate((y) => {
      const s = JSON.parse(localStorage.getItem('calorie-app:v3'))
      delete s.closedDays[y]
      localStorage.setItem('calorie-app:v3', JSON.stringify(s))
    }, YESTERDAY)
    await page.reload()
    await page.locator(`[data-day="${YESTERDAY}"]`).waitFor()
    assert.match(await page.locator(`[data-day="${YESTERDAY}"]`).innerText(), /Closed/)
    const auto = await page.evaluate((y) => JSON.parse(localStorage.getItem('calorie-app:v3')).closedDays[y]?.auto, YESTERDAY)
    assert.equal(auto, true)
    await page.locator(`[data-day="${YESTERDAY}"] a`).click()
    assert.equal(await page.getByTestId('verdict-pill').innerText(), 'Closed at midnight')
    await page.getByRole('button', { name: 'Done' }).click()
  })
  await step('keyboard: Tab reaches main actions with visible focus', async () => {
    await goHome()
    await page.keyboard.press('Tab')
    const tag = await page.evaluate(() => document.activeElement?.tagName)
    assert.ok(['A', 'BUTTON'].includes(tag), 'focused ' + tag)
  })
  // ---------- v2 macros ----------
  const PINK = 'rgb(194, 51, 106)'
  const addOne = async (q, name) => {
    await page.getByLabel('Search foods').fill(q)
    await page.getByRole('button', { name: new RegExp('Add one serving of ' + name) }).click()
    await page.getByTestId('toast').waitFor()
  }
  await step('v1.3.2 macros: fixed, from maintenance at the current weight (1.6 g/kg protein, fat max(25%, 0.6 g/kg), carbs the rest)', async () => {
    await page.getByRole('link', { name: 'Me', exact: true }).click()
    const ph = (k) => page.locator(`input[name=macro-${k}]`).getAttribute('placeholder')
    assert.equal(await ph('protein'), '109') // 68 kg x 1.6 = 108.8
    // maintenance 1600 + 600 = 2200 (not the 1,650 target): fat 25% = 550 kcal = 61 g; carbs (2200 - 436 - 550) / 4 = 304
    assert.equal(await ph('fat'), '61')
    assert.equal(await ph('carbs'), '304')
    const rule = await sheetText(page, 'macros', 'macro-rule')
    assert.match(rule, /fixed for the day.*maintenance calories, 2,200 kcal \(BMR plus daily movement\).*current weight.*logged exercise never changes them/)
    // Movement off (not saved): maintenance 1600, fat max(400, 367.2) kcal = 44 g, carbs (1600 - 436 - 400) / 4 = 191
    await page.getByRole('switch', { name: /Include daily movement/ }).uncheck()
    assert.equal(await ph('fat'), '44')
    assert.equal(await ph('carbs'), '191')
    assert.match(await sheetText(page, 'macros', 'macro-rule'), /1,600 kcal \(your BMR\)/)
    // A fat override feeds carbs: (2200 - 436 - 70 x 9) / 4 = 283.5 -> 284; the calorie target stays 1,650.
    await page.getByRole('switch', { name: /Include daily movement/ }).check()
    await page.fill('input[name=macro-fat]', '70')
    assert.equal(await ph('carbs'), '284')
    assert.equal(await page.getByTestId('settings-target').innerText(), '1,650 kcal')
    await page.fill('input[name=macro-fat]', '')
    // v1.3.3: there is no goal weight field; protein follows the current weight.
    assert.equal(await page.locator('input[name=goalWeightKg]').count(), 0)
    // v1.13: weight comes from Log weight (not a Me field), and the goal date never moves macros.
    assert.equal(await page.locator('input[name=weightKg]').count(), 0)
    assert.match(await sheetText(page, 'target', 'budget-line'), /− 550 deficit = 1,650 kcal/)
    await goHome()
    assert.equal(await page.getByTestId('protein-left').innerText(), '109 g left')
  })
  await step('v1.3.3 Me: exactly 5 (i) buttons, short helper lines visible, no goal weight; sheets labelled, take focus, close on Escape and Close', async () => {
    await page.getByRole('link', { name: 'Me', exact: true }).click()
    const main = page.locator('main')
    await page.getByText('Your body, goal and daily targets', { exact: true }).waitFor()
    assert.doesNotMatch(await main.innerText(), /Tap \?/)
    // Only short hints are visible: no explanation paragraphs.
    for (const txt of [/Your data lives only in this browser/, /Fat gets 25%/, /Deficits are capped/, /for the calorie formula/, /Sets protein/, /goal weight/i]) assert.doesNotMatch(await main.innerText(), txt)
    assert.equal(await page.getByTestId('budget-line').count(), 0)
    assert.equal(await page.locator('input[name=goalWeightKg]').count(), 0)
    const ids = await page.locator('[data-testid^=info-]').evaluateAll((els) => els.map((e) => e.dataset.testid))
    assert.deepEqual(ids, ['info-activity', 'info-bmr', 'info-target', 'info-macros']) // v1.13: no pace
    assert.equal(await page.getByTestId('info-sex').count() + await page.getByTestId('info-goal').count() + await page.getByTestId('info-backup').count(), 0)
    // Visible helper lines (68 kg woman, BMR 1600, light, Movement on, lose 10 kg in 140 days: 550).
    assert.equal(await page.getByTestId('pace-hint').count(), 0)
    assert.match(await page.getByTestId('goal-summary').innerText(), /^Goal 58 kg by /)
    assert.equal(await page.getByTestId('movement-hint').innerText(), '+600 kcal a day. Leave off if you use a watch.')
    assert.equal(await page.getByTestId('target-sum').innerText(), 'BMR 1,600 + 600 movement − 550 deficit')
    assert.match(await page.getByTestId('bmr-calculated').innerText(), /^Calculated/)
    assert.equal(await page.getByTestId('backup-hint').innerText(), "Stored only in this browser. Import replaces this device's data.")
    assert.equal(await page.getByRole('button', { name: /Gentle|Standard|Faster/ }).count(), 0)
    await page.getByRole('switch', { name: /Include daily movement/ }).uncheck()
    assert.equal(await page.getByTestId('target-sum').innerText(), 'BMR 1,600 − 550 deficit') // the gap stays 550; movement only moves the base
    await page.getByRole('switch', { name: /Include daily movement/ }).check()
    // 20px icon in a 44 x 44 tap area.
    for (const id of ids) {
      const bb = await page.getByTestId(id).boundingBox(), ib = await page.getByTestId(id).locator('svg').boundingBox()
      assert.deepEqual([Math.round(bb.width), Math.round(bb.height), Math.round(ib.width), Math.round(ib.height)], [44, 44, 20, 20], id)
    }
    const btn = page.getByRole('button', { name: 'About macro targets' })
    assert.equal(await btn.getAttribute('aria-expanded'), 'false')
    await btn.click()
    const dlg = page.getByRole('dialog', { name: 'Macro targets' })
    await dlg.waitFor()
    assert.equal(await dlg.getAttribute('aria-modal'), 'true')
    assert.equal(await page.evaluate(() => document.activeElement?.textContent), 'Close')
    assert.match(await dlg.innerText(), /Fat gets 25% of maintenance/)
    await page.keyboard.press('Escape')
    await dlg.waitFor({ state: 'detached' })
    assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('aria-label')), 'About macro targets') // focus back on the (i)
    // Each sheet: content, Close button, focus back.
    for (const [name, title, re] of [['About activity level', 'Activity level', /\+20%[\s\S]*\+90%/], ['About BMR', 'BMR', /Mifflin-St Jeor[\s\S]*type it here/], ['About daily target', 'Daily target', /kg left over the days left[\s\S]*over 1% of your weight a week, or under 1,500 kcal for men or 1,200 for women/]]) {
      await page.getByRole('button', { name }).click()
      const d = page.getByRole('dialog', { name: title })
      assert.match(await d.innerText(), re, title)
      assert.doesNotMatch(await d.innerText(), /body fat/i)
      await d.getByRole('button', { name: 'Close' }).click()
      await page.getByRole('dialog').waitFor({ state: 'detached' })
      assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('aria-label')), name)
    }
    assert.equal(await page.getByTestId('activity-scale').count(), 0) // only inside the sheet
    assert.equal(await page.getByRole('switch', { name: /Include daily movement/ }).isChecked(), true)
    assert.equal(await page.getByLabel('BMR (kcal)').inputValue(), '1600')
    await goHome()
  })
  await step('v2 acceptance: 110 g target, 75 g logged -> 35 g left and 75 of 110 g', async () => {
    await page.getByRole('link', { name: 'Me', exact: true }).click()
    await page.fill('input[name=macro-protein]', '110')
    assert.equal(await page.locator('input[name=macro-carbs]').getAttribute('placeholder'), '303') // maintenance macros: pace never moves them (v1.8: no cap)
    await page.getByRole('button', { name: 'Save changes' }).click()
    await page.getByText('Saved.').waitFor()
    await goHome()
    assert.equal(await page.getByTestId('protein-left').innerText(), '110 g left')
    await page.getByRole('link', { name: 'Add to Dinner' }).click()
    await addOne('ayam bakar', 'Ayam bakar') // 27 g
    await addOne('tempe', 'Tempe goreng') // 5 g
    await addOne('tempe', 'Tempe goreng') // 5 g
    await addOne('boiled egg', 'Boiled egg') // 6 g
    await page.getByRole('link', { name: /Close and go back/ }).click()
    await page.getByRole('button', { name: /^Edit Big lunch/ }).click()
    const dlg = page.getByRole('dialog')
    await dlg.locator('input[name=kcal]').fill('1500') // keeps today in a deficit for the screenshot
    await dlg.getByLabel('Protein').fill('32')
    await dlg.getByLabel('Carbs').fill('60')
    await dlg.getByLabel('Fat').fill('39') // fat total 39 + 14 + 2 x 6 + 5 = 70 g vs 61 g target
    await dlg.getByRole('button', { name: 'Save' }).click()
    assert.equal(await page.getByTestId('protein-left').innerText(), '35 g left')
    // Macro overage: text, not just a full bar, and never orange.
    assert.equal(await page.getByTestId('protein-sub-fat').innerText(), 'Fat 70 g, +9 g over')
    assert.equal(await page.getByTestId('protein-sub-carbs').innerText(), 'Carbs 73 / 303 g')
    const fatOver = page.getByTestId('protein-sub-fat').locator('b')
    assert.equal(await color(fatOver), FAT_INK)
    assert.notEqual(await color(fatOver), ORANGE)
    assert.equal(await color(page.getByTestId('protein-left')), PINK)
    await top(page)
    await page.screenshot({ path: OUT + 'v2-mobile-home-protein.png' })
    await page.getByTestId('protein-card').click()
    await page.waitForURL('**/nutrition')
    assert.equal(await page.getByTestId('protein-progress').innerText(), '75 of 110 g, 68%')
    assert.match(await page.locator('main').innerText(), /35 g to go/)
    // v1.2.1: protein only in the ring (no macro row); the ring label carries the %. Rows keep "+X g over" and add the %.
    assert.equal(await page.getByTestId('nutri-protein').count(), 0)
    assert.equal(await page.getByTestId('protein-ring-label').innerText(), 'of 110 g, 68%')
    assert.match(await page.getByTestId('nutri-fat-text').innerText(), /^70 of 61 g, 115%\s*\+9 g over$/)
    assert.match(await page.getByTestId('nutri-carbs-text').innerText(), /^73 of 303 g, 24%$/)
    assert.match(await page.getByTestId('cal-text').innerText(), /^Eaten [\d,]+ of [\d,]+ kcal, \d+%/)
    const split = (await page.getByTestId('split').getAttribute('data-split')).split('/').map(Number)
    assert.equal(split[0] + split[1] + split[2], 100)
    const src = await page.getByTestId('protein-sources').locator('li').allInnerTexts()
    assert.match(src[0], /Big lunch\s+32 g/)
    assert.match(src[1], /Ayam bakar, 1 thigh\s+27 g/)
    assert.ok(src.some((t) => /Tempe goreng, 2 pieces\s+10 g/.test(t)), src.join('|'))
    assert.equal(await color(page.getByTestId('protein-sources').locator('b').first()), PINK)
    assert.equal(await page.getByTestId('nutri-fat-over').innerText(), '+9 g over')
    assert.equal(await page.getByTestId('nutri-fat').getAttribute('data-over'), '9')
    assert.equal(await color(page.getByTestId('nutri-fat-over')), FAT_INK)
    assert.match(await page.getByTestId('nutri-fat').getByRole('progressbar').getAttribute('aria-label'), /9 grams over/)
    assert.equal(await page.getByTestId('nutri-carbs-over').count(), 0)
    assert.equal(await page.getByTestId('protein-over').count(), 0)
    await page.screenshot({ path: OUT + 'v2-mobile-nutrition.png' })
    await page.getByRole('button', { name: 'This week' }).click()
    assert.match(await page.getByTestId('protein-progress').innerText(), /of 110 g/)
    await page.reload()
    assert.equal(await page.getByTestId('protein-progress').innerText(), '75 of 110 g, 68%')
  })
  await step('v2: History protein view, target line, X of 7 days, daily average', async () => {
    await page.getByRole('link', { name: 'History', exact: true }).click()
    await page.getByRole('button', { name: 'Protein' }).click()
    const bars = await page.locator('[data-pbar][data-visible=yes]').evaluateAll((els) => els.map((e) => ({ v: Number(e.getAttribute('data-value')), hit: e.getAttribute('data-hit') })))
    assert.equal(bars.length, 7)
    assert.equal(bars[6].v, 75)
    const hits = bars.filter((b) => b.hit === 'yes').length
    assert.equal(bars.filter((b) => b.v >= 110).length, hits)
    assert.ok(hits >= 1 && hits <= 6, 'demo week should mix hit and missed days')
    assert.equal(await page.getByTestId('protein-hit').innerText(), `${hits} / 7`)
    const avg = Math.round(bars.reduce((s, b) => s + b.v, 0) / 7)
    assert.ok(Math.abs(Number((await page.getByTestId('protein-avg').innerText()).replace(/\D/g, '')) - avg) <= 1)
    assert.equal(await color(page.getByTestId('protein-hit')), PINK)
    await page.screenshot({ path: OUT + 'v2-mobile-history-protein.png' })
    await page.getByRole('button', { name: 'Balance' }).click()
    await page.getByTestId('chart').waitFor()
  })
  await step('v2: orange only means surplus (no orange outside surplus)', async () => {
    await page.getByRole('link', { name: 'Me', exact: true }).click()
    assert.notEqual(await color(page.getByRole('button', { name: 'Reset all data' })), ORANGE)
  })
  await step('v2: protein over target says how far over, in darker pink', async () => {
    await goHome()
    await page.getByRole('button', { name: /^Edit Big lunch/ }).click()
    await page.getByRole('dialog').getByLabel('Protein').fill('72') // 115 g total
    await page.getByRole('dialog').getByRole('button', { name: 'Save' }).click()
    assert.equal(await page.getByTestId('protein-left').innerText(), '+5 g over')
    assert.match(await page.getByTestId('protein-card').innerText(), /Protein target hit/)
    assert.notEqual(await color(page.getByTestId('protein-left')), ORANGE)
    await page.getByTestId('protein-card').click()
    assert.equal(await page.getByTestId('protein-over').innerText(), '+5 g over')
    assert.match(await page.getByTestId('protein-progress').innerText(), /^115 of 110 g, 105%$/) // % kept when over
    assert.equal(await page.getByTestId('protein-ring-label').innerText(), 'of 110 g, 105%')
    assert.equal(await page.getByTestId('protein-ring-over').count(), 1)
    await goHome()
    await page.getByRole('button', { name: /^Edit Big lunch/ }).click()
    await page.getByRole('dialog').getByLabel('Protein').fill('32')
    await page.getByRole('dialog').getByRole('button', { name: 'Save' }).click()
    assert.equal(await page.getByTestId('protein-left').innerText(), '35 g left')
  })
  const storage = await ctx.storageState()

  // ---------- Desktop 1440 (phone frame) ----------
  const d = await browser.newContext({ viewport: { width: 1440, height: 900 }, storageState: storage, reducedMotion: 'reduce' })
  const dp = await d.newPage(); watch(dp)
  await step('desktop v1 screenshots in phone frame', async () => {
    await dp.goto(BASE + '/')
    const box = await dp.locator('#root > div > div').boundingBox()
    assert.equal(Math.round(box.width), 390)
    await top(dp)
    await dp.screenshot({ path: OUT + 'v1-desktop-home.png' })
    await dp.goto(BASE + '/log?mode=exercise')
    await dp.getByRole('button', { name: 'Badminton' }).click()
    await dp.screenshot({ path: OUT + 'v1-desktop-log-exercise.png' })
    await dp.goto(BASE + `/day/${YESTERDAY}`)
    await dp.getByTestId('verdict-number').waitFor()
    await dp.screenshot({ path: OUT + 'v1-desktop-verdict.png' })
    await dp.goto(BASE + '/history')
    await dp.getByTestId('chart').waitFor()
    await dp.screenshot({ path: OUT + 'v1-desktop-history.png' })
  })
  await step('desktop v2 screenshots in phone frame', async () => {
    await dp.goto(BASE + '/')
    await dp.getByTestId('protein-card').waitFor()
    await dp.screenshot({ path: OUT + 'v2-desktop-home-protein.png' })
    await dp.goto(BASE + '/nutrition')
    await dp.getByTestId('protein-progress').waitFor()
    await dp.screenshot({ path: OUT + 'v2-desktop-nutrition.png' })
    await dp.goto(BASE + '/history')
    await dp.getByRole('button', { name: 'Protein' }).click()
    await dp.getByTestId('protein-chart').waitFor()
    await dp.screenshot({ path: OUT + 'v2-desktop-history-protein.png' })
  })
  // ---------- v1.1: migration of a 1.0 profile, symmetric chart, + button in the safe area ----------
  const seedV1 = async (pg) => {
    await pg.goto(BASE + '/')
    await pg.evaluate((s) => { localStorage.clear(); localStorage.setItem('calorie-app:v1', JSON.stringify(s)); localStorage.setItem('calorie-app:backup', JSON.stringify({ lastExportAt: Date.now(), dismissedAt: null })) }, V1_STATE)
    await pg.goto(BASE + '/')
    await pg.getByTestId('balance').waitFor()
  }
  const mctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, reducedMotion: 'reduce' })
  const mp = await mctx.newPage(); watch(mp)
  await step('v1.1 + v1.13 migration: a 1.0 profile keeps Movement and its 550, gets goal 55 kg in 182 days, logs untouched', async () => {
    await seedV1(mp)
    const st = await mp.evaluate(() => ({ v2: JSON.parse(localStorage.getItem('calorie-app:v3')), v1: JSON.parse(localStorage.getItem('calorie-app:v1')) }))
    assert.equal(st.v2.version, 3)
    assert.deepEqual([st.v2.profile.includeMovement, st.v2.profile.goalWeightKg, st.v2.profile.goalDate, 'pace' in st.v2.profile, st.v2.profile.goalAssumed, st.v2.profile.bmr], [true, 55, addDaysKey(TODAY, 182), false, true, 1600])
    assert.deepEqual(st.v2.entries, V1_STATE.entries)
    assert.deepEqual(st.v2.closedDays, V1_STATE.closedDays)
    assert.deepEqual(st.v1, V1_STATE) // the 1.0 copy is left alone for an old cached app
    assert.equal(await num(mp.getByTestId('eq-movement')), 600)
    assert.match(await mp.getByTestId('ring-goal').innerText(), /goal 550/)
    await mp.goto(BASE + '/nutrition')
    assert.match(await mp.getByTestId('targets-hint').innerText(), /maintenance, 2,200 kcal \(BMR plus movement\), at your current weight of 68 kg/)
    assert.doesNotMatch(await mp.locator('main').innerText(), /goal weight/) // v1.3.2: no goal-weight nudge
    await mp.goto(BASE + '/settings')
    assert.equal(await mp.locator('input[name=goalWeightKg]').count(), 0) // v1.3.3: the stored value stays, the field is gone
    assert.match(await mp.getByTestId('goal-summary').innerText(), /^Goal 55 kg by /)
    assert.equal(await mp.getByTestId('goal-assumed').innerText(), 'We set this from your old pace. Tap Edit to pick your own goal weight and date.') // v1.13.1: no 'same daily target'
    assert.equal(await mp.getByRole('switch', { name: /Include daily movement/ }).isChecked(), true)
  })
  await step('v1.4.1 chart: lopsided fixed scale fits the +2,500 spike, nothing clipped, every bar labelled', async () => {
    await mp.goto(BASE + '/history')
    const svg = mp.getByTestId('chart')
    // top = 2,500 + 10% -> 2,750; bottom (v1.4.2) = biggest surplus 420 + 10% -> 500.
    assert.deepEqual([await svg.getAttribute('data-top'), await svg.getAttribute('data-bottom')], ['2750', '500'])
    const refs = await mp.locator('[data-ref]').evaluateAll((els) => els.map((e) => e.getAttribute('data-ref')))
    assert.deepEqual(refs, ['0', '550'], 'v1.4.2: no mirrored -goal line')
    const labels = await mp.getByTestId('chart').locator('text').allTextContents()
    for (const l of ['goal 550', '0']) assert.ok(labels.includes(l), `label ${l} in ${labels}`)
    for (const l of ['+550', '−550']) assert.ok(!labels.includes(l), `no ${l} label`)
    await mp.waitForTimeout(900)
    const g = await geometry(mp)
    const spike = g.bars.find((b) => b.v === 2500)
    assert.equal(spike.over, 'no')
    // Today is open at 2200 - 975 = 1225 so far: drawn to scale, not clipped.
    assert.equal(g.bars.find((b) => b.v === 1225).over, 'no')
    assert.equal(await mp.locator('[data-cap]').count(), 0)
  })
  for (const [w, h, inset] of [[375, 667, 0], [390, 844, 34]]) {
    await step(`v1.1 + button fully visible and tappable at ${w}x${h}${inset ? ' (safe-area bottom 34, as in the iOS PWA)' : ''}`, async () => {
      const c = await browser.newContext({ viewport: { width: w, height: h }, isMobile: true, hasTouch: true, reducedMotion: 'reduce' })
      const pg = await c.newPage(); watch(pg)
      await seedV1(pg)
      if (inset) {
        const cdp = await c.newCDPSession(pg)
        await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: { top: 47, bottom: inset, left: 0, right: 0 } })
        // Headless Chromium ignores a display-mode override, and under 768 px the layout has no display-mode
        // rules (only the desktop phone frame does), so the installed PWA lays out exactly like this tab.
        await pg.waitForTimeout(100)
      }
      const plus = pg.getByTestId('plus')
      const b = await plus.boundingBox()
      assert.ok(b.y >= 0 && b.y + b.height <= h - inset, `+ at ${b.y}-${b.y + b.height}, limit ${h - inset}`)
      const hits = await plus.evaluate((el, pts) => pts.map(([x, y]) => el.contains(document.elementFromPoint(x, y))), [[b.x + b.width / 2, b.y + 3], [b.x + b.width / 2, b.y + b.height - 3], [b.x + 3, b.y + b.height / 2], [b.x + b.width - 3, b.y + b.height / 2]])
      assert.deepEqual(hits, [true, true, true, true]) // nothing covers any edge
      const nav = await pg.locator('nav').boundingBox()
      assert.ok(nav.y + nav.height <= h + 0.5, 'nav inside the viewport')
      assert.equal(await pg.locator('nav').evaluate((el) => getComputedStyle(el).paddingBottom), inset ? `${inset}px` : '12px')
      await plus.tap()
      await pg.waitForURL('**/log**')
      await c.close()
    })
  }
  await mctx.close()

  // ---------- v1.2: calories card, macro %, split bar ----------
  const nctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, reducedMotion: 'reduce' })
  const np = await nctx.newPage(); watch(np)
  const seedWith = async (todayEntries) => {
    const s = { ...V1_STATE, entries: [...V1_STATE.entries.filter((x) => x.date !== TODAY), ...todayEntries] }
    await np.goto(BASE + '/')
    await np.evaluate((st) => { localStorage.clear(); localStorage.setItem('calorie-app:v1', JSON.stringify(st)); localStorage.setItem('calorie-app:backup', JSON.stringify({ lastExportAt: Date.now(), dismissedAt: null })) }, s)
    await np.goto(BASE + '/nutrition')
    await np.getByTestId('cal-card').waitFor()
  }
  const food = (id, kcal, protein, carbs, fat) => ({ id, date: TODAY, meal: 'lunch', foodId: null, name: 'Test ' + id, servingLabel: '1 serving', servingMult: 1, qty: 1, kcal, protein, carbs, fat, createdAt: Date.now() })
  const bg = (loc) => loc.evaluate((el) => getComputedStyle(el).backgroundColor)
  await step('v1.2 empty state: calories card at 0%, grey split bar "Log food to see your split"', async () => {
    await seedWith([])
    assert.equal(await np.getByTestId('cal-text').innerText(), 'Eaten 0 of 1,650 kcal, 0%')
    assert.equal(await np.getByTestId('cal-over').count(), 0)
    assert.equal(await np.getByTestId('split-empty').innerText(), 'Log food to see your split')
    assert.equal(await np.getByTestId('split-empty').getAttribute('role'), 'img')
    assert.equal(await np.getByTestId('split').getAttribute('data-split'), null)
    assert.equal(await np.getByTestId('nutri-carbs-text').innerText(), '0 of 304 g, 0%')
    // The calories card sits above everything else on Nutrition.
    const first = await np.locator('main [data-testid]').first().getAttribute('data-testid')
    assert.equal(first, 'cal-card')
  })
  await step('v1.2 acceptance: 100 g P, 100 g C, 89 g F -> split 25 / 25 / 50, with target ticks', async () => {
    await seedWith([food('a', 1601, 100, 100, 89)])
    const sp = np.getByTestId('split')
    assert.equal(await sp.getAttribute('data-split'), '25/25/50')
    assert.deepEqual(await Promise.all(['protein', 'carbs', 'fat'].map((k) => np.getByTestId(`split-${k}-pct`).innerText())), ['25%', '25%', '50%'])
    // Target split from 109 / 304 / 61 g: 436 + 1216 + 549 kcal (= maintenance 2,200) -> 20 / 55 / 25.
    assert.equal(await sp.getAttribute('data-target'), '20/55/25')
    assert.equal(await np.getByTestId('split-mark').count(), 2)
    assert.equal(await sp.getByRole('img').getAttribute('aria-label'), 'Calories split: protein 25%, carbs 25%, fat 50%. Target protein 20%, carbs 55%, fat 25%.')
    assert.deepEqual(await Promise.all(['protein', 'carbs', 'fat'].map((k) => bg(np.getByTestId(`split-${k}`)))), ['rgb(200, 69, 111)', 'rgb(217, 164, 58)', 'rgb(79, 127, 214)']) // v1.3 palette: #C8456F, #D9A43A, #4F7FD6
    assert.equal(await np.getByTestId('cal-text').innerText(), 'Eaten 1,601 of 1,650 kcal, 97%')
    assert.equal(await np.getByTestId('protein-progress').innerText(), '100 of 109 g, 92%')
    assert.equal(await np.getByTestId('protein-ring-label').innerText(), 'of 109 g, 92%')
    assert.equal(await np.getByTestId('nutri-protein').count(), 0) // v1.2.1: no protein row, the split bar still has protein
    assert.match(await np.getByTestId('nutri-fat-text').innerText(), /^89 of 61 g, 146%\s*\+28 g over$/)
    assert.match(await np.getByTestId('nutri-fat').getByRole('progressbar').getAttribute('aria-label'), /89 of 61 grams, 146%, 28 grams over/)
    await np.screenshot({ path: OUT + 'v12-e2e-nutrition-split.png' })
  })
  await step('v1.2 calories over target: % plus "+N kcal over" in darker grey, never orange', async () => {
    await seedWith([food('a', 1601, 100, 100, 89), food('b', 400, 0, 100, 0)])
    assert.equal(await np.getByTestId('cal-text').innerText(), 'Eaten 2,001 of 1,650 kcal, 121% +351 kcal over')
    const over = np.getByTestId('cal-over')
    assert.equal(await color(over), 'rgb(69, 66, 60)')
    assert.notEqual(await color(over), ORANGE)
    const fills = await np.getByTestId('cal-card').locator('i').evaluateAll((els) => els.map((e) => getComputedStyle(e).backgroundColor))
    assert.ok(!fills.includes('rgb(229, 112, 75)') && !fills.includes(ORANGE) && !fills.includes('rgb(217, 102, 63)'), fills.join())
    assert.equal(await np.getByTestId('cal-card').getAttribute('data-over'), '351')
    assert.match(await np.getByTestId('cal-card').getByRole('progressbar').getAttribute('aria-label'), /2,001 of 1,650 kcal, 121%, 351 kcal over/)
    // Exercise raises today's food target, as on Today (target + burned - eaten = left). v1.3.2: macro goals stay put.
    const macroText = () => Promise.all(['protein-progress', 'nutri-carbs-text', 'nutri-fat-text'].map((k) => np.getByTestId(k).innerText()))
    const splitTarget = () => np.getByTestId('split').getAttribute('data-target')
    const before = [await macroText(), await splitTarget()]
    await np.evaluate((t) => { const s = JSON.parse(localStorage.getItem('calorie-app:v3')); s.exercises.push({ id: 'x1', date: t, activityId: null, name: 'Run', minutes: 30, intensity: 'moderate', kcal: 300, createdAt: Date.now() }); localStorage.setItem('calorie-app:v3', JSON.stringify(s)) }, TODAY)
    await np.reload()
    assert.equal(await np.getByTestId('cal-text').innerText(), 'Eaten 2,001 of 1,950 kcal, 103% +51 kcal over')
    assert.match(await np.getByTestId('cal-note').innerText(), /includes 300 kcal of exercise, as on Today\. Macro goals stay the same\./)
    assert.deepEqual([await macroText(), await splitTarget()], before)
    assert.match((await macroText())[1], /of 304 g/)
    await np.goto(BASE + '/')
    assert.equal(await np.getByTestId('protein-left').innerText(), '9 g left') // Home: same fixed 109 g target
    await np.goto(BASE + '/nutrition')
  })
  await step('v1.3.2 Movement off: Nutrition uses the 1,050 target (v1.13: no floor) with maintenance macros P109 / C191 / F44; carbs under 100 g only hint', async () => {
    await np.goto(BASE + '/settings')
    await np.getByRole('switch', { name: /Include daily movement/ }).uncheck()
    await np.fill('input[name=macro-carbs]', '60')
    assert.match(await np.getByTestId('carbs-low-hint').innerText(), /Below the 100 g we suggest/)
    assert.equal(await color(np.getByTestId('carbs-low-hint')), 'rgb(107, 103, 95)') // neutral mute grey
    assert.equal(await np.getByRole('button', { name: 'Save changes' }).isDisabled(), false)
    await np.fill('input[name=macro-carbs]', '120')
    assert.equal(await np.getByTestId('carbs-low-hint').count(), 0)
    await np.fill('input[name=macro-carbs]', '')
    await np.getByRole('button', { name: 'Save changes' }).click()
    await np.getByText('Saved.').waitFor()
    await np.goto(BASE + '/nutrition')
    assert.match(await np.getByTestId('cal-text').innerText(), /of 1,350 kcal/) // 1600 - 550 + 300 exercise (v1.13: no 1,200 floor)
    assert.match(await np.getByTestId('protein-progress').innerText(), /of 109 g/)
    assert.match(await np.getByTestId('nutri-carbs-text').innerText(), /of 191 g/)
    assert.match(await np.getByTestId('nutri-fat-text').innerText(), /of 44 g/)
    assert.match(await np.getByTestId('targets-hint').innerText(), /maintenance, 1,600 kcal \(your BMR\).*don't add up to your calorie target and logged exercise doesn't change them/)
    // A typed 60 g carbs is kept as typed.
    await np.goto(BASE + '/settings')
    await np.fill('input[name=macro-carbs]', '60')
    await np.getByRole('button', { name: 'Save changes' }).click()
    await np.getByText('Saved.').waitFor()
    await np.goto(BASE + '/nutrition')
    assert.match(await np.getByTestId('nutri-carbs-text').innerText(), /of 60 g/)
  })
  await step('v1.3.1 Movement off: Home, Verdict, History use plain BMR and the same 550 goal (v1.13); closed days keep their numbers', async () => {
    // Today here: 2,001 kcal eaten, 300 kcal run. v1.3.1 BMR 1600 + 300 - 2001 = -101 (a surplus).
    await np.goto(BASE + '/')
    const eq = np.getByTestId('equation')
    const termsOf = () => eq.locator('[data-term]').evaluateAll((els) => els.map((e) => e.getAttribute('data-term')))
    assert.deepEqual(await termsOf(), ['BMR', 'Exercise', 'Eaten', 'Balance'])
    assert.equal(await num(np.getByTestId('eq-bmr')), 1600)
    assert.equal(await np.getByTestId('eq-base').count(), 0)
    assert.equal(await num(np.getByTestId('balance')), 101)
    assert.equal(await np.getByTestId('eq-balance').innerText(), '−101')
    assert.match(await np.getByTestId('ring-goal').innerText(), /goal 550/) // v1.13: the goal gap is the same with movement off
    assert.doesNotMatch(await np.locator('main').innerText(), /Base burn|× 1\.2/)
    assert.equal(await np.getByTestId('goal-progress').innerText(), '651 kcal to go to your 550 goal.') // 550 - (-101)
    await top(np)
    await np.screenshot({ path: OUT + 'v131-e2e-home-movement-off.png' })
    // Older closed days keep what they were closed with: one from v1.2 (BMR only, goal 64) and one from v1.3 (base burn 1920, goal 384).
    const OLD = addDaysKey(TODAY, -2)
    const LEGACY = addDaysKey(TODAY, -3)
    await np.evaluate(([d, l]) => {
      const s = JSON.parse(localStorage.getItem('calorie-app:v3'))
      s.closedDays[d] = { bmr: 1600, movement: 0, burned: 0, eaten: 1500, balance: 100, goal: 64, protein: 50, closedAt: 1, auto: false }
      s.closedDays[l] = { bmr: 1600, movement: 0, baseBurn: 1920, burned: 0, eaten: 1500, balance: 420, goal: 384, protein: 60, closedAt: 2, auto: false }
      localStorage.setItem('calorie-app:v3', JSON.stringify(s))
    }, [OLD, LEGACY])
    await np.reload(); await np.getByTestId('balance').waitFor() // the app keeps state in memory, so load the seeded days
    await np.getByRole('button', { name: 'Close day' }).click()
    await np.waitForURL(`**/day/${TODAY}`)
    assert.equal(await num(np.getByTestId('verdict-number')), 101)
    assert.equal(await num(np.getByTestId('verdict-bmr')), 1600)
    assert.equal(await np.getByTestId('verdict-base').count(), 0)
    assert.doesNotMatch(await np.locator('main').innerText(), /× 1\.2/)
    assert.equal(await np.getByTestId('verdict-message').innerText(), 'You were 651 kcal short of your 550 goal.')
    const closed = await np.evaluate((d) => JSON.parse(localStorage.getItem('calorie-app:v3')).closedDays[d], TODAY)
    assert.deepEqual([closed.baseBurn, closed.bmr, closed.movement, closed.balance, closed.goal], [undefined, 1600, 0, -101, 550])
    await np.goto(BASE + '/history')
    assert.equal(await np.locator(`[data-day="${TODAY}"]`).getByTestId('day-pill').innerText(), 'Surplus 101')
    assert.equal(await np.locator(`[data-bar="${TODAY}"]`).getAttribute('data-value'), '-101')
    const labels = await np.getByTestId('chart').locator('text').allTextContents()
    assert.ok(labels.includes('goal 550'), `goal label in ${labels}`); assert.ok(!labels.includes('−550'), 'v1.4.2: no -goal label')
    assert.equal(await np.locator(`[data-day="${OLD}"]`).getByTestId('day-pill').innerText(), 'Deficit 100')
    assert.equal(await np.locator(`[data-day="${LEGACY}"]`).getByTestId('day-pill').innerText(), 'Deficit 420')
    await np.goto(BASE + `/day/${OLD}`)
    assert.equal(await num(np.getByTestId('verdict-bmr')), 1600)
    assert.equal(await np.getByTestId('verdict-base').count(), 0)
    assert.match(await np.getByTestId('verdict-message').innerText(), /your 64 goal/) // closed with 64, kept
    await np.goto(BASE + `/day/${LEGACY}`)
    assert.equal(await num(np.getByTestId('verdict-base')), 1920) // closed under v1.3 with BMR x 1.2: not recomputed
    assert.equal(await num(np.getByTestId('verdict-number')), 420)
    assert.match(await np.locator('main').innerText(), /Burn \(BMR 1,600 × 1\.2, as closed\)/)
    assert.match(await np.getByTestId('verdict-message').innerText(), /your 384 goal/)
    // Movement back on: the goal stays 550, and today's closed day keeps BMR 1600 with no movement.
    await np.goto(BASE + '/settings')
    await np.getByRole('switch', { name: /Include daily movement/ }).check()
    await np.getByRole('button', { name: 'Save changes' }).click()
    await np.getByText('Saved.').waitFor()
    await np.goto(BASE + `/day/${TODAY}`)
    assert.equal(await num(np.getByTestId('verdict-bmr')), 1600)
    assert.match(await np.getByTestId('verdict-message').innerText(), /550/)
    await np.goto(BASE + '/')
    assert.deepEqual(await termsOf(), ['BMR', 'Exercise', 'Eaten', 'Balance']) // closed day, frozen (movement 0)
    await np.getByRole('button', { name: 'Reopen day' }).click()
    assert.deepEqual(await termsOf(), ['BMR', 'Movement', 'Exercise', 'Eaten', 'Balance'])
    assert.equal(await num(np.getByTestId('balance')), 499) // 1600 + 600 + 300 - 2001, unchanged v1.1 maths
    assert.match(await np.getByTestId('ring-goal').innerText(), /goal 550/)
  })
  await nctx.close()

  // ---------- v1.3.2: Lose goal at the floor ----------
  const fctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, reducedMotion: 'reduce' })
  const fp = await fctx.newPage(); watch(fp)
  const seedProfile = async (x) => {
    const st = { ...V1_STATE, entries: V1_STATE.entries.filter((e) => e.date !== TODAY), profile: { ...V1_STATE.profile, includeMovement: false, ...x } }
    await fp.goto(BASE + '/')
    await fp.evaluate((s) => { localStorage.clear(); localStorage.setItem('calorie-app:v1', JSON.stringify(s)); localStorage.setItem('calorie-app:backup', JSON.stringify({ lastExportAt: Date.now(), dismissedAt: null })) }, st)
    await fp.goto(BASE + '/')
    await fp.getByTestId('balance').waitFor()
  }
  // A plan picked in v1.13 (13 kg by a date 182 days out: 13 x 7700 / 182 = 550 a day). v1.13.1: upgraded v1.12 plans get the same no-floor math (below).
  const PLAN = { weightKg: 68, goalWeightKg: 55, goalDate: addDaysKey(TODAY, 182), planFrom: { date: TODAY, kg: 68 } }
  await step('v1.13.1 upgrade has no floor: a v1.12 target held at 1,500 (man, BMR 1600, movement off) -> 1,050, goal 550, soft warning', async () => {
    await seedProfile({ sex: 'male', bmr: 1600, goalWeightKg: 55 })
    assert.equal(await fp.getByTestId('ring-goal').innerText(), 'goal 550')
    const prof = await fp.evaluate(() => JSON.parse(localStorage.getItem('calorie-app:v3')).profile)
    assert.deepEqual([prof.target, prof.dailyGoal, prof.goalAssumed, prof.goalAssumedV, prof.goalWeightKg, prof.goalDate], [1050, 550, true, 2, 55, addDaysKey(TODAY, 182)])
    assert.ok(await fp.evaluate(() => localStorage.getItem('calorie-app:v1') !== null), 'old key kept as a backup')
    await fp.goto(BASE + '/settings')
    assert.equal(await fp.getByTestId('settings-target').innerText(), '1,050 kcal')
    assert.match(await fp.getByTestId('push-prompt').innerText(), /Push goal date to/) // the same soft warning as a new plan
  })
  await step('v1.13 no floor, Lose: man, BMR 1600, movement off -> target 1,050, goal 550, soft warning with a later date', async () => {
    await seedProfile({ sex: 'male', bmr: 1600, ...PLAN })
    assert.equal(await fp.getByTestId('ring-goal').innerText(), 'goal 550')
    assert.equal(await fp.getByTestId('minimum-hint').count(), 0)
    assert.doesNotMatch(await fp.getByTestId('goal-progress').innerText(), /minimum intake/)
    await fp.goto(BASE + '/settings')
    assert.equal(await fp.getByTestId('settings-target').innerText(), '1,050 kcal')
    assert.equal(await fp.getByTestId('target-sum').innerText(), 'BMR 1,600 − 550 deficit')
    assert.match(await sheetText(fp, 'target', 'plan-line'), /With movement off the plan starts from your BMR/)
    // 13 kg x 7700 / (1600 - 1500) = 1001 days clears the 1,500 line.
    assert.match(await fp.getByTestId('push-prompt').innerText(), /Push goal date to/)
    await fp.getByTestId('push-date').click()
    assert.equal(await fp.getByTestId('push-prompt').count(), 0)
    assert.equal(await fp.evaluate(() => JSON.parse(localStorage.getItem('calorie-app:v3')).profile.goalDate), addDaysKey(TODAY, 1001))
    assert.equal(await fp.getByTestId('settings-target').innerText(), '1,500 kcal')
  })
  for (const sex of ['female', 'male']) {
    await step(`v1.13 no floor, Lose: ${sex}, BMR 1200, movement off -> target 650, goal 550, a warning with no date to try`, async () => {
      await seedProfile({ sex, bmr: 1200, ...PLAN })
      assert.equal(await fp.getByTestId('ring-goal').innerText(), 'goal 550')
      assert.equal(await fp.getByTestId('minimum-hint').count(), 0)
      assert.equal(await fp.evaluate(() => JSON.parse(localStorage.getItem('calorie-app:v3')).profile.dailyGoal), 550)
      await fp.goto(BASE + '/settings')
      assert.equal(await fp.getByTestId('settings-target').innerText(), '650 kcal')
      assert.equal(await fp.getByTestId('push-prompt').count(), 0)
      assert.match(await fp.getByTestId('pace-warning').innerText(), new RegExp(`under ${sex === 'male' ? '1,500' : '1,200'} kcal a day[\\s\\S]*a later date can't lift the target`))
      if (sex === 'male') await fp.getByTestId('pace-warning').screenshot({ path: OUT + 'v113-e2e-me-no-date.png' })
    })
  }
  await step('v1.13 Keep: man, BMR 1200, movement off -> target 1,200, goal even, no warning', async () => {
    await seedProfile({ sex: 'male', bmr: 1200, goal: 'keep' })
    assert.equal(await fp.getByTestId('ring-goal').innerText(), 'goal: even')
    assert.doesNotMatch(await fp.getByTestId('ring').innerText(), /surplus|minimum/i)
    const prof = await fp.evaluate(() => JSON.parse(localStorage.getItem('calorie-app:v3')).profile)
    assert.deepEqual([prof.target, prof.dailyGoal, prof.goalDate], [1200, 0, null])
    await fp.goto(BASE + '/settings')
    assert.equal(await fp.getByTestId('settings-target').innerText(), '1,200 kcal')
    assert.equal(await fp.getByTestId('target-sum').innerText(), 'BMR 1,200')
    assert.equal(await fp.getByTestId('pace-warning').count() + await fp.getByTestId('push-prompt').count(), 0)
    assert.equal(await fp.getByTestId('goal-summary').innerText(), 'Goal: keep your weight')
  })
  await fctx.close()
  await step('v1.4 History chart: 7-day average line, hold to scrub, swipe paging, today edge, vertical scroll, haptics, 30 days', async () => {
    const c = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
    const pg = await c.newPage(); watch(pg)
    const out = await chartChecks(pg, c, BASE)
    results.push('  ' + JSON.stringify(out))
    await c.close()
  })
  await step('v1.4.1 History chart: Jordy week to scale (3,232 vs 1,559), labels on every bar, surplus week, 30 days, open day past the scale', async () => {
    const c = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
    const pg = await c.newPage(); watch(pg)
    results.push('  ' + JSON.stringify(await v141Checks(pg, c, BASE)))
    await c.close()
  })
  await step('v1.4 History chart, reduced motion: no entry animation, instant snap', async () => {
    const c = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce' })
    const pg = await c.newPage(); watch(pg)
    await reducedMotionChecks(pg, c, BASE)
    await c.close()
  })
  await step('v1.4.2 History: goal line only (no -goal), Protein chart (pink labelled bars, solid/light, target line, average), scrub, swipe, shared period, scale never clips', async () => {
    const c = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
    const pg = await c.newPage(); watch(pg)
    results.push('  ' + JSON.stringify(await v142Checks(pg, c, BASE)))
    await c.close()
    const c2 = await browser.newContext({ viewport: { width: 375, height: 667 }, isMobile: true, hasTouch: true })
    const pg2 = await c2.newPage(); watch(pg2)
    results.push('  375x667 ' + JSON.stringify(await v142Checks(pg2, c2, BASE)))
    await c2.close()
  })
  await step('v1.4.2 Protein chart, reduced motion: no entry animation, instant snap', async () => {
    const c = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce' })
    const pg = await c.newPage(); watch(pg)
    await v142ReducedMotion(pg, c, BASE)
    await c.close()
  })
  await step('no console errors or warnings', async () => {
    assert.deepEqual(errors, [])
  })
} finally {
  await browser.close()
  console.log(results.join('\n'))
  if (errors.length) console.log('Console:', errors)
}
