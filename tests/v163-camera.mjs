// v1.6.3 live camera in the AI sheet, in Chrome and WebKit (Safari's engine) with a mocked camera (canvas stream).
// Covers: the gradient star button, preview on open, shutter -> photo, text first stops the tracks, the strip restarts
// them, gallery opens the picker, tracks stop on hidden/results/close and come back, and the no-camera fallback
// (permission refused, no camera, no getUserMedia) opening on the "Use a photo" strip without re-prompting.
// Usage: npm run build && npx vite preview --port 4174 & node tests/v163-camera.mjs   (SHOTS=1 also writes v163-*.png)
import { chromium, webkit, devices } from 'playwright'
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

// The 4th run keeps motion on: WebKit used to start the stream while the sheet slid in and never get frames.
const RUNS = [['webkit', 390, 844], ['webkit', 375, 667], ['chromium', 390, 844], ['webkit', 390, 844, 'no-preference']]
const browsers = { webkit: await webkit.launch(), chromium: await chromium.launch() }
await makePlate(browsers.chromium)

const context = async (engine, width, height, mode, motion = 'reduce') => {
  const ctx = await browsers[engine].newContext(engine === 'webkit'
    ? { ...devices['iPhone 14'], viewport: { width, height }, deviceScaleFactor: 3, reducedMotion: motion, serviceWorkers: 'block' }
    : { viewport: { width, height }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, reducedMotion: motion, serviceWorkers: 'block' })
  await ctx.addInitScript((s) => {
    if (!localStorage.getItem('calorie-app:v1') && !localStorage.getItem('calorie-app:v2')) localStorage.setItem('calorie-app:v1', JSON.stringify(s))
    if (!localStorage.getItem('calorie-app:ai')) localStorage.setItem('calorie-app:ai', JSON.stringify({ provider: 'gemini', key: 'AIzaTEST-not-a-real-key-000000000000' }))
    window.__picks = 0
    const click = HTMLInputElement.prototype.click
    HTMLInputElement.prototype.click = function () { if (this.type === 'file') { window.__picks++; return } return click.call(this) }
  }, STATE)
  await ctx.addInitScript(CAMERA_MOCK, mode)
  const sent = []
  await ctx.route('https://generativelanguage.googleapis.com/**', (r) => {
    if (r.request().method() === 'OPTIONS') return r.fulfill({ status: 204, headers: CORS })
    sent.push(r.request().postData())
    return r.fulfill({ status: 200, contentType: 'application/json', headers: CORS, body: JSON.stringify(geminiOk(EST)) })
  })
  const page = await ctx.newPage()
  const tag = `${engine} ${width}x${height}${motion === 'reduce' ? '' : ' motion'}`
  page.on('console', (m) => { if ((m.type() === 'error' || m.type() === 'warning') && !/Service Worker registration blocked|service worker/i.test(m.text())) errors.push(`${tag}: ${m.type()}: ${m.text()}`) })
  page.on('pageerror', (e) => errors.push(`${tag}: ${e.message}`))
  const shot = async (name) => { if (SHOTS && engine === 'webkit' && motion === 'reduce') { await page.waitForTimeout(400); await page.screenshot({ path: `${OUT}v163-${name}-${width}x${height}.png` }) } }
  return { ctx, page, sent, shot, tag }
}

for (const [engine, width, height, motion] of RUNS) {
  const { ctx, page, sent, shot, tag } = await context(engine, width, height, 'ok', motion)
  const dlg = page.getByRole('dialog')
  const frame = dlg.getByTestId('photo-frame')
  const live = () => page.evaluate(() => window.__live())
  const calls = () => page.evaluate(() => window.__cam.calls)
  const picks = () => page.evaluate(() => window.__picks)
  const tap = (l) => (engine === 'webkit' ? l.tap() : l.click())
  const waitLive = async (n = 1) => { await dlg.locator('[data-cam=live]').waitFor(); await page.waitForFunction(() => document.querySelector('[data-testid=camera-preview]')?.videoWidth > 0); await page.waitForFunction((k) => window.__live() === k, n) }
  const open = async () => { await tap(page.getByRole('button', { name: 'Estimate with AI', exact: true })); await dlg.getByRole('heading', { name: 'AI estimate' }).waitFor() }
  const close = async () => { await page.keyboard.press('Escape'); await dlg.waitFor({ state: 'detached' }) }

  await step(`${tag}: Log bar: one four-point star, 34 px, green to orange gradient with its own id, cream button, line border`, async () => {
    await page.goto(BASE + '/log')
    const btn = page.getByRole('button', { name: 'Estimate with AI', exact: true })
    await btn.waitFor()
    const info = await btn.evaluate((el) => {
      const svg = el.querySelector('svg'), c = getComputedStyle(el), r = el.getBoundingClientRect(), s = svg.getBoundingClientRect()
      const fill = svg.getAttribute('fill'), id = fill.match(/^url\(#(.+)\)$/)?.[1]
      const grad = id && document.getElementById(id)
      return { n: el.querySelectorAll('svg').length, paths: svg.querySelectorAll('path').length, fill, id, tag: grad?.tagName, stops: grad ? [...grad.querySelectorAll('stop')].map((x) => x.getAttribute('stop-color').toUpperCase()) : [], ids: document.querySelectorAll(`[id="${id}"]`).length, bg: c.backgroundColor, border: c.borderTopColor, size: [Math.round(r.width), Math.round(r.height), Math.round(s.width), Math.round(s.height)], text: el.innerText.trim() }
    })
    assert.equal(info.n, 1); assert.equal(info.paths, 1, 'single star path')
    assert.equal(info.tag, 'linearGradient', 'fill points at a gradient: ' + info.fill)
    assert.deepEqual(info.stops, ['#2F8F5B', '#D9663F'])
    assert.equal(info.ids, 1, 'gradient id is unique on the page')
    assert.deepEqual([info.bg, info.border], ['rgb(255, 253, 248)', 'rgb(231, 223, 208)'])
    assert.deepEqual(info.size, [56, 56, 34, 34]); assert.equal(info.text, '')
    await shot('log-bar')
  })

  await step(`${tag}: open: live rear-camera preview fills the big frame, shutter and gallery buttons, tip; gradient ids stay unique`, async () => {
    await open()
    await waitLive()
    assert.equal(await calls(), 1)
    const c = await page.evaluate(() => window.__cam.constraints[0])
    assert.equal(c.audio, false); assert.deepEqual(c.video.facingMode, { ideal: 'environment' })
    const v = await dlg.getByTestId('camera-preview').evaluate((el) => ({ pi: el.playsInline, muted: el.muted, src: !!el.srcObject, w: el.videoWidth, paused: el.paused, fit: getComputedStyle(el).objectFit, h: el.getBoundingClientRect().height, fh: el.parentElement.parentElement.getBoundingClientRect().height }))
    assert.ok(v.pi && v.muted && v.src, 'playsinline, muted, stream attached')
    await page.waitForFunction(() => document.querySelector('[data-testid=camera-preview]').videoWidth > 0)
    assert.equal(v.fit, 'cover'); assert.ok(Math.abs(v.h - v.fh) < 1 && v.fh >= 132, `fills the frame (${v.h}/${v.fh})`)
    assert.equal(await frame.getAttribute('data-state'), 'big')
    const sh = await dlg.getByRole('button', { name: 'Take photo' }).boundingBox()
    assert.ok(Math.round(sh.width) === 64 && Math.round(sh.height) === 64, 'round 64 px shutter')
    await dlg.getByRole('button', { name: 'Choose from gallery' }).waitFor()
    await dlg.getByTestId('photo-tip').waitFor()
    assert.equal(await page.evaluate(() => { const ids = [...document.querySelectorAll('linearGradient')].map((g) => g.id); return new Set(ids).size === ids.length && ids.length >= 2 }), true, 'button and heading stars have different gradient ids')
    await shot('camera')
  })

  await step(`${tag}: text first folds to the strip and stops every track; tapping the strip expands and restarts the camera (no picker)`, async () => {
    await tap(dlg.getByRole('textbox'))
    await page.waitForFunction(() => window.__live() === 0)
    assert.equal(await frame.getAttribute('data-state'), 'strip')
    assert.equal(await dlg.getByTestId('camera-preview').evaluate((el) => el.srcObject), null)
    await page.keyboard.type('Nasi goreng')
    await page.evaluate(() => document.activeElement?.blur())
    await shot('strip')
    const p0 = await picks(), c0 = await calls()
    await tap(dlg.getByRole('button', { name: 'Add a photo (optional)' }))
    await waitLive()
    assert.equal(await frame.getAttribute('data-state'), 'big')
    assert.equal(await calls(), c0 + 1, 'getUserMedia again'); assert.equal(await picks(), p0, 'no picker')
  })

  await step(`${tag}: shutter grabs the frame into the photo state (downscaled JPEG, Change and remove), tracks stop; remove and Change go back to live`, async () => {
    await tap(dlg.getByRole('button', { name: 'Take photo' }))
    const added = dlg.getByTestId('photo-added')
    await added.waitFor()
    const img = await added.locator('img').evaluate((el) => new Promise((r) => { const go = () => r({ src: el.src.slice(0, 23), w: el.naturalWidth, h: el.naturalHeight }); el.complete ? go() : el.onload = go }))
    assert.equal(img.src, 'data:image/jpeg;base64,')
    assert.deepEqual([img.w, img.h], [1024, 768], 'camera 1280x960 downscaled to 1024 px')
    await page.waitForFunction(() => window.__live() === 0)
    await dlg.getByRole('button', { name: 'Change' }).waitFor()
    await tap(dlg.getByRole('button', { name: 'Remove photo' }))
    await waitLive()
    await tap(dlg.getByRole('button', { name: 'Take photo' }))
    await added.waitFor()
    await shot('photo-taken')
    await tap(dlg.getByRole('button', { name: 'Change' }))
    await waitLive()
    assert.equal(await dlg.getByTestId('photo-added').count(), 0)
  })

  await step(`${tag}: gallery button opens the file picker (no capture flag); the picked photo replaces the preview, camera off`, async () => {
    const p0 = await picks()
    await tap(dlg.getByRole('button', { name: 'Choose from gallery' }))
    assert.equal(await picks(), p0 + 1)
    assert.equal(await page.getByTestId('photo-input').getAttribute('capture'), null)
    await page.getByTestId('photo-input').setInputFiles(PLATE)
    await dlg.getByTestId('photo-added').waitFor()
    await page.waitForFunction(() => window.__live() === 0)
    await tap(dlg.getByRole('button', { name: 'Remove photo' }))
    await waitLive()
  })

  await step(`${tag}: app hidden stops the tracks, visible again restarts them`, async () => {
    const vis = (s) => page.evaluate((st) => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => st }); document.dispatchEvent(new Event('visibilitychange')) }, s)
    await vis('hidden')
    await page.waitForFunction(() => window.__live() === 0)
    const c0 = await calls()
    await vis('visible')
    await waitLive()
    assert.equal(await calls(), c0 + 1)
  })

  await step(`${tag}: Estimate (chip only, camera live) stops the tracks for loading and results; Edit brings the camera back; close stops them`, async () => {
    await tap(dlg.getByRole('group', { name: 'Quick notes' }).getByRole('button', { name: 'No rice' }))
    assert.equal(await live(), 1, 'chip keeps the camera')
    sent.length = 0
    await tap(dlg.getByRole('button', { name: /^Estimate/ }))
    await dlg.getByText('Estimated from your description').waitFor()
    assert.equal(await live(), 0, 'results: camera off')
    assert.ok(!sent[0].includes('inlineData'))
    await tap(dlg.getByRole('button', { name: 'Edit' }))
    await waitLive()
    await close()
    assert.equal(await live(), 0, 'closed: every track stopped')
    await open(); await waitLive(); await close()
    assert.equal(await live(), 0)
  })
  await ctx.close()

  for (const mode of engine === 'webkit' && width === 375 ? ['deny'] : ['deny', 'missing', 'none']) {
    const f = await context(engine, width, height, mode)
    const d = f.page.getByRole('dialog')
    await step(`${f.tag}: no camera (${mode}): sheet opens on the thin strip with "Use a photo", which opens the picker; no re-prompt on reopen`, async () => {
      await f.page.goto(BASE + '/log')
      const ai = f.page.getByRole('button', { name: 'Estimate with AI', exact: true })
      await (engine === 'webkit' ? ai.tap() : ai.click())
      await d.getByRole('heading', { name: 'AI estimate' }).waitFor()
      await d.locator('[data-testid=photo-frame][data-cam=none]').waitFor()
      const fr = d.getByTestId('photo-frame')
      assert.equal(await fr.getAttribute('data-state'), 'strip')
      assert.equal(Math.round((await fr.boundingBox()).height), 56)
      const use = d.getByRole('button', { name: 'Use a photo' })
      assert.match(await use.innerText(), /Use a photo\s*\(optional\)/)
      assert.equal(await d.getByRole('button', { name: 'Take photo' }).count(), 0, 'no shutter exposed')
      assert.equal(await d.getByTestId('photo-tip').isVisible() && (await d.getByTestId('photo-tip').boundingBox()).height > 1, false, 'tip folded away')
      assert.equal(await d.getByRole('textbox').getAttribute('aria-label'), 'What did you eat?')
      const c1 = await f.page.evaluate(() => window.__cam?.calls ?? 0)
      assert.equal(c1, mode === 'none' ? 0 : 1)
      await f.shot('fallback')
      const p0 = await f.page.evaluate(() => window.__picks)
      await (engine === 'webkit' ? use.tap() : use.click())
      assert.equal(await f.page.evaluate(() => window.__picks), p0 + 1, 'picker opened')
      await f.page.getByTestId('photo-input').setInputFiles(PLATE)
      await d.getByTestId('photo-added').waitFor()
      await (engine === 'webkit' ? d.getByRole('button', { name: 'Remove photo' }).tap() : d.getByRole('button', { name: 'Remove photo' }).click())
      await d.getByRole('button', { name: 'Use a photo' }).waitFor()
      await f.page.keyboard.press('Escape'); await d.waitFor({ state: 'detached' })
      await (engine === 'webkit' ? ai.tap() : ai.click())
      await d.getByRole('button', { name: 'Use a photo' }).waitFor()
      assert.equal(await f.page.evaluate(() => window.__cam?.calls ?? 0), c1, 'no second permission prompt this session')
    })
    await f.ctx.close()
  }
}

await step('no console errors or warnings', async () => { assert.deepEqual(errors, []) })
for (const b of Object.values(browsers)) await b.close()
console.log(results.join('\n'))
console.log(`\n${results.filter((r) => r.startsWith('PASS')).length} v1.6.3 camera checks passed, no console errors`)
