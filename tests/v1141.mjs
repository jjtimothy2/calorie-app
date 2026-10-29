// v1.14.1 (Reed, approved by Jordy): servings on the AI result sheet after Snap a photo / Describe your meal.
// 1. Each item row has a compact servings stepper (− number +) instead of the grams stepper; starts at 1 = the AI's
//    whole portion; no keyboard on open. 2. −/+ half steps below 1, whole steps above, minimum 0.5 (Sheet.tsx Stepper).
// 3. Tap the number: decimal field (inputMode decimal, '1,5' ok, max 99), v1.14 invalid-input handling.
// 4. Grey line: portion and grams scaled, '1.5 pieces (12 g) · 3P 6C 4F'; kcal and macros scale; no portion -> serving.
// 5. One hint 'Tap the number to type' above the list. 6. Total, macro pills and 'Log N items · X kcal' follow.
// 7. Log saves qty = servings, per-serving values, label '<portion> (<grams> g)'; Edit opens at that number and keeps
//    'pieces'; items saved before this release open as they did. 8. A long name wraps at 375 px; the stepper never
//    clips or overlaps the kcal. Schema stays v3; :v2 :v1 :ai :foods byte-identical.
// Mocked Gemini (no network). WebKit at 390x844 and 375x667. Screenshots: screenshots/v1141-*.png.
// Usage: npm run build && npx vite preview --port 4174 & node tests/v1141.mjs
import { webkit, devices } from 'playwright'
import assert from 'node:assert/strict'
import { PLATE, geminiOk, makePlate } from './v15-fixture.mjs'

const BASE = (process.env.BASE_URL ?? 'http://localhost:4174/calorie-app').replace(/\/$/, '')
const OUT = new URL('../screenshots/', import.meta.url).pathname
const results = [], errors = []
const step = async (name, fn) => {
  try { await fn(); results.push(`PASS ${name}`) } catch (e) { results.push(`FAIL ${name}: ${e.message.slice(0, 800)}`); console.log(results.join('\n')); console.log(errors.join('\n')); throw e }
}
const pad = (n) => String(n).padStart(2, '0')
const key = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const ago = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return key(d) }
const TODAY = ago(0)
const T = Date.now() - 3600_000
const profile = { age: 32, sex: 'male', heightCm: 175, weightKg: 92, activity: 'light', goal: 'lose', bmr: 1859, bmrCustom: false, includeMovement: false, goalWeightKg: 85, goalDate: ago(-120), planFrom: { date: ago(3), kg: 92 }, goalAssumed: false, macros: { protein: null, carbs: null, fat: null }, target: 1800, dailyGoal: 500 }
// Saved by v1.14 and earlier: grams baked into the label and the values, qty 1.
const old = (id, name, label, kcal, p, c, f, i) => ({ id, date: TODAY, meal: 'breakfast', foodId: null, name, servingLabel: label, servingMult: 1, qty: 1, kcal, protein: p, carbs: c, fat: f, createdAt: T + i, source: 'photo' })
const entries = [old('o1', 'Bubur kacang', '160 g', 267, 5, 58.7, 1, 1), old('o2', 'Tahu isi', '1 piece (120 g)', 330, 25, 5, 23, 2)]
const V3 = JSON.stringify({ version: 3, profile, entries, exercises: [], closedDays: {}, favourites: [], weights: [{ date: ago(3), kg: 92 }] })
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

const browser = await webkit.launch()
await makePlate(browser)
for (const [w, h] of [[390, 844], [375, 667]]) {
  const tag = `${w}x${h}`
  const ctx = await browser.newContext({ ...devices['iPhone 14'], viewport: { width: w, height: h }, deviceScaleFactor: 3, hasTouch: true, isMobile: true, serviceWorkers: 'block' })
  await ctx.route('https://generativelanguage.googleapis.com/**', (route) => {
    const r = route.request()
    if (r.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS })
    return route.fulfill({ status: 200, contentType: 'application/json', headers: CORS, body: JSON.stringify(geminiOk(EST)) })
  })
  await ctx.addInitScript(([v3, fixed]) => {
    if (localStorage.getItem('calorie-app:v3')) return
    localStorage.setItem('calorie-app:v3', v3)
    for (const [k, v] of Object.entries(fixed)) localStorage.setItem(k, v)
    localStorage.setItem('calorie-app:backup', JSON.stringify({ lastExportAt: Date.now(), dismissedAt: null }))
  }, [V3, FIXED])
  await ctx.addInitScript(() => {
    const click = HTMLInputElement.prototype.click
    HTMLInputElement.prototype.click = function () { if (this.type === 'file') return; return click.call(this) }
  })
  const page = await ctx.newPage()
  page.on('console', (m) => { if ((m.type() === 'error' || m.type() === 'warning') && !/service worker/i.test(m.text())) errors.push(`${tag}: ${m.type()}: ${m.text()}`) })
  page.on('pageerror', (er) => errors.push(`${tag}: pageerror: ${er.message}`))
  const dialog = page.getByRole('dialog')
  const shot = async (name, loc = page) => { await page.waitForTimeout(300); await loc.screenshot({ path: `${OUT}v1141-${name}-${tag}.png` }) }
  const st = async () => JSON.parse(await page.evaluate(() => localStorage.getItem('calorie-app:v3')))
  const items = () => dialog.getByRole('list', { name: 'Estimated items' }).getByRole('listitem')
  const item = (n) => items().filter({ hasText: n })
  const num = (n) => item(n).getByTestId('qty').innerText()
  const kcal = async (n) => (await item(n).getByTestId('item-kcal').innerText()).replace(/\s+/g, '')
  const line = (n) => item(n).getByTestId('item-macros').evaluate((el) => { const c = el.cloneNode(true); c.querySelectorAll('.sr-only').forEach((x) => x.remove()); return c.textContent.replace(/\s+/g, ' ').trim() })
  const total = async () => (await dialog.getByTestId('photo-total').innerText()).replace(/\s+/g, '')
  const pills = () => Promise.all(['protein', 'carbs', 'fat'].map((k) => dialog.getByTestId(`total-${k}`).innerText()))
  const logBtn = () => dialog.getByRole('button', { name: /^Log \d+ items?/ })
  const focused = () => page.evaluate(() => { const a = document.activeElement; return a && /INPUT|TEXTAREA|SELECT/.test(a.tagName) ? a.tagName : null })
  const describe = async () => {
    await page.goto(BASE + '/log?meal=lunch'); await page.getByTestId('ai-cards').waitFor()
    await page.getByTestId('ai-card-describe').click()
    await dialog.getByRole('textbox', { name: 'What did you eat?' }).fill('keripik tempe, nasi, sambal, ayam goreng')
    await dialog.getByRole('button', { name: /^Estimate$/ }).click()
    await item('Ayam goreng').waitFor(); await page.waitForTimeout(450)
  }

  await step(`${tag} 1+5: every row has a compact servings stepper at 1 (no grams stepper); one hint above the list; no keyboard`, async () => {
    await describe()
    assert.equal(await items().count(), 4)
    assert.equal(await dialog.getByTestId('item-grams').count(), 0, 'grams stepper gone')
    assert.equal(await dialog.getByTestId('row-stepper').count(), 4)
    for (const n of [LONG, 'Nasi putih', 'Sambal', 'Ayam goreng']) {
      assert.equal(await num(n), '1', n)
      assert.equal(await item(n).getByRole('button', { name: `Less ${n}` }).count(), 1)
      assert.equal(await item(n).getByRole('button', { name: `More ${n}` }).count(), 1)
      assert.equal(await item(n).getByRole('button', { name: `1 serving of ${n}. Tap to type an amount` }).count(), 1)
    }
    assert.equal(await focused(), null, 'no field focused, so no keyboard')
    assert.equal(await dialog.getByTestId('qty-input').count(), 0)
    const hint = dialog.getByText('Tap the number to type')
    assert.equal(await hint.count(), 1, 'one hint, not per row')
    assert.ok((await hint.boundingBox()).y + 10 < (await items().first().boundingBox()).y + 5, 'hint above the list')
    assert.equal(await kcal(LONG), '40kcal'); assert.equal(await line(LONG), '1 piece (8 g) · 2P 4C 3F')
    assert.equal(await total(), '650kcal')
    assert.equal(await logBtn().innerText(), 'Log 4 items · 650 kcal')
    await shot('results-1-serving', dialog)
  })

  await step(`${tag} 2: − / + move in half steps below 1 and whole steps above; minimum 0.5`, async () => {
    const n = 'Nasi putih', more = item(n).getByRole('button', { name: `More ${n}` }), less = item(n).getByRole('button', { name: `Less ${n}` })
    for (const want of ['2', '3']) { await more.click(); assert.equal(await num(n), want) }
    for (const want of ['2', '1', '0.5']) { await less.click(); assert.equal(await num(n), want) }
    assert.ok(await less.isDisabled(), 'minus stops at 0.5')
    assert.equal(await kcal(n), '125kcal'); assert.equal(await line(n), '0.5 plate (75 g) · 3P 28C 1F')
    await more.click(); assert.equal(await num(n), '1')
    assert.equal(await focused(), null, 'buttons never open the keyboard')
  })

  await step(`${tag} 3+4: tap the number: decimal field, value selected, '1,5' works; '1.5 pieces (12 g) · 3P 6C 4F'; bad input keeps the last amount; tap outside keeps it`, async () => {
    const n = LONG
    await item(n).getByTestId('qty-edit').click()
    const inp = item(n).getByTestId('qty-input'); await inp.waitFor()
    assert.deepEqual(await inp.evaluate((el) => ({ mode: el.inputMode, focus: el === document.activeElement, a: el.selectionStart, b: el.selectionEnd, v: el.value, label: el.getAttribute('aria-label') })), { mode: 'decimal', focus: true, a: 0, b: 1, v: '1', label: `Servings of ${n}` })
    await inp.fill('1,5')
    assert.equal(await kcal(n), '60kcal')
    assert.equal(await line(n), '1.5 pieces (12 g) · 3P 6C 4F')
    assert.equal(await total(), '670kcal')
    await shot('typing', dialog)
    for (const bad of ['0', '', 'abc', '100']) {
      await inp.fill(bad)
      assert.equal(await item(n).getByTestId('qty-err').innerText(), 'Enter an amount above 0, like 1.5 or 0.75.', `"${bad}"`)
      assert.equal(await inp.getAttribute('aria-invalid'), 'true')
      assert.equal(await kcal(n), '60kcal', `"${bad}" keeps 1.5`); assert.equal(await logBtn().innerText(), 'Log 4 items · 670 kcal')
    }
    await inp.fill('99'); assert.equal(await item(n).getByTestId('qty-err').count(), 0, '99 is allowed')
    await inp.fill('abc')
    await dialog.getByTestId('photo-dish').click() // a tap outside
    await inp.waitFor({ state: 'detached' })
    assert.equal(await num(n), '99', 'last valid amount kept'); assert.equal(await item(n).getByTestId('qty-err').count(), 0)
    await item(n).getByTestId('qty-edit').click(); await inp.fill('1.5'); await inp.press('Enter'); await inp.waitFor({ state: 'detached' })
    assert.equal(await num(n), '1.5'); assert.equal(await line(n), '1.5 pieces (12 g) · 3P 6C 4F')
    assert.equal(await line('Sambal'), '1 serving (15 g) · 1P 2C 2F', 'no portion: serving')
    await item('Sambal').getByRole('button', { name: 'More Sambal' }).click()
    assert.equal(await line('Sambal'), '2 servings (30 g) · 1P 4C 5F')
  })

  await step(`${tag} 6: total kcal, macro pills and 'Log N items · X kcal' follow the servings; removing an item updates them`, async () => {
    // 60 + 250 + 60 + 330
    assert.equal(await total(), '700kcal')
    assert.deepEqual(await pills(), ['34 g Protein', '70 g Carbs', '33 g Fat'])
    assert.equal(await logBtn().innerText(), 'Log 4 items · 700 kcal')
    await item('Ayam goreng').getByRole('button', { name: 'More Ayam goreng' }).click()
    assert.equal(await kcal('Ayam goreng'), '660kcal'); assert.equal(await line('Ayam goreng'), '2 thighs (240 g) · 50P 10C 46F')
    assert.equal(await total(), '1,030kcal'); assert.equal(await logBtn().innerText(), 'Log 4 items · 1,030 kcal')
    await shot('results-changed', dialog)
  })

  await step(`${tag} 8: the long name wraps cleanly; the stepper never clips or overlaps the kcal or the grey line (also while typing)`, async () => {
    const check = async (label) => {
      const g = await item(LONG).evaluate((li) => {
        const r = (s) => li.querySelector(s).getBoundingClientRect()
        const name = li.querySelector('[data-testid=item-name]'), sheet = document.querySelector('[role=dialog]').getBoundingClientRect()
        const kc = r('[data-testid=item-kcal]'), stp = r('[data-testid=row-stepper]'), mac = r('[data-testid=item-macros]'), nm = name.getBoundingClientRect()
        const over = (a, b) => a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5
        return { lines: Math.round(nm.height / parseFloat(getComputedStyle(name).lineHeight)), nameOverflow: name.scrollWidth > name.clientWidth + 0.5, nameKcal: over(nm, kc), stepKcal: over(stp, kc), stepMacros: over(stp, mac), stepInside: stp.left >= sheet.left && stp.right <= sheet.right - 10, kcalInside: kc.right <= sheet.right, liOverflow: [...li.querySelectorAll('*')].filter((e) => !e.closest('[aria-label^="Remove "]') && !e.closest('.sr-only') && e.getBoundingClientRect().right > li.getBoundingClientRect().right + 0.5).map((e) => e.dataset.testid || e.tagName).join(',') || false }
      })
      assert.deepEqual({ ...g, lines: undefined }, { lines: undefined, nameOverflow: false, nameKcal: false, stepKcal: false, stepMacros: false, stepInside: true, kcalInside: true, liOverflow: false }, `${label}: ${JSON.stringify(g)}`)
      return g
    }
    const g = await check('at rest')
    if (w === 375) assert.ok(g.lines >= 2, `wraps to ${g.lines} lines at 375`)
    for (const n of ['Nasi putih', 'Sambal', 'Ayam goreng']) {
      const o = await item(n).evaluate((li) => [...li.querySelectorAll('*')].some((e) => !e.closest('[aria-label^="Remove "]') && !e.closest('.sr-only') && e.getBoundingClientRect().right > li.getBoundingClientRect().right + 0.5))
      assert.equal(o, false, `${n} row overflow`)
    }
    if (w === 375) await shot('long-name', item(LONG))
    await item(LONG).getByTestId('qty-edit').click(); await item(LONG).getByTestId('qty-input').waitFor()
    await check('typing')
    await item(LONG).getByTestId('qty-input').fill('abc'); await check('error')
    await item(LONG).getByTestId('qty-input').fill('1.5'); await item(LONG).getByTestId('qty-input').press('Enter')
  })

  await step(`${tag} 7: log saves qty = servings with per-serving values and '<portion> (<grams> g)'; Edit opens at that number and keeps 'pieces'`, async () => {
    await logBtn().click(); await dialog.waitFor({ state: 'detached' })
    await page.waitForURL(BASE + '/'); await page.getByTestId('toast').filter({ hasText: 'Added 4 items from AI · 1,030 kcal' }).waitFor()
    const ph = (await st()).entries.filter((e) => e.source === 'photo' && !['o1', 'o2'].includes(e.id))
    const by = (n) => ph.find((e) => e.name === n)
    const pick = (e) => [e.qty, e.servingLabel, e.kcal, e.protein, e.carbs, e.fat, e.foodId, e.groupName]
    assert.deepEqual(pick(by(LONG)), [1.5, '1 piece (8 g)', 40, 2, 4, 2.6, null, 'Nasi ayam goreng'])
    assert.deepEqual(pick(by('Nasi putih')), [1, '1 plate (150 g)', 250, 5, 55, 1, null, 'Nasi ayam goreng'])
    assert.deepEqual(pick(by('Sambal')), [2, '1 serving (15 g)', 30, 0.5, 2, 2.3, null, 'Nasi ayam goreng'])
    assert.deepEqual(pick(by('Ayam goreng')), [2, '1 thigh (120 g)', 330, 25, 5, 23, null, 'Nasi ayam goreng'])
    assert.equal(new Set(ph.map((e) => e.groupId)).size, 1)
    assert.deepEqual(Object.keys(by(LONG)).sort(), ['carbs', 'createdAt', 'date', 'fat', 'foodId', 'groupId', 'groupName', 'id', 'kcal', 'meal', 'name', 'protein', 'qty', 'servingLabel', 'servingMult', 'source'].sort(), 'same fields as before')
    await page.getByTestId('ai-group-row').click(); await page.getByTestId('ai-group-sheet').waitFor()
    const gs = await page.getByTestId('ai-group-sheet').innerText()
    assert.match(gs, /1\.5 pieces \(12 g\)/); assert.match(gs, /2 thighs \(240 g\)/); assert.match(gs, /2 servings \(30 g\)/)
    assert.match(gs, /1,030/)
    await page.getByTestId('ai-group-sheet').getByRole('button', { name: new RegExp(`^Edit ${LONG.replace(/[()]/g, '\\$&')},`) }).click()
    await page.getByRole('heading', { name: 'Edit item' }).waitFor(); await page.waitForTimeout(350)
    assert.equal(await page.getByTestId('qty').innerText(), '1.5 pieces (12 g)')
    assert.equal(await page.locator('input[name=kcal]').inputValue(), '60')
    assert.equal(await page.getByRole('button', { name: /^Save · / }).innerText(), 'Save · 60 kcal')
    await shot('edit-later', page.getByRole('dialog').last())
    await page.getByRole('button', { name: 'Increase amount' }).click()
    assert.equal(await page.getByTestId('qty').innerText(), '2 pieces (16 g)')
    await page.keyboard.press('Escape'); await page.waitForTimeout(400)
    if (await dialog.count()) await page.keyboard.press('Escape')
    await dialog.waitFor({ state: 'detached' }).catch(() => {})
    assert.equal((await st()).entries.find((e) => e.name === LONG).qty, 1.5, 'closing without Save writes nothing')
  })

  await step(`${tag} 7: items saved before this release open as they did (grams label, qty 1) and scale from there`, async () => {
    await page.goto(BASE + '/'); await page.getByTestId('eaten').waitFor()
    const before = JSON.stringify((await st()).entries.filter((e) => e.id === 'o1' || e.id === 'o2'))
    assert.equal(before, JSON.stringify(entries), 'old entries untouched')
    for (const [n, amount, k, up] of [['Bubur kacang', '160 g', '267', '320 g'], ['Tahu isi', '1 piece (120 g)', '330', '2 pieces (240 g)']]) {
      await page.getByRole('button', { name: new RegExp(`^Edit ${n},`) }).click(); await dialog.waitFor(); await page.waitForTimeout(350)
      assert.equal(await dialog.getByTestId('qty').innerText(), amount, n)
      assert.equal(await dialog.locator('input[name=kcal]').inputValue(), k)
      await dialog.getByRole('button', { name: 'Increase amount' }).click()
      assert.equal(await dialog.getByTestId('qty').innerText(), up)
      await page.keyboard.press('Escape'); await dialog.waitFor({ state: 'detached' })
    }
    assert.equal(JSON.stringify((await st()).entries.filter((e) => e.id === 'o1' || e.id === 'o2')), before)
  })

  await step(`${tag} Snap a photo leads to the same servings sheet`, async () => {
    await page.goto(BASE + '/log?meal=dinner'); await page.getByTestId('ai-cards').waitFor()
    await page.getByTestId('ai-card-snap').click()
    await page.getByTestId('photo-capture').setInputFiles(PLATE)
    await dialog.getByTestId('photo-added').waitFor()
    await dialog.getByRole('button', { name: /^Estimate$/ }).click()
    await item('Ayam goreng').waitFor()
    assert.equal(await dialog.getByTestId('photo-source').innerText(), 'Estimated from your photo')
    assert.equal(await dialog.getByTestId('row-stepper').count(), 4)
    assert.equal(await logBtn().innerText(), 'Log 4 items · 650 kcal')
    await item('Sambal').getByRole('button', { name: 'Remove Sambal' }).click()
    assert.equal(await logBtn().innerText(), 'Log 3 items · 620 kcal')
    await page.keyboard.press('Escape'); await dialog.waitFor({ state: 'detached' })
  })

  await step(`${tag} storage: v3 schema, :v2 :v1 :ai :foods byte-identical, no new keys`, async () => {
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
