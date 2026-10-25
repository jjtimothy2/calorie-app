// v1.3.2 screenshots + checks (92 kg man, BMR 1900, Movement off). Usage: BASE_URL=https://jjtimothy2.github.io/calorie-app node scripts/v132-shots.mjs
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
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, reducedMotion: 'reduce' })
const p = await ctx.newPage()
p.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`${m.type()}: ${m.text()}`) }); p.on('pageerror', (x) => errors.push(x.message))
await p.goto(BASE + '/'); await p.evaluate((s) => { localStorage.clear(); localStorage.setItem('calorie-app:v1', JSON.stringify(s)); localStorage.setItem('calorie-app:backup', JSON.stringify({ lastExportAt: Date.now(), dismissedAt: null })) }, SEED)
await p.goto(BASE + '/'); await p.getByTestId('balance').waitFor(); await p.waitForTimeout(400)
const prof = await p.evaluate(() => JSON.parse(localStorage.getItem('calorie-app:v2')).profile)
console.log('profile', JSON.stringify({ target: prof.target, dailyGoal: prof.dailyGoal, ringGoal: await p.getByTestId('ring-goal').innerText(), proteinLeft: await p.getByTestId('protein-left').innerText() }))
assert.deepEqual([prof.target, prof.dailyGoal], [1520, 380])
await p.goto(BASE + '/nutrition'); await p.getByTestId('cal-text').waitFor(); await p.waitForTimeout(400)
const nut = { cal: await p.getByTestId('cal-text').innerText(), note: await p.getByTestId('cal-note').innerText(), protein: await p.getByTestId('protein-progress').innerText(), carbs: await p.getByTestId('nutri-carbs-text').innerText(), fat: await p.getByTestId('nutri-fat-text').innerText(), split: await p.getByTestId('split').getAttribute('data-split'), splitTarget: await p.getByTestId('split').getAttribute('data-target'), hint: await p.getByTestId('targets-hint').innerText() }
console.log('nutrition', JSON.stringify(nut))
assert.match(nut.cal, /of 1,660 kcal/); assert.match(nut.protein, /of 147 g/); assert.match(nut.carbs, /of 204 g/); assert.match(nut.fat, /of 55 g/)
assert.match(nut.hint, /1,900 kcal \(your BMR\).*92 kg/)
await p.screenshot({ path: `${OUT}v132-nutrition.png` })
await p.getByRole('link', { name: 'Me', exact: true }).click(); await p.getByTestId('info-macros').waitFor()
const ph = (k) => p.locator(`input[name=macro-${k}]`).getAttribute('placeholder')
const off = [await ph('protein'), await ph('fat'), await ph('carbs'), await p.getByTestId('settings-target').innerText()]
await p.getByRole('switch', { name: /Include daily movement/ }).check()
const on = [await ph('protein'), await ph('fat'), await ph('carbs'), await p.getByTestId('settings-target').innerText()]
await p.getByRole('switch', { name: /Include daily movement/ }).uncheck()
console.log('me placeholders P/F/C/target off', off.join(' '), '| on (unsaved)', on.join(' '))
assert.deepEqual(off, ['147', '55', '204', '1,520 kcal']); assert.deepEqual(on, ['147', '73', '343', '2,090 kcal'])
await p.getByTestId('info-macros').scrollIntoViewIfNeeded()
await p.getByTestId('info-macros').click()
const dlg = p.getByRole('dialog', { name: 'Macro targets' }); await dlg.waitFor(); await p.waitForTimeout(500)
console.log('focused', await p.evaluate(() => document.activeElement?.textContent))
await p.screenshot({ path: `${OUT}v132-me-info.png` })
await p.keyboard.press('Escape'); await dlg.waitFor({ state: 'detached' })
await p.evaluate(() => window.scrollTo(0, 0)); await p.evaluate(() => document.querySelectorAll('main').forEach((m) => { m.scrollTop = 0 }))
await p.screenshot({ path: `${OUT}v132-me.png` })
const sw = await p.evaluate(async () => (await caches.keys()).join(','))
console.log('caches', sw)
await b.close()
console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no console errors')
