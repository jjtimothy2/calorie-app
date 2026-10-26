// v1.6.4 text-field transition in the AI sheet, in WebKit (Safari's engine) with touch and a mocked camera.
// Covers: focus taken in the same tap, no height animation in Smooth fade (one layout change, opacity only), the frozen
// still frame during the fade, tracks stopped only after the fade, Instant snap swapping with no fade, Reduce Motion
// forcing snap, the Me toggle persisting in calorie-app:ui, calorie-app:v2 and :ai untouched, the sheet riding a
// simulated keyboard (fake window.visualViewport, rAF-throttled offset), and the no-camera text path.
// Usage: npm run build && npx vite preview --port 4174 & node tests/v164-transition.mjs   (SHOTS=1 also writes v164-*.png)
import { webkit, devices } from 'playwright'
import assert from 'node:assert/strict'
import { STATE } from './v11-fixture.mjs'
import { CAMERA_MOCK } from './camera-mock.mjs'

const BASE = (process.env.BASE_URL ?? 'http://localhost:4174/calorie-app').replace(/\/$/, '')
const SHOTS = process.env.SHOTS === '1'
const OUT = new URL('../screenshots/', import.meta.url).pathname
const results = [], errors = []
const step = async (name, fn) => {
  const t = Date.now()
  try { await fn(); results.push(`PASS ${name} (${Date.now() - t} ms)`) } catch (e) { results.push(`FAIL ${name}: ${e.message}`); console.log(results.join('\n')); throw e }
}

// Fake visualViewport: window.__kb(px) "opens" a keyboard of that height (iOS keeps the layout height, the visual
// viewport shrinks). Also records whether each focusin happened inside a tap's event dispatch.
const VV_MOCK = () => {
  const vv = new EventTarget()
  let kb = 0
  Object.defineProperties(vv, {
    height: { get: () => innerHeight - kb }, width: { get: () => innerWidth }, offsetTop: { get: () => 0 }, offsetLeft: { get: () => 0 },
    pageTop: { get: () => scrollY }, pageLeft: { get: () => 0 }, scale: { get: () => 1 },
  })
  Object.defineProperty(window, 'visualViewport', { configurable: true, get: () => vv })
  window.__kb = (px) => { kb = px; vv.dispatchEvent(new Event('resize')) }
  window.__kbSync = (px) => { kb = px; vv.dispatchEvent(new Event('resize')) }
  const inside = new Set()
  for (const t of ['pointerdown', 'pointerup', 'touchstart', 'touchend', 'mousedown', 'mouseup', 'click']) {
    window.addEventListener(t, () => inside.add(t), true)
    window.addEventListener(t, () => inside.delete(t), false)
  }
  window.__focusLog = []
  document.addEventListener('focusin', (e) => window.__focusLog.push({ tag: e.target.tagName, during: [...inside] }), true)
}

const browser = await webkit.launch()
const RUNS = [[390, 844, 336], [375, 667, 260]]

const context = async (width, height, { motion = 'no-preference', cam = 'ok', ui = null } = {}) => {
  const ctx = await browser.newContext({ ...devices['iPhone 14'], viewport: { width, height }, deviceScaleFactor: 3, reducedMotion: motion, serviceWorkers: 'block' })
  await ctx.addInitScript(({ s, ui }) => {
    if (!localStorage.getItem('calorie-app:v1') && !localStorage.getItem('calorie-app:v2')) localStorage.setItem('calorie-app:v1', JSON.stringify(s))
    if (!localStorage.getItem('calorie-app:ai')) localStorage.setItem('calorie-app:ai', JSON.stringify({ provider: 'gemini', key: 'AIzaTEST-not-a-real-key-000000000000' }))
    if (ui && !sessionStorage.getItem('ui-set')) { localStorage.setItem('calorie-app:ui', JSON.stringify(ui)); sessionStorage.setItem('ui-set', '1') }
  }, { s: STATE, ui })
  await ctx.addInitScript(CAMERA_MOCK, cam)
  await ctx.addInitScript(VV_MOCK)
  const page = await ctx.newPage()
  const tag = `${width}x${height}${motion === 'reduce' ? ' reduced' : ''}${cam !== 'ok' ? ` cam=${cam}` : ''}`
  page.on('console', (m) => { if ((m.type() === 'error' || m.type() === 'warning') && !/service worker/i.test(m.text())) errors.push(`${tag}: ${m.type()}: ${m.text()}`) })
  page.on('pageerror', (e) => errors.push(`${tag}: ${e.message}`))
  return { ctx, page, tag }
}

const store = (page) => page.evaluate(() => ({ v2: localStorage.getItem('calorie-app:v2'), ai: localStorage.getItem('calorie-app:ai'), ui: localStorage.getItem('calorie-app:ui') }))
const openSheet = async (page) => {
  await page.getByRole('button', { name: 'Estimate with AI', exact: true }).tap()
  const dlg = page.getByRole('dialog')
  await dlg.getByRole('heading', { name: 'AI estimate' }).waitFor()
  return dlg
}
const waitLive = async (page) => {
  await page.locator('[data-cam=live]').waitFor()
  await page.waitForFunction(() => document.querySelector('[data-testid=camera-preview]')?.videoWidth > 0 && window.__live() === 1)
  await page.waitForTimeout(300) // sheet slide-in done
}
// Samples every animation frame for `ms` after a tap on the text field: frame height, camera layer opacity, still shown,
// live tracks, fading flag. Times are relative to the focusin.
const tapAndSample = (page, ms) => page.evaluate(async (ms) => {
  const f = document.querySelector('[data-testid=photo-frame]')
  const layer = f.querySelector('[data-testid=camera-layer]')
  const still = f.querySelector('[data-testid=camera-still]')
  const ta = document.querySelector('[role=dialog] textarea')
  const out = []
  let t0 = 0
  ta.addEventListener('focus', () => { t0 = performance.now() }, { once: true })
  const sample = () => out.push({ t: t0 ? performance.now() - t0 : -1, h: Math.round(f.getBoundingClientRect().height * 10) / 10, op: +getComputedStyle(layer).opacity, still: getComputedStyle(still).display !== 'none', live: window.__live(), fading: f.dataset.fading === 'true' })
  window.__sampling = true
  await new Promise((resolve) => {
    const tick = () => { sample(); if (t0 && performance.now() - t0 > ms) return resolve(); requestAnimationFrame(tick) }
    requestAnimationFrame(tick)
  })
  return out
}, ms)

for (const [width, height, kb] of RUNS) {
  const { ctx, page, tag } = await context(width, height)
  const fs = (name) => `${OUT}v164-${name}-${width}x${height}.png`
  let before

  await step(`${tag}: Me: "Text field transition" toggle defaults to Smooth fade, persists Instant snap in calorie-app:ui across reloads, v2 and ai untouched`, async () => {
    await page.goto(BASE + '/log')
    await page.getByRole('button', { name: 'Estimate with AI', exact: true }).waitFor()
    before = await store(page)
    assert.ok(before.v2 && before.ai, 'fixture data present')
    assert.equal(before.ui, null, 'no ui entry until the toggle is used')
    await page.goto(BASE + '/settings')
    const group = page.getByRole('radiogroup', { name: 'Text field transition' })
    await group.waitFor()
    const fade = group.getByRole('radio', { name: 'Smooth fade' }), snap = group.getByRole('radio', { name: 'Instant snap' })
    assert.equal(await fade.getAttribute('aria-checked'), 'true')
    assert.equal(await snap.getAttribute('aria-checked'), 'false')
    await snap.tap()
    assert.deepEqual(JSON.parse((await store(page)).ui), { textTransition: 'snap' })
    await page.reload()
    await group.waitFor()
    assert.equal(await snap.getAttribute('aria-checked'), 'true', 'Instant snap kept after reload')
    if (SHOTS) {
      await page.getByTestId('transition-setting').scrollIntoViewIfNeeded()
      await page.evaluate(() => window.scrollBy(0, 120))
      await page.waitForTimeout(300)
      await page.screenshot({ path: fs('settings-toggle') })
    }
    await fade.tap()
    assert.deepEqual(JSON.parse((await store(page)).ui), { textTransition: 'fade' })
    const after = await store(page)
    assert.equal(after.v2, before.v2, 'calorie-app:v2 byte for byte the same')
    assert.equal(after.ai, before.ai, 'calorie-app:ai byte for byte the same')
  })

  await step(`${tag}: Smooth fade: focus is taken inside the tap; one layout change (big -> 56 px, no in-between heights, no height transition); still frame shown while the camera layer fades; tracks stop only after the fade`, async () => {
    await page.goto(BASE + '/log')
    const dlg = await openSheet(page)
    await waitLive(page)
    if (SHOTS) await page.screenshot({ path: fs('camera') })
    const frame = dlg.getByTestId('photo-frame')
    const big = Math.round((await frame.boundingBox()).height * 10) / 10
    assert.ok(big >= 132)
    assert.ok(!/height|all/.test(await frame.evaluate((el) => getComputedStyle(el).transitionProperty)), 'frame has no height transition')
    const tipBefore = (await dlg.getByTestId('photo-tip').boundingBox()).height
    assert.ok(tipBefore > 10)
    await page.evaluate(() => { window.__focusLog = [] })
    const samplesP = tapAndSample(page, 450)
    await dlg.getByRole('textbox').tap()
    const s = (await samplesP).filter((x) => x.t >= 0)
    // Focus inside the tap's own event dispatch, and it stuck.
    const log = await page.evaluate(() => window.__focusLog)
    const ta = log.find((x) => x.tag === 'TEXTAREA')
    assert.ok(ta, 'textarea got focus: ' + JSON.stringify(log))
    assert.ok(ta.during.length > 0, 'focus happened during the tap (' + ta.during.join(',') + ')')
    assert.equal(await page.evaluate(() => document.activeElement?.tagName), 'TEXTAREA')
    // One layout change.
    const heights = [...new Set(s.map((x) => x.h))]
    assert.deepEqual(heights, [56], `frame is 56 px from the first frame after focus, nothing in between: ${JSON.stringify(heights)} (big was ${big})`)
    assert.ok((await dlg.getByTestId('photo-tip').boundingBox()).height < 1, 'tip gone in the same change')
    // Still + fade.
    const fadingFrames = s.filter((x) => x.fading)
    assert.ok(fadingFrames.length >= 3, 'fading for several frames')
    assert.ok(fadingFrames.every((x) => x.still), 'the still frame is shown for the whole fade')
    assert.ok(s.some((x) => x.op > 0.05 && x.op < 0.95), 'camera layer opacity passes through the middle: ' + s.map((x) => x.op.toFixed(2)).join(' '))
    const drawn = await dlg.getByTestId('camera-still').evaluate((c) => { const g = c.getContext('2d'); const d = g.getImageData(c.width / 2 - 5, c.height / 2 - 5, 10, 10).data; let sum = 0; for (let i = 0; i < d.length; i += 4) sum += d[i] + d[i + 1] + d[i + 2]; return { w: c.width, h: c.height, sum, at: c.dataset.drawn } })
    assert.ok(drawn.w > 100 && drawn.h > 100 && drawn.sum > 0 && drawn.at, 'the still holds a real camera frame ' + JSON.stringify(drawn))
    // Tracks: live through the fade, off right after it.
    if (process.env.DEBUG) console.log(JSON.stringify(ta), s.map((x) => `${x.t.toFixed(0)}:${x.h}:${x.op.toFixed(2)}:${x.still ? 'S' : '-'}:${x.live}`).join(' '))
    const firstOff = s.find((x) => x.live === 0)
    assert.ok(s.filter((x) => x.t < 150).every((x) => x.live === 1), 'camera still running during the fade')
    assert.ok(firstOff && firstOff.t >= 180, `tracks stop only after the fade (first off at ${firstOff?.t.toFixed(0)} ms)`)
    const lastFade = Math.max(...fadingFrames.map((x) => x.t))
    assert.ok(firstOff.t >= lastFade, `stopped after the last faded frame (${lastFade.toFixed(0)} -> ${firstOff.t.toFixed(0)})`)
    assert.equal(await page.evaluate(() => window.__live()), 0)
    assert.equal(await frame.getAttribute('data-state'), 'strip')
    assert.equal(await frame.getAttribute('data-trans'), 'fade')
    assert.equal(await dlg.getByTestId('camera-still').evaluate((c) => getComputedStyle(c).display), 'none', 'still hidden after the fade')
  })

  await step(`${tag}: sheet rides a simulated keyboard: offset follows visualViewport (translate, not bottom), rAF-throttled, Estimate stays above the keyboard`, async () => {
    const dlg = page.getByRole('dialog')
    await page.keyboard.type('Nasi goreng telur')
    const r0 = await dlg.boundingBox()
    // 6 resize events in one task -> at most one style write in that frame.
    const writes = await page.evaluate(async (kb) => {
      const d = document.querySelector('[role=dialog]')
      let n = 0
      const mo = new MutationObserver((m) => { n += m.filter((x) => x.attributeName === 'style').length })
      mo.observe(d, { attributes: true })
      for (let i = 1; i <= 6; i++) window.__kbSync(Math.round(kb * i / 6))
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
      mo.disconnect()
      return { n, style: d.getAttribute('style'), kbAttr: d.dataset.kb, bottom: d.style.bottom }
    }, kb)
    assert.ok(writes.n <= 2, `rAF-throttled: ${writes.n} style writes for 6 resize events`)
    assert.equal(writes.kbAttr, String(kb))
    assert.equal(writes.bottom, '', 'no bottom offset (no layout jump)')
    assert.match(writes.style, new RegExp(`translate: 0px -${kb}px`))
    // Glides: mid-transition it sits between, then lands glued to the keyboard edge.
    await page.waitForTimeout(90)
    const mid = await dlg.boundingBox()
    await page.waitForTimeout(400)
    const end = await dlg.boundingBox()
    const target = height - kb
    assert.ok(Math.abs(end.y + end.height - target) < 2, `sheet bottom at the keyboard edge (${Math.round(end.y + end.height)} vs ${target})`)
    assert.ok(mid.y + mid.height < r0.y + r0.height - 5 && mid.y + mid.height > target + 5, `moving smoothly, not jumping (${Math.round(r0.y + r0.height)} -> ${Math.round(mid.y + mid.height)} -> ${Math.round(end.y + end.height)})`)
    const est = await dlg.getByRole('button', { name: /^Estimate/ }).boundingBox()
    assert.ok(est.y >= 0 && est.y + est.height <= target + 1, 'Estimate visible above the keyboard')
    assert.equal(await page.evaluate(() => document.activeElement?.tagName), 'TEXTAREA', 'focus kept')
    // Keyboard follows in steps (as iOS reports it) -> the offset follows each step.
    for (const k of [Math.round(kb / 2), 0]) {
      await page.evaluate((k) => window.__kb(k), k)
      await page.waitForTimeout(400)
      const b = await dlg.boundingBox()
      assert.ok(Math.abs(b.y + b.height - (height - k)) < 2, `follows to ${k} px`)
    }
    assert.equal(await page.evaluate(() => document.querySelector('[role=dialog]').style.translate), '', 'offset cleared with the keyboard down')
    if (SHOTS) {
      await page.evaluate((kb) => {
        window.__kb(kb)
        const k = document.createElement('div')
        k.id = 'fake-kb'
        k.style.cssText = `position:fixed;left:0;right:0;bottom:0;height:${kb}px;background:#d3d5db;z-index:99;display:flex;align-items:center;justify-content:center;font:600 15px system-ui;color:#6b6f78`
        k.textContent = 'keyboard (simulated)'
        document.body.appendChild(k)
      }, kb)
      await page.waitForTimeout(450)
      await page.screenshot({ path: fs('strip-keyboard') })
      await page.evaluate(() => { document.getElementById('fake-kb')?.remove(); window.__kb(0) })
      await page.waitForTimeout(400)
    }
    await page.keyboard.press('Escape')
    await dlg.waitFor({ state: 'detached' })
  })

  if (SHOTS) await step(`${tag}: screenshot mid-fade (fade slowed to 4 s and the still pinned, for the picture only)`, async () => {
    const dlg = await openSheet(page)
    await waitLive(page)
    await page.addStyleTag({ content: '[data-testid=camera-layer],[data-testid=add-photo],[data-testid=photo-frame] .border-dashed,[data-testid=note-label] span{transition-duration:4s!important}[data-testid=camera-still]{display:block!important}[data-testid=camera-layer] > span.bg-ink{display:none!important}' })
    await dlg.getByRole('textbox').tap()
    await page.waitForTimeout(1500)
    await page.screenshot({ path: fs('mid-fade') })
    await page.keyboard.press('Escape')
    await dlg.waitFor({ state: 'detached' })
    await page.reload()
  })

  await step(`${tag}: Instant snap: frame, labels and strip swap at once with no fade and no still; camera stops after`, async () => {
    await page.evaluate(() => localStorage.setItem('calorie-app:ui', JSON.stringify({ textTransition: 'snap' })))
    await page.goto(BASE + '/log')
    const dlg = await openSheet(page)
    await waitLive(page)
    const frame = dlg.getByTestId('photo-frame')
    assert.equal(await frame.getAttribute('data-trans'), 'snap')
    const samplesP = tapAndSample(page, 350)
    await dlg.getByRole('textbox').tap()
    const s = (await samplesP).filter((x) => x.t >= 0)
    assert.deepEqual([...new Set(s.map((x) => x.h))], [56], 'strip size at once')
    assert.ok(s.every((x) => x.op === 0), 'camera layer gone in the first frame (no fade): ' + s.map((x) => x.op).join(' '))
    assert.ok(s.every((x) => !x.fading && !x.still), 'no still, no fading state')
    const dash = await frame.evaluate((el) => [getComputedStyle(el.querySelector('.border-dashed')).transitionDuration, getComputedStyle(el.querySelector('[data-testid=add-photo]')).opacity])
    assert.deepEqual(dash, ['0s', '1'], 'strip shown with no transition')
    assert.equal(await page.evaluate(() => document.activeElement?.tagName), 'TEXTAREA')
    await page.waitForFunction(() => window.__live() === 0)
    await page.keyboard.press('Escape')
    const after = await store(page)
    assert.equal(after.v2, before.v2, 'calorie-app:v2 untouched')
    assert.equal(after.ai, before.ai, 'calorie-app:ai untouched')
  })
  await ctx.close()

  const r = await context(width, height, { motion: 'reduce', ui: { textTransition: 'fade' } })
  await step(`${r.tag}: Reduce Motion forces Instant snap even with Smooth fade chosen; Me says so`, async () => {
    await r.page.goto(BASE + '/log')
    const dlg = await openSheet(r.page)
    await waitLive(r.page)
    const frame = dlg.getByTestId('photo-frame')
    await dlg.getByRole('textbox').tap()
    assert.equal(await frame.getAttribute('data-trans'), 'snap')
    assert.equal(await frame.getAttribute('data-fading'), null)
    assert.equal(Math.round((await frame.boundingBox()).height), 56)
    await r.page.keyboard.press('Escape')
    await r.page.goto(BASE + '/settings')
    await r.page.getByText('Reduce Motion is on, so the AI sheet always snaps.').waitFor()
  })
  await r.ctx.close()

  const d = await context(width, height, { cam: 'deny' })
  await step(`${d.tag}: camera refused: opens on the "Use a photo (optional)" strip, the text path works (focus in one tap, no fade, no still)`, async () => {
    await d.page.goto(BASE + '/log')
    const dlg = await openSheet(d.page)
    const frame = dlg.locator('[data-testid=photo-frame][data-cam=none]')
    await frame.waitFor()
    assert.equal(await frame.getAttribute('data-state'), 'strip')
    assert.match(await dlg.getByRole('button', { name: 'Use a photo' }).innerText(), /Use a photo\s*\(optional\)/)
    await dlg.getByRole('textbox').tap()
    assert.equal(await d.page.evaluate(() => document.activeElement?.tagName), 'TEXTAREA')
    assert.equal(await frame.getAttribute('data-fading'), null)
    await d.page.keyboard.type('Soto ayam')
    assert.equal(await dlg.getByRole('button', { name: /^Estimate/ }).isDisabled(), false)
  })
  await d.ctx.close()
}

await step('no console errors or warnings', async () => { assert.deepEqual(errors, []) })
await browser.close()
console.log(results.join('\n'))
console.log(`\n${results.filter((r) => r.startsWith('PASS')).length} v1.6.4 transition checks passed, no console errors`)
