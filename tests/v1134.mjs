// v1.13.4: (1) every bottom sheet (shared Sheet.tsx) swipes down to close like an iOS sheet. A drag from the handle, or
// from the content scrolled to the top, moves the sheet with the finger and fades the backdrop; past 30% of its height
// or a flick closes it, less springs back to the same spot. Nothing behind moves (the moves the sheet owns are
// cancelled, html/body/sheet overscroll-behavior none). Content scrolled down scrolls first. Fields, meal pills and
// picker, steppers and swipe rows never start a drag. Escape and the backdrop still close. Reduced motion: no slide.
// (2) "After this" is worded like Home's goal line for the day it previews, with edit math total - old + new.
// No data change: calorie-app:v3, :v2 :v1 :ai :foods byte-identical. WebKit, hasTouch + isMobile, 390x844 and 375x667.
// WebKit on Linux has no Touch constructor and Playwright has no touch drag, so touches are dispatched as events with
// a touches list on the element under the point (what the handler reads). Screenshots: screenshots/v1134-*.png.
// Usage: npm run build && npx vite preview --port 4174 & node tests/v1134.mjs
import { webkit, devices } from 'playwright'
import assert from 'node:assert/strict'

const BASE = (process.env.BASE_URL ?? 'http://localhost:4174/calorie-app').replace(/\/$/, '')
const OUT = new URL('../screenshots/', import.meta.url).pathname
const results = [], errors = []
const step = async (name, fn) => {
  const t = Date.now()
  try { await fn(); results.push(`PASS ${name} (${Date.now() - t} ms)`) } catch (e) { results.push(`FAIL ${name}: ${e.message}`); console.log(results.join('\n')); console.log(errors.join('\n')); throw e }
}
const pad = (n) => String(n).padStart(2, '0')
const key = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const ago = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return key(d) }
const TODAY = ago(0), YDAY = ago(1)
const T = Date.now() - 3600_000
const profile = { age: 32, sex: 'male', heightCm: 175, weightKg: 92, activity: 'light', goal: 'lose', bmr: 1859, bmrCustom: false, includeMovement: false, goalWeightKg: 85, goalDate: ago(-120), planFrom: { date: ago(3), kg: 92 }, goalAssumed: false, macros: { protein: null, carbs: null, fat: null }, target: 1500, dailyGoal: 500 }
const quick = (id, date, meal, name, kcal, i, extra = {}) => ({ id, date, meal, foodId: null, name, servingLabel: 'Quick add', servingMult: 1, qty: 1, kcal, protein: 10, carbs: 20, fat: 5, createdAt: T + i, ...extra })
const ai = (id, date, g, name, kcal, i) => quick(id, date, 'lunch', name, kcal, i, { servingLabel: '100 g', source: 'photo', groupId: g, groupName: 'Nasi ayam goreng' })
const entries = [
  quick('q1', TODAY, 'breakfast', 'Kopi susu', 140, 1),
  { id: 'f1', date: TODAY, meal: 'breakfast', foodId: 'tempe-goreng', name: 'Tempe goreng', servingLabel: '1 piece (25 g)', servingMult: 1, qty: 2, kcal: 88, protein: 5, carbs: 3.5, fat: 6, createdAt: T + 2 },
  quick('m1', TODAY, 'snacks', 'Bubur ayam', 320, 3, { foodId: 'u_bubur', servingLabel: '1 serving' }),
  ai('a1', TODAY, 'g1', 'Nasi putih', 267, 4), ai('a2', TODAY, 'g1', 'Ayam goreng', 290, 5), ai('a3', TODAY, 'g1', 'Sambal', 40, 6),
  ai('a4', TODAY, 'g1', 'Tahu goreng', 80, 13), ai('a5', TODAY, 'g1', 'Lalapan', 15, 14), ai('a6', TODAY, 'g1', 'Kerupuk', 60, 15), ai('a7', TODAY, 'g1', 'Telur dadar', 150, 16),
  quick('q2', TODAY, 'lunch', 'Es teh manis', 90, 7),
  ai('y1', YDAY, 'g2', 'Nasi putih', 267, 8), ai('y2', YDAY, 'g2', 'Rendang', 470, 9),
  quick('y3', YDAY, 'dinner', 'Soto ayam', 450, 10),
]
const exercises = [
  { id: 'x1', date: TODAY, activityId: 'badminton', name: 'Badminton', minutes: 30, intensity: 'moderate', kcal: 253, createdAt: T + 11 },
  { id: 'x2', date: TODAY, activityId: null, name: 'Watch workout', minutes: 30, intensity: 'moderate', kcal: 250, createdAt: T + 12 },
]
const V3 = JSON.stringify({ version: 3, profile, entries, exercises, closedDays: {}, favourites: [], weights: [{ date: ago(3), kg: 92 }, { date: ago(2), kg: 91.8 }, { date: ago(1), kg: 91.6 }] })
const FIXED = {
  'calorie-app:v2': '{"version":2,"profile":null,"entries":[],"exercises":[],"closedDays":{},"favourites":[]}',
  'calorie-app:v1': '{"version":1,"entries":[]}',
  'calorie-app:ai': JSON.stringify({ provider: 'gemini', key: 'AIzaTEST-not-a-real-key-000000000000' }),
  'calorie-app:foods': JSON.stringify({ version: 1, foods: [{ id: 'u_bubur', name: 'Bubur ayam', kcal: 320, protein: 12, carbs: 45, fat: 8, createdAt: 1, updatedAt: 1 }] }),
}


const browser = await webkit.launch()
for (const [w, h] of [[390, 844], [375, 667]]) {
  const tag = `${w}x${h}`
  const ctx = await browser.newContext({ ...devices['iPhone 14'], viewport: { width: w, height: h }, deviceScaleFactor: 3, hasTouch: true, isMobile: true, serviceWorkers: 'block' })
  await ctx.addInitScript(([v3, fixed]) => {
    if (localStorage.getItem('calorie-app:v3')) return
    localStorage.setItem('calorie-app:v3', v3)
    for (const [k, v] of Object.entries(fixed)) localStorage.setItem(k, v)
    localStorage.setItem('calorie-app:backup', JSON.stringify({ lastExportAt: Date.now(), dismissedAt: null }))
  }, [V3, FIXED])
  // Touch helper: a touch event with a touches list, sent to the element under (x, y) at touchstart (as iOS does).
  await ctx.addInitScript(() => {
    let target = null
    window.__touch = (type, x, y) => {
      if (type === 'touchstart') target = document.elementFromPoint(x, y)
      const ev = new Event(type, { bubbles: true, cancelable: true })
      const t = { identifier: 1, target, clientX: x, clientY: y, pageX: x, pageY: y }
      const list = type === 'touchend' || type === 'touchcancel' ? [] : [t]
      Object.defineProperty(ev, 'touches', { value: list })
      Object.defineProperty(ev, 'changedTouches', { value: [t] })
      target.dispatchEvent(ev)
      return ev.defaultPrevented
    }
  })
  const page = await ctx.newPage()
  page.on('console', (m) => { if ((m.type() === 'error' || m.type() === 'warning') && !/service worker/i.test(m.text())) errors.push(`${tag}: ${m.type()}: ${m.text()}`) })
  page.on('pageerror', (er) => errors.push(`${tag}: pageerror: ${er.message}`))
  const dialog = page.getByRole('dialog')
  const shot = (name) => page.screenshot({ path: `${OUT}v1134-${name}-${tag}.png` })
  const st = () => page.evaluate(() => JSON.parse(localStorage.getItem('calorie-app:v3')))
  const home = async () => { await page.goto(BASE + '/'); await page.getByTestId('eaten').waitFor() }
  const touch = (type, x, y) => page.evaluate(([a, b, c]) => window.__touch(a, b, c), [type, x, y])
  /** Where things are: the sheet's top and transform, backdrop opacity, and everything behind that could move. */
  const look = () => page.evaluate(() => {
    const d = document.querySelector('[role=dialog]'), m = document.querySelector('main'), f = document.getElementById('app-frame')
    return d && { top: Math.round(d.getBoundingClientRect().top), h: d.offsetHeight, transform: d.style.transform, shade: d.previousElementSibling.style.opacity, scrollTop: d.scrollTop,
      winY: window.scrollY, mainTop: m ? m.scrollTop : null, frameTop: Math.round(f.getBoundingClientRect().top), docTop: document.scrollingElement.scrollTop }
  })
  const behind = (l) => ({ winY: l.winY, mainTop: l.mainTop, frameTop: l.frameTop, docTop: l.docTop })
  const handlePt = () => page.evaluate(() => { const r = document.querySelector('[data-sheet-handle]').getBoundingClientRect(); return [Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2)] })
  const pt = (loc) => loc.evaluate((e) => { const r = e.getBoundingClientRect(); return [Math.round(r.left + Math.min(r.width / 2, 30)), Math.round(r.top + r.height / 2)] })
  /** Drag from (x, y) down by dy in n moves, `ms` apart (real time, so the release speed is known). Returns the
   *  sheet mid-drag (after the last move) and whether every move was cancelled (iOS would not bounce). */
  const drag = async ([x, y], dy, { n = 8, ms = 30, release = true } = {}) => {
    await touch('touchstart', x, y)
    let prevented = true
    for (let i = 1; i <= n; i++) { await page.waitForTimeout(ms); prevented = (await touch('touchmove', x, y + (dy * i) / n)) && prevented }
    const mid = await look()
    if (release) await touch('touchend', x, y + dy)
    return { mid, prevented }
  }
  const settle = () => page.waitForTimeout(450)
  const closedCleanly = async (name) => { await dialog.waitFor({ state: 'detached', timeout: 2000 }).catch(() => { throw new Error(`${name}: sheet did not close`) }) }

  /** The full check on one open sheet: small drag springs back to the same spot, large drag closes, nothing behind moves. */
  const swipeChecks = async (name, open) => {
    await open(); await dialog.waitFor(); await settle()
    const v0 = await st()
    const l0 = await look()
    assert.equal(l0.transform, '', `${name}: no offset at rest`)
    // Small drag from the handle: follows the finger, backdrop fades, every move cancelled, springs back.
    const s = await drag(await handlePt(), Math.round(l0.h * 0.15))
    assert.ok(s.prevented, `${name}: the drag cancels its touch moves`)
    assert.ok(Math.abs(s.mid.top - (l0.top + Math.round(l0.h * 0.15))) <= 2, `${name}: sheet follows the finger (${s.mid.top} vs ${l0.top} + ${Math.round(l0.h * 0.15)})`)
    assert.ok(Number(s.mid.shade) < 1 && Number(s.mid.shade) > 0.5, `${name}: backdrop fades (${s.mid.shade})`)
    assert.deepEqual(behind(s.mid), behind(l0), `${name}: nothing behind moves during the drag`)
    await settle()
    const l1 = await look()
    assert.ok(l1, `${name}: a small drag does not close`)
    assert.equal(l1.top, l0.top, `${name}: springs back to the same spot`)
    assert.equal(l1.transform, '', `${name}: no offset left behind`)
    assert.equal(l1.shade, '', `${name}: backdrop back`)
    assert.deepEqual(behind(l1), behind(l0), `${name}: nothing behind moved`)
    // Large drag (45% of the height) closes; nothing is saved by a swipe.
    const L = await drag(await handlePt(), Math.round(l0.h * 0.45), { ms: 40 })
    assert.deepEqual(behind(L.mid), behind(l0), `${name}: nothing behind moves on the big drag`)
    await closedCleanly(name)
    assert.deepEqual(await st(), v0, `${name}: closing by swipe saves nothing`)
    const l2 = await page.evaluate(() => ({ winY: window.scrollY, mainTop: document.querySelector('main')?.scrollTop ?? null, frameTop: Math.round(document.getElementById('app-frame').getBoundingClientRect().top), docTop: document.scrollingElement.scrollTop }))
    assert.deepEqual(l2, behind(l0), `${name}: page behind unchanged after closing`)
  }

  await step(`${tag} root cause covered: no overscroll on html, body or the sheet; the handle is a drag target`, async () => {
    await home()
    await page.getByRole('button', { name: /^Edit Kopi susu/ }).click(); await dialog.waitFor()
    const cs = await page.evaluate(() => { const d = document.querySelector('[role=dialog]'); const g = (e) => getComputedStyle(e).overscrollBehaviorY; return { html: g(document.documentElement), body: g(document.body), sheet: g(d), fits: d.scrollHeight <= d.clientHeight, handle: !!d.querySelector('[data-sheet-handle]') } })
    // At 390x844 the sheet fits (nothing to scroll: the bug's trigger); on a short phone it scrolls. Either way no overscroll.
    assert.deepEqual(cs, { html: 'none', body: 'none', sheet: 'none', fits: tag === '390x844' ? true : cs.fits, handle: true })
    await page.keyboard.press('Escape'); await dialog.waitFor({ state: 'detached' })
  })

  await step(`${tag} every edit sheet: a small drag springs back to the same spot, a large drag closes, nothing behind moves (quick add, catalogue food, My food, AI item, exercise, quick burn, AI group)`, async () => {
    await home()
    await page.locator('main').evaluate((m) => { m.scrollTop = 120 }) // the page behind is scrolled a little
    const row = (n) => () => page.getByRole('button', { name: n }).click()
    await swipeChecks('quick add', row(/^Edit Kopi susu/))
    await swipeChecks('catalogue food', row(/^Edit Tempe goreng/))
    await swipeChecks('My food entry', row(/^Edit Bubur ayam/))
    await swipeChecks('exercise', row(/^Edit Badminton/))
    await swipeChecks('quick burn', row(/^Edit Watch workout/))
    await swipeChecks('AI group', () => page.getByTestId('ai-group-row').click())
    // The AI item edit opens over the group sheet; swiping it away goes back to the group.
    await page.getByTestId('ai-group-row').click(); await page.getByTestId('ai-group-sheet').waitFor()
    await page.getByRole('button', { name: /^Edit Ayam goreng/ }).click(); await page.getByRole('dialog', { name: 'Edit quick add' }).waitFor(); await settle()
    const top0 = (await look()).top
    await drag(await handlePt(), 60); await settle()
    assert.equal((await look()).top, top0, 'AI item: springs back')
    const h = (await look()).h
    await drag(await handlePt(), Math.round(h * 0.5)); await page.getByTestId('ai-group-sheet').waitFor()
    await page.waitForTimeout(400)
    assert.equal(await page.getByRole('dialog', { name: 'Edit quick add' }).count(), 0, 'AI item: closed')
    await page.keyboard.press('Escape'); await dialog.waitFor({ state: 'detached' })
  })

  await step(`${tag} a flick closes; a drag from the content at the top works; Escape and the backdrop still close`, async () => {
    await home()
    await page.getByRole('button', { name: /^Edit Kopi susu/ }).click(); await dialog.waitFor(); await settle()
    await drag(await handlePt(), 60, { n: 4, ms: 12 }) // 60 px in about 50 ms: a flick, well under 30%
    await closedCleanly('flick')
    await page.getByRole('button', { name: /^Edit Kopi susu/ }).click(); await dialog.waitFor(); await settle()
    const l0 = await look()
    const head = await pt(dialog.getByRole('heading').first())
    const s = await drag(head, 80, { release: false })
    assert.ok(s.prevented && Math.abs(s.mid.top - l0.top - 80) <= 2, `content drag follows the finger (${s.mid.top - l0.top})`)
    await shot('drag-mid')
    await touch('touchend', head[0], head[1] + 80); await settle()
    assert.equal((await look()).top, l0.top)
    await page.keyboard.press('Escape'); await dialog.waitFor({ state: 'detached' })
    await page.getByRole('button', { name: /^Edit Kopi susu/ }).click(); await dialog.waitFor(); await settle()
    await page.mouse.click(w / 2, 20) // the backdrop
    await dialog.waitFor({ state: 'detached' })
  })

  await step(`${tag} drags that start on a field, the meal pills, the group's meal picker, a stepper or a swipe row do not move the sheet`, async () => {
    await home()
    await page.getByRole('button', { name: /^Edit Kopi susu/ }).click(); await dialog.waitFor(); await settle()
    const top0 = (await look()).top
    for (const [n, loc] of [['kcal field', dialog.locator('input[name=kcal]')], ['meal pills', dialog.getByRole('group', { name: 'Meal' }).getByRole('button').first()]]) {
      const s = await drag(await pt(loc), 120)
      assert.ok(!s.prevented, `${n}: touch left to the browser`)
      assert.equal(s.mid.top, top0, `${n}: sheet did not move`)
      await settle()
    }
    assert.equal(await dialog.count(), 1)
    await page.keyboard.press('Escape'); await dialog.waitFor({ state: 'detached' })
    await page.getByRole('button', { name: /^Edit Tempe goreng/ }).click(); await dialog.waitFor(); await settle()
    let t0 = (await look()).top
    let s = await drag(await pt(dialog.getByRole('button', { name: 'Increase amount' })), 150)
    assert.equal(s.mid.top, t0, 'stepper: sheet did not move'); await settle(); assert.equal(await dialog.count(), 1)
    await page.keyboard.press('Escape'); await dialog.waitFor({ state: 'detached' })
    await page.getByTestId('ai-group-row').click(); await page.getByTestId('ai-group-sheet').waitFor(); await settle()
    t0 = (await look()).top
    s = await drag(await pt(page.getByTestId('group-meal-pill')), 150)
    assert.equal(s.mid.top, t0, 'meal picker: sheet did not move'); await settle(); assert.equal(await dialog.count(), 1)
    await page.keyboard.press('Escape'); await dialog.waitFor({ state: 'detached' })
    // All weigh-ins sheet: a vertical drag on a swipe-to-delete row leaves the sheet alone.
    await page.goto(BASE + '/settings'); await page.getByTestId('see-weighins').click()
    await page.getByTestId('weighin-row').first().waitFor(); await settle()
    t0 = (await look()).top
    s = await drag(await pt(page.getByTestId('weighin-row').first()), 150)
    assert.equal(s.mid.top, t0, 'swipe row: sheet did not move'); await settle(); assert.equal(await dialog.count(), 1)
    await page.keyboard.press('Escape'); await dialog.waitFor({ state: 'detached' })
  })

  await step(`${tag} scrolled content scrolls first: no drag while scrolled down, the drag picks up at the top; the page behind stays put`, async () => {
    await home()
    await page.getByTestId('ai-group-row').click(); await page.getByTestId('ai-group-sheet').waitFor(); await settle()
    const d0 = await page.evaluate(() => { const d = document.querySelector('[role=dialog]'); return { sh: d.scrollHeight, ch: d.clientHeight } })
    assert.ok(d0.sh > d0.ch + 40, `the group sheet scrolls (${d0.sh} > ${d0.ch})`)
    const l0 = await look()
    // The sheet is its own scroll container (mobile WebKit here has no wheel or native touch scroll, so scroll it the
    // way the browser would): it scrolls, the page behind does not.
    assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('[role=dialog]')).overflowY), 'auto')
    await page.evaluate(() => document.querySelector('[role=dialog]').scrollBy(0, 200)); await page.waitForTimeout(200)
    const l1 = await look()
    assert.ok(l1.scrollTop > 0, `inner scroll works (${l1.scrollTop})`)
    assert.deepEqual(behind(l1), behind(l0), 'page behind did not scroll')
    // A downward touch while scrolled down is left to the browser (it scrolls the content) and the sheet stays.
    const p = await pt(page.getByRole('button', { name: /^Edit Lalapan/ }))
    await touch('touchstart', p[0], p[1])
    let prevented = false
    for (let i = 1; i <= 4; i++) prevented = (await touch('touchmove', p[0], p[1] + i * 15)) || prevented
    assert.ok(!prevented, 'moves while scrolled are not cancelled')
    assert.equal((await look()).transform, '', 'the sheet does not move while its content is scrolled')
    // The content reaches the top (as the browser would scroll it); the same finger now drags the sheet.
    await page.evaluate(() => { document.querySelector('[role=dialog]').scrollTop = 0 })
    let p2 = true
    for (let i = 5; i <= 9; i++) p2 = (await touch('touchmove', p[0], p[1] + i * 15)) && p2
    const mid = await look()
    assert.ok(p2 && mid.transform === 'translateY(60px)', `the drag picks up at the top (${mid.transform})`)
    await page.waitForTimeout(150) // the finger rests before lifting: not a flick, 60 px < 30%, so it springs back
    await touch('touchend', p[0], p[1] + 135); await settle()
    assert.equal((await look()).transform, '')
    // An upward swipe on a sheet scrolled to the bottom is cancelled (no bounce of the page behind).
    await page.evaluate(() => { const d = document.querySelector('[role=dialog]'); d.scrollTop = d.scrollHeight })
    const q = await pt(page.getByRole('button', { name: /^Edit Kerupuk/ }))
    await touch('touchstart', q[0], q[1]); assert.ok(await touch('touchmove', q[0], q[1] - 20), 'up at the bottom is cancelled'); await touch('touchend', q[0], q[1] - 20)
    assert.deepEqual(behind(await look()), behind(l0))
    await page.keyboard.press('Escape'); await dialog.waitFor({ state: 'detached' })
  })

  await step(`${tag} reduced motion: a large drag closes at once with no slide; a small one snaps back`, async () => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await home()
    await page.getByRole('button', { name: /^Edit Kopi susu/ }).click(); await dialog.waitFor()
    const l0 = await look()
    await drag(await handlePt(), 50)
    assert.equal((await look()).top, l0.top, 'snapped back at once')
    await drag(await handlePt(), Math.round(l0.h * 0.5), { release: false })
    await touch('touchend', 0, 0).catch(() => {})
    assert.equal(await dialog.count(), 0, 'closed in the same frame, no slide')
    await page.emulateMedia({ reducedMotion: 'no-preference' })
  })

  await step(`${tag} After this reads like Home's goal line, with edit math day total - old + new`, async () => {
    await home()
    const goalLine = (await page.getByTestId('goal-progress').innerText()).replace(/\.( Nice work\.)?$/, '')
    const m = goalLine.match(/^([\d,]+) kcal (past|to go to) your ([\d,]+) goal$/)
    assert.ok(m, `goal line: ${goalLine}`)
    const num = (x) => Number(x.replace(/,/g, ''))
    const goal = num(m[3]), bal = m[2] === 'past' ? goal + num(m[1]) : goal - num(m[1])
    const say = (b) => b === goal ? `Right on your ${goal.toLocaleString('en-US')} goal` : b > goal ? `${(b - goal).toLocaleString('en-US')} kcal past your ${goal.toLocaleString('en-US')} goal` : `${(goal - b).toLocaleString('en-US')} kcal to go to your ${goal.toLocaleString('en-US')} goal`
    const after = () => dialog.getByTestId('after-this').innerText()
    // Quick add edit, unchanged: the same as Home's line (old out, same value back in).
    await page.getByRole('button', { name: /^Edit Kopi susu/ }).click(); await dialog.waitFor()
    assert.equal(await after(), goalLine)
    assert.equal(await after(), say(bal))
    await shot('after-this-past')
    // 140 -> 840: the day goes under its goal.
    await dialog.locator('input[name=kcal]').fill('840')
    assert.equal(await after(), say(bal - 700))
    assert.match(await after(), /to go to your/)
    await shot('after-this-under')
    await dialog.locator('input[name=kcal]').fill('100')
    assert.equal(await after(), say(bal + 40))
    await page.keyboard.press('Escape'); await dialog.waitFor({ state: 'detached' })
    // Catalogue food: 2 pieces of 88 kcal (176) -> 3 pieces (264) adds 88.
    await page.getByRole('button', { name: /^Edit Tempe goreng/ }).click(); await dialog.waitFor()
    assert.equal(await after(), say(bal))
    await dialog.getByRole('button', { name: 'Increase amount' }).click()
    assert.equal(await after(), say(bal - 88))
    await page.keyboard.press('Escape'); await dialog.waitFor({ state: 'detached' })
    // My food entry and the AI item use the quick add sheet: unchanged = Home's line.
    await page.getByRole('button', { name: /^Edit Bubur ayam/ }).click(); await dialog.waitFor()
    assert.equal(await after(), say(bal))
    await page.keyboard.press('Escape'); await dialog.waitFor({ state: 'detached' })
    await page.getByTestId('ai-group-row').click(); await page.getByRole('button', { name: /^Edit Sambal/ }).click(); await page.getByRole('dialog', { name: 'Edit quick add' }).waitFor()
    assert.equal(await page.getByRole('dialog', { name: 'Edit quick add' }).getByTestId('after-this').innerText(), say(bal))
    await page.getByRole('dialog', { name: 'Edit quick add' }).locator('input[name=kcal]').fill('2040')
    assert.equal(await page.getByRole('dialog', { name: 'Edit quick add' }).getByTestId('after-this').innerText(), say(bal - 2000))
    while (await dialog.count()) { await page.keyboard.press('Escape'); await page.waitForTimeout(300) }
    // Exercise: changing a burn adds budget back on Home (no preview line in the exercise sheets).
    await page.getByRole('button', { name: /^Edit Watch workout/ }).click(); await dialog.waitFor()
    await dialog.locator('input[name=burn]').fill('450'); await dialog.getByRole('button', { name: 'Save' }).click(); await dialog.waitFor({ state: 'detached' })
    assert.equal((await page.getByTestId('goal-progress').innerText()).replace(/\.( Nice work\.)?$/, ''), say(bal + 200))
    await page.getByRole('button', { name: /^Edit Kopi susu/ }).click(); await dialog.waitFor()
    assert.equal(await after(), say(bal + 200))
    await page.keyboard.press('Escape'); await dialog.waitFor({ state: 'detached' })
    await page.getByRole('button', { name: /^Edit Watch workout/ }).click(); await dialog.waitFor()
    await dialog.locator('input[name=burn]').fill('250'); await dialog.getByRole('button', { name: 'Save' }).click(); await dialog.waitFor({ state: 'detached' })
    // A new item on Log previews the day total minus the new value.
    await page.getByRole('link', { name: 'Add to Dinner' }).click()
    await page.getByTestId('qa-btn').click(); await dialog.waitFor()
    await dialog.locator('input[name=kcal]').fill('300')
    assert.equal(await after(), say(bal - 300))
    await page.keyboard.press('Escape'); await dialog.waitFor({ state: 'detached' })
  })

  await step(`${tag} storage: v3 schema, :v2 :v1 :ai :foods byte-identical, no new keys`, async () => {
    const ls = await page.evaluate(() => Object.fromEntries(Object.keys(localStorage).map((k) => [k, localStorage.getItem(k)])))
    for (const [k, v] of Object.entries(FIXED)) assert.equal(ls[k], v, k)
    assert.equal(JSON.parse(ls['calorie-app:v3']).version, 3)
    assert.deepEqual(Object.keys(ls).sort(), ['calorie-app:ai', 'calorie-app:backup', 'calorie-app:foods', 'calorie-app:v1', 'calorie-app:v2', 'calorie-app:v3'])
  })
  await ctx.close()
}
await browser.close()
console.log(results.join('\n'))
if (errors.length) { console.log(errors.join('\n')); process.exit(1) }
console.log(`\n${results.length} v1.13.4 checks passed, no console errors`)
