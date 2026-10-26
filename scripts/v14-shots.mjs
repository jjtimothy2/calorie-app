// v1.4 History chart screenshots (seeded test history, never in the app). Usage: BASE_URL=https://jjtimothy2.github.io/calorie-app node scripts/v14-shots.mjs
import { chromium } from 'playwright'
import { seedHistory, chartTools } from '../tests/v14-chart.mjs'
const BASE = (process.env.BASE_URL ?? 'http://localhost:4174/calorie-app').replace(/\/$/, '')
const OUT = new URL('../screenshots/', import.meta.url).pathname
const errors = []
const b = await chromium.launch()
const cardClip = async (p) => {
  const card = p.getByTestId('trend-chart').locator('xpath=ancestor::div[contains(@class,"rounded-[22px]")][1]')
  await card.scrollIntoViewIfNeeded()
  const r = await card.boundingBox(); const vp = p.viewportSize()
  return { x: 0, y: Math.max(0, r.y - 60), width: vp.width, height: Math.min(vp.height - Math.max(0, r.y - 60), r.height + 80) }
}
for (const [width, height, mobile] of [[390, 844, true], [375, 667, true], [1440, 900, false]]) {
  const tag = mobile ? `${width}x${height}` : 'desktop'
  const ctx = await b.newContext({ viewport: { width, height }, deviceScaleFactor: 2, hasTouch: true, isMobile: mobile })
  const p = await ctx.newPage()
  p.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`${tag}: ${m.type()}: ${m.text()}`) }); p.on('pageerror', (x) => errors.push(`${tag}: ${x.message}`))
  await seedHistory(p, BASE)
  const { touch, wait, box, swipe } = await chartTools(p, ctx)
  await wait(1200)
  await p.screenshot({ path: `${OUT}v14-history-${tag}.png` })
  // Scrub (held), screenshot while holding.
  const r = await box(); const y = r.y + r.height * 0.45
  await touch('touchStart', r.x + r.width * 0.45, y); await wait(260)
  for (let s = 1; s <= 10; s++) { await touch('touchMove', r.x + r.width * (0.45 + 0.02 * s), y); await wait(30) }
  await wait(200)
  await p.screenshot({ path: `${OUT}v14-scrub-${tag}.png`, ...(mobile ? { clip: await cardClip(p) } : {}) })
  await touch('touchEnd'); await wait(200)
  await swipe(+1)
  await p.screenshot({ path: `${OUT}v14-week-back-${tag}.png`, ...(mobile ? { clip: await cardClip(p) } : {}) })
  await swipe(-1)
  await p.getByRole('button', { name: /30d/ }).click(); await wait(1300)
  await p.screenshot({ path: `${OUT}v14-30d-${tag}.png`, ...(mobile ? { clip: await cardClip(p) } : {}) })
  await ctx.close()
}
await b.close()
console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'v14 shots done, no console errors')
