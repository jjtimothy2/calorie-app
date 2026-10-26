// v1.5 AI photo estimate, end to end with mocked Gemini and OpenAI (no real key, no network).
// v1.6: AI button, photo optional (text only, photo only, both), AI numbers always used.
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
const AI_BTN = { name: 'Estimate with AI', exact: true } // v1.6.1
/** v1.7: AI button > Type it opens the AI sheet from the Log bar. */
const openAi = async (page) => { await page.getByRole('button', AI_BTN).click(); await page.getByRole('menuitem', { name: 'Type it' }).click(); await dialog(page).getByRole('textbox').waitFor() }
/** v1.7: AI button > Take photo (native camera; a file chooser here) and the shot opens the sheet. */
const snap = async (page) => {
  await page.getByRole('button', AI_BTN).click()
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('menuitem', { name: 'Take photo' }).click()])
  assert.equal(chooser.isMultiple(), false)
  await chooser.setFiles(PLATE)
  await dialog(page).getByTestId('photo-added').waitFor()
}
const errorKind = (page) => dialog(page).getByTestId('photo-error').getAttribute('data-kind')

try {
  const { ctx, page } = await setup()

  await step('old v1 data loads; AI button (gradient star) sits right of Quick add on Log (Food only), library input has no capture, camera input has capture=environment', async () => {
    await page.goto(BASE + '/log')
    const cam = page.getByRole('button', AI_BTN)
    await cam.waitFor()
    assert.equal((await cam.innerText()).trim(), '', 'v1.6.1: no text label, sparkle only')
    assert.equal(await cam.locator('svg').count(), 1, 'sparkle icon')
    const look = await cam.evaluate((el) => { const c = getComputedStyle(el), svg = el.querySelector('svg'), id = svg.getAttribute('fill').match(/^url\(#(.+)\)$/)?.[1]; return { bg: c.backgroundColor, border: c.borderTopColor, stops: [...(document.getElementById(id)?.querySelectorAll('stop') ?? [])].map((x) => x.getAttribute('stop-color').toUpperCase()), paths: svg.querySelectorAll('path').length } })
    assert.deepEqual(look, { bg: 'rgb(255, 253, 248)', border: 'rgb(231, 223, 208)', stops: ['#2F8F5B', '#D9663F'], paths: 1 }, 'v1.6.3: cream card, line border, one star filled green to orange')
    assert.equal(await page.getByTestId('camera-btn').count(), 0, 'camera button is gone')
    const qa = page.getByRole('button', { name: /Quick add calories/ })
    await cam.waitFor()
    const [cb, qb] = [await cam.boundingBox(), await qa.boundingBox()]
    assert.ok(cb.x >= qb.x + qb.width, 'AI button is right of Quick add')
    assert.equal(Math.round(cb.height), 56)
    assert.ok(Math.abs(cb.y + cb.height / 2 - (qb.y + qb.height / 2)) < 3, 'same row')
    assert.equal(Math.round(cb.width), 56)
    const input = page.getByTestId('photo-input')
    assert.equal(await input.getAttribute('accept'), 'image/*')
    assert.equal(await input.getAttribute('capture'), null)
    const cap = page.getByTestId('photo-capture')
    assert.equal(await cap.getAttribute('accept'), 'image/*')
    assert.equal(await cap.getAttribute('capture'), 'environment')
    await page.getByRole('button', { name: 'Exercise', exact: true }).click()
    await page.getByRole('button', { name: /Quick add burn/ }).waitFor()
    assert.equal(await cam.count(), 0, 'not in Exercise mode')
    await page.getByRole('button', { name: 'Food', exact: true }).click()
    await cam.waitFor()
    const s = await state(page)
    assert.ok(s.entries.some((e) => e.name === 'Chicken rice'), 'v1 data migrated')
  })

  await step('no key: AI button opens the set-up sheet (no file picker), button goes to Me > AI with the key field focused', async () => {
    let chooser = false
    page.once('filechooser', () => { chooser = true })
    await page.getByRole('button', AI_BTN).click()
    await dialog(page).getByRole('heading', { name: 'AI estimate' }).waitFor()
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

  await step('v1.7 Type it sheet: text field focused, dashed strip above it, chips, Estimate; Estimate needs a photo, 2+ characters or a chip', async () => {
    await page.goto(BASE + '/log')
    await openAi(page)
    const d = dialog(page)
    const box = d.getByRole('textbox', { name: 'What did you eat?' })
    assert.equal(await box.getAttribute('placeholder'), 'e.g. 2 slices martabak manis, half a plate')
    assert.equal(await page.evaluate(() => document.activeElement?.tagName), 'TEXTAREA', 'Type it focuses the field')
    const order = await d.evaluate((el) => {
      const y = (sel) => el.querySelector(sel).getBoundingClientRect().top
      return [y('[data-testid=add-photo]'), y('textarea'), y('[aria-label="Quick notes"]'), y('[data-keep-visible]')]
    })
    assert.deepEqual([...order].sort((a, b) => a - b), order, 'strip, note, chips, Estimate from top to bottom')
    const strip = d.getByTestId('add-photo')
    assert.equal(Math.round((await strip.boundingBox()).height), 56)
    assert.equal(await strip.evaluate((el) => getComputedStyle(el).borderTopStyle), 'dashed')
    assert.equal(await d.getByTestId('photo-tip').count(), 0, 'tip waits for the photo options')
    await strip.click()
    const tip = d.getByTestId('photo-tip')
    assert.equal(await tip.innerText(), 'Tip: a spoon or your hand in the shot helps portions.')
    const [ob, tb] = [await d.getByTestId('strip-options').boundingBox(), await tip.boundingBox()]
    assert.ok(tb.y >= ob.y + ob.height && tb.y - (ob.y + ob.height) < 12, 'tip sits under the photo options')
    assert.equal(await tip.evaluate((el) => getComputedStyle(el).color), 'rgb(107, 103, 95)', 'muted ink')
    await strip.click()
    assert.ok(!(await d.innerText()).includes('✨'), 'no emoji sparkle in the sheet (SVG in palette colours)')
    const est = d.getByRole('button', { name: /Estimate/ })
    assert.equal(await est.isDisabled(), true, 'empty: Estimate disabled')
    await box.click()
    await page.keyboard.type('n')
    assert.equal(await est.isDisabled(), true, '1 character: still disabled')
    await page.keyboard.type('a')
    assert.equal(await est.isDisabled(), false, '2 characters: Estimate enabled')
    await box.fill('   ')
    assert.equal(await est.isDisabled(), true, 'spaces only: disabled')
    await box.fill('')
    // A chip alone counts.
    await d.getByRole('group', { name: 'Quick notes' }).getByRole('button', { name: 'No rice' }).click()
    assert.equal(await est.isDisabled(), false, 'chip: Estimate enabled')
    await page.keyboard.press('Escape')
    await d.waitFor({ state: 'detached' })
  })

  await step('v1.6 text only: request has no image part, description sent as the main input, results say "from your description"', async () => {
    await openAi(page)
    const d = dialog(page)
    await d.getByRole('textbox').fill('nasi padang with rendang and egg')
    seen.length = 0
    await d.getByRole('button', { name: /Estimate/ }).click()
    await d.getByText('Estimated from your description').waitFor()
    const req = seen.find((s) => s.method === 'POST')
    const body = JSON.parse(req.body)
    assert.equal(body.contents[0].parts.length, 1, 'one part only')
    assert.deepEqual(Object.keys(body.contents[0].parts[0]), ['text'])
    assert.ok(!req.body.includes('inlineData') && !req.body.includes('image/jpeg'), 'no image in a text-only request')
    assert.match(body.contents[0].parts[0].text, /^What I ate: nasi padang with rendang and egg/)
    assert.match(body.systemInstruction.parts[0].text, /There is no photo.*typical Indonesian portion/s)
    assert.ok(!req.body.includes('Nasi putih (white rice)'), 'food list not sent')
    assert.match(await d.getByTestId('photo-note').innerText(), /You said: nasi padang with rendang and egg/)
    assert.equal(await d.getByTestId('photo-scale').count(), 0, 'text only: no size line')
    assert.ok(!/size reference|25 cm/.test(body.systemInstruction.parts[0].text), 'text-only prompt has no size-reference rule')
    // Edit goes back with the text kept.
    await d.getByRole('button', { name: 'Edit' }).click()
    assert.equal(await d.getByRole('textbox').inputValue(), 'nasi padang with rendang and egg')
    await page.keyboard.press('Escape')
    await d.waitFor({ state: 'detached' })
  })

  await step('photo + text: Take photo, Remove, From library, chips toggle, downscaled JPEG sent with the note, no food list', async () => {
    await snap(page)
    const d = dialog(page)
    assert.equal(await d.getByTestId('photo-strip').count(), 0, 'the frame shows the photo')
    await d.getByRole('button', { name: 'Retake' }).waitFor()
    await d.getByRole('button', { name: 'Remove photo' }).click()
    await d.getByTestId('photo-strip').waitFor()
    await d.getByTestId('add-photo').click()
    const [chooser] = await Promise.all([page.waitForEvent('filechooser'), d.getByRole('button', { name: 'From library' }).click()])
    await chooser.setFiles(PLATE)
    await d.getByTestId('photo-added').waitFor()
    const est = d.getByRole('button', { name: /Estimate/ })
    assert.equal(await est.isDisabled(), false, 'photo only: Estimate enabled')
    const note = d.getByRole('textbox')
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
    await est.click()
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
    assert.match(all, /My note: Extra sambal/i)
    assert.ok(!all.includes('Nasi putih (white rice)') && !all.includes('Sayur lodeh;'), 'food list not sent')
    assert.match(all, /Indonesia/)
    assert.match(all, /portion/)
    assert.match(body.systemInstruction.parts[0].text, /before guessing any grams, look in and around the photo for a size reference/)
    assert.match(all, /scale_ref/)
    assert.equal(await d.getByTestId('photo-tip').count(), 0, 'tip only shows with Add photo')
    assert.ok(body.generationConfig?.responseFormat || body.generationConfig, 'JSON output requested')
  })

  await step('results: AI numbers for every item (even list names), no source tags, AI portion words, carbs/fat lines and total pills, no-wrap rule, live stepper, remove', async () => {
    const d = dialog(page)
    assert.equal(await d.getByTestId('photo-dish').innerText(), 'Nasi ayam goreng')
    assert.match(await d.getByTestId('photo-note').innerText(), /Your note: .*Extra sambal/i)
    assert.equal(await d.getByTestId('photo-scale').innerText(), 'Sized using: spoon')
    const [db, sb] = [await d.getByTestId('photo-source').boundingBox(), await d.getByTestId('photo-scale').boundingBox()]
    assert.ok(sb.y >= db.y + db.height - 1, 'under the dish subtitle')
    assert.equal(await d.getByTestId('photo-scale').evaluate((el) => getComputedStyle(el).color), 'rgb(107, 103, 95)')
    const rows = d.getByRole('list', { name: 'Estimated items' }).getByRole('listitem')
    assert.equal(await rows.count(), 4)
    const row = (n) => rows.filter({ hasText: n })
    // Rice and chicken are named like foods on our list, but the AI's numbers are used (ours: 192 and 320).
    assert.match(await row('Nasi putih').getByTestId('item-kcal').innerText(), /^250/)
    assert.match(await row('Ayam goreng').getByTestId('item-kcal').innerText(), /^330/)
    assert.equal(await row('Nasi putih').locator('.tile').innerText(), '🍚', 'list used for the emoji')
    assert.equal(await rows.filter({ hasText: 'Nasi putih (white rice)' }).count(), 0, 'AI name kept, not our list name')
    const txt = await d.innerText()
    assert.doesNotMatch(txt, /From our food list|AI estimate\n/, 'no source tags')
    assert.match(await d.getByTestId('photo-total').innerText(), /^670/)
    assert.match(txt, /Estimates are rough\. Adjust before logging\./)
    const seen = (el) => { const c = el.cloneNode(true); c.querySelectorAll('.sr-only').forEach((x) => x.remove()); if (el.querySelector('[data-testid=item-portion]')?.offsetParent === null) c.querySelector('[data-testid=item-portion]')?.remove(); return c.textContent.replace(/\s+/g, ' ').trim() }
    const macros = async (n) => row(n).getByTestId('item-macros').evaluate(seen)
    const vis = async (n) => (await macros(n)).replace(/.* · /, '')
    assert.equal(await row('Ayam goreng').getByTestId('item-protein').locator('[aria-hidden="true"]').innerText(), '25P')
    assert.equal(await macros('Ayam goreng'), '1 thigh · 25P 5C 23F')
    assert.equal(await macros('Nasi putih'), '1 plate · 5P 55C 1F', 'AI numbers, not our list (4P 42C 0F)')
    assert.equal(await macros('Sambal'), '1 tbsp · 0P 2C 2F')
    assert.equal(await vis('Dragonfruit salsa'), '1P 13C 0F')
    assert.equal((await row('Ayam goreng').getByTestId('item-protein').locator('.sr-only').textContent()).replace(/,$/, ''), '25 g protein')
    assert.equal((await row('Ayam goreng').getByTestId('item-carbs').locator('.sr-only').textContent()).replace(/,$/, ''), '5 g carbs')
    assert.equal(await row('Ayam goreng').getByTestId('item-fat').locator('.sr-only').textContent(), '23 g fat')
    const ink = await row('Ayam goreng').getByTestId('item-macros').evaluate((el) => ['protein', 'carbs', 'fat'].map((k) => getComputedStyle(el.querySelector(`[data-testid=item-${k}]`)).color))
    assert.deepEqual(ink, ['rgb(194, 51, 106)', 'rgb(138, 95, 0)', 'rgb(47, 98, 201)'], 'protein/carbs/fat text inks')
    const totals = async () => Promise.all(['protein', 'carbs', 'fat'].map((k) => d.getByTestId(`total-${k}`).innerText()))
    assert.deepEqual(await totals(), ['31 g Protein', '75 g Carbs', '26 g Fat'])
    // No-wrap rule at 390 and 375: each macro line stays on one line at 15 px; the portion goes first if it doesn't fit.
    for (const width of [390, 375]) {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 667 })
      await page.waitForTimeout(150)
      const lines = await d.getByTestId('item-macros').evaluateAll((els) => els.map((el) => ({ fs: getComputedStyle(el).fontSize, h: el.getBoundingClientRect().height, over: el.scrollWidth > el.clientWidth + 0.5, text: el.textContent })))
      assert.equal(lines.length, 4)
      for (const l of lines) {
        assert.equal(l.fs, '15px', `${width}: text never shrinks`)
        assert.ok(!l.over, `${width}: "${l.text}" overflows`)
        assert.ok(l.h < 26, `${width}: "${l.text}" wraps (${l.h}px)`)
      }
      assert.ok(await row('Ayam goreng').getByTestId('item-portion').isVisible(), `${width}: short portion label is kept`)
      assert.ok(!(await row('Dragonfruit salsa').getByTestId('item-portion').isVisible()), `${width}: long portion label is dropped instead of wrapping`)
    }
    await page.setViewportSize({ width: 390, height: 844 })
    await d.getByRole('button', { name: 'More Nasi putih' }).click()
    assert.equal(await row('Nasi putih').getByTestId('item-grams').innerText(), '160 g')
    assert.match(await row('Nasi putih').getByTestId('item-kcal').innerText(), /^267/, 'AI kcal scaled per gram (250 / 150 g x 160 g)')
    assert.match(await d.getByTestId('photo-total').innerText(), /^687/)
    assert.equal(await macros('Nasi putih'), '5P 59C 1F', 'all macros follow the stepper; the AI portion words drop once grams change')
    assert.deepEqual(await totals(), ['31 g Protein', '79 g Carbs', '26 g Fat'], 'total pills follow the stepper')
    await d.getByRole('button', { name: 'Less Sambal' }).click()
    assert.equal(await row('Sambal').getByTestId('item-grams').innerText(), '10 g', 'small items step by 5 g')
    assert.equal(await macros('Sambal'), '0P 1C 2F')
    await d.getByRole('button', { name: 'Remove Sambal' }).click()
    assert.equal(await rows.count(), 3)
    await d.getByRole('button', { name: 'Log 3 items' }).waitFor()
  })

  await step('log: entries are AI (source photo, no foodId), AI numbers scaled, portion in the label, photo never stored, Undo removes all', async () => {
    await dialog(page).getByRole('button', { name: 'Log 3 items' }).click()
    await dialog(page).waitFor({ state: 'detached' })
    await page.getByTestId('toast').filter({ hasText: 'Added 3 items from AI' }).waitFor()
    const s = await state(page)
    const ph = s.entries.filter((e) => e.source === 'photo')
    assert.equal(ph.length, 3)
    assert.ok(ph.every((e) => e.foodId === null), 'no catalog entries')
    const rice = ph.find((e) => e.name === 'Nasi putih')
    assert.equal(rice.servingLabel, '160 g'); assert.equal(rice.kcal, 267); assert.equal(rice.carbs, 58.7)
    const chicken = ph.find((e) => e.name === 'Ayam goreng')
    assert.equal(chicken.servingLabel, '1 thigh (120 g)'); assert.equal(chicken.kcal, 330)
    const salsa = ph.find((e) => e.name === 'Dragonfruit salsa')
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
    // v1.10: 2+ items from one estimate share a groupId and show as one meal row on Today.
    const grp = page.getByTestId('ai-group-row')
    await grp.waitFor()
    assert.match(await grp.innerText(), /Nasi ayam goreng[\s\S]*4 items/)
    const g4 = (await state(page)).entries.filter((e) => e.source === 'photo')
    assert.equal(g4.length, 4); assert.equal(new Set(g4.map((e) => e.groupId)).size, 1); assert.ok(g4[0].groupId)
    assert.ok(g4.every((e) => e.groupName === 'Nasi ayam goreng'))
    const labs = await page.locator('li span.text-mute').evaluateAll((els) => els.map((e) => e.textContent))
    const lab = page.locator('li span.text-mute').filter({ hasText: /AI$/ }).first()
    assert.ok(labs.some((t) => / · {1,2}AI$/.test(t)), 'Today label ends in AI: ' + JSON.stringify(labs))
    assert.equal(await lab.locator('svg').count(), 1, 'Today label: SVG sparkle (currentColor) + AI')
  })

  await step('fenced JSON + string numbers + missing portion: AI values kept', async () => {
    mode.gemini = 'partial'
    await page.goto(BASE + '/log')
    await snap(page)
    await dialog(page).getByRole('button', { name: /Estimate/ }).click()
    const d = dialog(page)
    await d.getByTestId('photo-dish').filter({ hasText: 'Mystery plate' }).waitFor()
    const rows = d.getByRole('list', { name: 'Estimated items' }).getByRole('listitem')
    assert.equal(await rows.count(), 2)
    // 60 + 95 from the AI; the cracker has no portion field (optional).
    assert.match(await d.getByTestId('photo-total').innerText(), /^155/)
    assert.equal(await d.getByTestId('photo-scale').innerText(), 'No size reference, portions are a guess', 'answer without scale_ref')
    assert.equal(await rows.filter({ hasText: 'Krupuk-ish' }).getByTestId('item-portion').count(), 0)
    await d.getByRole('button', { name: 'Edit' }).waitFor()
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
    await dialog(page).getByRole('button', { name: 'Edit' }).waitFor()
    await dialog(page).getByRole('button', { name: 'Use Quick add instead' }).waitFor()
  }
  await step('errors in plain words, each with Edit and Quick add: wrong key, rate limit, no food, unreadable, connection dropped', async () => {
    await errorCase('badkey', 'key', 'Your key didn’t work')
    await dialog(page).getByRole('button', { name: 'Check key in Me' }).click()
    await page.waitForURL('**/settings?ai=1')
    await errorCase('busy', 'busy', 'Gemini is busy')
    mode.gemini = 'ok'
    await dialog(page).getByRole('button', { name: 'Try again' }).click()
    await dialog(page).getByText('Estimated from your photo').waitFor()
    await errorCase('nofood', 'noFood', 'No food found')
    assert.match(await dialog(page).innerText(), /Describe what you ate/)
    await dialog(page).getByRole('button', { name: 'Add more detail' }).click()
    await dialog(page).getByTestId('photo-added').waitFor()
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

  await step('offline: AI button becomes "Needs internet" and opens nothing; back online it returns', async () => {
    mode.gemini = 'ok'
    await ctx.setOffline(true)
    await page.getByTestId('ai-offline').filter({ hasText: 'Needs' }).waitFor()
    assert.equal(await page.getByRole('button', AI_BTN).count(), 0)
    await page.getByTestId('ai-offline').click()
    assert.equal(await dialog(page).count(), 0)
    await ctx.setOffline(false)
    await page.getByRole('button', AI_BTN).waitFor()
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

  await step('Remove key: gone from storage; AI button shows the set-up sheet again; Reset all data also clears it', async () => {
    await page.goto(BASE + '/settings')
    await page.getByRole('button', { name: 'Remove key' }).click()
    assert.equal(await page.evaluate(() => localStorage.getItem('calorie-app:ai')), null)
    assert.equal(await page.getByTestId('ai-key').inputValue(), '')
    await page.goto(BASE + '/log')
    await page.getByRole('button', AI_BTN).click()
    await dialog(page).getByRole('button', { name: 'Add a key in Me' }).waitFor()
    await saveKey(page, 'gemini', GEMINI_KEY)
    await page.goto(BASE + '/settings')
    await page.getByRole('button', { name: 'Reset all data' }).click()
    await page.waitForURL('**/onboarding')
    assert.equal(await page.evaluate(() => localStorage.getItem('calorie-app:ai')), null)
  })
  await ctx.close()

  // Closed day: the bar (and AI button) is hidden.
  await step('closed day: no AI button (the whole bar is hidden)', async () => {
    const closed = structuredClone(V1_STATE)
    closed.closedDays[TODAY] = { ...Object.values(closed.closedDays)[0], closedAt: Date.now() }
    const c2 = await browser.newContext({ viewport: { width: 375, height: 667 }, serviceWorkers: 'block' })
    await c2.addInitScript((s) => { localStorage.setItem('calorie-app:v1', JSON.stringify(s)); localStorage.setItem('calorie-app:ai', JSON.stringify({ provider: 'gemini', key: 'x' })) }, closed)
    const p2 = await c2.newPage()
    await p2.goto(BASE + '/log')
    await p2.getByRole('link', { name: 'Close and go back to Today' }).waitFor()
    await p2.waitForTimeout(300)
    assert.equal(await p2.getByTestId('qa-bar').count(), 0)
    assert.equal(await p2.getByRole('button', AI_BTN).count(), 0)
    await c2.close()
  })
} finally {
  await browser.close()
  console.log(results.join('\n'))
  if (results.some((r) => r.startsWith('FAIL'))) process.exitCode = 1
  if (errors.length) { console.log('Console errors:\n' + errors.join('\n')); process.exitCode = 1 }
  else if (!process.exitCode) console.log(`\n${results.filter((r) => r.startsWith('PASS')).length} v1.5/v1.6 AI estimate checks passed, no console errors`)
}
