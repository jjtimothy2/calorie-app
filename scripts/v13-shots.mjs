// v1.3 preview screenshots + demo recording. Usage: npm run build && npx vite preview --port 4174 & node scripts/v13-shots.mjs
import { chromium } from 'playwright'
import { mkdirSync, readdirSync, renameSync } from 'node:fs'
const BASE = (process.env.BASE_URL ?? 'http://localhost:4174/calorie-app').replace(/\/$/, '')
const OUT = new URL('../screenshots/', import.meta.url).pathname
const pad = (n) => String(n).padStart(2, '0')
const key = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const now = Date.now(), DAY = 86_400_000, T = key(new Date()), Y = key(new Date(now - DAY)), Y2 = key(new Date(now - 2 * DAY))
let n = 0
const e = (date, meal, name, kcal, protein, carbs, fat) => ({ id: 'e' + ++n, date, meal, foodId: null, name, servingLabel: '1 portion', servingMult: 1, qty: 1, kcal, protein, carbs, fat, createdAt: now - 1e6 + n })
const SEED = {
  version: 1,
  profile: { age: 31, sex: 'male', heightCm: 172, weightKg: 74, activity: 'light', goal: 'lose' },
  entries: [
    e(T, 'breakfast', 'Bubur ayam', 372, 18, 52, 10), e(T, 'breakfast', 'Kopi susu', 135, 4, 20, 4),
    e(T, 'lunch', 'Nasi padang rendang', 664, 30, 70, 28), e(T, 'snack', 'Pisang goreng', 210, 2, 32, 9),
    e(T, 'dinner', 'Sate ayam', 220, 21, 8, 11),
    e(Y, 'lunch', 'Nasi goreng', 620, 20, 80, 22), e(Y, 'dinner', 'Soto ayam', 380, 28, 30, 14), e(Y2, 'lunch', 'Mie ayam', 540, 22, 70, 18),
  ],
  exercises: [{ id: 'x1', date: T, activityId: null, name: 'Morning walk', minutes: 30, intensity: 'moderate', kcal: 140, createdAt: now - 5e5 }],
  closedDays: {}, favourites: [],
}
const seed = (p) => p.evaluate((s) => { localStorage.clear(); localStorage.setItem('calorie-app:v1', JSON.stringify(s)) }, SEED)
const errors = []
const b = await chromium.launch()
const shots = async (vw, vh, tag, reduce = 'reduce') => {
  const ctx = await b.newContext({ viewport: { width: vw, height: vh }, deviceScaleFactor: 2, hasTouch: vw < 600, isMobile: vw < 600, reducedMotion: reduce })
  const p = await ctx.newPage()
  p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) }); p.on('pageerror', (x) => errors.push(x.message))
  await p.goto(BASE + '/'); await seed(p); await p.goto(BASE + '/'); await p.waitForTimeout(300)
  await p.screenshot({ path: `${OUT}v13-today-${tag}.png` })
  await p.goto(BASE + '/nutrition'); await p.waitForTimeout(300)
  await p.screenshot({ path: `${OUT}v13-nutrition-${tag}.png` })
  await p.goto(BASE + '/'); await p.getByRole('button', { name: 'Close day' }).click(); await p.waitForURL(/\/day\//); await p.waitForTimeout(300)
  await p.screenshot({ path: `${OUT}v13-dayclose-${tag}.png` })
  await p.goto(BASE + '/log'); await p.waitForTimeout(300); await p.screenshot({ path: `${OUT}v13-log-${tag}.png` })
  await p.goto(BASE + '/settings'); await p.getByText('Developer').click(); await p.getByRole('button', { name: 'Load demo week' }).click(); await p.waitForURL(/history/); await p.waitForTimeout(300)
  await p.screenshot({ path: `${OUT}v13-sample-history-${tag}.png` })
  await p.goto(BASE + '/'); await p.waitForTimeout(300); await p.screenshot({ path: `${OUT}v13-sample-today-${tag}.png` })
  await p.goto(BASE + '/settings'); await p.waitForTimeout(300); await p.screenshot({ path: `${OUT}v13-settings-${tag}.png` })
  await ctx.close()
}
if (!process.env.VIDEO_ONLY) { await shots(390, 844, '390'); await shots(375, 667, '375'); await shots(1280, 800, '1280') }
// Demo recording with motion ON.
const vdir = '/tmp/v13-video'; mkdirSync(vdir, { recursive: true })
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, recordVideo: { dir: vdir, size: { width: 390, height: 844 } } })
const p = await ctx.newPage()
p.on('pageerror', (x) => errors.push(x.message))
await p.goto(BASE + '/'); await seed(p); await p.goto(BASE + '/'); await p.waitForTimeout(1800)
await p.getByTestId('plus').tap(); await p.waitForTimeout(900)
await p.getByRole('link', { name: /Today/ }).first().click().catch(() => p.goto(BASE + '/')); await p.waitForTimeout(800)
await p.getByRole('link', { name: 'Nutrition', exact: true }).first().click().catch(() => p.goto(BASE + '/nutrition')); await p.waitForTimeout(1800)
await p.mouse.wheel(0, 500); await p.waitForTimeout(900)
await p.goto(BASE + '/'); await p.waitForTimeout(900)
await p.getByRole('button', { name: 'Close day' }).click(); await p.waitForTimeout(2400)
await ctx.close()
const f = readdirSync(vdir).filter((x) => x.endsWith('.webm')).map((x) => `${vdir}/${x}`).pop()
renameSync(f, `${OUT}v13-demo.webm`)
await b.close()
console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no console errors')
