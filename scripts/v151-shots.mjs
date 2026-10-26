// v1.5.1 results sheet (carbs and fat) screenshots, 4 items, with mocked Gemini (no real key). Usage: node scripts/v151-shots.mjs
import { chromium } from 'playwright'
import { STATE } from '../tests/v11-fixture.mjs'
import { EST, PLATE, geminiOk, makePlate } from '../tests/v15-fixture.mjs'
const BASE = (process.env.BASE_URL ?? 'http://localhost:4174/calorie-app').replace(/\/$/, '')
const OUT = new URL('../screenshots/', import.meta.url).pathname
const errors = []
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' }
const b = await chromium.launch()
await makePlate(b)
for (const [width, height] of [[390, 844], [375, 667]]) {
  const tag = `${width}x${height}`
  const ctx = await b.newContext({ viewport: { width, height }, deviceScaleFactor: 3, hasTouch: true, isMobile: true, reducedMotion: 'reduce', serviceWorkers: 'block' })
  await ctx.addInitScript((s) => { if (!localStorage.getItem('calorie-app:v2')) localStorage.setItem('calorie-app:v1', JSON.stringify(s)) }, STATE)
  await ctx.route('https://generativelanguage.googleapis.com/**', (r) => r.request().method() === 'OPTIONS'
    ? r.fulfill({ status: 204, headers: CORS })
    : r.fulfill({ status: 200, contentType: 'application/json', headers: CORS, body: JSON.stringify(r.request().method() === 'GET' ? { name: 'models/x' } : geminiOk(EST)) }))
  const p = await ctx.newPage()
  p.on('console', (m) => { if ((m.type() === 'error' || m.type() === 'warning') && !/Service Worker registration blocked/.test(m.text())) errors.push(`${tag}: ${m.type()}: ${m.text()}`) })
  p.on('pageerror', (x) => errors.push(`${tag}: ${x.message}`))
  const dlg = p.getByRole('dialog')
  const shot = async (name) => { await p.waitForTimeout(250); await p.screenshot({ path: `${OUT}v151-${name}-${tag}.png` }) }

  await p.goto(BASE + '/settings')
  await p.getByTestId('ai-key').fill('AIzaSyD3m0-example-key-for-screenshot')
  await p.getByRole('button', { name: 'Save', exact: true }).click()
  await p.goto(BASE + '/log')
  const [fc] = await Promise.all([p.waitForEvent('filechooser'), p.getByRole('button', { name: 'Estimate from a photo' }).click()])
  await fc.setFiles(PLATE)
  await dlg.getByRole('button', { name: /Estimate/ }).waitFor()
  await dlg.getByRole('textbox').fill('Ate about half the rice')
  await dlg.getByRole('button', { name: 'Extra sambal' }).click()
  await p.evaluate(() => (document.activeElement)?.blur())
  await dlg.getByRole('button', { name: /Estimate/ }).click()
  await dlg.getByText('Estimated from your photo').waitFor()
  await p.evaluate(() => (document.activeElement)?.blur())
  await shot('results')
  // Scrolled to the total so the macro pills show on the short screen too.
  await dlg.getByRole('button', { name: 'Log 4 items' }).evaluate((e) => e.scrollIntoView({ block: 'end' }))
  await shot('results-total')
  await ctx.close()
}
await b.close()
if (errors.length) { console.error(errors.join('\n')); process.exit(1) }
console.log('v151 shots done, no console errors')
