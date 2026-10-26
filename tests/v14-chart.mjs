// v1.4 History chart checks, shared by tests/e2e.mjs (local preview) and tests/live.mjs (GitHub Pages).
// Seeds 62 closed days (test data only, never in the app), then drives real touch input through CDP:
// hold-to-scrub, swipe paging, the today edge, vertical page scroll, 30-day paging, reduced-motion snap, haptics log.
import assert from 'node:assert/strict'

const pad = (n) => String(n).padStart(2, '0')
const key = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
export const daysAgo = (i) => { const d = new Date(); d.setHours(12); d.setDate(d.getDate() - i); return key(d) }

export function historySeed() {
  const today = new Date(); today.setHours(12)
  const T = key(today)
  let seed = 11; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
  const now = Date.now()
  const closedDays = {}, entries = []
  let n = 0
  for (let i = 62; i >= 1; i--) {
    const d = new Date(today); d.setDate(d.getDate() - i)
    const k = key(d), dow = d.getDay()
    let bal = 260 + (62 - i) * 3 + (rnd() - 0.5) * 520
    if (dow === 6 || dow === 0) bal = -120 - rnd() * 480
    if (i === 40) bal = -1650
    bal = Math.round(bal)
    const eaten = 1900 + 150 - bal
    closedDays[k] = { bmr: 1900, movement: 0, burned: 150, eaten, balance: bal, goal: 380, protein: 110 + Math.round(rnd() * 60), closedAt: now - i * 864e5, auto: true }
    entries.push({ id: 'e' + ++n, date: k, meal: 'lunch', foodId: null, name: 'Nasi campur', servingLabel: '1 portion', servingMult: 1, qty: 1, kcal: eaten, protein: 120, carbs: 200, fat: 60, createdAt: now - i * 864e5 })
  }
  const e = (meal, name, kcal, protein, carbs, fat) => ({ id: 'e' + ++n, date: T, meal, foodId: null, name, servingLabel: '1 portion', servingMult: 1, qty: 1, kcal, protein, carbs, fat, createdAt: now - 1e6 + n })
  entries.push(e('breakfast', 'Bubur ayam', 372, 18, 52, 10), e('lunch', 'Gado-gado', 420, 18, 38, 22))
  return {
    version: 1,
    profile: { age: 35, sex: 'male', heightCm: 180, weightKg: 92, activity: 'light', goal: 'lose', pace: 'standard', goalWeightKg: 80, bmr: 1900, bmrCustom: true, includeMovement: false, macros: { protein: null, carbs: null, fat: null } },
    entries, exercises: [], closedDays, favourites: [],
  }
}

export async function seedHistory(p, BASE) {
  await p.goto(BASE + '/')
  await p.evaluate((s) => { localStorage.clear(); localStorage.setItem('calorie-app:v1', JSON.stringify(s)); localStorage.setItem('calorie-app:backup', JSON.stringify({ lastExportAt: Date.now(), dismissedAt: null })) }, historySeed())
  await p.goto(BASE + '/history'); await p.getByTestId('trend-chart').waitFor()
}

export async function chartTools(p, ctx) {
  const cdp = await ctx.newCDPSession(p)
  const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }] })
  const wait = (ms) => p.waitForTimeout(ms)
  const chart = p.getByTestId('trend-chart')
  const box = async () => { await chart.scrollIntoViewIfNeeded(); return chart.boundingBox() }
  const pageNo = async () => Number(await chart.getAttribute('data-page'))
  const visibleDays = () => p.locator('[data-day]').evaluateAll((els) => els.map((e) => e.getAttribute('data-day')))
  const swipe = async (dir, { steps = 8, dt = 16, settle = 700 } = {}) => { // dir +1 = finger to the right = older
    const r = await box(); const y = r.y + r.height * 0.45
    const x0 = r.x + r.width * (dir > 0 ? 0.25 : 0.8)
    await touch('touchStart', x0, y)
    for (let s = 1; s <= steps; s++) { await touch('touchMove', x0 + dir * s * (160 / steps), y); await wait(dt) }
    const tEnd = await p.evaluate(() => performance.now())
    await touch('touchEnd'); if (settle) await wait(settle)
    return tEnd
  }
  return { touch, wait, chart, box, pageNo, visibleDays, swipe }
}

/** Full behaviour run on a 390x844 touch page with motion on. Returns a summary for the log. */
export async function chartChecks(p, ctx, BASE) {
  await seedHistory(p, BASE)
  const { touch, wait, chart, box, pageNo, visibleDays, swipe } = await chartTools(p, ctx)
  const out = {}
  // Entry animation: line draws in 200 ms + 650 ms = 0.85 s.
  const anim = await p.getByTestId('trend-line').evaluate((el) => el.getAnimations().map((a) => { const t = a.effect.getTiming(); return t.delay + t.duration }))
  assert.deepEqual(anim, [850], 'line entry animation 0.85 s')
  await wait(1000)
  assert.equal(await pageNo(), 0)
  assert.match(await p.getByTestId('period-range').innerText(), /^Week · \d+ (\w+ )?– \d+ \w+$/)
  assert.ok((await p.getByTestId('trend-line').getAttribute('d')).length > 50, '7-day average line drawn')
  assert.equal(await p.locator('[data-bar][data-visible=yes]').count(), 7)
  const scale = await p.getByTestId('chart').getAttribute('data-scale')
  const refs = await p.locator('[data-ref]').evaluateAll((els) => els.map((e) => e.getAttribute('data-ref')))
  assert.deepEqual(refs, ['0', '380', '-380'], '0 and ± goal lines')
  const stored = await p.evaluate(() => localStorage.getItem('calorie-app:v2'))
  assert.equal(JSON.parse(stored).version, 2)
  assert.deepEqual((await visibleDays())[0], daysAgo(0))

  // A quick tap (< 150 ms) does not scrub.
  let r = await box(); const y = r.y + r.height * 0.45
  await touch('touchStart', r.x + r.width * 0.5, y); await wait(60); await touch('touchEnd'); await wait(150)
  assert.equal(await p.getByTestId('scrub-header').count(), 0, 'tap does not scrub')

  // Hold to scrub: snaps per day, header shows the day, its balance and the 7-day average.
  await p.evaluate(() => { window.__haptics = [] })
  await touch('touchStart', r.x + r.width * 0.45, y); await wait(260)
  assert.equal(await p.getByTestId('scrub-header').count(), 1, 'hold 150 ms starts scrubbing')
  const seen = new Set()
  for (let s = 0; s <= 20; s++) {
    await touch('touchMove', r.x + r.width * (0.45 + (0.5 * s) / 20), y); await wait(30)
    seen.add(await p.getByTestId('scrub-header').locator('.eyebrow').first().innerText())
  }
  out.scrubHeader = (await p.getByTestId('scrub-header').innerText()).replace(/\n/g, ' | ')
  assert.match(out.scrubHeader, /^\w{3} \d+ \w{3} \| [+−]?[\d,]+ \| kcal (deficit|surplus|even) · (closed|open, so far) \| 7-day avg \| [+−]?[\d,]+ \| kcal a day$/)
  assert.equal(await p.getByTestId('scrub-indicator').count(), 1)
  const sel = (await p.locator('[data-testid=chart] [data-bar] text[font-size="13"][font-weight="700"]').count())
  assert.equal(sel, 1, 'one day label highlighted')
  const scrubTicks = await p.evaluate(() => window.__haptics.filter((h) => h.kind === 'select').length)
  assert.ok(seen.size >= 3 && scrubTicks === seen.size, `one tick per day: ${scrubTicks} ticks, ${seen.size} days`)
  out.scrubDays = seen.size
  await touch('touchEnd'); await wait(150)
  assert.equal(await p.getByTestId('scrub-header').count(), 0, 'release restores the period header')
  assert.equal(await p.getByTestId('period-range').count(), 1)

  // Swipe right pages back a week; the settle is <= 340 ms; one settle tick; the day list follows; the y scale stays.
  await p.evaluate(() => { window.__haptics = [] })
  const t0 = await swipe(+1)
  assert.equal(await pageNo(), 1)
  const ticks = await p.evaluate(() => window.__haptics)
  const settles = ticks.filter((h) => h.kind === 'settle')
  assert.equal(settles.length, 1, 'one settle tick')
  out.settleMs = Math.round(settles[0].t - t0)
  assert.ok(out.settleMs <= 340 + 50, 'snap <= 340 ms, got ' + out.settleMs)
  out.hapticsVia = [...new Set(ticks.map((h) => h.via))].join(',')
  out.weekBack = await p.getByTestId('period-range').innerText()
  const days1 = await visibleDays()
  assert.deepEqual([days1.length, days1[0], days1[6]], [7, daysAgo(7), daysAgo(13)], 'day list follows the shown week')
  assert.equal(await p.getByTestId('chart').getAttribute('data-scale'), scale, 'fixed y scale')
  await swipe(+1); assert.equal(await pageNo(), 2)
  // Back to today, and never past it.
  await swipe(-1); await swipe(-1); assert.equal(await pageNo(), 0)
  await swipe(-1); assert.equal(await pageNo(), 0, "can't swipe past today")
  assert.deepEqual((await visibleDays())[0], daysAgo(0))

  // Vertical drags still scroll the page.
  const scrollY = () => p.evaluate(() => Math.max(window.scrollY, ...[...document.querySelectorAll('main, #root *')].map((e) => e.scrollTop)))
  await p.evaluate(() => { document.querySelectorAll('main, #root *').forEach((e) => { e.scrollTop = 0 }); window.scrollTo(0, 0) }); await wait(100)
  r = await chart.boundingBox()
  const sy0 = await scrollY()
  const vx = r.x + r.width * 0.5, vy = r.y + r.height * 0.6
  await touch('touchStart', vx, vy)
  for (let s = 1; s <= 10; s++) { await touch('touchMove', vx, vy - s * 20); await wait(16) }
  await touch('touchEnd'); await wait(400)
  out.verticalScroll = (await scrollY()) - sy0
  assert.ok(out.verticalScroll > 40, 'page scrolls on a vertical drag over the chart: ' + out.verticalScroll)
  assert.equal(await pageNo(), 0); assert.equal(await p.getByTestId('scrub-header').count(), 0)

  // 30 days: 30 bars, pages by 30 days.
  await p.getByRole('button', { name: /30d/ }).click(); await wait(1200)
  assert.match(await p.getByTestId('period-range').innerText(), /^30 days · /)
  assert.equal(await p.locator('[data-bar][data-visible=yes]').count(), 30)
  await swipe(+1); assert.equal(await pageNo(), 1)
  const d30 = await visibleDays(); assert.deepEqual([d30.length, d30[0]], [30, daysAgo(30)])
  out.monthBack = await p.getByTestId('period-range').innerText()
  await p.getByRole('button', { name: /7d/ }).click(); await wait(300)
  assert.equal(await pageNo(), 0)
  assert.equal(await p.evaluate(() => localStorage.getItem('calorie-app:v2')), stored, 'chart never writes storage')
  assert.equal(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'no sideways scroll')
  return out
}

/** Reduced motion: no entry animation, swipe snaps instantly. */
export async function reducedMotionChecks(p, ctx, BASE) {
  await seedHistory(p, BASE)
  const { swipe, pageNo, wait } = await chartTools(p, ctx)
  assert.deepEqual(await p.getByTestId('trend-line').evaluate((el) => el.getAnimations().length), 0)
  assert.equal(await p.locator('.bar-grow').first().evaluate((el) => getComputedStyle(el).animationName), 'none')
  await swipe(+1, { settle: 0 }); await wait(40)
  assert.equal(await pageNo(), 1, 'instant snap')
}
