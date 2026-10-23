// Headless end-to-end run. Usage: npm run build && npx vite preview --port 4174 & node tests/e2e.mjs
import { chromium } from 'playwright'
import assert from 'node:assert/strict'

const BASE = process.env.BASE_URL ?? 'http://localhost:4174'
const OUT = new URL('../screenshots/', import.meta.url).pathname
const errors = []
const results = []
const step = async (name, fn) => {
  const t = Date.now()
  try { await fn(); results.push(`PASS ${name} (${Date.now() - t} ms)`) }
  catch (e) { results.push(`FAIL ${name}: ${e.message}`); throw e }
}
const watch = (page) => {
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`${m.type()}: ${m.text()}`) })
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
  page.on('dialog', (d) => d.accept())
}
const num = async (loc) => Number((await loc.innerText()).replace(/[^0-9]/g, ''))

const browser = await chromium.launch()
let taps = {}
try {
  // ---------- Mobile 390 ----------
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, reducedMotion: 'reduce' })
  const page = await ctx.newPage(); watch(page)

  await step('new user is sent to onboarding', async () => {
    await page.goto(BASE + '/')
    await page.waitForURL('**/onboarding')
  })
  await step('onboarding computes Mifflin-St Jeor target and allows edit', async () => {
    await page.getByRole('button', { name: 'Female' }).click()
    await page.fill('input[name=age]', '30')
    await page.fill('input[name=heightCm]', '165')
    await page.fill('input[name=weightKg]', '68')
    await page.screenshot({ path: OUT + 'mobile-onboarding-1-about.png' })
    await page.getByRole('button', { name: 'Next' }).click()
    await page.getByRole('button', { name: 'Lose weight' }).click()
    await page.getByLabel(/Light \(exercise/).check()
    await page.getByRole('button', { name: 'See my target' }).click()
    // BMR = 10*68 + 6.25*165 - 5*30 - 161 = 1400.25; x1.375 = 1925.3; -500 = 1425 -> 1430
    assert.equal(await num(page.getByTestId('target')), 1430)
    assert.equal(await page.getByTestId('goal-line').innerText(), 'to lose about 0.5 kg a week')
    await page.getByRole('button', { name: 'Edit target' }).click()
    await page.fill('input[name=target]', '1850')
    await page.getByRole('button', { name: 'Done editing' }).click()
    assert.equal(await num(page.getByTestId('target')), 1850)
    assert.equal(await page.getByTestId('goal-line').innerText(), 'to lose about 0.5 kg a week')
    await page.screenshot({ path: OUT + 'mobile-onboarding-3-target.png' })
    await page.getByRole('button', { name: 'Start logging' }).click()
  })
  await step('home shows target and is empty', async () => {
    await page.waitForURL(BASE + '/')
    assert.equal(await num(page.getByTestId('kcal-left')), 1850)
    assert.equal(await num(page.getByTestId('eaten')), 0)
    await page.getByTestId('empty').waitFor()
    await page.screenshot({ path: OUT + 'mobile-home-empty.png' })
  })
  await step('log food via search + amount sheet (tap count timed)', async () => {
    const t0 = Date.now(); let n = 0
    await page.getByRole('link', { name: 'Add to Lunch' }).click(); n++
    await page.getByLabel('Search foods').fill('nasi goreng')
    await page.getByRole('button', { name: /^Nasi goreng, 1 plate/ }).click(); n++
    await page.getByRole('button', { name: 'Increase amount' }).click(); n++
    assert.equal(await page.getByTestId('qty').innerText(), '2 plates')
    await page.getByRole('button', { name: 'Add 1,040 kcal' }).click(); n++
    await page.getByTestId('toast').waitFor()
    await page.getByRole('button', { name: 'Done' }).click(); n++
    await page.waitForURL(BASE + '/')
    taps.searchWithAmount = { taps: n, ms: Date.now() - t0 }
    assert.equal(await num(page.getByTestId('eaten')), 1040)
    assert.equal(await num(page.getByTestId('kcal-left')), 810)
    assert.match(await page.getByTestId('macro-protein').innerText(), /28 \/ 116g/)
  })
  await step('one-tap add via search + plus (tap count timed)', async () => {
    const t0 = Date.now(); let n = 0
    await page.getByRole('button', { name: 'Log food' }).click(); n++
    await page.getByLabel('Search foods').fill('tem')
    await page.getByRole('button', { name: /Add one serving of Tempe goreng/ }).click(); n++
    await page.getByTestId('toast').waitFor()
    await page.getByRole('button', { name: 'Done' }).click(); n++
    taps.oneTapSearch = { taps: n, ms: Date.now() - t0 }
    assert.equal(await num(page.getByTestId('eaten')), 1128)
  })
  await step('recent foods come first and re-add is one tap', async () => {
    await page.getByRole('button', { name: 'Log food' }).click()
    assert.equal(await page.getByRole('button', { name: 'Recent' }).getAttribute('aria-pressed'), 'true')
    const first = await page.getByTestId('food-list').locator('li').first().innerText()
    assert.match(first, /Tempe goreng/)
    // favourite toggle
    await page.getByRole('button', { name: /^Tempe goreng, / }).click()
    await page.getByRole('button', { name: 'Add to favourites' }).click()
    await page.getByRole('button', { name: 'Remove from favourites' }).waitFor()
    await page.keyboard.press('Escape')
    await page.getByRole('button', { name: 'Favourites' }).click()
    assert.match(await page.getByTestId('food-list').innerText(), /Tempe goreng/)
    await page.getByRole('link', { name: /Close/ }).click()
  })
  await step('quick add calories', async () => {
    await page.getByRole('link', { name: 'Add to Snacks' }).click()
    await page.getByRole('button', { name: 'Quick add', exact: true }).click()
    await page.fill('input[name=kcal]', '250')
    await page.fill('input[name=name]', 'Office cake')
    await page.getByRole('button', { name: 'Add 250 kcal' }).click()
    await page.getByRole('button', { name: 'Done' }).click()
    assert.equal(await num(page.getByTestId('eaten')), 1378)
    assert.match(await page.getByTestId('meal-snacks').innerText(), /Office cake/)
  })
  await step('edit a logged food (qty 2 -> 1, move meal)', async () => {
    await page.getByRole('button', { name: /^Edit Nasi goreng/ }).click()
    await page.getByRole('button', { name: 'Decrease amount' }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Dinner' }).click()
    await page.getByRole('button', { name: /^Save/ }).click()
    assert.equal(await num(page.getByTestId('eaten')), 858)
    assert.match(await page.getByTestId('meal-dinner').innerText(), /Nasi goreng/)
  })
  await step('edit a quick add entry', async () => {
    await page.getByRole('button', { name: /^Edit Office cake/ }).click()
    await page.fill('input[name=kcal]', '300')
    await page.getByRole('button', { name: 'Save' }).click()
    assert.equal(await num(page.getByTestId('eaten')), 908)
  })
  await step('delete an entry', async () => {
    await page.getByRole('button', { name: /^Edit Office cake/ }).click()
    await page.getByRole('button', { name: 'Delete entry' }).click()
    assert.equal(await num(page.getByTestId('eaten')), 608)
    assert.doesNotMatch(await page.getByTestId('meal-snacks').innerText(), /Office cake/)
  })
  await step('state survives a refresh', async () => {
    await page.reload()
    assert.equal(await num(page.getByTestId('eaten')), 608)
    assert.equal(await num(page.getByTestId('kcal-left')), 1242)
    assert.match(await page.getByTestId('meal-dinner').innerText(), /Nasi goreng, 1 plate/)
    assert.match(await page.locator('[data-testid^=meal-]').allInnerTexts().then((t) => t.join(' ')), /Tempe goreng/)
    assert.match(await page.getByTestId('macro-protein').innerText(), /^Protein\s+19 \/ 116g/)
    await page.screenshot({ path: OUT + 'mobile-home.png' })
  })
  await step('log food search screenshots', async () => {
    await page.getByRole('link', { name: 'Add to Dinner' }).click()
    await page.getByLabel('Search foods').fill('tem')
    await page.screenshot({ path: OUT + 'mobile-log-search.png' })
    // search box: no inner native outline, green border on focus
    const sf = await page.getByLabel('Search foods').evaluate((el) => {
      const cs = getComputedStyle(el), box = getComputedStyle(el.parentElement)
      return { outline: cs.outlineStyle, border: box.borderColor }
    })
    assert.equal(sf.outline, 'none')
    assert.equal(sf.border, 'rgb(23, 128, 70)')
    await page.getByRole('button', { name: /^Tempe goreng, / }).click()
    assert.equal(await page.getByTestId('qty').innerText(), '1 piece')
    await page.getByRole('button', { name: 'Increase amount' }).click()
    assert.equal(await page.getByTestId('qty').innerText(), '2 pieces')
    await page.getByRole('button', { name: '100 g', exact: true }).click()
    assert.equal(await page.getByTestId('qty').innerText(), '200 g')
    await page.getByRole('button', { name: '1 piece (25 g)' }).click()
    await page.screenshot({ path: OUT + 'mobile-log-amount-sheet.png' })
    await page.keyboard.press('Escape')
    await page.getByRole('link', { name: /Close/ }).click()
  })
  await step('history with demo week shows 7 daily totals vs target', async () => {
    await page.getByRole('link', { name: 'Settings' }).click()
    await page.getByRole('button', { name: 'Load demo week' }).click()
    await page.waitForURL('**/history')
    await page.getByTestId('chart').waitFor()
    const vals = await page.locator('[data-bar]').evaluateAll((els) => els.map((e) => Number(e.getAttribute('data-value'))))
    assert.equal(vals.length, 7)
    assert.ok(vals.every((v) => v > 0), 'all 7 days have totals: ' + vals)
    assert.equal(vals[6], 608)
    const over = vals.slice(0, 6).filter((v) => v > 1850).length
    assert.ok(over >= 1, 'at least one over day')
    assert.equal(await page.getByTestId('on-target').innerText(), `${7 - over}/7`)
    assert.match(await page.getByTestId('streak').innerText(), /7 day streak/)
    assert.equal(await page.getByTestId('day-list').locator('li').count(), 7)
    await page.screenshot({ path: OUT + 'mobile-history.png' })
    await page.getByRole('button', { name: '30 days' }).click()
    assert.equal(await page.locator('[data-bar]').count(), 30)
    await page.getByRole('button', { name: '7 days' }).click()
    await page.reload()
    assert.equal(await page.locator('[data-bar]').count(), 7)
    assert.equal(Number(await page.locator('[data-bar]').first().getAttribute('data-value')), vals[0])
  })
  await step('home streak reflects demo week', async () => {
    await page.getByRole('link', { name: 'Today' }).click()
    await page.waitForURL(BASE + '/')
    await page.getByTestId('kcal-left').waitFor()
    assert.match(await page.getByTestId('streak').innerText(), /7 days/)
  })
  await step('keyboard: Tab reaches main actions with visible focus', async () => {
    await page.keyboard.press('Tab')
    const tag = await page.evaluate(() => document.activeElement?.tagName)
    assert.ok(['A', 'BUTTON'].includes(tag), 'focused ' + tag)
  })
  const storage = await ctx.storageState()

  // ---------- Desktop 1440 (phone frame) ----------
  const d = await browser.newContext({ viewport: { width: 1440, height: 900 }, storageState: storage })
  const dp = await d.newPage(); watch(dp)
  await step('desktop screenshots in phone frame', async () => {
    await dp.goto(BASE + '/')
    const box = await dp.locator('#root > div > div').boundingBox()
    assert.equal(Math.round(box.width), 390)
    await dp.screenshot({ path: OUT + 'desktop-home.png' })
    await dp.getByRole('link', { name: 'Add to Dinner' }).click()
    await dp.getByLabel('Search foods').fill('tem')
    await dp.screenshot({ path: OUT + 'desktop-log-search.png' })
    await dp.getByRole('button', { name: /^Tempe goreng, / }).click()
    await dp.waitForTimeout(400)
    const scrolled = await dp.evaluate(() => document.querySelector('#root > div > div').scrollTop)
    assert.equal(scrolled, 0, 'frame must not scroll when sheet opens')
    await dp.screenshot({ path: OUT + 'desktop-log-amount-sheet.png' })
    await dp.keyboard.press('Escape')
    await dp.goto(BASE + '/history')
    await dp.screenshot({ path: OUT + 'desktop-history.png' })
  })
  const fresh = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const fp = await fresh.newPage(); watch(fp)
  await step('desktop onboarding screenshot', async () => {
    await fp.goto(BASE + '/')
    await fp.getByRole('button', { name: 'Male', exact: true }).click()
    await fp.fill('input[name=age]', '34'); await fp.fill('input[name=heightCm]', '170'); await fp.fill('input[name=weightKg]', '72')
    await fp.getByRole('button', { name: 'Next' }).click()
    await fp.getByRole('button', { name: 'Gain weight' }).click()
    await fp.getByRole('button', { name: 'See my target' }).click()
    assert.equal(await fp.getByTestId('goal-line').innerText(), 'to gain about 0.25 kg a week')
    await fp.getByRole('button', { name: 'Edit target' }).click()
    await fp.fill('input[name=target]', '2900')
    assert.equal(await fp.getByTestId('goal-line').innerText(), 'to gain about 0.25 kg a week')
    await fp.reload() // state not saved until Start logging; restart flow for lose screenshot
    await fp.getByRole('button', { name: 'Male', exact: true }).click()
    await fp.fill('input[name=age]', '34'); await fp.fill('input[name=heightCm]', '170'); await fp.fill('input[name=weightKg]', '72')
    await fp.getByRole('button', { name: 'Next' }).click()
    await fp.getByRole('button', { name: 'Keep weight' }).click()
    await fp.getByRole('button', { name: 'See my target' }).click()
    assert.equal(await fp.getByTestId('goal-line').innerText(), 'to keep your current weight')
    await fp.reload()
    await fp.getByRole('button', { name: 'Male', exact: true }).click()
    await fp.fill('input[name=age]', '34'); await fp.fill('input[name=heightCm]', '170'); await fp.fill('input[name=weightKg]', '72')
    await fp.getByRole('button', { name: 'Next' }).click()
    await fp.getByRole('button', { name: 'Lose weight' }).click()
    await fp.getByRole('button', { name: 'See my target' }).click()
    await fp.screenshot({ path: OUT + 'desktop-onboarding-target.png' })
  })
  await step('no console errors or warnings', async () => {
    assert.deepEqual(errors, [])
  })
} finally {
  await browser.close()
  console.log(results.join('\n'))
  console.log('Tap counts:', JSON.stringify(taps))
  if (errors.length) console.log('Console:', errors)
}
