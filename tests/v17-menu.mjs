// v1.7 AI button menu: the sparkle opens two pills (Take photo, closest to the thumb, and Type it above). Take photo opens
// the native rear camera (file input with capture=environment) inside the tap; the shot opens the AI sheet with the photo
// and an unfocused note. Type it opens the sheet with the text field focused inside the tap and the dashed photo strip,
// which offers Take photo and Choose from photos. No live camera (getUserMedia) and no text field transition setting.
// WebKit (Safari's engine) with touch at 390x844 and 375x667. Screenshots: screenshots/v17-*.png.
// Usage: npm run build && npx vite preview --port 4174 & node tests/v17-menu.mjs
import { webkit, devices } from 'playwright'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { STATE } from './v11-fixture.mjs'
import { EST, PLATE, geminiOk, makePlate } from './v15-fixture.mjs'

const BASE = (process.env.BASE_URL ?? 'http://localhost:4174/calorie-app').replace(/\/$/, '')
const OUT = new URL('../screenshots/', import.meta.url).pathname
const DIST = new URL('../dist/assets/', import.meta.url).pathname
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET, POST, OPTIONS' }
const AI = { provider: 'gemini', key: 'AIzaTEST-not-a-real-key-000000000000' }
const results = [], errors = []
const step = async (name, fn) => {
  const t = Date.now()
  try { await fn(); results.push(`PASS ${name} (${Date.now() - t} ms)`) } catch (e) { results.push(`FAIL ${name}: ${e.message}`); console.log(results.join('\n')); throw e }
}

await step('built app has no getUserMedia (live camera code is gone)', async () => {
  const js = readdirSync(DIST).filter((f) => f.endsWith('.js')).map((f) => readFileSync(DIST + f, 'utf8')).join('')
  assert.ok(js.length > 1000)
  assert.ok(!js.includes('getUserMedia'), 'getUserMedia in the bundle')
  assert.ok(!js.includes('Text field transition'), 'transition setting in the bundle')
})

const browser = await webkit.launch()
await makePlate(browser)

for (const [width, height] of [[390, 844], [375, 667]]) {
  const tag = `${width}x${height}`
  const ctx = await browser.newContext({ ...devices['iPhone 14'], viewport: { width, height }, deviceScaleFactor: 3, serviceWorkers: 'block' })
  await ctx.addInitScript(([s, ai]) => {
    if (!localStorage.getItem('calorie-app:v1') && !localStorage.getItem('calorie-app:v2')) localStorage.setItem('calorie-app:v1', JSON.stringify(s))
    if (!localStorage.getItem('calorie-app:ai')) localStorage.setItem('calorie-app:ai', JSON.stringify(ai))
    // An old v1.6.4 preference must not break anything (it is simply no longer read).
    if (!localStorage.getItem('calorie-app:ui')) localStorage.setItem('calorie-app:ui', JSON.stringify({ textTransition: 'snap' }))
    // Spies: getUserMedia calls; file input clicks (which input, capture attr, and the event being handled at that moment);
    // focus of the text field and the event being handled then. A real chooser can't be driven in headless WebKit.
    window.__gum = 0
    const md = navigator.mediaDevices
    if (md?.getUserMedia) { const g = md.getUserMedia.bind(md); md.getUserMedia = (...a) => { window.__gum++; return g(...a) } }
    window.__clicks = []
    const click = HTMLInputElement.prototype.click
    HTMLInputElement.prototype.click = function () {
      if (this.type === 'file') window.__clicks.push({ id: this.dataset.testid, capture: this.getAttribute('capture'), ev: window.event?.type ?? null, trusted: !!window.event?.isTrusted })
      return click.call(this)
    }
    window.__focus = []
    // A trusted click is "being handled" from the window capture phase to the window bubble phase (React runs in between).
    window.__tap = null
    window.addEventListener('click', (e) => { if (e.isTrusted) window.__tap = 'click' }, true)
    window.addEventListener('click', () => { window.__tap = null })
    document.addEventListener('focusin', (e) => { if (e.target.tagName === 'TEXTAREA') window.__focus.push({ ev: window.__tap }) }, true)
  }, [STATE, AI])
  const sent = []
  await ctx.route('https://generativelanguage.googleapis.com/**', (r) => {
    if (r.request().method() === 'OPTIONS') return r.fulfill({ status: 204, headers: CORS })
    sent.push(r.request().postData())
    return r.fulfill({ status: 200, contentType: 'application/json', headers: CORS, body: JSON.stringify(geminiOk(EST)) })
  })
  const page = await ctx.newPage()
  page.on('console', (m) => { if ((m.type() === 'error' || m.type() === 'warning') && !/Service Worker registration blocked|service worker/i.test(m.text())) errors.push(`${tag}: ${m.type()}: ${m.text()}`) })
  page.on('pageerror', (e) => errors.push(`${tag}: ${e.message}`))
  const shot = async (name) => { await page.waitForTimeout(350); await page.screenshot({ path: `${OUT}v17-${name}-${tag}.png` }) }
  const btn = page.getByRole('button', { name: 'Estimate with AI', exact: true })
  const menu = page.getByTestId('ai-menu')
  const typeIt = page.getByRole('menuitem', { name: 'Type it' })
  const takePhoto = page.getByRole('menuitem', { name: 'Take photo' })
  const dlg = page.getByRole('dialog')
  const active = () => page.evaluate(() => { const a = document.activeElement; return a ? (a.getAttribute('role') === 'menuitem' ? `menuitem:${a.textContent}` : a.tagName.toLowerCase() + (a.dataset.testid ? `#${a.dataset.testid}` : '')) : '' })
  const clicks = () => page.evaluate(() => window.__clicks)
  const store = () => page.evaluate(() => ({ v2: localStorage.getItem('calorie-app:v2'), ai: localStorage.getItem('calorie-app:ai') }))
  const openMenu = async () => { await btn.tap(); await menu.waitFor(); await page.waitForTimeout(250) }
  let before

  await step(`${tag}: tap the sparkle: menu pops up from the button, Type it above Take photo, pills >= 44 px, nothing off screen`, async () => {
    await page.goto(BASE + '/log')
    await btn.waitFor()
    await page.waitForTimeout(300)
    before = await store()
    assert.ok(before.v2 && JSON.parse(before.v2).entries.length > 0, 'v2 data present')
    await openMenu()
    assert.equal(await btn.getAttribute('aria-expanded'), 'true')
    assert.equal(await btn.getAttribute('aria-haspopup'), 'menu')
    assert.deepEqual(await page.getByRole('menuitem').allInnerTexts(), ['Type it', 'Take photo'], 'DOM/reading order top to bottom')
    const [t, p, b] = [await typeIt.boundingBox(), await takePhoto.boundingBox(), await btn.boundingBox()]
    assert.ok(t.y + t.height <= p.y, 'Type it above Take photo')
    assert.ok(p.y + p.height <= b.y && b.y - (p.y + p.height) <= 24, `Take photo right above the button (${Math.round(b.y - p.y - p.height)} px)`)
    for (const [n, r] of [['Type it', t], ['Take photo', p]]) {
      assert.ok(r.height >= 44 && r.width >= 44, `${n} at least 44 px (${r.width}x${r.height})`)
      assert.ok(r.x >= 0 && r.x + r.width <= width && r.y >= 0, `${n} on screen`)
      assert.ok(Math.abs(r.x + r.width - (b.x + b.width)) < 1.5, `${n} right-aligned with the button`)
    }
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)
    assert.equal(overflow, false, 'no horizontal overflow')
    const cover = page.getByRole('button', { name: 'Close AI menu' })
    const cb = await cover.boundingBox()
    assert.ok(Math.abs(cb.x - b.x) < 1 && Math.abs(cb.y - b.y) < 1, 'sparkle stays in place on top of the scrim')
    assert.equal(await dlg.count(), 0, 'no sheet yet')
    assert.equal(await active(), 'menuitem:Type it', 'focus moves into the menu')
    await shot('menu-open')
  })

  await step(`${tag}: dismiss: tap outside, tap the sparkle again, Escape (focus back on the AI button); nothing opens`, async () => {
    await page.touchscreen.tap(width / 2, 120)
    await menu.waitFor({ state: 'detached' })
    assert.equal(await btn.getAttribute('aria-expanded'), 'false')
    await openMenu()
    await page.getByRole('button', { name: 'Close AI menu' }).tap()
    await menu.waitFor({ state: 'detached' })
    await openMenu()
    await page.keyboard.press('Escape')
    await menu.waitFor({ state: 'detached' })
    assert.equal(await active(), 'button#ai-btn', 'focus returns to the AI button')
    assert.equal(await dlg.count(), 0)
    assert.deepEqual(await clicks(), [], 'no picker opened')
  })

  await step(`${tag}: keyboard: Enter opens the menu, arrows move between pills, Enter on Type it opens the sheet`, async () => {
    await btn.focus()
    await page.keyboard.press('Enter')
    await menu.waitFor()
    assert.equal(await active(), 'menuitem:Type it')
    await page.keyboard.press('ArrowDown')
    assert.equal(await active(), 'menuitem:Take photo')
    await page.keyboard.press('ArrowDown')
    assert.equal(await active(), 'menuitem:Type it', 'wraps')
    await page.keyboard.press('ArrowUp')
    assert.equal(await active(), 'menuitem:Take photo')
    await page.keyboard.press('Tab')
    assert.equal(await active(), 'menuitem:Type it', 'Tab stays in the menu')
    await page.keyboard.press('Enter')
    await dlg.getByTestId('photo-strip').waitFor()
    assert.equal(await active(), 'textarea')
    await page.keyboard.press('Escape')
    await dlg.waitFor({ state: 'detached' })
  })

  await step(`${tag}: Take photo opens the capture input (rear camera) inside the tap; the menu closes and no sheet opens yet`, async () => {
    await page.evaluate(() => { window.__clicks = [] })
    await openMenu()
    await takePhoto.tap()
    const c = await clicks()
    assert.equal(c.length, 1)
    assert.deepEqual(c[0], { id: 'photo-capture', capture: 'environment', ev: 'click', trusted: true }, 'capture input clicked synchronously in the tap')
    await menu.waitFor({ state: 'detached' })
    assert.equal(await dlg.count(), 0)
    assert.equal(await page.getByTestId('photo-capture').getAttribute('accept'), 'image/*')
  })

  await step(`${tag}: cancelling the camera leaves the log with nothing open`, async () => {
    await page.getByTestId('photo-capture').evaluate((el) => { el.dispatchEvent(new Event('cancel', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })) })
    await page.waitForTimeout(300)
    assert.equal(await dlg.count(), 0, 'no sheet')
    assert.equal(await menu.count(), 0, 'no menu')
    await btn.waitFor()
    assert.match(page.url(), /\/log$/)
  })

  await step(`${tag}: after a shot the sheet opens with the photo (downscaled JPEG) and the note field NOT focused`, async () => {
    await page.getByTestId('photo-capture').setInputFiles(PLATE)
    const added = dlg.getByTestId('photo-added')
    await added.waitFor()
    assert.match(await added.locator('img').getAttribute('src'), /^data:image\/jpeg;base64,/)
    assert.ok((await added.boundingBox()).height >= 132, 'big photo frame')
    const note = dlg.getByRole('textbox', { name: 'Add a note (optional)' })
    await note.waitFor()
    await page.waitForTimeout(300)
    assert.notEqual(await active(), 'textarea', 'keyboard stays down')
    assert.equal(await dlg.getByRole('button', { name: /Estimate/ }).isDisabled(), false, 'photo alone can be estimated')
    await dlg.getByRole('button', { name: 'Retake' }).waitFor()
    await shot('photo-sheet')
    await page.evaluate(() => { window.__clicks = [] })
    await dlg.getByRole('button', { name: 'Retake' }).tap()
    assert.deepEqual((await clicks()).map((x) => x.id), ['photo-capture'], 'Retake opens the camera again')
    sent.length = 0
    await dlg.getByRole('button', { name: /Estimate/ }).tap()
    await dlg.getByText('Estimated from your photo').waitFor()
    assert.ok(sent[0].includes('inlineData'), 'photo sent')
    await page.keyboard.press('Escape')
    await dlg.waitFor({ state: 'detached' })
  })

  await step(`${tag}: Type it focuses the text field inside the tap; dashed "Add a photo (optional)" strip above it`, async () => {
    await openMenu()
    await page.evaluate(() => { window.__focus = [] })
    await typeIt.tap()
    const f = await page.evaluate(() => ({ list: window.__focus, now: document.activeElement?.tagName }))
    assert.equal(f.now, 'TEXTAREA', 'focused right after the tap')
    assert.ok(f.list.length >= 1 && f.list[0].ev === 'click', 'focus happened while the tap was handled: ' + JSON.stringify(f.list))
    await menu.waitFor({ state: 'detached' })
    const strip = dlg.getByTestId('add-photo')
    assert.equal(Math.round((await strip.boundingBox()).height), 56)
    assert.equal(await strip.evaluate((el) => getComputedStyle(el).borderTopStyle), 'dashed')
    assert.match(await strip.innerText(), /Add a photo\s*\(optional\)/)
    assert.equal(await dlg.getByRole('textbox', { name: 'What did you eat?' }).count(), 1)
    await page.waitForTimeout(400)
    const [sb, nb] = await dlg.evaluate((el) => ['[data-testid=add-photo]', 'textarea'].map((q) => el.querySelector(q).getBoundingClientRect()))
    assert.ok(sb.y + sb.height <= nb.y, 'strip above the field')
    await page.keyboard.type('Nasi uduk')
    await shot('type-sheet')
  })

  await step(`${tag}: the strip offers Take photo (camera) and Choose from photos (library), both >= 44 px and on screen`, async () => {
    const strip = dlg.getByTestId('add-photo')
    await strip.tap()
    assert.equal(await strip.getAttribute('aria-expanded'), 'true')
    const opts = dlg.getByTestId('strip-options')
    await opts.waitFor()
    assert.deepEqual(await opts.getByRole('button').allInnerTexts(), ['Take photo', 'Choose from photos'])
    for (const b of await opts.getByRole('button').all()) {
      const r = await b.boundingBox()
      assert.ok(r.height >= 44 && r.x >= 0 && r.x + r.width <= width, `option size/position ${JSON.stringify(r)}`)
      assert.ok(!(await b.evaluate((el) => el.scrollWidth > el.clientWidth)), 'label fits')
    }
    await dlg.getByTestId('photo-tip').waitFor()
    await shot('strip-options')
    await page.evaluate(() => { window.__clicks = [] })
    await opts.getByRole('button', { name: 'Take photo' }).tap()
    await opts.getByRole('button', { name: 'Choose from photos' }).tap()
    const c = await clicks()
    assert.deepEqual(c.map((x) => [x.id, x.capture, x.ev]), [['photo-capture', 'environment', 'click'], ['photo-input', null, 'click']])
    await page.getByTestId('photo-input').setInputFiles(PLATE)
    await dlg.getByTestId('photo-added').waitFor()
    assert.equal(await dlg.getByRole('textbox').inputValue(), 'Nasi uduk', 'text kept')
    await page.keyboard.press('Escape')
    await dlg.waitFor({ state: 'detached' })
  })

  await step(`${tag}: Me > AI card has no "Text field transition" setting (old calorie-app:ui value ignored)`, async () => {
    await page.goto(BASE + '/settings')
    const card = page.locator('#ai')
    await card.waitFor()
    assert.equal(await page.getByText('Text field transition').count(), 0)
    assert.equal(await page.getByTestId('transition-setting').count(), 0)
    assert.equal(await page.getByRole('radio', { name: /Smooth fade|Instant snap/ }).count(), 0)
    await card.evaluate((el) => el.scrollIntoView({ block: 'start' }))
    await page.evaluate(() => window.scrollBy(0, -12))
    await shot('ai-card')
  })

  await step(`${tag}: no getUserMedia calls; calorie-app:v2 and calorie-app:ai unchanged by the menu flows`, async () => {
    assert.equal(await page.evaluate(() => window.__gum), 0)
    assert.deepEqual(await store(), before)
    assert.deepEqual(JSON.parse(before.ai), AI)
  })
  await ctx.close()
}

await step('no console errors or warnings', async () => { assert.deepEqual(errors, []) })
await browser.close()
console.log(results.join('\n'))
console.log(`\n${results.length} v1.7 menu checks passed, no console errors`)
