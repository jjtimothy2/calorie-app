// v1.13.2: after a log on Log, go to Home on the day logged to, scroll to the meal (or Exercise) card, highlight the
// new row(s) (#2F8F5B at low opacity, fading over 1.5 s) and show "Added X · N kcal" with Undo for 5 s (no Done).
// Entry points: Add Calories, search one-tap, the food sheet, My foods, AI (text, mocked Gemini), exercise form,
// Quick add burn, and a picked past day. Reduced motion: an instant jump and a static highlight. Weight card: the
// "N weigh-ins · See all" row is centred between the chart's date label and the divider (1 and 4 weigh-ins, in px).
// WebKit with touch at 390x844 (motion on) and 375x667 (reduced motion). Screenshots: screenshots/v1132-*.png.
// Usage: npm run build && npx vite preview --port 4174 & node tests/v1132.mjs
import { webkit, devices } from 'playwright'
import assert from 'node:assert/strict'
import { EST, geminiOk } from './v15-fixture.mjs'

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
let n = 0
const e = (date, meal, name, kcal) => ({ id: `s${++n}`, date, meal, foodId: null, name, servingLabel: 'Quick add', servingMult: 1, qty: 1, kcal, protein: 10, carbs: 20, fat: 5, createdAt: Date.now() - 86400_000 + n })
const profile = { age: 32, sex: 'male', heightCm: 175, weightKg: 92, activity: 'light', goal: 'lose', bmr: 1859, bmrCustom: false, includeMovement: false, goalWeightKg: 85, goalDate: ago(-120), planFrom: { date: TODAY, kg: 92 }, goalAssumed: false, macros: { protein: null, carbs: null, fat: null }, target: 1500, dailyGoal: 500 }
// A full morning so Dinner, Snacks and Exercise start below the fold.
const entries = [
  ...['Nasi uduk', 'Telur dadar', 'Kopi susu', 'Pisang', 'Roti bakar'].map((x, i) => e(TODAY, 'breakfast', x, 100 + i * 20)),
  ...['Nasi padang', 'Rendang', 'Sayur nangka', 'Es teh manis'].map((x, i) => e(TODAY, 'lunch', x, 150 + i * 30)),
  e(YDAY, 'lunch', 'Soto ayam', 450),
]
const weights = (k) => Array.from({ length: k }, (_, i) => ({ date: ago(7 * (k - 1 - i)), kg: 92 + (k - 1 - i) * 0.5 }))
const V3 = (k = 1) => JSON.stringify({ version: 3, profile, entries, exercises: [], closedDays: {}, favourites: [], weights: weights(k) })
const FOODS = JSON.stringify({ version: 1, foods: [{ id: 'u_bubur', name: 'Bubur ayam', kcal: 320, protein: 12, carbs: 45, fat: 8, createdAt: 1, updatedAt: 1 }] })
const AI = JSON.stringify({ provider: 'gemini', key: 'AIzaTEST-not-a-real-key-000000000000' })
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET, POST, OPTIONS' }

const browser = await webkit.launch()
const open = async (w, h, motion) => {
  const ctx = await browser.newContext({ ...devices['iPhone 14'], viewport: { width: w, height: h }, deviceScaleFactor: 3, serviceWorkers: 'block', reducedMotion: motion })
  await ctx.addInitScript(([v3, foods, ai]) => {
    if (!localStorage.getItem('calorie-app:v3')) {
      localStorage.setItem('calorie-app:v3', v3); localStorage.setItem('calorie-app:foods', foods); localStorage.setItem('calorie-app:ai', ai)
      localStorage.setItem('calorie-app:backup', JSON.stringify({ lastExportAt: Date.now(), dismissedAt: null }))
    }
  }, [V3(1), FOODS, AI])
  await ctx.route('https://generativelanguage.googleapis.com/**', (route) => route.request().method() === 'OPTIONS'
    ? route.fulfill({ status: 204, headers: CORS })
    : route.fulfill({ status: 200, contentType: 'application/json', headers: CORS, body: JSON.stringify(geminiOk(EST)) }))
  const page = await ctx.newPage()
  page.on('console', (m) => { if ((m.type() === 'error' || m.type() === 'warning') && !/service worker/i.test(m.text())) errors.push(`${w}x${h}: ${m.type()}: ${m.text()}`) })
  page.on('pageerror', (er) => errors.push(`${w}x${h}: pageerror: ${er.message}`))
  return { ctx, page }
}
const st = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('calorie-app:v3')))
const ids = async (page, kind) => (await st(page))[kind].map((x) => x.id)

for (const [w, h, motion] of [[390, 844, 'no-preference'], [375, 667, 'reduce']]) {
  const tag = `${w}x${h}`, reduce = motion === 'reduce'
  const { ctx, page } = await open(w, h, motion)
  const dialog = page.getByRole('dialog')
  const shot = (name) => page.screenshot({ path: `${OUT}v1132-${name}-${tag}.png` })
  const home = async () => { await page.goto(BASE + '/'); await page.getByTestId('eaten').waitFor() }

  /**
   * Run `act` (which logs something on Log) and check the landing on Home: URL, the snackbar text with Undo and no
   * Done, every new row highlighted, the scroll (card top and rows clear of the top edge and the snackbar), the
   * reduced-motion jump and the static fill. Returns the new ids.
   */
  const land = async (kind, act, text, { title = 'Today', cardTest } = {}) => {
    const before = new Set(await ids(page, kind))
    await act()
    await page.waitForURL(BASE + '/')
    const toast = page.getByTestId('toast'); await toast.waitFor()
    const t0 = Date.now()
    const fresh = (await ids(page, kind)).filter((id) => !before.has(id))
    assert.ok(fresh.length >= 1, 'something was logged')
    assert.match(await toast.innerText(), text)
    assert.equal(await toast.getByRole('button', { name: 'Undo' }).count(), 1)
    assert.equal(await page.getByRole('button', { name: 'Done' }).count(), 0, 'no Done button')
    assert.equal(await page.locator('#day-title').innerText(), title)
    // Highlight: every new id sits in a highlighted row (an AI group is one row holding all of its ids).
    const lit = await page.locator('.row-flash').evaluateAll((els) => els.map((el) => [el.dataset.ids, getComputedStyle(el).animationName, getComputedStyle(el).backgroundColor]))
    assert.ok(lit.length >= 1, 'a row is highlighted')
    for (const id of fresh) assert.ok(lit.some(([d]) => d.split(' ').includes(id)), `row for ${id} highlighted`)
    for (const [, anim, bg] of lit) {
      if (reduce) { assert.equal(anim, 'none'); assert.equal(bg, 'rgba(47, 143, 91, 0.2)', 'static green fill') }
      else assert.equal(anim, 'row-flash')
    }
    const geo = () => page.evaluate((ids) => {
      const main = document.querySelector('main'), m = main.getBoundingClientRect(), tb = document.querySelector('[data-testid=toast]').getBoundingClientRect()
      const rows = ids.map((id) => document.querySelector(`[data-ids~="${id}"]`).getBoundingClientRect())
      const card = document.querySelector(`[data-ids~="${ids[0]}"]`).closest('section').parentElement.getBoundingClientRect()
      return { top: m.top, toastTop: tb.top, rowTop: Math.min(...rows.map((r) => r.top)), rowBottom: Math.max(...rows.map((r) => r.bottom)), cardTop: card.top, scroll: main.scrollTop }
    }, fresh)
    let g
    if (reduce) {
      await page.waitForTimeout(80) // the jump happens two frames after Home mounts; no smooth scroll to wait out
      g = await geo()
      await page.waitForTimeout(500)
      assert.equal((await geo()).scroll, g.scroll, 'reduced motion: jumped straight there')
    } else { await page.waitForTimeout(900); g = await geo() }
    assert.ok(g.rowTop >= g.top - 0.5, `row clear of the top (${g.rowTop} vs ${g.top})`)
    assert.ok(g.rowBottom <= g.toastTop + 0.5, `row clear of the snackbar (${g.rowBottom} vs ${g.toastTop})`)
    assert.ok(g.cardTop >= g.top - 0.5 || g.rowTop - g.top < 40, `the ${cardTest ?? 'meal'} card starts in view (${g.cardTop})`)
    return { fresh, t0, g }
  }
  const unlit = async () => { await page.waitForTimeout(reduce ? 1100 : 1600); assert.equal(await page.locator('.row-flash').count(), 0, 'highlight gone') }
  const undo = async (kind, fresh) => {
    await page.getByTestId('toast').getByRole('button', { name: 'Undo' }).click()
    await page.getByTestId('toast').waitFor({ state: 'detached' })
    const left = await ids(page, kind)
    for (const id of fresh) { assert.ok(!left.includes(id), `${id} removed`); assert.equal(await page.locator(`[data-ids~="${id}"]`).count(), 0) }
    assert.equal(await page.locator('.row-flash').count(), 0, 'Undo clears the highlight')
  }

  await step(`${tag} Add Calories: lands on Home at Dinner, row highlighted, "Added Pisang goreng · 250 kcal" with Undo for 5 s`, async () => {
    await home()
    await page.getByRole('link', { name: 'Add to Dinner' }).click()
    const { g, t0 } = await land('entries', async () => {
      await page.getByTestId('qa-btn').click()
      await dialog.locator('input[name=kcal]').fill('250'); await dialog.locator('input[name=name]').fill('Pisang goreng')
      await dialog.getByRole('button', { name: 'Add 250 kcal' }).click()
    }, /^Added Pisang goreng · 250 kcal\s*Undo$/)
    assert.ok(g.scroll > 0, 'scrolled down to Dinner')
    await shot('landed-food')
    await unlit()
    await page.waitForTimeout(Math.max(0, 4300 - (Date.now() - t0)))
    assert.ok(await page.getByTestId('toast').isVisible(), 'snackbar still up at 4.3 s')
    await page.getByTestId('toast').waitFor({ state: 'detached', timeout: 1800 })
    assert.ok(Date.now() - t0 < 6000, 'gone after 5 s')
  })

  await step(`${tag} search one-tap: lands at Snacks; Undo removes the item and the highlight`, async () => {
    await page.getByRole('link', { name: 'Add to Snacks' }).click()
    const { fresh } = await land('entries', async () => {
      await page.getByLabel('Search foods').fill('tempe')
      await page.getByRole('button', { name: /^Add one serving of Tempe goreng/ }).click()
    }, /^Added Tempe goreng · [\d,]+ kcal/)
    assert.equal((await st(page)).entries.find((x) => x.id === fresh[0]).meal, 'snacks')
    await undo('entries', fresh)
  })

  await step(`${tag} food sheet: lands on Home with the row highlighted`, async () => {
    await page.getByRole('link', { name: 'Add to Snacks' }).click()
    await land('entries', async () => {
      await page.getByLabel('Search foods').fill('boiled egg')
      await page.getByTestId('food-list').getByRole('listitem').first().getByRole('button').first().click()
      await dialog.getByRole('button', { name: /^Add [\d,]+ kcal$/ }).click()
    }, /^Added Boiled egg · [\d,]+ kcal/)
    await unlit()
  })

  await step(`${tag} My foods: lands on Home with the row highlighted`, async () => {
    await page.getByRole('link', { name: 'Add to Snacks' }).click()
    await land('entries', async () => {
      await page.getByTestId('tab-mine').click()
      await page.getByTestId('food-list').getByRole('button', { name: /^Bubur ayam, saved food/ }).click()
      await dialog.getByRole('button', { name: 'Add 320 kcal' }).click()
    }, /^Added Bubur ayam · 320 kcal/)
  })

  await step(`${tag} AI (typed, mocked Gemini): 4 items land as one highlighted group row; Undo removes all 4`, async () => {
    await page.getByRole('link', { name: 'Add to Dinner' }).click()
    const { fresh } = await land('entries', async () => {
      await page.getByRole('button', { name: 'Estimate with AI', exact: true }).click()
      await page.getByRole('menuitem', { name: 'Type it' }).click()
      await dialog.getByRole('textbox').fill('nasi ayam goreng with sambal')
      await dialog.getByRole('button', { name: /Estimate/ }).click()
      await dialog.getByRole('button', { name: /^Log \d+ items$/ }).click()
    }, /^Added \d+ items from AI · [\d,]+ kcal/)
    assert.ok(fresh.length >= 2)
    const lit = await page.locator('.row-flash').evaluateAll((els) => els.map((el) => el.dataset.testid))
    assert.deepEqual(lit, ['ai-group-row'])
    await shot('landed-ai')
    await undo('entries', fresh)
  })

  await step(`${tag} exercise form: lands at the Exercise card, "Added Badminton · N kcal burned" with Undo`, async () => {
    await page.getByRole('link', { name: 'Add exercise' }).click()
    const { fresh } = await land('exercises', async () => {
      await page.getByRole('button', { name: 'Badminton' }).click()
      await page.getByRole('button', { name: 'Add exercise' }).click()
    }, /^Added Badminton · [\d,]+ kcal burned\s*Undo$/, { cardTest: 'exercise' })
    assert.equal(await page.getByTestId('exercise-card').locator(`[data-ids="${fresh[0]}"]`).count(), 1)
    await shot('landed-exercise')
    await undo('exercises', fresh)
  })

  await step(`${tag} Quick add burn: lands at the Exercise card with the row highlighted`, async () => {
    await page.getByRole('link', { name: 'Add exercise' }).click()
    await land('exercises', async () => {
      await page.getByTestId('qa-bar').getByRole('button', { name: 'Quick add burn' }).click()
      await dialog.locator('input[name=burn]').fill('300'); await dialog.locator('input[name=exname]').fill('Watch workout')
      await dialog.getByRole('button', { name: 'Add 300 kcal' }).click()
    }, /^Added Watch workout · 300 kcal burned/, { cardTest: 'exercise' })
    await unlit()
  })

  await step(`${tag} past day: a log on Yesterday lands on Home showing Yesterday, row highlighted, Undo works`, async () => {
    await home()
    await page.getByTestId('day-prev').click()
    await page.waitForFunction(() => document.querySelector('#day-title')?.textContent === 'Yesterday')
    await page.getByRole('link', { name: 'Add to Snacks' }).click()
    await page.getByTestId('past-day-note').waitFor()
    const { fresh } = await land('entries', async () => {
      await page.getByTestId('qa-btn').click()
      await dialog.locator('input[name=kcal]').fill('180'); await dialog.locator('input[name=name]').fill('Martabak')
      await dialog.getByRole('button', { name: 'Add 180 kcal' }).click()
    }, /^Added Martabak · 180 kcal/, { title: 'Yesterday' })
    assert.equal((await st(page)).entries.find((x) => x.id === fresh[0]).date, YDAY)
    await page.getByTestId('past-day-note').waitFor()
    await shot('landed-past-day')
    await undo('entries', fresh)
    assert.equal(await page.locator('#day-title').innerText(), 'Yesterday')
    await page.getByTestId('back-to-today').click()
  })

  await step(`${tag} data: v3 with the v2-era keys only, no new storage keys`, async () => {
    const keys = await page.evaluate(() => Object.keys(localStorage).sort())
    assert.deepEqual(keys, ['calorie-app:ai', 'calorie-app:backup', 'calorie-app:foods', 'calorie-app:v3'])
    assert.equal((await st(page)).version, 3)
  })

  for (const k of [1, 4]) {
    await step(`${tag} Weight card, ${k} weigh-in${k > 1 ? 's' : ''}: "See all" row 44 px, its text centred between the date label and the divider (±1 px)`, async () => {
      await page.evaluate((v) => localStorage.setItem('calorie-app:v3', v), V3(k))
      await page.goto(BASE + '/settings'); await page.getByTestId('see-weighins').waitFor(); await page.waitForTimeout(600)
      const r = await page.evaluate(() => {
        const card = document.querySelector('[data-testid=weight-card]')
        const axis = Math.max(...[...card.querySelectorAll('[data-testid=weight-chart-open] svg text')].map((t) => t.getBoundingClientRect().bottom))
        const btn = document.querySelector('[data-testid=see-weighins]'), rg = document.createRange()
        rg.selectNodeContents(btn.querySelector('span'))
        const t = rg.getBoundingClientRect(), line = document.querySelector('[data-testid=edit-goal]').parentElement.getBoundingClientRect().top
        card.scrollIntoView({ block: 'start' })
        return { above: t.top - axis, below: line - t.bottom, btn: btn.getBoundingClientRect().height }
      })
      results.push(`  ${tag} ${k} weigh-in(s): ${r.above.toFixed(2)} px above, ${r.below.toFixed(2)} px below, row ${r.btn} px`)
      assert.ok(r.btn >= 44, `tap height ${r.btn}`)
      assert.ok(Math.abs(r.above - r.below) <= 1, `gap above ${r.above} vs below ${r.below}`)
      await shot(`weight-${k}`)
    })
  }
  await ctx.close()
}
await browser.close()
console.log(results.join('\n'))
if (errors.length) { console.log(errors.join('\n')); process.exit(1) }
console.log(`\n${results.filter((r) => r.startsWith('PASS')).length} v1.13.2 checks passed, no console errors`)
