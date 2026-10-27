// v1.10: (1) onboarding asks about a watch before Activity. Yes turns daily movement off, skips Activity and shows a
// "Quick add burn" note; No goes to Activity with movement on; Faster stays Faster even on the floor. (2) Saved foods
// carry a bookmark icon only (aria-label "Saved food"), no Mine tag and no "your food" text. (3) 2+ items from one AI
// estimate share Entry.groupId and show as one row on Today; the breakdown sheet edits or removes items and deletes the
// meal. Old entries (no groupId) and calorie-app:ai are unchanged; backups carry groupId both ways.
// WebKit with touch at 390x844 and 375x667. Screenshots: screenshots/v110-*.png.
// Usage: npm run build && npx vite preview --port 4174 & node tests/v110.mjs
import { webkit, devices } from 'playwright'
import assert from 'node:assert/strict'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { STATE } from './v11-fixture.mjs'

const BASE = (process.env.BASE_URL ?? 'http://localhost:4174/calorie-app').replace(/\/$/, '')
const OUT = new URL('../screenshots/', import.meta.url).pathname
const TMP = '/tmp/v110/'; mkdirSync(TMP, { recursive: true })
const V2 = 'calorie-app:v2', V3 = 'calorie-app:v3', AIK = 'calorie-app:ai' // v1.13: seeds stay v1/v2 (migrated on load); reads use v3
const D140 = (() => { const d = new Date(); d.setDate(d.getDate() + 140); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` })()
const AI = JSON.stringify({ provider: 'gemini', key: 'AIzaTEST-not-a-real-key-000000000000' })
const results = [], errors = []
const step = async (name, fn) => {
  const t = Date.now()
  try { await fn(); results.push(`PASS ${name} (${Date.now() - t} ms)`) } catch (e) { results.push(`FAIL ${name}: ${e.message}`); console.log(results.join('\n')); throw e }
}
const num = async (loc) => Number((await loc.innerText()).replace(/[^0-9]/g, ''))
const tall = async (loc, what) => { const b = await loc.boundingBox(); assert.ok(b && b.height >= 44 && b.width >= 44, `${what} is a 44 px target (${b && Math.round(b.width)}x${b && Math.round(b.height)})`) }
const noSideways = async (pg, what) => { const r = await pg.evaluate(() => [document.documentElement.scrollWidth, innerWidth]); assert.ok(r[0] <= r[1], `${what}: ${r[0]}px wide at ${r[1]}`) }

const browser = await webkit.launch()
for (const [width, height] of [[390, 844], [375, 667]]) {
  const tag = `${width}x${height}`
  const newCtx = (init) => browser.newContext({ ...devices['iPhone 14'], viewport: { width, height }, deviceScaleFactor: 3, serviceWorkers: 'block', acceptDownloads: true, reducedMotion: 'reduce' }).then(async (c) => { if (init) await c.addInitScript(...init); return c })
  const watchErrors = (page) => {
    page.on('console', (m) => { if ((m.type() === 'error' || m.type() === 'warning') && !/Service Worker registration blocked|service worker/i.test(m.text())) errors.push(`${tag}: ${m.type()}: ${m.text()}`) })
    page.on('pageerror', (e) => errors.push(`${tag}: ${e.message}`))
  }

  // ---------- 1. Onboarding watch question ----------
  {
    const ctx = await newCtx()
    const pg = await ctx.newPage(); watchErrors(pg)
    const shot = async (name) => { await pg.waitForTimeout(300); await pg.screenshot({ path: `${OUT}v110-${name}-${tag}.png` }) }
    const label = () => pg.getByRole('progressbar').first().getAttribute('aria-label')
    const toGoal = async (goal = 'lose') => {
      // Clear from a static file on the same origin, so the app cannot write its state back on the way out.
      await pg.goto(BASE + '/manifest.webmanifest'); await pg.evaluate(() => localStorage.clear()); await pg.goto(BASE + '/')
      await pg.getByTestId('ob-start').click()
      await pg.getByTestId('ob-sex-male').click()
      await pg.getByTestId('ob-age').fill('32'); await pg.getByTestId('ob-next').click()
      await pg.getByTestId('ob-height').fill('175'); await pg.getByTestId('ob-weight').fill('92'); await pg.getByTestId('ob-next').click()
      await pg.getByTestId(`ob-goal-${goal}`).click()
      if (goal !== 'keep') {
        // v1.13: goal weight and By when replace the pace step. 10 kg by 140 days out: 10 x 7,700 / 140 = 550 a day.
        await pg.getByTestId('ob-goal-weight').waitFor()
        await pg.fill('input[name=goalWeightKg]', '82'); await pg.getByTestId('ob-next').click()
        await pg.getByTestId('by-custom').click(); await pg.getByTestId('by-date').fill(D140); await pg.getByTestId('ob-next').click()
      }
      await pg.getByTestId('ob-watch').waitFor()
    }
    const ls = () => pg.evaluate((k) => JSON.parse(localStorage.getItem(k)), V3)

    await step(`${tag} watch question comes after goal weight and By when, before Activity, two big answers`, async () => {
      await toGoal()
      assert.equal(await pg.locator('main h1').first().innerText(), 'Do you wear a watch that tracks your burn?')
      assert.equal(await label(), 'Question 7 of 8')
      for (const id of ['ob-watch-yes', 'ob-watch-no']) { await tall(pg.getByTestId(id), id); assert.equal(await pg.getByTestId(id).getAttribute('aria-pressed'), 'false') }
      assert.match(await pg.getByTestId('ob-watch-yes').innerText(), /Yes, I use a watch/)
      assert.match(await pg.getByTestId('ob-watch-no').innerText(), /^No/)
      assert.doesNotMatch(await pg.locator('main').innerText(), /—/)
      await noSideways(pg, 'watch question')
      await shot('watch-question')
    })

    await step(`${tag} Yes skips Activity and works the plan from resting burn: 1,859 - 550 = 1,309, a soft (never blocking) warning, the Quick add burn note`, async () => {
      await pg.getByTestId('ob-watch-yes').click()
      await pg.getByTestId('ob-target').waitFor()
      assert.equal(await pg.getByTestId('ob-act-light').count(), 0)
      assert.equal(await pg.getByTestId('ob-pace').count(), 0)
      assert.equal(await num(pg.getByTestId('target')), 1309)
      // v1.13: no 1,500 floor on a new plan; under 1,500 for a man shows the soft warning instead.
      assert.match(await pg.getByTestId('pace-warning').innerText(), /1,500/)
      assert.equal(await pg.getByTestId('ob-next').isDisabled(), false)
      const note = pg.getByTestId('ob-watch-note')
      assert.match(await note.innerText(), /active calories each day with Quick add burn/)
      await noSideways(pg, 'target with watch note')
      await note.scrollIntoViewIfNeeded()
      await shot('watch-yes-note')
    })

    await step(`${tag} Yes target: How sheet says movement comes from the watch; Back keeps the answers; saved with movement off`, async () => {
      await pg.getByTestId('ob-how').click()
      const sheet = pg.getByRole('dialog', { name: 'How we worked this out' })
      const t = await sheet.innerText()
      assert.match(t, /Daily movement\s*From your watch/)
      assert.match(t, /Quick add burn/)
      await pg.getByTestId('ob-how-close').click(); await sheet.waitFor({ state: 'detached' })
      // Back: the watch question (Yes kept, Activity skipped), then By when (the custom date kept).
      await pg.getByTestId('ob-back').click()
      assert.equal(await pg.getByTestId('ob-watch-yes').getAttribute('aria-pressed'), 'true')
      await pg.getByTestId('ob-back').click()
      assert.equal(await pg.getByTestId('by-date').inputValue(), D140)
      await pg.getByTestId('ob-next').click()
      await pg.getByTestId('ob-watch-yes').click()
      await pg.getByTestId('ob-target').waitFor()
      await pg.getByTestId('ob-next').click(); await pg.getByTestId('ob-skip').click()
      await pg.waitForURL(BASE + '/')
      await pg.getByTestId('balance').waitFor()
      const p = (await ls()).profile
      assert.deepEqual([p.includeMovement, p.goalDate, 'pace' in p, p.target, p.bmr, p.bmrCustom], [false, D140, false, 1309, 1859, false])
      assert.equal(await pg.getByTestId('eq-movement').count(), 0)
    })

    await step(`${tag} No goes to Activity with daily movement on; Keep + Yes goes straight to the target`, async () => {
      await toGoal()
      await pg.getByTestId('ob-watch-no').click()
      await pg.getByTestId('ob-act-light').click()
      await pg.getByTestId('ob-target').waitFor()
      assert.equal(await pg.getByTestId('ob-watch-note').count(), 0)
      assert.equal(await num(pg.getByTestId('target')), 2006) // 1,859 + light 697 - 550
      assert.equal(await pg.getByTestId('ob-watch-note').count(), 0)
      await pg.getByTestId('ob-next').click(); await pg.getByTestId('ob-skip').click()
      await pg.waitForURL(BASE + '/')
      assert.equal((await ls()).profile.includeMovement, true)
      await toGoal('keep')
      await pg.getByTestId('ob-watch-yes').click()
      await pg.getByTestId('ob-target').waitFor()
      assert.equal(await num(pg.getByTestId('target')), 1859) // keep = resting burn
    })
    await ctx.close()
  }

  // ---------- 2 + 3. Saved food bookmark, AI meal group ----------
  {
    const ctx = await newCtx([([s, ai]) => {
      if (!localStorage.getItem('calorie-app:v1') && !localStorage.getItem('calorie-app:v2')) localStorage.setItem('calorie-app:v1', JSON.stringify(s))
      if (!localStorage.getItem('calorie-app:ai')) localStorage.setItem('calorie-app:ai', ai)
    }, [STATE, AI]])
    const page = await ctx.newPage(); watchErrors(page)
    const shot = async (name) => { await page.waitForTimeout(300); await page.screenshot({ path: `${OUT}v110-${name}-${tag}.png` }) }
    const dialog = page.getByRole('dialog')
    const ls = (k) => page.evaluate((k) => JSON.parse(localStorage.getItem(k) ?? 'null'), k)
    const toHome = async () => { await page.goto(BASE + '/'); await page.getByTestId('eaten').waitFor() }
    const toLog = async () => { await page.getByRole('button', { name: 'Log food' }).click(); await page.waitForURL('**/log**') }

    await step(`${tag} a saved food shows a bookmark (aria-label Saved food) in search and Recent, no Mine or "your food" text`, async () => {
      await toHome(); await toLog()
      await page.getByTestId('qa-bar').getByRole('button', { name: 'Add Calories' }).click()
      await page.fill('input[name=kcal]', '320'); await page.fill('input[name=name]', 'Bubur ayam')
      await dialog.getByRole('button', { name: 'Add 320 kcal' }).click()
      await page.getByTestId('toast').waitFor()
      await page.getByLabel('Search foods').fill('bubur')
      const first = page.getByTestId('food-list').getByRole('listitem').first()
      await first.getByRole('img', { name: 'Saved food' }).waitFor()
      assert.equal(await first.getByTestId('saved-mark').count(), 1)
      assert.match(await first.innerText(), /Bubur ayam\s*1 serving/)
      assert.doesNotMatch(await page.getByTestId('food-list').innerText(), /Mine|your food|my food/i)
      assert.equal(await page.getByTestId('mine-tag').count(), 0)
      assert.match(await first.getByRole('button').first().getAttribute('aria-label'), /^Bubur ayam, saved food, 1 serving, 320 kcal/)
      await page.getByTestId('toast').waitFor({ state: 'detached', timeout: 8000 }) // keep the toast off the list in the shot
      await shot('saved-search')
      await first.getByRole('button', { name: /^Bubur ayam, saved food/ }).click()
      await dialog.getByTestId('saved-mark').waitFor()
      assert.doesNotMatch(await dialog.innerText(), /Mine|your food/i)
      await page.keyboard.press('Escape'); await dialog.waitFor({ state: 'detached' })
      await page.getByLabel('Search foods').fill('')
      await page.getByRole('group', { name: 'Food list' }).getByRole('button', { name: 'Recent' }).click()
      await page.getByTestId('food-list').getByRole('img', { name: 'Saved food' }).first().waitFor()
    })

    let total, oldKeys
    await step(`${tag} 2+ AI items with one groupId show as one row; a single AI item and a lone groupId stay normal rows`, async () => {
      await toHome()
      await page.evaluate(([k]) => {
        const s = JSON.parse(localStorage.getItem(k))
        const d = new Date(), today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
        const t = Date.now()
        const ai = (id, name, kcal, p, c, f, extra = {}, dt = 0) => ({ id, date: today, meal: 'lunch', foodId: null, name, servingLabel: '100 g', servingMult: 1, qty: 1, kcal, protein: p, carbs: c, fat: f, createdAt: t + dt, source: 'photo', ...extra })
        const G = { groupId: 'g-test', groupName: 'Nasi ayam goreng' }
        s.entries.push(ai('g1', 'Nasi putih', 267, 4.9, 58.7, 0.5, G, 1), ai('g2', 'Ayam goreng', 330, 25, 8, 21, G, 1), ai('g3', 'Sambal', 40, 0.5, 4, 2.5, G, 1),
          ai('s1', 'Es teh manis', 90, 0, 22, 0, {}, 2), ai('lone', 'Kerupuk', 60, 1, 7, 3, { groupId: 'g-lone', groupName: 'Snack' }, 3))
        localStorage.setItem(k, JSON.stringify(s))
      }, [V3])
      await toHome()
      oldKeys = (await ls(V3)).entries.filter((e) => !e.groupId).map((e) => Object.keys(e).sort().join())
      const rows = page.getByTestId('ai-group-row')
      assert.equal(await rows.count(), 1)
      const row = rows.first()
      assert.match(await row.innerText(), /Nasi ayam goreng[\s\S]*Lunch · 3 items[\s\S]*AI[\s\S]*637/)
      assert.match(await row.getAttribute('aria-label'), /^Nasi ayam goreng, 3 items from AI, 637 kcal\. Open breakdown/)
      await tall(row, 'group row')
      await page.getByRole('button', { name: /^Edit Es teh manis, 90 kcal/ }).waitFor()
      await page.getByRole('button', { name: /^Edit Kerupuk, 60 kcal/ }).waitFor()
      assert.equal(await page.getByRole('button', { name: /^Edit Nasi putih/ }).count(), 0)
      total = await num(page.getByTestId('eaten'))
      await noSideways(page, 'Home with group row')
      await row.scrollIntoViewIfNeeded()
      await shot('ai-group-row')
    })

    await step(`${tag} the breakdown sheet lists each item with kcal and macros; targets are 44 px`, async () => {
      await page.getByTestId('ai-group-row').click()
      const sheet = page.getByTestId('ai-group-sheet')
      await sheet.waitFor()
      assert.equal(await sheet.getByTestId('ai-group-item').count(), 3)
      assert.equal(await num(sheet.getByTestId('ai-group-total')), 637)
      assert.match(await sheet.innerText(), /AI estimate · Lunch · 3 items/)
      assert.match(await sheet.innerText(), /Nasi putih[\s\S]*P 4\.9 · C 58\.7 · F 0\.5 g[\s\S]*267/)
      for (const b of await sheet.getByTestId('ai-group-remove').all()) await tall(b, 'remove')
      await tall(sheet.getByTestId('ai-group-delete'), 'delete whole meal')
      assert.doesNotMatch(await sheet.innerText(), /—/)
      await page.waitForTimeout(300)
      await shot('ai-group-sheet')
    })

    await step(`${tag} edit an item: Edit item sheet, saved with its groupId, sheet comes back with the new total`, async () => {
      await page.getByRole('button', { name: /^Edit Nasi putih, 267 kcal/ }).click()
      await dialog.getByRole('heading', { name: 'Edit item' }).waitFor()
      assert.equal(await page.getByTestId('ai-group-sheet').count(), 0)
      // AI macros carry one decimal (4.9 g); they used to fail the number field's whole-number check, so Save did nothing.
      assert.equal(await dialog.getByLabel('Protein').inputValue(), '4.9')
      await page.fill('input[name=kcal]', '300')
      await dialog.getByLabel('Protein').fill('5.5')
      await dialog.getByRole('button', { name: 'Save' }).click()
      const sheet = page.getByTestId('ai-group-sheet')
      await sheet.waitFor()
      assert.equal(await num(sheet.getByTestId('ai-group-total')), 670)
      const e = (await ls(V3)).entries.find((x) => x.id === 'g1')
      assert.deepEqual([e.kcal, e.protein, e.groupId, e.groupName, e.source, e.foodId], [300, 5.5, 'g-test', 'Nasi ayam goreng', 'photo', null])
      assert.ok(!((await ls('calorie-app:foods'))?.foods ?? []).some((f) => f.name === 'Nasi putih'))
    })

    await step(`${tag} remove one item; totals on Today match the entries`, async () => {
      const sheet = page.getByTestId('ai-group-sheet')
      await sheet.getByRole('button', { name: 'Remove Sambal' }).click()
      await page.waitForFunction(() => document.querySelectorAll('[data-testid=ai-group-item]').length === 2)
      assert.equal(await num(sheet.getByTestId('ai-group-total')), 630)
      assert.equal((await ls(V3)).entries.some((e) => e.id === 'g3'), false)
      await page.keyboard.press('Escape'); await sheet.waitFor({ state: 'detached' })
      assert.equal(await num(page.getByTestId('eaten')), total - 40 + 33)
      assert.match(await page.getByTestId('ai-group-row').innerText(), /2 items[\s\S]*630/)
    })

    let backupText
    await step(`${tag} backup export keeps groupId; old entries and calorie-app:ai keep their shape`, async () => {
      assert.deepEqual((await ls(V3)).entries.filter((e) => !e.groupId).map((e) => Object.keys(e).sort().join()), oldKeys)
      assert.equal(await page.evaluate((k) => localStorage.getItem(k), AIK), AI)
      await page.goto(BASE + '/settings')
      const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export backup' }).click()])
      backupText = readFileSync(await dl.path(), 'utf8')
      const j = JSON.parse(backupText)
      const g = j.data[V3].entries.filter((e) => e.groupId === 'g-test')
      assert.equal(g.length, 2); assert.ok(g.every((e) => e.groupName === 'Nasi ayam goreng'))
      assert.equal(j.data[AIK], undefined)
    })

    await step(`${tag} Delete whole meal asks first, then removes every item; import brings the group back`, async () => {
      await toHome()
      await page.getByTestId('ai-group-row').click()
      const sheet = page.getByTestId('ai-group-sheet')
      await sheet.getByTestId('ai-group-delete').click()
      await sheet.getByRole('button', { name: 'Keep' }).click()
      assert.equal(await sheet.getByTestId('ai-group-item').count(), 2)
      await sheet.getByTestId('ai-group-delete').click()
      assert.equal(await sheet.getByTestId('ai-group-delete-confirm').innerText(), 'Delete 2 items')
      await sheet.getByTestId('ai-group-delete-confirm').click()
      await sheet.waitFor({ state: 'detached' })
      assert.equal(await page.getByTestId('ai-group-row').count(), 0)
      assert.equal((await ls(V3)).entries.filter((e) => e.groupId === 'g-test').length, 0)
      await page.getByRole('button', { name: /^Edit Es teh manis/ }).waitFor()
      await page.goto(BASE + '/settings')
      const p = `${TMP}backup-${tag}.json`; writeFileSync(p, backupText)
      await page.getByTestId('import-file').setInputFiles(p)
      await page.getByTestId('import-summary').waitFor()
      await page.getByRole('button', { name: 'Replace my data' }).click()
      await page.waitForTimeout(300)
      await toHome()
      assert.match(await page.getByTestId('ai-group-row').innerText(), /Nasi ayam goreng[\s\S]*2 items/)
    })
    await ctx.close()
  }
}
await browser.close()
results.push(errors.length ? `FAIL console: ${errors.join(' | ')}` : 'PASS no console errors or warnings')
console.log(results.join('\n'))
console.log(`${results.length} v1.10 checks`)
if (errors.length || results.some((r) => r.startsWith('FAIL'))) process.exit(1)
