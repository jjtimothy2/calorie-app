// v1.5 unit checks: AI photo estimate parsing, food-list matching, per-gram maths, error mapping, request shapes,
// and that the AI key never leaves the phone in a backup. Run: node tests/ai.mjs  (add LIVE=1 to also check the
// Gemini request body against the real API with a fake key: field names are validated before the key.)
import { execSync } from 'node:child_process'
import { readdirSync, readFileSync, writeFileSync, rmSync, statSync } from 'node:fs'
import assert from 'node:assert/strict'
const out = 'node_modules/.tmp/ai'
rmSync(out, { recursive: true, force: true })
execSync(`npx tsc --ignoreConfig --outDir ${out} --rootDir src src/lib/ai.ts src/data/foods.ts src/lib/backup.ts --module esnext --target es2022 --skipLibCheck --lib es2022,dom`)
const walk = (d) => readdirSync(d).flatMap((f) => (statSync(`${d}/${f}`).isDirectory() ? walk(`${d}/${f}`) : [`${d}/${f}`]))
for (const f of walk(out).filter((f) => f.endsWith('.js'))) writeFileSync(f.replace(/\.js$/, '.mjs'), readFileSync(f, 'utf8').replace(/from '(\.\.?\/[^']+)'/g, "from '$1.mjs'"))
const load = (m) => import(new URL(`../${out}/${m}.mjs`, import.meta.url))
const store = new Map()
globalThis.localStorage = { get length() { return store.size }, key: (i) => [...store.keys()][i] ?? null, getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) }
const ai = await load('lib/ai')
const { FOODS } = await load('data/foods')
const backup = await load('lib/backup')
const results = []
const t = async (name, fn) => { await fn(); results.push('PASS ' + name) }
const byName = (n) => FOODS.find((f) => f.name === n)

await t('parseEstimate: plain JSON, fences, prose around it, strings for numbers, junk rows dropped', () => {
  const a = ai.parseEstimate('{"dish":"Nasi campur","items":[{"name":"White rice","match":"Nasi putih (white rice)","grams":180,"kcal":230,"protein_g":4.3,"carbs_g":50,"fat_g":0.5,"confidence":0.8}]}')
  assert.equal(a.dish, 'Nasi campur'); assert.equal(a.items.length, 1); assert.equal(a.items[0].protein, 4.3); assert.equal(a.items[0].match, 'Nasi putih (white rice)')
  const b = ai.parseEstimate('```json\n{"dish":"X","items":[{"name":"Sambal","grams":"20 g","kcal":"40","protein_g":0.4}]}\n```')
  assert.equal(b.items[0].grams, 20); assert.equal(b.items[0].kcal, 40); assert.equal(b.items[0].carbs, 0); assert.equal(b.items[0].confidence, 0.5)
  const c = ai.parseEstimate('Sure! Here it is: {"dish":"Y","items":[{"name":"","grams":10,"kcal":1},{"name":"Egg","grams":-5,"kcal":1},{"name":"Tempe","grams":50,"kcal":-3,"protein_g":"x","confidence":85}]} hope this helps')
  assert.equal(c.items.length, 1); assert.equal(c.items[0].kcal, 0); assert.equal(c.items[0].protein, 0); assert.equal(c.items[0].confidence, 0.85)
  assert.deepEqual(ai.parseEstimate('{"dish":"Table","items":[]}'), { dish: 'Table', items: [] })
  assert.equal(ai.parseEstimate('I cannot help with that'), null)
  assert.equal(ai.parseEstimate('{"dish":"no items key"}'), null)
  assert.equal(ai.parseEstimate('{broken'), null)
  assert.equal(ai.parseEstimate('[{"name":"Rice","grams":100,"kcal":130}]').items.length, 1)
})

await t('matchFood: exact list name, own name, bracket name, alias, phrase inside, no false hits', () => {
  const m = (name, match = '') => ai.matchFood({ name, match }, FOODS)?.name ?? null
  assert.equal(m('steamed white rice', 'Nasi putih (white rice)'), 'Nasi putih (white rice)')
  assert.equal(m('Ayam goreng'), 'Ayam goreng')
  assert.equal(m('white rice'), 'Nasi putih (white rice)')
  assert.equal(m('nasi putih'), 'Nasi putih (white rice)')
  assert.equal(m('Rice'), 'Nasi putih (white rice)')
  assert.equal(m('Fried tempeh'), byName('Tempe goreng') ? 'Tempe goreng' : null)
  assert.equal(m('Sayur lodeh with santan'), 'Sayur lodeh')
  assert.equal(m('Sambal terasi'), 'Sambal')
  assert.equal(m('Ayam goreng kremes'), 'Ayam goreng')
  assert.equal(m('Grilled chicken breast'), 'Chicken breast, grilled')
  assert.equal(m('Égg fried rice') === 'Fried egg', false, 'egg fried rice is not a fried egg')
  assert.equal(m('Rendang daging', 'Not in the list'), byName('Rendang daging') ? 'Rendang daging' : m('Rendang daging'))
  assert.equal(m('Perkedel jagung'), null)
  assert.equal(m('Mystery stew'), null)
})

await t('toPhotoItems + itemMacros: matched rows use our per-gram values, others keep the AI numbers', () => {
  const est = ai.parseEstimate(JSON.stringify({ dish: 'Nasi campur', items: [
    { name: 'White rice', match: 'Nasi putih (white rice)', grams: 180, kcal: 999, protein_g: 99 },
    { name: 'Perkedel jagung', match: '', grams: 60, kcal: 150, protein_g: 3, carbs_g: 15, fat_g: 9 },
  ] }))
  const [rice, perk] = ai.toPhotoItems(est, FOODS)
  const nasi = byName('Nasi putih (white rice)')
  assert.equal(rice.food.id, nasi.id); assert.equal(rice.name, nasi.name)
  const r = ai.itemMacros(rice, 180)
  assert.ok(Math.abs(r.kcal - nasi.kcal / nasi.grams * 180) < 1e-9, 'rice kcal from our list, not the AI')
  assert.ok(Math.abs(r.protein - nasi.protein / nasi.grams * 180) < 1e-9)
  assert.equal(perk.food, null); assert.equal(perk.name, 'Perkedel jagung')
  assert.deepEqual(ai.itemMacros(perk, 60), { kcal: 150, protein: 3, carbs: 15, fat: 9 })
  assert.deepEqual(ai.itemMacros(perk, 120), { kcal: 300, protein: 6, carbs: 30, fat: 18 }, 'stepper scales AI numbers per gram')
  assert.equal(ai.gramStep(20), 5); assert.equal(ai.gramStep(180), 10)
})

await t('note chips toggle in and out of the note', () => {
  let n = ai.toggleNoteChip('', 'Shared'); assert.equal(n, 'Shared')
  n = ai.toggleNoteChip('fried, ' + n, 'No rice'); assert.equal(n, 'fried, Shared, No rice')
  assert.equal(ai.noteHas(n, 'shared'), true)
  assert.equal(ai.toggleNoteChip(n, 'Shared'), 'fried, No rice')
})

await t('prompt carries the note, the food list and Indonesian context; models are constants; Gemini first', () => {
  const sp = ai.systemPrompt(FOODS.map((f) => f.name))
  assert.match(sp, /Indonesia/); assert.match(sp, /santan/); assert.ok(sp.includes('Nasi putih (white rice)')); assert.ok(sp.includes('Sayur lodeh'))
  assert.match(ai.userPrompt('Half portion, fried'), /My note: Half portion, fried/)
  assert.deepEqual(ai.PROVIDERS, ['gemini', 'openai']); assert.equal(ai.DEFAULT_PROVIDER, 'gemini')
  assert.equal(ai.MODELS.gemini, 'gemini-3.5-flash-lite'); assert.equal(ai.MODELS.openai, 'gpt-6-luna')
  const o = ai.openaiBody('data:image/jpeg;base64,AAAA', 'Shared', ['A'])
  assert.equal(o.model, 'gpt-6-luna'); assert.equal(o.response_format.json_schema.strict, true); assert.equal(o.messages[1].content[1].image_url.url, 'data:image/jpeg;base64,AAAA')
  const g = ai.geminiBody('data:image/jpeg;base64,AAAA', 'Shared', ['A'])
  assert.equal(g.contents[0].parts[0].inlineData.data, 'AAAA'); assert.equal(g.generationConfig.responseFormat.text.mimeType, 'APPLICATION_JSON')
})

const res = (status, body, ok = status < 300) => ({ ok, status, text: async () => (typeof body === 'string' ? body : JSON.stringify(body)), json: async () => (typeof body === 'string' ? JSON.parse(body) : body) })
const S = { gemini: { provider: 'gemini', key: 'AIza-test' }, openai: { provider: 'openai', key: 'sk-test' } }
const okText = '{"dish":"Nasi campur","items":[{"name":"Rice","match":"","grams":150,"kcal":190,"protein_g":4,"carbs_g":40,"fat_g":0.4,"confidence":0.7}]}'
const kind = async (p) => { try { await p; return 'ok' } catch (e) { return e.kind ?? e.message } }

await t('estimatePhoto: success, no food, unreadable, wrong key, busy, offline, for both providers', async () => {
  const gem = (r) => async (url, init) => { assert.match(url, /gemini-3\.5-flash-lite:generateContent$/); assert.equal(init.headers['x-goog-api-key'], 'AIza-test'); assert.equal(init.credentials, 'omit'); return typeof r === 'function' ? r() : r }
  const est = await ai.estimatePhoto(S.gemini, 'data:image/jpeg;base64,AAAA', '', ['Rice'], { fetch: gem(res(200, { candidates: [{ content: { parts: [{ text: okText }] } }] })) })
  assert.equal(est.items[0].name, 'Rice')
  assert.equal(await kind(ai.estimatePhoto(S.gemini, 'x', '', [], { fetch: gem(res(200, { candidates: [{ content: { parts: [{ text: '{"dish":"","items":[]}' }] } }] })) })), 'noFood')
  assert.equal(await kind(ai.estimatePhoto(S.gemini, 'x', '', [], { fetch: gem(res(200, { candidates: [{ content: { parts: [{ text: 'lol no' }] } }] })) })), 'failed')
  assert.equal(await kind(ai.estimatePhoto(S.gemini, 'x', '', [], { fetch: gem(res(400, { error: { code: 400, message: 'API key not valid.', status: 'INVALID_ARGUMENT', details: [{ reason: 'API_KEY_INVALID' }] } })) })), 'key')
  assert.equal(await kind(ai.estimatePhoto(S.gemini, 'x', '', [], { fetch: gem(res(403, { error: { status: 'PERMISSION_DENIED' } })) })), 'key')
  assert.equal(await kind(ai.estimatePhoto(S.gemini, 'x', '', [], { fetch: gem(res(429, { error: { status: 'RESOURCE_EXHAUSTED' } })) })), 'busy')
  assert.equal(await kind(ai.estimatePhoto(S.gemini, 'x', '', [], { fetch: gem(() => { throw new TypeError('Failed to fetch') }) })), 'offline')
  assert.equal(await kind(ai.estimatePhoto(S.gemini, 'x', '', [], { fetch: gem(res(200, { promptFeedback: { blockReason: 'OTHER' } })) })), 'noFood')

  const oai = (r, probe) => async (url, init) => {
    if (url.endsWith('/models')) return probe()
    assert.equal(url, 'https://api.openai.com/v1/chat/completions'); assert.equal(init.headers.Authorization, 'Bearer sk-test')
    return typeof r === 'function' ? r() : r
  }
  assert.equal((await ai.estimatePhoto(S.openai, 'x', 'Shared', [], { fetch: oai(res(200, { choices: [{ message: { content: okText } }] })) })).dish, 'Nasi campur')
  assert.equal(await kind(ai.estimatePhoto(S.openai, 'x', '', [], { fetch: oai(res(401, { error: { code: 'invalid_api_key' } })) })), 'key')
  assert.equal(await kind(ai.estimatePhoto(S.openai, 'x', '', [], { fetch: oai(res(429, { error: { code: 'insufficient_quota' } })) })), 'busy')
  // Real OpenAI 401s on /chat/completions carry no CORS header, so the browser only sees a network error. The /models probe tells us.
  const cors = () => { throw new TypeError('Failed to fetch') }
  assert.equal(await kind(ai.estimatePhoto(S.openai, 'x', '', [], { fetch: oai(cors, () => res(401, {})) })), 'key')
  assert.equal(await kind(ai.estimatePhoto(S.openai, 'x', '', [], { fetch: oai(cors, () => res(200, { data: [] })) })), 'failed')
  assert.equal(await kind(ai.estimatePhoto(S.openai, 'x', '', [], { fetch: oai(cors, cors) })), 'offline')
  assert.equal(await kind(ai.estimatePhoto(S.openai, 'x', '', [], { fetch: oai(res(200, { choices: [{ message: { refusal: 'no' } }] })) })), 'noFood')
})

await t('testKey: free model lookup, maps bad key and missing model', async () => {
  let seen = ''
  assert.equal(await ai.testKey(S.gemini, async (u, i) => { seen = u; assert.equal(i.method, undefined); return res(200, {}) }), true)
  assert.equal(seen, 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite')
  assert.equal(await ai.testKey(S.openai, async (u) => { seen = u; return res(200, {}) }), true)
  assert.equal(seen, 'https://api.openai.com/v1/models/gpt-6-luna')
  assert.equal(await kind(ai.testKey(S.gemini, async () => res(400, '{"error":{"details":[{"reason":"API_KEY_INVALID"}]}}'))), 'key')
  assert.equal(await kind(ai.testKey(S.openai, async () => res(401, {}))), 'key')
  assert.equal(await kind(ai.testKey(S.openai, async () => res(404, {}))), 'model')
})

await t('error texts are plain and never echo the key', () => {
  for (const k of ['key', 'offline', 'busy', 'noFood', 'failed', 'model']) for (const p of ['gemini', 'openai']) {
    const e = ai.errorText(k, p); assert.ok(e.title && e.body); assert.ok(!/sk-|AIza/.test(e.title + e.body))
  }
  assert.equal(ai.errorText('key', 'gemini').title, 'Your key didn’t work')
  assert.equal(ai.errorText('offline', 'gemini').title, 'No internet')
  assert.equal(ai.errorText('noFood', 'openai').title, 'No food found')
})

await t('AI key: own storage key, never in a backup, never restored, removable', () => {
  assert.equal(ai.AI_KEY, backup.AI_SECRET_KEY); assert.equal(ai.AI_KEY, 'calorie-app:ai')
  ai.saveAi({ provider: 'gemini', key: '  AIza-secret  ' })
  assert.deepEqual(ai.readAi(), { provider: 'gemini', key: 'AIza-secret' })
  store.set('calorie-app:v2', JSON.stringify({ version: 2, entries: [] }))
  const file = backup.makeBackup()
  assert.ok(!('calorie-app:ai' in file.data)); assert.ok('calorie-app:v2' in file.data)
  assert.ok(!JSON.stringify(file).includes('AIza-secret'))
  ai.clearAi(); assert.equal(ai.readAi(), null)
  backup.restoreExtraKeys({ data: { 'calorie-app:ai': { provider: 'openai', key: 'sk-evil' }, 'calorie-app:other': 1 } })
  assert.equal(store.get('calorie-app:ai'), undefined, 'restore never writes an AI key'); assert.equal(store.get('calorie-app:other'), '1')
  store.set('calorie-app:ai', 'not json'); assert.equal(ai.readAi(), null)
})

await t('service worker never touches API calls (non-GET or cross-origin is passed straight to the network)', () => {
  const sw = readFileSync('scripts/sw-plugin.ts', 'utf8')
  assert.match(sw, /req\.method !== 'GET' \|\| new URL\(req\.url\)\.origin !== self\.location\.origin\) return/)
})

if (process.env.LIVE) await t('LIVE: Gemini accepts our request body (fake key reaches the key check)', async () => {
  const r = await fetch(`${ai.GEMINI_BASE}/models/${ai.MODELS.gemini}:generateContent`, { method: 'POST', headers: { 'x-goog-api-key': 'AIzaFakeKeyForShapeCheck', 'Content-Type': 'application/json' }, body: JSON.stringify(ai.geminiBody('data:image/jpeg;base64,/9j/4AAQ', 'Shared', FOODS.map((f) => f.name))) })
  const body = await r.text()
  assert.match(body, /API_KEY_INVALID/, body.slice(0, 300))
})

console.log(results.join('\n'))
console.log(`\n${results.length} AI checks passed`)
