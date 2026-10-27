// v1.12: past days. Home has a ‹ › day switcher (never past today); a picked past day shows an amber "Editing
// Yesterday" note with Back to today on Home and "Adding to Yesterday" on Log. Food (Add Calories, edit, delete) and
// exercise (Quick add burn) go to that day. A closed past day stays closed and recalculates: its frozen baseline (BMR,
// movement, goal) is kept and eaten, burned, protein and balance follow the logs, so History and the verdict update.
// A past day's verdict has Edit day. Reloading always opens on today. v1.11-shaped data migrates to v3 (v1.13) with the same target and closed days; the v2 key is kept.
// WebKit with touch at 390x844 (motion on) and 375x667 (reduced motion). Screenshots: screenshots/v112-*.png.
// Usage: npm run build && npx vite preview --port 4174 & node tests/v112.mjs
import { webkit, devices } from 'playwright'
import assert from 'node:assert/strict'

const BASE = (process.env.BASE_URL ?? 'http://localhost:4174/calorie-app').replace(/\/$/, '')
const OUT = new URL('../screenshots/', import.meta.url).pathname
const V2 = 'calorie-app:v2'
const results = [], errors = []
const step = async (name, fn) => {
  const t = Date.now()
  try { await fn(); results.push(`PASS ${name} (${Date.now() - t} ms)`) } catch (e) { results.push(`FAIL ${name}: ${e.message}`); console.log(results.join('\n')); console.log(errors.join('\n')); throw e }
}
const noSideways = async (pg, what) => { const r = await pg.evaluate(() => [document.documentElement.scrollWidth, innerWidth]); assert.ok(r[0] <= r[1], `${what}: ${r[0]}px wide at ${r[1]}`) }
const noDash = async (loc, what) => assert.doesNotMatch(await loc.innerText(), /\u2014/, `${what} has no em dash`)

const pad = (n) => String(n).padStart(2, '0')
const key = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const ago = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return key(d) }
const TODAY = ago(0), YDAY = ago(1), TWO = ago(2)
const profile = { age: 32, sex: 'male', heightCm: 175, weightKg: 92, activity: 'light', goal: 'lose', pace: 'standard', bmr: 1859, bmrCustom: false, includeMovement: true, goalWeightKg: 92, macros: { protein: null, carbs: null, fat: null }, target: 2006, dailyGoal: 550 }
const e = (id, date, meal, name, kcal, protein = 0) => ({ id, date, meal, foodId: null, name, servingLabel: 'Quick add', servingMult: 1, qty: 1, kcal, protein, carbs: 0, fat: 0, createdAt: Date.now() - 86400_000 })
// Yesterday was closed at midnight with an older baseline (BMR 1,800 + movement 300, goal 500), as a v1.11 user has it.
const YSUM = { bmr: 1800, movement: 300, burned: 0, eaten: 1500, balance: 600, goal: 500, protein: 40, closedAt: Date.now() - 3600_000, auto: true }
const SEED = {
  version: 2, profile,
  entries: [e('t1', TODAY, 'breakfast', 'Nasi uduk', 420), e('y1', YDAY, 'lunch', 'Nasi padang', 900, 25), e('y2', YDAY, 'dinner', 'Soto ayam', 600, 15), e('d1', TWO, 'lunch', 'Gado gado', 700, 20)],
  exercises: [], closedDays: { [YDAY]: YSUM }, favourites: [],
}
const AI = JSON.stringify({ provider: 'gemini', key: 'test-key-not-real' })
const FOODS = JSON.stringify({ version: 1, foods: [] })

const browser = await webkit.launch()
for (const [width, height, motion] of [[390, 844, 'no-preference'], [375, 667, 'reduce']]) {
  const tag = `${width}x${height}`
  const ctx = await browser.newContext({ ...devices['iPhone 14'], viewport: { width, height }, deviceScaleFactor: 3, serviceWorkers: 'block', reducedMotion: motion })
  await ctx.addInitScript(([s, ai, foods]) => {
    if (!localStorage.getItem('calorie-app:v2')) { localStorage.setItem('calorie-app:v2', s); localStorage.setItem('calorie-app:ai', ai); localStorage.setItem('calorie-app:foods', foods) }
  }, [JSON.stringify(SEED), AI, FOODS])
  const page = await ctx.newPage()
  page.on('console', (m) => { if ((m.type() === 'error' || m.type() === 'warning') && !/service worker/i.test(m.text())) errors.push(`${tag}: ${m.type()}: ${m.text()}`) })
  page.on('pageerror', (er) => errors.push(`${tag}: pageerror: ${er.message}`))
  const shot = async (name) => { await page.waitForTimeout(motion === 'reduce' ? 300 : 900); await page.screenshot({ path: `${OUT}v112-${name}-${tag}.png` }) }
  const st = () => page.evaluate(() => JSON.parse(localStorage.getItem('calorie-app:v3')))
  const title = page.locator('#day-title')
  const dialog = page.getByRole('dialog')
  // the ring number ticks (motion on), so wait for it to settle
  const bal = (v) => page.waitForFunction((v) => document.querySelector('[data-testid=balance]')?.textContent === v, v, { timeout: 5000 })

  await step(`${tag} v1.11-shaped data loads: migrated to v3 (same target, v2 key kept), entries, yesterday's summary, AI and foods keys untouched; opens on Today`, async () => {
    await page.goto(`${BASE}/`)
    await title.waitFor()
    assert.equal(await title.innerText(), 'Today')
    assert.equal(await page.getByTestId('past-day-note').count(), 0)
    await page.getByText('Nasi uduk').waitFor()
    assert.ok(await page.getByTestId('day-next').isDisabled(), 'Next is disabled on today')
    const s = await st()
    // v1.13: migrated to v3 under calorie-app:v3 with the same daily target; the v2 key is left exactly as it was (a backup).
    assert.equal(s.version, 3)
    assert.deepEqual([s.profile.target, s.profile.dailyGoal, 'pace' in s.profile], [2006, 550, false])
    assert.equal(await page.evaluate(() => localStorage.getItem('calorie-app:v2')), JSON.stringify(SEED))
    assert.deepEqual(s.entries, SEED.entries)
    assert.equal(s.entries.length, 4)
    assert.deepEqual(s.closedDays[YDAY], YSUM)
    assert.ok(s.closedDays[TWO], 'two days ago (logged, never closed) is auto-closed on load, as before')
    assert.equal(await page.evaluate(() => localStorage.getItem('calorie-app:ai')), AI)
    assert.equal(await page.evaluate(() => localStorage.getItem('calorie-app:foods')), FOODS)
  })

  await step(`${tag} ‹ goes to Yesterday: title, amber note with Back to today, closed pill says it updates, no streak, rows editable`, async () => {
    await page.getByTestId('day-prev').click()
    await page.waitForFunction(() => document.querySelector('#day-title')?.textContent === 'Yesterday')
    const note = page.getByTestId('past-day-note')
    assert.match(await note.innerText(), /Editing Yesterday/)
    assert.match(await note.innerText(), /goes to this day/)
    await noDash(note, 'note')
    assert.equal(await page.getByTestId('streak').count(), 0)
    assert.match(await page.getByTestId('closed-pill').innerText(), /Closed · updates as you edit/)
    await bal('600')
    assert.equal(await page.getByText('Nasi uduk').count(), 0, "today's food is not on yesterday")
    assert.ok(await page.getByRole('button', { name: /Edit Nasi padang/ }).isEnabled())
    assert.equal(await page.getByTestId('day-next').isDisabled(), false)
    // contrast of the note text on its background (carbs-ink on carbs-soft), at least 4.5:1
    const ratio = await note.evaluate((el) => {
      const rgb = (s) => s.match(/\d+/g).slice(0, 3).map(Number)
      const L = (c) => { const [r, g, b] = c.map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 }); return 0.2126 * r + 0.7152 * g + 0.0722 * b }
      const cs = getComputedStyle(el), a = L(rgb(cs.color)), b = L(rgb(cs.backgroundColor))
      return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
    })
    assert.ok(ratio >= 4.5, `note contrast ${ratio.toFixed(2)}`)
    await noSideways(page, 'Home yesterday')
    await page.evaluate(() => document.querySelector('main').scrollTo(0, 0))
    await shot('home-yesterday')
  })

  await step(`${tag} add exercise to yesterday: Log says "Adding to Yesterday", Quick add burn goes to yesterday, the closed summary recalculates with its old baseline`, async () => {
    await page.getByRole('link', { name: 'Add exercise' }).click()
    await page.getByTestId('qa-bar').waitFor()
    assert.match(await page.getByTestId('past-day-note').innerText(), /Adding to Yesterday/)
    await noSideways(page, 'Log yesterday')
    await shot('log-exercise-yesterday')
    await page.getByTestId('qa-btn').click()
    await dialog.locator('input[name=burn]').fill('350')
    await dialog.locator('input[name=exname]').fill('Evening run (watch)')
    await shot('quick-burn-yesterday')
    await dialog.getByRole('button', { name: 'Add 350 kcal' }).click()
    await page.waitForURL(BASE + '/'); await page.getByTestId('toast').waitFor() // v1.13.2: logs land on Home, on the day logged to
    const s = await st()
    const ex = s.exercises.find((x) => x.name === 'Evening run (watch)')
    assert.equal(ex.date, YDAY)
    assert.deepEqual(s.closedDays[YDAY], { ...YSUM, burned: 350, balance: 950 }, 'baseline kept, burn and balance updated')
    await page.waitForFunction(() => document.querySelector('#day-title')?.textContent === 'Yesterday')
    await bal('950')
    await page.getByRole('button', { name: /Edit Evening run \(watch\), 350 kcal burned/ }).waitFor()
  })

  await step(`${tag} add food to yesterday from + Add, then edit it and delete another entry; totals follow`, async () => {
    await page.getByRole('link', { name: 'Add to Snacks' }).click()
    await page.getByTestId('qa-bar').waitFor()
    assert.match(await page.getByTestId('past-day-note').innerText(), /Adding to Yesterday/)
    await page.getByTestId('qa-btn').click()
    await dialog.locator('input[name=kcal]').fill('250')
    await dialog.locator('input[name=name]').fill('Pisang goreng')
    await dialog.getByRole('button', { name: 'Add 250 kcal' }).click()
    await page.waitForURL(BASE + '/'); await page.getByTestId('toast').waitFor() // v1.13.2: logs land on Home, on the day logged to
    let s = await st()
    assert.equal(s.entries.find((x) => x.name === 'Pisang goreng').date, YDAY)
    assert.equal(s.closedDays[YDAY].eaten, 1750)
    assert.equal(s.closedDays[YDAY].balance, 700)
    await title.waitFor()
    // edit
    await page.getByRole('button', { name: /Edit Pisang goreng/ }).click()
    await dialog.locator('input[name=kcal]').fill('300')
    await dialog.getByRole('button', { name: 'Save' }).click()
    await dialog.waitFor({ state: 'detached' })
    // delete
    await page.getByRole('button', { name: /Edit Soto ayam/ }).click()
    await dialog.getByRole('button', { name: /Delete/ }).first().click()
    const confirm = dialog.getByRole('button', { name: /Delete/ })
    if (await dialog.count() && await confirm.count()) await confirm.last().click().catch(() => {})
    await page.waitForFunction(() => !document.body.innerText.includes('Soto ayam'))
    s = await st()
    assert.equal(s.entries.some((x) => x.id === 'y2'), false)
    assert.deepEqual(s.closedDays[YDAY], { ...YSUM, burned: 350, eaten: 1200, protein: 25, balance: 1250 })
    await bal('1,250')
  })

  await step(`${tag} History and the verdict show the recalculated day; Edit day opens it on Home`, async () => {
    await page.getByRole('link', { name: 'History' }).click()
    const row = page.locator(`[data-day="${YDAY}"]`).last()
    await row.waitFor()
    assert.match(await row.innerText(), /Closed/)
    assert.match(await row.getByTestId('day-pill').innerText(), /Deficit 1,250/)
    await row.getByRole('link').click()
    await page.getByTestId('verdict-balance').waitFor()
    assert.match(await page.getByTestId('verdict-balance').innerText(), /1,250 deficit/)
    assert.equal(await page.getByTestId('verdict-bmr').innerText(), '1,800')
    await page.getByTestId('edit-day').waitFor()
    await shot('verdict-edit-day')
    await page.getByTestId('edit-day').click()
    await page.waitForFunction(() => document.querySelector('#day-title')?.textContent === 'Yesterday')
    await page.getByTestId('past-day-note').waitFor()
  })

  await step(`${tag} ‹ again goes two days back with its own note; › comes back to Yesterday`, async () => {
    await page.getByTestId('day-prev').click()
    await page.waitForFunction((t) => document.querySelector('#day-title')?.textContent !== 'Yesterday', TWO)
    assert.match(await page.getByTestId('past-day-note').innerText(), /Editing /)
    await page.getByTestId('day-next').click()
    await page.waitForFunction(() => document.querySelector('#day-title')?.textContent === 'Yesterday')
  })

  await step(`${tag} Back to today: title Today, no note, today's food untouched; + logs to today`, async () => {
    await page.getByTestId('back-to-today').click()
    await page.waitForFunction(() => document.querySelector('#day-title')?.textContent === 'Today')
    assert.equal(await page.getByTestId('past-day-note').count(), 0)
    await page.getByText('Nasi uduk').waitFor()
    assert.ok(await page.getByTestId('streak').isVisible())
    await page.getByTestId('plus').click()
    await page.getByTestId('qa-bar').waitFor()
    assert.equal(await page.getByTestId('past-day-note').count(), 0)
    await page.getByTestId('qa-btn').click()
    await dialog.locator('input[name=kcal]').fill('100')
    await dialog.getByRole('button', { name: 'Add 100 kcal' }).click()
    await page.waitForURL(BASE + '/'); await page.getByTestId('toast').waitFor() // v1.13.2: logs land on Home, on the day logged to
    const s = await st()
    const last = [...s.entries].sort((a, b) => b.createdAt - a.createdAt)[0]
    assert.equal(last.date, TODAY)
    assert.equal(s.closedDays[TODAY], undefined)
    await title.waitFor()
    await page.getByTestId('toast').waitFor({ state: 'detached', timeout: 8000 })
    await page.evaluate(() => document.querySelector('main').scrollTo(0, 0))
    await shot('home-today')
  })

  await step(`${tag} a reload while on a past day opens on Today`, async () => {
    await page.getByTestId('day-prev').click()
    await page.waitForFunction(() => document.querySelector('#day-title')?.textContent === 'Yesterday')
    await page.reload()
    await title.waitFor()
    assert.equal(await title.innerText(), 'Today')
    assert.equal(await page.getByTestId('past-day-note').count(), 0)
    const s = await st()
    assert.equal(s.version, 3)
    assert.deepEqual([s.closedDays[YDAY].bmr, s.closedDays[YDAY].movement, s.closedDays[YDAY].goal], [1800, 300, 500], 'the closed baseline is kept')
    assert.equal(s.closedDays[YDAY].balance, 1250, 'the recalculated day survives a reload')
  })

  await step(`${tag} today closed stays locked (Reopen day), as before`, async () => {
    await page.getByRole('button', { name: 'Close day' }).click()
    await page.getByTestId('verdict-pill').waitFor()
    assert.equal(await page.getByTestId('edit-day').count(), 0)
    await page.goto(`${BASE}/`)
    await title.waitFor()
    assert.equal(await page.getByRole('link', { name: 'Add exercise' }).count(), 0)
    await page.getByRole('button', { name: 'Reopen day' }).click()
    await page.getByRole('link', { name: 'Add exercise' }).waitFor()
  })
  await ctx.close()
}
await browser.close()
console.log(results.join('\n'))
if (errors.length) { console.log('Console errors:\n' + errors.join('\n')); process.exit(1) }
console.log(`\n${results.length} checks passed, no console errors.`)
