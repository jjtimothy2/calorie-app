// v1.13.5: each meal card on Home shows that meal's protein, carbs and fat under its header as one muted line,
// "P 34 · C 45 · F 13 g" (whole grams, "g" once, "P n" semibold ink-soft, the rest text-mute, 13 px Instrument Sans).
// AI group items count toward their meal; moving a group moves its grams. Empty meals and meals with no macro data
// show no line; items without macros add nothing (known grams only). Food rows stay calories-only. Past (closed) days
// show it too. Screen readers get "Protein n g, carbs n g, fat n g" (the visual text is aria-hidden). Contrast >= 4.5:1.
// No data change: calorie-app:v3, :v2 :v1 :ai :foods byte-identical. WebKit at 390x844 and 375x667.
// Screenshots: screenshots/v1135-*.png. Usage: npm run build && npx vite preview --port 4174 & node tests/v1135-meal-macros.mjs
import { webkit, devices } from 'playwright'
import assert from 'node:assert/strict'

const BASE = (process.env.BASE_URL ?? 'http://localhost:4174/calorie-app').replace(/\/$/, '')
const OUT = new URL('../screenshots/', import.meta.url).pathname
const results = [], errors = []
const step = async (name, fn) => {
  try { await fn(); results.push(`PASS ${name}`) } catch (e) { results.push(`FAIL ${name}: ${e.message}`); console.log(results.join('\n')); console.log(errors.join('\n')); throw e }
}
const pad = (n) => String(n).padStart(2, '0')
const key = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const ago = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return key(d) }
const TODAY = ago(0), YDAY = ago(1)
const T = Date.now() - 3600_000
const profile = { age: 32, sex: 'male', heightCm: 175, weightKg: 92, activity: 'light', goal: 'lose', bmr: 1859, bmrCustom: false, includeMovement: false, goalWeightKg: 85, goalDate: ago(-200), planFrom: { date: ago(3), kg: 92 }, goalAssumed: false, macros: { protein: null, carbs: null, fat: null }, target: 1500, dailyGoal: 500 }
const q = (id, meal, name, kcal, p, c, f, i, x = {}) => ({ id, date: TODAY, meal, foodId: null, name, servingLabel: 'Quick add', servingMult: 1, qty: 1, kcal, protein: p, carbs: c, fat: f, createdAt: T + i, ...x })
const ai = { source: 'photo', groupId: 'g1', groupName: 'Nasi ayam bakar', servingLabel: '1 plate' }
const entries = [
  q('b1', 'breakfast', 'Bubur ayam', 372, 14, 52, 11, 1),
  q('b2', 'breakfast', 'Telur rebus', 78, 6, 1, 5, 2, { qty: 2 }),
  q('b3', 'breakfast', 'Kopi hitam', 5, 0, 0, 0, 3), // logged without macros: adds nothing
  q('l1', 'lunch', 'Nasi putih', 204, 4, 45, 0.4, 4, ai),
  q('l2', 'lunch', 'Ayam bakar', 245, 30, 0, 13, 5, ai),
  q('v1', 'beverages', 'Es kopi susu', 180, 3, 28, 6, 6),
  // Yesterday (closed by the midnight rule): a long 3-digit line, and a meal logged with calories only.
  q('y1', 'dinner', 'Martabak manis', 1250, 41.7, 137.3, 56, 7, { date: YDAY, qty: 3 }),
  q('y2', 'dinner', 'Teh botol', 90, 0, 0, 0, 8, { date: YDAY }),
  q('y3', 'lunch', 'Nasi padang', 750, 0, 0, 0, 9, { date: YDAY }),
]
const V3 = JSON.stringify({ version: 3, profile, entries, exercises: [], closedDays: {}, favourites: [], weights: [{ date: ago(3), kg: 92 }] })
const FIXED = {
  'calorie-app:v2': '{"version":2,"profile":null,"entries":[],"exercises":[],"closedDays":{},"favourites":[]}',
  'calorie-app:v1': '{"version":1,"entries":[]}',
  'calorie-app:ai': JSON.stringify({ provider: 'gemini', key: 'AIzaTEST-not-a-real-key-000000000000' }),
  'calorie-app:foods': JSON.stringify({ version: 1, foods: [{ id: 'u_bubur', name: 'Bubur ayam', kcal: 320, protein: 12, carbs: 45, fat: 8, createdAt: 1, updatedAt: 1 }] }),
}

const browser = await webkit.launch()
for (const [w, h] of [[390, 844], [375, 667]]) {
  const tag = `${w}x${h}`
  const ctx = await browser.newContext({ ...devices['iPhone 14'], viewport: { width: w, height: h }, deviceScaleFactor: 3, serviceWorkers: 'block' })
  await ctx.addInitScript(([v3, fixed]) => {
    if (localStorage.getItem('calorie-app:v3')) return
    localStorage.setItem('calorie-app:v3', v3)
    for (const [k, v] of Object.entries(fixed)) localStorage.setItem(k, v)
    localStorage.setItem('calorie-app:backup', JSON.stringify({ lastExportAt: Date.now(), dismissedAt: null }))
  }, [V3, FIXED])
  const page = await ctx.newPage()
  page.on('console', (m) => { if ((m.type() === 'error' || m.type() === 'warning') && !/service worker/i.test(m.text())) errors.push(`${tag}: ${m.type()}: ${m.text()}`) })
  page.on('pageerror', (x) => errors.push(`${tag}: pageerror: ${x.message}`))
  const macros = (m) => page.getByTestId(`meal-${m}`).getByTestId('meal-macros')
  const text = async (m) => (await macros(m).innerText()).replace(/\s+/g, ' ').trim()

  await step(`${tag} each non-empty meal shows rounded P/C/F, AI group items included, qty applied, no-macro items add nothing`, async () => {
    await page.goto(BASE + '/'); await page.getByTestId('meal-breakfast').waitFor()
    assert.equal(await macros('breakfast').getAttribute('data-macros'), '26/54/21') // 14+12, 52+2, 11+10 (+ Kopi hitam 0)
    assert.equal(await macros('lunch').getAttribute('data-macros'), '34/45/13') // 13.4 rounds to 13
    assert.equal(await macros('beverages').getAttribute('data-macros'), '3/28/6')
    assert.equal(await text('lunch'), 'P 34 · C 45 · F 13 g')
    assert.equal(await text('breakfast'), 'P 26 · C 54 · F 21 g')
  })
  await step(`${tag} screen readers hear "Protein n g, carbs n g, fat n g"; the visual text is hidden from them`, async () => {
    assert.equal(await macros('lunch').getAttribute('aria-label'), 'Protein 34 g, carbs 45 g, fat 13 g')
    assert.equal(await macros('lunch').locator('> span').getAttribute('aria-hidden'), 'true')
  })
  await step(`${tag} empty meals show no macro line`, async () => {
    assert.equal(await macros('dinner').count(), 0)
    assert.equal(await macros('snacks').count(), 0)
  })
  await step(`${tag} food rows stay calories-only`, async () => {
    for (const m of ['breakfast', 'lunch', 'beverages']) {
      const rows = await page.getByTestId(`meal-${m}`).locator('li').allInnerTexts()
      for (const r of rows) assert.ok(!/\bP \d|protein|carbs|\bfat\b/i.test(r), r)
    }
  })
  await step(`${tag} style: 13 px Instrument Sans in text-mute, "P n" semibold ink-soft, one line under the header, contrast >= 4.5:1`, async () => {
    const s = await macros('lunch').evaluate((el) => {
      const lum = (c) => { const [r, g, b] = c.match(/[\d.]+/g).slice(0, 3).map(Number).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 }); return 0.2126 * r + 0.7152 * g + 0.0722 * b }
      const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return Math.round(((x + 0.05) / (y + 0.05)) * 100) / 100 }
      let n = el; let bg = 'rgba(0, 0, 0, 0)'
      while (n && /rgba\(0, 0, 0, 0\)|transparent/.test(bg)) { bg = getComputedStyle(n).backgroundColor; n = n.parentElement }
      const cs = getComputedStyle(el), p = el.querySelector('.font-semibold'), ps = getComputedStyle(p)
      const head = el.parentElement.querySelector('h2').getBoundingClientRect(), r = el.getBoundingClientRect()
      return { font: cs.fontFamily.split(',')[0].replace(/"/g, ''), size: cs.fontSize, color: cs.color, weight: cs.fontWeight, pText: p.textContent, pColor: ps.color, pWeight: ps.fontWeight,
        bg, mute: ratio(cs.color, bg), strong: ratio(ps.color, bg), lines: Math.round(r.height / parseFloat(cs.lineHeight)), below: r.top >= head.bottom - 1 }
    })
    assert.equal(s.font, 'Instrument Sans'); assert.equal(s.size, '13px')
    assert.equal(s.color, 'rgb(107, 103, 95)', 'text-mute #6B675F, not mute-soft #8A7F72')
    assert.equal(s.pText, 'P 34'); assert.equal(s.pColor, 'rgb(69, 66, 60)'); assert.equal(s.pWeight, '600'); assert.equal(s.weight, '400')
    assert.ok(s.mute >= 4.5 && s.strong >= 4.5, `contrast ${s.mute}:1 / ${s.strong}:1 on ${s.bg}`)
    assert.equal(s.lines, 1); assert.ok(s.below)
    console.log(`${tag} contrast on ${s.bg}: text-mute ${s.mute}:1, P ${s.strong}:1`)
    await page.screenshot({ path: `${OUT}v1135-home-${tag}.png` })
    await page.getByTestId('meal-lunch').screenshot({ path: `${OUT}v1135-ai-group-${tag}.png` })
  })
  await step(`${tag} moving the AI group to Dinner moves its grams; Undo moves them back`, async () => {
    await page.getByTestId('ai-group-row').click()
    const sheet = page.getByTestId('ai-group-sheet'); await sheet.waitFor()
    await sheet.getByTestId('group-meal').selectOption('dinner')
    await page.getByTestId('toast').waitFor()
    assert.equal(await macros('lunch').count(), 0)
    assert.equal(await macros('dinner').getAttribute('data-macros'), '34/45/13')
    await page.getByTestId('toast').getByRole('button', { name: 'Undo' }).click()
    await page.getByTestId('toast').waitFor({ state: 'detached' })
    assert.equal(await macros('dinner').count(), 0)
    assert.equal(await macros('lunch').getAttribute('data-macros'), '34/45/13')
  })
  await step(`${tag} past closed day: long 3-digit line fits on one line; a meal with no macro data shows no line`, async () => {
    await page.getByTestId('day-prev').click()
    await page.waitForFunction(() => document.querySelector('#day-title')?.textContent === 'Yesterday')
    const s = await page.evaluate((d) => !!JSON.parse(localStorage.getItem('calorie-app:v3')).closedDays[d], YDAY)
    assert.ok(s, 'yesterday is closed')
    assert.equal(await text('dinner'), 'P 125 · C 412 · F 168 g') // 41.7x3, 137.3x3 = 411.9, 56x3 (+ Teh botol 0)
    assert.equal(await macros('lunch').count(), 0, 'calories-only meal: no line')
    assert.match(await page.getByTestId('meal-lunch').locator('h2').innerText(), /750 kcal/i)
    const fit = await macros('dinner').evaluate((el) => { const r = el.getBoundingClientRect(), c = el.closest('section').getBoundingClientRect(); return { h: r.height, lh: parseFloat(getComputedStyle(el).lineHeight), inside: r.right <= c.right + 0.5, sw: el.scrollWidth <= el.clientWidth } })
    assert.ok(fit.h <= fit.lh + 1 && fit.inside && fit.sw, JSON.stringify(fit))
    await page.getByTestId('meal-dinner').scrollIntoViewIfNeeded()
    await page.screenshot({ path: `${OUT}v1135-long-${tag}.png` })
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
assert.equal(errors.length, 0, errors.join('\n'))
console.log(`\n${results.length} v1.13.5 meal macro checks passed, no console errors`)
