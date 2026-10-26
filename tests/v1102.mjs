// v1.10.2: History froze (blank screen) for a new user with no closed day. The 7-day average line had an empty path
// and Safari throws "The element's path is empty" when the draw-in animation measures it. Checks, with motion ON (the
// crash only happened when the line animates) and once with reduced motion: (1) a fresh user with 0 entries, (2) a
// user with only today's entries, (3) the same user after closing the first day. History shows the empty state and
// today, both chart views and both ranges render, Nutrition (Today and This week) and the day page render, no console
// errors. (4) A render crash shows the "Something went wrong" card with a 44 px Reload, not a blank screen.
// WebKit with touch at 390x844 and 375x667. Screenshots: screenshots/v1102-*.png.
// Usage: npm run build && npx vite preview --port 4174 & node tests/v1102.mjs
import { webkit, devices } from 'playwright'
import assert from 'node:assert/strict'

const BASE = (process.env.BASE_URL ?? 'http://localhost:4174/calorie-app').replace(/\/$/, '')
const OUT = new URL('../screenshots/', import.meta.url).pathname
const V2 = 'calorie-app:v2'
const pad = (n) => String(n).padStart(2, '0')
const key = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const TODAY = key(new Date())
const results = [], errors = []
const step = async (name, fn) => {
  const t = Date.now()
  try { await fn(); results.push(`PASS ${name} (${Date.now() - t} ms)`) } catch (e) { results.push(`FAIL ${name}: ${e.message}`); console.log(results.join('\n')); throw e }
}
const tall = async (loc, what) => { const b = await loc.boundingBox(); assert.ok(b && b.height >= 44 && b.width >= 44, `${what} is a 44 px target (${b && Math.round(b.width)}x${b && Math.round(b.height)})`) }
const noSideways = async (pg, what) => { const r = await pg.evaluate(() => [document.documentElement.scrollWidth, innerWidth]); assert.ok(r[0] <= r[1], `${what}: ${r[0]}px wide at ${r[1]}`) }
const noDash = async (loc, what) => assert.doesNotMatch(await loc.innerText(), /\u2014/, `${what} has no em dash`)

// A v2 state as the app writes it right after onboarding (male, 32, 175 cm, 92 kg, lose), plus today's meals.
const profile = { age: 32, sex: 'male', heightCm: 175, weightKg: 92, activity: 'light', goal: 'lose', pace: 'standard', bmr: 1859, bmrCustom: false, includeMovement: true, goalWeightKg: 92, macros: { protein: null, carbs: null, fat: null }, target: 2006, dailyGoal: 550 }
const e = (id, meal, name, kcal, protein, carbs, fat) => ({ id, date: TODAY, meal, foodId: null, name, servingLabel: '1 serving', servingMult: 1, qty: 1, kcal, protein, carbs, fat, createdAt: Date.now() - 3600_000 })
const TODAY_ONLY = { version: 2, profile, entries: [e('t1', 'breakfast', 'Nasi uduk', 420, 12, 60, 14), e('t2', 'lunch', 'Ayam bakar', 540, 42, 20, 30)], exercises: [], closedDays: {}, favourites: [] }

const browser = await webkit.launch()
for (const [width, height] of [[390, 844], [375, 667]]) {
  const tag = `${width}x${height}`
  // Motion ON by default: the bug only showed when the average line animates (reduced motion skipped it).
  const newCtx = async (seed, extra = {}) => {
    const c = await browser.newContext({ ...devices['iPhone 14'], viewport: { width, height }, deviceScaleFactor: 3, serviceWorkers: 'block', reducedMotion: 'no-preference', ...extra })
    if (seed) await c.addInitScript(([k, v]) => { if (!localStorage.getItem(k)) localStorage.setItem(k, v) }, [V2, JSON.stringify(seed)])
    return c
  }
  const watchErrors = (page, list = errors) => {
    page.on('console', (m) => { if ((m.type() === 'error' || m.type() === 'warning') && !/Service Worker registration blocked|service worker/i.test(m.text())) list.push(`${tag}: ${m.type()}: ${m.text()}`) })
    page.on('pageerror', (er) => list.push(`${tag}: pageerror: ${er.message}`))
  }
  const shotOf = (pg) => async (name) => { await pg.waitForTimeout(300); await pg.screenshot({ path: `${OUT}v1102-${name}-${tag}.png` }) }
  const link = (pg, name) => pg.getByRole('link', { name, exact: true })

  /** Opens History and checks it is not blank, both views and ranges, then Nutrition and today's day page. */
  const checkPages = async (pg, { empty, todayNote }) => {
    await link(pg, 'History').click()
    await pg.getByRole('heading', { name: 'History' }).waitFor({ timeout: 5000 })
    await pg.waitForTimeout(1100) // the draw-in runs 200 + 650 ms
    assert.equal(await pg.getByTestId('error-boundary').count(), 0, 'no crash card on History')
    assert.equal(await pg.getByTestId('history-empty').isVisible(), empty, `History empty state ${empty ? 'shown' : 'hidden'}`)
    if (empty) assert.match(await pg.getByTestId('history-empty').innerText(), /Your history shows up here after your first full day\./)
    const todayRow = pg.getByTestId('day-list').locator(`li[data-day="${TODAY}"]`)
    assert.match(await todayRow.innerText(), new RegExp(`Today[\\s\\S]*${todayNote}`), 'today is still listed')
    assert.ok(await pg.getByTestId('trend-line').count() === 1, 'chart is drawn')
    await noSideways(pg, 'History'); await noDash(pg.locator('main'), 'History')
    for (const r of ['30d (30 days)', '7d (7 days)']) { await pg.getByRole('button', { name: r }).click(); await pg.waitForTimeout(900) }
    await pg.getByRole('button', { name: 'Protein', exact: true }).click(); await pg.waitForTimeout(900)
    assert.ok(await pg.getByTestId('protein-list').locator(`li[data-day="${TODAY}"]`).isVisible(), 'protein view lists today')
    await pg.getByRole('button', { name: '30d (30 days)' }).click(); await pg.waitForTimeout(900)
    await pg.getByRole('button', { name: 'Balance', exact: true }).click(); await pg.getByRole('button', { name: '7d (7 days)' }).click(); await pg.waitForTimeout(900)
    assert.equal(await pg.getByTestId('error-boundary').count(), 0, 'no crash after switching views')
    // Nutrition: Today and This week.
    await link(pg, 'Nutrition').click(); await pg.getByRole('heading', { name: 'Nutrition' }).waitFor({ timeout: 5000 })
    await pg.getByRole('button', { name: 'This week' }).click().catch(async () => pg.getByText('This week', { exact: true }).click())
    await pg.waitForTimeout(900)
    assert.equal(await pg.getByTestId('error-boundary').count(), 0, 'no crash on Nutrition')
    assert.ok((await pg.locator('main').innerText()).length > 40, 'Nutrition has content')
    await noSideways(pg, 'Nutrition')
    // Today's day page.
    await pg.goto(`${BASE}/day/${TODAY}`); await pg.getByText(/Verdict/).first().waitFor({ timeout: 5000 })
    assert.equal(await pg.getByTestId('error-boundary').count(), 0, 'no crash on the day page')
    await pg.goto(BASE + '/'); await pg.getByTestId('eaten').waitFor()
  }

  for (const motion of ['no-preference', 'reduce']) {
    await step(`${tag} fresh user, 0 entries (motion ${motion}): onboarding, History shows the empty state and Today, no crash anywhere`, async () => {
      const ctx = await newCtx(null, { reducedMotion: motion }); const pg = await ctx.newPage(); watchErrors(pg)
      await pg.goto(BASE + '/')
      await pg.getByTestId('ob-start').click(); await pg.getByTestId('ob-sex-male').click()
      await pg.getByTestId('ob-age').fill('32'); await pg.getByTestId('ob-next').click()
      await pg.getByTestId('ob-height').fill('175'); await pg.getByTestId('ob-weight').fill('92'); await pg.getByTestId('ob-next').click()
      await pg.getByTestId('ob-goal-lose').click(); await pg.getByTestId('ob-watch-no').click(); await pg.getByTestId('ob-act-light').click()
      await pg.getByTestId('ob-next').click(); await pg.getByTestId('ob-next').click(); await pg.getByTestId('ob-skip').click()
      await pg.getByTestId('eaten').waitFor()
      const st = await pg.evaluate((k) => JSON.parse(localStorage.getItem(k)), V2)
      assert.equal(st.entries.length, 0); assert.deepEqual(st.closedDays, {})
      await link(pg, 'History').click(); await pg.getByTestId('history-empty').waitFor({ timeout: 5000 })
      await pg.waitForTimeout(1100)
      if (motion === 'no-preference') {
        await shotOf(pg)('history-empty')
        await tall(pg.getByRole('button', { name: 'Protein', exact: true }), 'Protein chip')
      }
      await pg.goto(BASE + '/'); await pg.getByTestId('eaten').waitFor()
      await checkPages(pg, { empty: true, todayNote: 'No logs' })
      await ctx.close()
    })
  }

  await step(`${tag} only today's entries, no closed day: History shows the empty state, today "Open, so far" with its pill`, async () => {
    const ctx = await newCtx(TODAY_ONLY); const pg = await ctx.newPage(); watchErrors(pg)
    await pg.goto(BASE + '/'); await pg.getByTestId('eaten').waitFor()
    await checkPages(pg, { empty: true, todayNote: 'Open, so far' })
    await link(pg, 'History').click(); await pg.getByTestId('history-empty').waitFor()
    assert.match(await pg.getByTestId('day-list').locator(`li[data-day="${TODAY}"]`).getByTestId('day-pill').innerText(), /Deficit|Surplus|Even/)
    assert.match(await pg.locator('main').innerText(), /No closed days yet/)
    await shotOf(pg)('history-today-only')
    await ctx.close()
  })

  await step(`${tag} after the first closed day: Close day on Home, then History drops the empty state and counts 1 closed day`, async () => {
    const ctx = await newCtx(TODAY_ONLY); const pg = await ctx.newPage(); watchErrors(pg)
    await pg.goto(BASE + '/'); await pg.getByTestId('eaten').waitFor()
    await pg.getByRole('button', { name: 'Close day' }).click()
    await pg.waitForURL(new RegExp(`/day/${TODAY}$`))
    await pg.goto(BASE + '/'); await pg.getByTestId('eaten').waitFor()
    const st = await pg.evaluate((k) => JSON.parse(localStorage.getItem(k)), V2)
    assert.ok(st.closedDays[TODAY], 'today is closed in storage'); assert.equal(st.version, 2); assert.equal(st.entries.length, 2)
    await checkPages(pg, { empty: false, todayNote: 'Closed' })
    await link(pg, 'History').click(); await pg.getByTestId('week-total').waitFor()
    assert.match(await pg.locator('main').innerText(), /1 closed day\b/)
    assert.ok(((await pg.getByTestId('trend-line').getAttribute('d')) ?? '').startsWith('M'), 'the average line has a path now')
    await pg.waitForTimeout(1100)
    await shotOf(pg)('history-first-closed')
    await ctx.close()
  })

  await step(`${tag} a render crash shows "Something went wrong" with a 44 px Reload, Reload brings the screen back`, async () => {
    const ctx = await newCtx(TODAY_ONLY)
    // Make History's render throw once (a stand-in for any render bug), only after the flag is set.
    await ctx.addInitScript(() => { const o = Date.prototype.toLocaleDateString; Date.prototype.toLocaleDateString = function (...a) { if (window.__boom) throw new Error('test crash'); return o.apply(this, a) } })
    const pg = await ctx.newPage(); const crashLog = []; watchErrors(pg, crashLog)
    await pg.goto(BASE + '/'); await pg.getByTestId('eaten').waitFor()
    await pg.evaluate(() => { window.__boom = true })
    await link(pg, 'History').click()
    const card = pg.getByTestId('error-boundary'); await card.waitFor({ timeout: 5000 })
    assert.match(await card.innerText(), /Something went wrong[\s\S]*Reload/)
    await tall(pg.getByTestId('error-reload'), 'Reload'); await tall(pg.getByRole('link', { name: 'Go to Today' }), 'Go to Today')
    await noSideways(pg, 'crash card'); await noDash(card, 'crash card')
    assert.ok(crashLog.every((l) => /test crash|Screen crashed/.test(l)), `only the test crash is logged: ${crashLog.join(' | ')}`)
    await shotOf(pg)('error-card')
    await pg.getByTestId('error-reload').click()
    await pg.getByRole('heading', { name: 'History' }).waitFor({ timeout: 8000 })
    assert.equal(await pg.getByTestId('error-boundary').count(), 0, 'History is back after Reload')
    await ctx.close()
  })
}
await browser.close()
console.log(results.join('\n'))
if (errors.length) { console.log('Console errors:\n' + errors.join('\n')); process.exit(1) }
console.log(`\n${results.length} steps passed, no console errors`)
