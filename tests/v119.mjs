// v1.19 History bars and view switch. Bars by range length: 1-31 days daily, 32-182 weekly (Monday to Sunday, cut to
// the range), 183+ monthly (calendar months, cut to the range; a rolling year is 13 bars). A monthly bar is the month's
// daily average (closed days), ticks are 3-letter months, hint "Hold to see a month". Part weeks / months are lighter
// with a dashed outline, a legend key and "part week" / "part month" on hold. Gaps: "3 of 7 days logged" on hold and
// "Averages use logged days only · N days with no logs" under the chart. Top control: segmented Calories / Protein
// switch, outlined 7d / 30d / Custom pills below. Renames (Calories chart, Daily calories), cross-year pill
// "3 Nov ’25 – 2 Nov ’26", "Sep" never "Sept", title wraps only after the dash, 8-31 day ticks (custom and the 30d
// pages) with months and an end-aligned last label, no 7-day average key on a one-day range, value labels only with
// 14 bars or fewer, "0.0 kg" sign, protein Days hit over logged days, 44px / 16px+ / 375 fit. Storage unchanged.
// WebKit at 390x844 and 375x667. Screenshots: screenshots/v119-*.png.
// Usage: npm run build && npx vite preview --port 4174 & node tests/v119.mjs
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

  await step(`${tag} switch A: full-width Calories / Protein track, sliding thumb, outlined 7d / 30d / Custom pills below, left-aligned`, async () => {
    await fresh()
    const ctl = page.getByTestId('history-controls')
    const vg = ctl.getByRole('group', { name: 'View' }), rg = ctl.getByRole('group', { name: 'Range' })
    assert.deepEqual(await vg.getByRole('button').allInnerTexts(), ['Calories', 'Protein'])
    assert.deepEqual(await rg.getByRole('button').allInnerTexts(), ['7d', '30d', 'Custom'])
    const card = await box(page.getByTestId('period-range').locator('xpath=ancestor::*[contains(@class,"rounded")][1]'))
    const v = await box(vg), r = await box(rg), W = await vw()
    assert.ok(Math.abs(v.w - card.w) <= 2 && Math.abs(v.l - card.l) <= 2, `track full width ${JSON.stringify(v)} card ${JSON.stringify(card)}`)
    assert.ok(r.t >= v.b, 'pills below the switch')
    const first = await box(rg.getByRole('button').first())
    assert.ok(Math.abs(first.l - v.l) <= 1, 'pills left-aligned')
    assert.ok((await box(rg.getByRole('button').last())).r < W / 2 + 40, 'pills do not stretch')
    const bg = (loc) => loc.evaluate((e) => getComputedStyle(e).backgroundColor)
    const cal = vg.getByRole('button', { name: 'Calories' }), pro = vg.getByRole('button', { name: 'Protein' })
    assert.equal(await cal.getAttribute('aria-pressed'), 'true'); assert.equal(await pro.getAttribute('aria-pressed'), 'false')
    const thumb = page.getByTestId('view-thumb')
    assert.notEqual(await bg(vg), await bg(thumb), 'thumb on a track')
    assert.equal(await bg(thumb), await bg(page.getByTestId('period-range').locator('xpath=ancestor::*[contains(@class,"rounded")][1]')), 'white (card) thumb')
    const t0 = await box(thumb), c0 = await box(cal)
    assert.ok(Math.abs(t0.l - c0.l) <= 2 && Math.abs(t0.w - c0.w) <= 2, 'thumb under Calories')
    // Selected pill: ink outline. Others: light outline.
    const ring = (loc) => loc.evaluate((e) => { const s = getComputedStyle(e); return { b: s.borderTopColor, c: s.color, bw: s.borderTopWidth } })
    const p7 = await ring(rg.getByRole('button', { name: '7d (7 days)' })), p30 = await ring(rg.getByRole('button', { name: '30d (30 days)' }))
    assert.equal(p7.b, p7.c, '7d ink outline'); assert.notEqual(p30.b, p7.b, '30d light outline')
    await page.evaluate(() => window.scrollTo(0, 0)); await page.waitForTimeout(1200)
    await page.screenshot({ path: `${OUT}v119-switch-${tag}.png` })
    await view('Protein'); await page.waitForTimeout(450)
    assert.equal(await pro.getAttribute('aria-pressed'), 'true')
    const t1 = await box(thumb), p1 = await box(pro)
    assert.ok(Math.abs(t1.l - p1.l) <= 2, `thumb slid to Protein ${JSON.stringify(t1)} ${JSON.stringify(p1)}`)
    assert.equal(await page.getByTestId('protein-chart').count(), 1)
    await view('Calories'); await page.waitForTimeout(450)
    await fitsRow()
  })

  await step(`${tag} renames: Calories chart aria, "Daily calories" list; internal names unchanged`, async () => {
    const chart = page.getByTestId('trend-chart')
    assert.equal(await chart.getAttribute('aria-label'), 'Calories chart. Press and hold to see a day. Swipe or use the arrow keys to change period.')
    assert.equal(await chart.getAttribute('data-variant'), 'balance')
    assert.equal(await page.getByTestId('day-list').getAttribute('aria-label'), 'Daily calories')
    assert.equal(await page.getByRole('list', { name: 'Daily balance' }).count(), 0)
    assert.equal(await page.getByTestId('history-controls').getByRole('button', { name: 'Balance' }).count(), 0)
    await view('Protein')
    assert.match(await page.getByTestId('trend-chart').getAttribute('aria-label'), /^Protein chart\. Press and hold to see a day\./)
    await view('Calories')
  })

  await step(`${tag} thresholds: 31 days daily, 32 weekly, 182 weekly, 183 monthly`, async () => {
    for (const [L, unit] of [[31, 'day'], [32, 'week'], [182, 'week'], [183, 'month']]) {
      const f = add(TODAY, -(L - 1))
      await apply(f, TODAY)
      assert.equal(await unitOf(), unit, `${L} days`)
      const expect = unit === 'day' ? L : buckets(f, TODAY, unit).length
      assert.equal(await nbars(), expect, `${L} days bars`)
      assert.equal(await page.getByTestId('chart-hint').innerText(), `Hold to see a ${unit}`)
      assert.match(await page.getByTestId('trend-chart').getAttribute('aria-label'), new RegExp(`^Calories chart\\. Press and hold to see a ${unit}\\.$`))
    }
  })

  await step(`${tag} weekly (90 days): Monday weeks cut to the range, part weeks lighter + dashed, legend key, hold says part week`, async () => {
    const f = ago(89), wk = buckets(f, TODAY, 'week')
    await apply(f, TODAY)
    const b = await page.locator('[data-testid=trend-chart] [data-bar]').evaluateAll((e) => e.map((x) => ({ key: x.getAttribute('data-bar'), part: x.getAttribute('data-part') })))
    assert.deepEqual(b.map((x) => x.key), wk.map((w) => w[0]))
    for (const [i, w] of wk.entries()) {
      if (i > 0) assert.equal(parse(w[0]).getDay(), 1, 'weeks start Monday')
      if (i < wk.length - 1) assert.equal(parse(w.at(-1)).getDay(), 0, 'weeks end Sunday')
      assert.equal(b[i].part, w.length < 7 ? 'yes' : 'no', `week ${w[0]} part`)
    }
    const partIdx = wk.findIndex((w) => w.length < 7 && avgOf(w) != null)
    assert.ok(partIdx >= 0, 'a part week with data')
    const rect = page.locator(`[data-testid=trend-chart] [data-bar="${wk[partIdx][0]}"] rect`)
    assert.ok(Math.abs(Number(await rect.getAttribute('opacity')) - 0.45) < 0.01, 'part bar lighter')
    assert.equal(await rect.getAttribute('stroke-dasharray'), '3 2')
    const fullIdx = wk.findIndex((w) => w.length === 7)
    const fr = page.locator(`[data-testid=trend-chart] [data-bar="${wk[fullIdx][0]}"] rect`)
    assert.equal(await fr.getAttribute('stroke-dasharray'), null)
    assert.equal(await page.getByTestId('part-key').innerText(), 'part week')
    assert.equal(await page.getByTestId('gap-note').count(), 0, 'no gaps in the last 90 days')
    await page.evaluate(() => window.scrollTo(0, 0)); await page.waitForTimeout(1200)
    await page.screenshot({ path: `${OUT}v119-weekly-${tag}.png` })
    const P = wk[partIdx]
    await hold(P[0], async () => {
      const t = await page.getByTestId('scrub-header').innerText()
      assert.ok(t.includes(`${P.length === 1 ? dm(P[0]) : rangeLabel(P[0], P.at(-1))} · part week`), t)
      await page.screenshot({ path: `${OUT}v119-part-${tag}.png` })
    })
  })

  await step(`${tag} monthly rolling year: 13 calendar months cut to the range, daily averages, 3-letter ticks, part months, hold header`, async () => {
    const ms = buckets(yearFrom, TODAY, 'month')
    await apply(yearFrom, TODAY)
    assert.equal(await unitOf(), 'month')
    if (parse(TODAY).getDate() < dim(TODAY)) assert.equal(ms.length, 13, 'rolling year = 13 bars')
    const b = await page.locator('[data-testid=trend-chart] [data-bar]').evaluateAll((e) => e.map((x) => ({ key: x.getAttribute('data-bar'), v: x.getAttribute('data-value'), part: x.getAttribute('data-part') })))
    assert.deepEqual(b.map((x) => x.key), ms.map((m) => m[0]))
    ms.forEach((m, i) => {
      if (i > 0) assert.ok(m[0].endsWith('-01'))
      assert.equal(b[i].part, m.length < dim(m[0]) ? 'yes' : 'no', `${m[0]} part`)
      assert.equal(Number(b[i].v), avgOf(m), `${m[0]} daily average`)
    })
    assert.equal(b.filter((x) => x.part === 'yes').length, ms.filter((m) => m.length < dim(m[0])).length)
    const ticks = await page.locator('[data-testid=trend-chart] text[data-tick]').evaluateAll((e) => e.map((t) => t.textContent))
    assert.ok(ticks.length >= 4, `ticks ${ticks}`)
    for (const t of ticks) assert.ok(MON.includes(t), `tick ${t}`)
    // Ticks do not overlap each other or leave the chart.
    const tb = await page.locator('[data-testid=trend-chart] text[data-tick]').evaluateAll((e) => e.map((t) => { const r = t.getBoundingClientRect(); return [r.left, r.right] }))
    const cr = await box(page.getByTestId('trend-chart'))
    tb.forEach(([l, r], i) => { assert.ok(l >= cr.l - 1 && r <= cr.r + 1, 'tick inside'); if (i) assert.ok(l >= tb[i - 1][1], 'ticks apart') })
    assert.equal(await page.getByTestId('chart-hint').innerText(), 'Hold to see a month')
    assert.equal(await page.getByTestId('part-key').innerText(), 'part month')
    assert.equal(await page.getByTestId('chart-legend').getByText('7-day average').count(), 0)
    assert.equal(await page.getByTestId('gap-note').innerText(), 'Averages use logged days only · 24 days with no logs')
    assert.equal(await custom.innerText(), pill(yearFrom, TODAY))
    await fitsRow()
    await page.evaluate(() => window.scrollTo(0, 0)); await page.waitForTimeout(1200)
    await page.screenshot({ path: `${OUT}v119-monthly-year-${tag}.png` })
    // Hold a full month: "May 2026", total, closed days, daily average.
    const M = ms.find((m) => m.length === dim(m[0]) && m.every((k) => closedDays[k]))
    const total = M.reduce((a, k) => a + closedDays[k].balance, 0)
    await hold(M[0], async () => {
      const hdr = page.getByTestId('scrub-header'); await hdr.waitFor()
      const t = await hdr.innerText()
      assert.ok(t.includes(`${LONG[parse(M[0]).getMonth()]} ${M[0].slice(0, 4)}`), t)
      assert.ok(!t.includes('part month'), t)
      assert.ok(t.includes(`${M.length} closed days`), t)
      assert.ok(t.includes('Daily avg') && t.includes('kcal a day'), t)
      assert.equal(Number((await page.getByTestId('scrub-value').innerText()).replace(/[^\d]/g, '')), Math.abs(total))
      assert.equal(Number((await page.getByTestId('scrub-avg').innerText()).replace(/[^\d]/g, '')), Math.abs(avgOf(M)))
      await page.screenshot({ path: `${OUT}v119-monthly-hold-${tag}.png` })
    })
    // Hold the first (part) month.
    await hold(ms[0][0], async () => {
      const t = await page.getByTestId('scrub-header').innerText()
      assert.ok(t.includes(`${rangeLabel(ms[0][0], ms[0].at(-1))} · part month`), t)
    })
    // Gap month: "7 of 31 days logged".
    const G = ms.find((m) => m.some((k) => !closedDays[k] && k !== TODAY))
    const lg = G.filter((k) => closedDays[k] || k === TODAY).length
    await hold(G[0], async () => {
      const t = await page.getByTestId('scrub-header').innerText()
      assert.ok(t.includes(`${lg} of ${G.length} days logged`), t)
      assert.ok(!t.includes('closed days'), t)
    })
    // Protein: Days hit over logged days in the month; card counts logged days only.
    await view('Protein')
    assert.equal(await page.getByTestId('part-key').innerText(), 'part month')
    const target = Number((await page.getByText(/Hit protein \d+ of \d+ logged days\./).innerText()).match(/target ([\d,]+) grams/)[1].replace(',', ''))
    await hold(G[0], async () => {
      const gl = G.filter((k) => closedDays[k])
      const hit = gl.filter((k) => closedDays[k].protein >= target).length + (G.includes(TODAY) && 10 >= target ? 1 : 0)
      assert.equal(await page.getByTestId('scrub-avg').innerText(), `${hit} / ${lg}`)
    })
    const keys = span(yearFrom, TODAY), logged = keys.filter((k) => closedDays[k] || k === TODAY)
    const hitAll = logged.filter((k) => (closedDays[k]?.protein ?? 10) >= target).length
    assert.equal(await page.getByTestId('protein-hit').innerText(), `${hitAll} / ${logged.length}`)
    assert.ok(await page.getByText('logged days hit protein', { exact: true }).isVisible())
    assert.equal(await page.getByText(`Hit protein ${hitAll} of ${logged.length} logged days.`, { exact: false }).count(), 1)
    assert.equal(await page.getByTestId('gap-note').innerText(), 'Averages use logged days only · 24 days with no logs')
    await view('Calories')
  })

  await step(`${tag} gaps (weekly): "3 of 7 days logged" in the hold header, note under the chart`, async () => {
    const f = ago(GAP[1] + 20), t = ago(GAP[0] - 20), wk = buckets(f, t, 'week')
    await apply(f, t)
    assert.equal(await unitOf(), 'week')
    const gaps = span(f, t).filter((k) => !closedDays[k]).length
    assert.equal(gaps, 24)
    assert.equal(await page.getByTestId('gap-note').innerText(), `Averages use logged days only · ${gaps} days with no logs`)
    const P = wk.find((w) => w.length === 7 && w.some((k) => closedDays[k]) && w.some((k) => !closedDays[k]))
    assert.ok(P, 'a full week partly logged')
    const lg = P.filter((k) => closedDays[k]).length
    await hold(P[0], async () => {
      const tx = await page.getByTestId('scrub-header').innerText()
      assert.ok(tx.includes(`${lg} of 7 days logged`), tx)
    })
    // A week with no logs at all draws no bar.
    const E = wk.find((w) => w.every((k) => !closedDays[k]))
    assert.equal(await page.locator(`[data-testid=trend-chart] [data-bar="${E[0]}"]`).getAttribute('data-value'), '')
    await page.evaluate(() => window.scrollTo(0, 0)); await page.waitForTimeout(1200)
    const note = page.getByTestId('gap-note'); await note.scrollIntoViewIfNeeded()
    await page.evaluate(() => window.scrollBy(0, 120)); await page.waitForTimeout(200)
    await page.screenshot({ path: `${OUT}v119-gaps-${tag}.png` })
    await view('Protein')
    const pl = span(f, t).filter((k) => closedDays[k]).length
    assert.match(await page.getByTestId('protein-hit').innerText(), new RegExp(`^\\d+ / ${pl}$`))
    assert.ok(await page.getByText('logged days hit protein', { exact: true }).isVisible())
    await view('Calories')
    // No gaps: subtitle stays "days hit protein".
    await apply(ago(20), ago(3)); await view('Protein')
    assert.ok(await page.getByText('days hit protein', { exact: true }).isVisible())
    assert.match(await page.getByTestId('protein-hit').innerText(), /^\d+ \/ 18$/)
    await view('Calories')
  })

  await step(`${tag} pill text: across years "3 Nov ’25 – 2 Nov ’26", within a year short; title wraps only after the dash`, async () => {
    await apply(yearFrom, TODAY)
    const txt = await custom.innerText()
    assert.equal(txt, `${dm(yearFrom)} ’${yearFrom.slice(2, 4)} – ${dm(TODAY)} ’${TODAY.slice(2, 4)}`)
    assert.equal(await custom.getAttribute('aria-label'), `Custom range, ${dmy(yearFrom)} – ${dmy(TODAY)}. Change dates`)
    assert.equal(await label(), `Custom · ${dmy(yearFrom)} – ${dmy(TODAY)}`)
    // Each side of the dash stays on one line; if the title wraps, it breaks right after the dash.
    const lines = await page.getByTestId('period-range').evaluate((e) => [...e.querySelectorAll('span')].map((s) => ({ t: s.textContent, n: s.getClientRects().length, top: s.getBoundingClientRect().top })))
    assert.equal(lines.length, 2)
    assert.equal(lines[0].t, `Custom · ${dmy(yearFrom)} –`)
    assert.equal(lines[1].t, dmy(TODAY))
    for (const l of lines) assert.equal(l.n, 1, `"${l.t}" on one line`)
    const W = await vw(), lb = await box(page.getByTestId('period-range'))
    assert.ok(lb.r <= W, 'title fits')
    const est = await box(page.getByTestId('est-change'))
    assert.ok(est.h < 50 && est.r <= W && (lb.r <= est.l + 1 || lb.b <= est.t), 'Est. change on one line, no overlap')
    const y = parse(TODAY).getFullYear()
    await apply(`${y}-10-03`, `${y}-11-02` <= TODAY ? `${y}-11-02` : TODAY)
    assert.equal(await custom.innerText(), rangeLabel(`${y}-10-03`, `${y}-11-02` <= TODAY ? `${y}-11-02` : TODAY))
    assert.ok(!(await custom.innerText()).includes('’'))
  })

  await step(`${tag} September reads "Sep", never "Sept" (ticks, title, pill, lists, sheet error)`, async () => {
    const y = parse(TODAY).getMonth() > 8 ? parse(TODAY).getFullYear() : parse(TODAY).getFullYear() - 1
    const f = `${y}-09-01`, t = `${y}-09-30`
    await apply(f, t)
    assert.equal(await label(), `Custom · 1 – 30 Sep`)
    assert.equal(await custom.innerText(), '1 – 30 Sep')
    const ticks = await page.locator('[data-testid=trend-chart] text[data-tick]').evaluateAll((e) => e.map((x) => x.textContent))
    assert.match(ticks[0], /^\d{1,2} Sep$/); assert.equal(ticks.at(-1), '30 Sep')
    assert.ok(await page.getByTestId('day-list').getByText(/ 29 Sep$/).count() >= 1)
    await noSept()
    await view('Protein'); await noSept(); await view('Calories')
    // Weekly ticks across September.
    await apply(`${y}-08-01`, `${y}-10-15`); await noSept()
    assert.ok((await page.locator('[data-testid=trend-chart] text[data-tick]').allTextContents()).some((x) => x.endsWith(' Sep')))
    // The sheet's out-of-bounds message (first logged day is in September).
    await openSheet()
    await page.getByTestId('range-from').fill(ago(FIRST_AGO + 3))
    assert.equal(await page.getByTestId('range-err').innerText(), `Pick dates from ${dmy(FIRST)} to today`)
    await noSept()
    await tapLoc(page.getByTestId('range-cancel')); await dialog.waitFor({ state: 'detached' })
  })

  await step(`${tag} 8-31 day ticks: first tick and new month carry the month, last bar labelled and end-aligned, none crowd it`, async () => {
    const t0 = parse(TODAY)
    const to = t0.getDate() >= 2 ? key(new Date(t0.getFullYear(), t0.getMonth(), 2, 12)) : key(new Date(t0.getFullYear(), t0.getMonth() - 1, 2, 12))
    for (const L of [30, 12, 8, 31]) {
      const f = add(to, -(L - 1))
      await apply(f, to)
      assert.equal(await unitOf(), 'day')
      const tk = await page.locator('[data-testid=trend-chart] text[data-tick]').evaluateAll((e) => e.map((x) => { const r = x.getBoundingClientRect(); return { k: x.getAttribute('data-tick'), t: x.textContent, a: x.getAttribute('text-anchor'), l: r.left, r: r.right } }))
      assert.equal(tk[0].t, dm(tk[0].k), `${L}: first tick has the month`)
      const last = tk.at(-1)
      assert.equal(last.k, to); assert.equal(last.t, dm(to)); assert.equal(last.a, 'end', `${L}: last tick end-aligned`)
      let mon = parse(tk[0].k).getMonth()
      for (const x of tk.slice(1, -1)) {
        const m = parse(x.k).getMonth()
        assert.equal(x.t, m !== mon ? dm(x.k) : String(parse(x.k).getDate()), `${L}: tick ${x.k}`)
        mon = m
      }
      tk.forEach((x, i) => { if (i) assert.ok(x.l >= tk[i - 1].r + 2, `${L}: ticks ${tk[i - 1].t} and ${x.t} apart`) })
      const cr = await box(page.getByTestId('trend-chart'))
      assert.ok(last.r <= cr.r + 1, 'last tick inside the chart')
      if (L === 31) {
        await page.evaluate(() => window.scrollTo(0, 0)); await page.waitForTimeout(1200)
        await page.screenshot({ path: `${OUT}v119-ticks31-${tag}.png` })
      }
    }
    // 7 days keeps weekday ticks.
    await apply(add(to, -6), to)
    for (const x of await page.locator('[data-testid=trend-chart] text[data-tick]').allTextContents()) assert.match(x, /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)$/)
  })

  await step(`${tag} est. change: "0.0 kg", never "−0.0 kg"`, async () => {
    await apply(ago(201), ago(201))
    assert.equal(await page.getByTestId('est-change').innerText(), '0.0 kg')
    await apply(ago(200), ago(200))
    assert.equal(await page.getByTestId('est-change').innerText(), '0.0 kg')
    await apply(ago(201), ago(199))
    assert.match(await page.getByTestId('est-change').innerText(), /^[+−]\d\.\d kg$/)
  })

  await step(`${tag} fit: 44px targets, 16px+ inputs (17px), nothing clipped, no sideways scroll`, async () => {
    for (const [f, t] of [[yearFrom, TODAY], [ago(89), TODAY], [ago(30), TODAY]]) {
      await apply(f, t); await fitsRow()
      const W = await vw()
      for (const id of ['period-range', 'est-change', 'chart-legend']) { const r = await box(page.getByTestId(id)); assert.ok(r.l >= 0 && r.r <= W, `${id} on screen`) }
      if (await page.getByTestId('gap-note').count()) { const r = await box(page.getByTestId('gap-note')); assert.ok(r.l >= 0 && r.r <= W, 'gap note on screen') }
      await view('Protein'); await fitsRow(); await view('Calories')
    }
    await openSheet()
    for (const id of ['range-from', 'range-to']) {
      const i = page.getByTestId(id)
      assert.equal(parseFloat(await i.evaluate((e) => getComputedStyle(e).fontSize)), 17)
      assert.ok((await box(i)).h >= 44)
      assert.equal(await i.getAttribute('min'), FIRST, 'From goes back to the first logged day')
    }
    for (const b of await dialog.getByRole('button').all()) assert.ok((await box(b)).h >= 44)
    await tapLoc(page.getByTestId('range-cancel')); await dialog.waitFor({ state: 'detached' })
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false)
  })

  const tickInfo = () => page.locator('[data-testid=trend-chart] text[data-tick]').evaluateAll((e) => e.map((x) => { const r = x.getBoundingClientRect(); return { k: x.getAttribute('data-tick'), t: x.textContent, a: x.getAttribute('text-anchor'), l: r.left, r: r.right, vis: x.closest('[data-bar]').getAttribute('data-visible') } }))
  await step(`${tag} 30d pill (paging): ticks carry the month like custom ranges, last bar labelled end-aligned, on every page`, async () => {
    await tapLoc(page.getByRole('button', { name: '30d (30 days)' })); await page.waitForTimeout(400)
    const chart = page.getByTestId('trend-chart')
    assert.equal(await chart.getAttribute('data-swipe'), 'yes')
    for (let pg = 0; pg < 3; pg++) {
      if (pg) { await chart.focus(); await page.keyboard.press('ArrowLeft'); await page.waitForTimeout(600) }
      assert.equal(await chart.getAttribute('data-page'), String(pg))
      const tk = (await tickInfo()).filter((x) => x.vis === 'yes')
      const to = ago(30 * pg), from = ago(30 * pg + 29)
      assert.equal(tk[0].t, dm(tk[0].k), `page ${pg}: first tick has the month`)
      assert.ok(tk[0].k >= from)
      const last = tk.at(-1)
      assert.equal(last.k, to); assert.equal(last.t, dm(to)); assert.equal(last.a, 'end', `page ${pg}: last tick end-aligned`)
      let mon = parse(tk[0].k).getMonth()
      for (const x of tk.slice(1, -1)) { const m = parse(x.k).getMonth(); assert.equal(x.t, m !== mon ? dm(x.k) : String(parse(x.k).getDate()), `page ${pg} tick ${x.k}`); mon = m }
      tk.forEach((x, i) => { if (i) assert.ok(x.l >= tk[i - 1].r + 2, `page ${pg}: ${tk[i - 1].t} and ${x.t} apart`) })
      const cr = await box(chart)
      assert.ok(last.r <= cr.r + 1 && tk[0].l >= cr.l - 1, 'ticks inside the chart')
      if (pg === 0) {
        assert.equal(await page.getByTestId('bar-labels').getAttribute('data-shown'), 'no', '30 bars: no value labels')
        await page.evaluate(() => window.scrollTo(0, 0)); await page.waitForTimeout(1200)
        await page.screenshot({ path: `${OUT}v119-30d-${tag}.png` })
      }
    }
    // 7d unchanged: weekday ticks on every bar, value labels shown.
    await tapLoc(page.getByRole('button', { name: '7d (7 days)' })); await page.waitForTimeout(400)
    const t7 = (await tickInfo()).filter((x) => x.vis === 'yes')
    assert.equal(t7.length, 7); for (const x of t7) { assert.match(x.t, /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)$/); assert.equal(x.a, 'middle') }
    assert.equal(await page.getByTestId('bar-labels').getAttribute('data-shown'), 'yes')
    assert.ok(await page.locator('[data-testid=bar-labels] [data-label-for]').count() >= 6)
  })

  await step(`${tag} one-day range: no "7-day average" legend key`, async () => {
    await apply(ago(5), ago(5))
    assert.equal(await page.locator('[data-testid=trend-chart] [data-bar]').count(), 1)
    assert.equal(await page.getByTestId('chart-legend').getByText('7-day average').count(), 0)
    assert.equal(await page.getByTestId('chart-hint').innerText(), 'Hold to see a day')
    await page.evaluate(() => window.scrollTo(0, 0)); await page.waitForTimeout(1200)
    await page.screenshot({ path: `${OUT}v119-oneday-${tag}.png` })
    await apply(ago(6), ago(5))
    assert.equal(await page.getByTestId('chart-legend').getByText('7-day average').count(), 1, 'two days keep the key')
  })

  await step(`${tag} value labels only with 14 bars or fewer; past that, hold shows the value`, async () => {
    for (const [L, shown] of [[14, true], [15, false], [31, false], [7, true]]) {
      await apply(ago(L), ago(1))
      assert.equal(await page.locator('[data-testid=trend-chart] [data-bar]').count(), L)
      assert.equal(await page.getByTestId('bar-labels').getAttribute('data-shown'), shown ? 'yes' : 'no', `${L} bars`)
      assert.equal(await page.locator('[data-testid=bar-labels] [data-label-for]').count() > 0, shown, `${L} bars labels`)
      if (L === 14) { await page.evaluate(() => window.scrollTo(0, 0)); await page.waitForTimeout(1200); await page.screenshot({ path: `${OUT}v119-labels14-${tag}.png` }) }
    }
    await apply(ago(31), ago(1))
    const k = ago(10)
    await hold(k, async () => {
      assert.equal(Number((await page.getByTestId('scrub-value').innerText()).replace(/[^\d]/g, '')), Math.abs(closedDays[k].balance))
    })
    // Weekly and monthly too (27 and 13 bars): no labels.
    await apply(add(TODAY, -181), TODAY)
    assert.equal(await page.getByTestId('bar-labels').getAttribute('data-shown'), 'no')
    await apply(add(TODAY, -364), TODAY); await view('Protein')
    assert.equal(await page.getByTestId('bar-labels').getAttribute('data-shown'), 'yes', '13 monthly bars keep labels')
    await view('Calories')
  })

  await step(`${tag} storage stays v3; :v2 :v1 :ai :foods byte-identical, no new keys`, async () => {
    const s = await page.evaluate(() => Object.fromEntries(Object.keys(localStorage).map((k) => [k, localStorage.getItem(k)])))
    assert.deepEqual(Object.keys(s).sort(), ['calorie-app:ai', 'calorie-app:backup', 'calorie-app:foods', 'calorie-app:v1', 'calorie-app:v2', 'calorie-app:v3'])
    for (const [k, v] of Object.entries(FIXED)) assert.equal(s[k], v, k)
    const v3 = JSON.parse(s['calorie-app:v3'])
    assert.equal(v3.version, 3)
    assert.deepEqual(Object.keys(v3).sort(), Object.keys(JSON.parse(V3)).sort())
    assert.deepEqual(v3.entries, JSON.parse(V3).entries)
    assert.deepEqual(v3.closedDays, closedDays)
  })
  await ctx.close()
}
await browser.close()
console.log(results.join('\n'))
if (errors.length) { console.log(errors.join('\n')); process.exit(1) }
console.log(`\n${results.length} passed`)
