// v1.17.1 Quick Log Menu copy (Jordy: "if no key show "Need AI key""). With no AI key the three AI pills
// (Take photo, Upload, Describe it) say exactly "Need AI key" (sub-label and aria-label) and open the AI setup sheet,
// online or offline (no key wins over offline). Offline with a key they still say "Needs internet" and do nothing. Manual never gets a sub-label. Pills fit on one line at 375 and inside the screen.
// Schema stays v3; :v2 :v1 :ai :foods byte-identical. WebKit at 390x844 and 375x667.
// Screenshots: screenshots/v1171-menu-nokey-*.png (and v1171-menu-nokey-offline-*.png).
// Usage: npm run build && npx vite preview --port 4174 & node tests/v1171.mjs
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
const ago = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return key(d) }
const TODAY = ago(0)
const profile = { age: 32, sex: 'male', heightCm: 175, weightKg: 92, activity: 'light', goal: 'lose', bmr: 1859, bmrCustom: false, includeMovement: false, goalWeightKg: 85, goalDate: ago(-120), planFrom: { date: ago(3), kg: 92 }, goalAssumed: false, macros: { protein: null, carbs: null, fat: null }, target: 1800, dailyGoal: 500 }
const entries = [{ id: 'q1', date: TODAY, meal: 'breakfast', foodId: null, name: 'Kopi susu', servingLabel: 'Quick add', servingMult: 1, qty: 1, kcal: 140, protein: 10, carbs: 20, fat: 5, createdAt: Date.now() - 3600_000 }]
const V3 = JSON.stringify({ version: 3, profile, entries, exercises: [], closedDays: {}, favourites: [], weights: [{ date: ago(3), kg: 92 }] })
const AI = JSON.stringify({ provider: 'gemini', key: 'AIzaTEST-not-a-real-key-000000000000' })
const FIXED = {
  'calorie-app:v2': '{"version":2,"profile":null,"entries":[],"exercises":[],"closedDays":{},"favourites":[]}',
  'calorie-app:v1': '{"version":1,"entries":[]}',
  'calorie-app:foods': JSON.stringify({ version: 1, foods: [{ id: 'u_bubur', name: 'Bubur ayam', kcal: 320, protein: 12, carbs: 45, fat: 8, createdAt: 1, updatedAt: 1 }] }),
}
const AI_IDS = ['plus-photo', 'plus-upload', 'plus-describe']
const LABELS = { 'plus-photo': 'Take photo', 'plus-upload': 'Upload', 'plus-describe': 'Describe it' }

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
  const dialog = page.getByRole('dialog')
  const box = (loc) => loc.evaluate((e) => { const r = e.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height } })
  const tapLoc = async (loc) => { const b = await box(loc); await page.touchscreen.tap(b.l + b.w / 2, b.t + b.h / 2) }
  const openMenu = async () => { await tapLoc(page.getByTestId('plus')); await page.getByTestId('plus-menu').waitFor(); await page.waitForTimeout(260) }
  const closeMenu = async () => { await page.keyboard.press('Escape'); await page.getByTestId('plus-overlay').waitFor({ state: 'detached' }) }
  const home = async () => { await page.goto(BASE + '/'); await page.getByTestId('balance').waitFor(); await page.waitForTimeout(300) }
  const fits = async () => {
    const vw = await page.evaluate(() => window.innerWidth)
    for (const id of [...AI_IDS, 'plus-manual']) {
      const p = page.getByTestId(id), b = await box(p)
      assert.ok(b.l >= 0 && b.r <= vw && b.t >= 0, `${id} on screen ${JSON.stringify(b)}`)
      assert.ok(b.h >= 44, `${id} ${b.h}px tall`)
      const clip = await p.evaluate((e) => [...e.querySelectorAll('*')].concat(e).some((n) => n.scrollWidth > n.clientWidth + 0.5 && getComputedStyle(n).overflow !== 'visible'))
      assert.equal(clip, false, `${id} text clipped`)
      const lines = await p.evaluate((e) => [...e.querySelectorAll('span,div')].filter((n) => n.childElementCount === 0 && n.textContent.trim()).map((n) => { const r = n.getBoundingClientRect(); return Math.round(r.height / parseFloat(getComputedStyle(n).lineHeight || '20')) }))
      for (const l of lines) assert.ok(l <= 1, `${id} wraps (${lines})`)
    }
  }

  await step(`${tag} no AI key: Take photo, Upload, Describe it show exactly "Need AI key" (sub-label and aria-label); Manual has none; fits`, async () => {
    await home(); await openMenu()
    for (const id of AI_IDS) {
      const p = page.getByTestId(id)
      assert.equal(await p.getByTestId('plus-sub').innerText(), 'Need AI key')
      assert.equal(await p.getAttribute('aria-label'), `${LABELS[id]}. Need AI key`)
      assert.equal(await p.evaluate((e) => e.hasAttribute('data-muted')), true)
    }
    assert.equal(await page.getByTestId('plus-manual').getByTestId('plus-sub').count(), 0)
    assert.equal(await page.getByText(/Needs AI key/).count(), 0, 'old copy gone')
    await fits()
    await page.waitForTimeout(100)
    await page.screenshot({ path: `${OUT}v1171-menu-nokey-${tag}.png` })
    await closeMenu()
  })

  await step(`${tag} offline with no key: no key wins, the AI pills say "Need AI key" (not disabled) and each opens the AI setup sheet; fits`, async () => {
    await home()
    await ctx.setOffline(true); await page.waitForTimeout(200)
    await openMenu()
    for (const id of AI_IDS) {
      const p = page.getByTestId(id)
      assert.equal(await p.getByTestId('plus-sub').innerText(), 'Need AI key')
      assert.equal(await p.getAttribute('aria-label'), `${LABELS[id]}. Need AI key`)
      assert.equal(await p.getAttribute('aria-disabled'), null)
    }
    assert.equal(await page.getByText('Needs internet').count(), 0)
    await fits()
    await page.screenshot({ path: `${OUT}v1171-menu-nokey-offline-${tag}.png` })
    for (const id of AI_IDS) {
      if (!(await page.getByTestId('plus-overlay').count())) await openMenu()
      await tapLoc(page.getByTestId(id))
      await dialog.getByRole('heading', { name: 'AI estimate' }).waitFor()
      assert.equal(await dialog.getAttribute('aria-label'), 'Set up AI estimates')
      await page.getByTestId('plus-overlay').waitFor({ state: 'detached', timeout: 2000 })
      await page.keyboard.press('Escape'); await dialog.waitFor({ state: 'detached' })
    }
    await ctx.setOffline(false); await page.waitForTimeout(200)
  })

  await step(`${tag} offline with a key: the AI pills still say "Needs internet", are disabled and do nothing; fits`, async () => {
    await page.evaluate((ai) => localStorage.setItem('calorie-app:ai', ai), AI)
    await home()
    await ctx.setOffline(true); await page.waitForTimeout(200)
    await openMenu()
    for (const id of AI_IDS) {
      const p = page.getByTestId(id)
      assert.equal(await p.getByTestId('plus-sub').innerText(), 'Needs internet')
      assert.equal(await p.getAttribute('aria-label'), `${LABELS[id]}. Needs internet`)
      assert.equal(await p.getAttribute('aria-disabled'), 'true')
    }
    await fits()
    for (const id of AI_IDS) {
      await tapLoc(page.getByTestId(id)); await page.waitForTimeout(300)
      assert.equal(await page.getByTestId('plus-overlay').getAttribute('data-phase'), 'in', `${id}: menu stays open`)
      assert.equal(await dialog.count(), 0)
    }
    await closeMenu()
    await ctx.setOffline(false); await page.waitForTimeout(200)
  })

  await step(`${tag} with a key online: no sub-labels at all`, async () => {
    await home(); await openMenu()
    assert.equal(await page.getByTestId('plus-sub').count(), 0)
    await closeMenu()
  })

  await step(`${tag} storage stays v3; :v2 :v1 :ai :foods byte-identical, no new keys`, async () => {
    const s = await page.evaluate(() => Object.fromEntries(Object.keys(localStorage).map((k) => [k, localStorage.getItem(k)])))
    assert.deepEqual(Object.keys(s).sort(), ['calorie-app:ai', 'calorie-app:backup', 'calorie-app:foods', 'calorie-app:v1', 'calorie-app:v2', 'calorie-app:v3'])
    for (const [k, v] of Object.entries(FIXED)) assert.equal(s[k], v, k)
    assert.equal(s['calorie-app:ai'], AI)
    const v3 = JSON.parse(s['calorie-app:v3'])
    assert.equal(v3.version, 3)
    assert.deepEqual(Object.keys(v3).sort(), Object.keys(JSON.parse(V3)).sort())
    assert.deepEqual(v3.entries, JSON.parse(V3).entries)
  })
  await ctx.close()
}
await browser.close()
console.log(results.join('\n'))
if (errors.length) { console.log(errors.join('\n')); process.exit(1) }
console.log(`\n${results.length} passed`)
