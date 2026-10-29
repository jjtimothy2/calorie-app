// v1.14.2 (approved by Jordy): 44x44 tap areas on the compact servings stepper of the AI result sheet (minus, number,
// plus; the typing field too), with the same look and layout as v1.14.1. Hit areas are ::before pseudo-elements:
// 6 px above and below; − / + 10 px outward and 2 px inward; the number 2 px each side, so neighbours meet edge to
// edge and never overlap. Measured two ways: the pseudo-element geometry, and real hit testing (elementFromPoint on a
// 1 px grid) to prove each area is a solid rectangle >= 44x44 that no neighbour steals from. Taps in the extended
// zones work. The long name at 375 px still wraps with no clipping or overlap with kcal. The other steppers (edit
// sheet Servings, exercise minutes) are checked at >= 44 too. Schema stays v3; :v2 :v1 :ai :foods byte-identical.
// Mocked Gemini (no network). WebKit at 390x844 and 375x667. Screenshots: screenshots/v1142-*.png.
// Usage: npm run build && npx vite preview --port 4174 & node tests/v1142.mjs
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
const entries = [{ id: 'q1', date: TODAY, meal: 'breakfast', foodId: null, name: 'Kopi susu', servingLabel: 'Quick add', servingMult: 1, qty: 1, kcal: 140, protein: 10, carbs: 20, fat: 5, createdAt: T + 1 }]
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

const browser = await webkit.launch()
for (const [w, h] of [[390, 844], [375, 667]]) {
  const tag = `${w}x${h}`
  const ctx = await browser.newContext({ ...devices['iPhone 14'], viewport: { width: w, height: h }, deviceScaleFactor: 3, hasTouch: true, isMobile: true, serviceWorkers: 'block' })
  await ctx.route('https://generativelanguage.googleapis.com/**', (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS })
    return route.fulfill({ status: 200, contentType: 'application/json', headers: CORS, body: JSON.stringify(geminiOk(EST)) })
  })
  await ctx.addInitScript(([v3, fixed]) => {
    if (localStorage.getItem('calorie-app:v3')) return
    localStorage.setItem('calorie-app:v3', v3)
    for (const [k, v] of Object.entries(fixed)) localStorage.setItem(k, v)
    localStorage.setItem('calorie-app:backup', JSON.stringify({ lastExportAt: Date.now(), dismissedAt: null }))
  }, [V3, FIXED])
  const page = await ctx.newPage()
  page.on('console', (m) => { if ((m.type() === 'error' || m.type() === 'warning') && !/service worker/i.test(m.text())) errors.push(`${tag}: ${m.type()}: ${m.text()}`) })
  page.on('pageerror', (er) => errors.push(`${tag}: pageerror: ${er.message}`))
  const dialog = page.getByRole('dialog')
  const shot = async (name, loc = page) => { await page.waitForTimeout(300); await loc.screenshot({ path: `${OUT}v1142-${name}-${tag}.png` }) }
  const list = () => dialog.getByRole('list', { name: 'Estimated items' })
  const item = (n) => list().getByRole('listitem').filter({ hasText: n })
  const num = (n) => item(n).getByTestId('qty').innerText()
  const SEL = '[data-testid=qty-dec], [data-testid=qty-edit], [data-testid=qty-hit], [data-testid=qty-inc], button[aria-label^="Remove "]'
  const measure = (sel = SEL) => list().evaluate(MEASURE, sel)
  const box = (loc) => loc.evaluate((e) => { const r = e.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height } })
  const tap = (x, y) => page.touchscreen.tap(x, y)
  const describe = async () => {
    await page.goto(BASE + '/log?meal=lunch'); await page.getByTestId('ai-cards').waitFor()
    await page.getByTestId('ai-card-describe').click()
    await dialog.getByRole('textbox', { name: 'What did you eat?' }).fill('keripik tempe, nasi, sambal, ayam goreng')
    await dialog.getByRole('button', { name: /^Estimate$/ }).click()
    await item('Ayam goreng').waitFor(); await page.waitForTimeout(450)
  }

  await step(`${tag} same look as v1.14.1: 32 px − / +, 52x32 number, 132x40 stepper box`, async () => {
    await describe()
    for (const n of [LONG, 'Nasi putih', 'Sambal', 'Ayam goreng']) {
      const [d, e, i, s] = await Promise.all(['qty-dec', 'qty-edit', 'qty-inc', 'row-stepper'].map((t) => box(item(n).getByTestId(t))))
      assert.deepEqual([d.w, d.h, i.w, i.h, e.w, e.h, s.w, s.h], [32, 32, 32, 32, 52, 32, 132, 40], n)
    }
    await shot('results', dialog)
  })

  await step(`${tag} every stepper target (−, number, +) is >= 44x44 by geometry and by hit testing, solid, and no two targets (✕ included) overlap`, async () => {
    const m = await measure()
    assert.equal(m.length, 16, '4 rows x (−, number, +, ✕)')
    big(m.filter((t) => !t.name.startsWith('Remove ')), 'rest')
    assert.deepEqual(overlaps(m), [], 'no overlapping targets')
    const sizes = [...new Set(m.filter((t) => !t.name.startsWith('Remove ')).map((t) => `${t.gw}x${t.gh}`))].sort()
    assert.deepEqual(sizes, ['44x44', '56x44'], 'minus/plus 44x44, number 56x44')
    for (const v of ['2', '0.5']) { // wider and narrower numbers keep the same areas
      await item('Nasi putih').getByTestId(v === '2' ? 'qty-inc' : 'qty-dec').click()
      if (v === '0.5') await item('Nasi putih').getByTestId('qty-dec').click()
      assert.equal(await num('Nasi putih'), v)
      const m2 = await measure(); big(m2.filter((t) => !t.name.startsWith('Remove ') && !/disabled/.test(t.name)), `at ${v}`)
      assert.deepEqual(overlaps(m2), [])
    }
    await item('Nasi putih').getByTestId('qty-inc').click(); assert.equal(await num('Nasi putih'), '1')
  })

  await step(`${tag} taps in the extended zones work: − from 8 px outside, + from 5 px above and 8 px outside, number from 5 px below; the 2 px seams go to the right neighbour`, async () => {
    const n = 'Ayam goreng'
    let d = await box(item(n).getByTestId('qty-inc'))
    await tap(d.r + 8, d.t - 5); assert.equal(await num(n), '2', '+ from its outer top corner zone')
    d = await box(item(n).getByTestId('qty-inc'))
    await tap(d.l - 1.5, d.b + 5); assert.equal(await num(n), '3', '+ from 1.5 px inside the seam, below')
    d = await box(item(n).getByTestId('qty-dec'))
    await tap(d.l - 8, d.t + 16); assert.equal(await num(n), '2', '− from 8 px outside')
    await tap(d.r + 1.5, d.b + 5); assert.equal(await num(n), '1', '− from its side of the seam')
    await tap(d.l - 8, d.t - 5); assert.equal(await num(n), '0.5', '− from its outer top corner zone')
    assert.equal(await dialog.getByTestId('qty-input').count(), 0, 'no tap opened the keyboard')
    const e = await box(item(n).getByTestId('qty-edit'))
    await tap(e.l + e.w / 2, e.b + 5)
    const inp = item(n).getByTestId('qty-input'); await inp.waitFor()
    assert.ok(await inp.evaluate((el) => el === document.activeElement), 'number from 5 px below opens typing')
  })

  await step(`${tag} typing: the field keeps a >= 44 px area via its label; a tap on its edge keeps it open and focused; −/+ areas unchanged; Enter keeps the amount`, async () => {
    const n = 'Ayam goreng', inp = item(n).getByTestId('qty-input')
    const m = await measure(); big(m.filter((t) => !t.name.startsWith('Remove ')), 'typing')
    assert.deepEqual(overlaps(m), [])
    assert.ok(m.some((t) => t.name === 'qty-hit' && t.gw === 56 && t.gh === 44), 'field area 56x44')
    const f = await box(item(n).getByTestId('qty-hit'))
    await tap(f.l + f.w / 2, f.t - 4); await page.waitForTimeout(150)
    assert.equal(await inp.count(), 1, 'still typing'); assert.ok(await inp.evaluate((el) => el === document.activeElement), 'still focused')
    await shot('typing', item(n))
    await inp.fill('2'); await inp.press('Enter'); await inp.waitFor({ state: 'detached' })
    assert.equal(await num(n), '2')
    assert.match(await dialog.getByRole('button', { name: /^Log 4 items/ }).innerText(), /Log 4 items · 980 kcal/)
  })

  await step(`${tag} long name row: wraps, no clipping or overlap with kcal; hit areas stay inside the sheet with no sideways scroll`, async () => {
    const g = await item(LONG).evaluate((li) => {
      const r = (s) => li.querySelector(s).getBoundingClientRect()
      const name = li.querySelector('[data-testid=item-name]'), sheet = document.querySelector('[role=dialog]')
      const sr = sheet.getBoundingClientRect(), kc = r('[data-testid=item-kcal]'), stp = r('[data-testid=row-stepper]'), nm = name.getBoundingClientRect(), mac = r('[data-testid=item-macros]')
      const over = (a, b) => a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5
      const scrollers = [sheet, ...sheet.querySelectorAll('*')].filter((e) => /auto|scroll/.test(getComputedStyle(e).overflowY) || /auto|scroll/.test(getComputedStyle(e).overflowX))
      return { lines: Math.round(nm.height / parseFloat(getComputedStyle(name).lineHeight)), nameOverflow: name.scrollWidth > name.clientWidth + 0.5, nameKcal: over(nm, kc), stepKcal: over(stp, kc), stepMacros: over(stp, mac), stepInside: stp.left >= sr.left && stp.right <= sr.right - 10, sideScroll: scrollers.some((e) => e.scrollWidth > e.clientWidth + 0.5) }
    })
    assert.deepEqual({ ...g, lines: 0 }, { lines: 0, nameOverflow: false, nameKcal: false, stepKcal: false, stepMacros: false, stepInside: true, sideScroll: false }, JSON.stringify(g))
    if (w === 375) assert.ok(g.lines >= 2, `long name wraps (${g.lines} lines)`)
    const m = (await measure()).filter((t) => !t.name.startsWith('Remove ') && !/disabled/.test(t.name))
    const sr = await box(dialog.first())
    for (const t of m) assert.ok(t.geo.l >= sr.l && t.geo.r <= sr.r, `${t.name} area inside the sheet`)
    await shot('long-name', item(LONG))
  })

  await step(`${tag} other steppers are already >= 44x44 (edit sheet Servings: 48 px − / +, number; exercise minutes: 48 px − / +); none overlap`, async () => {
    await page.keyboard.press('Escape'); await dialog.waitFor({ state: 'detached' })
    await page.goto(BASE + '/'); await page.getByTestId('eaten').waitFor()
    await page.getByRole('button', { name: /^Edit Kopi susu,/ }).click(); await dialog.waitFor(); await page.waitForTimeout(350)
    let m = await dialog.evaluate(MEASURE, 'button[aria-label="Decrease amount"], [data-testid=qty-edit], button[aria-label="Increase amount"]')
    assert.equal(m.length, 3); big(m, 'edit sheet', false); assert.deepEqual(overlaps(m), [])
    assert.deepEqual(m.map((t) => t.box[1]), [48, 48, 48])
    await page.keyboard.press('Escape'); await dialog.waitFor({ state: 'detached' })
    await page.getByRole('button', { name: /^Edit Badminton,/ }).click(); await dialog.waitFor(); await page.waitForTimeout(350)
    m = await dialog.evaluate(MEASURE, 'button[aria-label="Decrease duration"], button[aria-label="Increase duration"]')
    assert.equal(m.length, 2); big(m, 'exercise', false); assert.deepEqual(overlaps(m), [])
    assert.deepEqual(m.map((t) => t.box), [[48, 48], [48, 48]])
    await page.keyboard.press('Escape'); await dialog.waitFor({ state: 'detached' })
  })

  await step(`${tag} log still works and storage stays v3; :v2 :v1 :ai :foods byte-identical, no new keys`, async () => {
    await describe()
    await item('Sambal').getByTestId('qty-inc').click()
    await dialog.getByRole('button', { name: /^Log 4 items · 680 kcal$/ }).click(); await dialog.waitFor({ state: 'detached' })
    await page.waitForURL(BASE + '/')
    const s = await page.evaluate(() => Object.fromEntries(Object.keys(localStorage).map((k) => [k, localStorage.getItem(k)])))
    assert.deepEqual(Object.keys(s).sort(), ['calorie-app:ai', 'calorie-app:backup', 'calorie-app:foods', 'calorie-app:v1', 'calorie-app:v2', 'calorie-app:v3'])
    for (const [k, v] of Object.entries(FIXED)) assert.equal(s[k], v, k)
    const v3 = JSON.parse(s['calorie-app:v3'])
    assert.equal(v3.version, 3); assert.deepEqual(Object.keys(v3).sort(), Object.keys(JSON.parse(V3)).sort())
    const sb = v3.entries.find((e) => e.name === 'Sambal'); assert.deepEqual([sb.qty, sb.kcal, sb.servingLabel], [2, 30, '1 serving (15 g)'])
    assert.equal(JSON.stringify(v3.entries.find((e) => e.id === 'q1')), JSON.stringify(entries[0]))
  })
  await ctx.close()
}
await browser.close()
console.log(results.join('\n'))
if (errors.length) { console.log(errors.join('\n')); process.exit(1) }
console.log(`\n${results.length} passed`)
