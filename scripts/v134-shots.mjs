// v1.3.4 Log screenshots + checks: sticky Quick add bar on Food and Exercise, hidden on a closed day. Usage: BASE_URL=https://jjtimothy2.github.io/calorie-app node scripts/v134-shots.mjs
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
for (const [width, height] of [[390, 844], [375, 667]]) {
  const ctx = await b.newContext({ viewport: { width, height }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, reducedMotion: 'reduce' })
  const p = await ctx.newPage()
  const tag = `${width}x${height}`
  p.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`${tag}: ${m.type()}: ${m.text()}`) }); p.on('pageerror', (x) => errors.push(`${tag}: ${x.message}`))
  const seed = async (s) => { await p.goto(BASE + '/'); await p.evaluate((s) => { localStorage.clear(); localStorage.setItem('calorie-app:v1', JSON.stringify(s)); localStorage.setItem('calorie-app:backup', JSON.stringify({ lastExportAt: Date.now(), dismissedAt: null })) }, s); await p.goto(BASE + '/'); await p.getByTestId('balance').waitFor() }
  await seed(SEED)
  const geo = () => p.evaluate(() => {
    const r = (s) => document.querySelector(s)?.getBoundingClientRect()
    const bar = r('[data-testid=qa-bar]'), main = r('main'), btn = r('[data-testid=qa-bar] button')
    return { barTop: Math.round(bar.top), barH: Math.round(bar.height), btnW: Math.round(btn.width), btnH: Math.round(btn.height), mainBottom: Math.round(main.bottom), vh: innerHeight, scrollX: document.documentElement.scrollWidth - innerWidth }
  })
  const out = {}
  for (const mode of ['food', 'exercise']) {
    await p.getByRole('link', { name: mode === 'food' ? 'Add to Lunch' : 'Add exercise' }).click()
    await p.getByTestId('qa-bar').waitFor(); await p.waitForTimeout(400)
    const label = (await p.getByTestId('qa-bar').innerText()).replace(/\s+/g, ' ')
    assert.equal(label, mode === 'food' ? '⚡ Quick add calories' : '⚡ Quick add burn')
    assert.equal(await p.getByRole('button', { name: 'Quick add', exact: true }).count(), 0)
    const g = await geo(); assert.ok(g.mainBottom <= g.barTop && Math.abs(g.barTop + g.barH - g.vh) <= 1 && g.scrollX <= 0, JSON.stringify(g))
    // Scrolled to the end, the last row and footnote sit fully above the bar.
    await p.locator('main').evaluate((m) => { m.scrollTop = m.scrollHeight }); await p.waitForTimeout(200)
    const last = await p.locator('main > :last-child').evaluate((el) => Math.round(el.getBoundingClientRect().bottom))
    assert.ok(last <= g.barTop, `last child ${last} above bar ${g.barTop}`)
    await p.locator('main').evaluate((m) => { m.scrollTop = 0 }); await p.waitForTimeout(200)
    await p.screenshot({ path: `${OUT}v134-log-${mode}-${tag}.png` })
    await p.getByTestId('qa-bar').getByRole('button').click()
    const dlg = p.getByRole('dialog'); await dlg.waitFor()
    out[mode] = { label, ...g, sheet: (await dlg.locator('h2').first().innerText()) }
    await p.keyboard.press('Escape'); await dlg.waitFor({ state: 'detached' })
    await p.getByRole('link', { name: /Close and go back/ }).click(); await p.getByTestId('balance').waitFor()
  }
  // Closed day: the bar is gone on both tabs.
  await seed({ ...SEED, closedDays: { [T]: { closedAt: now, bmr: 1900, movement: 0, burned: 140, eaten: 1272, balance: 768, goal: 380 } } })
  for (const mode of ['food', 'exercise']) {
    await p.goto(BASE + '/log' + (mode === 'exercise' ? '?mode=exercise' : '')); await p.getByTestId('day-locked').waitFor()
    assert.equal(await p.getByTestId('qa-bar').count(), 0, 'hidden on a closed day')
  }
  if (width === 390) await p.screenshot({ path: `${OUT}v134-log-closed-${tag}.png` })
  info[tag] = out
  await ctx.close()
}
console.log(JSON.stringify(info))
const p2 = await b.newPage(); const sw = await (await p2.request.get(BASE + '/sw.js')).text(); console.log('sw', sw.match(/v1\.[0-9.]+-[0-9a-f]{12}/)?.[0])
await b.close()
console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no console errors')
