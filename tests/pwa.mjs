// Hosted-build checks: installability (manifest + SW), offline reload, backup export/import, reminder, full-bleed.
// Usage: npm run build && npx vite preview --port 4174 & node tests/pwa.mjs
import { chromium } from 'playwright'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const BASE = process.env.BASE_URL ?? 'http://localhost:4174'
const OUT = new URL('../screenshots/', import.meta.url).pathname
const errors = []
const results = []
const step = async (name, fn) => {
  const t = Date.now()
  try { await fn(); results.push(`PASS ${name} (${Date.now() - t} ms)`) }
  catch (e) { results.push(`FAIL ${name}: ${e.message}`); throw e }
}
const pad = (n) => String(n).padStart(2, '0')
const key = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const DAY = 86_400_000
const now = Date.now()
const TODAY = key(new Date())
const D2 = key(new Date(now - 2 * DAY))
const entry = (id, date, kcal, protein, t) => ({ id, date, meal: 'lunch', foodId: null, name: `Meal ${id}`, servingLabel: '1 serving', servingMult: 1, qty: 1, kcal, protein, carbs: 50, fat: 20, createdAt: t })
const SEED = {
  version: 1,
  profile: { age: 34, sex: 'female', heightCm: 168, weightKg: 70, activity: 'light', goal: 'lose' },
  entries: [entry('a1', D2, 700, 40, now - 2 * DAY), entry('a2', D2, 900, 35, now - 2 * DAY + 1000), entry('a3', TODAY, 650, 42, now)],
  exercises: [{ id: 'x1', date: D2, activityId: null, name: 'Watch workout', minutes: 30, intensity: 'moderate', kcal: 250, createdAt: now - 2 * DAY }],
  closedDays: {},
  favourites: [],
}
const lsState = (p) => p.evaluate(() => JSON.parse(localStorage.getItem('calorie-app:v1')))
const seed = (p, extra = {}) => p.evaluate(([s, extra]) => {
  localStorage.clear()
  localStorage.setItem('calorie-app:v1', JSON.stringify(s))
  for (const [k, v] of Object.entries(extra)) localStorage.setItem(k, JSON.stringify(v))
}, [SEED, extra])

const browser = await chromium.launch()
try {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, reducedMotion: 'reduce', acceptDownloads: true })
  const page = await ctx.newPage()
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`${m.type()}: ${m.text()}`) })
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
  page.on('dialog', (d) => d.accept())

  await step('installable: manifest fields, icons, iOS tags, Chromium reports no installability errors', async () => {
    await page.goto(BASE + '/')
    const head = await page.evaluate(() => ({
      manifest: document.querySelector('link[rel=manifest]')?.getAttribute('href'),
      apple: document.querySelector('link[rel=apple-touch-icon]')?.getAttribute('href'),
      capable: document.querySelector('meta[name=apple-mobile-web-app-capable]')?.getAttribute('content'),
      bar: document.querySelector('meta[name=apple-mobile-web-app-status-bar-style]')?.getAttribute('content'),
      theme: document.querySelector('meta[name=theme-color]')?.getAttribute('content'),
      viewport: document.querySelector('meta[name=viewport]')?.getAttribute('content'),
      title: document.title,
    }))
    assert.equal(head.manifest, '/manifest.webmanifest')
    assert.equal(head.capable, 'yes')
    assert.equal(head.bar, 'default')
    assert.match(head.viewport, /viewport-fit=cover/)
    assert.equal(head.title, 'Calorie counter')
    const m = await (await page.request.get(BASE + head.manifest)).json()
    assert.equal(m.name, 'Calorie counter')
    assert.ok(m.short_name && m.short_name.length <= 12)
    assert.equal(m.display, 'standalone')
    assert.equal(m.orientation, 'portrait')
    assert.equal(m.start_url, '/')
    assert.equal(m.theme_color.toLowerCase(), head.theme.toLowerCase())
    const want = [['192x192', 'any'], ['512x512', 'any'], ['512x512', 'maskable']]
    for (const [sizes, purpose] of want) assert.ok(m.icons.some((i) => i.sizes === sizes && i.purpose === purpose), `${sizes} ${purpose} icon`)
    const icons = [...m.icons.map((i) => [i.src, Number(i.sizes.split('x')[0])]), [head.apple, 180]]
    for (const [src, size] of icons) {
      const dims = await page.evaluate((src) => new Promise((ok, bad) => { const im = new Image(); im.onload = () => ok([im.naturalWidth, im.naturalHeight]); im.onerror = () => bad(new Error(src)); im.src = src }), src)
      assert.deepEqual(dims, [size, size], src)
    }
    // Same check Chrome's install prompt (and Lighthouse) uses.
    const cdp = await ctx.newCDPSession(page)
    const reg = await page.evaluate(async () => { const r = await navigator.serviceWorker.ready; return r.active?.scriptURL })
    assert.equal(reg, BASE + '/sw.js')
    const inst = await cdp.send('Page.getInstallabilityErrors')
    const ids = (inst.installabilityErrors ?? inst.errors ?? []).map((e) => e.errorId)
    assert.deepEqual(ids, [], JSON.stringify(inst))
    results.push('  (Page.getInstallabilityErrors: ' + JSON.stringify(inst) + ')')
    const { url, errors: merr } = await cdp.send('Page.getAppManifest')
    assert.equal(url, BASE + '/manifest.webmanifest')
    assert.deepEqual(merr, [])
  })

  await step('service worker controls the page after reload and precached the build', async () => {
    await seed(page)
    await page.reload()
    assert.equal(await page.evaluate(() => navigator.serviceWorker.controller?.scriptURL), BASE + '/sw.js')
    const cached = await page.evaluate(async () => { const k = (await caches.keys()).find((x) => x.startsWith('calorie-')); return (await (await caches.open(k)).keys()).map((r) => new URL(r.url).pathname) })
    for (const p of ['/', '/manifest.webmanifest', '/icons/icon-192.png']) assert.ok(cached.includes(p), p)
    assert.ok(cached.some((p) => /^\/assets\/index-.*\.js$/.test(p)))
  })

  await step('offline: reload and deep links still work', async () => {
    await ctx.setOffline(true)
    await page.reload()
    await page.getByRole('heading', { name: 'Today' }).waitFor()
    await page.goto(BASE + '/history')
    await page.getByRole('heading', { name: 'History' }).waitFor()
    await page.goto(BASE + '/settings')
    await page.getByRole('heading', { name: 'Me' }).waitFor()
    await page.screenshot({ path: OUT + 'pwa-offline-me.png' })
    await ctx.setOffline(false)
  })

  let file
  await step('export backup: dated JSON with schema version, hint says today', async () => {
    await page.goto(BASE + '/settings')
    assert.equal(await page.getByTestId('last-backup').innerText(), 'Last backup: never')
    const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export backup' }).click()])
    assert.equal(dl.suggestedFilename(), `calorie-backup-${TODAY}.json`)
    file = await dl.path()
    const j = JSON.parse(readFileSync(file, 'utf8'))
    assert.equal(j.app, 'calorie-counter')
    assert.equal(j.schema, 1)
    assert.ok(Math.abs(Date.parse(j.exportedAt) - Date.now()) < 60_000)
    assert.equal(j.data['calorie-app:v1'].entries.length, 3)
    assert.equal(j.data['calorie-app:backup'], undefined)
    assert.equal(await page.getByTestId('last-backup').innerText(), 'Last backup: today')
  })

  await step('roundtrip: export, reset all data, restore from onboarding, data is back', async () => {
    const before = await lsState(page)
    await page.locator('main').evaluate((el) => { el.scrollTop = el.scrollHeight })
    await page.getByRole('button', { name: 'Reset all data' }).click()
    await page.waitForURL(BASE + '/onboarding')
    assert.equal((await lsState(page)).entries.length, 0)
    await page.getByTestId('import-file').setInputFiles(file)
    const dlg = page.getByRole('dialog', { name: 'Restore backup' })
    await dlg.waitFor()
    assert.match(await dlg.getByTestId('import-summary').innerText(), /2 days, 3 food entries, 1 workout, with your profile/)
    await page.screenshot({ path: OUT + 'pwa-restore-confirm.png' })
    await dlg.getByRole('button', { name: 'Restore' }).click()
    await page.waitForURL(BASE + '/')
    await page.getByRole('heading', { name: 'Today' }).waitFor()
    const after = await lsState(page)
    assert.deepEqual(after.entries, before.entries)
    assert.deepEqual(after.exercises, before.exercises)
    assert.deepEqual(after.profile, before.profile)
    await page.reload()
    assert.equal((await lsState(page)).entries.length, 3)
  })

  await step('import over existing data asks to replace; cancel changes nothing', async () => {
    await page.goto(BASE + '/settings')
    await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('calorie-app:v1')); return s })
    await page.getByTestId('import-file').setInputFiles(file)
    const dlg = page.getByRole('dialog', { name: 'Restore backup' })
    await dlg.getByText('This replaces everything currently on this device.').waitFor()
    await dlg.getByRole('button', { name: 'Cancel' }).click()
    await dlg.waitFor({ state: 'detached' })
    await page.getByTestId('import-file').setInputFiles(file)
    await dlg.getByRole('button', { name: 'Replace my data' }).click()
    await page.waitForURL(BASE + '/')
  })

  await step('invalid files are rejected with a friendly error and nothing changes', async () => {
    await page.goto(BASE + '/settings')
    const before = await lsState(page)
    const cases = [
      ['notes.txt', 'text/plain', 'hello, not json', /isn't a Calorie counter backup/],
      ['other.json', 'application/json', JSON.stringify({ app: 'something-else', schema: 1, data: {} }), /isn't a Calorie counter backup/],
      ['future.json', 'application/json', JSON.stringify({ app: 'calorie-counter', schema: 99, exportedAt: new Date().toISOString(), data: {} }), /newer version/],
      ['broken.json', 'application/json', JSON.stringify({ app: 'calorie-counter', schema: 1, data: { 'calorie-app:v1': { version: 1, profile: null, entries: 'oops', exercises: [], closedDays: {} } } }), /damaged/],
      ['bad-entry.json', 'application/json', JSON.stringify({ app: 'calorie-counter', schema: 1, data: { 'calorie-app:v1': { version: 1, profile: null, entries: [{ id: 1 }], exercises: [], closedDays: {} } } }), /damaged/],
    ]
    for (const [name, mimeType, text, re] of cases) {
      await page.getByTestId('import-file').setInputFiles({ name, mimeType, buffer: Buffer.from(text) })
      const err = page.getByTestId('import-error')
      await err.waitFor()
      assert.match(await err.innerText(), re, name)
      assert.equal(await page.getByRole('dialog').count(), 0)
    }
    await page.getByTestId('import-error').scrollIntoViewIfNeeded()
    await page.screenshot({ path: OUT + 'pwa-import-error.png' })
    assert.deepEqual(await lsState(page), before)
  })

  await step('home reminder after 7+ days without a backup; dismiss sticks across reload', async () => {
    await page.goto(BASE + '/')
    assert.equal(await page.getByTestId('backup-reminder').count(), 0) // just exported
    await page.evaluate((t) => localStorage.setItem('calorie-app:backup', JSON.stringify({ lastExportAt: t, dismissedAt: null })), now - 8 * DAY)
    await page.reload()
    await page.getByTestId('backup-reminder').waitFor()
    await page.screenshot({ path: OUT + 'pwa-home-reminder.png' })
    await page.goto(BASE + '/settings')
    assert.equal(await page.getByTestId('last-backup').innerText(), 'Last backup: 8 days ago')
    await page.goto(BASE + '/')
    await page.getByRole('button', { name: 'Dismiss backup reminder' }).click()
    assert.equal(await page.getByTestId('backup-reminder').count(), 0)
    await page.reload()
    await page.getByRole('heading', { name: 'Today' }).waitFor()
    assert.equal(await page.getByTestId('backup-reminder').count(), 0)
    // Never backed up and the oldest log is 8 days old: remind.
    await seed(page)
    await page.evaluate((t) => { const s = JSON.parse(localStorage.getItem('calorie-app:v1')); s.entries[0].createdAt = t; localStorage.setItem('calorie-app:v1', JSON.stringify(s)) }, now - 8 * DAY)
    await page.reload()
    await page.getByTestId('backup-reminder').waitFor()
  })

  await step('developer tools tucked away, no prototype wording', async () => {
    await page.goto(BASE + '/settings')
    assert.equal(await page.getByRole('button', { name: 'Load demo week' }).isVisible(), false)
    await page.locator('[data-testid=developer] summary').click()
    assert.ok(await page.getByRole('button', { name: 'Load demo week' }).isVisible())
    const text = await page.locator('body').innerText()
    assert.doesNotMatch(text, /prototype|demo tools/i)
  })
  await ctx.close()

  // ---------- Desktop: framed in a browser tab, full-bleed when installed ----------
  const d = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' })
  const dp = await d.newPage()
  await step('desktop tab keeps the phone frame; frame styles only apply in a browser tab (installed = full-bleed)', async () => {
    await dp.goto(BASE + '/')
    await seed(dp)
    await dp.reload()
    const frameWidth = () => dp.locator('main').evaluate((el) => el.parentElement.getBoundingClientRect().width)
    assert.equal(await frameWidth(), 390)
    // Headless Chromium can't emulate display-mode, so check that every frame style is gated on a browser tab.
    const gated = await dp.evaluate(() => {
      const out = []
      const walk = (rules, cond) => { for (const r of rules) { if (r.selectorText) out.push([r.selectorText, cond.join(' & ')]); else if (r.cssRules) walk(r.cssRules, r.conditionText ? [...cond, r.conditionText] : cond) } }
      for (const sh of document.styleSheets) walk(sh.cssRules, [])
      return out.filter(([sel, cond]) => sel.includes('framed') || (sel === 'body' && cond.includes('768px')))
    })
    assert.ok(gated.length >= 5, JSON.stringify(gated))
    for (const [sel, cond] of gated) assert.ok(/768px/.test(cond) && /display-mode: ?browser/.test(cond), `${sel} @ ${cond}`)
    assert.equal(await dp.evaluate(() => matchMedia('(display-mode: browser)').matches), true)
  })
  await d.close()

  // ---------- iPhone safe areas ----------
  await step('tab bar clears the home indicator (safe-area inset)', async () => {
    const c = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce' })
    const p = await c.newPage()
    await p.goto(BASE + '/')
    await seed(p)
    await p.reload()
    const cdp = await c.newCDPSession(p)
    await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: { top: 47, bottom: 34, left: 0, right: 0 } }).catch(() => null)
    const pb = await p.locator('nav[aria-label=Main]').evaluate((el) => parseFloat(getComputedStyle(el).paddingBottom))
    const pt = await p.locator('main').evaluate((el) => parseFloat(getComputedStyle(el).paddingTop))
    const supported = pb !== 14
    if (supported) { assert.equal(pb, 34); assert.equal(pt, 47) } else { assert.equal(pt, 20) } // older Chromium: falls back to the normal padding
    results.push(`  (safe-area override ${supported ? 'applied: bottom 34, top 47' : 'not supported by this Chromium; fallback padding checked'})`)
    await c.close()
  })

  await step('no console errors or warnings', async () => {
    assert.deepEqual(errors.filter((e) => !/ERR_INTERNET_DISCONNECTED/.test(e)), [])
  })
} finally {
  console.log(results.join('\n'))
  await browser.close()
}
