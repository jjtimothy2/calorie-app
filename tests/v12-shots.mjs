// v1.2 Nutrition before/after shots at 390x844. Usage: node tests/v12-shots.mjs <base-url> <prefix>
// Writes <prefix>nutrition.png + nutrition-bottom.png (food logged today) and nutrition-empty.png + nutrition-empty-bottom.png (nothing today).
import { chromium } from 'playwright'
import { STATE } from './v11-fixture.mjs'
const BASE = (process.argv[2] ?? 'http://localhost:4174/calorie-app').replace(/\/$/, '')
const PREFIX = process.argv[3] ?? 'v12-shot-'
const OUT = new URL('../screenshots/', import.meta.url).pathname
const pad = (n) => String(n).padStart(2, '0')
const d = new Date(), TODAY = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const EMPTY = { ...STATE, entries: STATE.entries.filter((e) => e.date !== TODAY) }
const browser = await chromium.launch()
const shots = [], errors = []
for (const [state, tag] of [[STATE, ''], [EMPTY, '-empty']]) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, reducedMotion: 'reduce' })
  const p = await ctx.newPage()
  p.on('console', (m) => { if (m.type() === 'error' && !/status of 404/.test(m.text())) errors.push(m.text()) })
  await p.goto(BASE + '/')
  await p.evaluate((s) => { localStorage.clear(); localStorage.setItem('calorie-app:v1', JSON.stringify(s)); localStorage.setItem('calorie-app:backup', JSON.stringify({ lastExportAt: Date.now(), dismissedAt: null })) }, state)
  await p.goto(BASE + '/'); await p.getByTestId('balance').waitFor()
  await p.getByRole('link', { name: 'Nutrition', exact: true }).click()
  await p.getByTestId('protein-progress').waitFor(); await p.waitForTimeout(300)
  await p.screenshot({ path: `${OUT}${PREFIX}nutrition${tag}.png` }); shots.push(`${PREFIX}nutrition${tag}.png`)
  await p.evaluate(() => { const m = document.querySelector('main'); m.scrollTop = m.scrollHeight }); await p.waitForTimeout(200)
  await p.screenshot({ path: `${OUT}${PREFIX}nutrition${tag}-bottom.png` }); shots.push(`${PREFIX}nutrition${tag}-bottom.png`)
  await ctx.close()
}
console.log(shots.map((s) => 'screenshots/' + s).join('\n'))
if (errors.length) console.log('console errors:', errors)
await browser.close()
