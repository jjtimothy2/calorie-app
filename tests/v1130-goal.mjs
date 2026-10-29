// v1.13 goal plan, part 2: "1 month" as a By when choice (onboarding and the Me goal sheet, order 1 month, 3 months,
// 6 months, 1 year, Custom; a 1-month loss date usually warns, never blocks) and the All weigh-ins list (from the weight
// card's See all): swipe left to show Delete, an Edit mode with Delete on every row, an Undo toast. Deleting the latest
// weigh-in sets the weight back to the one before and re-plans; an older one only changes the trend; deleting the only
// one keeps the weight and the log stays empty after a reload.
// Part 3: the weekly nudge on Today (7 days, dismissible), Log weight (one a day, re-plan = kg left x 7,700 / days
// left), ahead / behind with the push-date offer, goal reached (Switch to Keep / Set a new goal) at 390x844 and 375x667.
// WebKit with touch at 390x844. Screenshots: screenshots/v113-*.png.
// Usage: npm run build && npx vite preview --port 4174 & node tests/v1130-goal.mjs
import { webkit, devices } from 'playwright'
import assert from 'node:assert/strict'

const BASE = (process.env.BASE_URL ?? 'http://localhost:4174/calorie-app').replace(/\/$/, '')
const OUT = new URL('../screenshots/', import.meta.url).pathname
const results = [], errors = []
const step = async (name, fn) => {
  const t = Date.now()
  try { await fn(); results.push(`PASS ${name} (${Date.now() - t} ms)`) } catch (e) { results.push(`FAIL ${name}: ${e.message}`); console.log(results.join('\n')); throw e }
}
const pad = (n) => String(n).padStart(2, '0')
const key = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const TODAY = key(new Date())
const addDaysKey = (k, n) => { const [y, m, d] = k.split('-').map(Number); return key(new Date(y, m - 1, d + n)) }
const addMonthsKey = (k, n) => { const [y, m, d] = k.split('-').map(Number); const last = new Date(y, m - 1 + n + 1, 0).getDate(); return key(new Date(y, m - 1 + n, Math.min(d, last))) }
const stored = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('calorie-app:v3')))
const ORDER = ['by-1m', 'by-3m', 'by-6m', 'by-1y', 'by-custom']
const order = (page) => page.locator('[data-testid^=by-]:not([data-testid=by-when]):not([data-testid=by-date])').evaluateAll((els) => els.map((e) => e.dataset.testid))

const browser = await webkit.launch()
const newPage = async (state) => {
  const ctx = await browser.newContext({ ...devices['iPhone 14'], viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, serviceWorkers: 'block' })
  if (state) await ctx.addInitScript((s) => { if (!localStorage.getItem('calorie-app:v3')) { localStorage.setItem('calorie-app:v3', s); localStorage.setItem('calorie-app:backup', JSON.stringify({ lastExportAt: Date.now() })) } }, JSON.stringify(state))
  const page = await ctx.newPage()
  page.on('console', (m) => { if ((m.type() === 'error' || m.type() === 'warning') && !/Service Worker registration blocked/.test(m.text())) errors.push(`${m.type()}: ${m.text()}`) })
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
  return page
}

// ---------- 1 month ----------
{
  const page = await newPage(null)
  await step('onboarding: By when offers 1 month first; 4 kg in 1 month is not safe, Use safer date then Continue', async () => {
    await page.goto(BASE + '/')
    await page.getByTestId('ob-start').click()
    await page.getByTestId('ob-sex-female').click()
    await page.fill('input[name=age]', '30')
    await page.getByTestId('ob-next').click()
    await page.fill('input[name=heightCm]', '165')
    await page.fill('input[name=weightKg]', '68')
    await page.getByTestId('ob-next').click()
    await page.getByTestId('ob-goal-lose').click()
    await page.fill('input[name=goalWeightKg]', '64')
    await page.getByTestId('ob-next').click()
    await page.getByTestId('by-when').waitFor()
    assert.deepEqual(await order(page), ORDER)
    const one = await page.getByTestId('by-1m').innerText()
    assert.match(one, /^1 month/)
    assert.match(one, /fast/) // 4 kg in ~31 days is about 0.9 kg a week, over 1% of 68 kg
    await page.getByTestId('by-1m').click()
    assert.equal(await page.getByTestId('by-1m').getAttribute('aria-pressed'), 'true')
    await page.screenshot({ path: OUT + 'v113-by-when-1m.png' })
    assert.equal(await page.getByTestId('ob-next').isDisabled(), false)
    await page.getByTestId('ob-next').click()
    await page.getByTestId('ob-watch-no').click()
    await page.getByTestId('ob-act-light').click()
    await page.getByTestId('ob-target').waitFor()
    // v1.15: 4 kg in a month needs more than the safe cap, so the date isn't safe: no Continue, Use safer date.
    assert.equal(await page.getByTestId('ob-target').getAttribute('data-state'), 'unsafe')
    await page.getByTestId('unsafe-card').waitFor()
    assert.equal(await page.getByTestId('ob-next').count(), 0)
    await page.screenshot({ path: OUT + 'v113-result-1m.png' })
    await page.getByTestId('ob-safer').click()
    await page.getByTestId('ob-next').click()
    await page.getByTestId('ob-extras').waitFor()
    await page.getByTestId('ob-skip').click()
    await page.waitForURL(BASE + '/')
    const s = await stored(page)
    assert.ok(s.profile.goalDate > addMonthsKey(TODAY, 1), s.profile.goalDate) // the earliest safe date
    assert.equal(s.profile.goalWeightKg, 64)
  })
  await step('Me goal sheet: the same five choices in order; 1 month is not safe, Use safer date then saves', async () => {
    await page.getByRole('link', { name: 'Me', exact: true }).click()
    await page.getByTestId('edit-goal').click()
    await page.getByTestId('goal-sheet').waitFor()
    assert.deepEqual(await order(page), ORDER)
    await page.getByTestId('goal-kg').fill('65')
    await page.getByTestId('by-6m').click()
    assert.equal(await page.getByTestId('pace-warning').count(), 0)
    await page.getByTestId('by-1m').click()
    // v1.15: a Lose date over the cap shows the unsafe card and can't be saved until the safer date is picked.
    await page.getByTestId('goal-preview').getByTestId('unsafe-card').waitFor()
    assert.equal(await page.getByTestId('goal-save').isDisabled(), true)
    await page.getByTestId('goal-safer').click()
    assert.equal(await page.getByTestId('unsafe-card').count(), 0)
    assert.equal(await page.getByTestId('goal-save').isDisabled(), false)
    await page.getByTestId('goal-save').click()
    await page.getByTestId('goal-sheet').waitFor({ state: 'detached' })
    const s = await stored(page)
    assert.equal(s.profile.goalWeightKg, 65)
    assert.ok(s.profile.goalDate > addMonthsKey(TODAY, 1), s.profile.goalDate)
  })
  await page.context().close()
}

// ---------- All weigh-ins ----------
const W = [[-26, 92], [-19, 91.4], [-12, 90.9], [-7, 90.6], [0, 89.7]].map(([d, kg]) => ({ date: addDaysKey(TODAY, d), kg }))
const profile = { age: 32, sex: 'male', heightCm: 175, activity: 'light', goal: 'lose', bmrCustom: false, includeMovement: true, macros: { protein: null, carbs: null, fat: null }, target: 0, dailyGoal: 0, bmr: 0, weightKg: 89.7, goalWeightKg: 80, goalDate: addDaysKey(TODAY, 182), planFrom: { date: TODAY, kg: 89.7 } }
const page = await newPage({ version: 3, profile, entries: [], exercises: [], closedDays: {}, favourites: [], weights: W })
const rows = () => page.getByTestId('weighin-row')
const swipe = async (row, dx, dy = 0, release = true) => {
  // Wait for the sheet's slide-in to settle so the row does not move under the pointer.
  let b = await row.boundingBox()
  for (let i = 0; i < 20; i++) { await page.waitForTimeout(60); const n = await row.boundingBox(); if (Math.abs(n.y - b.y) < 0.5) break; b = n }
  const x = b.x + b.width - 30, y = b.y + b.height / 2
  await page.mouse.move(x, y); await page.mouse.down()
  for (let i = 1; i <= 8; i++) await page.mouse.move(x + (dx * i) / 8, y + (dy * i) / 8)
  if (release) await page.mouse.up()
  await page.waitForTimeout(300)
}
let before
await step('weight card: See all (5 weigh-ins) opens the list, newest first, latest marked', async () => {
  await page.goto(BASE + '/settings')
  await page.getByTestId('weight-card').waitFor()
  assert.match(await page.getByTestId('see-weighins').innerText(), /5 weigh-ins[\s\S]*See all/)
  before = await stored(page)
  await page.getByTestId('see-weighins').click()
  await page.getByTestId('weighins-sheet').waitFor()
  assert.equal(await rows().count(), 5)
  assert.match(await rows().nth(0).innerText(), /Latest · your current weight[\s\S]*89\.7/)
  assert.match(await rows().nth(1).innerText(), /Down 0\.3 kg[\s\S]*90\.6/)
  assert.match(await rows().nth(4).innerText(), /First weigh-in[\s\S]*92/)
  // Closed rows hide Delete from keyboard and screen readers.
  assert.equal(await rows().nth(0).getByTestId('weighin-delete').getAttribute('tabindex'), '-1')
  await page.screenshot({ path: OUT + 'v113-weighins.png' })
})
await step('swipe: a short swipe snaps back, a vertical drag does not open, past half way stays open', async () => {
  await swipe(rows().nth(1), -30)
  assert.equal(await rows().nth(1).getAttribute('data-open'), 'false')
  await swipe(rows().nth(1), -10, 60)
  assert.equal(await rows().nth(1).getAttribute('data-open'), 'false')
  await swipe(rows().nth(0), -70, 0, false)
  await page.screenshot({ path: OUT + 'v113-weighins-swipe.png' })
  await page.mouse.up(); await page.waitForTimeout(300)
  assert.equal(await rows().nth(0).getAttribute('data-open'), 'true')
  assert.equal(await rows().nth(0).getByTestId('weighin-delete').getAttribute('tabindex'), '0')
  // A tap on the row closes it again.
  await rows().nth(0).locator('b').click()
  await page.waitForTimeout(300)
  assert.equal(await rows().nth(0).getAttribute('data-open'), 'false')
})
await step('delete the latest (swipe): weight back to 90.6 kg, plan restarts from that weigh-in, toast with Undo', async () => {
  await swipe(rows().nth(0), -90)
  await rows().nth(0).getByTestId('weighin-delete').click()
  assert.equal(await rows().count(), 4)
  const toast = await page.getByTestId('weighin-toast').innerText()
  assert.match(toast, /Deleted 89\.7 kg on/)
  assert.match(toast, /Weight now 90\.6 kg · [\d,]+ kcal a day/)
  await page.screenshot({ path: OUT + 'v113-weighins-deleted.png' })
  const s = await stored(page)
  assert.deepEqual(s.weights, W.slice(0, 4))
  assert.equal(s.profile.weightKg, 90.6)
  assert.deepEqual(s.profile.planFrom, W[3])
  assert.notEqual(s.profile.target, before.profile.target)
  assert.notEqual(s.profile.bmr, before.profile.bmr) // BMR follows the weight
  assert.match(await rows().nth(0).innerText(), /Latest[\s\S]*90\.6/)
})
await step('Undo puts the weight log and the profile back exactly', async () => {
  await page.getByTestId('weighin-undo').click()
  assert.equal(await page.getByTestId('weighin-toast').count(), 0)
  assert.equal(await rows().count(), 5)
  const s = await stored(page)
  assert.deepEqual([s.weights, s.profile], [before.weights, before.profile])
})
await step('Edit mode (no swipe): Delete on every row, keyboard reachable; an older weigh-in only changes the trend', async () => {
  await page.getByTestId('weighins-edit').click()
  assert.deepEqual(await rows().evaluateAll((els) => els.map((e) => e.dataset.open)), Array(5).fill('true'))
  assert.equal(await page.getByTestId('weighins-edit').innerText(), 'Done')
  const del = rows().nth(2).getByTestId('weighin-delete')
  assert.match(await del.getAttribute('aria-label'), /^Delete 90\.9 kg on /)
  await del.focus(); await page.keyboard.press('Enter')
  assert.equal(await rows().count(), 4)
  assert.match(await page.getByTestId('weighin-toast').innerText(), /Deleted 90\.9 kg[\s\S]*Only your trend changes/)
  const s = await stored(page)
  assert.deepEqual(s.profile, before.profile)
  assert.deepEqual(s.weights.map((w) => w.kg), [92, 91.4, 90.6, 89.7])
})
await step('deleting down to the only weigh-in keeps the weight; the empty log survives a reload', async () => {
  while (await rows().count() > 1) await rows().nth(0).getByTestId('weighin-delete').click()
  const one = await stored(page)
  assert.deepEqual(one.weights, [W[0]])
  assert.equal(one.profile.weightKg, 92)
  await rows().nth(0).getByTestId('weighin-delete').click()
  assert.equal(await rows().count(), 0)
  assert.match(await page.getByTestId('weighin-toast').innerText(), /Your weight stays 92 kg/)
  const s = await stored(page)
  assert.deepEqual(s.weights, [])
  assert.deepEqual(s.profile, one.profile)
  await page.keyboard.press('Escape')
  await page.getByTestId('weighins-sheet').waitFor({ state: 'detached' })
  assert.match(await page.getByTestId('weight-trend').innerText(), /No weigh-ins yet/)
  assert.equal(await page.getByTestId('see-weighins').count(), 0)
  await page.reload()
  await page.getByTestId('weight-card').waitFor()
  assert.deepEqual((await stored(page)).weights, [])
  // Logging again starts the log.
  await page.getByTestId('log-weight').click()
  await page.getByTestId('weigh-kg').fill('91.8')
  await page.getByTestId('weigh-save').click()
  await page.getByTestId('weigh-done').click()
  assert.deepEqual((await stored(page)).weights, [{ date: TODAY, kg: 91.8 }])
})
await page.context().close()

// ---------- Log weight, re-plan, ahead / behind / reached, the weekly nudge (both phone sizes) ----------
{
  const prof = (o) => ({ age: 32, sex: 'male', heightCm: 175, activity: 'light', goal: 'lose', bmrCustom: false, includeMovement: true, macros: { protein: null, carbs: null, fat: null }, target: 0, dailyGoal: 0, bmr: 0, ...o })
  const st = (profile, weights) => ({ version: 3, profile, entries: [], exercises: [], closedDays: {}, favourites: [], weights })
  const W = [[-26, 92], [-19, 91.4], [-12, 90.9], [-7, 90.6]].map(([d, kg]) => ({ date: addDaysKey(TODAY, d), kg }))
  const LAST = W[3].date
  const days = (a, b) => { const [y1, m1, d1] = a.split('-').map(Number), [y2, m2, d2] = b.split('-').map(Number); return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 864e5) }
  const at = async (w, h, state) => {
    const ctx = await browser.newContext({ ...devices['iPhone 14'], viewport: { width: w, height: h }, deviceScaleFactor: 2, serviceWorkers: 'block' })
    await ctx.addInitScript((s) => { if (!localStorage.getItem('calorie-app:v3')) { localStorage.setItem('calorie-app:v3', s); localStorage.setItem('calorie-app:backup', JSON.stringify({ lastExportAt: Date.now() })) } }, JSON.stringify(state))
    const page = await ctx.newPage()
    page.on('console', (m) => { if ((m.type() === 'error' || m.type() === 'warning') && !/Service Worker registration blocked/.test(m.text())) errors.push(`${w}x${h} ${m.type()}: ${m.text()}`) })
    page.on('pageerror', (e) => errors.push(`${w}x${h} pageerror: ${e.message}`))
    return page
  }
  const flat = async (page, what) => {
    await page.waitForTimeout(500) // let page-in / sheet animations settle
    const r = await page.evaluate(() => [document.documentElement.scrollWidth, innerWidth, [...document.querySelectorAll('body *')].filter((el) => { const b = el.getBoundingClientRect(); return b.width > 0 && b.right > innerWidth + 0.5 && !el.closest('[data-testid=weighins-sheet] li') }).map((el) => el.dataset.testid || el.tagName).slice(0, 4)])
    assert.ok(r[0] <= r[1], `${what}: ${r[0]}px wide at ${r[1]}`)
    assert.deepEqual(r[2], [], `${what}: elements past the right edge`)
  }
  const shot = async (page, name) => { await page.waitForTimeout(350); await page.screenshot({ path: `${OUT}v113-${name}.png` }) }
  for (const [w, h] of [[390, 844], [375, 667]]) {
    const tag = `${w}x${h}`
    await step(`${tag} Today: "Weighed in lately?" 7 days after the last weigh-in; Log weight opens the sheet; dismiss hides it for a week`, async () => {
      const page = await at(w, h, st(prof({ weightKg: 90.6, goalWeightKg: 80, goalDate: addDaysKey(TODAY, 182), planFrom: { date: LAST, kg: 90.6 } }), W))
      await page.goto(BASE + '/')
      await page.getByTestId('weigh-nudge').waitFor()
      assert.match(await page.getByTestId('weigh-nudge').innerText(), /Weighed in lately\?[\s\S]*Last time was/)
      await flat(page, 'nudge'); await shot(page, `home-nudge-${tag}`)
      await page.getByTestId('weigh-nudge-log').click()
      await page.getByTestId('log-weight-sheet').waitFor()
      await page.keyboard.press('Escape')
      await page.getByTestId('log-weight-sheet').waitFor({ state: 'detached' })
      await page.getByRole('button', { name: 'Dismiss weigh-in reminder' }).click()
      assert.equal(await page.getByTestId('weigh-nudge').count(), 0)
      assert.equal(JSON.parse(await page.evaluate(() => localStorage.getItem('calorie-app:weigh'))).dismissedAt, TODAY)
      await page.reload(); await page.getByRole('link', { name: 'Me', exact: true }).waitFor()
      assert.equal(await page.getByTestId('weigh-nudge').count(), 0)
      await page.context().close()
      // 6 days after: no nudge.
      const fresh = await at(w, h, st(prof({ weightKg: 90.6, goalWeightKg: 80, goalDate: addDaysKey(TODAY, 182), planFrom: { date: addDaysKey(TODAY, -6), kg: 90.6 } }), [...W.slice(0, 3), { date: addDaysKey(TODAY, -6), kg: 90.6 }]))
      await fresh.goto(BASE + '/'); await fresh.getByRole('link', { name: 'Me', exact: true }).waitFor(); await fresh.waitForTimeout(300)
      assert.equal(await fresh.getByTestId('weigh-nudge').count(), 0)
      await fresh.context().close()
    })
    await step(`${tag} Log weight (ahead): one entry a day, the plan restarts from today, gap = kg left x 7,700 / days left`, async () => {
      const goalDate = addDaysKey(TODAY, 182)
      const page = await at(w, h, st(prof({ weightKg: 90.6, goalWeightKg: 80, goalDate, planFrom: { date: LAST, kg: 90.6 } }), W))
      await page.goto(BASE + '/settings'); await page.getByTestId('weight-card').waitFor()
      await flat(page, 'weight card'); await shot(page, `me-weight-${tag}`)
      const before = (await stored(page)).profile
      await page.getByTestId('log-weight').click()
      await page.getByTestId('weigh-kg').fill('89.7')
      await shot(page, `log-sheet-${tag}`)
      await page.getByTestId('weigh-save').click()
      const res = page.getByTestId('weigh-result')
      assert.equal(await res.getAttribute('data-status'), 'ahead')
      assert.match(await res.innerText(), /Ahead of plan[\s\S]*Your target is now [\d,]+ kcal a day \(was [\d,]+\)/)
      const p = (await stored(page)).profile
      assert.deepEqual([p.weightKg, p.planFrom, p.goalDate], [89.7, { date: TODAY, kg: 89.7 }, goalDate])
      const gap = (89.7 - 80) * 7700 / days(TODAY, goalDate)
      assert.ok(Math.abs(p.dailyGoal - gap) <= 1, `daily gap ${p.dailyGoal} vs ${gap.toFixed(1)}`)
      assert.ok(p.target > before.target, 'ahead eats a little more')
      await flat(page, 'ahead result'); await shot(page, `result-ahead-${tag}`)
      await page.getByTestId('weigh-done').click()
      // A second weigh-in today replaces the first.
      await page.getByTestId('log-weight').click()
      await page.getByTestId('weigh-kg').fill('89.5')
      await page.getByTestId('weigh-save').click(); await page.getByTestId('weigh-done').click()
      const s = await stored(page)
      assert.equal(s.weights.length, 5)
      assert.deepEqual(s.weights.at(-1), { date: TODAY, kg: 89.5 })
      assert.equal(await page.getByTestId('weight-now').innerText().then((t) => t.replace(/\s/g, '')), '89.5kg')
      // The goal sheet and All weigh-ins fit the width too.
      await page.getByTestId('edit-goal').click(); await page.getByTestId('goal-sheet').waitFor()
      await flat(page, 'goal sheet'); await shot(page, `goal-sheet-${tag}`)
      await page.keyboard.press('Escape'); await page.getByTestId('goal-sheet').waitFor({ state: 'detached' })
      await page.getByTestId('see-weighins').click(); await page.getByTestId('weighins-sheet').waitFor()
      await flat(page, 'weigh-ins'); await shot(page, `weighins-list-${tag}`)
      await page.keyboard.press('Escape'); await page.getByTestId('weighins-sheet').waitFor({ state: 'detached' })
      await page.context().close()
    })
    await step(`${tag} behind: re-plans to the same date, fast now, so it offers to push the date (Push or Keep)`, async () => {
      const goalDate = addDaysKey(TODAY, 75)
      const page = await at(w, h, st(prof({ weightKg: 90.6, goalWeightKg: 80, goalDate, planFrom: { date: LAST, kg: 90.6 } }), W))
      await page.goto(BASE + '/settings'); await page.getByTestId('weight-card').waitFor()
      await page.getByTestId('log-weight').click()
      await page.getByTestId('weigh-kg').fill('91.2')
      await page.getByTestId('weigh-save').click()
      const res = page.getByTestId('weigh-result')
      assert.equal(await res.getAttribute('data-status'), 'behind')
      assert.match(await res.innerText(), /A little behind plan[\s\S]*No stress/)
      await res.getByTestId('push-prompt').waitFor()
      await flat(page, 'behind result'); await shot(page, `result-behind-${tag}`)
      await res.getByTestId('push-date').click()
      await page.getByTestId('push-done').waitFor()
      const p = (await stored(page)).profile
      assert.ok(p.goalDate > goalDate, `pushed ${p.goalDate} after ${goalDate}`)
      assert.match(await page.getByTestId('push-done').innerText(), /Goal date:/)
      await page.getByTestId('weigh-done').click()
      assert.equal(await page.getByTestId('push-prompt').count(), 0)
      await page.context().close()
    })
    await step(`${tag} goal reached: Switch to Keep or Set a new goal`, async () => {
      const W2 = [[-40, 84.2], [-14, 80.9], [-7, 80.4]].map(([d, kg]) => ({ date: addDaysKey(TODAY, d), kg }))
      const state = st(prof({ weightKg: 80.4, goalWeightKg: 80, goalDate: addDaysKey(TODAY, 34), planFrom: { date: W2[2].date, kg: 80.4 } }), W2)
      let page = await at(w, h, state)
      await page.goto(BASE + '/settings'); await page.getByTestId('weight-card').waitFor()
      await page.getByTestId('log-weight').click()
      await page.getByTestId('weigh-kg').fill('79.8')
      await page.getByTestId('weigh-save').click()
      assert.equal(await page.getByTestId('weigh-result').getAttribute('data-status'), 'reached')
      assert.match(await page.getByTestId('weigh-result').innerText(), /You reached 80 kg/)
      await flat(page, 'reached result'); await shot(page, `result-reached-${tag}`)
      await page.getByTestId('weigh-done').click()
      await page.getByTestId('goal-passed').waitFor()
      await page.getByTestId('goal-passed').scrollIntoViewIfNeeded(); await shot(page, `me-reached-${tag}`)
      await page.getByTestId('new-goal').click()
      await page.getByTestId('goal-sheet').waitFor()
      await page.keyboard.press('Escape'); await page.getByTestId('goal-sheet').waitFor({ state: 'detached' })
      await page.getByTestId('switch-keep').click()
      await page.getByTestId('goal-passed').waitFor({ state: 'detached' })
      const p = (await stored(page)).profile
      assert.equal(p.goal, 'keep')
      assert.match(await page.getByTestId('goal-summary').innerText(), /keep your weight/)
      await page.context().close()
    })
  }
}

await step('no console errors or warnings', async () => { assert.deepEqual(errors, []) })
await browser.close()
console.log(results.join('\n'))
console.log(`\n${results.length} v1.13 weigh-in, weight log, nudge and 1 month checks passed, no console errors`)
