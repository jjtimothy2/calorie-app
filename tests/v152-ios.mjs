// v1.5.2 iPhone checks in WebKit (Safari's engine) with touch: the AI button (v1.6, was the camera) on the right of Quick add, and fields in sheets
// take focus on one tap and keep it when the keyboard opens. A real keyboard can't be opened in a headless browser, so
// the keyboard is simulated by shrinking the viewport (that is what fires Log's keyboard check and re-renders Log,
// which is what used to pull focus out of the note field).
// Usage: npm run build && npx vite preview --port 4174 & node tests/v152-ios.mjs   (SHOTS=1 also writes v161-*.png)
import { webkit, devices } from 'playwright'
import assert from 'node:assert/strict'
import { STATE } from './v11-fixture.mjs'
import { EST, PLATE, geminiOk, makePlate } from './v15-fixture.mjs'

const BASE = (process.env.BASE_URL ?? 'http://localhost:4174/calorie-app').replace(/\/$/, '')
const SHOTS = process.env.SHOTS === '1'
const OUT = new URL('../screenshots/', import.meta.url).pathname
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET, POST, OPTIONS' }
const results = [], errors = []
const step = async (name, fn) => {
  const t = Date.now()
  try { await fn(); results.push(`PASS ${name} (${Date.now() - t} ms)`) } catch (e) { results.push(`FAIL ${name}: ${e.message}`); console.log(results.join('\n')); throw e }
}

const browser = await webkit.launch()
await makePlate(browser)
const active = (page) => page.evaluate(() => { const a = document.activeElement; return a ? `${a.tagName.toLowerCase()}${a.getAttribute('aria-label') ? `[${a.getAttribute('aria-label')}]` : ''}` : '' })

for (const [width, height, kb] of [[390, 844, 336], [375, 667, 260]]) {
  const tag = `${width}x${height}`
  const ctx = await browser.newContext({ ...devices['iPhone 14'], viewport: { width, height }, deviceScaleFactor: 3, reducedMotion: 'reduce', serviceWorkers: 'block' })
  await ctx.addInitScript((s) => {
    if (!localStorage.getItem('calorie-app:v1') && !localStorage.getItem('calorie-app:v2')) localStorage.setItem('calorie-app:v1', JSON.stringify(s))
    if (!localStorage.getItem('calorie-app:ai')) localStorage.setItem('calorie-app:ai', JSON.stringify({ provider: 'gemini', key: 'AIzaTEST-not-a-real-key-000000000000' }))
  }, STATE)
  await ctx.route('https://generativelanguage.googleapis.com/**', (r) => r.request().method() === 'OPTIONS'
    ? r.fulfill({ status: 204, headers: CORS })
    : r.fulfill({ status: 200, contentType: 'application/json', headers: CORS, body: JSON.stringify(geminiOk(EST)) }))
  const page = await ctx.newPage()
  page.on('console', (m) => { if ((m.type() === 'error' || m.type() === 'warning') && !/Service Worker registration blocked|service worker/i.test(m.text())) errors.push(`${tag}: ${m.type()}: ${m.text()}`) })
  page.on('pageerror', (e) => errors.push(`${tag}: ${e.message}`))
  const shot = async (name) => { if (SHOTS) { await page.waitForTimeout(250); await page.screenshot({ path: `${OUT}v161-${name}-${tag}.png` }) } }
  const keyboard = async (open) => { await page.setViewportSize({ width, height: open ? height - kb : height }); await page.waitForTimeout(400) }
  const dlg = page.getByRole('dialog')

  await step(`${tag}: AI button (sparkle only, v1.6.1) sits right of Quick add, 56 px, 8 px from the edge, clear of Quick add`, async () => {
    await page.goto(BASE + '/log')
    const btn = page.getByRole('button', { name: 'Estimate with AI', exact: true })
    const qa = page.getByRole('button', { name: /Quick add calories/ })
    await btn.waitFor()
    assert.equal((await btn.innerText()).trim(), '', 'no text label')
    assert.equal(await btn.locator('svg').count(), 1)
    const [cb, qb] = [await btn.boundingBox(), await qa.boundingBox()]
    assert.ok(cb.x >= qb.x + qb.width + 8, `AI button right of Quick add with room (${cb.x} vs ${qb.x + qb.width})`)
    assert.equal(Math.round(cb.width), 56); assert.equal(Math.round(cb.height), 56)
    const edge = width - (cb.x + cb.width)
    assert.ok(edge >= 8 && edge <= 12, `8 px from the screen edge (got ${edge})`)
    assert.ok(Math.abs(cb.y + cb.height / 2 - (qb.y + qb.height / 2)) < 3, 'same row')
    assert.ok(qb.x >= 16, 'Quick add keeps its left margin')
    await shot('log-bar')
    await btn.tap()
    await dlg.getByRole('heading', { name: 'AI estimate' }).waitFor()
    assert.equal(await dlg.getByRole('button', { name: /Estimate/ }).isDisabled(), true, 'empty sheet: Estimate disabled')
    // v1.6.1 tip under Add photo: fits the sheet, at most 2 balanced lines, no overflow.
    const tip = dlg.getByTestId('photo-tip')
    await tip.waitFor()
    const tm = await tip.evaluate((el) => ({ h: el.getBoundingClientRect().height, lh: parseFloat(getComputedStyle(el).lineHeight), over: el.scrollWidth > el.clientWidth, r: el.getBoundingClientRect().right }))
    assert.ok(!tm.over && tm.r <= width - 16, 'tip inside the sheet')
    assert.ok(tm.h <= tm.lh * 2 + 1, `tip at most 2 lines (${tm.h} px)`)
    await shot('ai-empty')
  })

  await step(`${tag}: one tap on the text focuses it, typing works, and focus survives the keyboard opening (Log re-render)`, async () => {
    const note = dlg.getByRole('textbox') // v1.6.2: 'Add a note (optional)' until tapped with no photo, then 'What did you eat?'
    assert.notEqual(await active(page), 'textarea[What did you eat?]')
    await note.tap()
    assert.equal(await active(page), 'textarea[What did you eat?]', 'tap focuses the text field')
    await keyboard(true)
    assert.equal(await active(page), 'textarea[What did you eat?]', 'focus stays when the keyboard opens and Log re-renders')
    assert.equal(await page.getByTestId('qa-bar').count(), 0, 'Log really did see the keyboard (bar hidden)')
    await page.keyboard.type('Nasi putih, ayam goreng paha, dragonfruit salsa')
    assert.equal(await note.inputValue(), 'Nasi putih, ayam goreng paha, dragonfruit salsa')
    // Field and Estimate button visible above the keyboard.
    const vh = height - kb
    for (const el of [note, dlg.getByRole('button', { name: /Estimate/ })]) {
      const b = await el.boundingBox()
      assert.ok(b.y >= 0 && b.y + b.height <= vh + 1, `${await el.innerText().catch(() => 'note')} visible (${Math.round(b.y)}..${Math.round(b.y + b.height)} of ${vh})`)
    }
    assert.equal(await dlg.getByRole('button', { name: /Estimate/ }).isDisabled(), false, 'text only: Estimate enabled')
    // A chip while typing adds to the text and keeps the keyboard (focus) in the field.
    await dlg.getByRole('button', { name: 'Extra sambal' }).tap()
    assert.match(await note.inputValue(), /dragonfruit salsa.*extra sambal/i)
    assert.equal(await active(page), 'textarea[What did you eat?]', 'chip keeps focus in the field while typing')
    await page.evaluate(() => document.activeElement?.blur())
    await keyboard(false)
    await shot('ai-text')
  })

  await step(`${tag}: text-only estimate (no image part); chips with the keyboard closed don't open it; steppers keep working; photo still optional`, async () => {
    let body = null
    await ctx.unroute('https://generativelanguage.googleapis.com/**')
    await ctx.route('https://generativelanguage.googleapis.com/**', (r) => {
      if (r.request().method() === 'OPTIONS') return r.fulfill({ status: 204, headers: CORS })
      body = r.request().postData()
      return r.fulfill({ status: 200, contentType: 'application/json', headers: CORS, body: JSON.stringify(geminiOk(EST)) })
    })
    await dlg.getByRole('button', { name: 'No rice' }).tap()
    assert.notEqual(await active(page), 'textarea[What did you eat?]', 'chip alone does not focus the field')
    assert.equal(await dlg.getByRole('button', { name: 'No rice' }).getAttribute('aria-pressed'), 'true')
    await dlg.getByRole('button', { name: 'No rice' }).tap()
    await dlg.getByRole('button', { name: /Estimate/ }).tap()
    const more = dlg.getByRole('button', { name: 'More Ayam goreng' })
    await more.waitFor()
    assert.ok(body && !body.includes('inlineData'), 'text-only request has no image part')
    await dlg.getByText('Estimated from your description').waitFor()
    await shot('ai-results')
    const grams = dlg.getByRole('listitem').filter({ hasText: 'Ayam goreng' }).getByTestId('item-grams')
    await more.tap()
    await more.tap()
    assert.equal(await grams.innerText(), '140 g')
    await keyboard(true); await keyboard(false) // a parent re-render must not reset the sheet or its focus
    assert.equal(await grams.innerText(), '140 g')
    assert.equal(await active(page), 'button[More Ayam goreng]', 'stepper keeps focus across a re-render')
    await dlg.getByRole('button', { name: 'Less Ayam goreng' }).tap()
    assert.equal(await grams.innerText(), '130 g')
    // Edit goes back to the input with the text kept; a photo can still be added.
    await dlg.getByRole('button', { name: 'Edit' }).tap()
    assert.match(await dlg.getByRole('textbox').inputValue(), /dragonfruit salsa/)
    // A file chooser can't be driven by tap in WebKit headless; feed the hidden input directly.
    await page.getByTestId('photo-input').setInputFiles(PLATE)
    await dlg.getByTestId('photo-added').waitFor()
    assert.equal(await dlg.getByTestId('photo-tip').count(), 0, 'tip goes once a photo is added')
    // v1.6.1: photo results show "Sized using: spoon" under the dish name on one line.
    assert.equal(await dlg.getByTestId('photo-scale').count(), 0)
    await dlg.getByRole('button', { name: /Estimate/ }).tap()
    const scale = dlg.getByTestId('photo-scale')
    await scale.waitFor()
    assert.equal(await scale.innerText(), 'Sized using: spoon')
    const sm = await scale.evaluate((el) => ({ h: el.getBoundingClientRect().height, lh: parseFloat(getComputedStyle(el).lineHeight), over: el.scrollWidth > el.clientWidth }))
    assert.ok(!sm.over && sm.h <= sm.lh + 1, `sized line on one line (${sm.h} px)`)
    await shot('ai-results-photo')
    await page.keyboard.press('Escape')
    await dlg.waitFor({ state: 'detached' })
  })

  await step(`${tag}: Quick add sheet fields take one tap and keep focus with the keyboard open`, async () => {
    await page.getByRole('button', { name: /Quick add calories/ }).tap()
    const name = dlg.getByRole('textbox', { name: /name/i }).first()
    await name.tap()
    assert.equal(await active(page), 'input')
    await keyboard(true)
    assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('name')), 'name', 'focus stays in the name field')
    await page.keyboard.type('Office cake')
    assert.equal(await name.inputValue(), 'Office cake')
    const kcal = dlg.locator('input[name=kcal]')
    await kcal.tap()
    await page.keyboard.type('250')
    assert.equal(await kcal.inputValue(), '250')
    await keyboard(false)
    assert.equal(await kcal.inputValue(), '250')
    await page.keyboard.press('Escape')
    await dlg.waitFor({ state: 'detached' })
  })
  await ctx.close()
}
await browser.close()
console.log(results.join('\n'))
if (errors.length) { console.error(errors.join('\n')); process.exit(1) }
console.log(`${results.length} v1.5.2/v1.6 WebKit checks passed, no console errors`)
