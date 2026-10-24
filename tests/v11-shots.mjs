// v1.1 before/after screenshots. Usage: node tests/v11-shots.mjs <base-url> <prefix>   e.g. http://localhost:4174/calorie-app v11-before-
import { chromium } from 'playwright'
const BASE = (process.argv[2] ?? 'http://localhost:4174/calorie-app').replace(/\/$/, '')
const PREFIX = process.argv[3] ?? 'v11-shot-'
const OUT = new URL('../screenshots/', import.meta.url).pathname
import { STATE } from './v11-fixture.mjs'

const browser = await chromium.launch()
const errors = []
async function open(vw, vh, inset) {
  const ctx = await browser.newContext({ viewport: { width: vw, height: vh }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, reducedMotion: 'reduce' })
  const p = await ctx.newPage()
  p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
  await p.goto(BASE + '/')
  await p.evaluate((s) => { localStorage.clear(); localStorage.setItem('calorie-app:v1', JSON.stringify(s)); localStorage.setItem('calorie-app:backup', JSON.stringify({ lastExportAt: Date.now(), dismissedAt: null })) }, STATE)
  if (inset) await (await ctx.newCDPSession(p)).send('Emulation.setSafeAreaInsetsOverride', { insets: { top: 47, bottom: 34, left: 0, right: 0 } })
  return { ctx, p }
}
const shots = []
{ // History chart with the spike
  const { ctx, p } = await open(390, 844)
  await p.goto(BASE + '/history'); await p.getByTestId('chart').waitFor(); await p.waitForTimeout(300)
  await p.screenshot({ path: OUT + PREFIX + 'chart.png' }); shots.push(PREFIX + 'chart.png')
  await p.getByRole('button', { name: 'Protein' }).click(); await p.getByTestId('protein-chart').waitFor()
  await p.screenshot({ path: OUT + PREFIX + 'chart-protein.png' }); shots.push(PREFIX + 'chart-protein.png')
  await p.goto(BASE + '/nutrition'); await p.getByTestId('protein-progress').waitFor(); await p.waitForTimeout(300)
  await p.screenshot({ path: OUT + PREFIX + 'nutrition.png' }); shots.push(PREFIX + 'nutrition.png')
  await p.evaluate(() => { const m = document.querySelector('main'); m.scrollTop = m.scrollHeight }); await p.waitForTimeout(200)
  await p.screenshot({ path: OUT + PREFIX + 'nutrition-hints.png' }); shots.push(PREFIX + 'nutrition-hints.png')
  await ctx.close()
}
for (const [w, h, inset] of [[375, 667, false], [390, 844, true]]) { // bottom nav + button
  const { ctx, p } = await open(w, h, inset)
  await p.goto(BASE + '/'); await p.getByTestId('balance').waitFor(); await p.waitForTimeout(300)
  const name = `${PREFIX}nav-${w}x${h}.png`
  await p.screenshot({ path: OUT + name }); shots.push(name)
  const plus = await p.getByRole('button', { name: 'Log food' }).boundingBox()
  console.log(`${w}x${h}${inset ? ' (safe-area bottom 34)' : ''}: + button y ${Math.round(plus.y)}-${Math.round(plus.y + plus.height)} of ${h}`)
  await ctx.close()
}
console.log(shots.map((s) => 'screenshots/' + s).join('\n'))
if (errors.length) console.log('console errors:', errors)
await browser.close()
