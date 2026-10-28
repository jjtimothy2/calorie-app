// v1.14 (Reed, approved by Jordy):
// A. Editable servings on every item edit. Opening any logged item (catalogue food, My food, quick add, AI item, from
//    Home or from an AI meal) shows a "Servings" row: heading, "Tap the number to type", − / + and the amount. Nothing
//    is focused on open. Tapping the number types it (inputMode decimal, value selected); Enter or a tap outside keeps
//    it. kcal and macros scale live from one serving; After this and "Save · N kcal" follow. 0, empty, text or > 99:
//    "Enter an amount above 0, like 1.5 or 0.75." and the last valid amount stays. Minus stops at 0.5. An AI item
//    "1 piece (120 g)" at 1.5 reads "1.5 pieces (180 g)" and keeps its label (main reset it to "Quick add"). A kcal-only
//    quick add at 2 servings doubles and Home reads "quick add, 2 servings". A total typed by hand scales from there.
//    Old entries display unchanged and storage is untouched until a save; no drag starts on the Servings row.
// B. AI-first cards on Log: search not focused; "Snap a photo" and "Describe your meal" (84 px, 18 px radius) above
//    search in Food mode. Key set: camera capture / typed estimate. No key: AI setup sheet. Offline: "Needs internet",
//    opens nothing. Bottom bar (sparkle included) unchanged.
// Schema stays v3; :v2 :v1 :ai :foods byte-identical. WebKit at 390x844 and 375x667. Screenshots: screenshots/v114-*.png.
// Usage: npm run build && npx vite preview --port 4174 & node tests/v114.mjs
import { webkit, devices } from 'playwright'
import assert from 'node:assert/strict'

const BASE = (process.env.BASE_URL ?? 'http://localhost:4174/calorie-app').replace(/\/$/, '')
const OUT = new URL('../screenshots/', import.meta.url).pathname
const results = [], errors = []
const step = async (name, fn) => {
  try { await fn(); results.push(`PASS ${name}`) } catch (e) { results.push(`FAIL ${name}: ${e.message.slice(0, 600)}`); console.log(results.join('\n')); console.log(errors.join('\n')); throw e }
}
const pad = (n) => String(n).padStart(2, '0')
const key = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const ago = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return key(d) }
const TODAY = ago(0)
const T = Date.now() - 3600_000
const profile = { age: 32, sex: 'male', heightCm: 175, weightKg: 92, activity: 'light', goal: 'lose', bmr: 1859, bmrCustom: false, includeMovement: false, goalWeightKg: 85, goalDate: ago(-120), planFrom: { date: ago(3), kg: 92 }, goalAssumed: false, macros: { protein: null, carbs: null, fat: null }, target: 1800, dailyGoal: 500 }
const quick = (id, meal, name, kcal, p, c, f, i, extra = {}) => ({ id, date: TODAY, meal, foodId: null, name, servingLabel: 'Quick add', servingMult: 1, qty: 1, kcal, protein: p, carbs: c, fat: f, createdAt: T + i, ...extra })
const entries = [
  quick('q1', 'breakfast', 'Kopi susu', 140, 10, 20, 5, 1),
  { id: 'f1', date: TODAY, meal: 'breakfast', foodId: 'tempe-goreng', name: 'Tempe goreng', servingLabel: '1 piece (25 g)', servingMult: 1, qty: 2, kcal: 88, protein: 5, carbs: 3.5, fat: 6, createdAt: T + 2 },
  quick('m1', 'snacks', 'Bubur ayam', 320, 12, 45, 8, 3, { foodId: 'u_bubur', servingLabel: '1 serving' }),
  quick('q2', 'snacks', 'Es teh manis', 90, 0, 0, 0, 4), // kcal only
  quick('x1', 'snacks', 'Pisang goreng', 150, 2, 20, 7, 5, { source: 'photo' }), // an AI item an older edit relabelled
  quick('a1', 'dinner', 'Ayam bakar', 245, 30, 0, 13, 6, { servingLabel: '1 piece (120 g)', source: 'photo' }),
  quick('g1', 'lunch', 'Nasi putih', 204, 4, 45, 0.4, 7, { servingLabel: '1 plate (300 g)', source: 'photo', groupId: 'gg', groupName: 'Nasi ayam bakar' }),
  quick('g2', 'lunch', 'Sambal', 40, 1, 4, 3, 8, { servingLabel: '1 tbsp (15 g)', source: 'photo', groupId: 'gg', groupName: 'Nasi ayam bakar' }),
]
const V3 = JSON.stringify({ version: 3, profile, entries, exercises: [], closedDays: {}, favourites: [], weights: [{ date: ago(3), kg: 92 }] })
const AI = JSON.stringify({ provider: 'gemini', key: 'AIzaTEST-not-a-real-key-000000000000' })
const FIXED = {
  'calorie-app:v2': '{"version":2,"profile":null,"entries":[],"exercises":[],"closedDays":{},"favourites":[]}',
  'calorie-app:v1': '{"version":1,"entries":[]}',
  'calorie-app:ai': AI,
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
  await ctx.addInitScript(() => {
    let target = null
    window.__touch = (type, x, y) => {
      if (type === 'touchstart') target = document.elementFromPoint(x, y)
      const ev = new Event(type, { bubbles: true, cancelable: true })
      const t = { identifier: 1, target, clientX: x, clientY: y, pageX: x, pageY: y }
      Object.defineProperty(ev, 'touches', { value: type === 'touchend' || type === 'touchcancel' ? [] : [t] })
      Object.defineProperty(ev, 'changedTouches', { value: [t] })
      target.dispatchEvent(ev)
      return ev.defaultPrevented
    }
    // File input clicks (a real chooser can't be driven in headless WebKit).
    window.__clicks = []
    const click = HTMLInputElement.prototype.click
    HTMLInputElement.prototype.click = function () {
      if (this.type === 'file') { window.__clicks.push({ id: this.dataset.testid, capture: this.getAttribute('capture') }); return }
      return click.call(this)
    }
  })
  const page = await ctx.newPage()
  page.on('console', (m) => { if ((m.type() === 'error' || m.type() === 'warning') && !/service worker/i.test(m.text())) errors.push(`${tag}: ${m.type()}: ${m.text()}`) })
  page.on('pageerror', (er) => errors.push(`${tag}: pageerror: ${er.message}`))
  const dialog = page.getByRole('dialog')
  const shot = async (name, loc = page) => { await page.waitForTimeout(300); await loc.screenshot({ path: `${OUT}v114-${name}-${tag}.png` }) }
  const raw = () => page.evaluate(() => localStorage.getItem('calorie-app:v3'))
  const st = async () => JSON.parse(await raw())
  const byId = async (id) => (await st()).entries.find((e) => e.id === id)
  const home = async () => { await page.goto(BASE + '/'); await page.getByTestId('eaten').waitFor() }
  const row = (name) => page.getByRole('button', { name: new RegExp(`^Edit ${name},`) })
  const sub = async (name) => (await row(name).locator('span.text-mute').first().innerText()).replace(/\s+/g, ' ')
  const open = async (name) => { await row(name).click(); await dialog.waitFor(); await page.waitForTimeout(350) }
  const close = async () => { await page.keyboard.press('Escape'); await dialog.waitFor({ state: 'detached' }) }
  const val = (n) => dialog.locator(`input[name=${n}]`).inputValue()
  const macros = () => dialog.locator('fieldset input').evaluateAll((l) => l.map((i) => i.value))
  const qty = () => dialog.getByTestId('qty').innerText()
  const saveBtn = () => dialog.locator('button[type=submit]')
  const focused = () => page.evaluate(() => { const a = document.activeElement; return a && /INPUT|TEXTAREA|SELECT/.test(a.tagName) ? `${a.tagName}:${a.getAttribute('aria-label') || a.name}` : null })
  const servingsRow = async () => {
    const r = dialog.locator('[data-no-drag]').filter({ hasText: 'Servings' }).first()
    assert.match(await r.innerText(), /Servings\s*Tap the number to type/)
    assert.equal(await dialog.getByRole('button', { name: 'Decrease amount' }).count(), 1)
    assert.equal(await dialog.getByRole('button', { name: 'Increase amount' }).count(), 1)
  }
  const touch = (type, x, y) => page.evaluate(([a, b, c]) => window.__touch(a, b, c), [type, x, y])
  const top = () => page.evaluate(() => Math.round(document.querySelector('[role=dialog]').getBoundingClientRect().top))
  const pt = (loc) => loc.evaluate((e) => { const r = e.getBoundingClientRect(); return [Math.round(r.left + Math.min(r.width / 2, 30)), Math.round(r.top + r.height / 2)] })
  const drag = async ([x, y], dy) => {
    await touch('touchstart', x, y); let prevented = false
    for (let i = 1; i <= 8; i++) { await page.waitForTimeout(30); prevented = (await touch('touchmove', x, y + (dy * i) / 8)) || prevented }
    const t = await top(); await touch('touchend', x, y + dy); return { t, prevented }
  }

  await step(`${tag} old entries display unchanged; opening every edit sheet and closing writes nothing`, async () => {
    await home()
    const before = await raw()
    assert.equal(JSON.stringify(JSON.parse(before).entries), JSON.stringify(JSON.parse(V3).entries), 'entries load unchanged (the store normalises the seed profile)')
    assert.equal(await sub('Kopi susu'), 'Breakfast · quick add')
    assert.equal(await sub('Es teh manis'), 'Snacks · quick add')
    assert.match(await sub('Ayam bakar'), /^Dinner · 1 piece \(120 g\) · AI$/)
    assert.match(await sub('Pisang goreng'), /^Snacks · Quick add · AI$/)
    assert.equal(await sub('Tempe goreng'), 'Breakfast · 2 pieces')
    assert.equal(await sub('Bubur ayam'), 'Snacks · 1 serving')
    for (const n of ['Kopi susu', 'Tempe goreng', 'Bubur ayam', 'Es teh manis', 'Pisang goreng', 'Ayam bakar']) { await open(n); await close() }
    await page.getByTestId('ai-group-row').click(); await page.getByTestId('ai-group-sheet').waitFor()
    assert.match(await page.getByTestId('ai-group-sheet').innerText(), /1 plate \(300 g\)[\s\S]*1 tbsp \(15 g\)/)
    await close()
    await page.goto(BASE + '/log?meal=lunch'); await page.getByTestId('ai-cards').waitFor()
    assert.equal(await raw(), before, 'storage untouched until a save')
  })

  await step(`${tag} every item edit shows Servings (heading, hint, − / +, amount) with nothing focused: quick add, kcal-only quick add, My food, AI item, relabelled AI item, catalogue food, AI meal item`, async () => {
    await home()
    for (const [n, amount] of [['Kopi susu', '1 serving'], ['Es teh manis', '1 serving'], ['Bubur ayam', '1 serving'], ['Ayam bakar', '1 piece (120 g)'], ['Pisang goreng', '1 serving'], ['Tempe goreng', '2 pieces']]) {
      await open(n); await servingsRow()
      assert.equal(await qty(), amount, n)
      assert.equal(await focused(), null, `${n}: nothing focused on open`)
      if (n === 'Ayam bakar') { assert.equal(await saveBtn().innerText(), 'Save · 245 kcal'); await shot('edit-servings') }
      if (n === 'Tempe goreng') assert.match(await dialog.getByRole('button', { name: /^Save · \d+ kcal$/ }).innerText(), /Save · 176 kcal/)
      else assert.match(await dialog.innerText(), /Calories, total \(kcal\)/)
      await close()
    }
    await page.getByTestId('ai-group-row').click(); await page.getByTestId('ai-group-sheet').waitFor()
    await page.getByTestId('ai-group-sheet').getByRole('button', { name: /^Edit Nasi putih,/ }).click()
    await page.getByRole('heading', { name: 'Edit item' }).waitFor(); await page.waitForTimeout(350)
    await servingsRow(); assert.equal(await qty(), '1 plate (300 g)'); assert.equal(await focused(), null)
    await page.keyboard.press('Escape'); await page.waitForTimeout(400)
    if (await dialog.count()) await page.keyboard.press('Escape')
    await dialog.waitFor({ state: 'detached' }).catch(() => {})
  })

  await step(`${tag} tap the number: decimal input, value selected; typing scales kcal, macros, After this and Save live; Enter keeps it; AI item keeps its label: 1.5 pieces (180 g)`, async () => {
    await home(); await open('Ayam bakar')
    const after0 = await dialog.getByTestId('after-this').innerText().catch(() => null)
    await dialog.getByTestId('qty-edit').click()
    const inp = dialog.getByTestId('qty-input'); await inp.waitFor()
    const s = await inp.evaluate((el) => ({ mode: el.inputMode, focus: el === document.activeElement, a: el.selectionStart, b: el.selectionEnd, v: el.value }))
    assert.deepEqual(s, { mode: 'decimal', focus: true, a: 0, b: 1, v: '1' })
    await inp.fill('1.5')
    assert.equal(await val('kcal'), '368')
    assert.deepEqual(await macros(), ['45', '', '19.5'])
    assert.equal(await saveBtn().innerText(), 'Save · 368 kcal')
    if (after0 !== null) assert.notEqual(await dialog.getByTestId('after-this').innerText(), after0, 'After this follows')
    assert.match(await dialog.innerText(), /× 1 piece \(120 g\)/)
    await shot('typing')
    await inp.press('Enter'); await inp.waitFor({ state: 'detached' })
    assert.equal(await qty(), '1.5 pieces (180 g)')
    await saveBtn().click(); await dialog.waitFor({ state: 'detached' })
    const e = await byId('a1')
    assert.equal(e.qty, 1.5); assert.equal(e.servingLabel, '1 piece (120 g)'); assert.equal(e.source, 'photo'); assert.equal(e.name, 'Ayam bakar')
    assert.ok(Math.abs(e.kcal * e.qty - 368) < 1e-6 && Math.abs(e.protein * e.qty - 45) < 1e-6 && Math.abs(e.fat * e.qty - 19.5) < 1e-6)
    assert.match(await sub('Ayam bakar'), /^Dinner · 1\.5 pieces \(180 g\) · AI$/)
    assert.match(await row('Ayam bakar').getAttribute('aria-label'), /368 kcal/)
    await shot('ai-item-1.5', page.getByTestId('meal-dinner'))
    await open('Ayam bakar'); assert.equal(await qty(), '1.5 pieces (180 g)'); assert.equal(await val('kcal'), '368'); await close()
  })

  await step(`${tag} 0, empty, text and over 99 show the error and keep the last valid amount; a tap outside keeps it; minus stops at 0.5`, async () => {
    await open('Kopi susu')
    const inp = dialog.getByTestId('qty-input')
    for (const bad of ['0', '', 'abc', '100']) {
      if (!(await inp.count())) { await dialog.getByTestId('qty-edit').click(); await inp.waitFor() }
      await inp.fill(bad)
      assert.equal(await dialog.getByTestId('qty-err').innerText(), 'Enter an amount above 0, like 1.5 or 0.75.', `"${bad}"`)
      assert.equal(await val('kcal'), '140'); assert.deepEqual(await macros(), ['10', '20', '5'])
      if (bad === 'abc') await shot('error')
    }
    await dialog.getByRole('heading').click() // a tap outside
    await inp.waitFor({ state: 'detached' })
    assert.equal(await qty(), '1 serving'); assert.equal(await dialog.getByTestId('qty-err').count(), 0)
    await dialog.getByTestId('qty-edit').click(); await inp.fill('2.5'); await dialog.getByRole('heading').click()
    assert.equal(await qty(), '2.5 servings'); assert.equal(await val('kcal'), '350')
    const dec = dialog.getByRole('button', { name: 'Decrease amount' })
    for (const want of ['2 servings', '1 serving', '0.5 serving']) { await dec.click(); assert.equal(await qty(), want) }
    assert.ok(await dec.isDisabled(), 'minus stops at 0.5')
    assert.equal(await val('kcal'), '70'); assert.deepEqual(await macros(), ['5', '10', '2.5'])
    await close()
    assert.equal((await byId('q1')).qty, 1, 'closing without Save writes nothing')
  })

  await step(`${tag} quick add with macros at 2 servings doubles everything; a total typed by hand scales from there`, async () => {
    await open('Kopi susu')
    await dialog.getByRole('button', { name: 'Increase amount' }).click()
    assert.equal(await qty(), '2 servings'); assert.equal(await val('kcal'), '280'); assert.deepEqual(await macros(), ['20', '40', '10'])
    await dialog.locator('input[name=kcal]').fill('300') // 2 servings = 300 total -> 150 each
    await dialog.getByRole('button', { name: 'Increase amount' }).click()
    assert.equal(await val('kcal'), '450'); assert.equal(await saveBtn().innerText(), 'Save · 450 kcal')
    await saveBtn().click(); await dialog.waitFor({ state: 'detached' })
    const e = await byId('q1')
    assert.deepEqual([e.qty, e.kcal, e.servingLabel, e.protein], [3, 150, 'Quick add', 10])
    assert.equal(await sub('Kopi susu'), 'Breakfast · quick add, 3 servings')
  })

  await step(`${tag} kcal-only quick add at 2 servings: 180 kcal, Home reads "quick add, 2 servings"`, async () => {
    await open('Es teh manis')
    await dialog.getByRole('button', { name: 'Increase amount' }).click()
    assert.equal(await val('kcal'), '180'); assert.deepEqual(await macros(), ['', '', ''])
    await saveBtn().click(); await dialog.waitFor({ state: 'detached' })
    const e = await byId('q2')
    assert.deepEqual([e.qty, e.kcal, e.protein, e.servingLabel], [2, 90, 0, 'Quick add'])
    assert.equal(await sub('Es teh manis'), 'Snacks · quick add, 2 servings')
    assert.match(await row('Es teh manis').getAttribute('aria-label'), /180 kcal/)
  })

  await step(`${tag} My food entry and the relabelled AI item scale and save; catalogue stepper has the heading`, async () => {
    await open('Bubur ayam')
    await dialog.getByTestId('qty-edit').click(); await dialog.getByTestId('qty-input').fill('0.75'); await dialog.getByTestId('qty-input').press('Enter')
    assert.equal(await qty(), '0.75 serving'); assert.equal(await val('kcal'), '240')
    await saveBtn().click(); await dialog.waitFor({ state: 'detached' })
    let e = await byId('m1'); assert.deepEqual([e.qty, e.foodId, e.servingLabel, e.kcal], [0.75, 'u_bubur', '1 serving', 320])
    assert.equal(await sub('Bubur ayam'), 'Snacks · 0.75 serving')
    await open('Pisang goreng'); await dialog.getByRole('button', { name: 'Increase amount' }).click()
    assert.equal(await qty(), '2 servings'); await saveBtn().click(); await dialog.waitFor({ state: 'detached' })
    e = await byId('x1'); assert.deepEqual([e.qty, e.kcal, e.source], [2, 150, 'photo'])
    assert.match(await sub('Pisang goreng'), /^Snacks · 2 servings · AI$/)
    await open('Tempe goreng'); await servingsRow(); await close()
  })

  await step(`${tag} an item edited from an AI meal: 2 plates (600 g) in the meal sheet, the group stays together`, async () => {
    await page.getByTestId('ai-group-row').click(); await page.getByTestId('ai-group-sheet').waitFor()
    await page.getByTestId('ai-group-sheet').getByRole('button', { name: /^Edit Nasi putih,/ }).click()
    await page.getByRole('heading', { name: 'Edit item' }).waitFor(); await page.waitForTimeout(350)
    await page.getByRole('button', { name: 'Increase amount' }).click()
    assert.equal(await page.getByTestId('qty').innerText(), '2 plates (600 g)')
    await page.getByRole('button', { name: 'Save · 408 kcal' }).click()
    await page.getByTestId('ai-group-sheet').waitFor()
    assert.match(await page.getByTestId('ai-group-sheet').innerText(), /2 plates \(600 g\)/)
    const e = await byId('g1'); assert.deepEqual([e.qty, e.groupId, e.groupName, e.servingLabel], [2, 'gg', 'Nasi ayam bakar', '1 plate (300 g)'])
    await page.keyboard.press('Escape'); await dialog.waitFor({ state: 'detached' })
  })

  await step(`${tag} swipe-to-close: no drag starts on the servings number, its input, − or +`, async () => {
    await open('Kopi susu'); const t0 = await top()
    for (const [n, loc] of [['number', dialog.getByTestId('qty-edit')], ['minus', dialog.getByRole('button', { name: 'Decrease amount' })], ['plus', dialog.getByRole('button', { name: 'Increase amount' })]]) {
      const s = await drag(await pt(loc), 150)
      assert.equal(s.t, t0, `${n}: sheet did not move`); assert.ok(!s.prevented, `${n}: touch left to the browser`)
      await page.waitForTimeout(450); assert.equal(await dialog.count(), 1)
    }
    await dialog.getByTestId('qty-edit').click(); await dialog.getByTestId('qty-input').waitFor()
    const s = await drag(await pt(dialog.getByTestId('qty-input')), 150)
    assert.equal(s.t, t0, 'input: sheet did not move'); await page.waitForTimeout(450); assert.equal(await dialog.count(), 1)
    await close()
  })

  await step(`${tag} Log: search not focused, two equal AI cards above search (84 px, 18 px radius, card bg, line border, green icon over label); bottom bar and sparkle unchanged`, async () => {
    await page.goto(BASE + '/log?meal=lunch'); await page.getByTestId('ai-cards').waitFor(); await page.waitForTimeout(400)
    assert.equal(await focused(), null, 'search not focused')
    const search = page.getByRole('searchbox', { name: 'Search foods' })
    const cards = await page.getByTestId('ai-cards').evaluate((g) => [...g.children].map((b) => { const r = b.getBoundingClientRect(), cs = getComputedStyle(b), ic = b.children[0].getBoundingClientRect(), lb = b.children[1].getBoundingClientRect()
      return { text: b.innerText.trim(), h: Math.round(r.height), w: Math.round(r.width), bottom: r.bottom, radius: cs.borderTopLeftRadius, border: cs.borderTopStyle, bg: cs.backgroundColor, iconAbove: ic.bottom <= lb.top + 1, iconColor: getComputedStyle(b.children[0]).color } }))
    assert.deepEqual(cards.map((c) => c.text), ['Snap a photo', 'Describe your meal'])
    for (const c of cards) { assert.equal(c.h, 84); assert.equal(c.radius, '18px'); assert.equal(c.border, 'solid'); assert.ok(c.iconAbove); assert.notEqual(c.bg, 'rgba(0, 0, 0, 0)') }
    assert.equal(cards[0].w, cards[1].w, 'equal widths')
    assert.ok(cards[0].bottom <= (await search.boundingBox()).y, 'cards above search')
    assert.equal(await page.getByRole('button', { name: 'Estimate with AI', exact: true }).count(), 1, 'sparkle still in the bar')
    assert.equal(await page.getByRole('button', { name: /^Add Calories/ }).count(), 1)
    await shot('log-cards-key')
  })

  await step(`${tag} key set: Snap opens the camera capture, Describe opens the typed estimate`, async () => {
    await page.evaluate(() => { window.__clicks = [] })
    await page.getByTestId('ai-card-snap').click()
    assert.deepEqual(await page.evaluate(() => window.__clicks), [{ id: 'photo-capture', capture: 'environment' }])
    assert.equal(await dialog.count(), 0)
    await page.getByTestId('ai-card-describe').click()
    await dialog.getByRole('textbox', { name: 'What did you eat?' }).waitFor()
    await close()
  })

  await step(`${tag} no key: either card opens the AI setup sheet`, async () => {
    await page.evaluate(() => localStorage.removeItem('calorie-app:ai'))
    await page.reload(); await page.getByTestId('ai-cards').waitFor()
    for (const c of ['ai-card-snap', 'ai-card-describe']) {
      await page.evaluate(() => { window.__clicks = [] })
      await page.getByTestId(c).click()
      await page.getByRole('dialog', { name: 'Set up AI estimates' }).waitFor()
      assert.deepEqual(await page.evaluate(() => window.__clicks), [])
      if (c === 'ai-card-snap') await shot('log-cards-nokey')
      await close()
    }
    await page.evaluate((v) => localStorage.setItem('calorie-app:ai', v), AI)
    await page.reload(); await page.getByTestId('ai-cards').waitFor()
  })

  await step(`${tag} offline: both cards show "Needs internet" like the AI button and open nothing`, async () => {
    await ctx.setOffline(true)
    await page.getByTestId('ai-offline').waitFor()
    await page.getByTestId('ai-card-offline').first().waitFor()
    assert.equal(await page.getByTestId('ai-card-offline').count(), 2)
    for (const c of ['ai-card-snap', 'ai-card-describe']) {
      const b = page.getByTestId(c)
      assert.equal(await b.getAttribute('aria-disabled'), 'true')
      assert.match(await b.innerText(), /Needs internet/)
      assert.equal(await b.evaluate((el) => getComputedStyle(el).borderTopStyle), 'dashed')
      await page.evaluate(() => { window.__clicks = [] })
      await b.click({ force: true }); await page.waitForTimeout(250)
      assert.equal(await dialog.count(), 0); assert.deepEqual(await page.evaluate(() => window.__clicks), [])
    }
    await shot('log-cards-offline')
    await ctx.setOffline(false)
    await page.getByTestId('ai-card-offline').first().waitFor({ state: 'detached' })
  })

  await step(`${tag} cards only in Food mode; storage: v3 schema, :v2 :v1 :ai :foods byte-identical, no new keys, untouched entries byte-identical`, async () => {
    await page.goto(BASE + '/log?meal=lunch&mode=exercise'); await page.waitForTimeout(400)
    assert.equal(await page.getByTestId('ai-cards').count(), 0)
    const s = await page.evaluate(() => Object.fromEntries(Object.keys(localStorage).map((k) => [k, localStorage.getItem(k)])))
    assert.deepEqual(Object.keys(s).sort(), ['calorie-app:ai', 'calorie-app:backup', 'calorie-app:foods', 'calorie-app:v1', 'calorie-app:v2', 'calorie-app:v3'])
    for (const [k, v] of Object.entries(FIXED)) assert.equal(s[k], v, k)
    const v3 = JSON.parse(s['calorie-app:v3'])
    assert.equal(v3.version, 3)
    assert.deepEqual(Object.keys(v3).sort(), Object.keys(JSON.parse(V3)).sort())
    const seed = JSON.parse(V3).entries
    for (const id of ['f1', 'g2']) assert.equal(JSON.stringify(v3.entries.find((e) => e.id === id)), JSON.stringify(seed.find((e) => e.id === id)), id)
    for (const e of v3.entries) assert.deepEqual(Object.keys(e).sort(), Object.keys(seed.find((x) => x.id === e.id)).sort(), `${e.id}: same fields`)
  })
  await ctx.close()
}
await browser.close()
console.log(results.join('\n'))
if (errors.length) { console.log(errors.join('\n')); process.exit(1) }
console.log(`\n${results.length} passed`)
