// v1.10.1: (1) "+ Add item" in the AI breakdown sheet, and on a single AI item (it becomes a group). (2) Saved foods
// can be favourites; deleting one drops it from favourites. (3) Tap the amount to type servings on the decimal keypad
// ("1,5" works; above 0; rounded to 2 places). (4) A My foods chip on Log with New food (Save, nothing logged) and
// edit/delete per row, "Save to my foods" next to No match; the My foods card left Me. (5) Install hint on the welcome
// screen (iOS wording, Install button from beforeinstallprompt, menu fallback), hidden when standalone. (6) Gemini key
// help: "Don't have a key? Get one free here", only "here" linked.
// WebKit with touch at 390x844 and 375x667. Screenshots: screenshots/v1101-*.png.
// Usage: npm run build && npx vite preview --port 4174 & node tests/v1101.mjs
import { webkit, devices } from 'playwright'
import assert from 'node:assert/strict'
import { STATE } from './v11-fixture.mjs'

const BASE = (process.env.BASE_URL ?? 'http://localhost:4174/calorie-app').replace(/\/$/, '')
const OUT = new URL('../screenshots/', import.meta.url).pathname
const V2 = 'calorie-app:v2', FOODS = 'calorie-app:foods'
const AI = JSON.stringify({ provider: 'gemini', key: 'AIzaTEST-not-a-real-key-000000000000' })
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36'
const results = [], errors = []
const step = async (name, fn) => {
  const t = Date.now()
  try { await fn(); results.push(`PASS ${name} (${Date.now() - t} ms)`) } catch (e) { results.push(`FAIL ${name}: ${e.message}`); console.log(results.join('\n')); throw e }
}
const num = async (loc) => Number((await loc.innerText()).replace(/[^0-9]/g, ''))
const tall = async (loc, what) => { const b = await loc.boundingBox(); assert.ok(b && b.height >= 44 && b.width >= 44, `${what} is a 44 px target (${b && Math.round(b.width)}x${b && Math.round(b.height)})`) }
const noSideways = async (pg, what) => { const r = await pg.evaluate(() => [document.documentElement.scrollWidth, innerWidth]); assert.ok(r[0] <= r[1], `${what}: ${r[0]}px wide at ${r[1]}`) }
const noDash = async (loc, what) => assert.doesNotMatch(await loc.innerText(), /\u2014/, `${what} has no em dash`)
const tempe = { id: 'tempe-goreng', kcal: 88 }

const browser = await webkit.launch()
for (const [width, height] of [[390, 844], [375, 667]]) {
  const tag = `${width}x${height}`
  const newCtx = (init, extra = {}) => browser.newContext({ ...devices['iPhone 14'], viewport: { width, height }, deviceScaleFactor: 3, serviceWorkers: 'block', acceptDownloads: true, reducedMotion: 'reduce', ...extra }).then(async (c) => { for (const i of init ?? []) await c.addInitScript(...i); return c })
  const watchErrors = (page) => {
    page.on('console', (m) => { if ((m.type() === 'error' || m.type() === 'warning') && !/Service Worker registration blocked|service worker/i.test(m.text())) errors.push(`${tag}: ${m.type()}: ${m.text()}`) })
    page.on('pageerror', (e) => errors.push(`${tag}: ${e.message}`))
  }
  const shotOf = (pg) => async (name) => { await pg.waitForTimeout(300); await pg.screenshot({ path: `${OUT}v1101-${name}-${tag}.png` }) }

  // ---------- 5. Install hint on the welcome screen ----------
  await step(`${tag} welcome (iPhone): "Add to Home Screen" hint with Share wording, fits the screen`, async () => {
    const ctx = await newCtx(); const pg = await ctx.newPage(); watchErrors(pg)
    await pg.goto(BASE + '/'); const hint = pg.getByTestId('ob-install'); await hint.waitFor()
    assert.equal(await hint.getAttribute('data-kind'), 'ios')
    assert.match(await hint.innerText(), /Add to Home Screen[\s\S]*Tap Share, then Add to Home Screen\./)
    assert.equal(await pg.getByTestId('ob-install-btn').count(), 0)
    const [b, s] = await Promise.all([pg.getByTestId('ob-start').boundingBox(), pg.evaluate(() => [innerHeight, document.documentElement.scrollHeight])])
    assert.ok(b.y + b.height <= s[0] && s[1] <= s[0], `Get started on screen and no scroll (${Math.round(b.y + b.height)} / ${s[1]} / ${s[0]})`)
    const hb = await hint.boundingBox(); assert.ok(hb.y + hb.height <= b.y, 'hint sits above Get started')
    await noSideways(pg, 'welcome'); await noDash(pg.locator('body'), 'welcome')
    await shotOf(pg)('welcome-install')
    await ctx.close()
  })
  await step(`${tag} welcome (Android): beforeinstallprompt gives an Install button (44 px) that opens the prompt, then the hint goes`, async () => {
    const ctx = await newCtx([], { userAgent: ANDROID, isMobile: true }); const pg = await ctx.newPage(); watchErrors(pg)
    await pg.goto(BASE + '/'); const hint = pg.getByTestId('ob-install'); await hint.waitFor()
    assert.equal(await hint.getAttribute('data-kind'), 'menu')
    assert.match(await hint.innerText(), /Open your browser menu, then Install app or Add to Home screen\./)
    await pg.evaluate(() => {
      const ev = new Event('beforeinstallprompt', { cancelable: true })
      ev.prompt = () => { window.__prompted = (window.__prompted ?? 0) + 1; return Promise.resolve() }
      ev.userChoice = Promise.resolve({ outcome: 'accepted', platform: 'web' })
      window.dispatchEvent(ev)
    })
    await pg.waitForFunction(() => document.querySelector('[data-testid=ob-install]')?.getAttribute('data-kind') === 'prompt')
    assert.match(await hint.innerText(), /Install the app[\s\S]*Opens full screen and works offline\./)
    const btn = pg.getByTestId('ob-install-btn'); await tall(btn, 'Install button')
    await btn.click()
    await pg.waitForFunction(() => window.__prompted === 1)
    await hint.waitFor({ state: 'detached' })
    await ctx.close()
  })
  await step(`${tag} welcome: hint hidden when the app runs standalone (iOS navigator.standalone, display-mode)`, async () => {
    for (const init of [
      [() => Object.defineProperty(navigator, 'standalone', { get: () => true })],
      [() => { const mm = window.matchMedia.bind(window); window.matchMedia = (q) => /display-mode:\s*standalone/.test(q) ? { matches: true, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} } : mm(q) }],
    ]) {
      const ctx = await newCtx([init]); const pg = await ctx.newPage(); watchErrors(pg)
      await pg.goto(BASE + '/'); await pg.getByTestId('ob-start').waitFor()
      assert.equal(await pg.getByTestId('ob-install').count(), 0)
      await ctx.close()
    }
  })

  // ---------- the rest share one profile ----------
  const ctx = await newCtx([[([s, ai]) => {
    if (!localStorage.getItem('calorie-app:v1') && !localStorage.getItem('calorie-app:v2')) localStorage.setItem('calorie-app:v1', JSON.stringify({ ...s, favourites: ['tempe-goreng', 'u_gone'] }))
    if (!localStorage.getItem('calorie-app:ai')) localStorage.setItem('calorie-app:ai', ai)
  }, [STATE, AI]]])
  const page = await ctx.newPage(); watchErrors(page)
  const shot = shotOf(page)
  const dialog = page.getByRole('dialog')
  const ls = (k) => page.evaluate((k) => JSON.parse(localStorage.getItem(k) ?? 'null'), k)
  const toHome = async () => { await page.goto(BASE + '/'); await page.getByTestId('eaten').waitFor() }
  const toLog = async () => { await page.getByRole('button', { name: 'Log food' }).click(); await page.waitForURL('**/log**') }
  const toMine = async () => { await toHome(); await toLog(); await page.getByTestId('tab-mine').click(); await page.getByTestId('food-list').waitFor() }
  const list = page.getByTestId('food-list')
  const toastGone = () => page.getByTestId('toast').waitFor({ state: 'detached', timeout: 8000 })

  // ---------- 6. Gemini key link ----------
  await step(`${tag} AI key: "Don't have a key? Get one free here", only "here" links to AI Studio in a new tab`, async () => {
    await toHome(); await page.goto(BASE + '/settings')
    const help = page.getByTestId('ai-key-help'); await help.waitFor()
    assert.equal((await help.innerText()).replace(/\s+/g, ' ').trim(), "Don't have a key? Get one free here")
    const a = help.locator('a'); assert.equal(await a.count(), 1)
    assert.equal((await a.innerText()).trim(), 'here')
    assert.deepEqual([await a.getAttribute('href'), await a.getAttribute('target'), await a.getAttribute('rel')], ['https://aistudio.google.com/apikey', '_blank', 'noopener'])
    const b = await a.boundingBox(); assert.ok(b.height >= 44, `link tap area ${Math.round(b.height)}px tall`)
    await noSideways(page, 'Me'); await noDash(page.locator('body'), 'Me')
    await page.getByTestId('ai-key').evaluate((el) => el.closest('.scroll-mt-4').scrollIntoView({ block: 'start' }))
    await shot('key-setup')
    await page.getByRole('group', { name: 'AI provider' }).getByRole('button', { name: 'OpenAI' }).click()
    assert.equal(await page.getByTestId('ai-key-help').count(), 0)
    await page.getByRole('group', { name: 'AI provider' }).getByRole('button', { name: 'Gemini' }).click()
    await help.waitFor()
  })
  await step(`${tag} Me has no My foods card any more`, async () => {
    assert.equal(await page.getByTestId('myfoods-card').count(), 0)
    assert.equal(await page.getByRole('heading', { name: 'My foods' }).count(), 0)
  })

  // ---------- 4. My foods chip, New food, Save to my foods ----------
  await step(`${tag} Log: My foods chip between Favourites and All foods, empty state, New food button 44 px`, async () => {
    await toMine()
    const chips = await page.getByRole('group', { name: 'Food list' }).getByRole('button').allInnerTexts()
    assert.deepEqual(chips.map((c) => c.trim()), ['Recent', 'Favourites', 'My foods', 'All foods'])
    const ys = await page.getByRole('group', { name: 'Food list' }).getByRole('button').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().top))
    assert.ok(new Set(ys.map(Math.round)).size === 1, `chips on one line (${ys.join(',')})`)
    const row = await page.getByTestId('food-tabs').evaluate((el) => [el.scrollWidth, el.clientWidth, getComputedStyle(el).overflowX])
    assert.ok(row[2] === 'auto' && row[0] >= row[1], `chip row scrolls sideways (${row})`)
    for (const c of await page.getByRole('group', { name: 'Food list' }).getByRole('button').all()) await tall(c, 'chip')
    assert.equal(await page.getByTestId('tab-mine').getAttribute('aria-pressed'), 'true')
    await page.getByTestId('myfoods-empty').waitFor()
    await tall(page.getByTestId('myfoods-new'), 'New food')
    await noSideways(page, 'Log My foods')
  })
  await step(`${tag} New food: name first, Save, nothing logged, food listed with edit and delete`, async () => {
    const before = (await ls(V2)).entries.length
    await page.getByTestId('myfoods-new').click()
    const form = page.getByTestId('newfood-form'); await form.waitFor()
    assert.match(await dialog.innerText(), /New food/)
    assert.match(await page.getByTestId('qa-name-hint').innerText(), /Saved to My foods\. Nothing is logged\./)
    assert.equal(await dialog.getByRole('group', { name: 'Meal' }).count(), 0)
    const save = page.getByTestId('newfood-save')
    assert.equal((await save.innerText()).trim(), 'Save'); assert.ok(await save.isDisabled())
    const names = await form.locator('input').evaluateAll((els) => els.map((e) => e.name))
    assert.equal(names[0], 'name')
    await page.fill('input[name=name]', 'Bubur ayam'); await page.fill('input[name=kcal]', '320'); await dialog.getByLabel('Protein').fill('12')
    await tall(save, 'Save'); await noDash(dialog, 'New food form')
    await page.locator('input[name=name]').blur()
    await shot('newfood-form')
    await save.click(); await dialog.waitFor({ state: 'detached' })
    assert.equal((await ls(V2)).entries.length, before, 'nothing logged')
    const f = (await ls(FOODS)).foods ?? (await ls(FOODS))
    const arr = Array.isArray(f) ? f : f.foods
    assert.ok(arr.some((x) => x.name === 'Bubur ayam' && x.kcal === 320 && x.protein === 12), 'saved to calorie-app:foods')
    const row = list.getByRole('listitem').filter({ hasText: 'Bubur ayam' })
    await row.getByRole('img', { name: 'Saved food' }).waitFor()
    await tall(row.getByTestId('myfood-row-edit'), 'row edit'); await tall(row.getByTestId('myfood-row-delete'), 'row delete')
  })
  await step(`${tag} No match: "Save to my foods" opens New food with the search text, then it shows in search`, async () => {
    await page.getByRole('group', { name: 'Food list' }).getByRole('button', { name: 'All foods' }).click()
    await page.getByLabel('Search foods').fill('Soto betawi spesial')
    const empty = page.getByTestId('list-empty'); await empty.waitFor()
    assert.match(await empty.innerText(), /No match\.\s*Save to my foods\s*or\s*Add Calories/)
    await tall(page.getByTestId('save-to-mine'), 'Save to my foods')
    await page.getByTestId('save-to-mine').click()
    await page.getByTestId('newfood-form').waitFor()
    assert.equal(await page.locator('input[name=name]').inputValue(), 'Soto betawi spesial')
    await page.fill('input[name=kcal]', '410')
    await page.getByTestId('newfood-save').click(); await dialog.waitFor({ state: 'detached' })
    await list.getByRole('button', { name: /^Soto betawi spesial, saved food, 1 serving, 410 kcal/ }).waitFor()
    await page.getByLabel('Search foods').fill('')
  })
  await step(`${tag} edit a row in My foods (newest first), list shot with New food`, async () => {
    await page.getByTestId('tab-mine').click()
    assert.match(await list.innerText(), /Soto betawi spesial[\s\S]*Bubur ayam/)
    await list.getByRole('button', { name: 'Edit Bubur ayam' }).click()
    await page.getByTestId('myfood-form').waitFor()
    await page.fill('input[name=food-kcal]', '330')
    await dialog.getByRole('button', { name: 'Save food' }).click(); await dialog.waitFor({ state: 'detached' })
    await list.getByText('330').first().waitFor()
    await toastGone().catch(() => {})
    assert.equal(await page.getByTestId('toast').count(), 0)
    await shot('myfoods-list')
  })

  // ---------- 2. Favourite a saved food ----------
  await step(`${tag} favourite a saved food: star 44 px, Favourites lists it with the built-in favourite (dangling id skipped)`, async () => {
    await list.getByRole('button', { name: /^Bubur ayam, saved food/ }).click()
    const star = dialog.getByTestId('fav-star'); await star.waitFor(); await tall(star, 'star')
    assert.equal(await star.getAttribute('aria-pressed'), 'false')
    await star.click(); assert.equal(await star.getAttribute('aria-pressed'), 'true')
    assert.equal(await star.getAttribute('aria-label'), 'Remove from favourites')
    await page.keyboard.press('Escape'); await dialog.waitFor({ state: 'detached' })
    const favs = (await ls(V2)).favourites
    const id = (await page.evaluate((k) => { const v = JSON.parse(localStorage.getItem(k)); return (Array.isArray(v) ? v : v.foods).find((f) => f.name === 'Bubur ayam').id }, FOODS))
    assert.ok(favs.includes(id) && favs.includes(tempe.id), `favourites ${favs}`)
    await page.getByRole('group', { name: 'Food list' }).getByRole('button', { name: 'Favourites' }).click()
    assert.match(await list.innerText(), /Tempe goreng/)
    const row = list.getByRole('listitem').filter({ hasText: 'Bubur ayam' })
    await row.getByRole('img', { name: 'Saved food' }).waitFor()
    assert.equal(await list.getByRole('listitem').count(), 2, 'u_gone skipped')
    await noSideways(page, 'Favourites')
    await shot('favourites')
  })
  await step(`${tag} backup carries the saved-food favourite; deleting the food drops it from favourites`, async () => {
    await page.getByTestId('tab-mine').click()
    await list.getByRole('button', { name: 'Delete Bubur ayam' }).click()
    await dialog.getByTestId('myfood-delete-confirm').click(); await dialog.waitFor({ state: 'detached' })
    const favs = (await ls(V2)).favourites
    assert.ok(!favs.some((f) => f.startsWith('u_') && f !== 'u_gone') && favs.includes(tempe.id), `favourites ${favs}`)
    await page.getByRole('group', { name: 'Food list' }).getByRole('button', { name: 'Favourites' }).click()
    assert.doesNotMatch(await list.innerText(), /Bubur ayam/)
  })

  // ---------- 3. Typed servings ----------
  await step(`${tag} servings: tap the amount for a decimal keypad; "1,5" works, 0 and text are refused, 1.234 rounds`, async () => {
    await page.getByRole('group', { name: 'Food list' }).getByRole('button', { name: 'All foods' }).click()
    await page.getByLabel('Search foods').fill('tempe goreng')
    await list.getByRole('button', { name: /^Tempe goreng, 1 piece/ }).click()
    const edit = dialog.getByTestId('qty-edit'); await edit.waitFor(); await tall(edit, 'amount')
    assert.match(await edit.getAttribute('aria-label'), /Tap to type an amount/)
    await edit.click()
    const inp = dialog.getByTestId('qty-input'); await inp.waitFor()
    assert.deepEqual([await inp.getAttribute('inputmode'), await inp.getAttribute('aria-label')], ['decimal', 'Servings'])
    assert.ok(await inp.evaluate((el) => el === document.activeElement), 'focused')
    await inp.fill('1,5')
    assert.match(await dialog.innerText(), /× 1 piece/)
    await shot('servings-keypad')
    await inp.press('Enter')
    await dialog.getByRole('button', { name: `Add ${Math.round(tempe.kcal * 1.5)} kcal` }).waitFor()
    for (const bad of ['0', 'abc', '1..2', '-1']) {
      await edit.click(); await inp.fill(bad)
      await dialog.getByTestId('qty-err').waitFor()
      assert.match(await dialog.getByTestId('qty-err').innerText(), /Enter an amount above 0, like 1\.5 or 0\.75\./)
      await inp.press('Enter'); await dialog.getByRole('button', { name: `Add ${Math.round(tempe.kcal * 1.5)} kcal` }).waitFor()
    }
    await edit.click(); await inp.fill('1.234'); await inp.press('Enter')
    assert.match(await dialog.getByTestId('qty').innerText(), /1\.23/)
    await dialog.getByRole('button', { name: 'Increase amount' }).click(); assert.match(await dialog.getByTestId('qty').innerText(), /^2\b/)
    await edit.click(); await inp.fill('0.75'); await inp.press('Enter')
    await dialog.getByRole('button', { name: 'Increase amount' }).click(); assert.match(await dialog.getByTestId('qty').innerText(), /^1\b/)
    await dialog.getByRole('button', { name: 'Decrease amount' }).click(); assert.match(await dialog.getByTestId('qty').innerText(), /^0\.5\b/)
    await edit.click(); await inp.fill('0,75'); await inp.press('Enter')
    await dialog.getByRole('button', { name: `Add ${Math.round(tempe.kcal * 0.75)} kcal` }).click()
    await dialog.waitFor({ state: 'detached' })
    const e = (await ls(V2)).entries.at(-1)
    assert.deepEqual([e.foodId, e.qty], [tempe.id, 0.75])
    await page.getByLabel('Search foods').fill('')
  })

  // ---------- 1. Add item ----------
  let total
  await step(`${tag} breakdown sheet: "+ Add item" (44 px) adds a built-in food, a quick add and a saved food to the group`, async () => {
    await toHome()
    await page.evaluate(([k]) => {
      const s = JSON.parse(localStorage.getItem(k))
      const d = new Date(), today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      const t = Date.now()
      const ai = (id, name, kcal, extra = {}) => ({ id, date: today, meal: 'lunch', foodId: null, name, servingLabel: '100 g', servingMult: 1, qty: 1, kcal, protein: 5, carbs: 20, fat: 3, createdAt: t, source: 'photo', ...extra })
      const G = { groupId: 'g-test', groupName: 'Nasi ayam goreng' }
      s.entries.push(ai('g1', 'Nasi putih', 267, G), ai('g2', 'Ayam goreng', 330, G), ai('s1', 'Es teh manis', 90))
      localStorage.setItem(k, JSON.stringify(s))
    }, [V2])
    await toHome()
    total = await num(page.getByTestId('eaten'))
    await page.getByTestId('ai-group-row').click()
    const sheet = page.getByTestId('ai-group-sheet'); await sheet.waitFor()
    const add = sheet.getByTestId('ai-group-add'); await tall(add, 'Add item')
    assert.match(await add.innerText(), /Add item/)
    await noDash(sheet, 'breakdown'); await page.waitForTimeout(300)
    await shot('breakdown-add-item')
    await add.click()
    const pick = page.getByTestId('add-item-sheet'); await pick.waitFor()
    assert.match(await dialog.getAttribute('aria-label') ?? await dialog.innerText(), /Nasi ayam goreng|Add/)
    assert.match(await page.getByTestId('add-item-list').innerText(), /Tempe goreng[\s\S]*Soto betawi spesial/, 'favourites, then saved')
    await page.getByTestId('add-item-search').fill('tempe goreng')
    await page.getByTestId('add-item-list').getByRole('button', { name: /^Tempe goreng/ }).click()
    await dialog.getByRole('button', { name: `Add ${tempe.kcal} kcal` }).click()
    await sheet.waitFor()
    assert.equal(await sheet.getByTestId('ai-group-item').count(), 3)
    assert.equal(await num(sheet.getByTestId('ai-group-total')), 267 + 330 + tempe.kcal)
    // Quick add into the group: no meal chips.
    await sheet.getByTestId('ai-group-add').click(); await page.getByTestId('add-item-quick').click()
    assert.equal(await dialog.getByRole('group', { name: 'Meal' }).count(), 0)
    await page.fill('input[name=kcal]', '50'); await page.fill('input[name=name]', 'Kerupuk udang')
    await dialog.getByRole('button', { name: 'Add 50 kcal' }).click()
    await sheet.waitFor(); assert.equal(await sheet.getByTestId('ai-group-item').count(), 4)
    // A saved food.
    await sheet.getByTestId('ai-group-add').click()
    await page.getByTestId('add-item-list').getByRole('button', { name: /^Soto betawi spesial, saved food/ }).click()
    await dialog.getByRole('button', { name: 'Add 410 kcal' }).click()
    await sheet.waitFor(); assert.equal(await sheet.getByTestId('ai-group-item').count(), 5)
    assert.equal(await num(sheet.getByTestId('ai-group-total')), 267 + 330 + tempe.kcal + 50 + 410)
    const g = (await ls(V2)).entries.filter((e) => e.groupId === 'g-test')
    assert.equal(g.length, 5); assert.ok(g.every((e) => e.groupName === 'Nasi ayam goreng' && e.meal === 'lunch'), 'group fields kept')
    assert.ok(g.some((e) => e.foodId === tempe.id) && g.some((e) => e.foodId?.startsWith('u_')))
    await page.keyboard.press('Escape'); await sheet.waitFor({ state: 'detached' })
    assert.equal(await num(page.getByTestId('eaten')), total + tempe.kcal + 50 + 410)
  })
  await step(`${tag} editing a built-in item in the group keeps its groupId`, async () => {
    await page.getByTestId('ai-group-row').click()
    await page.getByTestId('ai-group-sheet').getByRole('button', { name: /^Edit Tempe goreng/ }).click()
    await dialog.getByRole('button', { name: 'Increase amount' }).click()
    await dialog.getByRole('button', { name: /^Save/ }).click()
    await page.getByTestId('ai-group-sheet').waitFor()
    const e = (await ls(V2)).entries.find((x) => x.foodId === tempe.id && x.groupId)
    assert.deepEqual([e.groupId, e.qty], ['g-test', 2])
    await page.keyboard.press('Escape')
  })
  await step(`${tag} a single AI item: "+ Add item to this meal" turns it into a group of 2`, async () => {
    await toHome()
    await page.getByRole('button', { name: /^Edit Es teh manis, 90 kcal/ }).click()
    const b = dialog.getByTestId('ai-add-item'); await tall(b, 'Add item to this meal')
    await b.click(); await page.getByTestId('add-item-sheet').waitFor()
    await page.getByTestId('add-item-quick').click()
    await page.fill('input[name=kcal]', '30')
    await dialog.getByRole('button', { name: 'Add 30 kcal' }).click()
    const sheet = page.getByTestId('ai-group-sheet'); await sheet.waitFor()
    assert.equal(await sheet.getByTestId('ai-group-item').count(), 2)
    assert.equal(await num(sheet.getByTestId('ai-group-total')), 120)
    const es = (await ls(V2)).entries.find((e) => e.id === 's1')
    assert.ok(es.groupId && (await ls(V2)).entries.filter((e) => e.groupId === es.groupId).length === 2)
    await page.keyboard.press('Escape'); await sheet.waitFor({ state: 'detached' })
    assert.equal(await page.getByTestId('ai-group-row').count(), 2)
    await noSideways(page, 'Home with two groups')
  })
  await ctx.close()
}
await browser.close()
results.push(errors.length ? `FAIL console: ${errors.join(' | ')}` : 'PASS no console errors or warnings')
console.log(results.join('\n'))
console.log(`${results.length} v1.10.1 checks`)
if (errors.length || results.some((r) => r.startsWith('FAIL'))) process.exit(1)
