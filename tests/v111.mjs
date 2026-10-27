// v1.11: (1) "Add Calories" replaces "Quick add calories": the Log bar button is solid green #178046 with cream text and
// no emoji (Exercise's "Quick add burn" too), the sheet title, add-item search, the photo sheet's "Add Calories instead"
// and the empty Log link, with "From a label, menu or your own count" under kcal. (2) The bar has 20 px each side plus
// the safe area, both buttons 56 px, lined up with the search box. (3) The Log meal selector is a 44 px cream pill
// (thin border, 16 px left, 12 px right, chevron) sized to the meal, with the native select invisibly on top.
// (4) A Beverages meal after Snacks: selector, sheet chips and its own Home section, never picked by time; old data
// loads unchanged; the demo week's Es teh manis is a beverage.
// WebKit with touch at 390x844 and 375x667. Screenshots: screenshots/v111-*.png.
// Usage: npm run build && npx vite preview --port 4174 & node tests/v111.mjs
import { webkit, devices } from 'playwright'
import assert from 'node:assert/strict'
import { STATE as V1_STATE } from './v11-fixture.mjs'

const BASE = (process.env.BASE_URL ?? 'http://localhost:4174/calorie-app').replace(/\/$/, '')
const OUT = new URL('../screenshots/', import.meta.url).pathname
const V1 = 'calorie-app:v1', V2 = 'calorie-app:v2'
const MEALS = ['Breakfast', 'Lunch', 'Dinner', 'Snacks', 'Beverages']
const GREEN = 'rgb(23, 128, 70)', CREAM = 'rgb(255, 253, 248)'
const results = [], errors = []
const step = async (name, fn) => {
  const t = Date.now()
  try { await fn(); results.push(`PASS ${name} (${Date.now() - t} ms)`) } catch (e) { results.push(`FAIL ${name}: ${e.message}`); console.log(results.join('\n')); throw e }
}
const noSideways = async (pg, what) => { const r = await pg.evaluate(() => [document.documentElement.scrollWidth, innerWidth]); assert.ok(r[0] <= r[1], `${what}: ${r[0]}px wide at ${r[1]}`) }
const noDash = async (loc, what) => assert.doesNotMatch(await loc.innerText(), /\u2014/, `${what} has no em dash`)
const noEmoji = (s, what) => assert.doesNotMatch(s, /\p{Extended_Pictographic}/u, `${what} has no emoji`)
const near = (a, b, what, tol = 1) => assert.ok(Math.abs(a - b) <= tol, `${what}: ${a} vs ${b}`)

const pad = (n) => String(n).padStart(2, '0')
const TODAY = (() => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` })()
const profile = { age: 32, sex: 'male', heightCm: 175, weightKg: 92, activity: 'light', goal: 'lose', pace: 'standard', bmr: 1859, bmrCustom: false, includeMovement: true, goalWeightKg: 92, macros: { protein: null, carbs: null, fat: null }, target: 2006, dailyGoal: 550 }
const e = (id, meal, name, kcal) => ({ id, date: TODAY, meal, foodId: null, name, servingLabel: 'Quick add', servingMult: 1, qty: 1, kcal, protein: 0, carbs: 0, fat: 0, createdAt: Date.now() - 3600_000 })
const SEED = { version: 2, profile, entries: [e('b1', 'breakfast', 'Nasi uduk', 420), e('s1', 'snacks', 'Pisang goreng', 180)], exercises: [], closedDays: {}, favourites: [] }

const browser = await webkit.launch()
for (const [width, height] of [[390, 844], [375, 667]]) {
  const tag = `${width}x${height}`
  const newCtx = async (seed, extra = {}) => {
    const c = await browser.newContext({ ...devices['iPhone 14'], viewport: { width, height }, deviceScaleFactor: 3, serviceWorkers: 'block', reducedMotion: 'reduce', ...extra })
    if (seed) await c.addInitScript(([k, v]) => { if (!localStorage.getItem('calorie-app:v2') && !localStorage.getItem('calorie-app:v1')) localStorage.setItem(k, v) }, seed)
    return c
  }
  const watchErrors = (page) => {
    page.on('console', (m) => { if ((m.type() === 'error' || m.type() === 'warning') && !/Service Worker registration blocked|service worker/i.test(m.text())) errors.push(`${tag}: ${m.type()}: ${m.text()}`) })
    page.on('pageerror', (er) => errors.push(`${tag}: pageerror: ${er.message}`))
  }
  const shotOf = (pg) => async (name, el) => { await pg.waitForTimeout(300); await pg.screenshot({ path: `${OUT}v111-${name}-${tag}.png` }) }
  const look = (loc) => loc.evaluate((el) => { const c = getComputedStyle(el), r = el.getBoundingClientRect(); return { bg: c.backgroundColor, color: c.color, x: r.x, right: r.right, w: r.width, h: r.height, y: r.y, pl: c.paddingLeft, pr: c.paddingRight, border: c.borderTopWidth, radius: c.borderTopLeftRadius } })

  const ctx = await newCtx([V2, JSON.stringify(SEED)]); const page = await ctx.newPage(); watchErrors(page)
  const dialog = page.getByRole('dialog')
  const toLog = async (meal) => { await page.goto(`${BASE}/log${meal ? `?meal=${meal}` : ''}`); await page.getByTestId('qa-bar').waitFor() }

  await step(`${tag} Log bar: "Add Calories" solid green #178046, cream text, no emoji, 56 px, 20 px gutters lined up with the search box`, async () => {
    await toLog('lunch')
    const btn = page.getByTestId('qa-btn'), ai = page.getByTestId('ai-btn'), search = page.getByLabel('Search foods').locator('..') // the search box (input plus icon)
    assert.equal((await btn.innerText()).trim(), 'Add Calories'); noEmoji(await page.getByTestId('qa-bar').innerText(), 'bar')
    const [b, a, s] = [await look(btn), await look(ai), await look(search)]
    assert.equal(b.bg, GREEN, 'solid green'); assert.equal(b.color, CREAM, 'cream text')
    near(b.h, 56, 'Add Calories height'); near(a.h, 56, 'AI button height'); near(a.w, 56, 'AI button width')
    near(b.x, 20, 'Add Calories 20 px from the left'); near(width - a.right, 20, 'AI button 20 px from the right')
    near(b.x, s.x, 'Add Calories left edge = search box left edge'); near(a.right, s.right, 'AI right edge = search box right edge')
    near(b.y + b.h / 2, a.y + a.h / 2, 'same row', 2)
    await noSideways(page, 'Log'); await shotOf(page)('bottom-bar')
  })

  await step(`${tag} meal selector: 44 px cream pill, thin border, 16/12 px padding, chevron, sized to the meal, invisible native select on top`, async () => {
    const pill = page.getByTestId('meal-pill'), sel = page.getByRole('combobox', { name: 'Meal' })
    const p = await look(pill)
    near(p.h, 44, 'pill height'); assert.equal(p.bg, CREAM, 'cream pill'); assert.equal(p.border, '1px', 'thin border')
    assert.equal(p.pl, '16px'); assert.equal(p.pr, '12px'); assert.equal(await pill.locator('svg').count(), 1, 'chevron')
    assert.equal(await sel.evaluate((el) => getComputedStyle(el).opacity), '0', 'native select is invisible')
    const sb = await sel.boundingBox(); assert.ok(sb.x <= p.x + 1 && sb.x + sb.width >= p.right - 1 && sb.height >= 44, 'select covers the pill')
    assert.deepEqual(await sel.locator('option').allInnerTexts(), MEALS, 'Beverages is listed after Snacks')
    const lunchW = p.w
    await sel.selectOption('beverages')
    await page.waitForURL(/meal=beverages/)
    await page.waitForFunction(() => document.querySelector('[data-testid=meal-pill] > span')?.textContent.trim() === 'Beverages', null, { timeout: 5000 }) // the URL can update a frame before the label
    const q = await look(pill)
    assert.ok(q.w > lunchW + 10, `pill grows with the meal (${Math.round(lunchW)} to ${Math.round(q.w)})`)
    // scrollWidth rounds, so compare the label's real box with the width its text needs (a 0.1 px squeeze still shows "Beverag...")
    const fit = await pill.locator('span').first().evaluate((el) => { const r = document.createRange(); r.selectNodeContents(el); return [el.getBoundingClientRect().width, r.getBoundingClientRect().width] })
    assert.ok(fit[0] + 0.01 >= fit[1], `"Beverages" is not truncated (${fit[0]} for ${fit[1]})`)
    const hdr = await page.locator('header').evaluate((el) => [el.scrollWidth, el.clientWidth]); assert.ok(hdr[0] <= hdr[1], 'header fits')
    await noSideways(page, 'Log with Beverages'); await noDash(page.locator('header'), 'header')
    await shotOf(page)('meal-selector')
  })

  await step(`${tag} Add Calories sheet: title, kcal hint "From a label, menu or your own count", Beverages chip, logs to Beverages`, async () => {
    await page.getByTestId('qa-btn').click()
    await dialog.getByRole('heading', { name: 'Add Calories' }).waitFor()
    const kcal = dialog.locator('input[name=kcal]'), hint = dialog.getByTestId('qa-kcal-hint')
    assert.equal((await hint.innerText()).trim(), 'From a label, menu or your own count')
    assert.equal(await kcal.getAttribute('aria-describedby'), 'qa-kcal-hint')
    const [kb, hb] = [await kcal.boundingBox(), await hint.boundingBox()]; assert.ok(hb.y >= kb.y + kb.height - 1, 'hint sits under kcal')
    const chips = dialog.getByRole('group', { name: 'Meal' }).getByRole('button')
    assert.deepEqual((await chips.allInnerTexts()).map((t) => t.trim()), MEALS)
    assert.equal(await dialog.getByRole('group', { name: 'Meal' }).getByRole('button', { name: 'Beverages' }).getAttribute('aria-pressed'), 'true', 'opens on the current meal')
    await noSideways(page, 'sheet'); await noDash(dialog, 'sheet')
    await kcal.fill('140'); await dialog.locator('input[name=name]').fill('Kopi susu')
    await page.keyboard.press('Tab').catch(() => {})
    await shotOf(page)('add-calories-sheet')
    await dialog.getByRole('button', { name: 'Add 140 kcal' }).click()
    await page.getByTestId('toast').waitFor()
    const st = await page.evaluate((k) => JSON.parse(localStorage.getItem(k)), 'calorie-app:v3')
    assert.equal(st.entries.find((x) => x.name === 'Kopi susu').meal, 'beverages')
  })

  await step(`${tag} Home: Beverages has its own section after Snacks, with its entry and "+ Add" to Log on Beverages`, async () => {
    await page.goto(BASE + '/'); await page.getByTestId('eaten').waitFor()
    const ids = await page.locator('section[data-testid^="meal-"]').evaluateAll((els) => els.map((el) => el.dataset.testid))
    assert.deepEqual(ids, ['meal-breakfast', 'meal-lunch', 'meal-dinner', 'meal-snacks', 'meal-beverages'])
    const bev = page.getByTestId('meal-beverages')
    assert.match(await bev.innerText(), /Beverages · 140 kcal[\s\S]*Kopi susu/)
    assert.match(await page.getByTestId('meal-snacks').innerText(), /Pisang goreng/, 'old snack stays in Snacks')
    await bev.scrollIntoViewIfNeeded()
    await noSideways(page, 'Home'); await shotOf(page)('home-beverages')
    await page.getByRole('link', { name: 'Add to Beverages' }).click()
    await page.waitForURL(/meal=beverages/); assert.equal(await page.getByRole('combobox', { name: 'Meal' }).inputValue(), 'beverages')
  })

  await step(`${tag} Exercise: "Quick add burn" is the same green button, no emoji, 56 px, 20 px each side`, async () => {
    await page.getByRole('button', { name: /Exercise/ }).first().click()
    await page.getByRole('heading', { name: 'Log exercise' }).waitFor()
    const btn = page.getByTestId('qa-btn'); assert.equal((await btn.innerText()).trim(), 'Quick add burn')
    noEmoji(await page.getByTestId('qa-bar').innerText(), 'exercise bar')
    const b = await look(btn)
    assert.equal(b.bg, GREEN); assert.equal(b.color, CREAM); near(b.h, 56, 'height'); near(b.x, 20, 'left'); near(width - b.right, 20, 'right')
    await shotOf(page)('exercise-button')
  })

  await step(`${tag} other "Add Calories" entry points: empty Log link, add-item search button, no "Quick add calories" left`, async () => {
    await toLog('dinner')
    await page.getByRole('group', { name: 'Food list' }).getByRole('button', { name: 'All foods' }).click()
    await page.getByLabel('Search foods').fill('zzzz no such food')
    const empty = page.getByTestId('list-empty'); await empty.waitFor()
    assert.match(await empty.innerText(), /Add Calories/); assert.doesNotMatch(await page.locator('body').innerText(), /Quick add calories/i)
    await empty.getByRole('button', { name: 'Add Calories' }).click()
    await dialog.getByRole('heading', { name: 'Add Calories' }).waitFor(); await page.keyboard.press('Escape')
    await dialog.waitFor({ state: 'detached' })
  })

  for (const [hour, want] of [[7, 'breakfast'], [12, 'lunch'], [18, 'dinner'], [22, 'snacks'], [2, 'breakfast']]) {
    await step(`${tag} Beverages is never picked by time: ${pad(hour)}:00 opens Log on ${want}`, async () => {
      const c = await newCtx([V2, JSON.stringify(SEED)]); const pg = await c.newPage(); watchErrors(pg)
      const d = new Date(); d.setHours(hour, 5, 0, 0); await pg.clock.setFixedTime(d)
      await pg.goto(BASE + '/log'); await pg.getByTestId('qa-bar').waitFor()
      assert.equal(await pg.getByRole('combobox', { name: 'Meal' }).inputValue(), want)
      await c.close()
    })
  }
  await ctx.close()

  await step(`${tag} old data: a v1.1-era state loads with every meal unchanged, Beverages empty, History and Nutrition fine`, async () => {
    const c = await newCtx([V1, JSON.stringify(V1_STATE)]); const pg = await c.newPage(); watchErrors(pg)
    await pg.goto(BASE + '/'); await pg.getByTestId('eaten').waitFor()
    const st = await pg.evaluate((k) => JSON.parse(localStorage.getItem(k)), 'calorie-app:v3')
    const before = Object.fromEntries(V1_STATE.entries.map((x) => [x.id, x.meal]))
    assert.deepEqual(Object.fromEntries(st.entries.map((x) => [x.id, x.meal])), before, 'meals unchanged')
    assert.match(await pg.getByTestId('meal-beverages').innerText(), /^Beverages/)
    for (const l of ['History', 'Nutrition']) { await pg.getByRole('link', { name: l, exact: true }).click(); await pg.getByRole('heading', { name: l }).waitFor(); assert.equal(await pg.getByTestId('error-boundary').count(), 0) }
    await c.close()
  })

  await step(`${tag} demo week: Es teh manis is logged under Beverages`, async () => {
    const c = await newCtx([V2, JSON.stringify(SEED)]); const pg = await c.newPage(); watchErrors(pg)
    await pg.goto(BASE + '/settings'); await pg.getByTestId('developer').locator('summary').click(); await pg.getByRole('button', { name: 'Load demo week' }).click()
    await pg.getByRole('heading', { name: 'History' }).waitFor()
    const st = await pg.evaluate((k) => JSON.parse(localStorage.getItem(k)), 'calorie-app:v3')
    const tea = st.entries.filter((x) => x.foodId === 'es-teh-manis'); assert.ok(tea.length >= 1)
    assert.ok(tea.every((x) => x.meal === 'beverages'), 'every Es teh manis is a beverage')
    await c.close()
  })
}
await browser.close()
console.log(results.join('\n'))
if (errors.length) { console.log('Console errors:\n' + errors.join('\n')); process.exit(1) }
console.log(`\n${results.length} steps passed, no console errors`)
