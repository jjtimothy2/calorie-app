// Live-site check for GitHub Pages. Usage: node tests/live.mjs [url]
import { chromium } from 'playwright'
import assert from 'node:assert/strict'
import { chartChecks } from './v14-chart.mjs'
import { v141Checks } from './v141-chart.mjs'
import { v142Checks } from './v142-chart.mjs'
const BASE = (process.argv[2] ?? 'https://jjtimothy2.github.io/calorie-app').replace(/\/$/, '')
const OUT = new URL('../screenshots/', import.meta.url).pathname
const errors = [], results = []
const step = async (n, fn) => { try { await fn(); results.push('PASS ' + n) } catch (e) { results.push('FAIL ' + n + ': ' + e.message); console.log(results.join('\n')); console.log(errors); process.exit(1) } }
const watch = (p) => { p.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`${m.type()}: ${m.text()} @ ${p.url()}`) }); p.on('pageerror', (e) => errors.push('pageerror: ' + e.message)); p.on('requestfailed', (r) => errors.push('requestfailed: ' + r.url())) }
const top = (p) => p.evaluate(() => { document.querySelectorAll('main, #root > div > div').forEach((el) => { el.scrollTop = 0 }); window.scrollTo(0, 0) })
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, reducedMotion: 'reduce' })
const page = await ctx.newPage(); watch(page)
await step('loads, redirects to onboarding, onboard to Home', async () => {
  const r = await page.goto(BASE + '/'); assert.equal(r.status(), 200)
  await page.waitForURL('**/calorie-app/onboarding')
  await page.getByRole('button', { name: 'Female' }).click()
  await page.fill('input[name=age]', '30'); await page.fill('input[name=heightCm]', '165'); await page.fill('input[name=weightKg]', '68')
  await page.getByRole('button', { name: 'Next' }).click()
  await page.getByRole('button', { name: 'Lose weight' }).click()
  await page.getByLabel(/Light \(exercise/).check()
  assert.equal(await page.getByTestId('pace').getByRole('button').count(), 3) // pace picker (v1.1+)
  await page.getByRole('button', { name: 'See my target' }).click()
  assert.equal(Number((await page.getByTestId('target').innerText()).replace(/\D/g, '')), 1200) // v1.3.1+: movement off -> BMR 1400 - 280 (20% cap) = 1120, held at the 1,200 floor
  await page.getByRole('button', { name: 'Start logging' }).click()
  await page.waitForURL(BASE + '/')
  await page.getByTestId('balance').waitFor()
  assert.equal(await page.getByTestId('eq-movement').count(), 0)
  // v1.3.1+: Home counts plain BMR with movement off; Lose at the floor: goal = 1400 - 1200 = 200.
  assert.equal(Number((await page.getByTestId('eq-bmr').innerText()).replace(/\D/g, '')), 1400)
  assert.match(await page.getByTestId('ring-goal').innerText(), /goal 200/)
  const st = await page.evaluate(() => JSON.parse(localStorage.getItem('calorie-app:v2')))
  assert.deepEqual([st.version, st.profile.includeMovement, st.profile.pace, st.profile.goalWeightKg], [2, false, 'standard', 68])
})
await step('load demo week (sample data) via Me > Developer', async () => {
  await page.getByRole('link', { name: 'Me', exact: true }).click()
  await page.waitForURL(BASE + '/settings')
  await page.locator('[data-testid=developer] summary').click()
  await page.getByRole('button', { name: 'Load demo week' }).click()
  await page.waitForURL(BASE + '/history')
})
await step('manifest and service worker', async () => {
  const href = await page.evaluate(() => document.querySelector('link[rel=manifest]').href)
  assert.equal(href, BASE + '/manifest.webmanifest')
  const m = await (await page.request.get(href)).json()
  assert.equal(new URL(m.start_url, href).href, BASE + '/')
  assert.equal(new URL(m.scope, href).href, BASE + '/')
  for (const i of m.icons) assert.equal((await page.request.get(new URL(i.src, href).href)).status(), 200, i.src)
  assert.match(await (await page.request.get(BASE + '/sw.js')).text(), /'v1\.6\.1-[0-9a-f]{12}'/) // v1.6.1 build is live
  const sw = await page.evaluate(async () => (await navigator.serviceWorker.ready).active.scriptURL)
  assert.equal(sw, BASE + '/sw.js')
  await page.reload()
  assert.equal(await page.evaluate(() => navigator.serviceWorker.controller?.scriptURL), BASE + '/sw.js')
  const cdp = await ctx.newCDPSession(page)
  const inst = await cdp.send('Page.getInstallabilityErrors')
  assert.deepEqual(inst.installabilityErrors, [])
})
await step('data persists on reload', async () => {
  const before = await page.evaluate(() => localStorage.getItem('calorie-app:v2'))
  assert.ok(JSON.parse(before).profile && JSON.parse(before).entries.length > 0)
  await page.reload()
  assert.equal(await page.evaluate(() => localStorage.getItem('calorie-app:v2')), before)
  await page.goto(BASE + '/'); await page.getByTestId('balance').waitFor()
})
const day = await page.evaluate(() => { const d = new Date(Date.now() - 86400000); const p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}` })
const routes = [['/', 'balance'], ['/log', null], ['/log?mode=exercise', null], ['/history', 'chart'], ['/nutrition', 'protein-progress'], ['/settings', 'developer'], [`/day/${day}`, 'verdict-number']]
const cold = []
await step('cold visit (no SW yet): every route deep-link loads and survives refresh', async () => {
  const state = await ctx.storageState()
  const c2 = await browser.newContext({ viewport: { width: 390, height: 844 }, storageState: state })
  const p2 = await c2.newPage()
  p2.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') cold.push(`${m.type()}: ${m.text()} @ ${p2.url()}`) })
  p2.on('pageerror', (e) => cold.push('pageerror: ' + e.message))
  for (const [r, tid] of routes) {
    const res = await p2.goto(BASE + r)
    assert.ok([200, 404].includes(res.status()), r + ' ' + res.status()) // GitHub Pages serves 404.html (the app shell) for deep links
    await p2.waitForURL(BASE + r)
    if (tid) await p2.getByTestId(tid).waitFor({ timeout: 10000 })
    await p2.reload(); await p2.waitForURL(BASE + r)
    if (tid) await p2.getByTestId(tid).waitFor({ timeout: 10000 })
    results.push(`  ${r} -> HTTP ${res.status()}, rendered`)
  }
  await c2.close()
  results.push(`  cold console: ${cold.length} (${cold.filter((e) => !/status of 404/.test(e)).length} other than GitHub Pages' 404 status on deep links)`)
  assert.deepEqual(cold.filter((e) => !/status of 404/.test(e)), [])
})
await step('installed/returning (SW controls): every route deep-link + refresh, zero console errors', async () => {
  for (const [r, tid] of routes) {
    const res = await page.goto(BASE + r)
    assert.equal(res.status(), 200, r)
    if (tid) await page.getByTestId(tid).waitFor({ timeout: 10000 })
    await page.reload(); if (tid) await page.getByTestId(tid).waitFor({ timeout: 10000 })
  }
})
await step('sample meals and exercise for today', async () => {
  await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('calorie-app:v2'))
    const p = (n) => String(n).padStart(2, '0'); const d = new Date(); const date = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; const t = Date.now()
    const e = (id, meal, name, servingLabel, kcal, protein, carbs, fat) => ({ id, date, meal, foodId: null, name, servingLabel, servingMult: 1, qty: 1, kcal, protein, carbs, fat, createdAt: t })
    s.entries.push(e('live1', 'breakfast', 'Greek yoghurt with berries', '1 bowl', 260, 20, 30, 6), e('live2', 'lunch', 'Chicken rice', '1 plate', 610, 38, 72, 16), e('live3', 'snack', 'Banana', '1 medium', 105, 1, 27, 0))
    s.exercises.push({ id: 'livex', date, activityId: null, name: 'Badminton', minutes: 45, intensity: 'moderate', kcal: 330, createdAt: t })
    localStorage.setItem('calorie-app:v2', JSON.stringify(s))
  })
  await page.goto(BASE + '/'); await page.getByTestId('balance').waitFor()
  await page.getByText('Chicken rice').first().waitFor()
})
await step('v1.2 Nutrition: calories card, macro %, split bar', async () => {
  await page.goto(BASE + '/nutrition'); await page.getByTestId('cal-card').waitFor()
  assert.match(await page.getByTestId('cal-text').innerText(), /^Eaten [\d,]+ of [\d,]+ kcal, \d+%/)
  assert.equal(await page.getByTestId('nutri-protein').count(), 0) // v1.2.1: protein only in the ring
  assert.match(await page.getByTestId('protein-ring-label').innerText(), /^of \d+ g, \d+%$/)
  assert.match(await page.getByTestId('protein-progress').innerText(), /^\d+ of \d+ g, \d+%$/)
  const sp = (await page.getByTestId('split').getAttribute('data-split')).split('/').map(Number)
  assert.equal(sp[0] + sp[1] + sp[2], 100)
})
await step('mobile screenshot', async () => { await page.goto(BASE + '/'); await page.getByTestId('balance').waitFor(); await page.waitForTimeout(500); await top(page); await page.screenshot({ path: OUT + 'live-mobile.png' }) })
await step('desktop screenshot', async () => {
  const d = await browser.newContext({ viewport: { width: 1440, height: 900 }, storageState: await ctx.storageState(), reducedMotion: 'reduce' })
  const dp = await d.newPage(); watch(dp)
  await dp.goto(BASE + '/'); await dp.getByTestId('balance').waitFor(); await dp.waitForTimeout(500); await top(dp)
  await dp.screenshot({ path: OUT + 'live-desktop.png' }); await d.close()
})
await step('v1.4 History chart: average line, hold to scrub, swipe paging, today edge, vertical scroll, haptics log', async () => {
  const c = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true })
  const p = await c.newPage(); watch(p)
  results.push('  ' + JSON.stringify(await chartChecks(p, c, BASE)))
  await c.close()
})
await step('v1.4.1 History chart: Jordy week to scale, labels on every bar, surplus week, 30 days, open day past the scale, no cap line', async () => {
  const c = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })
  const p = await c.newPage(); watch(p)
  results.push('  ' + JSON.stringify(await v141Checks(p, c, BASE)))
  await c.close()
})
await step('v1.4.2 History: goal line only, Protein chart labels/solid vs light/target line, scrub, swipe, shared period, scale never clips', async () => {
  const c = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })
  const p = await c.newPage(); watch(p)
  results.push('  ' + JSON.stringify(await v142Checks(p, c, BASE)))
  await c.close()
})
if (errors.length) results.push(...errors.map((e) => '  ' + e))
await step('no console errors or warnings (onboarding, demo data, SW-controlled routes, screenshots)', async () => assert.deepEqual(errors, []))
console.log(results.join('\n'))
await browser.close()
