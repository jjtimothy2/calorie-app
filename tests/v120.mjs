// v1.20 Meal Ideas (spec calorie-meal-ideas, approved by Jordy 2 Nov 2026). A "✦ What should I eat?" link under Home's
// goal line opens a sheet with 3 AI ideas that fit the kcal left and protein to go (same provider + model as the AI
// estimate). "Log this" opens the AI result sheet ("Suggested by Gemini", Edit comes back to the ideas) and logs to the
// meal the sheet opened with, even after the clock moves, with the + menu's toast and Undo. Chips re-ask; "Show other
// ideas" gives 3 new ones up to 5 a day (calorie-app:ideas). No key / offline / error: picks from the user's foods.
// Over the goal: "Still hungry? Light ideas", "You're over today's goal", ideas under 150 kcal. Protein hit: "Target hit".
// 44 px taps, 16 px inputs, fits at 375. Schema stays v3; :v2 :v1 :ai :foods byte-identical. Mocked Gemini.
// WebKit at 390x844 and 375x667. Screenshots: screenshots/v120-*.png.
// Usage: npm run build && npx vite preview --port 4174 & node tests/v120.mjs
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
const at = (hm) => new Date(`${TODAY}T${hm}:00+07:00`)
const T = at('08:00').getTime()
const profile = { age: 32, sex: 'male', heightCm: 175, weightKg: 92, activity: 'light', goal: 'lose', bmr: 1859, bmrCustom: false, includeMovement: false, goalWeightKg: 85, goalDate: ago(-120), planFrom: { date: ago(3), kg: 92 }, goalAssumed: false, macros: { protein: null, carbs: null, fat: null }, target: 1800, dailyGoal: 500 }
const q = (id, name, kcal, protein, extra = {}) => ({ id, date: TODAY, meal: 'breakfast', foodId: null, name, servingLabel: 'Quick add', servingMult: 1, qty: 1, kcal, protein, carbs: 20, fat: 5, createdAt: T + id.length, ...extra })
const entries = [q('q1', 'Kopi susu', 140, 10), { id: 'f1', date: TODAY, meal: 'lunch', foodId: 'tempe-goreng', name: 'Tempe goreng', servingLabel: '1 piece', servingMult: 1, qty: 1, kcal: 120, protein: 8, carbs: 6, fat: 8, createdAt: T + 9 }]
const V3 = JSON.stringify({ version: 3, profile, entries, exercises: [], closedDays: {}, favourites: [], weights: [{ date: ago(3), kg: 92 }] })
const AI = JSON.stringify({ provider: 'gemini', key: 'AIzaTEST-not-a-real-key-000000000000' })
const FIXED = {
  'calorie-app:v2': '{"version":2,"profile":null,"entries":[],"exercises":[],"closedDays":{},"favourites":[]}',
  'calorie-app:v1': '{"version":1,"entries":[]}',
  'calorie-app:ai': AI,
  'calorie-app:foods': JSON.stringify({ version: 1, foods: [{ id: 'u_bubur', name: 'Bubur ayam', kcal: 320, protein: 12, carbs: 45, fat: 8, createdAt: 1, updatedAt: 1 }] }),
}
const idea = (name, kcal, protein, why = 'High protein, fits your dinner', portion = '1 plate', grams = 380) => ({ name, why, portion, grams, kcal, protein_g: protein, carbs_g: 40, fat_g: 12 })
const SET1 = { ideas: [idea('Ayam bakar, nasi merah, lalapan', 480, 38), idea('Pepes ikan with rice', 420, 32, 'Lean fish, light on oil'), idea('Gado-gado', 450, 18, 'Veg and peanut, filling', '1 bowl', 350), idea('Nasi padang komplit', 9000, 60)] }
const PREF = { ideas: [idea('Soto ayam', 380, 28, 'Warm and light'), idea('Sate ayam, 10 sticks', 450, 40), idea('Nasi pecel', 420, 15)] }
const refreshSet = (n) => ({ ideas: [idea('Gado-gado', 450, 18), idea(`Idea ${n}a`, 300 + n, 20), idea(`Idea ${n}b`, 320 + n, 22), idea(`Idea ${n}c`, 340 + n, 24)] })
const LIGHT = { ideas: [idea('Telur rebus, 2', 140, 12, 'Protein, under 150', '2 eggs', 100), idea('Tahu kukus', 90, 9, 'Light and high protein', '2 pieces', 120), idea('Greek yogurt cup', 120, 11, 'Protein snack', '1 cup', 150), idea('Martabak manis', 600, 8)] }
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET, POST, OPTIONS' }
const TITLES = { key: 'Your key didn’t work', busy: 'Gemini is busy', failed: 'Something went wrong' }

const browser = await webkit.launch()
for (const [w, h] of [[390, 844], [375, 667]]) {
  const tag = `${w}x${h}`
  // ---- context helper: own Gemini mock and seed ----
  const open = async (seed) => {
    const ctx = await browser.newContext({ ...devices['iPhone 14'], viewport: { width: w, height: h }, deviceScaleFactor: 3, hasTouch: true, isMobile: true, serviceWorkers: 'block', timezoneId: 'Asia/Jakarta' })
    const G = { reply: SET1, status: 200, err: null, bodies: [], hold: null }
    await ctx.route('https://generativelanguage.googleapis.com/**', async (route) => {
      if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS })
      G.bodies.push(route.request().postData() ?? '')
      if (G.hold) await G.hold.p
      if (G.err) return route.fulfill({ status: G.err.status, contentType: 'application/json', headers: CORS, body: JSON.stringify({ error: { code: G.err.status, message: G.err.message, status: G.err.code } }) })
      return route.fulfill({ status: 200, contentType: 'application/json', headers: CORS, body: JSON.stringify(geminiOk(typeof G.reply === 'function' ? G.reply() : G.reply)) })
    })
    await ctx.addInitScript(([v3, fixed]) => {
      if (localStorage.getItem('calorie-app:v3')) return
      localStorage.setItem('calorie-app:v3', v3)
      for (const [k, v] of Object.entries(fixed)) localStorage.setItem(k, v)
      localStorage.setItem('calorie-app:backup', JSON.stringify({ lastExportAt: Date.now(), dismissedAt: null }))
    }, [seed.v3 ?? V3, seed.fixed ?? FIXED])
    const page = await ctx.newPage()
    await page.clock.setFixedTime(at('18:30'))
    page.on('console', (m) => { if ((m.type() === 'error' || m.type() === 'warning') && !/service worker/i.test(m.text()) && !/status of (404|401|400|429|503|500)/.test(m.text())) errors.push(`${tag}: ${m.type()}: ${m.text()}`) })
    page.on('response', (r) => { if (r.status() === 404 && r.request().resourceType() !== 'document') errors.push(`${tag}: 404 ${r.url()}`) })
    page.on('pageerror', (er) => errors.push(`${tag}: pageerror: ${er.message}`))
    return { ctx, page, G }
  }
  const { ctx, page, G } = await open({})
  const dialog = page.getByRole('dialog')
  const shot = async (name, p = page) => { await p.waitForTimeout(350); await p.screenshot({ path: `${OUT}v120-${name}-${tag}.png` }) }
  const box = (loc) => loc.evaluate((e) => { const r = e.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height } })
  const tapLoc = async (loc, p = page) => { await loc.scrollIntoViewIfNeeded(); const b = await box(loc); await p.touchscreen.tap(b.l + b.w / 2, b.t + b.h / 2) }
  const home = async (p = page) => { await p.goto(BASE + '/'); await p.getByTestId('balance').waitFor(); await p.waitForTimeout(300) }
  const st = (p = page) => p.evaluate(() => JSON.parse(localStorage.getItem('calorie-app:v3')))
  const leftNow = async (p = page) => Number((await p.getByTestId('goal-progress').innerText()).match(/^([\d,]+) kcal left/)[1].replace(/,/g, ''))
  const names = (p = page) => p.getByRole('dialog').getByTestId('ideas-list').getByTestId('idea-name').allInnerTexts()
  const noKeyboard = async (p = page) => {
    const a = await p.evaluate(() => ({ tag: document.activeElement?.tagName, role: document.activeElement?.getAttribute('role'), kb: window.visualViewport.height, ih: window.innerHeight }))
    assert.ok(!['INPUT', 'TEXTAREA', 'SELECT'].includes(a.tag), `focused ${a.tag}`)
    assert.equal(a.kb, a.ih, 'no keyboard')
    return a
  }
  // Every visible tap target in the sheet is 44 px or more, inputs 16 px+, nothing wider than the screen or clipped.
  const layout = async (where, p = page, legacy = false) => {
    const r = await p.getByRole('dialog').evaluate((d, [vw, legacy]) => {
      const bad = []
      for (const e of d.querySelectorAll('button, a, input, [role=button]')) {
        if (e.closest('[aria-hidden=true]')) continue
        const b = e.getBoundingClientRect()
        if (!b.width) continue
        // the v1.14 result sheet's own 32 px stepper and remove x are existing elements, not new (criterion 19)
        if (legacy && e.closest('[aria-label="Estimated items"]')) continue
        if (b.height < 43.5) bad.push(`small ${e.innerText || e.getAttribute('aria-label')} ${b.height}`)
        if (e.tagName === 'INPUT' && parseFloat(getComputedStyle(e).fontSize) < 16) bad.push(`input font ${getComputedStyle(e).fontSize}`)
      }
      for (const e of d.querySelectorAll('*')) {
        const b = e.getBoundingClientRect()
        if (b.width && (b.right > vw + 0.5 || b.left < -0.5)) bad.push(`overflow ${e.tagName}.${e.className} ${b.left}-${b.right}`)
      }
      for (const e of d.querySelectorAll('[data-testid=idea-name], [data-testid=idea-kcal], [data-testid=idea-why], h2, h3, [data-testid=ideas-head]')) {
        if (e.scrollWidth > e.clientWidth + 1) bad.push(`clipped ${e.innerText}`)
      }
      return { bad, oy: getComputedStyle(d).overflowY }
    }, [w, legacy])
    assert.deepEqual(r.bad, [], `${where}: ${r.bad.join(' | ')}`)
    assert.equal(r.oy, 'auto', `${where}: sheet scrolls`)
  }
  const openIdeas = async (p = page) => { await tapLoc(p.getByTestId('ideas-link'), p); await p.getByRole('dialog').waitFor(); await p.waitForTimeout(250) }
  const waitIdeas = (p = page) => p.getByRole('dialog').getByTestId('ideas-list').waitFor()
  const hold = (m = G) => { let r; m.hold = { p: new Promise((res) => { r = res }) }; return () => { m.hold = null; r() } }

  await step(`${tag} Home: centered green "✦ What should I eat?" under the goal line, 44 px tap, card grows <= 20 px`, async () => {
    await home()
    const link = page.getByTestId('ideas-link')
    assert.equal((await link.innerText()).trim(), 'What should I eat?')
    assert.equal(await link.locator('svg').count(), 1, '✦ icon')
    assert.match(await page.getByTestId('goal-progress').innerText(), /^[\d,]+ kcal left to eat\.$/)
    const [lb, gp, card] = await Promise.all([box(link), box(page.getByTestId('goal-progress')), box(link.locator('xpath=..'))])
    assert.ok(lb.h >= 44, `link ${lb.h}`)
    const ib = await box(link.locator('svg'))
    assert.ok(ib.t >= gp.b + 2, `under the goal line: icon ${ib.t}, goal line ${gp.b}`)
    assert.ok(lb.b <= card.b + 0.5, 'tap target inside the card')
    assert.ok(Math.abs((lb.l + lb.r) / 2 - (card.l + card.r) / 2) < 1.5, 'centered')
    const ink = await page.evaluate(() => { const e = document.createElement('span'); e.className = 'text-g-ink'; document.body.append(e); const c = getComputedStyle(e).color; e.remove(); return c })
    assert.equal(await link.evaluate((e) => getComputedStyle(e).color), ink, 'green ink like View ›')
    const grow = await link.evaluate((e) => { const c = e.parentElement; const a = c.getBoundingClientRect().height; e.style.display = 'none'; const b = c.getBoundingClientRect().height; e.style.display = ''; return a - b })
    assert.ok(grow <= 21, `card grows ${grow}`)
    await shot('home-link')
  })

  await step(`${tag} tap: "Dinner ideas" (18:30), header "N kcal left · M g protein to go", focus on the sheet, skeletons + "Asking Gemini for dinner ideas…" + Cancel; request has only kcal, protein, foods today, time`, async () => {
    const left = await leftNow()
    const pTarget = Number((await page.getByTestId('protein-target').innerText()).match(/[\d,]+/)[0])
    const release = hold()
    await openIdeas()
    assert.equal(await dialog.getByTestId('ideas-title').innerText(), 'Dinner ideas')
    assert.equal(await dialog.getByTestId('ideas-head').innerText(), `${left.toLocaleString('en-US')} kcal left · ${pTarget - 18} g protein to go`)
    await noKeyboard()
    assert.equal(await page.evaluate(() => !!document.activeElement?.closest('[role=dialog]')), true, 'focus in the sheet')
    await dialog.getByTestId('ideas-loading').waitFor()
    assert.equal(await dialog.getByTestId('idea-skeleton').count(), 3)
    assert.equal(await dialog.getByRole('status').innerText(), '✦ Asking Gemini for dinner ideas…')
    assert.equal(await dialog.getByRole('button', { name: 'Cancel' }).count(), 1)
    await layout('loading')
    await shot('loading')
    for (let i = 0; i < 50 && !G.bodies.length; i++) await page.waitForTimeout(100)
    const body = G.bodies.at(-1)
    assert.match(body, /18:30/); assert.match(body, new RegExp(`${left.toLocaleString("en-US")} kcal`)); assert.match(body, new RegExp(`${pTarget - 18} g`)); assert.match(body, /Kopi susu, Tempe goreng/)
    assert.doesNotMatch(body, /\b92\b|\b175\b|\b32\b|\bmale\b|weightKg|1859/, 'no weight, age or history')
    const j = JSON.parse(body)
    assert.ok(j.generationConfig.responseFormat.text.schema.properties.ideas.items.required.includes('protein_g'))
    release()
  })

  await step(`${tag} ideas: 3 cards (the 9,000 kcal one dropped) with name, why < 40, kcal, protein pill, "1 plate (380 g)", Log this; Show other ideas; footnote; chips`, async () => {
    await waitIdeas()
    assert.equal(G.bodies.length, 1)
    assert.deepEqual(await names(), ['Ayam bakar, nasi merah, lalapan', 'Pepes ikan with rice', 'Gado-gado'])
    const cards = dialog.getByTestId('idea')
    assert.equal(await cards.count(), 3)
    for (const why of await dialog.getByTestId('idea-why').allInnerTexts()) assert.ok(why.length < 40, why)
    assert.deepEqual(await dialog.getByTestId('idea-kcal').allInnerTexts(), ['480 kcal', '420 kcal', '450 kcal'])
    assert.deepEqual(await dialog.getByTestId('idea-protein').allInnerTexts(), ['38 g protein', '32 g protein', '18 g protein'])
    assert.deepEqual(await dialog.getByTestId('idea-serving').allInnerTexts(), ['1 plate (380 g)', '1 plate (380 g)', '1 bowl (350 g)'])
    assert.equal(await dialog.getByRole('button', { name: /^Log this/ }).count(), 3)
    assert.equal(await dialog.getByTestId('ideas-more').innerText(), 'Show other ideas')
    assert.equal(await dialog.getByTestId('ideas-foot').innerText(), 'Ideas from Gemini. Numbers are rough, check them before logging.')
    assert.deepEqual(await dialog.getByRole('group', { name: 'Preferences' }).getByRole('button').allInnerTexts(), ['Indonesian', 'Quick', 'Cheap'])
    await layout('ideas')
    await shot('ideas')
  })

  await step(`${tag} chip "Indonesian" asks again with that preference (not counted against the 5)`, async () => {
    G.reply = PREF
    await tapLoc(dialog.getByRole('button', { name: 'Indonesian' }))
    await dialog.getByText('Soto ayam').waitFor()
    assert.equal(await dialog.getByRole('button', { name: 'Indonesian' }).getAttribute('aria-pressed'), 'true')
    assert.match(G.bodies.at(-1), /Indonesian/)
    assert.equal(await page.evaluate(() => localStorage.getItem('calorie-app:ideas')), null)
    G.reply = SET1
    await tapLoc(dialog.getByRole('button', { name: 'Indonesian' }))
    await dialog.getByText('Gado-gado').waitFor()
    assert.equal(await dialog.getByRole('button', { name: 'Indonesian' }).getAttribute('aria-pressed'), 'false')
  })

  await step(`${tag} Log this: AI result sheet, one item, "Suggested by Gemini", stepper, Total pills, "Log 1 item · 480 kcal", no note, no keyboard; Edit goes back to the same 3 ideas`, async () => {
    const before = await names()
    const calls = G.bodies.length
    await tapLoc(dialog.getByRole('button', { name: 'Log this: Ayam bakar, nasi merah, lalapan' }))
    await dialog.getByRole('button', { name: /^Log 1 item/ }).waitFor()
    await page.waitForTimeout(300)
    assert.match(await dialog.innerText(), /Suggested by Gemini/)
    const items = dialog.getByRole('list', { name: 'Estimated items' }).getByRole('listitem')
    assert.equal(await items.count(), 1)
    assert.match(await items.first().innerText(), /Ayam bakar, nasi merah, lalapan/)
    assert.equal(await dialog.getByTestId('servings-hint').innerText(), 'Tap the number to type')
    assert.match(await dialog.innerText(), /Estimates are rough\. Adjust before logging\./)
    assert.match(await dialog.innerText(), /Total/)
    assert.equal(await dialog.getByRole('button', { name: /^Log 1 item/ }).innerText(), 'Log 1 item · 480 kcal')
    assert.equal(await dialog.locator('textarea').count(), 0, 'no note field')
    assert.equal(await dialog.getByTestId('photo-note').count(), 0)
    await noKeyboard()
    await layout('result', page, true)
    await shot('result')
    await tapLoc(dialog.getByRole('button', { name: 'Edit', exact: true }))
    await waitIdeas()
    assert.deepEqual(await names(), before)
    assert.equal(G.bodies.length, calls, 'no new request')
  })

  await step(`${tag} logging after the clock moved to 21:30 still goes to Dinner today; Home scrolls + highlights, toast "Added 1 item from AI · 480 kcal" + Undo, row "✦ AI"; Undo removes it`, async () => {
    await page.clock.setFixedTime(at('21:30'))
    const left = Number((await dialog.getByTestId('ideas-head').innerText()).match(/^([\d,]+)/)[1].replace(/,/g, ''))
    await tapLoc(dialog.getByRole('button', { name: 'Log this: Ayam bakar, nasi merah, lalapan' }))
    await tapLoc(dialog.getByRole('button', { name: /^Log 1 item/ }))
    await page.getByTestId('toast').waitFor()
    assert.equal(await dialog.count(), 0)
    assert.match(await page.getByTestId('toast').innerText(), /^Added 1 item from AI · 480 kcal\s*Undo$/)
    const s = await st()
    const e = s.entries.find((x) => x.name === 'Ayam bakar, nasi merah, lalapan')
    assert.deepEqual([e.meal, e.date, e.source, e.kcal, e.protein, e.servingLabel, e.qty], ['dinner', TODAY, 'photo', 480, 38, '1 plate (380 g)', 1])
    const row = page.locator(`[data-ids~="${e.id}"]`)
    assert.match(await row.getAttribute('class'), /row-flash/)
    const rt = await row.innerText(); assert.match(rt, /AI/, rt)
    assert.equal(await page.getByTestId('meal-dinner').locator(`[data-ids~="${e.id}"]`).count(), 1)
    await page.waitForTimeout(700) // smooth scroll settles
    const rb = await box(row)
    assert.ok(rb.t >= 0 && rb.b <= h, `scrolled into view ${rb.t}-${rb.b} of ${h}`)
    assert.equal(await leftNow(), left - 480, 'gauge, equation and goal line update')
    await shot('logged')
    await tapLoc(page.getByTestId('toast').getByRole('button', { name: 'Undo' }))
    await page.waitForTimeout(200)
    assert.equal((await st()).entries.some((x) => x.id === e.id), false)
    await page.clock.setFixedTime(at('18:30'))
  })

  await step(`${tag} "Show other ideas": 3 new ones, never a repeat, 5 a day, then "That's all the ideas for today" + local picks; calorie-app:ideas counts`, async () => {
    await page.evaluate(() => window.scrollTo(0, 0))
    G.reply = SET1
    await openIdeas(); await waitIdeas()
    assert.equal(await page.evaluate(() => localStorage.getItem('calorie-app:ideas')), null, 'no new key before a refresh')
    const seen = new Set(await names())
    for (let n = 1; n <= 5; n++) {
      G.reply = refreshSet(n)
      await tapLoc(dialog.getByTestId('ideas-more'))
      await dialog.getByText(`Idea ${n}a`).waitFor()
      const now = await names()
      assert.deepEqual(now, [`Idea ${n}a`, `Idea ${n}b`, `Idea ${n}c`])
      for (const x of now) { assert.ok(!seen.has(x), `repeat ${x}`); seen.add(x) }
      assert.match(G.bodies.at(-1), /Gado-gado/, 'already shown names sent as avoid list')
      assert.deepEqual(JSON.parse(await page.evaluate(() => localStorage.getItem('calorie-app:ideas'))), { date: TODAY, count: n })
    }
    assert.equal(await dialog.getByTestId('ideas-more').count(), 0)
    assert.equal(await dialog.getByTestId('ideas-capped').innerText(), "That's all the ideas for today")
    await dialog.getByTestId('ideas-picks').waitFor()
    assert.equal(await dialog.getByTestId('ideas-picks').getByTestId('idea').count(), 3)
    await layout('capped')
    // Tall sheet scrolls.
    const sc = await dialog.evaluate((d) => { d.scrollTop = 99999; return { top: d.scrollTop, sh: d.scrollHeight, ch: d.clientHeight } })
    if (sc.sh > sc.ch) assert.ok(sc.top > 0)
    await dialog.evaluate((d) => { d.scrollTop = 0 })
    await page.keyboard.press('Escape'); await dialog.waitFor({ state: 'detached' })
    await openIdeas(); await waitIdeas()
    assert.equal(await dialog.getByTestId('ideas-capped').count(), 1, 'still capped on reopen')
  })

  await step(`${tag} local pick "Log this": normal food sheet, toast "Added <food> · N kcal", saved to Dinner; nothing eaten today, no drinks, under the cap`, async () => {
    const picks = dialog.getByTestId('ideas-picks').getByTestId('idea')
    const pn = await picks.getByTestId('idea-name').allInnerTexts()
    assert.ok(!pn.includes('Tempe goreng') && !pn.includes('Kopi susu'), pn.join(','))
    const name = pn[0]
    await tapLoc(picks.first().getByRole('button', { name: /^Log this/ }))
    await page.waitForTimeout(300)
    await noKeyboard()
    await layout('food sheet')
    await tapLoc(dialog.getByRole('button', { name: /^Add [\d,]+ kcal$/ }))
    await page.getByTestId('toast').waitFor()
    assert.match(await page.getByTestId('toast').innerText(), new RegExp(`^Added ${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} · [\\d,]+ kcal\\s*Undo$`))
    const e = (await st()).entries.at(-1)
    assert.deepEqual([e.name, e.meal, e.date], [name, 'dinner', TODAY])
    await tapLoc(page.getByTestId('toast').getByRole('button', { name: 'Undo' }))
    await page.waitForTimeout(200)
  })

  await step(`${tag} + menu keeps its 4 pills, Log keeps its ✦ button (nothing else changed)`, async () => {
    await page.evaluate(() => window.scrollTo(0, 0))
    await tapLoc(page.getByTestId('plus'))
    await page.getByTestId('plus-menu').waitFor()
    assert.equal(await page.getByRole('menu', { name: 'Log food' }).getByRole('menuitem').count(), 4)
    await tapLoc(page.getByTestId('plus-close'))
    await page.goto(BASE + '/log'); await page.getByTestId('ai-btn').waitFor()
    assert.equal(await page.getByTestId('ideas-link').count(), 0)
  })

  await step(`${tag} History range pills (Jordy's v1.20 tweak): right-aligned to the content edge, 44 px, selected one filled with a soft green tint (#dcebd9, text #146c3b, AA), not the switch's look; others unchanged`, async () => {
    await page.goto(BASE + '/history'); await page.getByTestId('history-controls').waitFor(); await page.waitForTimeout(500)
    const rg = page.getByRole('group', { name: 'Range' }), vg = page.getByRole('group', { name: 'View' })
    const btns = rg.getByRole('button')
    assert.deepEqual(await btns.allInnerTexts(), ['7d', '30d', 'Custom'])
    const v = await box(vg), last = await box(btns.last()), first = await box(btns.first())
    assert.ok(Math.abs(last.r - v.r) <= 1, `right edge ${last.r} = switch right ${v.r}`)
    assert.ok(Math.abs((w - v.r) - v.l) <= 1, 'same right padding as the left (content margin)')
    assert.ok(first.l > w / 2 - 40, 'pills keep their size, not stretched')
    const look = (loc) => loc.evaluate((e) => { const s = getComputedStyle(e); return { bg: s.backgroundColor, c: s.color, b: s.borderTopColor, h: e.getBoundingClientRect().height } })
    const lum = (rgb) => { const c = rgb.match(/\d+/g).slice(0, 3).map((x) => { x /= 255; return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4 }); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2] }
    const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => m - n); return (y + 0.05) / (x + 0.05) }
    const check = async (onName) => {
      for (const b of await btns.all()) {
        const l = await look(b), on = (await b.getAttribute('aria-pressed')) === 'true'
        assert.ok(l.h >= 43.5, `44 px tap ${l.h}`)
        if (on) {
          assert.equal(await b.innerText(), onName)
          assert.equal(l.bg, 'rgb(220, 235, 217)', 'selected: soft green tint fill')
          assert.equal(l.c, 'rgb(20, 108, 59)', 'selected: g-soft-ink text')
          assert.ok(ratio(l.bg, l.c) >= 4.5, `AA ${ratio(l.bg, l.c)}`)
        } else {
          assert.equal(l.bg, 'rgb(255, 253, 248)', 'unselected: card')
          assert.equal(l.c, 'rgb(107, 103, 95)', 'unselected: mute text')
          assert.equal(l.b, 'rgb(231, 223, 208)', 'unselected: light line')
        }
      }
      assert.ok(lum((await look(btns.filter({ hasText: onName }))).bg) < lum('rgb(255, 253, 248)'), 'selected is darker than unselected')
    }
    await check('7d')
    // Not the switch's selected look (white thumb on the track).
    const thumbBg = await page.getByTestId('view-thumb').evaluate((e) => getComputedStyle(e).backgroundColor)
    assert.notEqual((await look(btns.first())).bg, thumbBg)
    await page.evaluate(() => window.scrollTo(0, 0)); await page.waitForTimeout(300)
    await page.screenshot({ path: `${OUT}v120-history-chips-${w}.png` })
    await tapLoc(rg.getByRole('button', { name: '30d (30 days)' })); await page.waitForTimeout(300)
    await check('30d')
    await tapLoc(rg.getByRole('button', { name: '7d (7 days)' })); await page.waitForTimeout(300)
    await home()
  })

  await step(`${tag} storage stays v3; :v2 :v1 :ai :foods byte-identical; only new key calorie-app:ideas (device-only counter)`, async () => {
    const s = await page.evaluate(() => Object.fromEntries(Object.keys(localStorage).map((k) => [k, localStorage.getItem(k)])))
    assert.deepEqual(Object.keys(s).sort(), ['calorie-app:ai', 'calorie-app:backup', 'calorie-app:foods', 'calorie-app:ideas', 'calorie-app:v1', 'calorie-app:v2', 'calorie-app:v3'])
    for (const [k, v] of Object.entries(FIXED)) assert.equal(s[k], v, k)
    const v3 = JSON.parse(s['calorie-app:v3'])
    assert.equal(v3.version, 3)
    assert.deepEqual(Object.keys(v3).sort(), Object.keys(JSON.parse(V3)).sort())
    assert.deepEqual(Object.keys(JSON.parse(s['calorie-app:ideas'])).sort(), ['count', 'date'])
  })
  await ctx.close()

  // ---------- No key (online and offline) ----------
  {
    const fixed = { ...FIXED }; delete fixed['calorie-app:ai']
    const { ctx, page: p, G: g } = await open({ fixed })
    await step(`${tag} no key: muted "Ideas from AI · Need AI key", "Add a key in Me", 3 picks; offline too; button goes to Me › AI photo estimate without the keyboard`, async () => {
      await home(p)
      await openIdeas(p)
      const d = p.getByRole('dialog')
      assert.equal(await d.getByTestId('ideas-sub').innerText(), 'Need AI key')
      assert.match(await d.getByTestId('ideas-nokey').innerText(), /Ideas from AI/)
      assert.equal(await d.getByTestId('ideas-nokey').evaluate((e) => getComputedStyle(e).backgroundColor), 'rgb(239, 231, 216)')
      assert.equal(await d.getByTestId('ideas-picks').getByTestId('idea').count(), 3)
      assert.match(await d.getByTestId('ideas-picks').innerText(), /^Picks from your foods that fit/)
      assert.equal(await d.getByRole('group', { name: 'Preferences' }).count(), 0, 'no chips without AI')
      assert.equal(g.bodies.length, 0)
      await layout('no key', p)
      await shot('nokey', p)
      await p.keyboard.press('Escape'); await d.waitFor({ state: 'detached' })
      await ctx.setOffline(true); await p.waitForTimeout(200)
      await openIdeas(p)
      assert.equal(await d.getByTestId('ideas-sub').innerText(), 'Need AI key', 'no key wins over offline')
      await ctx.setOffline(false); await p.waitForTimeout(200)
      await tapLoc(d.getByRole('button', { name: 'Add a key in Me' }), p)
      await p.waitForURL('**/settings?ai=1&kb=0')
      await p.waitForTimeout(800)
      await noKeyboard(p)
      const card = await p.getByRole('textbox', { name: /key/i }).first().evaluate((e) => { const r = e.getBoundingClientRect(); return { t: r.top, b: r.bottom } })
      assert.ok(card.t >= 0 && card.t < h, 'AI card in view')
    })
    await ctx.close()
  }

  // ---------- Offline with a key, errors ----------
  {
    const { ctx, page: p, G: g } = await open({})
    const d = p.getByRole('dialog')
    await step(`${tag} offline with a key: "Needs internet", Try again, 3 picks, nothing sent; Try again online loads ideas`, async () => {
      await home(p)
      await ctx.setOffline(true); await p.waitForTimeout(200)
      await openIdeas(p)
      assert.equal(await d.getByTestId('ideas-sub').innerText(), 'Needs internet')
      assert.equal(await d.getByTestId('ideas-picks').getByTestId('idea').count(), 3)
      assert.equal(g.bodies.length, 0, 'nothing sent')
      await layout('offline', p)
      await shot('offline', p)
      await ctx.setOffline(false); await p.waitForTimeout(200)
      await tapLoc(d.getByRole('button', { name: 'Try again' }), p)
      await waitIdeas(p)
      assert.equal(await d.getByTestId('idea').count(), 3)
      await p.keyboard.press('Escape'); await d.waitFor({ state: 'detached' })
    })
    for (const [kind, err, btn] of [['key', { status: 400, code: 'INVALID_ARGUMENT', message: 'API key not valid. Please pass a valid API key.' }, 'Check key in Me'], ['busy', { status: 503, code: 'UNAVAILABLE', message: 'The model is overloaded.' }, 'Try again'], ['failed', { status: 400, code: 'INVALID_ARGUMENT', message: 'Request contains an invalid argument.' }, 'Try again']]) {
      await step(`${tag} AI error (${kind}): "${TITLES[kind]}" from errorText, "${btn}", 3 picks below`, async () => {
        g.err = err
        await openIdeas(p)
        await d.getByTestId('ideas-error').waitFor()
        const box2 = d.getByTestId('ideas-error')
        assert.equal(await box2.getByRole('heading').innerText(), TITLES[kind])
        assert.equal(await box2.getByRole('button').innerText(), btn)
        assert.equal(await d.getByTestId('ideas-picks').getByTestId('idea').count(), 3)
        await layout(`error ${kind}`, p)
        if (kind === 'busy') {
          g.err = null
          await tapLoc(box2.getByRole('button', { name: 'Try again' }), p)
          await waitIdeas(p)
        }
        g.err = null
        await p.keyboard.press('Escape'); await d.waitFor({ state: 'detached' })
      })
    }
    await step(`${tag} Cancel while loading closes the sheet (first ask) or returns to the shown ideas (refresh)`, async () => {
      let release = hold(g)
      await openIdeas(p)
      await tapLoc(d.getByRole('button', { name: 'Cancel' }), p)
      await d.waitFor({ state: 'detached' })
      release()
      await openIdeas(p); await waitIdeas(p)
      const before = await names(p)
      release = hold(g)
      await tapLoc(d.getByTestId('ideas-more'), p)
      await d.getByTestId('ideas-loading').waitFor()
      await tapLoc(d.getByRole('button', { name: 'Cancel' }), p)
      await waitIdeas(p)
      assert.deepEqual(await names(p), before)
      release()
      await p.waitForTimeout(200)
      assert.equal(await p.evaluate(() => localStorage.getItem('calorie-app:ideas')), null, 'a cancelled refresh does not count')
      await p.keyboard.press('Escape'); await d.waitFor({ state: 'detached' })
    })
    await ctx.close()
  }

  // ---------- Over the goal, protein hit, Keep / Gain bands, closed and past days ----------
  {
    const { ctx, page: p, G: g } = await open({})
    const d = p.getByRole('dialog')
    const setDay = async (mut) => { await p.evaluate((m) => { const s = JSON.parse(localStorage.getItem('calorie-app:v3')); new Function('s', m)(s); localStorage.setItem('calorie-app:v3', JSON.stringify(s)) }, mut); await home(p) }
    await home(p)
    const L = await leftNow(p)
    // dailyGoal is re-derived from the goal-date plan on load, so read the real one (not the seeded 500)
    const GO = await p.evaluate(() => JSON.parse(localStorage.getItem('calorie-app:v3')).profile.dailyGoal)
    const f = (n) => n.toLocaleString('en-US')
    await step(`${tag} over the goal (Deficit, orange): "✦ Still hungry? Light ideas"; sheet "You're over today's goal", "120 kcal over your G goal · Deficit G-120", I'm done for today, light ideas under 150`, async () => {
      await setDay(`s.entries.push(${JSON.stringify(q('big', 'Nasi padang', L + 120, 30))})`)
      assert.equal(await p.getByTestId('goal-progress').innerText(), `120 kcal over your ${f(GO)} goal.`)
      assert.equal((await p.getByTestId('ideas-link').innerText()).trim(), 'Still hungry? Light ideas')
      await shot('home-over', p)
      g.reply = LIGHT
      await openIdeas(p); await waitIdeas(p)
      assert.equal(await d.getByTestId('ideas-title').innerText(), "You're over today's goal")
      assert.equal(await d.getByTestId('ideas-head').innerText(), `120 kcal over your ${f(GO)} goal · Deficit ${f(GO - 120)}`)
      assert.match(await d.getByTestId('ideas-term').getAttribute('class'), /text-over-ink/)
      assert.equal(await d.getByRole('button').first().innerText(), "I'm done for today")
      assert.match(await d.innerText(), /Light ideas under 150 kcal/)
      assert.deepEqual(await names(p), ['Telur rebus, 2', 'Tahu kukus', 'Greek yogurt cup'], 'the 600 kcal one dropped')
      for (const k of await d.getByTestId('idea-kcal').allInnerTexts()) assert.ok(Number(k.match(/\d+/)[0]) <= 150)
      assert.equal(await d.getByRole('group', { name: 'Preferences' }).count(), 0, 'no chips when over')
      assert.match(g.bodies.at(-1), /150 kcal/)
      await noKeyboard(p)
      await layout('over', p)
      await shot('over', p)
      await tapLoc(d.getByRole('button', { name: "I'm done for today" }), p)
      await d.waitFor({ state: 'detached' })
    })
    await step(`${tag} over the goal (Surplus, red): header "· Surplus 80" in red`, async () => {
      await setDay(`s.entries.find((e) => e.id === 'big').kcal = ${L + GO + 80}`)
      assert.equal((await p.getByTestId('ideas-link').innerText()).trim(), 'Still hungry? Light ideas')
      await openIdeas(p); await waitIdeas(p)
      assert.equal(await d.getByTestId('ideas-head').innerText(), `${f(GO + 80)} kcal over your ${f(GO)} goal · Surplus 80`)
      assert.match(await d.getByTestId('ideas-term').getAttribute('class'), /text-deep-ink/)
      await p.keyboard.press('Escape'); await d.waitFor({ state: 'detached' })
    })
    await step(`${tag} protein target hit: header "N kcal left · Target hit" in green; request says protein is done`, async () => {
      g.reply = SET1
      await setDay(`s.entries = s.entries.filter((e) => e.id !== 'big'); s.entries.push(${JSON.stringify(q('pro', 'Whey', 100, 400))})`)
      await openIdeas(p); await waitIdeas(p)
      assert.match(await d.getByTestId('ideas-head').innerText(), /^[\d,]+ kcal left · Target hit$/)
      assert.match(await d.getByTestId('ideas-hit').getAttribute('class'), /text-g-ink/)
      assert.match(g.bodies.at(-1), /already hit/i)
      await p.keyboard.press('Escape'); await d.waitFor({ state: 'detached' })
    })
    await step(`${tag} Keep plan in its band and Gain plan above its goal get the normal link`, async () => {
      await setDay(`s.entries = s.entries.filter((e) => e.id !== 'pro'); s.profile.goal = 'keep'`)
      const K = await leftNow(p)
      await setDay(`s.entries.push(${JSON.stringify(q('k', 'Nasi', K - 20, 5))})`)
      assert.match(await p.getByTestId('goal-progress').innerText(), /^On target/)
      assert.equal((await p.getByTestId('ideas-link').innerText()).trim(), 'What should I eat?')
      await setDay(`s.entries.find((e) => e.id === 'k').kcal = ${K + 300}`)
      assert.match(await p.getByTestId('goal-progress').innerText(), /over break even/)
      assert.equal((await p.getByTestId('ideas-link').innerText()).trim(), 'Still hungry? Light ideas')
      await setDay(`s.entries = s.entries.filter((e) => e.id !== 'k'); s.profile.goal = 'gain'; s.profile.goalWeightKg = 96`)
      const G2 = await leftNow(p)
      await setDay(`s.entries.push(${JSON.stringify(q('g', 'Nasi', G2 + 500, 5))})`)
      assert.match(await p.getByTestId('goal-progress').innerText(), /over your \+[\d,]+ goal/)
      assert.equal((await p.getByTestId('ideas-link').innerText()).trim(), 'What should I eat?')
    })
    await step(`${tag} closed today and past days: no link`, async () => {
      await setDay(`s.entries = s.entries.filter((e) => e.id !== 'g'); s.profile.goal = 'lose'; s.profile.goalWeightKg = 85`)
      assert.equal(await p.getByTestId('ideas-link').count(), 1)
      await tapLoc(p.getByTestId('day-prev'), p); await p.waitForTimeout(300)
      assert.equal(await p.getByTestId('ideas-link').count(), 0, 'past day')
      await home(p)
      await p.getByRole('button', { name: 'Close day' }).click()
      await home(p)
      await p.getByTestId('closed-pill').waitFor()
      assert.equal(await p.getByTestId('ideas-link').count(), 0, 'closed today')
    })
    await ctx.close()
  }
}
await browser.close()
console.log(results.join('\n'))
if (errors.length) { console.log(errors.join('\n')); process.exit(1) }
console.log(`\n${results.length} passed`)
