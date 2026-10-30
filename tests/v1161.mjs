// v1.16.1 (approved by Jordy): no iPhone zoom when you tap a servings number to type on the AI result sheet. iOS
// Safari zooms into any focused text field under 16 px; the compact servings field was 15 px. It is 16 px now (the
// number button too, so typing looks the same), with the v1.14.2 44 px hit areas and the 132x40 stepper unchanged.
// Audit: every text field, textarea and select the app shows (onboarding, Home, Log food and exercise, Settings, and
// the sheets: quick add, edit, food, describe, AI results, add item, AI group, exercise, quick burn, weight, goal,
// my food) reads >= 16 px when focused. Radios, checkboxes and file pickers take no typing, so iOS never zooms them.
// The viewport meta keeps pinch zoom (no maximum-scale, no user-scalable=no). Schema stays v3; :v2 :v1 :ai :foods
// byte-identical. Mocked Gemini. WebKit at 390x844 and 375x667. Screenshots: screenshots/v1161-*.png.
// Usage: npm run build && npx vite preview --port 4174 & node tests/v1161.mjs
import { webkit, devices } from 'playwright'
import assert from 'node:assert/strict'
import { geminiOk } from './v15-fixture.mjs'

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
const AIE = (id, name, kcal, i) => ({ id, date: TODAY, meal: 'lunch', foodId: null, name, servingLabel: '1 serving', servingMult: 1, qty: 1, kcal, protein: 10, carbs: 20, fat: 5, createdAt: T + 10 + i, source: 'photo', groupId: 'g1', groupName: 'Nasi ayam' })
const entries = [AIE('a1', 'Nasi', 250, 1), AIE('a2', 'Ayam', 330, 2), { id: 'q1', date: TODAY, meal: 'breakfast', foodId: null, name: 'Kopi susu', servingLabel: 'Quick add', servingMult: 1, qty: 1, kcal: 140, protein: 10, carbs: 20, fat: 5, createdAt: T + 1 }]
const exercises = [{ id: 'x1', date: TODAY, activityId: 'badminton', name: 'Badminton', minutes: 30, intensity: 'moderate', kcal: 253, createdAt: T + 2 }]
const V3 = JSON.stringify({ version: 3, profile, entries, exercises, closedDays: {}, favourites: [], weights: [{ date: ago(3), kg: 92 }] })
const AI = JSON.stringify({ provider: 'gemini', key: 'AIzaTEST-not-a-real-key-000000000000' })
const FIXED = {
  'calorie-app:v2': '{"version":2,"profile":null,"entries":[],"exercises":[],"closedDays":{},"favourites":[]}',
  'calorie-app:v1': '{"version":1,"entries":[]}',
  'calorie-app:ai': AI,
  'calorie-app:foods': JSON.stringify({ version: 1, foods: [{ id: 'u_bubur', name: 'Bubur ayam', kcal: 320, protein: 12, carbs: 45, fat: 8, createdAt: 1, updatedAt: 1 }] }),
}
const LONG = 'Keripik tempe (tempeh chips)'
const EST = {
  dish: 'Nasi ayam goreng', scale_ref: '',
  items: [
    { name: LONG, portion: '1 piece', grams: 8, kcal: 40, protein_g: 2, carbs_g: 4, fat_g: 2.6, confidence: 'medium' },
    { name: 'Nasi putih', portion: '1 plate', grams: 150, kcal: 250, protein_g: 5, carbs_g: 55, fat_g: 1, confidence: 'high' },
    { name: 'Sambal', portion: '', grams: 15, kcal: 30, protein_g: 0.5, carbs_g: 2, fat_g: 2.3, confidence: 'high' },
    { name: 'Ayam goreng', portion: '1 thigh', grams: 120, kcal: 330, protein_g: 25, carbs_g: 5, fat_g: 23, confidence: 'medium' },
  ],
}
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET, POST, OPTIONS' }

// In the page: every tap target in a root. geo = element box united with its ::before box (from computed style);
// hit = bounding box of the 1 px grid points whose elementFromPoint resolves to the target, and how solid it is.
const MEASURE = (root, sel) => {
  const els = [...root.querySelectorAll(sel)].filter((e) => e.getClientRects().length)
  return els.map((el) => {
    const r = el.getBoundingClientRect(), cs = getComputedStyle(el), b = getComputedStyle(el, '::before')
    let g = { l: r.left, t: r.top, r: r.right, b: r.bottom }
    if (b.content !== 'none' && b.position === 'absolute') {
      const px = (v) => parseFloat(v)
      const pl = r.left + px(cs.borderLeftWidth), pt = r.top + px(cs.borderTopWidth), pr = r.right - px(cs.borderRightWidth), pb = r.bottom - px(cs.borderBottomWidth)
      const q = { l: pl + px(b.left), t: pt + px(b.top), r: pr - px(b.right), b: pb - px(b.bottom) }
      g = { l: Math.min(g.l, q.l), t: Math.min(g.t, q.t), r: Math.max(g.r, q.r), b: Math.max(g.b, q.b) }
    }
    const own = (x, y) => { const e = document.elementFromPoint(x, y); return !!e && (e === el || el.contains(e)) }
    let n = 0, hl = 1e9, ht = 1e9, hr = -1e9, hb = -1e9
    for (let x = Math.floor(g.l) - 3; x <= Math.ceil(g.r) + 3; x++) for (let y = Math.floor(g.t) - 3; y <= Math.ceil(g.b) + 3; y++) {
      if (own(x + 0.5, y + 0.5)) { n++; hl = Math.min(hl, x); ht = Math.min(ht, y); hr = Math.max(hr, x + 1); hb = Math.max(hb, y + 1) }
    }
    const name = el.getAttribute('aria-label') || el.dataset.testid || el.tagName
    return { name, box: [r.width, r.height].map((v) => Math.round(v * 10) / 10), geo: g, gw: g.r - g.l, gh: g.b - g.t, hw: hr - hl, hh: hb - ht, solid: n / Math.max(1, (hr - hl) * (hb - ht)) }
  })
}
const overlaps = (list) => {
  const out = []
  for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
    const a = list[i].geo, b = list[j].geo
    const w = Math.min(a.r, b.r) - Math.max(a.l, b.l), h = Math.min(a.b, b.b) - Math.max(a.t, b.t)
    if (w > 0.5 && h > 0.5) out.push(`${list[i].name} x ${list[j].name}: ${w.toFixed(1)}x${h.toFixed(1)}`)
  }
  return out
}
// solid: the whole area answers taps (the compact areas are square pseudo-elements). The 48 px steppers are plain
// rounded buttons, whose rounded corners don't hit-test, so for them only the size is checked.
const big = (list, label, solid = true) => {
  for (const t of list) {
    assert.ok(t.gw >= 44 - 0.01 && t.gh >= 44 - 0.01, `${label}: ${t.name} area ${t.gw}x${t.gh}`)
    assert.ok(t.hw >= 44 && t.hh >= 44, `${label}: ${t.name} hit-tested ${t.hw}x${t.hh}`)
    if (solid) assert.ok(t.solid >= 0.999, `${label}: ${t.name} hit area not solid (${t.solid}), a neighbour covers part of it`)
  }
}


// In the page: every typing field now in the DOM, focused one by one, with its computed size while focused.
const FIELDS = () => {
  const skip = new Set(['radio', 'checkbox', 'file', 'hidden', 'range', 'color', 'button', 'submit', 'reset', 'image'])
  const els = [...document.querySelectorAll('input, textarea, select')].filter((e) => !(e.tagName === 'INPUT' && skip.has(e.type)) && e.getClientRects().length)
  const prev = document.activeElement
  const out = els.map((el) => {
    el.focus({ preventScroll: true })
    const cs = getComputedStyle(el)
    return { id: el.dataset.testid || el.name || el.getAttribute('aria-label') || el.placeholder || `${el.tagName}:${el.type}`, tag: el.tagName.toLowerCase(), type: el.type, focused: document.activeElement === el, px: parseFloat(cs.fontSize), scale: window.visualViewport?.scale ?? 1 }
  })
  if (prev && prev.focus) prev.focus({ preventScroll: true })
  return out
}
const seen = new Map()
const browser = await webkit.launch()
for (const [w, h] of [[390, 844], [375, 667]]) {
  const tag = `${w}x${h}`
  const ctx = await browser.newContext({ ...devices['iPhone 14'], viewport: { width: w, height: h }, deviceScaleFactor: 3, hasTouch: true, isMobile: true, serviceWorkers: 'block' })
  await ctx.route('https://generativelanguage.googleapis.com/**', (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS })
    return route.fulfill({ status: 200, contentType: 'application/json', headers: CORS, body: JSON.stringify(geminiOk(EST)) })
  })
  await ctx.addInitScript(([v3, fixed]) => {
    if (sessionStorage.getItem('fresh')) return
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
  const shot = async (name, loc = page) => { await page.waitForTimeout(300); await loc.screenshot({ path: `${OUT}v1161-${name}-${tag}.png` }) }
  const list = () => dialog.getByRole('list', { name: 'Estimated items' })
  const item = (n) => list().getByRole('listitem').filter({ hasText: n })
  const box = (loc) => loc.evaluate((e) => { const r = e.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height } })
  const close = async () => { while (await dialog.count()) { await page.keyboard.press('Escape'); await page.waitForTimeout(350) } }
  // Audit the fields on screen now: all >= 16 px while focused, and the page never zooms.
  const audit = async (where, min = 1) => {
    await page.waitForTimeout(250)
    const f = await page.evaluate(FIELDS)
    assert.ok(f.length >= min, `${where}: expected ${min}+ fields, found ${f.length}`)
    for (const x of f) {
      assert.ok(x.focused, `${where}: ${x.id} takes focus`)
      assert.ok(x.px >= 16, `${where}: ${x.tag} ${x.id} is ${x.px}px when focused (iOS zooms under 16)`)
      assert.equal(x.scale, 1, `${where}: ${x.id} focus zoomed the page`)
      seen.set(`${where} · ${x.tag} ${x.id}`, x.px)
    }
    await page.evaluate(() => document.activeElement?.blur?.())
    return f
  }
  const describe = async () => {
    await page.goto(BASE + '/log?meal=lunch'); await page.getByTestId('ai-cards').waitFor()
    await page.getByTestId('ai-card-describe').click()
    await audit('describe sheet')
    await dialog.getByRole('textbox', { name: 'What did you eat?' }).fill('keripik tempe, nasi, sambal, ayam goreng')
    await dialog.getByRole('button', { name: /^Estimate$/ }).click()
    await item('Ayam goreng').waitFor(); await page.waitForTimeout(450)
  }

  await step(`${tag} viewport meta keeps pinch zoom: no maximum-scale, no user-scalable=no`, async () => {
    await page.goto(BASE + '/'); await page.getByTestId('balance').waitFor()
    const metas = await page.evaluate(() => [...document.querySelectorAll('meta[name=viewport]')].map((m) => m.content))
    assert.equal(metas.length, 1)
    assert.doesNotMatch(metas[0], /maximum-scale|minimum-scale|user-scalable/i, metas[0])
    assert.match(metas[0], /width=device-width/)
  })

  await step(`${tag} AI result sheet: tapping a servings number to type gives a 16 px field, focused, no zoom; same 52x32 field and 132x40 stepper`, async () => {
    await describe()
    for (const n of [LONG, 'Nasi putih', 'Sambal', 'Ayam goreng']) {
      const [d, e, i, s] = await Promise.all(['qty-dec', 'qty-edit', 'qty-inc', 'row-stepper'].map((t) => box(item(n).getByTestId(t))))
      assert.deepEqual([d.w, d.h, i.w, i.h, e.w, e.h, s.w, s.h], [32, 32, 32, 32, 52, 32, 132, 40], n)
      assert.equal(await item(n).getByTestId('qty-edit').evaluate((el) => getComputedStyle(el).fontSize), '16px', `${n} number`)
    }
    await shot('results', dialog)
    const n = 'Ayam goreng'
    const e = await box(item(n).getByTestId('qty-edit'))
    await page.touchscreen.tap(e.l + e.w / 2, e.t + e.h / 2)
    const inp = item(n).getByTestId('qty-input'); await inp.waitFor()
    const st = await inp.evaluate((el) => ({ focused: el === document.activeElement, px: parseFloat(getComputedStyle(el).fontSize), scale: window.visualViewport.scale }))
    assert.deepEqual(st, { focused: true, px: 16, scale: 1 })
    const [f, s] = await Promise.all([box(inp), box(item(n).getByTestId('row-stepper'))])
    assert.deepEqual([f.w, f.h, s.w, s.h], [52, 32, 132, 40], 'typing keeps the same field and stepper size')
    await shot('typing', item(n))
    await shot('typing-sheet', dialog)
  })

  await step(`${tag} typing field keeps its 44 px hit area (56x44 via its label), − / + stay 44x44, solid, no overlaps`, async () => {
    const m = await list().evaluate(MEASURE, '[data-testid=qty-dec], [data-testid=qty-edit], [data-testid=qty-hit], [data-testid=qty-inc], button[aria-label^="Remove "]')
    big(m.filter((t) => !t.name.startsWith('Remove ')), 'typing')
    assert.deepEqual(overlaps(m), [])
    assert.ok(m.some((t) => t.name === 'qty-hit' && t.gw === 56 && t.gh === 44), 'field area 56x44')
    assert.deepEqual([...new Set(m.filter((t) => !t.name.startsWith('Remove ') && t.name !== 'qty-hit').map((t) => `${t.gw}x${t.gh}`))].sort(), ['44x44', '56x44'])
  })

  await step(`${tag} stepper fits: every row's −, number, + on one line inside the sheet, no sideways scroll (typing too)`, async () => {
    const g = await list().evaluate((ul) => {
      const sheet = document.querySelector('[role=dialog]'), sr = sheet.getBoundingClientRect()
      const rows = [...ul.querySelectorAll('[data-testid=row-stepper]')].map((s) => {
        const kids = [...s.children].map((c) => c.getBoundingClientRect()), r = s.getBoundingClientRect()
        return { oneLine: kids.every((k) => Math.abs(k.top + k.height / 2 - (r.top + r.height / 2)) < 1), inside: r.left >= sr.left && r.right <= sr.right, h: r.height }
      })
      const scrollers = [document.documentElement, sheet, ...sheet.querySelectorAll('*')].filter((e) => e === document.documentElement || /auto|scroll/.test(getComputedStyle(e).overflowX) || /auto|scroll/.test(getComputedStyle(e).overflowY))
      return { rows, sideScroll: scrollers.some((e) => e.scrollWidth > e.clientWidth + 0.5) }
    })
    assert.equal(g.rows.length, 4)
    for (const r of g.rows) assert.deepEqual(r, { oneLine: true, inside: true, h: 40 })
    assert.equal(g.sideScroll, false)
    const inp = item('Ayam goreng').getByTestId('qty-input')
    await inp.fill('2'); await inp.press('Enter'); await inp.waitFor({ state: 'detached' })
    assert.equal(await item('Ayam goreng').getByTestId('qty').innerText(), '2')
  })

  await step(`${tag} audit Log: food search, meal select, Add Calories sheet, food sheet (typing amount), exercise search, quick burn`, async () => {
    await close()
    await page.goto(BASE + '/log?meal=lunch'); await page.getByTestId('ai-cards').waitFor()
    await audit('log food', 2)
    await page.getByTestId('qa-btn').click(); await dialog.waitFor(); await audit('add calories sheet', 2); await close()
    await page.getByRole('button', { name: /^Nasi goreng, 1 plate/ }).click(); await dialog.waitFor()
    await dialog.getByTestId('qty-edit').click(); await dialog.getByTestId('qty-input').waitFor()
    await audit('food sheet typing')
    const custom = dialog.getByRole('button', { name: /^Custom|grams/i })
    if (await custom.count()) { await custom.first().click(); await audit('food sheet custom grams') }
    await close()
    await page.goto(BASE + '/log?mode=exercise'); await page.getByRole('button', { name: 'Walking' }).waitFor()
    await audit('log exercise')
    await page.getByTestId('qa-btn').click(); await dialog.waitFor(); await audit('quick burn sheet', 2); await close()
  })

  await step(`${tag} audit Home sheets: quick add edit (typing servings), AI group sheet (meal select), add item, exercise edit`, async () => {
    await page.goto(BASE + '/'); await page.getByTestId('balance').waitFor()
    await page.getByRole('button', { name: /^Edit Kopi susu,/ }).click(); await dialog.waitFor()
    await dialog.getByTestId('qty-edit').click(); await dialog.getByTestId('qty-input').waitFor()
    await audit('edit quick add', 3); await close()
    await page.getByTestId('ai-group-row').click(); await dialog.waitFor()
    const f = await audit('AI group sheet')
    assert.ok(f.some((x) => x.id === 'group-meal'), 'group meal select audited')
    await dialog.getByRole('button', { name: /Add item/ }).click(); await page.waitForTimeout(400)
    await audit('add item sheet'); await close()
    await page.getByRole('button', { name: /^Edit Badminton,/ }).click(); await dialog.waitFor()
    await audit('edit exercise'); await close()
  })

  await step(`${tag} audit Me: body, BMR, macros, API key; Log weight and goal sheets; My food sheet`, async () => {
    await page.goto(BASE + '/settings'); await page.getByTestId('log-weight').waitFor()
    await audit('me', 6)
    await page.getByTestId('log-weight').click(); await dialog.waitFor(); await audit('log weight sheet', 2); await close()
    await page.getByTestId('edit-goal').click(); await dialog.waitFor()
    await audit('goal sheet')
    const by = dialog.getByTestId('by-custom'); if (await by.count()) { await by.click(); await audit('goal sheet date', 2) }
    await close()
    await page.goto(BASE + '/log?meal=lunch'); await page.getByTestId('tab-mine').click()
    await page.getByRole('button', { name: /^Bubur ayam, saved food/ }).click(); await dialog.waitFor()
    const ed = dialog.getByTestId('myfood-edit'); if (await ed.count()) { await ed.click(); await page.waitForTimeout(400); await audit('my food sheet', 2) } else await audit('saved food sheet')
    await close()
  })

  await step(`${tag} audit onboarding: every step with a field`, async () => {
    const op = await ctx.newPage()
    op.on('console', (m) => { if ((m.type() === 'error' || m.type() === 'warning') && !/service worker/i.test(m.text()) && !/status of 404/.test(m.text())) errors.push(`${tag} ob: ${m.type()}: ${m.text()}`) })
    await op.addInitScript(() => sessionStorage.setItem('fresh', '1'))
    await op.goto(BASE + '/'); await op.evaluate(() => { for (const k of Object.keys(localStorage)) if (k === 'calorie-app:v3') localStorage.removeItem(k) })
    await op.goto(BASE + '/onboarding'); await op.getByTestId('ob-start').click()
    const a = async (where, min = 1) => {
      await op.waitForTimeout(300)
      const f = await op.evaluate(FIELDS)
      assert.ok(f.length >= min, `${where}: ${f.length} fields`)
      for (const x of f) { assert.ok(x.px >= 16, `${where}: ${x.id} is ${x.px}px`); assert.equal(x.scale, 1); seen.set(`${where} · ${x.tag} ${x.id}`, x.px) }
    }
    await op.getByTestId('ob-sex-male').click(); await a('onboarding age'); await op.getByTestId('ob-age').fill('32'); await op.getByTestId('ob-next').click()
    await a('onboarding body', 2); await op.getByTestId('ob-height').fill('175'); await op.getByTestId('ob-weight').fill('92'); await op.getByTestId('ob-next').click()
    await op.getByTestId('ob-goal-lose').click(); await op.getByTestId('ob-goal-weight').waitFor(); await a('onboarding goal weight')
    await op.fill('input[name=goalWeightKg]', '85'); await op.getByTestId('ob-next').click()
    await op.getByTestId('by-custom').click(); await a('onboarding by when')
    // put the real data back for the next page
    await op.evaluate((v3) => localStorage.setItem('calorie-app:v3', v3), V3)
    await op.close()
  })

  await step(`${tag} storage stays v3; :v2 :v1 :ai :foods byte-identical, no new keys`, async () => {
    const s = await page.evaluate(() => Object.fromEntries(Object.keys(localStorage).map((k) => [k, localStorage.getItem(k)])))
    assert.deepEqual(Object.keys(s).sort(), ['calorie-app:ai', 'calorie-app:backup', 'calorie-app:foods', 'calorie-app:v1', 'calorie-app:v2', 'calorie-app:v3'])
    for (const [k, v] of Object.entries(FIXED)) assert.equal(s[k], v, k)
    assert.equal(JSON.parse(s['calorie-app:v3']).version, 3)
  })
  await ctx.close()
}
await browser.close()
console.log(results.join('\n'))
console.log(`\nfields audited (focused font size):\n${[...seen].map(([k, v]) => `  ${k}: ${v}px`).join('\n')}`)
if (errors.length) { console.log(errors.join('\n')); process.exit(1) }
console.log(`\n${results.length} passed`)
