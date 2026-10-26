// v1.5 AI photo estimate, end to end with mocked Gemini and OpenAI (no real key, no network).
// Usage: npm run build && npx vite preview --port 4174 & node tests/v15-photo.mjs
import { chromium } from 'playwright'
import assert from 'node:assert/strict'
import { STATE as V1_STATE } from './v11-fixture.mjs'
import { EST, PLATE, TODAY, geminiOk, jpegSize, makePlate, openaiOk } from './v15-fixture.mjs'

const BASE = (process.env.BASE_URL ?? 'http://localhost:4174/calorie-app').replace(/\/$/, '')
const results = [], errors = []
const step = async (name, fn) => {
  const t = Date.now()
  try { await fn(); results.push(`PASS ${name} (${Date.now() - t} ms)`) } catch (e) { results.push(`FAIL ${name}: ${e.message}`); throw e }
}
const GEMINI_KEY = 'AIzaTEST-not-a-real-key-000000000000'
const OPENAI_KEY = 'sk-test-not-a-real-key'
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET, POST, OPTIONS' }

const browser = await chromium.launch()
await makePlate(browser)
// What the mock providers should do next, and what they saw.
let mode = { gemini: 'ok', openai: 'ok' }
const seen = []
const json = (route, status, body, headers = CORS) => route.fulfill({ status, contentType: 'application/json', headers, body: typeof body === 'string' ? body : JSON.stringify(body) })
const mock = async (ctx) => {
  await ctx.route('https://generativelanguage.googleapis.com/**', async (route) => {
    const r = route.request()
    if (r.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS })
    seen.push({ p: 'gemini', url: r.url(), method: r.method(), headers: r.headers(), body: r.postData() })
    const m = mode.gemini
    if (r.method() === 'GET') return m === 'badkey' ? json(route, 400, { error: { code: 400, message: 'API key not valid. Please pass a valid API key.', status: 'INVALID_ARGUMENT', details: [{ reason: 'API_KEY_INVALID' }] } }) : json(route, 200, { name: 'models/x' })
    if (m === 'ok') return json(route, 200, geminiOk(EST))
    if (m === 'partial') return json(route, 200, geminiOk('```json\n' + JSON.stringify({ dish: 'Mystery plate', items: [EST.items[3], { name: 'Krupuk-ish cracker thing', grams: 20, kcal: 95, protein_g: '1' }] }) + '\n```'))
    if (m === 'badkey') return json(route, 400, { error: { code: 400, message: 'API key not valid. Please pass a valid API key.', status: 'INVALID_ARGUMENT', details: [{ reason: 'API_KEY_INVALID' }] } })
    if (m === 'busy') return json(route, 429, { error: { code: 429, message: 'Resource has been exhausted', status: 'RESOURCE_EXHAUSTED' } })
    if (m === 'nofood') return json(route, 200, geminiOk({ dish: '', items: [] }))
    if (m === 'garbage') return json(route, 200, geminiOk('Sorry, here is a lovely plate of food!'))
    if (m === 'drop') return route.abort('internetdisconnected')
    if (m === 'slow') { await new Promise((r) => setTimeout(r, 1500)); return json(route, 200, geminiOk(EST)).catch(() => {}) }
    return json(route, 500, {})
  })
  await ctx.route('https://api.openai.com/**', async (route) => {
    const r = route.request()
    if (r.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS })
    seen.push({ p: 'openai', url: r.url(), method: r.method(), headers: r.headers(), body: r.postData() })
    const m = mode.openai
    if (r.method() === 'GET') return m === 'badkey' ? json(route, 401, { error: { message: 'Incorrect API key provided', code: 'invalid_api_key' } }) : json(route, 200, { object: 'list', data: [] })
    // Real OpenAI: a 401 here has no CORS headers, so the browser only sees a network error (Playwright's fulfill
    // skips the CORS check, so abort to get the same TypeError the page gets in real life).
    if (m === 'badkey') return route.abort('failed')
    if (m === 'ok') return json(route, 200, openaiOk(EST))
    if (m === 'busy') return json(route, 429, { error: { message: 'Rate limit reached', type: 'requests' } })
    return json(route, 500, {})
  })
}

const setup = async (opts = {}) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, reducedMotion: 'reduce', serviceWorkers: 'block', ...opts })
  await ctx.addInitScript((s) => { if (!localStorage.getItem('calorie-app:v1') && !localStorage.getItem('calorie-app:v2')) localStorage.setItem('calorie-app:v1', JSON.stringify(s)) }, V1_STATE)
  await mock(ctx)
  const page = await ctx.newPage()
  page.on('console', (m) => {
    const t = m.text()
    // A blocked CORS answer (OpenAI wrong key) is logged by Chromium itself; that's the case under test.
    if ((m.type() === 'error' || m.type() === 'warning') && !/CORS policy|net::ERR_FAILED|status of 4\d\d|status of 5\d\d|ERR_INTERNET_DISCONNECTED|Service Worker registration blocked/.test(t)) errors.push(`${m.type()}: ${t}`)
    for (const k of [GEMINI_KEY, OPENAI_KEY]) if (t.includes(k)) errors.push('key appeared in console')
  })
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
  page.on('dialog', (d) => d.accept())
  return { ctx, page }
}
const saveKey = (page, provider, key) => page.evaluate(([p, k]) => localStorage.setItem('calorie-app:ai', JSON.stringify({ provider: p, key: k })), [provider, key])
const state = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('calorie-app:v2') ?? '{}'))
const dialog = (page) => page.getByRole('dialog')
const snap = async (page) => {
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: 'Estimate from a photo' }).click()])
  assert.equal(chooser.isMultiple(), false)
  await chooser.setFiles(PLATE)
  await dialog(page).getByRole('button', { name: /Estimate/ }).waitFor()
}
const errorKind = (page) => dialog(page).getByTestId('photo-error').getAttribute('data-kind')

try {
  const { ctx, page } = await setup()

  await step('old v1 data loads; camera sits left of Quick add on Log (Food only), input has no capture attribute', async () => {
    await page.goto(BASE + '/log')
    const cam = page.getByRole('button', { name: 'Estimate from a photo' })
    const qa = page.getByRole('button', { name: /Quick add calories/ })
    await cam.waitFor()
    const [cb, qb] = [await cam.boundingBox(), await qa.boundingBox()]
    assert.ok(cb.x + cb.width <= qb.x, 'camera is left of Quick add')
    assert.ok(Math.abs(cb.y + cb.height / 2 - (qb.y + qb.height / 2)) < 3, 'same row')
    assert.equal(Math.round(cb.width), 56)
    const input = page.getByTestId('photo-input')
    assert.equal(await input.getAttribute('accept'), 'image/*')
    assert.equal(await input.getAttribute('capture'), null)
    await page.getByRole('button', { name: 'Exercise', exact: true }).click()
    await page.getByRole('button', { name: /Quick add burn/ }).waitFor()
    assert.equal(await cam.count(), 0, 'not in Exercise mode')
    await page.getByRole('button', { name: 'Food', exact: true }).click()
    await cam.waitFor()
    const s = await state(page)
    assert.ok(s.entries.some((e) => e.name === 'Chicken rice'), 'v1 data migrated')
  })

  await step('no key: camera opens the set-up sheet (no file picker), button goes to Me > AI with the key field focused', async () => {
    let chooser = false
    page.once('filechooser', () => { chooser = true })
    await page.getByRole('button', { name: 'Estimate from a photo' }).click()
    await dialog(page).getByRole('heading', { name: 'Estimate from a photo' }).waitFor()
    assert.match(await dialog(page).innerText(), /Gemini or OpenAI/)
    assert.equal(chooser, false)
    await dialog(page).getByRole('button', { name: 'Add a key in Me' }).click()
    await page.waitForURL('**/settings?ai=1')
    await page.waitForFunction(() => document.activeElement?.getAttribute('data-testid') === 'ai-key')
  })

  await step('Me > AI photo estimate: Gemini is the default, masked key, Show/Hide, Test key (bad then good), Save, key never in backup', async () => {
    const group = page.getByRole('group', { name: 'AI provider' })
    assert.deepEqual(await group.getByRole('button').allInnerTexts(), ['Gemini', 'OpenAI'])
    assert.equal(await group.getByRole('button', { name: 'Gemini' }).getAttribute('aria-pressed'), 'true')
    const key = page.getByTestId('ai-key')
    assert.equal(await key.getAttribute('type'), 'password')
    await key.fill(GEMINI_KEY)
    await page.getByRole('button', { name: 'Show' }).click()
    assert.equal(await key.getAttribute('type'), 'text')
    await page.getByRole('button', { name: 'Hide' }).click()
    assert.equal(await key.getAttribute('type'), 'password')
    mode.gemini = 'badkey'
    await page.getByRole('button', { name: 'Test key' }).click()
    await page.getByTestId('ai-status').filter({ hasText: 'Your key didn’t work' }).waitFor()
    mode.gemini = 'ok'
    seen.length = 0
    await page.getByRole('button', { name: 'Test key' }).click()
    await page.getByTestId('ai-status').filter({ hasText: 'Key works' }).waitFor()
    assert.equal(seen[0].method, 'GET')
    assert.match(seen[0].url, /\/v1beta\/models\/gemini-3\.5-flash-lite$/)
    assert.equal(seen[0].headers['x-goog-api-key'], GEMINI_KEY)
    assert.ok(!seen[0].url.includes(GEMINI_KEY), 'key not in URL')
    assert.equal(await page.evaluate(() => localStorage.getItem('calorie-app:ai')), null, 'Test key alone does not save')
    await page.getByRole('button', { name: 'Save', exact: true }).click()
    await page.getByTestId('ai-status').filter({ hasText: 'Saved' }).waitFor()
    assert.deepEqual(JSON.parse(await page.evaluate(() => localStorage.getItem('calorie-app:ai'))), { provider: 'gemini', key: GEMINI_KEY })
    assert.match(await page.locator('#ai').innerText(), /stays on this phone/)
    // Backup export: download the file and make sure the key isn't in it.
    const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export backup' }).click()])
    const txt = await (await import('node:fs')).promises.readFile(await dl.path(), 'utf8')
    assert.match(txt, /Chicken rice/)
    assert.ok(!txt.includes(GEMINI_KEY) && !txt.includes('calorie-app:ai'), 'key not in backup')
  })

  await step('success: photo sheet (Retake pill, note, chips toggle), downscaled JPEG sent with note and food list', async () => {
    await page.goto(BASE + '/log')
    await snap(page)
    const d = dialog(page)
    await d.getByRole('button', { name: 'Retake' }).waitFor()
    const note = d.getByRole('textbox')
    assert.equal(await note.getAttribute('placeholder'), "Anything the photo can't show? Half portion, fried, no rice")
    const chips = d.getByRole('group', { name: 'Quick notes' })
    assert.deepEqual(await chips.getByRole('button').allInnerTexts(), ['Shared', 'Half eaten', 'Extra sambal', 'Santan', 'No rice'])
    await chips.getByRole('button', { name: 'Extra sambal' }).click()
    await chips.getByRole('button', { name: 'Half eaten' }).click()
    assert.equal(await chips.getByRole('button', { name: 'Extra sambal' }).getAttribute('aria-pressed'), 'true')
    await chips.getByRole('button', { name: 'Half eaten' }).click()
    assert.equal(await chips.getByRole('button', { name: 'Half eaten' }).getAttribute('aria-pressed'), 'false')
    const nv = await note.inputValue()
    assert.match(nv, /Extra sambal/i)
    assert.doesNotMatch(nv, /Half eaten/i)
    seen.length = 0
    await d.getByRole('button', { name: /Estimate/ }).click()
    await d.getByText('Estimated from your photo').waitFor()
    const req = seen.find((s) => s.method === 'POST')
    assert.match(req.url, /gemini-3\.5-flash-lite:generateContent$/)
    const body = JSON.parse(req.body)
    const parts = body.contents[0].parts
    const img = parts.find((p) => p.inlineData).inlineData
    assert.equal(img.mimeType, 'image/jpeg')
    const size = jpegSize(Buffer.from(img.data, 'base64'))
    assert.deepEqual(size, { w: 1024, h: 614 }, 'downscaled to 1024 px')
    const all = JSON.stringify(body)
    assert.match(all, /Extra sambal/i)
    assert.match(all, /Nasi putih/)
    assert.match(all, /Indonesia/)
    assert.ok(body.generationConfig?.responseFormat || body.generationConfig, 'JSON output requested')
  })

  await step('results: dish, note echo, our per-gram values for matched items, AI numbers for the rest, live stepper, remove', async () => {
    const d = dialog(page)
    assert.equal(await d.getByTestId('photo-dish').innerText(), 'Nasi ayam goreng')
    assert.match(await d.getByTestId('photo-note').innerText(), /Your note: .*Extra sambal/i)
    const rows = d.getByRole('list', { name: 'Estimated items' }).getByRole('listitem')
    assert.equal(await rows.count(), 4)
    const row = (n) => rows.filter({ hasText: n })
    // Rice matched: our 205 kcal / 160 g, not the model's 999.
    assert.match(await row('Nasi putih').getByTestId('item-kcal').innerText(), /^192/)
    assert.equal(await row('Nasi putih').getAttribute('data-matched'), 'yes')
    assert.match(await row('Ayam goreng').getByTestId('item-kcal').innerText(), /^320/)
    assert.match(await row('Dragonfruit salsa').innerText(), /AI estimate/)
    assert.equal(await row('Dragonfruit salsa').getAttribute('data-matched'), 'no')
    assert.match(await d.getByTestId('photo-total').innerText(), /^602/)
    assert.match(await d.innerText(), /Estimates are rough\. Adjust before logging\./)
    await d.getByRole('button', { name: 'More Nasi putih (white rice)' }).click()
    assert.equal(await row('Nasi putih').getByTestId('item-grams').innerText(), '160 g')
    assert.match(await row('Nasi putih').getByTestId('item-kcal').innerText(), /^205/)
    assert.match(await d.getByTestId('photo-total').innerText(), /^615/)
    await d.getByRole('button', { name: 'Less Sambal' }).click()
    assert.equal(await row('Sambal').getByTestId('item-grams').innerText(), '10 g', 'small items step by 5 g')
    await d.getByRole('button', { name: 'Remove Sambal' }).click()
    assert.equal(await rows.count(), 3)
    await d.getByRole('button', { name: 'Log 3 items' }).waitFor()
  })

  await step('log: entries carry source photo, matched keep foodId, unmatched keep AI numbers, photo never stored, Undo removes all', async () => {
    await dialog(page).getByRole('button', { name: 'Log 3 items' }).click()
    await dialog(page).waitFor({ state: 'detached' })
    await page.getByTestId('toast').filter({ hasText: 'Added 3 items from photo' }).waitFor()
    const s = await state(page)
    const ph = s.entries.filter((e) => e.source === 'photo')
    assert.equal(ph.length, 3)
    const rice = ph.find((e) => e.foodId && e.name.startsWith('Nasi putih'))
    assert.equal(rice.servingLabel, '160 g')
    assert.ok(ph.find((e) => e.name === 'Ayam goreng' && e.foodId))
    const salsa = ph.find((e) => e.name === 'Dragonfruit salsa')
    assert.equal(salsa.foodId, null)
    assert.equal(salsa.kcal, 60)
    assert.ok(ph.every((e) => e.date === TODAY))
    const dump = await page.evaluate(() => Object.entries(localStorage).map(([k, v]) => k + v).join('') + document.cookie)
    assert.ok(!dump.includes('data:image') && !dump.includes('/9j/'), 'photo not stored anywhere')
    await page.getByTestId('toast').getByRole('button', { name: 'Undo' }).click()
    assert.equal((await state(page)).entries.filter((e) => e.source === 'photo').length, 0)
    // Log again for real and see it on Today.
    await snap(page)
    await dialog(page).getByRole('button', { name: /Estimate/ }).click()
    await dialog(page).getByRole('button', { name: 'Log 4 items' }).click()
    await page.goto(BASE + '/')
    await page.getByText('📷 photo').first().waitFor()
  })

  await step('partial match + fenced JSON + string numbers: unmatched items keep AI values', async () => {
    mode.gemini = 'partial'
    await page.goto(BASE + '/log')
    await snap(page)
    await dialog(page).getByRole('button', { name: /Estimate/ }).click()
    const d = dialog(page)
    await d.getByTestId('photo-dish').filter({ hasText: 'Mystery plate' }).waitFor()
    const rows = d.getByRole('list', { name: 'Estimated items' }).getByRole('listitem')
    assert.equal(await rows.count(), 2)
    assert.equal(await rows.filter({ hasText: 'Dragonfruit' }).getAttribute('data-matched'), 'no')
    // "Krupuk-ish cracker thing" isn't Kerupuk by our rules either way; whichever it is, numbers must be sane.
    assert.match(await d.getByTestId('photo-total').innerText(), /^\d+/)
    await d.getByRole('button', { name: 'Retake' }).waitFor()
    await page.keyboard.press('Escape')
    await d.waitFor({ state: 'detached' })
  })

  const errorCase = async (m, kind, title, provider = 'gemini') => {
    mode[provider] = m
    await page.goto(BASE + '/log')
    await snap(page)
    await dialog(page).getByRole('button', { name: /Estimate/ }).click()
    await dialog(page).getByTestId('photo-error').waitFor()
    assert.equal(await errorKind(page), kind)
    assert.match(await dialog(page).innerText(), new RegExp(title))
    assert.ok(!(await dialog(page).innerText()).includes('RESOURCE_EXHAUSTED'), 'no raw provider text')
    await dialog(page).getByRole('button', { name: 'Retake' }).waitFor()
    await dialog(page).getByRole('button', { name: 'Use Quick add instead' }).waitFor()
  }
  await step('errors in plain words, each with Retake and Quick add: wrong key, rate limit, no food, unreadable, connection dropped', async () => {
    await errorCase('badkey', 'key', 'Your key didn’t work')
    await dialog(page).getByRole('button', { name: 'Check key in Me' }).click()
    await page.waitForURL('**/settings?ai=1')
    await errorCase('busy', 'busy', 'Gemini is busy')
    mode.gemini = 'ok'
    await dialog(page).getByRole('button', { name: 'Try again' }).click()
    await dialog(page).getByText('Estimated from your photo').waitFor()
    await errorCase('nofood', 'noFood', 'No food found')
    await dialog(page).getByRole('button', { name: 'Take another photo' }).waitFor()
    await errorCase('garbage', 'failed', 'Something went wrong')
    await errorCase('drop', 'offline', 'No internet')
    await dialog(page).getByRole('button', { name: 'Use Quick add instead' }).click()
    await dialog(page).getByRole('heading', { name: 'Quick add' }).waitFor()
    await page.keyboard.press('Escape')
  })

  await step('loading can be cancelled; nothing is logged', async () => {
    mode.gemini = 'slow'
    await page.goto(BASE + '/log')
    const before = (await state(page)).entries.length
    await snap(page)
    await dialog(page).getByRole('button', { name: /Estimate/ }).click()
    await dialog(page).getByText('Looking at your meal').waitFor()
    await dialog(page).getByRole('button', { name: 'Cancel' }).click()
    await dialog(page).getByRole('button', { name: /Estimate/ }).waitFor()
    await page.waitForTimeout(1700)
    assert.equal(await dialog(page).getByText('Estimated from your photo').count(), 0)
    assert.equal((await state(page)).entries.length, before)
    await page.keyboard.press('Escape')
  })

  await step('offline: camera becomes "Needs internet" and opens nothing; back online it returns', async () => {
    mode.gemini = 'ok'
    await ctx.setOffline(true)
    await page.getByTestId('camera-offline').filter({ hasText: 'Needs' }).waitFor()
    assert.equal(await page.getByRole('button', { name: 'Estimate from a photo' }).count(), 0)
    await page.getByTestId('camera-offline').click()
    assert.equal(await dialog(page).count(), 0)
    await ctx.setOffline(false)
    await page.getByRole('button', { name: 'Estimate from a photo' }).waitFor()
  })

  await step('OpenAI: success, then wrong key whose 401 has no CORS headers is still named via the /v1/models probe', async () => {
    await saveKey(page, 'openai', OPENAI_KEY)
    mode.openai = 'ok'
    seen.length = 0
    await page.goto(BASE + '/log')
    await snap(page)
    await dialog(page).getByRole('button', { name: /Estimate/ }).click()
    await dialog(page).getByText('Estimated from your photo').waitFor()
    const req = seen.find((s) => s.p === 'openai' && s.method === 'POST')
    assert.match(req.url, /\/v1\/chat\/completions$/)
    assert.equal(req.headers.authorization, 'Bearer ' + OPENAI_KEY)
    const body = JSON.parse(req.body)
    assert.equal(body.model, 'gpt-6-luna')
    assert.equal(body.response_format.type, 'json_schema')
    assert.match(JSON.stringify(body.messages), /data:image\/jpeg;base64,/)
    await page.keyboard.press('Escape')
    await errorCase('badkey', 'key', 'Your key didn’t work', 'openai')
    assert.ok(seen.some((s) => s.p === 'openai' && s.method === 'GET' && /\/v1\/models$/.test(s.url)), 'probe ran')
    await errorCase('busy', 'busy', 'OpenAI is busy', 'openai')
  })

  await step('Remove key: gone from storage; camera shows the set-up sheet again; Reset all data also clears it', async () => {
    await page.goto(BASE + '/settings')
    await page.getByRole('button', { name: 'Remove key' }).click()
    assert.equal(await page.evaluate(() => localStorage.getItem('calorie-app:ai')), null)
    assert.equal(await page.getByTestId('ai-key').inputValue(), '')
    await page.goto(BASE + '/log')
    await page.getByRole('button', { name: 'Estimate from a photo' }).click()
    await dialog(page).getByRole('button', { name: 'Add a key in Me' }).waitFor()
    await saveKey(page, 'gemini', GEMINI_KEY)
    await page.goto(BASE + '/settings')
    await page.getByRole('button', { name: 'Reset all data' }).click()
    await page.waitForURL('**/onboarding')
    assert.equal(await page.evaluate(() => localStorage.getItem('calorie-app:ai')), null)
  })
  await ctx.close()

  // Closed day: the bar (and camera) is hidden.
  await step('closed day: no camera (the whole bar is hidden)', async () => {
    const closed = structuredClone(V1_STATE)
    closed.closedDays[TODAY] = { ...Object.values(closed.closedDays)[0], closedAt: Date.now() }
    const c2 = await browser.newContext({ viewport: { width: 375, height: 667 }, serviceWorkers: 'block' })
    await c2.addInitScript((s) => { localStorage.setItem('calorie-app:v1', JSON.stringify(s)); localStorage.setItem('calorie-app:ai', JSON.stringify({ provider: 'gemini', key: 'x' })) }, closed)
    const p2 = await c2.newPage()
    await p2.goto(BASE + '/log')
    await p2.getByRole('link', { name: 'Close and go back to Today' }).waitFor()
    await p2.waitForTimeout(300)
    assert.equal(await p2.getByTestId('qa-bar').count(), 0)
    assert.equal(await p2.getByRole('button', { name: 'Estimate from a photo' }).count(), 0)
    await c2.close()
  })
} finally {
  await browser.close()
  console.log(results.join('\n'))
  if (results.some((r) => r.startsWith('FAIL'))) process.exitCode = 1
  if (errors.length) { console.log('Console errors:\n' + errors.join('\n')); process.exitCode = 1 }
  else if (!process.exitCode) console.log(`\n${results.filter((r) => r.startsWith('PASS')).length} v1.5 photo checks passed, no console errors`)
}
