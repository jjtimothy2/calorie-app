// v1.9 My foods: a named quick add saves (or updates, de-duped by name, case and spaces ignored) a food in a NEW key
// calorie-app:foods; calorie-app:v2 keeps its shape. Your foods show in Recent and Log search with a bookmark icon (v1.10, was a "Mine" tag; ids u_<id>)
// and log like any food. Edit and delete them from Log > My foods (v1.10.1, was a card in Me); past entries are kept. Old foodId:null entries still render.
// Backup export includes the key, import restores it (an older backup without it clears it), reset clears it.
// WebKit with touch at 390x844 and 375x667. Screenshots: screenshots/v19-*.png.
// Usage: npm run build && npx vite preview --port 4174 & node tests/v19-myfoods.mjs
import { webkit, devices } from 'playwright'
import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { STATE } from './v11-fixture.mjs'

const BASE = (process.env.BASE_URL ?? 'http://localhost:4174/calorie-app').replace(/\/$/, '')
const OUT = new URL('../screenshots/', import.meta.url).pathname
const FOODS = 'calorie-app:foods', V2 = 'calorie-app:v2', V3 = 'calorie-app:v3'
const results = [], errors = []
const step = async (name, fn) => {
  const t = Date.now()
  try { await fn(); results.push(`PASS ${name} (${Date.now() - t} ms)`) } catch (e) { results.push(`FAIL ${name}: ${e.message}`); console.log(results.join('\n')); throw e }
}

const browser = await webkit.launch()
for (const [width, height] of [[390, 844], [375, 667]]) {
  const tag = `${width}x${height}`
  const ctx = await browser.newContext({ ...devices['iPhone 14'], viewport: { width, height }, deviceScaleFactor: 3, serviceWorkers: 'block', acceptDownloads: true })
  await ctx.addInitScript((s) => {
    if (!localStorage.getItem('calorie-app:v1') && !localStorage.getItem('calorie-app:v2') && !sessionStorage.getItem('reset')) localStorage.setItem('calorie-app:v1', JSON.stringify(s))
  }, STATE)
  const page = await ctx.newPage()
  page.on('console', (m) => { if ((m.type() === 'error' || m.type() === 'warning') && !/Service Worker registration blocked|service worker/i.test(m.text())) errors.push(`${tag}: ${m.type()}: ${m.text()}`) })
  page.on('pageerror', (e) => errors.push(`${tag}: ${e.message}`))
  const shot = async (name) => { await page.waitForTimeout(350); await page.screenshot({ path: `${OUT}v19-${name}-${tag}.png` }) }
  const ls = (k) => page.evaluate((k) => JSON.parse(localStorage.getItem(k) ?? 'null'), k)
  const foods = async () => (await ls(FOODS))?.foods ?? []
  const mineEntries = async () => (await ls(V3)).entries.filter((e) => e.foodId?.startsWith('u_'))
  const dialog = page.getByRole('dialog')
  const quickAdd = async (kcal, name, protein) => {
    await page.getByTestId('qa-bar').getByRole('button', { name: 'Add Calories' }).click()
    await page.fill('input[name=kcal]', String(kcal))
    if (name != null) await page.fill('input[name=name]', name)
    if (protein != null) await dialog.getByLabel('Protein').fill(String(protein))
  }
  const toLog = async () => { await page.getByRole('button', { name: 'Log food' }).click(); await page.waitForURL('**/log**') }
  // v1.13.2: a log goes to Home and the snackbar shows there; back to Log for the next one.
  const landed = async () => { await page.waitForURL(BASE + '/'); await page.getByTestId('toast').waitFor(); await toLog() }
  const toHome = async () => { await page.goto(BASE + '/'); await page.getByTestId('eaten').waitFor() }
  const toMe = async () => { await page.goto(BASE + '/settings'); await page.getByRole('button', { name: 'Export backup' }).waitFor() }
  // v1.10.1: My foods is a chip on Log (was a card in Me).
  const toMine = async () => { await toHome(); await toLog(); await page.getByTestId('tab-mine').click(); await page.getByTestId('food-list').waitFor() }
  let v2Keys, foodId

  await step(`${tag} old entries (foodId null) render, no foods key until a food exists`, async () => {
    await toHome()
    for (const n of ['Greek yoghurt with berries', 'Chicken rice', 'Banana']) await page.getByRole('button', { name: new RegExp(`^Edit ${n}`) }).waitFor()
    assert.equal(await page.evaluate((k) => localStorage.getItem(k), FOODS), null)
    v2Keys = Object.keys(await ls(V3)).sort()
    await toMine()
    await page.getByTestId('myfoods-empty').waitFor()
  })

  await step(`${tag} unnamed quick add stays one-off`, async () => {
    await toHome(); await toLog()
    await quickAdd(120)
    assert.match(await page.getByTestId('qa-name-hint').innerText(), /Give it a name to save it to My foods/)
    await dialog.getByRole('button', { name: 'Add 120 kcal' }).click()
    await landed()
    assert.equal(await page.evaluate((k) => localStorage.getItem(k), FOODS), null)
    const last = (await ls(V3)).entries.at(-1)
    assert.equal(last.foodId, null); assert.equal(last.name, 'Quick add')
  })

  await step(`${tag} named quick add saves to calorie-app:foods; v2 keeps its shape`, async () => {
    await quickAdd(450, "Mum's nasi goreng", 14)
    assert.match(await page.getByTestId('qa-name-hint').innerText(), /Saved to My foods/)
    await shot('quickadd-name')
    await dialog.getByRole('button', { name: 'Add 450 kcal' }).click()
    await landed()
    const f = await foods()
    assert.equal(f.length, 1)
    assert.match(f[0].id, /^u_[\w-]+$/)
    assert.equal(f[0].name, "Mum's nasi goreng"); assert.equal(f[0].kcal, 450); assert.equal(f[0].protein, 14)
    assert.equal((await ls(FOODS)).version, 1)
    foodId = f[0].id
    const s = await ls(V3)
    assert.deepEqual(Object.keys(s).sort(), v2Keys)
    assert.equal(s.version, 3) // v1.13: state lives in calorie-app:v3 (migrated from the v2 seed)
    const e = s.entries.at(-1)
    assert.deepEqual(Object.keys(e).sort(), ['carbs', 'createdAt', 'date', 'fat', 'foodId', 'id', 'kcal', 'meal', 'name', 'protein', 'qty', 'servingLabel', 'servingMult'])
    assert.equal(e.foodId, foodId); assert.equal(e.kcal, 450); assert.equal(e.qty, 1)
  })

  await step(`${tag} de-dupe by name: case and spaces ignored, same id, latest numbers, first name kept`, async () => {
    await quickAdd(500, "  mum's   NASI goreng ")
    assert.match(await page.getByTestId('qa-name-hint').innerText(), /Updates Mum's nasi goreng in My foods/)
    await dialog.getByRole('button', { name: 'Add 500 kcal' }).click()
    await landed()
    const f = await foods()
    assert.equal(f.length, 1); assert.equal(f[0].id, foodId); assert.equal(f[0].kcal, 500); assert.equal(f[0].name, "Mum's nasi goreng")
    assert.equal((await ls(V3)).entries.at(-1).name, "Mum's nasi goreng")
    // A second food for the duplicate-name check later.
    await quickAdd(90, 'Es teh manis')
    await dialog.getByRole('button', { name: 'Add 90 kcal' }).click()
    await landed()
    assert.equal((await foods()).length, 2)
  })

  await step(`${tag} Recent shows your foods with the saved mark`, async () => {
    await toHome(); await toLog()
    await page.getByRole('group', { name: 'Food list' }).getByRole('button', { name: 'Recent' }).click()
    const row = page.getByRole('button', { name: /^Mum's nasi goreng, saved food, 1 serving, 500 kcal/ })
    await row.waitFor()
    assert.equal(await page.getByTestId('food-list').getByTestId('saved-mark').count(), 2)
    await shot('recent')
  })

  await step(`${tag} search shows the saved mark first; one tap and the sheet log it like a food`, async () => {
    await page.getByLabel('Search foods').fill('nasi gor')
    const list = page.getByTestId('food-list')
    const first = list.getByRole('listitem').first()
    // v1.10: a bookmark icon (aria-label Saved food), no Mine tag and no "your food" text.
    assert.match(await first.innerText(), /Mum's nasi goreng\s*1 serving/)
    assert.doesNotMatch(await first.innerText(), /Mine|your food/i)
    assert.equal(await first.getByRole('img', { name: 'Saved food' }).count(), 1)
    await shot('search-mine')
    const before = (await mineEntries()).length
    await first.getByRole('button', { name: /^Add one serving of Mum's nasi goreng/ }).click()
    await landed()
    await page.getByLabel('Search foods').fill('nasi gor')
    let m = await mineEntries()
    assert.equal(m.length, before + 1)
    assert.equal(m.at(-1).foodId, foodId); assert.equal(m.at(-1).kcal, 500); assert.equal(m.at(-1).servingLabel, '1 serving')
    await first.getByRole('button', { name: /^Mum's nasi goreng, saved food/ }).click()
    await dialog.getByTestId('saved-mark').waitFor()
    await dialog.getByRole('button', { name: 'Increase amount' }).click()
    await dialog.getByRole('button', { name: 'Add 1,000 kcal' }).click()
    await landed()
    m = await mineEntries()
    assert.equal(m.length, before + 2); assert.equal(m.at(-1).qty, 2); assert.equal(m.at(-1).kcal, 500)
  })

  await step(`${tag} Home: entries from your food render and edit their own numbers`, async () => {
    await toHome()
    const rows = page.getByRole('button', { name: /^Edit Mum's nasi goreng/ })
    assert.equal(await rows.count(), 4)
    assert.match(await rows.last().innerText(), /2 servings/)
    await rows.last().click()
    await dialog.getByTestId('saved-mark').waitFor()
    assert.equal(await page.inputValue('input[name=kcal]'), '1000')
    await page.fill('input[name=kcal]', '900')
    await dialog.getByRole('button', { name: 'Save' }).click()
    const e = (await mineEntries()).at(-1)
    assert.equal(e.qty, 2); assert.equal(e.kcal, 450); assert.equal(e.foodId, foodId)
    assert.equal((await foods()).find((f) => f.id === foodId).kcal, 500) // the food itself is untouched
  })

  await step(`${tag} My foods: edit a food (duplicate name refused), past entries unchanged`, async () => {
    await toMine()
    const card = page.getByTestId('food-list')
    assert.match(await card.innerText(), /Es teh manis[\s\S]*Mum's nasi goreng/) // newest first
    await card.getByRole('button', { name: "Edit Mum's nasi goreng" }).click()
    await page.fill('input[name=food-name]', ' es TEH manis ')
    await dialog.getByRole('button', { name: 'Save food' }).click()
    await dialog.getByTestId('myfood-error').waitFor()
    await page.fill('input[name=food-name]', 'Nasi goreng spesial')
    await page.fill('input[name=food-kcal]', '520')
    await shot('myfoods-edit')
    await dialog.getByRole('button', { name: 'Save food' }).click()
    await dialog.waitFor({ state: 'detached' })
    const f = (await foods()).find((x) => x.id === foodId)
    assert.equal(f.name, 'Nasi goreng spesial'); assert.equal(f.kcal, 520)
    const m = (await mineEntries()).filter((e) => e.foodId === foodId)
    assert.equal(m.length, 4)
    assert.ok(m.every((e) => e.name === "Mum's nasi goreng"))
    await card.getByText('Nasi goreng spesial').waitFor()
    await shot('myfoods')
  })

  let backupText
  await step(`${tag} backup export includes calorie-app:foods`, async () => {
    await toMe()
    const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export backup' }).click()])
    backupText = readFileSync(await dl.path(), 'utf8')
    const j = JSON.parse(backupText)
    assert.equal(j.data[FOODS].foods.length, 2)
    assert.ok(!('calorie-app:ai' in j.data))
  })

  await step(`${tag} My foods: delete a food, past entries kept and still render`, async () => {
    await toMine()
    await page.getByTestId('food-list').getByRole('button', { name: 'Delete Nasi goreng spesial' }).click()
    await dialog.getByTestId('myfood-delete-confirm').waitFor()
    await shot('myfoods-delete')
    await dialog.getByTestId('myfood-delete-confirm').click()
    await dialog.waitFor({ state: 'detached' })
    assert.deepEqual((await foods()).map((f) => f.name), ['Es teh manis'])
    assert.equal((await mineEntries()).filter((e) => e.foodId === foodId).length, 4)
    await toHome()
    assert.equal(await page.getByRole('button', { name: /^Edit Mum's nasi goreng/ }).count(), 4)
    // An orphaned entry still edits (as a plain quick add) and keeps its amount.
    await page.getByRole('button', { name: /^Edit Mum's nasi goreng/ }).last().click()
    assert.equal(await dialog.getByTestId('saved-mark').count(), 0)
    await dialog.getByRole('button', { name: 'Save' }).click()
    assert.equal((await mineEntries()).at(-1).qty, 2)
    // Gone from search.
    await toLog()
    await page.getByLabel('Search foods').fill('nasi goreng spesial')
    assert.equal(await page.getByTestId('food-list').getByTestId('saved-mark').count(), 0)
  })

  const importFile = async (text, name) => {
    const p = `/tmp/v19/${name}-${tag}.json`
    writeFileSync(p, text)
    await page.getByTestId('import-file').setInputFiles(p)
    await page.getByTestId('import-summary').waitFor()
    return page.getByTestId('import-summary').innerText()
  }
  await step(`${tag} backup import restores your foods; an older backup clears them`, async () => {
    await toMe()
    assert.match(await importFile(backupText, 'with-foods'), /2 saved foods/)
    await page.getByRole('button', { name: 'Replace my data' }).click()
    await page.waitForTimeout(300)
    assert.deepEqual((await foods()).map((f) => f.name).sort(), ['Es teh manis', 'Nasi goreng spesial'])
    await toMine()
    await page.getByTestId('food-list').getByText('Nasi goreng spesial').waitFor()
    await toMe()
    const old = JSON.parse(backupText); delete old.data[FOODS]
    assert.doesNotMatch(await importFile(JSON.stringify(old), 'no-foods'), /saved food/)
    await page.getByRole('button', { name: 'Replace my data' }).click()
    await page.waitForTimeout(300)
    assert.equal(await page.evaluate((k) => localStorage.getItem(k), FOODS), null)
    await toMine()
    await page.getByTestId('myfoods-empty').waitFor()
    // Entries from the backup (including ones from deleted foods) still render.
    await toHome()
    assert.equal(await page.getByRole('button', { name: /^Edit Mum's nasi goreng/ }).count(), 4)
  })

  await step(`${tag} reset all data clears your foods`, async () => {
    await page.evaluate((k) => localStorage.setItem(k, JSON.stringify({ version: 1, foods: [{ id: 'u_x', name: 'Temp', kcal: 10, protein: 0, carbs: 0, fat: 0, createdAt: 1, updatedAt: 1 }] })), FOODS)
    await page.reload(); await toMine()
    await page.getByTestId('food-list').getByText('Temp').waitFor()
    await toMe()
    await page.evaluate(() => sessionStorage.setItem('reset', '1'))
    page.once('dialog', (d) => d.accept())
    await page.getByRole('button', { name: 'Reset all data' }).click()
    await page.waitForURL('**/onboarding**')
    assert.equal(await page.evaluate((k) => localStorage.getItem(k), FOODS), null)
  })
  await ctx.close()
}
await browser.close()
results.push(errors.length ? `FAIL console: ${errors.join(' | ')}` : 'PASS no console errors or warnings')
console.log(results.join('\n'))
if (errors.length) process.exit(1)
