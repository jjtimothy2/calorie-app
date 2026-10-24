// v1.2.1 after shots at 390x844. Usage: node tests/v121-shots.mjs <base-url>
// Writes screenshots/v121-nutrition.png (protein ring with the % label) and screenshots/v121-home-movement-off.png
// (Home with Movement off: "Base burn 1,920" in the equation, goal 384).
import { chromium } from 'playwright'
import assert from 'node:assert/strict'
import { STATE } from './v11-fixture.mjs'
const BASE = (process.argv[2] ?? 'http://localhost:4174/calorie-app').replace(/\/$/, '')
const OUT = new URL('../screenshots/', import.meta.url).pathname
const browser = await chromium.launch()
const errors = []
const open = async (state) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, reducedMotion: 'reduce' })
  const p = await ctx.newPage()
  p.on('console', (m) => { if (m.type() === 'error' && !/status of 404/.test(m.text())) errors.push(m.text()) })
  await p.goto(BASE + '/')
  await p.evaluate((s) => { localStorage.clear(); localStorage.setItem('calorie-app:v1', JSON.stringify(s)); localStorage.setItem('calorie-app:backup', JSON.stringify({ lastExportAt: Date.now(), dismissedAt: null })) }, state)
  await p.goto(BASE + '/'); await p.getByTestId('balance').waitFor()
  return { ctx, p }
}
const top = (p) => p.evaluate(() => { document.querySelectorAll('main, #root > div > div').forEach((el) => { el.scrollTop = 0 }); window.scrollTo(0, 0) })
{
  const { ctx, p } = await open(STATE)
  await p.getByRole('link', { name: 'Nutrition', exact: true }).click()
  await p.getByTestId('protein-ring-label').waitFor(); await p.waitForTimeout(300)
  console.log('ring label:', await p.getByTestId('protein-ring-label').innerText(), '| caption:', await p.getByTestId('protein-progress').innerText())
  assert.equal(await p.getByTestId('nutri-protein').count(), 0)
  await p.getByTestId('protein-ring-label').scrollIntoViewIfNeeded()
  await p.screenshot({ path: OUT + 'v121-nutrition.png' })
  await ctx.close()
}
{
  const { ctx, p } = await open({ ...STATE, profile: { ...STATE.profile, includeMovement: false } })
  await top(p); await p.waitForTimeout(300)
  const terms = await p.locator('[data-testid=equation] [data-term]').evaluateAll((els) => els.map((e) => `${e.getAttribute('data-term')} ${e.querySelector('b').textContent}`))
  console.log('equation:', terms.join(' | '), '| ring:', await p.getByTestId('ring-goal').innerText())
  assert.equal(terms[0], 'Base burn 1,920')
  await p.screenshot({ path: OUT + 'v121-home-movement-off.png' })
  await ctx.close()
}
console.log('screenshots/v121-nutrition.png\nscreenshots/v121-home-movement-off.png')
if (errors.length) { console.log('console errors:', errors); process.exitCode = 1 }
await browser.close()
