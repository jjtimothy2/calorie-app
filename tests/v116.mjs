// v1.16: Home speedometer gauge (Reed's spec) and protein target. The ring is replaced by a half-circle gauge whose left
// end is minus the day's burn (BMR + movement, plus exercise), a rider dot at net = eaten - burn, and fixed zones per plan:
// Lose green / light orange / red, Keep track / green within 100 of even / red, Gain track / green +S to +S+200 / red.
// Past the right end the rider pins and the end reads "<end>+ off the scale" while the big number keeps the real figure.
// The equation card line, After this and the verdict share the gauge's words. The protein card reads "44 g of 125 g".
// WebKit (iPhone 14) at 390x844 and 375x667. Screenshots: screenshots/v116-*.png.
// Usage: npm run build && npx vite preview --port 4174 & node tests/v116.mjs
import { webkit, devices } from 'playwright'
import assert from 'node:assert/strict'

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
const t0 = Date.now() - 3600_000
let n = 0
const food = (date, kcal, protein = 20, meal = 'lunch') => ({ id: `f${++n}`, date, meal, foodId: null, name: `Meal ${n}`, servingLabel: '1 plate', servingMult: 1, qty: 1, kcal, protein, carbs: 30, fat: 10, createdAt: t0 + n * 1000, source: 'manual' })
const walk = (date, kcal) => ({ id: `x${++n}`, date, name: 'Brisk walk', kcal, minutes: 60, createdAt: t0 + n * 1000 })
const macros = { protein: null, carbs: null, fat: null }
const body = { age: 32, sex: 'female', heightCm: 165, weightKg: 70, activity: 'light', bmrCustom: true, includeMovement: false, macros }
const PLANS = {
  // Sari: burn 1,838, 837 deficit goal.
  lose: { ...body, goal: 'lose', bmr: 1838, goalWeightKg: 60, target: 1001, dailyGoal: 837 },
  // Sari on Keep: goal even.
  keep: { ...body, goal: 'keep', bmr: 1838, goalWeightKg: 70, target: 1838, dailyGoal: 0 },
  // Bima: burn 2,171, 300 surplus goal.
  gain: { ...body, sex: 'male', weightKg: 62, goal: 'gain', bmr: 2171, goalWeightKg: 68, target: 2471, dailyGoal: -300 },
}
const state = (plan, { eaten = [], ex = [], closedDays = {}, protein = 20 } = {}) => ({
  version: 3, profile: PLANS[plan], favourites: [], weights: [{ date: TODAY, kg: PLANS[plan].weightKg }], closedDays,
  entries: eaten.map((k) => food(TODAY, k, protein / eaten.length)), exercises: ex.map((k) => walk(TODAY, k)),
})
const AI = JSON.stringify({ provider: 'gemini', key: 'test-key-not-real' })
const FOODS = JSON.stringify({ version: 1, foods: [] })
const C = { gInk: 'rgb(23, 128, 70)', lightInk: 'rgb(194, 84, 47)', red: 'rgb(179, 54, 42)', ink: 'rgb(42, 36, 32)' }
const ZONE = { green: '#2f8f5b', light: '#eaa58b', red: '#b3362a', track: '#c9bca5' }

const browser = await webkit.launch()
for (const [width, height] of [[390, 844], [375, 667]]) {
  const tag = `${width}x${height}`
  const ctx = await browser.newContext({ ...devices['iPhone 14'], viewport: { width, height }, deviceScaleFactor: 2, serviceWorkers: 'block', reducedMotion: 'reduce' })
  const page = await ctx.newPage()
  page.on('console', (m) => { if ((m.type() === 'error' || m.type() === 'warning') && !/service worker/i.test(m.text())) errors.push(`${tag}: ${m.type()}: ${m.text()}`) })
  page.on('pageerror', (er) => errors.push(`${tag}: pageerror: ${er.message}`))
  await page.goto(`${BASE}/`)
  let seeded = null
  const load = async (s, path = '/') => {
    seeded = s
    await page.evaluate(([v3, ai, foods]) => {
      localStorage.clear()
      localStorage.setItem('calorie-app:v3', v3); localStorage.setItem('calorie-app:ai', ai); localStorage.setItem('calorie-app:foods', foods)
      localStorage.setItem('calorie-app:backup', JSON.stringify({ lastExportAt: Date.now(), dismissedAt: null }))
    }, [JSON.stringify(s), AI, FOODS])
    await page.goto(`${BASE}${path}`)
    if (path === '/') await page.getByTestId('ring').waitFor()
  }
  const text = (id) => page.getByTestId(id).first().textContent()
  const fill = (id) => page.getByTestId(id).first().evaluate((el) => getComputedStyle(el).fill)
  const colour = (id) => page.getByTestId(id).first().evaluate((el) => getComputedStyle(el).color)
  const ring = (a) => page.getByTestId('ring').getAttribute(`data-${a}`)
  const zones = () => page.$$eval('[data-testid=gauge] path[data-zone-color]', (ps) => ps.map((p) => p.getAttribute('data-zone-color')))
  // The gauge's words: big number, label, sub, and the equation card line.
  const reads = async (big, label, sub, line, ink, zone, state) => {
    assert.equal((await text('balance')).trim(), big)
    assert.equal(await text('balance-label'), label)
    assert.equal(await text('ring-goal'), sub)
    assert.equal(await text('goal-progress'), line)
    assert.equal(await fill('balance'), ink, 'big number takes the zone ink')
    assert.equal(await ring('zone'), zone)
    assert.equal(await ring('state'), state)
    for (const t of [await page.getByTestId('ring').textContent(), line]) assert.ok(!/[—;]/.test(t), `no em dash or semicolon: ${t}`)
    assert.ok(!/past your goal|to go/.test(line), line)
  }
  // Fits: no sideways scroll, every gauge label inside the screen, the gauge block about 202 px tall.
  const fits = async () => {
    const r = await page.evaluate(() => {
      const main = document.querySelector('main')
      const texts = [...document.querySelectorAll('[data-testid=gauge] text, [data-testid=gauge-overflow]')].map((t) => { const b = t.getBoundingClientRect(); return { t: t.textContent, l: b.left, r: b.right } })
      return { doc: document.documentElement.scrollWidth, main: main.scrollWidth - main.clientWidth, h: document.querySelector('[data-testid=ring]').getBoundingClientRect().height, texts, w: innerWidth }
    })
    assert.ok(r.doc <= r.w, `no sideways scroll ${r.doc}`)
    assert.ok(r.main <= 0, `main does not scroll sideways ${r.main}`)
    for (const t of r.texts) assert.ok(t.l >= 0 && t.r <= r.w, `"${t.t}" inside the screen (${t.l.toFixed(1)} to ${t.r.toFixed(1)})`)
    assert.ok(r.h >= 190 && r.h <= 206, `gauge block about 202 px tall, got ${r.h}`)
  }
  const shot = async (name) => {
    await page.evaluate(() => document.querySelector('main').scrollTo(0, 0)); await page.waitForTimeout(250)
    await page.screenshot({ path: `${OUT}v116-${name}-${tag}.png` })
  }
  const noDataChange = async () => {
    const s = await page.evaluate(() => ({ v3: localStorage.getItem('calorie-app:v3'), ai: localStorage.getItem('calorie-app:ai'), foods: localStorage.getItem('calorie-app:foods') }))
    assert.equal(s.ai, AI); assert.equal(s.foods, FOODS)
    const v3 = JSON.parse(s.v3); assert.equal(v3.version, 3); assert.deepEqual(v3.entries, seeded.entries)
  }

  const fmt = (x) => Math.round(x).toLocaleString('en-US')
  // The app works the daily goal out from the goal weight and date, so read it off the gauge and seed relative to it.
  await load(state('lose'))
  const G = Number((await text('gauge-goal')).replace(/[^0-9]/g, ''))
  const B = 1838
  await step(`${tag} Lose, 0 eaten: rider on the left end (-1,838 burn), goal line at -${G}, green / light / red zones`, async () => {
    assert.ok(G > 300 && G < 1000, `goal ${G}`)
    assert.equal(await ring('plan'), 'lose')
    assert.equal(Number(await page.getByTestId('gauge-needle').getAttribute('data-f')), 0)
    assert.equal(await text('gauge-burn'), '−1,838'); assert.equal(await text('gauge-burn-label'), 'burn')
    assert.equal(await text('gauge-end'), '+500'); assert.equal(await text('gauge-end-label'), 'surplus')
    assert.equal(await text('gauge-goal'), `Goal −${fmt(G)}`); assert.equal(await text('gauge-zero'), '0')
    assert.deepEqual(await zones(), [ZONE.green, ZONE.light, ZONE.red])
    await reads(fmt(B - G), 'kcal left to eat', `Deficit so far 1,838 · goal ${fmt(G)}`, `${fmt(B - G)} kcal left to eat.`, C.gInk, 'green', 'on')
    assert.equal(await page.getByTestId('gauge-overflow').count(), 0)
  })
  await step(`${tag} Lose under: 301 kcal left to eat in green, Balance green`, async () => {
    const e = B - G - 301
    await load(state('lose', { eaten: [e] }))
    await reads('301', 'kcal left to eat', `Deficit so far ${fmt(G + 301)} · goal ${fmt(G)}`, '301 kcal left to eat.', C.gInk, 'green', 'on')
    assert.equal(await colour('eq-balance'), C.gInk)
    const f = Number(await page.getByTestId('gauge-needle').getAttribute('data-f'))
    assert.ok(Math.abs(f - e / (B + 500)) < 0.001, `rider at ${f}`)
    await fits(); await shot('lose-under'); await noDataChange()
  })
  await step(`${tag} Lose over: 299 kcal over your goal in light orange, still a deficit`, async () => {
    await load(state('lose', { eaten: [B - G + 299] }))
    await reads('299', 'kcal over your goal', `Deficit so far ${fmt(G - 299)} · goal ${fmt(G)}`, `299 kcal over your ${fmt(G)} goal.`, C.lightInk, 'light', 'past')
    assert.equal(await colour('eq-balance'), C.lightInk)
    await fits(); await shot('lose-over')
  })
  await step(`${tag} Lose surplus: 2,100 eaten, over in red, Surplus so far 262`, async () => {
    await load(state('lose', { eaten: [2100] }))
    await reads(fmt(262 + G), 'kcal over your goal', `Surplus so far 262 · goal ${fmt(G)}`, `${fmt(262 + G)} kcal over your ${fmt(G)} goal.`, C.red, 'red', 'surplus')
    assert.equal(await colour('eq-balance'), C.red)
  })
  await step(`${tag} Exercise: a 400 kcal walk moves the left end to -2,238, the goal line moves, 299 over is back in green (101 left)`, async () => {
    await load(state('lose', { eaten: [B - G + 299] }))
    const before = await page.getByTestId('gauge-goal').evaluate((t) => t.getAttribute('x'))
    await load(state('lose', { eaten: [B - G + 299], ex: [400] }))
    assert.equal(await text('gauge-burn'), '−2,238'); assert.equal(await text('gauge-burn-label'), 'burn + exercise')
    assert.equal(await ring('lo'), '-2238')
    const after = await page.getByTestId('gauge-goal').evaluate((t) => t.getAttribute('x'))
    assert.ok(Number(after) !== Number(before), `goal line moves on the rescaled arc (${before} to ${after})`)
    await reads('101', 'kcal left to eat', `Deficit so far ${fmt(G + 101)} · goal ${fmt(G)}`, '101 kcal left to eat.', C.gInk, 'green', 'on')
    await fits(); await shot('exercise')
  })
  await step(`${tag} 500+: 3,000 eaten pins the rider at the end, "500+ off the scale" in red with a chevron, big number is the real figure`, async () => {
    await load(state('lose', { eaten: [3000] }))
    assert.equal(await ring('pinned'), 'true')
    assert.equal(Number(await page.getByTestId('gauge-needle').getAttribute('data-f')), 1)
    assert.equal(await text('gauge-end'), '500+'); assert.equal(await fill('gauge-end'), C.red)
    assert.equal(await text('gauge-end-label'), 'off the scale')
    assert.equal(await page.getByTestId('gauge-overflow').count(), 1)
    await reads(fmt(1162 + G), 'kcal over your goal', `Surplus so far 1,162 · goal ${fmt(G)}`, `${fmt(1162 + G)} kcal over your ${fmt(G)} goal.`, C.red, 'red', 'surplus')
    await fits(); await shot('500plus')
  })
  await step(`${tag} Keep: track to -100, green within 100 of even, red past; 838 left, On target, 362 over break even`, async () => {
    await load(state('keep', { eaten: [1000] }))
    assert.equal(await ring('plan'), 'keep'); assert.equal(await text('gauge-goal'), 'Goal even')
    assert.equal(await page.getByTestId('gauge-zero').count(), 0)
    assert.deepEqual(await zones(), [ZONE.track, ZONE.green, ZONE.red])
    await reads('838', 'kcal left to eat', 'Deficit so far 838 · goal even', '838 kcal left to eat.', C.ink, 'track', 'under')
    await load(state('keep', { eaten: [1800] }))
    await reads('On target', '38 kcal under break even', 'Even, give or take 100', 'On target. 38 kcal under break even.', C.gInk, 'green', 'band')
    assert.equal(await colour('eq-balance'), C.gInk)
    await fits(); await shot('keep')
    await load(state('keep', { eaten: [2200] }))
    await reads('362', 'kcal over break even', 'Surplus so far 362 · goal even', '362 kcal over break even.', C.red, 'red', 'surplus')
  })
  await step(`${tag} Gain: track to +S, green +S to +S+200, red to +S+500; on target is green, never red, Balance follows the zone`, async () => {
    await load(state('gain'))
    const S = Number((await text('gauge-goal')).replace(/[^0-9]/g, '')), BB = 2171
    assert.ok(S > 100 && S < 1000, `surplus goal ${S}`)
    await load(state('gain', { eaten: [1200] }))
    assert.equal(await ring('plan'), 'gain'); assert.equal(await text('gauge-goal'), `Goal +${fmt(S)}`); assert.equal(await text('gauge-end'), `+${fmt(S + 500)}`)
    assert.deepEqual(await zones(), [ZONE.track, ZONE.green, ZONE.red])
    await reads(fmt(S + BB - 1200), 'kcal left to eat', `to hit your +${fmt(S)} goal`, `${fmt(S + BB - 1200)} kcal left to eat to hit your +${fmt(S)} goal.`, C.ink, 'track', 'still')
    await load(state('gain', { eaten: [BB + S] }))
    await reads('On target', `Right on your +${fmt(S)} goal`, `Surplus so far ${fmt(S)} · goal +${fmt(S)}`, `On target. Right on your +${fmt(S)} goal.`, C.gInk, 'green', 'band')
    const bal = await colour('eq-balance')
    assert.equal(bal, C.gInk, 'on-target Gain Balance is green')
    assert.ok(![C.red, C.lightInk].includes(bal))
    assert.equal(await text('eq-balance'), `−${fmt(S)}`)
    await fits(); await shot('gain')
    await load(state('gain', { eaten: [BB + S + 150] }))
    await reads('On target', `150 kcal above your +${fmt(S)} goal`, `Surplus so far ${fmt(S + 150)} · goal +${fmt(S)}`, `On target. 150 kcal above your +${fmt(S)} goal.`, C.gInk, 'green', 'band')
    assert.equal(await colour('eq-balance'), C.gInk)
    await fits()
    await load(state('gain', { eaten: [BB + S + 629] }))
    assert.equal(await ring('pinned'), 'true'); assert.equal(await text('gauge-end'), `${fmt(S + 500)}+`)
    await reads('629', 'kcal over your goal', `Surplus so far ${fmt(S + 629)} · goal +${fmt(S)}`, `629 kcal over your +${fmt(S)} goal.`, C.red, 'red', 'surplus')
    await fits()
  })
  await step(`${tag} Protein card: "X g of T g" (target muted, regular, same baseline), bar fills with grams; hit shows a green Target hit; over keeps the eaten number`, async () => {
    await load(state('lose', { eaten: [B - G - 301], protein: 44 }))
    const T = Number((await text('protein-target')).match(/^of (\d+) g$/)[1])
    assert.ok(T > 44)
    assert.equal(await text('protein-eyebrow'), 'Protein today')
    assert.equal(await text('protein-left'), `44 g of ${T} g`)
    const st = await page.getByTestId('protein-target').evaluate((el) => { const s = getComputedStyle(el); return { w: s.fontWeight, c: s.color, fs: s.fontSize } })
    assert.equal(st.w, '400'); assert.equal(st.c, 'rgb(107, 103, 95)'); assert.equal(st.fs, '17px')
    const base = await page.evaluate(() => {
      const el = document.querySelector('[data-testid=protein-left]'), sp = el.querySelector('span')
      const r = document.createRange(); r.setStart(el.firstChild, 0); r.setEnd(el.firstChild, 1)
      const a = r.getBoundingClientRect(), b = sp.getBoundingClientRect()
      return { a: a.bottom, b: b.bottom, sameLine: Math.abs(a.top - b.top) < 20 }
    })
    assert.ok(base.sameLine, 'target on the same line')
    assert.equal(await page.getByTestId('protein-hit').count(), 0)
    const pct = await page.locator('[data-testid=protein-card] .bar-fill').evaluate((el) => el.style.width)
    assert.ok(Math.abs(parseFloat(pct) - (44 / T) * 100) < 0.01, `bar fills with grams eaten: ${pct}`)
    await load(state('lose', { eaten: [B - G - 301], protein: T }))
    assert.equal(await text('protein-left'), `${T} g of ${T} g`)
    assert.equal(await text('protein-hit'), 'Target hit'); assert.equal(await colour('protein-hit'), C.gInk)
    await fits(); await shot('protein-hit')
    await load(state('lose', { eaten: [B - G - 301], protein: T + 15 }))
    assert.equal(await text('protein-left'), `${T + 15} g of ${T} g`)
    assert.equal(await text('protein-hit'), 'Target hit')
    assert.equal(await page.locator('[data-testid=protein-card] .bar-fill').evaluate((el) => el.style.width), '100%')
  })
  await step(`${tag} Closed day: the same gauge frozen at the day's final net, sub drops "so far", verdict uses the shared words`, async () => {
    const closed = { [YDAY]: { bmr: 1838, movement: 0, burned: 0, eaten: 1300, balance: 538, goal: 837, protein: 60, closedAt: t0, auto: false } }
    const s = state('lose', { eaten: [B - G - 301], closedDays: closed })
    s.entries.push(food(YDAY, 1300, 60))
    await load(s)
    await page.getByTestId('day-prev').click()
    await page.waitForFunction(() => document.querySelector('#day-title')?.textContent === 'Yesterday')
    await page.getByTestId('closed-pill').waitFor()
    await reads('299', 'kcal over your goal', 'Deficit 538 · goal 837', 'Finished 299 kcal over your 837 goal. Still a good day.', C.lightInk, 'light', 'past')
    assert.equal(await text('gauge-burn'), '−1,838')
    await fits(); await shot('closed-day')
    await page.goto(`${BASE}/day/${YDAY}`)
    await page.getByTestId('verdict-message').waitFor()
    assert.equal(await text('verdict-message'), 'Finished 299 kcal over your 837 goal. Still a good day.')
    await noDataChange()
  })
  await ctx.close()
}
await browser.close()
results.push(errors.length ? `FAIL console: ${errors.join(' | ')}` : 'PASS no console errors or warnings')
console.log(results.join('\n'))
if (results.some((r) => r.startsWith('FAIL'))) process.exit(1)
