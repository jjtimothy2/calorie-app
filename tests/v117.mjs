// v1.17 Quick Log Menu (Reed's spec, approved by Jordy). The bottom-nav + opens four stacked white pills (style A, 44 px)
// over a scrim instead of going to Log, from the thumb up: Take photo, Upload, Describe it, Manual, each with an icon.
// Open: + turns into an x, scrim fades in, pills rise out of the + one after another with a light spring (200 ms in
// all); x, scrim, Escape or browser back close it in reverse. Reduced motion: fade only. Take photo / Upload click their
// file input synchronously inside the tap (capture=environment for the camera, none for the library), Describe it opens
// the describe sheet, the result logs to the meal for the time of day. Manual opens Log with no autofocus. No key: the
// AI pills say "Need AI key" and open the setup sheet. Offline: "Needs internet" and do nothing. Manual always works.
// Log: the Snap a photo / Describe your meal tiles are gone (search 98 px higher), the ✦ button stays.
// 44 px targets, 16 px+ inputs, fits at 375. Schema stays v3; :v2 :v1 :ai :foods byte-identical. Mocked Gemini.
// WebKit at 390x844 and 375x667. Screenshots: screenshots/v117-*.png.
// Usage: npm run build && npx vite preview --port 4174 & node tests/v117.mjs
import { webkit, devices } from 'playwright'
import assert from 'node:assert/strict'
import { PLATE, geminiOk, makePlate } from './v15-fixture.mjs'

const BASE = (process.env.BASE_URL ?? 'http://localhost:4174/calorie-app').replace(/\/$/, '')
const OUT = new URL('../screenshots/', import.meta.url).pathname
const results = [], errors = []
const step = async (name, fn) => {
  try { await fn(); results.push(`PASS ${name}`) } catch (e) { results.push(`FAIL ${name}: ${e.message.slice(0, 900)}`); console.log(results.join('\n')); console.log(errors.join('\n')); throw e }
}
const pad = (n) => String(n).padStart(2, '0')
const key = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const ago = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return key(d) }
const TODAY = ago(0)
const T = Date.now() - 3600_000
const profile = { age: 32, sex: 'male', heightCm: 175, weightKg: 92, activity: 'light', goal: 'lose', bmr: 1859, bmrCustom: false, includeMovement: false, goalWeightKg: 85, goalDate: ago(-120), planFrom: { date: ago(3), kg: 92 }, goalAssumed: false, macros: { protein: null, carbs: null, fat: null }, target: 1800, dailyGoal: 500 }
const entries = [{ id: 'q1', date: TODAY, meal: 'breakfast', foodId: null, name: 'Kopi susu', servingLabel: 'Quick add', servingMult: 1, qty: 1, kcal: 140, protein: 10, carbs: 20, fat: 5, createdAt: T + 1 }]
const V3 = JSON.stringify({ version: 3, profile, entries, exercises: [], closedDays: {}, favourites: [], weights: [{ date: ago(3), kg: 92 }] })
const AI = JSON.stringify({ provider: 'gemini', key: 'AIzaTEST-not-a-real-key-000000000000' })
const FIXED = {
  'calorie-app:v2': '{"version":2,"profile":null,"entries":[],"exercises":[],"closedDays":{},"favourites":[]}',
  'calorie-app:v1': '{"version":1,"entries":[]}',
  'calorie-app:ai': AI,
  'calorie-app:foods': JSON.stringify({ version: 1, foods: [{ id: 'u_bubur', name: 'Bubur ayam', kcal: 320, protein: 12, carbs: 45, fat: 8, createdAt: 1, updatedAt: 1 }] }),
}
const EST = {
  dish: 'Nasi ayam', scale_ref: '',
  items: [
    { name: 'Nasi putih', portion: '1 plate', grams: 150, kcal: 250, protein_g: 5, carbs_g: 55, fat_g: 1, confidence: 'high' },
    { name: 'Ayam goreng', portion: '1 thigh', grams: 120, kcal: 330, protein_g: 25, carbs_g: 5, fat_g: 23, confidence: 'medium' },
  ],
}
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET, POST, OPTIONS' }
const ORDER = ['Take photo', 'Upload', 'Describe it', 'Manual'] // from the thumb up
const IDS = ['plus-photo', 'plus-upload', 'plus-describe', 'plus-manual']

const browser = await webkit.launch()
await makePlate(browser)
for (const [w, h] of [[390, 844], [375, 667]]) {
  const tag = `${w}x${h}`
  const ctx = await browser.newContext({ ...devices['iPhone 14'], viewport: { width: w, height: h }, deviceScaleFactor: 3, hasTouch: true, isMobile: true, serviceWorkers: 'block' })
  let geminiCalls = 0
  await ctx.route('https://generativelanguage.googleapis.com/**', (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS })
    geminiCalls++
    return route.fulfill({ status: 200, contentType: 'application/json', headers: CORS, body: JSON.stringify(geminiOk(EST)) })
  })
  await ctx.addInitScript(([v3, fixed]) => {
    // Every file-input click: which input, its capture attribute, and the event it ran inside (a trusted tap = in the gesture).
    window.__clicks = []
    const click = HTMLInputElement.prototype.click
    HTMLInputElement.prototype.click = function () {
      const ev = window.event
      window.__clicks.push({ id: this.dataset.testid, type: this.type, capture: this.getAttribute('capture'), ev: ev?.type ?? null, trusted: !!ev?.isTrusted, phase: document.querySelector('[data-testid=plus-overlay]')?.dataset.phase ?? null })
      return click.call(this)
    }
    if (localStorage.getItem('calorie-app:v3')) return
    localStorage.setItem('calorie-app:v3', v3)
    for (const [k, v] of Object.entries(fixed)) localStorage.setItem(k, v)
    localStorage.setItem('calorie-app:backup', JSON.stringify({ lastExportAt: Date.now(), dismissedAt: null }))
  }, [V3, FIXED])
  const page = await ctx.newPage()
  page.on('console', (m) => { if ((m.type() === 'error' || m.type() === 'warning') && !/service worker/i.test(m.text()) && !/status of 404/.test(m.text())) errors.push(`${tag}: ${m.type()}: ${m.text()}`) })
  page.on('response', (r) => { if (r.status() === 404 && r.request().resourceType() !== 'document') errors.push(`${tag}: 404 ${r.url()}`) })
  page.on('pageerror', (er) => errors.push(`${tag}: pageerror: ${er.message}`))
  const dialog = page.getByRole('dialog')
  const overlay = page.getByTestId('plus-overlay')
  const shot = async (name) => { await page.waitForTimeout(350); await page.screenshot({ path: `${OUT}v117-${name}-${tag}.png` }) }
  const box = (loc) => loc.evaluate((e) => { const r = e.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height } })
  const tapLoc = async (loc) => { const b = await box(loc); await page.touchscreen.tap(b.l + b.w / 2, b.t + b.h / 2) }
  const openMenu = async () => { await tapLoc(page.getByTestId('plus')); await page.getByTestId('plus-menu').waitFor(); await page.waitForTimeout(260) }
  const gone = () => overlay.waitFor({ state: 'detached', timeout: 2000 })
  const clicks = () => page.evaluate(() => window.__clicks.splice(0))
  const st = () => page.evaluate(() => JSON.parse(localStorage.getItem('calorie-app:v3')))
  const items = () => dialog.getByRole('list', { name: 'Estimated items' }).getByRole('listitem')
  const logBtn = () => dialog.getByRole('button', { name: /^Log \d+ items?/ })
  const home = async () => { await page.goto(BASE + '/'); await page.getByTestId('balance').waitFor(); await page.waitForTimeout(300) }

  await step(`${tag} + on Home opens the menu over a scrim, stays on Home; pills from the thumb up: ${ORDER.join(', ')}, each with an icon`, async () => {
    await home()
    await clicks()
    await openMenu()
    assert.equal(new URL(page.url()).pathname.replace(/\/$/, ''), new URL(BASE).pathname)
    assert.equal(await page.getByTestId('plus').getAttribute('aria-expanded'), 'true')
    assert.equal(await page.getByTestId('plus').getAttribute('aria-haspopup'), 'menu')
    const pills = await page.getByRole('menu', { name: 'Log food' }).getByRole('menuitem').evaluateAll((els) => els.map((e) => { const r = e.getBoundingClientRect(); return { id: e.dataset.testid, text: e.innerText.trim(), svg: e.querySelectorAll('svg').length, y: r.top, muted: e.hasAttribute('data-muted') } }))
    const up = [...pills].sort((a, b) => b.y - a.y)
    assert.deepEqual(up.map((p) => p.text), ORDER)
    assert.deepEqual(up.map((p) => p.id), IDS)
    for (const p of pills) { assert.equal(p.svg, 1, `${p.text} icon`); assert.equal(p.muted, false) }
    assert.equal(await page.getByTestId('plus-sub').count(), 0)
    // The scrim covers the screen; the x sits exactly on the +.
    const [frame, scrim, x, plus] = await Promise.all([box(page.locator('#app-frame')), box(page.getByTestId('plus-scrim')), box(page.getByTestId('plus-close')), box(page.getByTestId('plus'))])
    assert.deepEqual([scrim.l, scrim.t, scrim.w, scrim.h], [frame.l, frame.t, frame.w, frame.h])
    assert.deepEqual([x.l, x.t, x.w, x.h], [plus.l, plus.t, plus.w, plus.h])
    const bg = await page.getByTestId('plus-scrim').evaluate((e) => getComputedStyle(e).backgroundColor)
    assert.match(bg, /rgba\(42, 36, 32, 0\.32\)/)
    // White pills (style A).
    for (const id of IDS) assert.equal(await page.getByTestId(id).evaluate((e) => getComputedStyle(e).backgroundColor), 'rgb(255, 253, 248)')
    await shot('menu-open')
  })

  await step(`${tag} animation: + turns 45° into an x, scrim fades in, pills rise with a light spring 20 ms apart, 200 ms in all`, async () => {
    const a = await page.evaluate(() => {
      const anim = (el) => el.getAnimations().map((x) => ({ name: x.animationName, dur: x.effect.getTiming().duration, delay: x.effect.getTiming().delay, ease: x.effect.getTiming().easing, fill: x.effect.getTiming().fill }))
      const css = (sel) => { const e = document.querySelector(sel); return { anim: getComputedStyle(e).animationName, dur: getComputedStyle(e).animationDuration, delay: getComputedStyle(e).animationDelay, ease: getComputedStyle(e).animationTimingFunction } }
      return {
        pills: ['photo', 'upload', 'describe', 'manual'].map((id) => css(`[data-testid=plus-${id}]`)),
        scrim: css('[data-testid=plus-scrim]'), x: css('[data-testid=plus-close] svg'),
        xTransform: getComputedStyle(document.querySelector('[data-testid=plus-close] svg')).transform,
        running: anim(document.querySelector('[data-testid=plus-overlay]')).length,
      }
    })
    assert.deepEqual(a.pills.map((p) => p.anim), ['plus-rise', 'plus-rise', 'plus-rise', 'plus-rise'])
    assert.deepEqual(a.pills.map((p) => p.delay), ['0s', '0.02s', '0.04s', '0.06s'])
    for (const p of a.pills) { assert.equal(p.dur, '0.14s'); assert.match(p.ease, /cubic-bezier\(0\.34, 1\.4, 0\.64, 1\)/, 'spring overshoot') }
    assert.equal(0.14 + 0.06, 0.2)
    assert.deepEqual([a.scrim.anim, a.scrim.dur], ['fade-in', '0.2s'])
    assert.deepEqual([a.x.anim, a.x.dur], ['plus-turn', '0.2s'])
    const m = a.xTransform.match(/matrix\(([^)]+)\)/)[1].split(',').map(Number)
    assert.ok(Math.abs(m[0] - Math.SQRT1_2) < 0.01 && Math.abs(m[1] - Math.SQRT1_2) < 0.01, `x rotated 45°: ${a.xTransform}`)
    // Mid-rise (fresh open, sampled a few ms in): the top pill is still below its spot, so they really come out of the +.
    await tapLoc(page.getByTestId('plus-close')); await gone()
    await tapLoc(page.getByTestId('plus'))
    const mid = await page.getByTestId('plus-manual').evaluate((e) => new Promise((res) => requestAnimationFrame(() => res(getComputedStyle(e).opacity))))
    assert.ok(Number(mid) < 1, `manual pill mid-animation opacity ${mid}`)
    await page.waitForTimeout(260)
    assert.equal(await page.getByTestId('plus-manual').evaluate((e) => getComputedStyle(e).opacity), '1')
  })

  await step(`${tag} x closes it in reverse (pills sink top first, x turns back, scrim fades), then the + is back; no history left behind`, async () => {
    await tapLoc(page.getByTestId('plus-close'))
    const out = await page.evaluate(() => ({
      phase: document.querySelector('[data-testid=plus-overlay]').dataset.phase,
      pills: ['photo', 'upload', 'describe', 'manual'].map((id) => { const cs = getComputedStyle(document.querySelector(`[data-testid=plus-${id}]`)); return [cs.animationName, cs.animationDelay] }),
      scrim: getComputedStyle(document.querySelector('[data-testid=plus-scrim]')).animationName,
      x: getComputedStyle(document.querySelector('[data-testid=plus-close] svg')).animationName,
    }))
    assert.equal(out.phase, 'out')
    assert.deepEqual(out.pills, [['plus-sink', '0.06s'], ['plus-sink', '0.04s'], ['plus-sink', '0.02s'], ['plus-sink', '0s']])
    assert.deepEqual([out.scrim, out.x], ['fade-out', 'plus-unturn'])
    await gone()
    assert.equal(await page.getByTestId('plus').getAttribute('aria-expanded'), 'false')
  })

  await step(`${tag} scrim and back close it too; Escape as well. Back with it open stays on the tab; after closing, back leaves the tab as before`, async () => {
    await page.getByRole('link', { name: 'Nutrition', exact: true }).click(); await page.waitForURL('**/nutrition'); await page.waitForTimeout(300)
    // scrim
    await openMenu()
    await page.touchscreen.tap(w / 2, 120); await gone()
    // back: closes the menu, still on Nutrition
    await openMenu()
    await page.goBack(); await gone()
    assert.match(page.url(), /\/nutrition$/)
    // Escape
    await openMenu()
    await page.keyboard.press('Escape'); await gone()
    assert.match(page.url(), /\/nutrition$/)
    // Each close dropped its history entry: one back now returns to Home.
    await page.goBack(); await page.getByTestId('balance').waitFor()
    assert.equal(new URL(page.url()).pathname.replace(/\/$/, ''), new URL(BASE).pathname)
  })

  await step(`${tag} the menu opens from every tab (Today, Nutrition, History, Me), pills clear the nav and fit on screen`, async () => {
    for (const [path, ready] of [['/', 'balance'], ['/nutrition', null], ['/history', null], ['/settings', 'log-weight']]) {
      await page.goto(BASE + path); if (ready) await page.getByTestId(ready).waitFor(); await page.waitForTimeout(300)
      await openMenu()
      const g = await page.evaluate(() => {
        const nav = document.querySelector('nav[aria-label=Main]').getBoundingClientRect(), f = document.getElementById('app-frame').getBoundingClientRect()
        const labels = [...document.querySelectorAll('nav[aria-label=Main] a')].map((a) => a.getBoundingClientRect())
        const p = [...document.querySelectorAll('[role=menuitem]')].map((e) => { const r = e.getBoundingClientRect(); const t = e.lastElementChild; return { l: r.left, r: r.right, t: r.top, b: r.bottom, h: r.height, fits: e.scrollWidth <= e.clientWidth, line: t.firstChild.nodeType === 3 } })
        return { nav: nav.top, labelTop: Math.min(...labels.map((r) => r.top)), f: { l: f.left, r: f.right, t: f.top }, p, sideScroll: document.documentElement.scrollWidth > document.documentElement.clientWidth }
      })
      for (const p of g.p) {
        assert.equal(p.h, 44, `${path} pill height`)
        assert.ok(p.l >= g.f.l + 8 && p.r <= g.f.r - 8 && p.t >= g.f.t + 8, `${path} pill on screen ${JSON.stringify(p)}`)
        assert.ok(p.b <= g.labelTop - 12, `${path} pills clear the nav labels (${p.b} vs ${g.labelTop})`)
        assert.ok(p.fits, `${path} label fits, no clip`)
      }
      assert.equal(g.sideScroll, false)
      await page.keyboard.press('Escape'); await gone()
    }
  })

  await step(`${tag} 44 px targets: each pill is solid 176x44 by hit test, the x is 60x60; labels one line (no wrap)`, async () => {
    await home(); await openMenu()
    const m = await page.evaluate(() => [...document.querySelectorAll('[role=menuitem], [data-testid=plus-close]')].map((el) => {
      const r = el.getBoundingClientRect(); let n = 0, all = 0
      for (let x = Math.ceil(r.left) + 1; x < r.right - 1; x += 2) for (let y = Math.ceil(r.top) + 1; y < r.bottom - 1; y += 2) {
        if (el.dataset.testid === 'plus-close') { const dx = x - (r.left + r.width / 2), dy = y - (r.top + r.height / 2); if (dx * dx + dy * dy > (r.width / 2 - 2) ** 2) continue }
        else { const rad = r.height / 2, cx = Math.min(Math.max(x, r.left + rad), r.right - rad), cy = r.top + rad; if ((x - cx) ** 2 + (y - cy) ** 2 > (rad - 1) ** 2) continue }
        all++; const e = document.elementFromPoint(x, y); if (e && (e === el || el.contains(e))) n++
      }
      const lab = el.querySelector('span:last-child')
      return { id: el.dataset.testid, w: r.width, h: r.height, solid: n / all, lines: lab ? Math.round(lab.getBoundingClientRect().height / parseFloat(getComputedStyle(lab).lineHeight)) : 0, font: parseFloat(getComputedStyle(el).fontSize) }
    }))
    for (const t of m) {
      if (t.id === 'plus-close') assert.deepEqual([t.w, t.h], [60, 60])
      else { assert.deepEqual([t.w, t.h, t.lines], [176, 44, 1], t.id); assert.equal(t.font, 17) }
      assert.equal(t.solid, 1, `${t.id} solid`)
    }
    await page.keyboard.press('Escape'); await gone()
  })

  await step(`${tag} reduced motion: the menu just fades in and out (no rise, no spring, no turn), x shows straight away`, async () => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await tapLoc(page.getByTestId('plus')); await page.getByTestId('plus-menu').waitFor()
    const a = await page.evaluate(() => {
      const c = (sel) => { const cs = getComputedStyle(document.querySelector(sel)); return [cs.animationName, cs.animationDuration] }
      return { pills: ['photo', 'upload', 'describe', 'manual'].map((id) => c(`[data-testid=plus-${id}]`)), scrim: c('[data-testid=plus-scrim]'), x: c('[data-testid=plus-close]'), svg: c('[data-testid=plus-close] svg'), t: getComputedStyle(document.querySelector('[data-testid=plus-close] svg')).transform }
    })
    for (const p of [...a.pills, a.scrim, a.x]) assert.deepEqual(p, ['fade-in', '0.15s'])
    assert.equal(a.svg[0], 'none')
    assert.match(a.t, /matrix\(0\.707/)
    await page.waitForTimeout(250)
    await shot('menu-reduced')
    await tapLoc(page.getByTestId('plus-close'))
    const o = await page.evaluate(() => ['photo', 'manual'].map((id) => getComputedStyle(document.querySelector(`[data-testid=plus-${id}]`)).animationName))
    assert.deepEqual(o, ['fade-out', 'fade-out'])
    await gone()
    await page.emulateMedia({ reducedMotion: 'no-preference' })
  })

  await step(`${tag} Take photo: the camera input (capture=environment) is clicked synchronously inside the tap, then the photo goes to the AI sheet`, async () => {
    await home(); await clicks()
    await openMenu()
    const chooser = page.waitForEvent('filechooser', { timeout: 3000 })
    await tapLoc(page.getByTestId('plus-photo'))
    const fc = await chooser
    assert.equal(await fc.element().getAttribute('data-testid'), 'plus-photo-capture')
    const c = await clicks()
    assert.deepEqual(c, [{ id: 'plus-photo-capture', type: 'file', capture: 'environment', ev: 'click', trusted: true, phase: 'in' }])
    await gone()
    await fc.setFiles(PLATE)
    await dialog.getByTestId('photo-added').waitFor()
    await dialog.getByRole('button', { name: /^Estimate$/ }).click()
    await items().filter({ hasText: 'Ayam goreng' }).waitFor()
    assert.equal(await dialog.getByTestId('photo-source').innerText(), 'Estimated from your photo')
    await page.keyboard.press('Escape'); await dialog.waitFor({ state: 'detached' })
  })

  await step(`${tag} Upload: the library input (no capture attribute) is clicked inside the tap; photo reaches the AI sheet`, async () => {
    await openMenu()
    const chooser = page.waitForEvent('filechooser', { timeout: 3000 })
    await tapLoc(page.getByTestId('plus-upload'))
    const fc = await chooser
    assert.equal(await fc.element().getAttribute('data-testid'), 'plus-photo-input')
    assert.equal(await fc.element().getAttribute('capture'), null)
    assert.deepEqual(await clicks(), [{ id: 'plus-photo-input', type: 'file', capture: null, ev: 'click', trusted: true, phase: 'in' }])
    await gone()
    await fc.setFiles(PLATE)
    await dialog.getByTestId('photo-added').waitFor()
    await page.keyboard.press('Escape'); await dialog.waitFor({ state: 'detached' })
  })

  await step(`${tag} Describe it opens the describe sheet (box focused, 16 px+); the result logs to the meal for the time of day`, async () => {
    for (const [hour, meal] of [[19, 'dinner'], [8, 'breakfast']]) {
      const d = new Date(); d.setHours(hour, 30, 0, 0)
      await page.clock.setFixedTime(d)
      await home()
      await openMenu()
      await tapLoc(page.getByTestId('plus-describe'))
      const box2 = dialog.getByRole('textbox', { name: 'What did you eat?' })
      await box2.waitFor(); await gone()
      assert.equal(await clicks().then((c) => c.length), 0, 'no picker for Describe it')
      const f = await box2.evaluate((e) => ({ focused: e === document.activeElement, px: parseFloat(getComputedStyle(e).fontSize) }))
      assert.ok(f.focused, 'describe box focused')
      assert.ok(f.px >= 16, `describe box ${f.px}px`)
      await box2.fill('nasi putih, ayam goreng')
      await dialog.getByRole('button', { name: /^Estimate$/ }).click()
      await items().filter({ hasText: 'Ayam goreng' }).waitFor()
      const before = (await st()).entries.length
      await logBtn().click(); await dialog.waitFor({ state: 'detached' })
      await page.getByTestId('balance').waitFor()
      const s = await st()
      const added = s.entries.slice(before)
      assert.deepEqual(added.map((e) => [e.name, e.meal, e.date, e.source]), [['Nasi putih', meal, TODAY, 'photo'], ['Ayam goreng', meal, TODAY, 'photo']], `${hour}:30 -> ${meal}`)
      assert.equal(added[0].groupId, added[1].groupId)
    }
    await page.clock.setFixedTime(new Date())
  })

  await step(`${tag} Manual opens Log: no keyboard, nothing focused; back returns to the tab; Log has no AI tiles, ✦ kept, search 98 px higher`, async () => {
    await page.goto(BASE + '/history'); await page.waitForTimeout(300)
    await openMenu()
    await tapLoc(page.getByTestId('plus-manual'))
    await page.waitForURL('**/log'); await page.getByRole('searchbox', { name: 'Search foods' }).waitFor(); await page.waitForTimeout(400)
    const a = await page.evaluate(() => ({ tag: document.activeElement?.tagName, kb: window.visualViewport.height, ih: window.innerHeight }))
    assert.ok(!['INPUT', 'TEXTAREA', 'SELECT'].includes(a.tag), `focused ${a.tag}`)
    assert.equal(a.kb, a.ih, 'no keyboard')
    assert.equal(await page.getByTestId('ai-cards').count(), 0)
    assert.equal(await page.locator('[data-testid^=ai-card]').count(), 0)
    assert.equal(await page.getByText(/Snap a photo|Describe your meal/).count(), 0)
    const ai = page.getByTestId('ai-btn')
    const ab = await box(ai)
    assert.deepEqual([ab.w, ab.h], [56, 56])
    assert.equal(await ai.getAttribute('aria-label'), 'Estimate with AI')
    // Search sits right under the Food / Exercise chips (gap 14), where the 84 px tiles + 14 px gap used to be.
    const g = await page.evaluate(() => {
      const chips = document.querySelector('[role=group][aria-label="What to log"]').getBoundingClientRect()
      const s = document.querySelector('input[aria-label="Search foods"]').closest('div').getBoundingClientRect()
      return { gap: s.top - chips.bottom, top: s.top, font: parseFloat(getComputedStyle(document.querySelector('input[aria-label="Search foods"]')).fontSize) }
    })
    assert.ok(Math.abs(g.gap - 14) < 0.5, `gap ${g.gap}`)
    assert.ok(g.font >= 16)
    await shot('log-after')
    // ✦ still opens its own menu (Take photo / From library / Type it).
    await ai.click(); await page.getByTestId('ai-menu').waitFor()
    assert.deepEqual(await page.getByRole('menu', { name: 'Estimate with AI' }).getByRole('menuitem').allInnerTexts(), ['Type it', 'From library', 'Take photo'])
    await page.keyboard.press('Escape'); await page.getByTestId('ai-menu').waitFor({ state: 'detached' })
    await page.goBack(); await page.waitForURL('**/history')
  })

  await step(`${tag} no AI key: Take photo, Upload, Describe it muted with "Need AI key"; tapping one opens the AI setup sheet (no picker); Manual works`, async () => {
    await page.evaluate(() => localStorage.removeItem('calorie-app:ai'))
    await home(); await clicks()
    await openMenu()
    for (const id of IDS) {
      const p = page.getByTestId(id), muted = id !== 'plus-manual'
      assert.equal(await p.evaluate((e) => e.hasAttribute('data-muted')), muted, id)
      assert.equal(await p.getAttribute('aria-disabled'), null, `${id} still works`)
      if (muted) {
        assert.equal(await p.getByTestId('plus-sub').innerText(), 'Need AI key')
        assert.match(await p.getAttribute('aria-label'), /\. Need AI key$/)
        assert.equal(await p.evaluate((e) => getComputedStyle(e).backgroundColor), 'rgb(239, 231, 216)')
      }
    }
    await shot('menu-nokey')
    for (const id of ['plus-photo', 'plus-upload', 'plus-describe']) {
      if (!(await overlay.count())) await openMenu()
      await tapLoc(page.getByTestId(id))
      await dialog.getByRole('heading', { name: 'AI estimate' }).waitFor()
      assert.equal(await dialog.getAttribute('aria-label'), 'Set up AI estimates')
      assert.deepEqual(await clicks(), [], `${id}: no picker without a key`)
      await gone()
      await page.keyboard.press('Escape'); await dialog.waitFor({ state: 'detached' })
    }
    await openMenu(); await tapLoc(page.getByTestId('plus-photo')); await gone()
    await dialog.getByRole('button', { name: /Add a key in Me/ }).click()
    await page.waitForURL('**/settings?ai=1')
    assert.equal(geminiCalls > 0, true)
    await page.waitForTimeout(700) // Me smooth-scrolls to the AI card; a tap during that scroll only stops it (WebKit)
    await openMenu(); await tapLoc(page.getByTestId('plus-manual')); await page.waitForURL('**/log')
    await page.evaluate((ai) => localStorage.setItem('calorie-app:ai', ai), AI)
  })

  await step(`${tag} offline with a key: the AI pills say "Needs internet" and tapping does nothing (menu stays, no picker, no sheet); Manual works`, async () => {
    await home()
    await ctx.setOffline(true); await page.waitForTimeout(200)
    await openMenu()
    for (const id of ['plus-photo', 'plus-upload', 'plus-describe']) {
      const p = page.getByTestId(id)
      assert.equal(await p.getByTestId('plus-sub').innerText(), 'Needs internet')
      assert.equal(await p.getAttribute('aria-disabled'), 'true')
      assert.match(await p.getAttribute('aria-label'), /\. Needs internet$/)
    }
    assert.equal(await page.getByTestId('plus-manual').getAttribute('data-muted'), null)
    await shot('menu-offline')
    for (const id of ['plus-photo', 'plus-upload', 'plus-describe']) {
      await tapLoc(page.getByTestId(id)); await page.waitForTimeout(300)
      assert.equal(await overlay.getAttribute('data-phase'), 'in', `${id}: menu stays open`)
      assert.equal(await dialog.count(), 0)
    }
    assert.deepEqual(await clicks(), [])
    await tapLoc(page.getByTestId('plus-manual')); await page.waitForURL('**/log')
    await page.getByRole('searchbox', { name: 'Search foods' }).waitFor()
    assert.equal(await page.getByTestId('ai-offline').count(), 1, 'Log ✦ shows its own Needs internet as before')
    await ctx.setOffline(false); await page.waitForTimeout(200)
  })

  await step(`${tag} storage stays v3; :v2 :v1 :ai :foods byte-identical, no new keys`, async () => {
    const s = await page.evaluate(() => Object.fromEntries(Object.keys(localStorage).map((k) => [k, localStorage.getItem(k)])))
    assert.deepEqual(Object.keys(s).sort(), ['calorie-app:ai', 'calorie-app:backup', 'calorie-app:foods', 'calorie-app:v1', 'calorie-app:v2', 'calorie-app:v3'])
    for (const [k, v] of Object.entries(FIXED)) assert.equal(s[k], v, k)
    const v3 = JSON.parse(s['calorie-app:v3'])
    assert.equal(v3.version, 3)
    assert.deepEqual(Object.keys(v3).sort(), Object.keys(JSON.parse(V3)).sort())
  })
  await ctx.close()
}
await browser.close()
console.log(results.join('\n'))
if (errors.length) { console.log(errors.join('\n')); process.exit(1) }
console.log(`\n${results.length} passed`)
