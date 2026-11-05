// v1.22 (Jordy, Reed's spec): "☆ Save to favourites" on the AI result sheet.
// 1. A quiet 44px row above Edit / Log N items. 2. It saves the whole result as ONE food in My foods and Favourites:
//    the dish name, the servings set now, the total kcal and macros (a single item saves under its own name).
// 3. The sheet stays open; the row turns '★ Saved' (orange); a snackbar above the footer for 4 s: 'Saved <dish> to My
//    foods and Favourites' with Undo. 4. Undo takes it out of both and puts the row back; calorie-app:foods and the
//    favourites come back exactly as before. 5. A food with the same name already in My foods is only starred (no
//    duplicate, its numbers untouched): 'Added <dish> to Favourites'; Undo only removes the star. 6. Log after saving
//    logs as before. 7. Servings changed after saving: the saved food keeps its snapshot and the row comes back; saving
//    again updates the food this sheet saved (same name, still one food). Schema stays v3; :v2 :v1 :ai byte-identical.
// Mocked Gemini (no network). WebKit at 390x844 and 375x667. Screenshots: screenshots/v122-*.png.
// Usage: npm run build && npx vite preview --port 4174 & node tests/v122.mjs
import { webkit, devices } from 'playwright'
import assert from 'node:assert/strict'
import { geminiOk } from './v15-fixture.mjs'

const BASE = (process.env.BASE_URL ?? 'http://localhost:4174/calorie-app').replace(/\/$/, '')
const OUT = new URL('../screenshots/', import.meta.url).pathname
const results = [], errors = []
const step = async (name, fn) => {
  try { await fn(); results.push(`PASS ${name}`) } catch (e) { results.push(`FAIL ${name}: ${e.message.slice(0, 800)}`); console.log(results.join('\n')); console.log(errors.join('\n')); throw e }
}
const pad = (n) => String(n).padStart(2, '0')
const key = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const ago = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return key(d) }
const profile = { age: 32, sex: 'male', heightCm: 175, weightKg: 92, activity: 'light', goal: 'lose', bmr: 1859, bmrCustom: false, includeMovement: false, goalWeightKg: 85, goalDate: ago(-120), planFrom: { date: ago(0), kg: 92 }, goalAssumed: false, macros: { protein: null, carbs: null, fat: null }, target: 1800, dailyGoal: 500 }
const V3 = JSON.stringify({ version: 3, profile, entries: [], exercises: [], closedDays: {}, favourites: ['nasi-goreng'], weights: [{ date: ago(0), kg: 92 }] })
const FIXED = {
  'calorie-app:v2': '{"version":2,"profile":null,"entries":[],"exercises":[],"closedDays":{},"favourites":[]}',
  'calorie-app:v1': '{"version":1,"entries":[]}',
  'calorie-app:ai': JSON.stringify({ provider: 'gemini', key: 'AIzaTEST-not-a-real-key-000000000000' }),
}
const DISH = 'Nasi ayam goreng'
const MULTI = {
  dish: DISH, scale_ref: '',
  items: [
    { name: 'Keripik tempe', portion: '1 piece', grams: 8, kcal: 40, protein_g: 2, carbs_g: 4, fat_g: 2.6, confidence: 'medium' },
    { name: 'Nasi putih', portion: '1 plate', grams: 150, kcal: 250, protein_g: 5, carbs_g: 55, fat_g: 1, confidence: 'high' },
    { name: 'Sambal', portion: '', grams: 15, kcal: 30, protein_g: 0.5, carbs_g: 2, fat_g: 2.3, confidence: 'high' },
    { name: 'Ayam goreng', portion: '1 thigh', grams: 120, kcal: 330, protein_g: 25, carbs_g: 5, fat_g: 23, confidence: 'medium' },
  ],
}
const SINGLE = { dish: 'Soto ayam bowl', scale_ref: '', items: [{ name: 'Soto ayam', portion: '1 bowl', grams: 350, kcal: 310, protein_g: 22, carbs_g: 24, fat_g: 13.5, confidence: 'high' }] }
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET, POST, OPTIONS' }
const ORANGE = 'rgb(194, 84, 47)' // --color-over-ink

const browser = await webkit.launch()
for (const [w, h] of [[390, 844], [375, 667]]) {
  const tag = `${w}x${h}`
  const ctx = await browser.newContext({ ...devices['iPhone 14'], viewport: { width: w, height: h }, deviceScaleFactor: 3, hasTouch: true, isMobile: true, serviceWorkers: 'block' })
  let est = MULTI
  await ctx.route('https://generativelanguage.googleapis.com/**', (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS })
    return route.fulfill({ status: 200, contentType: 'application/json', headers: CORS, body: JSON.stringify(geminiOk(est)) })
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
  const shot = async (name, v = 'v122') => { await logBtn().scrollIntoViewIfNeeded(); await page.waitForTimeout(300); await page.screenshot({ path: `${OUT}${v}-${name}-${tag}.png` }) }
  const totalBox = () => dialog.getByTestId('photo-total').locator('xpath=../..').boundingBox()
  const overlaps = (a, b) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height
  const raw = (k) => page.evaluate((k) => localStorage.getItem(k), k)
  const st = async () => JSON.parse(await raw('calorie-app:v3'))
  const foods = async () => { const r = await raw('calorie-app:foods'); return r === null ? null : JSON.parse(r).foods }
  const untouched = async () => { for (const [k, v] of Object.entries(FIXED)) assert.equal(await raw(k), v, `${k} byte-identical`) }
  const row = () => dialog.getByTestId('save-fav')
  const toast = () => dialog.getByTestId('fav-toast')
  const logBtn = () => dialog.getByRole('button', { name: /^Log \d+ items?/ })
  const item = (n) => dialog.getByRole('list', { name: 'Estimated items' }).getByRole('listitem').filter({ hasText: n })
  const rowText = async () => (await row().innerText()).replace(/\s+/g, ' ').trim()
  const describe = async (e) => {
    est = e
    await page.goto(BASE + '/log?meal=lunch'); await page.getByRole('searchbox', { name: 'Search foods' }).waitFor()
    await page.getByTestId('ai-btn').click(); await page.getByTestId('menu-type').click()
    await dialog.getByRole('textbox', { name: 'What did you eat?' }).fill('lunch')
    await dialog.getByRole('button', { name: /^Estimate$/ }).click()
    await item(e.items[e.items.length - 1].name).waitFor(); await page.waitForTimeout(450)
  }

  let base = '', slot = null
  await step(`${tag} 1: a quiet 44px '☆ Save to favourites' row sits above Edit / Log N items`, async () => {
    await describe(MULTI)
    assert.equal(await raw('calorie-app:foods'), null, 'no :foods yet')
    base = await raw('calorie-app:v3')
    assert.equal(await rowText(), '☆ Save to favourites')
    assert.equal(await dialog.getByRole('button', { name: 'Save to favourites' }).count(), 1, 'accessible name')
    const b = await row().boundingBox(), l = await logBtn().boundingBox(), e = await dialog.getByRole('button', { name: /^Edit/ }).boundingBox()
    assert.ok(b.height >= 44, `44px tap target (${b.height})`)
    assert.ok(b.y + b.height <= Math.min(l.y, e.y) + 1, 'above the footer buttons')
    assert.equal(await toast().count(), 0)
    slot = { ...b, gap: l.y - (b.y + b.height) }
    await shot('before-save'); await shot('snack-before', 'v1221')
  })

  await step(`${tag} 2+3 (v1.22.1): tapping saves ONE food (dish name, totals) to My foods and Favourites; sheet stays open; the snackbar with Undo takes the save row's slot, never over Total; focus moves to Undo`, async () => {
    const before = await st()
    await row().click()
    assert.ok(await dialog.isVisible(), 'sheet stays open')
    await toast().waitFor()
    assert.equal(await row().count(), 0, 'the snackbar replaces the save row')
    assert.equal((await toast().innerText()).replace(/\s+/g, ' ').trim(), `Saved ${DISH} to My foods and Favourites Undo`)
    assert.equal(await toast().getAttribute('role'), 'status')
    const t = await toast().boundingBox(), l = await logBtn().boundingBox(), d = await dialog.boundingBox(), tot = await totalBox()
    const note = await dialog.getByText('Estimates are rough. Adjust before logging.').boundingBox()
    // In the row's slot: right under the "Estimates are rough" line and the same gap above the footer the row had.
    assert.ok(Math.abs(l.y - (t.y + t.height) - slot.gap) <= 7, `row's gap to the footer (${l.y - (t.y + t.height)} vs ${slot.gap})`)
    assert.ok(t.y >= note.y + note.height && t.y - (note.y + note.height) <= 16, `right under the estimate note (${t.y - (note.y + note.height)})`)
    assert.ok(t.y + t.height <= l.y + 1, 'above the footer')
    assert.ok(!overlaps(t, tot), 'does not overlap Total')
    assert.ok(t.y >= tot.y + tot.height, 'below Total')
    assert.ok(t.x >= d.x && t.x + t.width <= d.x + d.width + 1, 'inside the sheet')
    assert.ok(t.height >= 44, `44px tall (${t.height})`)
    assert.ok((await toast().getByRole('button', { name: 'Undo' }).boundingBox()).height >= 44, 'Undo 44px')
    assert.equal(await toast().getByRole('button', { name: 'Undo' }).evaluate((el) => el === document.activeElement), true, 'focus on Undo')
    const f = await foods()
    assert.equal(f.length, 1, 'one food for the whole result')
    assert.deepEqual({ ...f[0], id: undefined, createdAt: undefined, updatedAt: undefined }, { id: undefined, name: DISH, kcal: 650, protein: 32.5, carbs: 66, fat: 28.9, createdAt: undefined, updatedAt: undefined })
    assert.match(f[0].id, /^u_/)
    assert.deepEqual(Object.keys(f[0]).sort(), ['carbs', 'createdAt', 'fat', 'id', 'kcal', 'name', 'protein', 'updatedAt'])
    assert.equal(JSON.parse(await raw('calorie-app:foods')).version, 1)
    const s = await st()
    assert.equal(s.version, 3); assert.deepEqual(Object.keys(s), Object.keys(before), 'v3 shape unchanged')
    assert.deepEqual(s.favourites, ['nasi-goreng', f[0].id])
    assert.deepEqual(s.entries, [], 'nothing logged')
    await untouched()
    await shot('after-save'); await shot('snack-after', 'v1221')
  })

  await step(`${tag} 4: Undo removes it from My foods and Favourites, exactly as before; the row comes back with focus`, async () => {
    await toast().getByRole('button', { name: 'Undo' }).click()
    assert.equal(await toast().count(), 0)
    assert.equal(await rowText(), '☆ Save to favourites')
    assert.equal(await row().evaluate((el) => el === document.activeElement), true, 'focus back on the row')
    assert.equal(await raw('calorie-app:foods'), null, ':foods back to absent')
    assert.equal(await raw('calorie-app:v3'), base, 'v3 byte-identical to before')
    assert.ok(await dialog.isVisible())
    await untouched()
  })

  await step(`${tag} 3: the snackbar stays 4 s and goes; the row stays '★ Saved'`, async () => {
    await row().click(); await toast().waitFor()
    await page.waitForTimeout(3000); assert.equal(await toast().count(), 1, 'still there at 3 s')
    await page.waitForTimeout(1400); assert.equal(await toast().count(), 0, 'gone after 4 s')
    assert.equal(await rowText(), '★ Saved', "the row is back as '★ Saved'")
    assert.equal(await row().evaluate((el) => getComputedStyle(el).color), ORANGE)
    assert.equal(await row().getAttribute('aria-label'), 'Saved to favourites')
    assert.equal(await row().evaluate((el) => el === document.activeElement), true, 'focus back on the row')
    const b = await row().boundingBox(), l = await logBtn().boundingBox(); assert.ok(Math.abs(l.y - (b.y + b.height) - slot.gap) <= 1 && b.height >= 44, 'same slot, 44px')
    await shot('snack-gone', 'v1221')
    assert.equal((await foods()).length, 1)
  })

  await step(`${tag} 7: changing servings after saving keeps the snapshot; the row comes back; saving again updates the same food (no duplicate); Undo puts the snapshot back`, async () => {
    const [snap] = await foods()
    await item('Nasi putih').getByRole('button', { name: 'More Nasi putih' }).click()
    assert.equal(await rowText(), '☆ Save to favourites', 'row back')
    assert.deepEqual(await foods(), [snap], 'saved food unchanged')
    const raw1 = await raw('calorie-app:foods'), v1 = await raw('calorie-app:v3')
    await row().click(); await toast().waitFor()
    assert.equal((await toast().innerText()).replace(/\s+/g, ' ').trim(), `Saved ${DISH} to My foods and Favourites Undo`)
    const f = await foods()
    assert.equal(f.length, 1, 'still one food')
    assert.equal(f[0].id, snap.id, 'same food')
    assert.deepEqual([f[0].kcal, f[0].protein, f[0].carbs, f[0].fat], [900, 37.5, 121, 29.9])
    assert.equal((await st()).favourites.filter((x) => x === snap.id).length, 1, 'starred once')
    await toast().getByRole('button', { name: 'Undo' }).click()
    assert.equal(await raw('calorie-app:foods'), raw1, 'snapshot back byte for byte')
    assert.equal(await raw('calorie-app:v3'), v1, 'still starred')
    assert.equal(await rowText(), '☆ Save to favourites')
    await item('Nasi putih').getByRole('button', { name: 'Less Nasi putih' }).click()
  })

  await step(`${tag} 6: Log N items after saving logs exactly as before`, async () => {
    await row().click()
    const n = (await st()).entries.length
    assert.equal(await logBtn().innerText(), 'Log 4 items · 650 kcal')
    await logBtn().click()
    await dialog.waitFor({ state: 'detached' })
    const s = await st()
    const added = s.entries.slice(n)
    assert.deepEqual(added.map((e) => [e.name, e.kcal, e.qty, e.source, e.meal, e.foodId]).sort(), [
      ['Ayam goreng', 330, 1, 'photo', 'lunch', null], ['Keripik tempe', 40, 1, 'photo', 'lunch', null],
      ['Nasi putih', 250, 1, 'photo', 'lunch', null], ['Sambal', 30, 1, 'photo', 'lunch', null]].sort())
    assert.equal((await foods()).length, 1, 'the saved food stays')
    await untouched()
  })

  await step(`${tag} 5: a food with the same name already in My foods is only starred: no duplicate, numbers untouched; Undo only removes the star`, async () => {
    const mine = JSON.stringify({ version: 1, foods: [{ id: 'u_mine', name: 'nasi AYAM goreng', kcal: 500, protein: 20, carbs: 60, fat: 15, createdAt: 1, updatedAt: 1 }] })
    const v3 = JSON.stringify({ ...JSON.parse(V3), entries: [] })
    await page.evaluate(([m, v]) => { localStorage.setItem('calorie-app:foods', m); localStorage.setItem('calorie-app:v3', v) }, [mine, v3])
    await describe(MULTI)
    const v3b = await raw('calorie-app:v3')
    assert.equal(await rowText(), '☆ Save to favourites')
    await row().click(); await toast().waitFor()
    assert.equal((await toast().innerText()).replace(/\s+/g, ' ').trim(), 'Added nasi AYAM goreng to Favourites Undo')
    assert.equal(await row().count(), 0, 'snackbar in the row slot')
    assert.equal(await raw('calorie-app:foods'), mine, ':foods byte-identical (no duplicate, no update)')
    assert.deepEqual((await st()).favourites, ['nasi-goreng', 'u_mine'])
    await toast().getByRole('button', { name: 'Undo' }).click()
    assert.equal(await raw('calorie-app:foods'), mine)
    assert.equal(await raw('calorie-app:v3'), v3b, 'only the star removed, exact earlier state')
    assert.equal(await rowText(), '☆ Save to favourites')
    // Already starred too: nothing to change; Undo leaves it starred.
    const starred = JSON.stringify({ ...JSON.parse(v3b), favourites: ['u_mine'] })
    await page.evaluate((v) => localStorage.setItem('calorie-app:v3', v), starred)
    await describe(MULTI)
    await row().click(); await toast().waitFor()
    assert.equal(await raw('calorie-app:foods'), mine); assert.equal(await raw('calorie-app:v3'), starred)
    await toast().getByRole('button', { name: 'Undo' }).click()
    assert.equal(await raw('calorie-app:v3'), starred, 'a star that was already there stays')
    await untouched()
  })

  await step(`${tag} 2: a single-item result saves under the item's name at its current servings`, async () => {
    await page.evaluate((v) => { localStorage.removeItem('calorie-app:foods'); localStorage.setItem('calorie-app:v3', v) }, V3)
    await describe(SINGLE)
    await item('Soto ayam').getByRole('button', { name: 'More Soto ayam' }).click()
    await row().click(); await toast().waitFor()
    assert.equal((await toast().innerText()).replace(/\s+/g, ' ').trim(), 'Saved Soto ayam to My foods and Favourites Undo')
    const f = await foods()
    assert.deepEqual([f.length, f[0].name, f[0].kcal, f[0].protein, f[0].carbs, f[0].fat], [1, 'Soto ayam', 620, 44, 48, 27])
    assert.ok(await dialog.isVisible())
  })

  await step(`${tag} reduced motion: the snackbar shows with no animation`, async () => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.evaluate((v) => { localStorage.removeItem('calorie-app:foods'); localStorage.setItem('calorie-app:v3', v) }, V3)
    await describe(MULTI)
    await row().click(); await toast().waitFor()
    assert.equal(await toast().evaluate((el) => getComputedStyle(el).animationName), 'none')
    await page.emulateMedia({ reducedMotion: 'no-preference' })
  })
  await ctx.close()
}
await browser.close()
console.log(results.join('\n'))
if (errors.length) { console.log(errors.join('\n')); process.exit(1) }
