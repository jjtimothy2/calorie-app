// v1.15.1: grouped AI rows on Home lose their › chevron, so their kcal sits on the same right edge as single rows
// (Today and a past day). Tapping a grouped row still opens the breakdown; its aria label still ends "Open breakdown".
// WebKit (iPhone 14) at 390x844 and 375x667. Screenshots: screenshots/v1151-home-rows-*.png.
// V1151_PHASE=before only takes before shots (v1151-before-home-rows-*), for comparing against the v1.15 build.
// Usage: npm run build && npx vite preview --port 4174 & node tests/v1151.mjs
import { webkit, devices } from 'playwright'
import assert from 'node:assert/strict'

const BASE = (process.env.BASE_URL ?? 'http://localhost:4174/calorie-app').replace(/\/$/, '')
const OUT = new URL('../screenshots/', import.meta.url).pathname
const BEFORE = process.env.V1151_PHASE === 'before'
const results = [], errors = []
const step = async (name, fn) => {
  const t = Date.now()
  try { await fn(); results.push(`PASS ${name} (${Date.now() - t} ms)`) } catch (e) { results.push(`FAIL ${name}: ${e.message}`); console.log(results.join('\n')); console.log(errors.join('\n')); throw e }
}
const pad = (n) => String(n).padStart(2, '0')
const key = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const ago = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return key(d) }
const TODAY = ago(0), YDAY = ago(1)
const t0 = Date.now() - 3600_000
let n = 0
const ai = (date, meal, name, kcal, p, c, f, serving, extra = {}) => ({ id: `${date}-${++n}`, date, meal, foodId: null, name, servingLabel: serving, servingMult: 1, qty: 1, kcal, protein: p, carbs: c, fat: f, createdAt: t0 + n * 1000, source: 'photo', ...extra })
// Jordy's screenshot: Dinner has two AI groups and two single AI rows, Snacks has one single and one group.
const day = (date) => {
  const g1 = { groupId: `${date}-g1`, groupName: 'Chicken Teriyaki Rice Bowl with Egg' }, g2 = { groupId: `${date}-g2`, groupName: 'Chicken Nanban Rice Bowl' }, g3 = { groupId: `${date}-g3`, groupName: 'Pistachio Yogurt with Toppings' }
  return [
    ai(date, 'dinner', 'Teriyaki chicken', 150, 14, 6, 8, '100 g', g1), ai(date, 'dinner', 'Rice', 104, 2, 23, 0, '80 g', g1), ai(date, 'dinner', 'Egg', 30, 3, 0, 2, '1 piece', g1),
    ai(date, 'dinner', 'Chicken broth', 95, 6, 3, 6, '1 bowl (350 g)'),
    ai(date, 'dinner', 'Nanban chicken', 330, 20, 14, 22, '120 g', g2), ai(date, 'dinner', 'Rice', 208, 4, 46, 0, '160 g', g2), ai(date, 'dinner', 'Tartar sauce', 60, 0, 1, 6, '20 g', g2), ai(date, 'dinner', 'Cabbage', 28, 1, 6, 0, '50 g', g2),
    ai(date, 'dinner', 'Chicken Karaage', 250, 17, 8, 16, '100 g'),
    ai(date, 'snacks', 'Keripik tempe (tempeh chips)', 200, 6, 18, 12, '38 g'),
    ai(date, 'snacks', 'Pistachio yogurt', 150, 8, 15, 6, '150 g', g3), ai(date, 'snacks', 'Granola', 110, 2, 18, 4, '25 g', g3), ai(date, 'snacks', 'Pistachio', 45, 2, 2, 4, '8 g', g3), ai(date, 'snacks', 'Honey', 20, 0, 5, 0, '7 g', g3),
  ]
}
const profile = { age: 32, sex: 'male', heightCm: 175, weightKg: 92, activity: 'light', goal: 'keep', bmr: 1859, bmrCustom: false, includeMovement: false, goalWeightKg: 92, macros: { protein: null, carbs: null, fat: null }, target: 1859, dailyGoal: 0, goalDate: null }
const V3 = { version: 3, profile, entries: [...day(YDAY), ...day(TODAY)], exercises: [], closedDays: {}, favourites: [], weights: [{ date: YDAY, kg: 92 }] }
const AI = JSON.stringify({ provider: 'gemini', key: 'test-key-not-real' })
const FOODS = JSON.stringify({ version: 1, foods: [] })

// Right edge of each row's kcal number and of the row itself, for every row in a meal section.
const edges = (page) => page.evaluate(() => [...document.querySelectorAll('main ul > li > button')].map((b) => {
  const num = [...b.children].find((c) => c.classList.contains('num'))
  return { group: b.dataset.testid === 'ai-group-row', svg: b.querySelectorAll(':scope > svg').length, kcal: num.textContent, numRight: num.getBoundingClientRect().right, rowRight: b.getBoundingClientRect().right, rowH: b.getBoundingClientRect().height }
}))

const browser = await webkit.launch()
for (const [width, height] of [[390, 844], [375, 667]]) {
  const tag = `${width}x${height}`
  const ctx = await browser.newContext({ ...devices['iPhone 14'], viewport: { width, height }, deviceScaleFactor: 2, serviceWorkers: 'block', reducedMotion: 'reduce' })
  await ctx.addInitScript(([v3, ai, foods]) => {
    if (localStorage.getItem('calorie-app:seeded')) return
    localStorage.setItem('calorie-app:seeded', '1')
    localStorage.setItem('calorie-app:v3', v3); localStorage.setItem('calorie-app:ai', ai); localStorage.setItem('calorie-app:foods', foods)
    localStorage.setItem('calorie-app:backup', JSON.stringify({ lastExportAt: Date.now(), dismissedAt: null }))
  }, [JSON.stringify(V3), AI, FOODS])
  const page = await ctx.newPage()
  page.on('console', (m) => { if ((m.type() === 'error' || m.type() === 'warning') && !/service worker/i.test(m.text())) errors.push(`${tag}: ${m.type()}: ${m.text()}`) })
  page.on('pageerror', (er) => errors.push(`${tag}: pageerror: ${er.message}`))
  // Dinner and Snacks cards, top of Dinner to bottom of Snacks.
  const shotRows = async (name) => {
    const dinner = page.locator('section', { has: page.getByRole('heading', { name: /^Dinner/ }) })
    const snacks = page.locator('section', { has: page.getByRole('heading', { name: /^Snacks/ }) })
    // The tab bar is hidden for this shot only, so both cards fit at 375x667 (the rows are not changed by it).
    await page.evaluate(() => { document.querySelector('nav[aria-label=Main]').style.display = 'none' })
    await dinner.scrollIntoViewIfNeeded(); await page.waitForTimeout(300)
    const a = await dinner.boundingBox()
    await page.evaluate((dy) => document.querySelector('main').scrollBy(0, dy), a.y - 40); await page.waitForTimeout(400)
    const d = await dinner.boundingBox(), s = await snacks.boundingBox()
    const top = Math.max(0, d.y - 18), bottom = Math.min(height, s.y + s.height + 18)
    await page.screenshot({ path: `${OUT}v1151-${BEFORE ? 'before-' : ''}home-rows-${name}-${tag}.png`, clip: { x: 0, y: top, width, height: bottom - top } })
    await page.evaluate(() => { document.querySelector('nav[aria-label=Main]').style.display = '' })
  }
  const check = async (what) => {
    const rows = await edges(page)
    console.log(`  ${tag} ${what}: ` + rows.map((r) => `${r.group ? 'G' : 'S'}${r.kcal}@${r.numRight.toFixed(2)}`).join(' '))
    if (BEFORE) return
    const groups = rows.filter((r) => r.group), singles = rows.filter((r) => !r.group)
    assert.equal(groups.length, 3); assert.equal(singles.length, 3)
    assert.ok(groups.every((r) => r.svg === 0), 'no chevron on grouped rows')
    assert.equal(await page.locator('[data-testid=ai-group-row] path[d="m9 5 7 7-7 7"]').count(), 0)
    const ref = singles[0].numRight
    for (const r of rows) assert.ok(Math.abs(r.numRight - ref) <= 1, `${what}: kcal ${r.kcal} right edge ${r.numRight} vs single ${ref}`)
    for (const r of rows) assert.ok(Math.abs(r.rowRight - rows[0].rowRight) < 0.5, 'rows share one right edge')
    const scroll = await page.evaluate(() => [document.documentElement.scrollWidth, innerWidth]); assert.ok(scroll[0] <= scroll[1], 'no sideways scroll')
  }
  const openBreakdown = async () => {
    const row = page.getByTestId('ai-group-row').filter({ hasText: 'Chicken Nanban Rice Bowl' })
    assert.match(await row.getAttribute('aria-label'), /^Chicken Nanban Rice Bowl, 4 items from AI, 626 kcal\. Open breakdown$/)
    await page.getByRole('button', { name: /Chicken Nanban Rice Bowl.*Open breakdown/ }).click()
    const sheet = page.getByTestId('ai-group-sheet')
    await sheet.waitFor()
    assert.equal(await sheet.getByTestId('ai-group-item').count(), 4)
    assert.match(await sheet.getByTestId('ai-group-total').innerText(), /626/)
    await page.keyboard.press('Escape')
    await sheet.waitFor({ state: 'detached' })
  }

  await step(`${tag} Today: grouped rows have no chevron, every kcal ends on the same right edge (within 1 px), tap opens the breakdown`, async () => {
    await page.goto(`${BASE}/`)
    await page.getByTestId('ai-group-row').first().waitFor()
    await check('today')
    await shotRows('today')
    if (!BEFORE) await openBreakdown()
  })
  await step(`${tag} past day: the same rows line up the same way and still open the breakdown`, async () => {
    await page.evaluate(() => document.querySelector('main').scrollTo(0, 0))
    await page.getByTestId('day-prev').click()
    await page.waitForFunction(() => document.querySelector('#day-title')?.textContent === 'Yesterday')
    await page.getByTestId('past-day-note').waitFor(); await page.getByTestId('ai-group-row').first().waitFor()
    await check('yesterday')
    await shotRows('past-day')
    if (!BEFORE) {
      await openBreakdown()
      const s = JSON.parse(await page.evaluate(() => localStorage.getItem('calorie-app:v3')))
      assert.deepEqual(s.entries, V3.entries, 'no data change')
    }
  })
  await ctx.close()
}
await browser.close()
if (!BEFORE) results.push(errors.length ? `FAIL console: ${errors.join(' | ')}` : 'PASS no console errors or warnings')
console.log(results.join('\n'))
if (results.some((r) => r.startsWith('FAIL'))) process.exit(1)
