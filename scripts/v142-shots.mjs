// v1.4.2 History screenshots: Balance week (Jordy's data), Protein week, Protein scrub, Protein 30 days.
// Test data only, never in the app. Usage: BASE_URL=https://jjtimothy2.github.io/calorie-app node scripts/v142-shots.mjs
import { chromium } from 'playwright'
import { chartTools } from '../tests/v14-chart.mjs'
import { seedJordy } from '../tests/v141-chart.mjs'
const BASE = (process.env.BASE_URL ?? 'http://localhost:4174/calorie-app').replace(/\/$/, '')
const OUT = new URL('../screenshots/', import.meta.url).pathname
const errors = []
const b = await chromium.launch()
const shot = async (p, name) => {
  const card = p.getByTestId('trend-chart').locator('xpath=ancestor::div[contains(@class,"rounded-[22px]")][1]')
  await card.evaluate((e) => e.scrollIntoView({ block: 'center' })); await p.waitForTimeout(150)
  await p.screenshot({ path: OUT + name })
}
for (const [width, height] of [[390, 844], [375, 667]]) {
  const tag = `${width}x${height}`
  const ctx = await b.newContext({ viewport: { width, height }, deviceScaleFactor: 3, hasTouch: true, isMobile: true })
  const p = await ctx.newPage()
  p.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`${tag}: ${m.type()}: ${m.text()}`) }); p.on('pageerror', (x) => errors.push(`${tag}: ${x.message}`))
  await seedJordy(p, BASE)
  const { touch, wait, box } = await chartTools(p, ctx)
  await wait(1300)
  await shot(p, `v142-balance-week-${tag}.png`)
  await p.getByRole('button', { name: 'Protein' }).click(); await wait(1300)
  await shot(p, `v142-protein-week-${tag}.png`)
  const r = await box(); const y = r.y + r.height * 0.45
  await touch('touchStart', r.x + r.width * 0.77, y); await wait(300)
  await shot(p, `v142-protein-scrub-${tag}.png`)
  await touch('touchEnd'); await wait(200)
  await p.getByRole('button', { name: /30d/ }).click(); await wait(1300)
  await shot(p, `v142-protein-30d-${tag}.png`)
  await ctx.close()
}
await b.close()
if (errors.length) { console.error(errors.join('\n')); process.exit(1) }
console.log('v142 shots done, no console errors')
