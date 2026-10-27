// Checks the single-file build from file://: onboarding, v1 balance, v2 protein, hash routes, persistence across reload.
// Usage: npm run build:single && node tests/single.mjs
import { chromium } from 'playwright'
import assert from 'node:assert/strict'
import { resolve } from 'node:path'

const FILE = 'file://' + resolve('dist-single/calorie-app-prototype-v2.html')
const errors = []
const results = []
const step = async (name, fn) => {
  const t = Date.now()
  try { await fn(); results.push(`PASS ${name} (${Date.now() - t} ms)`) } catch (e) { results.push(`FAIL ${name}: ${e.message}`); throw e }
}
const num = async (loc) => Number((await loc.innerText()).replace(/[^0-9]/g, ''))
const browser = await chromium.launch()
try {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
  const page = await ctx.newPage()
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`${m.type()}: ${m.text()}`) })
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
  page.on('requestfailed', (r) => errors.push(`requestfailed: ${r.url()}`))
  page.on('dialog', (d) => d.accept())

  await step('loads from file:// and routes with the hash', async () => {
    await page.goto(FILE)
    await page.waitForURL('**#/onboarding')
    await page.getByTestId('ob-start').click()
    await page.getByTestId('ob-sex-female').click()
    await page.fill('input[name=age]', '30')
    await page.getByTestId('ob-next').click()
    await page.fill('input[name=heightCm]', '165')
    await page.fill('input[name=weightKg]', '68')
    await page.getByTestId('ob-next').click()
    await page.getByTestId('ob-goal-lose').click()
    await page.getByTestId('ob-step-skip').click() // v1.13 goal weight (skip: 5% less)
    await page.getByTestId('ob-step-skip').click() // v1.13 By when (skip: 6 months)
    await page.getByTestId('ob-watch-no').click() // v1.10 watch question
    await page.getByTestId('ob-act-light').click() // v1.13: no pace step after Activity
    await page.getByTestId('ob-target').waitFor()
    await page.getByTestId('ob-next').click()
    await page.getByTestId('ob-skip').click()
    await page.waitForURL('**#/')
    assert.equal(await num(page.getByTestId('eq-bmr')), 1400) // v1.8: new profiles count movement (525) on top of BMR
    assert.equal(await page.getByTestId('eq-base').count(), 0)
  })
  await step('v2: 110 g target, 75 g logged', async () => {
    await page.getByRole('link', { name: 'Me', exact: true }).click()
    await page.waitForURL('**#/settings')
    await page.fill('input[name=macro-protein]', '110')
    await page.getByRole('button', { name: 'Save changes' }).click()
    await page.getByText('Saved.').waitFor()
    await page.getByRole('link', { name: 'Today', exact: true }).click()
    await page.getByRole('link', { name: 'Add to Lunch' }).click()
    await page.getByTestId('qa-bar').getByRole('button', { name: 'Add Calories' }).click()
    const dlg = page.getByRole('dialog')
    await dlg.locator('input[name=kcal]').fill('700')
    await dlg.locator('input[name=name]').fill('Chicken rice')
    await dlg.getByLabel('Protein').fill('75')
    await dlg.getByRole('button', { name: 'Add 700 kcal' }).click()
    await page.getByRole('link', { name: /Close and go back/ }).click()
    assert.equal(await page.getByTestId('protein-left').innerText(), '35 g left')
  })
  await step('data persists across reload, deep hash links work', async () => {
    await page.reload()
    assert.equal(await page.getByTestId('protein-left').innerText(), '35 g left')
    await page.goto(FILE + '#/nutrition')
    assert.equal(await page.getByTestId('protein-progress').innerText(), '75 of 110 g, 68%')
    await page.reload()
    assert.equal(await page.getByTestId('protein-progress').innerText(), '75 of 110 g, 68%')
    await page.goto(FILE + '#/settings')
    await page.locator('[data-testid=developer] summary').click()
    await page.getByRole('button', { name: 'Load demo week' }).click()
    await page.goto(FILE + '#/history')
    assert.ok((await page.locator('[data-bar]').count()) >= 7)
    await page.getByRole('button', { name: 'Protein' }).click()
    assert.match(await page.getByTestId('protein-hit').innerText(), /^\d \/ 7$/)
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('calorie-app:v3')))
    assert.equal(stored.profile.macros.protein, 110)
  })
  await step('no console errors, warnings or failed requests', async () => { assert.deepEqual(errors, []) })
} finally {
  console.log(results.join('\n'))
  await browser.close()
}
