// v1.3.3 Me screenshots + checks (92 kg man, BMR 1900, Movement off). Usage: BASE_URL=https://jjtimothy2.github.io/calorie-app node scripts/v133-shots.mjs
import { chromium } from 'playwright'
import assert from 'node:assert/strict'
const BASE = (process.env.BASE_URL ?? 'http://localhost:4174/calorie-app').replace(/\/$/, '')
const OUT = new URL('../screenshots/', import.meta.url).pathname
const pad = (n) => String(n).padStart(2, '0')
const T = ((d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`)(new Date())
const now = Date.now()
let n = 0
const e = (meal, name, kcal, protein, carbs, fat) => ({ id: 'e' + ++n, date: T, meal, foodId: null, name, servingLabel: '1 portion', servingMult: 1, qty: 1, kcal, protein, carbs, fat, createdAt: now - 1e6 + n })
const SEED = {
  version: 1,
  profile: { age: 35, sex: 'male', heightCm: 180, weightKg: 92, activity: 'light', goal: 'lose', pace: 'standard', goalWeightKg: 80, bmr: 1900, bmrCustom: true, includeMovement: false, macros: { protein: null, carbs: null, fat: null } },
  entries: [e('breakfast', 'Bubur ayam', 372, 18, 52, 10), e('lunch', 'Gado-gado', 420, 18, 38, 22), e('dinner', 'Sate ayam', 220, 21, 8, 11), e('dinner', 'Nasi putih', 260, 5, 57, 1)],
  exercises: [{ id: 'x1', date: T, activityId: null, name: 'Morning walk', minutes: 30, intensity: 'moderate', kcal: 140, createdAt: now - 5e5 }],
  closedDays: {}, favourites: [],
}
const errors = []
const b = await chromium.launch()
const info = {}
for (const width of [390, 375]) {
  const ctx = await b.newContext({ viewport: { width, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, reducedMotion: 'reduce' })
  const p = await ctx.newPage()
  p.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`${width}: ${m.type()}: ${m.text()}`) }); p.on('pageerror', (x) => errors.push(`${width}: ${x.message}`))
  await p.goto(BASE + '/'); await p.evaluate((s) => { localStorage.clear(); localStorage.setItem('calorie-app:v1', JSON.stringify(s)); localStorage.setItem('calorie-app:backup', JSON.stringify({ lastExportAt: Date.now(), dismissedAt: null })) }, SEED)
  await p.goto(BASE + '/settings'); await p.getByTestId('info-bmr').waitFor(); await p.waitForTimeout(400)
  const sfx = width === 390 ? '' : '-375'
  const ids = await p.locator('[data-testid^=info-]').evaluateAll((els) => els.map((e) => e.dataset.testid))
  const lines = { pace: await p.getByTestId('pace-hint').innerText(), movement: await p.getByTestId('movement-hint').innerText(), target: await p.getByTestId('settings-target').innerText(), sum: await p.getByTestId('target-sum').innerText(), bmr: await p.getByTestId('bmr-calculated').innerText() }
  // No horizontal overflow, and every info button has a 44px tap area with a 20px icon.
  const geo = await p.evaluate(() => ({ scroll: document.documentElement.scrollWidth, inner: innerWidth, btns: [...document.querySelectorAll('[data-testid^=info-]')].map((e) => { const r = e.getBoundingClientRect(); const i = e.querySelector('svg').getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height), Math.round(i.width)] }) }))
  info[width] = { ids, lines, geo }
  assert.equal(ids.length, 5); assert.ok(geo.scroll <= geo.inner, 'no horizontal scroll')
  for (const [w, h, i] of geo.btns) assert.deepEqual([w, h, i], [44, 44, 20])
  assert.equal(lines.pace, 'About 380 kcal a day'); assert.equal(lines.sum, 'BMR 1,900 − 380 deficit')
  await p.screenshot({ path: `${OUT}v133-me-top${sfx}.png` })
  await p.locator('h2', { hasText: 'Daily balance' }).evaluate((el) => el.scrollIntoView({ block: 'start' })); await p.mouse.wheel(0, -60); await p.waitForTimeout(300)
  await p.screenshot({ path: `${OUT}v133-me-scrolled${sfx}.png` })
  await p.getByRole('switch', { name: /Include daily movement/ }).check()
  info[width].movementOn = { pace: await p.getByTestId('pace-hint').innerText(), sum: await p.getByTestId('target-sum').innerText(), target: await p.getByTestId('settings-target').innerText() }
  await p.screenshot({ path: `${OUT}v133-me-movement-on${sfx}.png` })
  await p.getByRole('switch', { name: /Include daily movement/ }).uncheck()
  await p.getByTestId('info-bmr').click()
  const dlg = p.getByRole('dialog', { name: 'BMR' }); await dlg.waitFor(); await p.waitForTimeout(500)
  info[width].focused = await p.evaluate(() => document.activeElement?.textContent)
  await p.screenshot({ path: `${OUT}v133-me-info${sfx}.png` })
  await p.keyboard.press('Escape'); await dlg.waitFor({ state: 'detached' })
  info[width].focusBack = await p.evaluate(() => document.activeElement?.getAttribute('aria-label'))
  await ctx.close()
}
console.log(JSON.stringify(info, null, 1))
const p2 = await b.newPage(); const sw = await (await p2.request.get(BASE + '/sw.js')).text(); console.log('sw', sw.match(/v1\.[0-9.]+-[0-9a-f]{12}/)?.[0])
await b.close()
console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no console errors')
