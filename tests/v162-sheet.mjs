// v1.6.2 photo-first AI sheet (v1.6.3: the big frame is the live camera, mocked here), acceptance checks in WebKit (Safari's engine) with touch at 390x844 (plus 375x667 for
// layout and screenshots, and a reduced-motion run). Keyboard simulated by shrinking the viewport, as in v152-ios.mjs.
// Usage: npm run build && npx vite preview --port 4174 & node tests/v162-sheet.mjs   (SHOTS=1 also writes v162-*.png)
import { webkit, devices } from 'playwright'
import assert from 'node:assert/strict'
import { STATE } from './v11-fixture.mjs'
import { EST, PLATE, geminiOk, makePlate } from './v15-fixture.mjs'
import { CAMERA_MOCK } from './camera-mock.mjs'

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

for (const [width, height, kb, reduced] of [[390, 844, 336, false], [375, 667, 260, false], [390, 844, 336, true]]) {
  const tag = `${width}x${height}${reduced ? ' reduced motion' : ''}`
  const ctx = await browser.newContext({ ...devices['iPhone 14'], viewport: { width, height }, deviceScaleFactor: 3, reducedMotion: reduced ? 'reduce' : 'no-preference', serviceWorkers: 'block' })
  await ctx.addInitScript((s) => {
    if (!localStorage.getItem('calorie-app:v1') && !localStorage.getItem('calorie-app:v2')) localStorage.setItem('calorie-app:v1', JSON.stringify(s))
    if (!localStorage.getItem('calorie-app:ai')) localStorage.setItem('calorie-app:ai', JSON.stringify({ provider: 'gemini', key: 'AIzaTEST-not-a-real-key-000000000000' }))
    // Count picker opens (a real file chooser can't be driven by tap in headless WebKit).
    window.__picks = 0
    const click = HTMLInputElement.prototype.click
    HTMLInputElement.prototype.click = function () { if (this.type === 'file') window.__picks++; return click.call(this) }
  }, STATE)
  await ctx.addInitScript(CAMERA_MOCK, 'ok')
  const sent = []
  await ctx.route('https://generativelanguage.googleapis.com/**', (r) => {
    if (r.request().method() === 'OPTIONS') return r.fulfill({ status: 204, headers: CORS })
    sent.push(r.request().postData())
    return r.fulfill({ status: 200, contentType: 'application/json', headers: CORS, body: JSON.stringify(geminiOk(EST)) })
  })
  const page = await ctx.newPage()
  page.on('console', (m) => { if ((m.type() === 'error' || m.type() === 'warning') && !/Service Worker registration blocked|service worker/i.test(m.text())) errors.push(`${tag}: ${m.type()}: ${m.text()}`) })
  page.on('pageerror', (e) => errors.push(`${tag}: ${e.message}`))
  const shot = async (name) => { if (SHOTS && !reduced) { await page.waitForTimeout(350); await page.screenshot({ path: `${OUT}v162-${name}-${width}x${height}.png` }) } }
  const keyboard = async (open) => { await page.setViewportSize({ width, height: open ? height - kb : height }); await page.waitForTimeout(400) }
  const dlg = page.getByRole('dialog')
  const frame = dlg.getByTestId('photo-frame')
  const strip = dlg.getByTestId('add-photo')
  const note = dlg.getByRole('textbox')
  const est = dlg.getByRole('button', { name: /Estimate/ })
  const active = () => page.evaluate(() => document.activeElement?.tagName.toLowerCase())
  const label = () => page.evaluate(() => [...document.querySelectorAll('[data-testid=note-label] > span')].filter((s) => getComputedStyle(s).opacity === '1').map((s) => s.textContent).join('|'))
  const h = async (l) => (await l.boundingBox()).height
  const open = async () => {
    await page.getByRole('button', { name: 'Estimate with AI', exact: true }).tap()
    await frame.or(dlg.getByTestId('photo-added')).waitFor()
    await page.waitForTimeout(150)
  }
  const close = async () => { await page.keyboard.press('Escape'); await dlg.waitFor({ state: 'detached' }) }
  const estimateVisible = async (vh) => { const b = await est.boundingBox(); assert.ok(b.y >= 0 && b.y + b.height <= vh + 1, `Estimate visible above the keyboard (${Math.round(b.y + b.height)} of ${vh})`) }

  await step(`${tag}: Log bar, 34 px star in the 56 px button`, async () => {
    await page.goto(BASE + '/log')
    const btn = page.getByRole('button', { name: 'Estimate with AI', exact: true })
    await btn.waitFor()
    const [b, s] = [await btn.boundingBox(), await btn.locator('svg').boundingBox()]
    assert.deepEqual([Math.round(b.width), Math.round(b.height), Math.round(s.width), Math.round(s.height)], [56, 56, 34, 34])
    assert.ok(Math.abs(s.x + s.width / 2 - (b.x + b.width / 2)) < 1 && Math.abs(s.y + s.height / 2 - (b.y + b.height / 2)) < 1, 'star centred')
    await shot('log-bar')
  })

  await step(`${tag}: photo first: big frame with the live camera, shutter and gallery, tip under it, "Add a note (optional)", chips, Estimate; keyboard stays down`, async () => {
    await open()
    assert.equal(await frame.getAttribute('data-state'), 'big')
    assert.ok(await h(frame) >= 132, `big frame (${await h(frame)} px)`)
    await dlg.locator('[data-cam=live]').waitFor()
    await dlg.getByRole('button', { name: 'Take photo' }).waitFor()
    await dlg.getByRole('button', { name: 'Choose from gallery' }).waitFor()
    assert.notEqual(await active(), 'textarea', 'no keyboard on open')
    assert.equal(await label(), 'Add a note (optional)')
    assert.equal(await note.getAttribute('aria-label'), 'Add a note (optional)')
    const ys = await dlg.evaluate((el) => ['[data-testid=photo-frame]', '[data-testid=photo-tip]', '[data-testid=note-label]', 'textarea', '[aria-label="Quick notes"]', '[data-keep-visible]'].map((q) => el.querySelector(q).getBoundingClientRect().top))
    assert.deepEqual([...ys].sort((a, b) => a - b), ys, 'frame, tip, label, field, chips, Estimate')
    const [fb, tb] = [await frame.boundingBox(), await dlg.getByTestId('photo-tip').boundingBox()]
    assert.ok(tb.y - (fb.y + fb.height) < 12, 'tip right under the frame')
    assert.equal(await est.isDisabled(), true)
    const eb = await est.boundingBox()
    assert.ok(eb.y + eb.height <= height, 'Estimate on screen without scrolling')
    const tr = await frame.evaluate((el) => { const c = getComputedStyle(el); return [c.transitionDuration, c.transitionTimingFunction] })
    if (reduced) assert.ok(/^0s/.test(tr[0]), 'reduced motion: no transition ' + tr)
    else assert.ok(/0\.28s/.test(tr[0]) && /ease-out|cubic-bezier\(0, 0, 0\.58, 1\)/.test(tr[1]), 'frame animates 280 ms ease-out: ' + tr)
    await shot('photo-first')
  })

  await step(`${tag}: text first: tap the field, frame folds to a 56 px dashed strip ${reduced ? 'instantly' : 'in ~280 ms with the field sliding up'}, label crossfades, focus and Estimate survive the keyboard`, async () => {
    const big = await h(frame)
    const gap = () => page.evaluate(() => document.querySelector('textarea').getBoundingClientRect().top - document.querySelector('[data-testid=photo-frame]').getBoundingClientRect().top)
    const g0 = await gap()
    await note.tap()
    await page.waitForTimeout(reduced ? 30 : 110)
    const mid = await page.evaluate(() => {
      const f = document.querySelector('[data-testid=photo-frame]')
      return { h: f.getBoundingClientRect().height, dash: +getComputedStyle(f.querySelector('.border-dashed')).opacity, gap: document.querySelector('textarea').getBoundingClientRect().top - f.getBoundingClientRect().top }
    })
    if (reduced) assert.ok(Math.round(mid.h) === 56 && mid.dash === 1, 'reduced motion: strip at once ' + JSON.stringify(mid))
    else {
      assert.ok(mid.h > 60 && mid.h < big - 5, `frame height mid-animation (${mid.h} between 56 and ${big})`)
      assert.ok(mid.dash > 0 && mid.dash < 1, 'dashed border fading in: ' + mid.dash)
      // Bottom sheet: the field slides up toward the frame's top edge as the frame folds, in the same frames.
      assert.ok(mid.gap < g0 - 10 && mid.gap > g0 - (big - 56) - 40, `field slides with the frame (${g0} -> ${mid.gap})`)
      await page.waitForTimeout(400)
      assert.ok(await gap() < mid.gap - 5, 'and keeps going until the strip is done')
    }
    await page.waitForTimeout(400)
    assert.equal(await frame.getAttribute('data-state'), 'strip')
    assert.equal(Math.round(await h(frame)), 56)
    assert.equal(await frame.evaluate((el) => getComputedStyle(el.querySelector('.border-dashed')).borderTopStyle), 'dashed')
    assert.equal(await strip.getAttribute('aria-label'), 'Add a photo (optional)')
    assert.equal(await page.evaluate(() => window.__live()), 0, 'text first stops the camera')
    assert.equal(await label(), 'What did you eat?')
    assert.equal(await note.getAttribute('aria-label'), 'What did you eat?')
    assert.equal(await active(), 'textarea')
    await keyboard(true)
    assert.equal(await active(), 'textarea', 'focus stays when the keyboard opens and Log re-renders')
    await page.keyboard.type('Nasi goreng telur')
    assert.equal(await note.inputValue(), 'Nasi goreng telur')
    await estimateVisible(height - kb)
    assert.equal(await est.isDisabled(), false)
    await page.evaluate(() => document.activeElement?.blur())
    await keyboard(false)
    assert.equal(await frame.getAttribute('data-state'), 'strip', 'stays a strip after the keyboard closes')
    await shot('strip-text')
  })

  await step(`${tag}: text-only estimate from the strip state (no image part), Edit comes back to the strip with the text`, async () => {
    sent.length = 0
    await est.tap()
    await dlg.getByText('Estimated from your description').waitFor()
    assert.ok(sent.length === 1 && !sent[0].includes('inlineData'), 'no image part')
    assert.equal(await dlg.getByTestId('photo-scale').count(), 0)
    await dlg.getByRole('button', { name: 'Edit' }).tap()
    assert.equal(await note.inputValue(), 'Nasi goreng telur')
    assert.equal(await frame.getAttribute('data-state'), 'strip')
  })

  await step(`${tag}: tapping the strip expands the frame and restarts the camera (no picker); gallery photo the label is "Add a note (optional)"; photo estimate`, async () => {
    const picks = await page.evaluate(() => window.__picks)
    await strip.tap()
    assert.equal(await page.evaluate(() => window.__picks), picks, 'no picker from the strip')
    assert.equal(await frame.getAttribute('data-state'), 'big')
    await page.waitForTimeout(400)
    assert.ok(await h(frame) >= 132, "big again")
    assert.equal(await label(), 'Add a note (optional)')
    await dlg.locator('[data-cam=live]').waitFor()
    assert.equal(await page.evaluate(() => window.__live()), 1, 'camera back on')
    await dlg.getByRole('button', { name: 'Choose from gallery' }).tap()
    assert.equal(await page.evaluate(() => window.__picks), picks + 1, 'gallery opens the picker')
    await page.getByTestId('photo-input').setInputFiles(PLATE)
    const added = dlg.getByTestId('photo-added')
    await added.waitFor()
    assert.ok(await h(added) >= 132, "photo fills the big frame")
    assert.equal(await label(), 'Add a note (optional)')
    assert.equal(await note.getAttribute('aria-label'), 'Add a note (optional)')
    assert.equal(await dlg.getByTestId('photo-tip').count(), 0)
    await shot('photo-added')
    sent.length = 0
    await est.tap()
    await dlg.getByText('Estimated from your photo').waitFor()
    assert.ok(sent[0].includes('inlineData'), 'image part sent')
    assert.equal(await dlg.getByTestId('photo-scale').innerText(), 'Sized using: spoon')
    await close()
  })

  await step(`${tag}: photo then text: the frame stays big with the photo when the field is tapped, focus survives the keyboard`, async () => {
    await open()
    assert.equal(await frame.getAttribute('data-state'), 'big', 'fresh sheet is photo first')
    await page.getByTestId('photo-input').setInputFiles(PLATE)
    const added = dlg.getByTestId('photo-added')
    await added.waitFor()
    const big = await h(added)
    await note.tap()
    await page.waitForTimeout(400)
    assert.equal(Math.round(await h(added)), Math.round(big), 'photo never vanishes'); assert.ok(big >= 132, 'big: ' + big)
    assert.equal(await label(), 'Add a note (optional)')
    await keyboard(true)
    assert.equal(await active(), 'textarea', 'focus stays with the keyboard open')
    await page.keyboard.type('extra sambal')
    await estimateVisible(height - kb)
    await page.evaluate(() => document.activeElement?.blur())
    await keyboard(false)
    await close()
  })
  await ctx.close()
}

await step('no console errors or warnings', async () => { assert.deepEqual(errors, []) })
await browser.close()
console.log(results.join('\n'))
console.log(`${results.length} v1.6.2 sheet checks passed, no console errors`)
