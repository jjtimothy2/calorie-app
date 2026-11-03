// v1.21.2 (approved by Jordy 3 Nov 2026, Reed's spec). 1) With no chip and no Custom the ideas prompt does not steer
// toward Indonesian food: no "used in Indonesia", no "common in Indonesia (warung, home cooking, minimarket) unless told
// otherwise"; "realistic, easy to get dishes or snacks" stays. 2) The Indonesian chip asks for Indonesian food only
// ("Preference: Indonesian food only."). 3) Local picks: no +0.2 Indonesian category boost without the chip; the
// favourite and recent boosts stay. 4) Cheap stays "cheap, under Rp 25.000"; the rest of the prompt unchanged.
// Unit part (tsc of src/lib/ideas.ts) plus a browser part: the real request bodies (mocked Gemini, WebKit 390x844),
// data compatible (v3 shape, :v1 :v2 :ai :foods byte-identical, :ideas only counts).
// Usage: npm run build && npx vite preview --port 4174 & node tests/v1212.mjs
import { execSync } from 'node:child_process'
import { readdirSync, readFileSync, writeFileSync, rmSync, statSync } from 'node:fs'
import assert from 'node:assert/strict'
import { webkit, devices } from 'playwright'
import { geminiOk } from './v15-fixture.mjs'

const results = [], errors = []
const step = async (name, fn) => {
  try { await fn(); results.push(`PASS ${name}`) } catch (e) { results.push(`FAIL ${name}: ${e.message.slice(0, 900)}`); console.log(results.join('\n')); console.log(errors.join('\n')); throw e }
}
const out = 'node_modules/.tmp/v1212'
rmSync(out, { recursive: true, force: true })
execSync(`npx tsc --ignoreConfig --outDir ${out} --rootDir src src/lib/ideas.ts --module esnext --target es2022 --skipLibCheck --lib es2022,dom`)
const walk = (d) => readdirSync(d).flatMap((f) => (statSync(`${d}/${f}`).isDirectory() ? walk(`${d}/${f}`) : [`${d}/${f}`]))
for (const f of walk(out).filter((f) => f.endsWith('.js'))) writeFileSync(f.replace(/\.js$/, '.mjs'), readFileSync(f, 'utf8').replace(/from '(\.\.?\/[^']+)'/g, "from '$1.mjs'"))
const ideas = await import(new URL(`../${out}/lib/ideas.mjs`, import.meta.url))

const ask = { meal: 'dinner', time: '18:30', cap: 598, over: false, kcalLeft: 598, proteinToGo: 68, eatenToday: ['Kopi susu'], prefs: [], avoid: [] }
await step('1) default prompt (no chip, no Custom): no Indonesia mention; "realistic, easy to get dishes or snacks" kept', async () => {
  const sys = ideas.ideasSystem(), user = ideas.ideasUser(ask)
  assert.doesNotMatch(sys, /Indonesia/i); assert.doesNotMatch(user, /Indonesia/i)
  assert.doesNotMatch(sys, /warung|minimarket|home cooking|unless told otherwise/i)
  assert.ok(sys.includes('You suggest what to eat next for a calorie counting app.'))
  assert.ok(sys.includes('Give 4 different, realistic, easy to get dishes or snacks.'))
  assert.doesNotMatch(user, /Preference:/)
})
await step('2) Indonesian chip: "Preference: Indonesian food only."', async () => {
  assert.ok(ideas.ideasUser({ ...ask, prefs: ['Indonesian'] }).includes('Preference: Indonesian food only.'))
  assert.ok(ideas.ideasUser({ ...ask, prefs: ['Indonesian', 'Quick'] }).includes('Preference: Indonesian food only; quick, under 15 minutes or ready to buy.'))
})
await step('4) Cheap unchanged: "cheap, under Rp 25.000"', async () => {
  assert.ok(ideas.ideasUser({ ...ask, prefs: ['Cheap'] }).includes('Preference: cheap, under Rp 25.000.'))
  assert.doesNotMatch(ideas.ideasUser({ ...ask, prefs: ['Cheap'] }), /Indonesia/i)
})
await step('3) local picks: no Indonesian boost without the chip; favourite and recent boosts kept', async () => {
  const c = (id, name, kcal, protein, category, extra = {}) => ({ id, name, kcal, protein, category, serving: '1', fav: false, recent: -1, mine: false, ...extra })
  // Two foods that score the same; only the category differs. Indonesian listed second so a boost would flip them.
  const pair = [c('x', 'Oat bowl', 300, 15, 'Breakfast'), c('i', 'Tempe bacem', 300, 15, 'Indonesian')]
  const opts = { cap: 600, proteinHit: false, eatenIds: new Set(), eatenNames: new Set(), n: 1 }
  assert.equal(ideas.localPicks(pair, opts)[0].id, 'x', 'no chip: the Indonesian food is not boosted past an equal one')
  assert.equal(ideas.localPicks(pair, { ...opts, indonesian: false })[0].id, 'x')
  assert.equal(ideas.localPicks(pair, { ...opts, indonesian: true })[0].id, 'i', 'with the chip the old +0.2 applies')
  assert.equal(ideas.localPicks(pair.map((p) => ({ ...p, fav: p.id === 'i' })), opts)[0].id, 'i', 'favourite boost kept')
  assert.equal(ideas.localPicks(pair.map((p) => ({ ...p, recent: p.id === 'i' ? 0 : -1 })), opts)[0].id, 'i', 'recent boost kept')
  // Input order does not matter: still no category boost.
  assert.equal(ideas.localPicks([...pair].reverse(), opts)[0].id, 'x')
  assert.equal(ideas.localPicks([...pair].reverse(), { ...opts, indonesian: true })[0].id, 'i')
})

// Browser: the request bodies the app really sends.
const BASE = (process.env.BASE_URL ?? 'http://localhost:4174/calorie-app').replace(/\/$/, '')
const pad = (n) => String(n).padStart(2, '0')
const key = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const ago = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return key(d) }
const TODAY = ago(0)
const at = (hm) => new Date(`${TODAY}T${hm}:00+07:00`)
const T = at('07:00').getTime()
const profile = { age: 32, sex: 'male', heightCm: 175, weightKg: 92, activity: 'light', goal: 'lose', bmr: 1859, bmrCustom: false, includeMovement: false, goalWeightKg: 85, goalDate: ago(-120), planFrom: { date: ago(3), kg: 92 }, goalAssumed: false, macros: { protein: null, carbs: null, fat: null }, target: 1800, dailyGoal: 500 }
const q = (id, name, kcal, protein, meal = 'breakfast') => ({ id, date: TODAY, meal, foodId: null, name, servingLabel: 'Quick add', servingMult: 1, qty: 1, kcal, protein, carbs: 20, fat: 5, createdAt: T + id.length })
const V3 = JSON.stringify({ version: 3, profile, entries: [q('q1', 'Kopi susu', 140, 10)], exercises: [], closedDays: {}, favourites: [], weights: [{ date: ago(3), kg: 92 }] })
const FIXED = {
  'calorie-app:v2': '{"version":2,"profile":null,"entries":[],"exercises":[],"closedDays":{},"favourites":[]}',
  'calorie-app:v1': '{"version":1,"entries":[]}',
  'calorie-app:ai': JSON.stringify({ provider: 'gemini', key: 'AIzaTEST-not-a-real-key-000000000000' }),
  'calorie-app:foods': JSON.stringify({ version: 1, foods: [{ id: 'u_bubur', name: 'Bubur ayam', kcal: 320, protein: 12, carbs: 45, fat: 8, createdAt: 1, updatedAt: 1 }] }),
  'calorie-app:ideas': JSON.stringify({ date: TODAY, count: 1 }),
}
const idea = (name, kcal, protein) => ({ name, why: 'Fits your goal', portion: '1 plate', grams: 250, kcal, protein_g: protein, carbs_g: 30, fat_g: 10 })
const REPLY = { ideas: [idea('Eggs on toast', 360, 22), idea('Greek yogurt bowl', 280, 20), idea('Chicken wrap', 420, 30), idea('Tuna salad', 300, 26)] }
const PREF = { ideas: [idea('Soto ayam', 350, 24), idea('Pecel', 320, 12), idea('Gado-gado', 400, 15), idea('Ikan bakar', 330, 30)] }
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET, POST, OPTIONS' }
const browser = await webkit.launch()
const ctx = await browser.newContext({ ...devices['iPhone 14'], viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, serviceWorkers: 'block', timezoneId: 'Asia/Jakarta' })
const bodies = []
let reply = REPLY
await ctx.route('https://generativelanguage.googleapis.com/**', async (route) => {
  if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS })
  bodies.push(route.request().postData() ?? '')
  return route.fulfill({ status: 200, contentType: 'application/json', headers: CORS, body: JSON.stringify(geminiOk(reply)) }).catch(() => {})
})
await ctx.addInitScript(([v3, fixed]) => {
  if (localStorage.getItem('calorie-app:v3')) return
  localStorage.setItem('calorie-app:v3', v3)
  for (const [k, v] of Object.entries(fixed)) localStorage.setItem(k, v)
  localStorage.setItem('calorie-app:backup', JSON.stringify({ lastExportAt: Date.now(), dismissedAt: null }))
}, [V3, FIXED])
const page = await ctx.newPage()
await page.clock.setFixedTime(at('08:00'))
page.on('console', (m) => { if ((m.type() === 'error' || m.type() === 'warning') && !/service worker/i.test(m.text())) errors.push(`${m.type()}: ${m.text()}`) })
page.on('pageerror', (er) => errors.push(`pageerror: ${er.message}`))
const dialog = page.getByTestId('sheet')
const tapLoc = async (loc) => { await loc.scrollIntoViewIfNeeded(); const b = await loc.boundingBox(); await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2) }
await page.goto(BASE + '/'); await page.getByTestId('balance').waitFor(); await page.waitForTimeout(1300)

await step('browser 1) the first ask (no chip, no Custom) has no Indonesia mention in its request', async () => {
  await tapLoc(page.getByTestId('ideas-link')); await dialog.waitFor(); await dialog.getByText('Eggs on toast').waitFor()
  assert.equal(bodies.length, 1)
  const b = bodies[0]
  assert.doesNotMatch(b, /Indonesia|warung|minimarket/i)
  assert.match(b, /realistic, easy to get dishes or snacks/)
  assert.match(b, /calorie counting app\./)
  assert.doesNotMatch(b, /Preference:/, 'no preference line')
})
await step('browser 2) chip "Indonesian" asks for Indonesian food only', async () => {
  reply = PREF
  await tapLoc(dialog.getByRole('button', { name: 'Indonesian' }))
  await dialog.getByText('Soto ayam').waitFor()
  assert.match(bodies.at(-1), /Preference: Indonesian food only\./)
  assert.doesNotMatch(bodies.at(-1), /used in Indonesia|common in Indonesia/)
})
await step('browser 4) chip "Cheap" alone keeps "cheap, under Rp 25.000" and no Indonesia', async () => {
  reply = REPLY
  await tapLoc(dialog.getByRole('button', { name: 'Indonesian' }))
  await dialog.getByText('Eggs on toast').waitFor()
  const n = bodies.length
  await tapLoc(dialog.getByRole('button', { name: 'Cheap' }))
  for (let i = 0; i < 50 && bodies.length === n; i++) await page.waitForTimeout(100)
  await dialog.getByText('Eggs on toast').waitFor()
  assert.equal(bodies.length, n + 1)
  const b = bodies.at(-1)
  assert.match(b, /Preference: cheap, under Rp 25\.000\./)
  assert.doesNotMatch(b, /Indonesia/i)
})
await step('data: v3 shape, :v1 :v2 :ai :foods byte-identical, :ideas only counts; no console errors', async () => {
  const r = await page.evaluate(() => Object.fromEntries(['v1', 'v2', 'ai', 'foods', 'ideas'].map((k) => [k, localStorage.getItem(`calorie-app:${k}`)])))
  for (const k of ['v1', 'v2', 'ai', 'foods']) assert.equal(r[k], FIXED[`calorie-app:${k}`], k)
  assert.deepEqual(Object.keys(JSON.parse(r.ideas)).sort(), ['count', 'date'])
  const s = await page.evaluate(() => JSON.parse(localStorage.getItem('calorie-app:v3')))
  assert.equal(s.version, 3)
  assert.deepEqual(Object.keys(s).sort(), Object.keys(JSON.parse(V3)).sort())
  assert.deepEqual(errors, [])
})
await ctx.close()
await browser.close()
console.log(results.join('\n'))
if (errors.length) { console.log(errors.join('\n')); process.exit(1) }
