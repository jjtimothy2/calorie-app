// v1.18 History custom range. A third range chip "Custom" (after 7d and 30d) opens a "Pick dates" sheet: quick picks
// (This month, Last month, 90 days), From and To native date pickers (16 px+, no autofocus), "Show these dates" and
// Cancel. To before From shows "End date is before start date" and disables the button; To is at most today and From
// at least the first logged day. Applied, the chip shows the range ("3 – 28 Oct"), the period label reads
// "Custom · 3 – 28 Oct" (years when the range spans years), and totals, averages, "Hit protein X of N days" and the
// day list all use the range. Up to 31 days the chart draws daily bars; longer ranges draw weekly bars labelled by
// week start, and holding one shows that week. Swiping is off for a custom range. Tapping Custom again reopens the
// sheet with the current range; 7d / 30d go back to normal. The range is remembered while the app is open (leave
// History and come back) and never stored: a reload starts at 7d. Schema stays v3; :v2 :v1 :ai :foods byte-identical.
// WebKit at 390x844 and 375x667. Screenshots: screenshots/v118-*.png.
// Usage: npm run build && npx vite preview --port 4174 & node tests/v118.mjs
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
const dm = (k) => parse(k).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
const dmy = (k) => parse(k).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
const rangeLabel = (a, b) => { const A = parse(a), B = parse(b); return A.getMonth() === B.getMonth() && A.getFullYear() === B.getFullYear() ? `${A.getDate()} – ${dm(b)}` : `${dm(a)} – ${dm(b)}` }
const TODAY = ago(0)
const FIRST_AGO = 400
const FIRST = ago(FIRST_AGO)

// Test data only: 400 closed days with a fixed pattern, plus two logs today (open).
const PT = 140 // protein target used below is read from the app, these just straddle it
const closedDays = {}, entries = []
let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
for (let i = FIRST_AGO; i >= 1; i--) {
  const k = ago(i)
  const balance = Math.round(i % 6 === 0 ? -300 - rnd() * 400 : 200 + rnd() * 500)
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

  await step(`${tag} Custom chip after 7d and 30d, 44px, header row fits`, async () => {
    await fresh()
    const names = await page.getByRole('group', { name: 'Range' }).getByRole('button').allInnerTexts()
    assert.deepEqual(names, ['7d', '30d', 'Custom'])
    assert.equal(await custom.getAttribute('aria-pressed'), 'false')
    assert.equal(await custom.getAttribute('aria-label'), 'Custom range')
    assert.match(await label(), /^Week · /)
    await fitsRow()
    await page.evaluate(() => window.scrollTo(0, 0)); await page.waitForTimeout(100)
    await page.screenshot({ path: `${OUT}v118-chips-${tag}.png` })
  })

  await step(`${tag} sheet: "Pick dates", quick picks, From / To date inputs (16px+, no autofocus, min first day, max today), buttons; Cancel closes`, async () => {
    await openSheet()
    assert.equal(await dialog.getAttribute('aria-label'), 'Pick dates')
    await dialog.getByRole('heading', { name: 'Pick dates' }).waitFor()
    assert.deepEqual(await dialog.getByRole('group', { name: 'Quick picks' }).getByRole('button').allInnerTexts(), ['This month', 'Last month', '90 days'])
    for (const id of ['range-from', 'range-to']) {
      const i = page.getByTestId(id)
      assert.equal(await i.getAttribute('type'), 'date')
      assert.ok(parseFloat(await i.evaluate((e) => getComputedStyle(e).fontSize)) >= 16, `${id} font`)
      assert.equal(await i.getAttribute('min'), FIRST); assert.equal(await i.getAttribute('max'), TODAY)
      assert.ok((await box(i)).h >= 44, `${id} 44px`)
    }
    assert.equal(await page.evaluate(() => document.activeElement?.tagName), 'DIV', 'no autofocus on an input')
    // Prefilled with the period shown (this week).
    assert.equal(await page.getByTestId('range-from').inputValue(), ago(6))
    assert.equal(await page.getByTestId('range-to').inputValue(), TODAY)
    assert.equal(await page.getByTestId('range-apply').innerText(), 'Show these dates')
    assert.equal(await page.getByTestId('range-cancel').innerText(), 'Cancel')
    const W = await vw()
    for (const b of await dialog.getByRole('button').all()) { const r = await box(b); assert.ok(r.h >= 44 && r.l >= 0 && r.r <= W, `sheet button ${await b.innerText()} ${JSON.stringify(r)}`) }
    await tapLoc(page.getByTestId('range-cancel')); await dialog.waitFor({ state: 'detached' })
    assert.equal(await custom.getAttribute('aria-pressed'), 'false')
    assert.match(await label(), /^Week · /)
  })

  await step(`${tag} quick picks fill From / To and show as selected`, async () => {
    await openSheet()
    const t = parse(TODAY)
    const picks = {
      'pick-month': [key(new Date(t.getFullYear(), t.getMonth(), 1)), TODAY],
      'pick-last': [key(new Date(t.getFullYear(), t.getMonth() - 1, 1)), key(new Date(t.getFullYear(), t.getMonth(), 0))],
      'pick-90': [ago(89), TODAY],
    }
    for (const [id, [f, to]] of Object.entries(picks)) {
      await tapLoc(page.getByTestId(id)); await page.waitForTimeout(80)
      assert.equal(await page.getByTestId('range-from').inputValue(), f, `${id} from`)
      assert.equal(await page.getByTestId('range-to').inputValue(), to, `${id} to`)
      for (const o of Object.keys(picks)) assert.equal(await page.getByTestId(o).getAttribute('aria-pressed'), String(o === id), `${o} selected after ${id}`)
    }
    await tapLoc(page.getByTestId('pick-last')); await page.waitForTimeout(250)
    await page.screenshot({ path: `${OUT}v118-sheet-${tag}.png` })
    // Editing a date clears the pick highlight.
    await page.getByTestId('range-from').fill(add(picks['pick-last'][0], 1))
    for (const o of Object.keys(picks)) assert.equal(await page.getByTestId(o).getAttribute('aria-pressed'), 'false')
  })

  await step(`${tag} To before From: inline error, button disabled; out-of-bounds dates also blocked`, async () => {
    await page.getByTestId('range-from').fill(ago(10)); await page.getByTestId('range-to').fill(ago(20))
    assert.equal(await page.getByTestId('range-err').innerText(), 'End date is before start date')
    assert.equal(await page.getByTestId('range-err').getAttribute('role'), 'alert')
    assert.equal(await page.getByTestId('range-apply').isDisabled(), true)
    await page.evaluate(() => document.activeElement?.blur())
    await page.waitForTimeout(150)
    await page.screenshot({ path: `${OUT}v118-error-${tag}.png` })
    await page.getByTestId('range-to').fill(ago(-2))
    assert.equal(await page.getByTestId('range-apply').isDisabled(), true, 'to after today')
    await page.getByTestId('range-from').fill(ago(FIRST_AGO + 3)); await page.getByTestId('range-to').fill(ago(5))
    assert.equal(await page.getByTestId('range-apply').isDisabled(), true, 'from before first day')
    await page.getByTestId('range-from').fill(ago(10))
    assert.equal(await page.getByTestId('range-err').count(), 0)
    assert.equal(await page.getByTestId('range-apply').isDisabled(), false)
    await tapLoc(page.getByTestId('range-cancel')); await dialog.waitFor({ state: 'detached' })
  })

  const dF = ago(26), dT = ago(3), dKeys = span(dF, dT)
  await step(`${tag} daily range (24 days): chip + label, totals, protein hit X of N, day list, daily bars, no swipe, hint`, async () => {
    await apply(dF, dT)
    assert.equal(await custom.innerText(), rangeLabel(dF, dT))
    assert.equal(await custom.getAttribute('aria-pressed'), 'true')
    assert.equal(await custom.getAttribute('aria-label'), `Custom range, ${rangeLabel(dF, dT)}. Change dates`)
    assert.equal(await page.getByRole('group', { name: 'Range' }).getByRole('button', { pressed: true }).count(), 1)
    assert.equal(await label(), `Custom · ${rangeLabel(dF, dT)}`)
    const b = await bars()
    assert.deepEqual(b.map((x) => x.key), dKeys); assert.ok(b.every((x) => x.vis === 'yes'))
    assert.deepEqual(b.map((x) => Number(x.v)), dKeys.map((k) => closedDays[k].balance))
    const chart = page.getByTestId('trend-chart')
    assert.equal(await chart.getAttribute('data-swipe'), 'no')
    assert.equal(await page.getByTestId('chart-hint').innerText(), 'Hold to see a day')
    assert.match(await chart.getAttribute('aria-label'), /Press and hold to see a day\.$/)
    const total = dKeys.reduce((a, k) => a + closedDays[k].balance, 0)
    assert.equal(Number(await page.getByTestId('week-total').getAttribute('data-value')), total)
    assert.deepEqual(await page.locator('[data-testid=day-list] [data-day]').evaluateAll((e) => e.map((x) => x.getAttribute('data-day'))), [...dKeys].reverse())
    // Swiping does nothing; the hold still works.
    const r = await box(chart)
    await touch('touchStart', r.l + r.w * 0.3, r.t + r.h * 0.45)
    for (let s = 1; s <= 8; s++) { await touch('touchMove', r.l + r.w * 0.3 + s * 20, r.t + r.h * 0.45); await page.waitForTimeout(16) }
    await touch('touchEnd'); await page.waitForTimeout(500)
    assert.equal(await chart.getAttribute('data-page'), '0')
    assert.equal(await label(), `Custom · ${rangeLabel(dF, dT)}`)
    await page.keyboard.press('Escape')
    await hold(dKeys[5], async () => {
      const hdr = page.getByTestId('scrub-header')
      await hdr.waitFor()
      assert.equal(Number((await page.getByTestId('scrub-value').innerText()).replace(/[^\d]/g, '')) * Math.sign(closedDays[dKeys[5]].balance), closedDays[dKeys[5]].balance)
    })
    // Protein view uses the range too.
    await view('Protein')
    const target = Number((await page.getByText(/^.*Hit protein \d+ of \d+ days\./).innerText()).match(/target ([\d,]+) grams/)[1].replace(',', ''))
    const hit = dKeys.filter((k) => closedDays[k].protein >= target).length
    assert.equal(await page.getByTestId('protein-hit').innerText(), `${hit} / ${dKeys.length}`)
    assert.ok(await page.getByText(`Hit protein ${hit} of ${dKeys.length} days.`, { exact: false }).count() === 1)
    assert.equal(await page.getByTestId('protein-list').locator('li').count(), dKeys.length)
    assert.equal(await page.locator('[data-testid=trend-chart] [data-bar]').count(), dKeys.length)
    await view('Balance')
    await fitsRow()
    await page.evaluate(() => window.scrollTo(0, 0)); await page.waitForTimeout(1200) // bar labels and the line animate in
    await page.screenshot({ path: `${OUT}v118-daily-${tag}.png` })
  })

  await step(`${tag} tapping Custom again reopens the sheet with the current range; 7d and 30d return to normal`, async () => {
    await openSheet()
    assert.equal(await page.getByTestId('range-from').inputValue(), dF)
    assert.equal(await page.getByTestId('range-to').inputValue(), dT)
    await tapLoc(page.getByTestId('range-cancel')); await dialog.waitFor({ state: 'detached' })
    assert.equal(await label(), `Custom · ${rangeLabel(dF, dT)}`)
    await tapLoc(page.getByRole('button', { name: '7d (7 days)' })); await page.waitForTimeout(250)
    assert.match(await label(), /^Week · /)
    assert.equal(await custom.innerText(), 'Custom'); assert.equal(await custom.getAttribute('aria-pressed'), 'false')
    assert.equal(await page.getByTestId('trend-chart').getAttribute('data-swipe'), 'yes')
    assert.match(await page.getByTestId('chart-hint').innerText(), /swipe for weeks/)
    assert.equal((await bars()).filter((x) => x.vis === 'yes').length, 7)
    await apply(dF, dT)
    await tapLoc(page.getByRole('button', { name: '30d (30 days)' })); await page.waitForTimeout(250)
    assert.match(await label(), /^30 days · /)
    assert.equal(await custom.innerText(), 'Custom')
    // Not custom: the sheet opens on the period shown.
    await openSheet()
    assert.equal(await page.getByTestId('range-from').inputValue(), ago(29))
    await tapLoc(page.getByTestId('range-cancel')); await dialog.waitFor({ state: 'detached' })
  })

  await step(`${tag} weekly range (90 days): weekly bars labelled by week start, hold shows the week, no swipe, hint`, async () => {
    await openSheet(); await tapLoc(page.getByTestId('pick-90'))
    await tapLoc(page.getByTestId('range-apply')); await dialog.waitFor({ state: 'detached' }); await page.waitForTimeout(300)
    const keys = span(ago(89), TODAY)
    const weeks = []
    for (const k of keys) { if (!weeks.length || parse(k).getDay() === 1) weeks.push([]); weeks.at(-1).push(k) }
    assert.equal(await label(), `Custom · ${rangeLabel(ago(89), TODAY)}`)
    const b = await bars()
    assert.deepEqual(b.map((x) => x.key), weeks.map((w) => w[0]))
    const avgOf = (w) => { const c = w.filter((k) => closedDays[k]); return c.length ? Math.round(c.reduce((a, k) => a + closedDays[k].balance, 0) / c.length) : null }
    // A week with no closed day yet (today only) shows today so far, marked open.
    assert.deepEqual(b.map((x, i) => (avgOf(weeks[i]) == null ? 'open' : x.v === '' ? null : Number(x.v))), weeks.map((w) => avgOf(w) ?? 'open'))
    const opens = await page.locator('[data-testid=trend-chart] [data-bar]').evaluateAll((e) => e.map((x) => x.getAttribute('data-open')))
    weeks.forEach((w, i) => assert.equal(opens[i], avgOf(w) == null ? 'yes' : 'no', `week ${w[0]} open`))
    const chart = page.getByTestId('trend-chart')
    assert.equal(await chart.getAttribute('data-unit'), 'week'); assert.equal(await chart.getAttribute('data-swipe'), 'no')
    assert.equal(await page.getByTestId('chart-hint').innerText(), 'Hold to see a week')
    assert.equal(await page.getByTestId('chart-legend').getByText('7-day average').count(), 0)
    assert.equal((await page.getByTestId('trend-line').getAttribute('d')) ?? '', '', 'no average line')
    assert.equal(await page.locator('[data-testid=day-list] [data-day]').count(), keys.length)
    const total = keys.reduce((a, k) => a + (closedDays[k]?.balance ?? 0), 0)
    assert.equal(Number(await page.getByTestId('week-total').getAttribute('data-value')), total)
    // Tick labels are week starts ("3 Oct"), none clipped by the chart.
    const ticks = await page.locator('[data-testid=trend-chart] text[data-tick]').evaluateAll((e) => e.map((t) => t.textContent))
    if (ticks.length) for (const t of ticks) assert.match(t, /^\d{1,2} \w{3,4}$/)
    const W = weeks[4]
    const cl = W.filter((k) => closedDays[k]), wTotal = cl.reduce((a, k) => a + closedDays[k].balance, 0)
    await hold(W[0], async () => {
      const hdr = page.getByTestId('scrub-header'); await hdr.waitFor()
      assert.equal(await hdr.getAttribute('data-week'), W[0])
      const t = await hdr.innerText()
      assert.ok(t.includes(rangeLabel(W[0], W.at(-1))), t)
      assert.ok(t.includes(`${cl.length} closed days`), t)
      assert.ok(t.includes('Daily avg') && t.includes('kcal a day'), t)
      assert.equal(Number((await page.getByTestId('scrub-value').innerText()).replace(/[^\d]/g, '')), Math.abs(wTotal))
      assert.equal(Number((await page.getByTestId('scrub-avg').innerText()).replace(/[^\d]/g, '')), Math.abs(avgOf(W)))
      await page.screenshot({ path: `${OUT}v118-weekly-hold-${tag}.png` })
    })
    await view('Protein')
    const pb = await page.locator('[data-testid=trend-chart] [data-bar]').count()
    assert.equal(pb, weeks.length)
    await hold(W[0], async () => {
      const t = await page.getByTestId('scrub-header').innerText()
      assert.ok(t.includes('Days hit') && t.includes(`/ ${W.length}`), t)
    })
    await view('Balance')
  })

  await step(`${tag} range across years: label has years, chip does not`, async () => {
    const y = parse(TODAY).getFullYear() - 1
    const f = `${y}-12-20`, t = `${y + 1}-01-10`
    await apply(f, t)
    assert.equal(await label(), `Custom · ${dmy(f)} – ${dmy(t)}`)
    assert.equal(await custom.innerText(), `${dm(f)} – ${dm(t)}`)
    assert.equal(await page.getByTestId('trend-chart').getAttribute('data-unit'), 'day')
    assert.equal(await page.locator('[data-testid=trend-chart] [data-bar]').count(), span(f, t).length)
    await fitsRow()
    const lb = await box(page.getByTestId('period-range')), W = await vw()
    assert.ok(lb.r <= W - 8, `label fits ${JSON.stringify(lb)}`)
    const est = await box(page.getByTestId('est-change'))
    assert.ok(est.h < 50 && est.r <= W, `Est. change on one line ${JSON.stringify(est)}`)
    assert.ok(lb.r <= est.l + 1 || lb.b <= est.t, 'label and Est. change do not overlap')
    await page.evaluate(() => window.scrollTo(0, 0)); await page.waitForTimeout(1200) // bar labels and the line animate in
    await page.screenshot({ path: `${OUT}v118-years-${tag}.png` })
  })

  await step(`${tag} remembered while the app is open (leave History and come back); a reload resets to 7d`, async () => {
    await apply(dF, dT)
    await page.getByRole('link', { name: 'Today', exact: true }).click(); await page.getByTestId('balance').waitFor()
    await history()
    assert.equal(await label(), `Custom · ${rangeLabel(dF, dT)}`)
    assert.equal(await custom.innerText(), rangeLabel(dF, dT))
    await page.reload(); await page.getByTestId('trend-chart').waitFor().catch(async () => { await page.goto(BASE + '/'); await history() })
    if (!(await page.getByTestId('trend-chart').count())) await history()
    assert.match(await label(), /^Week · /)
    assert.equal(await custom.innerText(), 'Custom')
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
