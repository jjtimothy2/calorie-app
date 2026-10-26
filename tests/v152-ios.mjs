// v1.5.2 iPhone checks in WebKit (Safari's engine) with touch: camera on the right of Quick add, and fields in sheets
// take focus on one tap and keep it when the keyboard opens. A real keyboard can't be opened in a headless browser, so
// the keyboard is simulated by shrinking the viewport (that is what fires Log's keyboard check and re-renders Log,
// which is what used to pull focus out of the note field).
// Usage: npm run build && npx vite preview --port 4174 & node tests/v152-ios.mjs   (SHOTS=1 also writes v152-*.png)
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
  const shot = async (name) => { if (SHOTS) { await page.waitForTimeout(250); await page.screenshot({ path: `${OUT}v152-${name}-${tag}.png` }) } }
  const keyboard = async (open) => { await page.setViewportSize({ width, height: open ? height - kb : height }); await page.waitForTimeout(400) }
  const dlg = page.getByRole('dialog')

  await step(`${tag}: camera sits right of Quick add, 56 px, 8 px from the edge, clear of Quick add`, async () => {
    await page.goto(BASE + '/log')
    const cam = page.getByRole('button', { name: 'Estimate from a photo' })
    const qa = page.getByRole('button', { name: /Quick add calories/ })
    await cam.waitFor()
    const [cb, qb] = [await cam.boundingBox(), await qa.boundingBox()]
    assert.ok(cb.x >= qb.x + qb.width + 8, `camera right of Quick add with room (${cb.x} vs ${qb.x + qb.width})`)
    assert.ok(cb.width >= 48 && cb.height >= 48, `target ${cb.width}x${cb.height}`)
    assert.equal(Math.round(cb.width), 56)
    const edge = width - (cb.x + cb.width)
    assert.ok(edge >= 8 && edge <= 12, `8 px from the screen edge (got ${edge})`)
    assert.ok(Math.abs(cb.y + cb.height / 2 - (qb.y + qb.height / 2)) < 3, 'same row')
    assert.ok(qb.x >= 16, 'Quick add keeps its left margin')
    await shot('log-camera')
    await cam.tap()
    // A file chooser can't be driven by tap in WebKit headless; feed the hidden input directly.
    await page.getByTestId('photo-input').setInputFiles(PLATE)
    await dlg.getByRole('button', { name: /Estimate/ }).waitFor()
  })

  await step(`${tag}: one tap on the note focuses it, typing works, and focus survives the keyboard opening (Log re-render)`, async () => {
    const note = dlg.getByRole('textbox', { name: /Add a note/ })
    assert.notEqual(await active(page), 'textarea')
    await note.tap()
    assert.equal(await active(page), 'textarea', 'tap focuses the note')
    await keyboard(true)
    assert.equal(await active(page), 'textarea', 'focus stays when the keyboard opens and Log re-renders')
    assert.equal(await page.getByTestId('qa-bar').count(), 0, 'Log really did see the keyboard (bar hidden)')
    await page.keyboard.type('Half portion')
    assert.equal(await note.inputValue(), 'Half portion')
    // Field and Estimate button visible above the keyboard.
    const vh = height - kb
    for (const el of [note, dlg.getByRole('button', { name: /Estimate/ })]) {
      const b = await el.boundingBox()
      assert.ok(b.y >= 0 && b.y + b.height <= vh + 1, `${await el.innerText().catch(() => 'note')} visible (${Math.round(b.y)}..${Math.round(b.y + b.height)} of ${vh})`)
    }
    // A chip while typing adds to the note and keeps the keyboard (focus) in the note.
    await dlg.getByRole('button', { name: 'Shared' }).tap()
    assert.match(await note.inputValue(), /Half portion.*Shared/)
    assert.equal(await active(page), 'textarea', 'chip keeps focus in the note while typing')
    await page.keyboard.type(' fried')
    assert.match(await note.inputValue(), /Shared fried$/)
    await shot('photo-note')
  })

  await step(`${tag}: chips with the keyboard closed don't open it; the steppers on the results keep working`, async () => {
    await page.evaluate(() => document.activeElement?.blur())
    await keyboard(false)
    await dlg.getByRole('button', { name: 'No rice' }).tap()
    assert.notEqual(await active(page), 'textarea', 'chip alone does not focus the note')
    assert.equal(await dlg.getByRole('button', { name: 'No rice' }).getAttribute('aria-pressed'), 'true')
    await dlg.getByRole('button', { name: /Estimate/ }).tap()
    const more = dlg.getByRole('button', { name: 'More Ayam goreng' })
    await more.waitFor()
    const grams = dlg.getByRole('listitem').filter({ hasText: 'Ayam goreng' }).getByTestId('item-grams')
    await more.tap()
    await more.tap()
    assert.equal(await grams.innerText(), '140 g')
    await keyboard(true); await keyboard(false) // a parent re-render must not reset the sheet or its focus
    assert.equal(await grams.innerText(), '140 g')
    assert.equal(await active(page), 'button[More Ayam goreng]', 'stepper keeps focus across a re-render')
    await dlg.getByRole('button', { name: 'Less Ayam goreng' }).tap()
    assert.equal(await grams.innerText(), '130 g')
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
console.log(`${results.length} v1.5.2 WebKit checks passed, no console errors`)
