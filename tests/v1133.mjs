// v1.13.3: (1) opening an existing food or exercise entry to edit focuses no field (no iOS keyboard): the sheet itself
// takes focus (role=dialog, tabIndex -1), so keyboard and screen reader users land inside it and Escape closes it.
// New items still focus their field at once. (2) The AI group sheet has a meal pill (Log's cream pill, native picker)
// showing the group's meal; a change moves every item in one update, closes the sheet, and Home shows the group under
// the new meal with "Moved to X" and Undo for 5 s. The day total never changes, only meal subtotals; a closed past day
// keeps its baselines (v1.12). calorie-app:v3 stays the schema; :v2, :v1, :ai and :foods stay byte-identical.
// WebKit with touch at 390x844 and 375x667. Screenshots: screenshots/v1133-*.png.
// Usage: npm run build && npx vite preview --port 4174 & node tests/v1133.mjs
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
  quick('q2', TODAY, 'lunch', 'Es teh manis', 90, 7),
  ai('y1', YDAY, 'g2', 'Nasi putih', 267, 8), ai('y2', YDAY, 'g2', 'Rendang', 470, 9),
  quick('y3', YDAY, 'dinner', 'Soto ayam', 450, 10),
]
const exercises = [
  { id: 'x1', date: TODAY, activityId: 'badminton', name: 'Badminton', minutes: 30, intensity: 'moderate', kcal: 253, createdAt: T + 11 },
  { id: 'x2', date: TODAY, activityId: null, name: 'Watch workout', minutes: 30, intensity: 'moderate', kcal: 250, createdAt: T + 12 },
]
const V3 = JSON.stringify({ version: 3, profile, entries, exercises, closedDays: {}, favourites: [], weights: [{ date: ago(3), kg: 92 }] })
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
  page.on('pageerror', (er) => errors.push(`${tag}: pageerror: ${er.message}`))
  const dialog = page.getByRole('dialog')
  const shot = (name) => page.screenshot({ path: `${OUT}v1133-${name}-${tag}.png` })
  const st = () => page.evaluate(() => JSON.parse(localStorage.getItem('calorie-app:v3')))
  const home = async () => { await page.goto(BASE + '/'); await page.getByTestId('eaten').waitFor() }
  const focus = () => page.evaluate(() => {
    const a = document.activeElement, d = document.querySelector('[role=dialog]')
    return { tag: a?.tagName, isDialog: a === d, inside: !!d && d.contains(a), label: d?.getAttribute('aria-label') }
  })
  /** Open an edit sheet with `open`, then: no field focused, focus inside the dialog, Escape closes it. */
  const noField = async (name, open, { close = true, shotName } = {}) => {
    await open()
    await dialog.waitFor()
    await page.waitForTimeout(400) // past the sheet animation and any late focus
    const f = await focus()
    assert.ok(!['INPUT', 'TEXTAREA', 'SELECT'].includes(f.tag), `${name}: ${f.tag} focused`)
    assert.ok(f.inside, `${name}: focus is inside the sheet (${f.tag})`)
    if (shotName) await shot(shotName)
    if (close) { await page.keyboard.press('Escape'); await dialog.waitFor({ state: 'detached' }) }
    return f
  }
  const meal = (m) => page.getByTestId(`meal-${m}`)
  const subtotal = async (m) => { const t = await meal(m).locator('h2').innerText(); const x = t.match(/·\s*([\d,]+) kcal/i); return x ? Number(x[1].replace(',', '')) : 0 }
  const eaten = async () => (await page.getByTestId('eaten').innerText()).replace(/\D/g, '')

  await step(`${tag} edit sheets open with no field focused (the sheet has focus; Escape closes): quick add, catalogue food, My food entry and Edit food, AI item, exercise, quick burn`, async () => {
    await home()
    const qa = await noField('quick add', () => page.getByRole('button', { name: /^Edit Kopi susu/ }).click(), { shotName: 'edit-no-focus' })
    assert.ok(qa.isDialog, 'the dialog itself is focused')
    await noField('catalogue food', () => page.getByRole('button', { name: /^Edit Tempe goreng/ }).click())
    await noField('My food entry', () => page.getByRole('button', { name: /^Edit Bubur ayam/ }).click(), { close: false })
    await page.getByTestId('myfood-edit').click()
    await dialog.getByRole('heading', { name: 'Edit food' }).waitFor()
    await page.waitForTimeout(400)
    const ef = await focus()
    assert.ok(!['INPUT', 'TEXTAREA', 'SELECT'].includes(ef.tag) && ef.inside, `Edit food: ${ef.tag}`)
    await page.keyboard.press('Escape'); await page.waitForTimeout(300)
    if (await dialog.count()) { await page.keyboard.press('Escape'); await dialog.waitFor({ state: 'detached' }) }
    await page.getByTestId('ai-group-row').click()
    await page.getByTestId('ai-group-sheet').waitFor()
    await noField('AI item', () => page.getByRole('button', { name: /^Edit Ayam goreng/ }).click(), { close: false })
    await page.keyboard.press('Escape'); await page.waitForTimeout(300)
    while (await dialog.count()) { await page.keyboard.press('Escape'); await page.waitForTimeout(300) }
    await noField('exercise', () => page.getByRole('button', { name: /^Edit Badminton/ }).click())
    await noField('quick burn', () => page.getByRole('button', { name: /^Edit Watch workout/ }).click())
  })

  await step(`${tag} new items still focus their field at once: Add Calories (kcal) and Quick add burn (burn)`, async () => {
    await page.getByRole('link', { name: 'Add to Dinner' }).click()
    await page.getByTestId('qa-btn').click(); await dialog.waitFor(); await page.waitForTimeout(200)
    assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('name')), 'kcal')
    await page.keyboard.press('Escape'); await dialog.waitFor({ state: 'detached' })
    await page.goto(BASE + '/log?mode=exercise')
    await page.getByTestId('qa-bar').getByRole('button', { name: 'Quick add burn' }).click(); await dialog.waitFor(); await page.waitForTimeout(200)
    assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('name')), 'burn')
  })

  await step(`${tag} AI group sheet: cream meal pill shows Lunch; moving to Dinner moves all 3 items in one update, Home shows the group under Dinner, day total unchanged`, async () => {
    await home()
    const before = { eaten: await eaten(), lunch: await subtotal('lunch'), dinner: await subtotal('dinner') }
    assert.deepEqual(before, { eaten: before.eaten, lunch: 687, dinner: 0 })
    await page.getByTestId('ai-group-row').click()
    const sheet = page.getByTestId('ai-group-sheet'); await sheet.waitFor()
    const pill = sheet.getByTestId('group-meal-pill')
    assert.equal(await sheet.getByTestId('group-meal').inputValue(), 'lunch')
    assert.equal(await pill.innerText(), 'Lunch')
    const look = await pill.evaluate((el) => { const s = getComputedStyle(el); return { h: el.getBoundingClientRect().height, bg: s.backgroundColor, r: s.borderTopLeftRadius } })
    assert.equal(look.h, 44); assert.ok(parseFloat(look.r) >= 22, 'fully rounded')
    await page.waitForTimeout(400)
    await shot('group-meal-picker')
    // One state update: count localStorage writes of the v3 key during the move.
    await page.evaluate(() => { const o = Storage.prototype.setItem; window.__w = 0; Storage.prototype.setItem = function (k, v) { if (k === 'calorie-app:v3') window.__w++; return o.call(this, k, v) } })
    await sheet.getByTestId('group-meal').selectOption('dinner')
    await sheet.waitFor({ state: 'detached' })
    const toast = page.getByTestId('toast'); await toast.waitFor()
    const t0 = Date.now()
    assert.match(await toast.innerText(), /^Moved to Dinner\s*Undo$/)
    assert.equal(await page.evaluate(() => window.__w), 1, 'one write: all items moved in one update')
    const s = await st()
    assert.deepEqual(s.entries.filter((e) => e.groupId === 'g1').map((e) => e.meal), ['dinner', 'dinner', 'dinner'])
    assert.equal(s.entries.find((e) => e.id === 'q2').meal, 'lunch', 'other lunch items stay')
    assert.equal(await meal('dinner').getByTestId('ai-group-row').count(), 1, 'the group row is under Dinner')
    assert.equal(await meal('lunch').getByTestId('ai-group-row').count(), 0)
    assert.equal(await eaten(), before.eaten, 'day total unchanged')
    assert.deepEqual([await subtotal('lunch'), await subtotal('dinner')], [90, 597])
    assert.equal(await page.locator('.row-flash').getAttribute('data-ids'), 'a1 a2 a3', 'moved group highlighted')
    await page.waitForTimeout(900)
    await shot('home-after-move')
    await page.waitForTimeout(Math.max(0, 4300 - (Date.now() - t0)))
    assert.ok(await toast.isVisible(), 'snackbar up at 4.3 s')
    await toast.waitFor({ state: 'detached', timeout: 1800 })
  })

  await step(`${tag} the move persists after reload; Undo puts every item back in its previous meal`, async () => {
    await page.reload(); await page.getByTestId('eaten').waitFor()
    assert.equal(await meal('dinner').getByTestId('ai-group-row').count(), 1, 'still under Dinner after reload')
    // Mixed meals inside one group (an item edited elsewhere): Undo restores each item's own meal.
    await page.getByTestId('ai-group-row').click()
    await page.getByRole('button', { name: /^Edit Sambal/ }).click()
    await dialog.getByRole('button', { name: 'Snacks', exact: true }).click()
    await dialog.getByRole('button', { name: 'Save' }).click()
    await page.waitForTimeout(300)
    while (await dialog.count()) { await page.keyboard.press('Escape'); await page.waitForTimeout(300) }
    const total = await eaten()
    await page.getByTestId('meal-dinner').getByTestId('ai-group-row').click()
    const sheet = page.getByTestId('ai-group-sheet'); await sheet.waitFor()
    await sheet.getByTestId('group-meal').selectOption('breakfast')
    await page.getByTestId('toast').waitFor()
    // Every item with the groupId moves, the one edited into Snacks too, so the group is whole again.
    assert.deepEqual((await st()).entries.filter((e) => e.groupId === 'g1').map((e) => e.meal), ['breakfast', 'breakfast', 'breakfast'])
    assert.equal(await meal('breakfast').getByTestId('ai-group-row').count(), 1)
    await page.getByTestId('toast').getByRole('button', { name: 'Undo' }).click()
    await page.getByTestId('toast').waitFor({ state: 'detached' })
    assert.deepEqual((await st()).entries.filter((e) => e.groupId === 'g1').map((e) => [e.id, e.meal]), [['a1', 'dinner'], ['a2', 'dinner'], ['a3', 'snacks']])
    assert.equal(await page.locator('.row-flash').count(), 0, 'Undo clears the highlight')
    assert.equal(await eaten(), total)
    await page.reload(); await page.getByTestId('eaten').waitFor()
    assert.deepEqual((await st()).entries.filter((e) => e.groupId === 'g1').map((e) => e.meal), ['dinner', 'dinner', 'snacks'], 'Undo persisted')
  })

  await step(`${tag} past day (closed by the midnight rule): move the group to Dinner, baselines and totals unchanged, Undo works`, async () => {
    await home()
    const c0 = (await st()).closedDays[YDAY]
    assert.ok(c0, 'yesterday is closed')
    await page.getByTestId('day-prev').click()
    await page.waitForFunction(() => document.querySelector('#day-title')?.textContent === 'Yesterday')
    const e0 = await eaten()
    await page.getByTestId('ai-group-row').click()
    const sheet = page.getByTestId('ai-group-sheet'); await sheet.waitFor()
    assert.equal(await sheet.getByTestId('group-meal').inputValue(), 'lunch')
    await sheet.getByTestId('group-meal').selectOption('dinner')
    await page.getByTestId('toast').waitFor()
    assert.equal(await page.locator('#day-title').innerText(), 'Yesterday')
    const s = await st()
    assert.deepEqual(s.entries.filter((e) => e.groupId === 'g2').map((e) => [e.date, e.meal]), [[YDAY, 'dinner'], [YDAY, 'dinner']])
    assert.deepEqual(s.closedDays[YDAY], c0, 'closed summary unchanged (food totals the same)')
    assert.equal(await eaten(), e0)
    assert.deepEqual([await subtotal('lunch'), await subtotal('dinner')], [0, 1187])
    assert.equal(await meal('dinner').getByTestId('ai-group-row').count(), 1)
    await shot('home-after-move-past-day')
    await page.getByTestId('toast').getByRole('button', { name: 'Undo' }).click()
    assert.deepEqual((await st()).entries.filter((e) => e.groupId === 'g2').map((e) => e.meal), ['lunch', 'lunch'])
    assert.deepEqual((await st()).closedDays[YDAY], c0)
    await page.reload(); await page.getByTestId('eaten').waitFor()
    await page.getByTestId('back-to-today').click({ timeout: 1500 }).catch(() => {})
  })

  await step(`${tag} storage: v3 schema, :v2 :v1 :ai :foods byte-identical, no new keys`, async () => {
    const ls = await page.evaluate(() => Object.fromEntries(Object.keys(localStorage).map((k) => [k, localStorage.getItem(k)])))
    for (const [k, v] of Object.entries(FIXED)) assert.equal(ls[k], v, `${k} untouched`)
    assert.equal(JSON.parse(ls['calorie-app:v3']).version, 3)
    assert.deepEqual(Object.keys(ls).sort(), ['calorie-app:ai', 'calorie-app:backup', 'calorie-app:foods', 'calorie-app:v1', 'calorie-app:v2', 'calorie-app:v3'])
  })
  await ctx.close()
}
await browser.close()
console.log(results.join('\n'))
if (errors.length) { console.log(errors.join('\n')); process.exit(1) }
console.log(`\n${results.filter((r) => r.startsWith('PASS')).length} v1.13.3 checks passed, no console errors`)
