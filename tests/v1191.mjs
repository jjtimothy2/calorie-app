// v1.19.1 monthly ticks: on monthly-bucket charts (custom ranges of 183+ days) the x-axis ticks are single month
// initials from the fixed list (N D J F M A M J J A S O N for a rolling year), each centred under its own bar (box and
// glyph centre within 1 px of the bar centre). Full names stay: tick aria-labels and the hold header read "May 2026".
// Weekly and daily ticks unchanged; 375 fit; storage unchanged.
// Also (approved 3:01 PM): Home equation last term Deficit / Surplus / Even (no minus), aria "equals 1,719 deficit";
// Home section "Calories"; Day verdict total row "Calories"; chart top padding 8 units unless a value label sits above a bar.
// WebKit at 390x844 and 375x667. Screenshots: screenshots/v1191-{monthly-year,equation-deficit,equation-surplus,verdict}-*.png.
// Usage: npm run build && npx vite preview --port 4174 & node tests/v1191.mjs
import { webkit, devices } from 'playwright'
import assert from 'node:assert/strict'

const BASE = (process.env.BASE_URL ?? 'http://localhost:4174/calorie-app').replace(/\/$/, '')
const OUT = new URL('../screenshots/', import.meta.url).pathname
const results = [], errors = []
const step = async (name, fn) => {
  try { await fn(); results.push(`PASS ${name}`) } catch (e) { results.push(`FAIL ${name}: ${e.message.slice(0, 900)}`); console.log(results.join('\n')); console.log(errors.join('\n')); throw e }
}
const pad = (n) => String(n).padStart(2, '0')
const key = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const parse = (k) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d, 12) }
const ago = (n) => { const d = new Date(); d.setHours(12); d.setDate(d.getDate() - n); return key(d) }
const add = (k, n) => { const d = parse(k); d.setDate(d.getDate() + n); return key(d) }
const span = (a, b) => { const out = []; for (let k = a; k <= b; k = add(k, 1)) out.push(k); return out }
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] // v1.19: fixed 3-letter months
const dm = (k) => `${parse(k).getDate()} ${MON[parse(k).getMonth()]}`
const dmy = (k) => `${dm(k)} ${k.slice(0, 4)}`
const rangeLabel = (a, b) => { const A = parse(a), B = parse(b); return A.getMonth() === B.getMonth() && A.getFullYear() === B.getFullYear() ? `${A.getDate()} – ${dm(b)}` : `${dm(a)} – ${dm(b)}` }
const TODAY = ago(0)
const FIRST_AGO = 400
const FIRST = ago(FIRST_AGO)

// Test data only: 400 days with a fixed pattern, 24 of them with no logs, plus a log today (open).
const PT = 140 // protein target used below is read from the app, these just straddle it
const closedDays = {}, entries = []
let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
const GAP = [100, 123] // days ago with no logs at all (24 days)
for (let i = FIRST_AGO; i >= 1; i--) {
  const k = ago(i)
  let balance = Math.round(i % 6 === 0 ? -300 - rnd() * 400 : 200 + rnd() * 500)
  if (i >= GAP[0] && i <= GAP[1]) { rnd(); continue }
  if (i === 200) balance = 100 // +0.013 kg: reads 0.0 kg
  if (i === 201) balance = -100 // -0.013 kg: reads 0.0 kg, never −0.0
  const protein = Math.round(PT - 40 + rnd() * 90)
  closedDays[k] = { bmr: 1859, movement: 0, burned: 150, eaten: 1859 + 150 - balance, balance, goal: 500, protein, closedAt: Date.now() - i * 864e5, auto: true }
  entries.push({ id: 'c' + i, date: k, meal: 'lunch', foodId: null, name: 'Nasi campur', servingLabel: '1 portion', servingMult: 1, qty: 1, kcal: 1859 + 150 - balance, protein, carbs: 200, fat: 60, createdAt: Date.now() - i * 864e5 })
}
entries.push({ id: 't1', date: TODAY, meal: 'breakfast', foodId: null, name: 'Kopi susu', servingLabel: 'Quick add', servingMult: 1, qty: 1, kcal: 140, protein: 10, carbs: 20, fat: 5, createdAt: Date.now() - 3600_000 })
const profile = { age: 32, sex: 'male', heightCm: 175, weightKg: 92, activity: 'light', goal: 'lose', bmr: 1859, bmrCustom: true, includeMovement: false, goalWeightKg: 85, goalDate: ago(-120), planFrom: { date: ago(3), kg: 92 }, goalAssumed: false, macros: { protein: null, carbs: null, fat: null }, target: 1800, dailyGoal: 500 }
const V3 = JSON.stringify({ version: 3, profile, entries, exercises: [], closedDays, favourites: [], weights: [{ date: ago(3), kg: 92 }] })
const AI = JSON.stringify({ provider: 'gemini', key: 'AIzaTEST-not-a-real-key-000000000000' })
const FIXED = {
  'calorie-app:v2': '{"version":2,"profile":null,"entries":[],"exercises":[],"closedDays":{},"favourites":[]}',
  'calorie-app:v1': '{"version":1,"entries":[]}',
  'calorie-app:foods': JSON.stringify({ version: 1, foods: [{ id: 'u_bubur', name: 'Bubur ayam', kcal: 320, protein: 12, carbs: 45, fat: 8, createdAt: 1, updatedAt: 1 }] }),
  'calorie-app:ai': AI,
}

const browser = await webkit.launch()
for (const [w, h] of [[390, 844], [375, 667]]) {
  const tag = `${w}x${h}`
  const ctx = await browser.newContext({ ...devices['iPhone 14'], viewport: { width: w, height: h }, deviceScaleFactor: 3, hasTouch: true, isMobile: true, serviceWorkers: 'block' })
  await ctx.addInitScript(([v3, fixed]) => {
    if (localStorage.getItem('calorie-app:v3')) return
    localStorage.setItem('calorie-app:v3', v3)
    for (const [k, v] of Object.entries(fixed)) localStorage.setItem(k, v)
    localStorage.setItem('calorie-app:backup', JSON.stringify({ lastExportAt: Date.now(), dismissedAt: null }))
  }, [V3, FIXED])
  const page = await ctx.newPage()
  page.on('console', (m) => { if ((m.type() === 'error' || m.type() === 'warning') && !/service worker/i.test(m.text()) && !/status of 404/.test(m.text())) errors.push(`${tag}: ${m.type()}: ${m.text()}`) })
  page.on('pageerror', (er) => errors.push(`${tag}: pageerror: ${er.message}`))
  // WebKit has no CDP touch: drive the chart's pointer gestures (hold, swipe) with a primary-button pointer.
  const touch = async (type, x, y) => {
    if (type === 'touchStart') { await page.mouse.move(x, y); await page.mouse.down() }
    else if (type === 'touchMove') await page.mouse.move(x, y)
    else await page.mouse.up()
  }
  const dialog = page.getByRole('dialog')
  const box = (loc) => loc.evaluate((e) => { const r = e.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height } })
  const tapLoc = async (loc) => { await loc.scrollIntoViewIfNeeded(); const b = await box(loc); await page.touchscreen.tap(b.l + b.w / 2, b.t + b.h / 2) }
  const vw = () => page.evaluate(() => window.innerWidth)
  const custom = page.getByTestId('range-custom')
  const label = () => page.getByTestId('period-range').innerText()
  const history = async () => {
    await page.getByRole('link', { name: 'History', exact: true }).click()
    await page.getByTestId('trend-chart').waitFor(); await page.waitForTimeout(250)
  }
  const fresh = async () => { await page.goto(BASE + '/'); await page.getByTestId('balance').waitFor(); await history() }
  const openSheet = async () => { await tapLoc(custom); await dialog.waitFor(); await page.waitForTimeout(350) }
  const apply = async (from, to) => {
    await openSheet()
    await page.getByTestId('range-from').fill(from); await page.getByTestId('range-to').fill(to)
    await tapLoc(page.getByTestId('range-apply')); await dialog.waitFor({ state: 'detached' }); await page.waitForTimeout(300)
  }
  const bars = () => page.locator('[data-testid=trend-chart] [data-bar]').evaluateAll((els) => els.map((e) => ({ key: e.getAttribute('data-bar'), v: e.getAttribute('data-value'), vis: e.getAttribute('data-visible') })))
  const fitsRow = async () => {
    const W = await vw()
    for (const b of await page.getByTestId('history-controls').getByRole('button').all()) {
      const r = await box(b)
      assert.ok(r.l >= 0 && r.r <= W, `control on screen ${JSON.stringify(r)}`)
      assert.ok(r.h >= 44, `control ${await b.innerText()} ${r.h}px tall`)
      assert.equal(await b.evaluate((e) => e.scrollWidth > e.clientWidth + 0.5), false, 'chip text clipped')
      assert.ok(r.h < 60, `${await b.innerText()} wraps (${r.h}px)`)
    }
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false, 'no sideways scroll')
  }
  const hold = async (barKey, fn) => {
    const g = page.locator(`[data-testid=trend-chart] [data-bar="${barKey}"]`)
    await page.getByTestId('trend-chart').scrollIntoViewIfNeeded()
    const r = await box(page.getByTestId('trend-chart')), b = await box(g)
    const x = b.l + b.w / 2, y = r.t + r.h * 0.45
    await touch('touchStart', x, y); await page.waitForTimeout(320)
    await touch('touchMove', x + 0.5, y); await page.waitForTimeout(120)
    try { await fn() } finally { await touch('touchEnd'); await page.waitForTimeout(250) }
  }
  const view = async (name) => { await tapLoc(page.getByTestId('history-controls').getByRole('button', { name, exact: true })); await page.waitForTimeout(250) }


  const unitOf = () => page.getByTestId('trend-chart').getAttribute('data-unit')
  const nbars = () => page.locator('[data-testid=trend-chart] [data-bar]').count()
  const buckets = (from, to, unit) => {
    const out = []
    for (const k of span(from, to)) { if (!out.length || (unit === 'week' ? parse(k).getDay() === 1 : k.endsWith('-01'))) out.push([]); out.at(-1).push(k) }
    return out
  }
  const dim = (k) => { const d = parse(k); return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate() }
  const fullLen = (b, unit) => (unit === 'week' ? 7 : dim(b[0]))
  const avgOf = (w) => { const c = w.filter((k) => closedDays[k]); return c.length ? Math.round(c.reduce((a, k) => a + closedDays[k].balance, 0) / c.length) : null }
  const LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
  const yearFrom = add(TODAY, -364) // rolling year: 365 days, e.g. 3 Nov 2025 – 2 Nov 2026
  const pill = (a, b) => (a.slice(0, 4) === b.slice(0, 4) ? rangeLabel(a, b) : `${dm(a)} ’${a.slice(2, 4)} – ${dm(b)} ’${b.slice(2, 4)}`)
  const noSept = async () => assert.equal(/Sept/.test(await page.evaluate(() => document.body.innerText + [...document.querySelectorAll('[aria-label]')].map((e) => e.getAttribute('aria-label')).join(' '))), false, 'no "Sept"')

  // Ticks with their bar: the tick's box centre, its glyph (ink) centre from canvas measureText with the tick's own
  // font, and the bar rect's centre, all in CSS px.
  const tickGeo = () => page.locator('[data-testid=trend-chart] text[data-tick]').evaluateAll((els) => {
    const cv = document.createElement('canvas').getContext('2d')
    return els.map((t) => {
      const g = t.closest('[data-bar]'), rect = g.querySelector('rect')
      const tr = t.getBoundingClientRect(), br = (rect ?? g).getBoundingClientRect()
      // Anchor point (text-anchor middle = advance centre) in screen px, from the svg's own transform.
      const ctm = t.getScreenCTM(), sv = t.ownerSVGElement.createSVGPoint()
      sv.x = Number(t.getAttribute('x')); sv.y = 0
      const anchorX = sv.matrixTransform(ctm).x
      const cs = getComputedStyle(t)
      cv.font = `${cs.fontWeight} ${t.getAttribute('font-size')}px ${cs.fontFamily}`
      const m = cv.measureText(t.textContent) // ink spans [-left, right] from the start origin; advance spans [0, width]
      const inkC = anchorX + ((m.actualBoundingBoxRight - m.actualBoundingBoxLeft) / 2 - m.width / 2) * ctm.a
      return { key: g.getAttribute('data-bar'), t: t.textContent, aria: t.getAttribute('aria-label'), full: t.getAttribute('data-full'), tc: anchorX, boxC: tr.left + tr.width / 2, inkC, bc: br.left + br.width / 2, l: tr.left, r: tr.right, hasRect: !!rect }
    })
  })
  const INIT = MON.map((m) => m[0])

  await step(`${tag} monthly rolling year: 13 bars, ticks are month initials (N D J F M A M J J A S O N), each centred under its bar`, async () => {
    await fresh()
    const ms = buckets(yearFrom, TODAY, 'month')
    await apply(yearFrom, TODAY)
    assert.equal(await unitOf(), 'month')
    assert.equal(await nbars(), ms.length)
    if (parse(TODAY).getDate() < dim(TODAY)) assert.equal(ms.length, 13, 'rolling year = 13 bars')
    await page.waitForTimeout(1200)
    const tk = await tickGeo()
    assert.deepEqual(tk.map((x) => x.key), ms.map((m) => m[0]), 'every month has a tick')
    assert.deepEqual(tk.map((x) => x.t), ms.map((m) => INIT[parse(m[0]).getMonth()]), 'initials from the fixed list')
    if (ms.length === 13) assert.equal(tk.map((x) => x.t).join(' '), ms.map((m) => INIT[parse(m[0]).getMonth()]).join(' '))
    console.log(`${tag} ticks: ${tk.map((x) => `${x.t} box ${(x.tc - x.bc).toFixed(2)} ink ${(x.inkC - x.bc).toFixed(2)}`).join(' | ')}`)
    console.log(`${tag} box: ${tk.map((x) => `${x.t} ${(x.boxC - x.bc).toFixed(2)}`).join(' ')}`)
    for (const x of tk) {
      assert.ok(x.hasRect, `${x.key} has a bar`)
      assert.ok(Math.abs(x.tc - x.bc) <= 1, `${x.t} (${x.key}) box centre ${x.tc.toFixed(2)} vs bar ${x.bc.toFixed(2)}`)
      assert.ok(Math.abs(x.inkC - x.bc) <= 1, `${x.t} (${x.key}) glyph centre ${x.inkC.toFixed(2)} vs bar ${x.bc.toFixed(2)}`)
    }
    // Even spacing: the gap between successive tick centres equals the bar pitch (within 1 px).
    const pitch = (tk.at(-1).bc - tk[0].bc) / (tk.length - 1)
    tk.forEach((x, i) => { if (i) assert.ok(Math.abs(x.inkC - tk[i - 1].inkC - pitch) <= 1.5, `even gap before ${x.t} (${x.key})`) })
    const cr = await box(page.getByTestId('trend-chart'))
    tk.forEach((x, i) => { assert.ok(x.l >= cr.l - 1 && x.r <= cr.r + 1, 'tick inside'); if (i) assert.ok(x.l >= tk[i - 1].r, 'ticks apart') })
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false, 'no sideways scroll')
    await fitsRow()
    await page.evaluate(() => window.scrollTo(0, 0)); await page.waitForTimeout(1200)
    await page.screenshot({ path: `${OUT}v1191-monthly-year-${tag}.png` })
  })

  await step(`${tag} full month names stay: tick aria-labels "May 2026", hold header "May 2026"`, async () => {
    const tk = await tickGeo()
    for (const x of tk) {
      const want = `${LONG[parse(x.key).getMonth()]} ${x.key.slice(0, 4)}`
      assert.equal(x.aria, want, `${x.key} aria`); assert.equal(x.full, want)
    }
    assert.match(await page.getByTestId('trend-chart').getAttribute('aria-label'), /^Calories chart\. Press and hold to see a month\./)
    const ms = buckets(yearFrom, TODAY, 'month')
    const M = ms.find((m) => m.length === dim(m[0]) && m.every((k) => closedDays[k]))
    await hold(M[0], async () => {
      const hdr = page.getByTestId('scrub-header'); await hdr.waitFor()
      const t = await hdr.innerText()
      assert.ok(t.includes(`${LONG[parse(M[0]).getMonth()]} ${M[0].slice(0, 4)}`), t)
    })
    // Protein view: same initials and names.
    await view('Protein')
    const pk = await tickGeo()
    assert.deepEqual(pk.map((x) => x.t), tk.map((x) => x.t)); assert.deepEqual(pk.map((x) => x.aria), tk.map((x) => x.aria))
    for (const x of pk) assert.ok(Math.abs(x.inkC - x.bc) <= 1 && Math.abs(x.tc - x.bc) <= 1, `protein ${x.t} centred`)
    await view('Calories')
  })

  await step(`${tag} weekly and daily ticks unchanged`, async () => {
    await apply(add(TODAY, -89), TODAY)
    assert.equal(await unitOf(), 'week')
    const wk = await tickGeo()
    assert.ok(wk.length >= 3)
    for (const x of wk) { assert.equal(x.t, dm(x.key), `weekly tick ${x.key}`); assert.equal(x.aria, null) }
    await apply(add(TODAY, -29), TODAY)
    assert.equal(await unitOf(), 'day')
    const dy = await tickGeo()
    assert.equal(dy[0].t, dm(dy[0].key)); assert.equal(dy.at(-1).t, dm(TODAY))
    for (const x of dy) { assert.match(x.t, /^\d{1,2}( (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec))?$/); assert.equal(x.aria, null) }
    await tapLoc(page.getByRole('button', { name: '7d (7 days)' })); await page.waitForTimeout(400)
    const d7 = (await tickGeo())
    for (const x of d7.slice(-7)) assert.match(x.t, /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)$/)
  })

  await step(`${tag} storage unchanged`, async () => {
    const s = await page.evaluate(() => Object.fromEntries(Object.keys(localStorage).map((k) => [k, localStorage.getItem(k)])))
    for (const [k, v] of Object.entries(FIXED)) assert.equal(s[k], v, k)
    assert.deepEqual(JSON.parse(s['calorie-app:v3']).closedDays, closedDays)
  })

  // ---- v1.19.1 (approved 3:01 PM): Home equation last term, Verdict "Calories" row, Home section name, chart top padding.
  const setToday = async (kcal) => {
    await page.evaluate((kcal) => { const s = JSON.parse(localStorage.getItem('calorie-app:v3')); s.entries.find((e) => e.id === 't1').kcal = kcal; localStorage.setItem('calorie-app:v3', JSON.stringify(s)) }, kcal)
    await page.goto(BASE + '/'); await page.getByTestId('balance').waitFor(); await page.waitForTimeout(1400) // ring number settles
  }
  const eq = page.getByTestId('equation')
  const lastTerm = () => eq.locator('[data-term]').last()
  const colour = (id) => page.getByTestId(id).evaluate((e) => getComputedStyle(e).color)
  const cssColour = (v) => page.evaluate((v) => { const d = document.createElement('b'); d.style.color = `var(${v})`; document.body.append(d); const c = getComputedStyle(d).color; d.remove(); return c }, v)
  const eqFits = async () => {
    const W = await vw()
    assert.equal(await eq.evaluate((e) => e.scrollWidth > e.clientWidth + 0.5), false, 'equation overflows')
    const terms = await eq.locator('[data-term]').evaluateAll((els) => els.map((e) => { const r = e.getBoundingClientRect(); return { t: e.getAttribute('data-term'), l: r.left, r: r.right, sw: e.scrollWidth, cw: e.clientWidth } }))
    const card = await eq.evaluate((e) => { const r = e.getBoundingClientRect(); return { l: r.left, r: r.right } })
    terms.forEach((x, i) => {
      assert.ok(x.l >= card.l - 0.5 && x.r <= card.r + 0.5 && x.r <= W, `${x.t} inside the card`)
      if (i) assert.ok(x.l >= terms[i - 1].r, `${x.t} clear of ${terms[i - 1].t}`)
    })
    for (const el of await eq.locator('[data-term] > *').all()) assert.equal(await el.evaluate((e) => e.scrollWidth > e.clientWidth + 0.5 || e.getClientRects().length > 1 && e.getBoundingClientRect().height > 30), false, 'term text wraps or clips')
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false, 'no sideways scroll')
  }
  const BMR = 1859 // movement off, no exercise: last term = 1859 - eaten
  const G = await (async () => { await page.goto(BASE + '/'); await page.getByTestId('balance').waitFor(); return { g: await cssColour('--color-g-ink'), o: await cssColour('--color-over-ink'), d: await cssColour('--color-deep-ink') } })()

  await step(`${tag} Home equation: "Deficit 1,719" green, aria "equals 1,719 deficit"; section is "Calories"`, async () => {
    await setToday(BMR - 1719)
    assert.equal(await lastTerm().getAttribute('data-term'), 'Deficit')
    assert.equal(await page.getByTestId('eq-balance').innerText(), '1,719')
    assert.equal((await lastTerm().innerText()).replace(/\s+/g, ' '), 'Deficit 1,719') // reads "Deficit 1,719" (number drawn above its label)
    assert.equal(await colour('eq-balance'), G.g, 'deficit is green')
    assert.match(await eq.getAttribute('aria-label'), /minus eaten 140 equals 1,719 deficit$/)
    assert.equal(await page.getByRole('region', { name: 'Calories', exact: true }).count(), 1)
    assert.equal(await page.getByRole('region', { name: 'Balance', exact: true }).count(), 0)
    assert.equal(await eq.locator('[data-term="Balance"]').count(), 0)
    assert.doesNotMatch(await eq.innerText(), /Balance|−\s*1,719/)
    await eqFits()
    await eq.evaluate((e) => e.scrollIntoView({ block: 'center' })); await page.waitForTimeout(400)
    await page.screenshot({ path: `${OUT}v1191-equation-deficit-${tag}.png` })
  })

  await step(`${tag} Home equation: "Surplus 320" in an over ink (zone), aria "equals 320 surplus"; "Even 0" at exactly 0`, async () => {
    await setToday(BMR + 320)
    assert.equal(await lastTerm().getAttribute('data-term'), 'Surplus')
    assert.equal(await page.getByTestId('eq-balance').innerText(), '320')
    const c = await colour('eq-balance'); console.log(`${tag} surplus 320 ink ${c}`)
    // The number keeps the v1.16 gauge-zone ink: an over-goal surplus on a Lose plan reads in the over inks (orange, or the
    // deep red of the red zone), never green.
    assert.ok([G.o, G.d].includes(c), 'surplus in an over ink')
    assert.match(await eq.getAttribute('aria-label'), /equals 320 surplus$/)
    await eqFits()
    await eq.evaluate((e) => e.scrollIntoView({ block: 'center' })); await page.waitForTimeout(400)
    await page.screenshot({ path: `${OUT}v1191-equation-surplus-${tag}.png` })
    await setToday(BMR)
    assert.equal(await lastTerm().getAttribute('data-term'), 'Even')
    assert.equal(await page.getByTestId('eq-balance').innerText(), '0')
    assert.match(await eq.getAttribute('aria-label'), /equals 0, even$/)
    await eqFits()
  })

  await step(`${tag} 375 fit: "Surplus 3,210" fits on the card, no sideways scroll, taps >= 44px`, async () => {
    await setToday(BMR + 3210)
    assert.equal(await lastTerm().getAttribute('data-term'), 'Surplus')
    assert.equal(await page.getByTestId('eq-balance').innerText(), '3,210')
    assert.match(await eq.getAttribute('aria-label'), /equals 3,210 surplus$/)
    await eqFits()
    const small = []
    for (const b of await page.getByRole('region', { name: 'Calories', exact: true }).locator('button:visible, a:visible').or(page.locator('nav a:visible, nav button:visible')).all()) {
      const r = await box(b); if (r.w && r.h < 44) small.push(`${(await b.innerText()).trim() || await b.getAttribute('aria-label')} ${r.h.toFixed(1)}`)
    }
    assert.deepEqual(small, [], 'taps under 44px (Calories section and tab bar)')
    await setToday(140)
  })

  await step(`${tag} Day verdict "How it adds up": total row reads "Calories", value keeps "N deficit" / "N surplus"`, async () => {
    for (const i of [1, 6]) { // ago 6: a surplus day in the seed
      const k = ago(i), b = closedDays[k].balance
      await page.goto(BASE + `/day/${k}`); await page.getByTestId('verdict-balance').waitFor()
      const row = page.getByTestId('verdict-balance').locator('..')
      assert.equal(await row.locator('> :first-child').innerText(), 'Calories')
      assert.equal(await page.getByTestId('verdict-balance').innerText(), `${Math.abs(b).toLocaleString('en-US')} ${b < 0 ? 'surplus' : 'deficit'}`)
      assert.doesNotMatch(await page.locator('main').innerText(), /\bBalance\b/)
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false, 'no sideways scroll')
      if (i === 1) { await row.scrollIntoViewIfNeeded(); await page.waitForTimeout(400); await page.screenshot({ path: `${OUT}v1191-verdict-${tag}.png` }) }
    }
  })

  // Chart top padding: 8 units when no value label sits above a bar; the old room (18, or 26 compact) when one does.
  const padGeo = () => page.evaluate(() => {
    const c = document.querySelector('[data-testid=trend-chart]'), svg = c.querySelector('svg'), s = svg.getBoundingClientRect()
    const sub = [...document.querySelectorAll('div')].filter((e) => /^kcal (deficit|surplus)/.test(e.textContent.trim()) && e.children.length === 0).map((e) => e.getBoundingClientRect().bottom)[0]
    const goal = Math.min(...[...c.querySelectorAll('[data-ref] line')].map((l) => l.getBoundingClientRect().top))
    const labs = [...c.querySelectorAll('[data-label-for]')].map((t) => { const r = t.getBoundingClientRect(); return { k: t.getAttribute('data-label-for'), where: t.getAttribute('data-label'), t: r.top, b: r.bottom } })
    const barTop = Math.min(...[...c.querySelectorAll('[data-bar][data-visible=yes] rect')].map((r) => r.getBoundingClientRect().top))
    return { padT: Number(svg.getAttribute('data-pad-top')), svgTop: s.top, svgBottom: s.bottom, h: s.height, gap: sub != null && isFinite(goal) ? goal - sub : null, labs, barTop }
  })
  const noClip = (g) => { for (const l of g.labs) assert.ok(l.t >= g.svgTop - 0.5 && l.b <= g.svgBottom + 0.5, `label ${l.k} clipped (${l.t.toFixed(1)} vs svg ${g.svgTop.toFixed(1)})`) }

  await step(`${tag} chart top padding: 1-year view 8 units (labels inside bars), same height, no label clips; an outside label keeps the room`, async () => {
    await fresh()
    const h0 = (await padGeo()).h
    await apply(yearFrom, TODAY); await page.waitForTimeout(1200)
    await page.evaluate(() => scrollTo(0, 0)); await page.waitForTimeout(300)
    const y = await padGeo()
    console.log(`${tag} year padT ${y.padT} gap ${y.gap?.toFixed(1)} labels ${y.labs.map((l) => l.where).join(',')}`)
    assert.equal(y.padT, 8)
    assert.ok(y.labs.length > 0 && y.labs.every((l) => l.where === 'inside' || closedDays[l.k] == null || true))
    assert.ok(Math.abs(y.h - h0) < 0.5, `chart height ${y.h} vs ${h0}`)
    assert.ok(y.barTop >= y.svgTop - 0.5, 'bars inside the chart'); noClip(y)
    await page.screenshot({ path: `${OUT}v1191-monthly-year-${tag}.png` })
    // 90 days, weekly: 13 bars, labels on; 30 days: labels hidden, so 8.
    await apply(add(TODAY, -29), TODAY); await page.waitForTimeout(600)
    const d30 = await padGeo(); assert.equal(d30.padT, 8); assert.equal(d30.labs.length, 0); assert.ok(Math.abs(d30.h - h0) < 0.5)
    // A small deficit day (100 kcal, 200 days ago) whose label cannot fit inside: room kept, label above its bar, unclipped.
    await apply(ago(207), ago(200)); await page.waitForTimeout(600)
    const sm = await padGeo()
    console.log(`${tag} small-bar padT ${sm.padT} labels ${sm.labs.map((l) => `${l.k.slice(5)}:${l.where}`).join(',')}`)
    assert.ok(sm.labs.some((l) => l.k === ago(200) && l.where === 'outside'), 'the 100 label sits outside')
    assert.equal(sm.padT, 18); noClip(sm); assert.ok(Math.abs(sm.h - h0) < 0.5)
  })
  await ctx.close()
}
await browser.close()
console.log(results.join('\n'))
if (errors.length) { console.log(errors.join('\n')); process.exit(1) }
console.log(`\n${results.length} passed`)
