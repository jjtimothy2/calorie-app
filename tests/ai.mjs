// v1.5/v1.6 unit checks: AI estimate parsing (v1.6: AI numbers only, food list for emoji), food-list matching, per-gram maths, error mapping, request shapes,
// and that the AI key never leaves the phone in a backup. Run: node tests/ai.mjs  (add LIVE=1 to also check the
// Gemini request body against the real API with a fake key: field names are validated before the key.)
import { execSync } from 'node:child_process'
import { readdirSync, readFileSync, writeFileSync, rmSync, statSync } from 'node:fs'
import assert from 'node:assert/strict'
const out = 'node_modules/.tmp/ai'
rmSync(out, { recursive: true, force: true })
execSync(`npx tsc --ignoreConfig --outDir ${out} --rootDir src src/lib/ai.ts src/data/foods.ts src/lib/backup.ts src/lib/ideas.ts --module esnext --target es2022 --skipLibCheck --lib es2022,dom`)
const walk = (d) => readdirSync(d).flatMap((f) => (statSync(`${d}/${f}`).isDirectory() ? walk(`${d}/${f}`) : [`${d}/${f}`]))
for (const f of walk(out).filter((f) => f.endsWith('.js'))) writeFileSync(f.replace(/\.js$/, '.mjs'), readFileSync(f, 'utf8').replace(/from '(\.\.?\/[^']+)'/g, "from '$1.mjs'"))
const load = (m) => import(new URL(`../${out}/${m}.mjs`, import.meta.url))
const store = new Map()
globalThis.localStorage = { get length() { return store.size }, key: (i) => [...store.keys()][i] ?? null, getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) }
const ai = await load('lib/ai')
const { FOODS } = await load('data/foods')
const backup = await load('lib/backup')
const ideas = await load('lib/ideas')
const results = []
const t = async (name, fn) => { await fn(); results.push('PASS ' + name) }
const byName = (n) => FOODS.find((f) => f.name === n)

await t('parseEstimate: plain JSON, fences, prose around it, strings for numbers, junk rows dropped', () => {
  const a = ai.parseEstimate('{"dish":"Nasi campur","items":[{"name":"White rice","portion":"1 plate","grams":180,"kcal":230,"protein_g":4.3,"carbs_g":50,"fat_g":0.5,"confidence":0.8}]}')
  assert.equal(a.dish, 'Nasi campur'); assert.equal(a.items.length, 1); assert.equal(a.items[0].protein, 4.3); assert.equal(a.items[0].portion, '1 plate')
  assert.equal(ai.parseEstimate('{"dish":"X","items":[{"name":"Egg","grams":50,"kcal":70}]}').items[0].portion, '', 'portion optional')
  const b = ai.parseEstimate('```json\n{"dish":"X","items":[{"name":"Sambal","grams":"20 g","kcal":"40","protein_g":0.4}]}\n```')
  assert.equal(b.items[0].grams, 20); assert.equal(b.items[0].kcal, 40); assert.equal(b.items[0].carbs, 0); assert.equal(b.items[0].confidence, 0.5)
  const c = ai.parseEstimate('Sure! Here it is: {"dish":"Y","items":[{"name":"","grams":10,"kcal":1},{"name":"Egg","grams":-5,"kcal":1},{"name":"Tempe","grams":50,"kcal":-3,"protein_g":"x","confidence":85}]} hope this helps')
  assert.equal(c.items.length, 1); assert.equal(c.items[0].kcal, 0); assert.equal(c.items[0].protein, 0); assert.equal(c.items[0].confidence, 0.85)
  assert.deepEqual(ai.parseEstimate('{"dish":"Table","items":[]}'), { dish: 'Table', scaleRef: '', items: [] })
  assert.equal(ai.parseEstimate('I cannot help with that'), null)
  assert.equal(ai.parseEstimate('{"dish":"no items key"}'), null)
  assert.equal(ai.parseEstimate('{broken'), null)
  assert.equal(ai.parseEstimate('[{"name":"Rice","grams":100,"kcal":130}]').items.length, 1)
})

await t('matchFood (emoji only): own name, bracket name, alias, phrase inside, no false hits', () => {
  const m = (name) => ai.matchFood({ name }, FOODS)?.name ?? null
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
  assert.equal(m('Perkedel jagung'), null)
  assert.equal(m('Mystery stew'), null)
})

await t('v1.6 toPhotoItems + itemMacros: AI numbers always, even when a list name matches; list only picks the emoji', () => {
  const est = ai.parseEstimate(JSON.stringify({ dish: 'Nasi campur', items: [
    { name: 'Nasi putih', portion: '1 plate', grams: 180, kcal: 250, protein_g: 5, carbs_g: 55, fat_g: 0.5 },
    { name: 'Perkedel jagung', portion: '2 pieces', grams: 60, kcal: 150, protein_g: 3, carbs_g: 15, fat_g: 9 },
  ] }))
  const [rice, perk] = ai.toPhotoItems(est, FOODS)
  const nasi = byName('Nasi putih (white rice)')
  assert.equal(rice.name, 'Nasi putih', 'keeps the AI name'); assert.equal(rice.emojiName, nasi.name, 'list match only for the emoji')
  assert.equal('food' in rice, false, 'no catalog food on the row')
  assert.deepEqual(ai.itemMacros(rice, 180), { kcal: 250, protein: 5, carbs: 55, fat: 0.5 }, 'AI numbers, not our list (list rice would be ' + Math.round(nasi.kcal / nasi.grams * 180) + ' kcal)')
  assert.deepEqual(ai.itemMacros(rice, 90), { kcal: 125, protein: 2.5, carbs: 27.5, fat: 0.25 }, 'stepper scales every AI value by grams')
  assert.equal(perk.emojiName, 'Perkedel jagung')
  assert.deepEqual(ai.itemMacros(perk, 120), { kcal: 300, protein: 6, carbs: 30, fat: 18 })
  assert.equal(ai.gramStep(20), 5); assert.equal(ai.gramStep(180), 10)
})

await t('v1.6 portionLabel: the AI portion words at the AI grams, nothing once the stepper moves', () => {
  const it = { ai: { grams: 180, portion: '1 plate' } }
  assert.equal(ai.portionLabel(it, 180), '1 plate')
  assert.equal(ai.portionLabel(it, 190), '')
  assert.equal(ai.portionLabel({ ai: { grams: 50, portion: '' } }, 50), '')
})

await t('v1.6.1 scale_ref: parsed leniently, scaleLine for photo only (Sized using / no reference), nothing for text', () => {
  assert.equal(ai.parseEstimate('{"dish":"X","scale_ref":" spoon ","items":[]}').scaleRef, 'spoon')
  assert.equal(ai.parseEstimate('{"dish":"X","items":[]}').scaleRef, '', 'older answers without scale_ref still parse')
  assert.equal(ai.parseEstimate('{"dish":"X","scale_ref":42,"items":[]}').scaleRef, '')
  assert.equal(ai.parseEstimate('[{"name":"Egg","grams":50,"kcal":70}]').scaleRef, '')
  assert.equal(ai.scaleLine('spoon', true), 'Sized using: spoon')
  assert.equal(ai.scaleLine('plate rim.', true), 'Sized using: plate rim')
  for (const none of ['', '  ', 'none', 'None, assumed 25 cm plate', 'no reference', 'N/A']) assert.equal(ai.scaleLine(none, true), 'No size reference, portions are a guess', none)
  assert.equal(ai.scaleLine('spoon', false), null, 'text only: no line'); assert.equal(ai.scaleLine('', false), null)
  assert.ok(ai.scaleLine('a very long description of the reference object near the plate', true).length <= 45, 'long refs are cut')
  const sch = ai.ESTIMATE_SCHEMA
  assert.ok(sch.properties.scale_ref && sch.required.includes('scale_ref'), 'in the schema (OpenAI strict needs every key required)')
})

await t('note chips toggle in and out of the note', () => {
  let n = ai.toggleNoteChip('', 'Shared'); assert.equal(n, 'Shared')
  n = ai.toggleNoteChip('fried, ' + n, 'No rice'); assert.equal(n, 'fried, Shared, No rice')
  assert.equal(ai.noteHas(n, 'shared'), true)
  assert.equal(ai.toggleNoteChip(n, 'Shared'), 'fried, No rice')
})

await t('v1.6 prompt: no food list, Indonesian context with oil, santan, sauces, rice; note used heavily; text-only asks typical Indonesian portions', () => {
  const sp = ai.systemPrompt(true), st = ai.systemPrompt(false)
  for (const p of [sp, st]) {
    assert.match(p, /Indonesia/); assert.match(p, /santan/); assert.match(p, /oil/); assert.match(p, /sauce/); assert.match(p, /Rice: /); assert.match(p, /portion/)
    assert.ok(!p.includes('Nasi putih (white rice)') && !p.includes('Sayur lodeh;') && !/"match"/.test(p), 'no food list or match field')
  }
  assert.match(sp, /trust it over what the photo/)
  // v1.6.1: photo prompt looks for a size reference before any grams; text-only prompt has none of that.
  assert.match(sp, /before guessing any grams, look in and around the photo for a size reference/)
  for (const w of ['spoon or fork (about 15 to 18 cm long', 'tablespoon bowl holds about 15 ml', 'hand or fingers', 'chopsticks', 'phone', 'plate or bowl rim', 'standard 25 cm dinner plate', 'lower confidence', 'scale_ref']) assert.ok(sp.includes(w), w)
  assert.ok(!/size reference|25 cm/.test(st), 'text-only prompt unchanged by the size rule')
  assert.match(st, /"scale_ref": ""/); assert.match(st, /no photo/i); assert.match(st, /typical Indonesian portion/)
  assert.match(ai.userPrompt('Half portion, fried', true), /My note: Half portion, fried/)
  assert.match(ai.userPrompt('2 slices martabak manis', false), /^What I ate: 2 slices martabak manis/)
  assert.ok(ai.ESTIMATE_SCHEMA.properties.items.items.properties.portion && !ai.ESTIMATE_SCHEMA.properties.items.items.properties.match)
  assert.deepEqual(ai.PROVIDERS, ['gemini', 'openai']); assert.equal(ai.DEFAULT_PROVIDER, 'gemini')
  assert.equal(ai.MODELS.gemini, 'gemini-3.5-flash-lite'); assert.equal(ai.MODELS.openai, 'gpt-6-luna')
  const o = ai.openaiBody('data:image/jpeg;base64,AAAA', 'Shared')
  assert.equal(o.model, 'gpt-6-luna'); assert.equal(o.response_format.json_schema.strict, true); assert.equal(o.messages[1].content[1].image_url.url, 'data:image/jpeg;base64,AAAA')
  const g = ai.geminiBody('data:image/jpeg;base64,AAAA', 'Shared')
  assert.equal(g.contents[0].parts[0].inlineData.data, 'AAAA'); assert.equal(g.generationConfig.responseFormat.text.mimeType, 'APPLICATION_JSON')
})

await t('v1.6 text-only requests have no image part (both providers)', () => {
  const g = ai.geminiBody(null, 'nasi padang with rendang and egg')
  assert.deepEqual(g.contents[0].parts, [{ text: 'What I ate: nasi padang with rendang and egg\nEstimate this meal.' }])
  assert.ok(!JSON.stringify(g).includes('inlineData')); assert.match(g.systemInstruction.parts[0].text, /There is no photo/)
  const o = ai.openaiBody(null, 'nasi padang')
  assert.equal(o.messages[1].content.length, 1); assert.equal(o.messages[1].content[0].type, 'text'); assert.ok(!JSON.stringify(o).includes('image_url'))
})

const res = (status, body, ok = status < 300) => ({ ok, status, text: async () => (typeof body === 'string' ? body : JSON.stringify(body)), json: async () => (typeof body === 'string' ? JSON.parse(body) : body) })
const S = { gemini: { provider: 'gemini', key: 'AIza-test' }, openai: { provider: 'openai', key: 'sk-test' } }
const okText = '{"dish":"Nasi campur","items":[{"name":"Rice","portion":"1 plate","grams":150,"kcal":190,"protein_g":4,"carbs_g":40,"fat_g":0.4,"confidence":0.7}]}'
const kind = async (p) => { try { await p; return 'ok' } catch (e) { return e.kind ?? e.message } }

await t('estimateMeal: success, no food, unreadable, wrong key, busy, offline, for both providers', async () => {
  const gem = (r) => async (url, init) => { assert.match(url, /gemini-3\.5-flash-lite:generateContent$/); assert.equal(init.headers['x-goog-api-key'], 'AIza-test'); assert.equal(init.credentials, 'omit'); return typeof r === 'function' ? r() : r }
  const est = await ai.estimateMeal(S.gemini, 'data:image/jpeg;base64,AAAA', '', { fetch: gem(res(200, { candidates: [{ content: { parts: [{ text: okText }] } }] })) })
  assert.equal(est.items[0].name, 'Rice'); assert.equal(est.items[0].portion, '1 plate')
  // Text only: no image in the body; empty text and no photo never calls out.
  let body = null
  await ai.estimateMeal(S.gemini, null, 'soto ayam', { fetch: async (u, i) => { body = JSON.parse(i.body); return res(200, { candidates: [{ content: { parts: [{ text: okText }] } }] }) } })
  assert.equal(body.contents[0].parts.length, 1); assert.match(body.contents[0].parts[0].text, /soto ayam/)
  let called = false
  assert.equal(await kind(ai.estimateMeal(S.gemini, null, '  ', { fetch: async () => { called = true; return res(200, {}) } })), 'noFood'); assert.equal(called, false)
  assert.equal(await kind(ai.estimateMeal(S.gemini, 'x', '', { fetch: gem(res(200, { candidates: [{ content: { parts: [{ text: '{"dish":"","items":[]}' }] } }] })) })), 'noFood')
  assert.equal(await kind(ai.estimateMeal(S.gemini, 'x', '', { fetch: gem(res(200, { candidates: [{ content: { parts: [{ text: 'lol no' }] } }] })) })), 'failed')
  assert.equal(await kind(ai.estimateMeal(S.gemini, 'x', '', { fetch: gem(res(400, { error: { code: 400, message: 'API key not valid.', status: 'INVALID_ARGUMENT', details: [{ reason: 'API_KEY_INVALID' }] } })) })), 'key')
  assert.equal(await kind(ai.estimateMeal(S.gemini, 'x', '', { fetch: gem(res(403, { error: { status: 'PERMISSION_DENIED' } })) })), 'key')
  assert.equal(await kind(ai.estimateMeal(S.gemini, 'x', '', { fetch: gem(res(429, { error: { status: 'RESOURCE_EXHAUSTED' } })) })), 'busy')
  assert.equal(await kind(ai.estimateMeal(S.gemini, 'x', '', { fetch: gem(() => { throw new TypeError('Failed to fetch') }) })), 'offline')
  assert.equal(await kind(ai.estimateMeal(S.gemini, 'x', '', { fetch: gem(res(200, { promptFeedback: { blockReason: 'OTHER' } })) })), 'noFood')

  const oai = (r, probe) => async (url, init) => {
    if (url.endsWith('/models')) return probe()
    assert.equal(url, 'https://api.openai.com/v1/chat/completions'); assert.equal(init.headers.Authorization, 'Bearer sk-test')
    return typeof r === 'function' ? r() : r
  }
  assert.equal((await ai.estimateMeal(S.openai, 'x', 'Shared', { fetch: oai(res(200, { choices: [{ message: { content: okText } }] })) })).dish, 'Nasi campur')
  assert.equal(await kind(ai.estimateMeal(S.openai, 'x', '', { fetch: oai(res(401, { error: { code: 'invalid_api_key' } })) })), 'key')
  assert.equal(await kind(ai.estimateMeal(S.openai, 'x', '', { fetch: oai(res(429, { error: { code: 'insufficient_quota' } })) })), 'busy')
  // Real OpenAI 401s on /chat/completions carry no CORS header, so the browser only sees a network error. The /models probe tells us.
  const cors = () => { throw new TypeError('Failed to fetch') }
  assert.equal(await kind(ai.estimateMeal(S.openai, 'x', '', { fetch: oai(cors, () => res(401, {})) })), 'key')
  assert.equal(await kind(ai.estimateMeal(S.openai, 'x', '', { fetch: oai(cors, () => res(200, { data: [] })) })), 'failed')
  assert.equal(await kind(ai.estimateMeal(S.openai, 'x', '', { fetch: oai(cors, cors) })), 'offline')
  assert.equal(await kind(ai.estimateMeal(S.openai, 'x', '', { fetch: oai(res(200, { choices: [{ message: { refusal: 'no' } }] })) })), 'noFood')
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

// ---------- v1.20 Meal Ideas ----------
await t('v1.20 parseIdeas clamps like the estimate parser (name 60, grams 1 to 3000, kcal 10,000, macros >= 0) and keeps why under 40', () => {
  const r = ideas.parseIdeas('```json\n' + JSON.stringify({ ideas: [
    { name: 'x'.repeat(80), why: 'A very long reason that goes on and on past forty chars', portion: '1 plate', grams: 380, kcal: 99999, protein_g: -3, carbs_g: '52 g', fat_g: 12 },
    { name: 'No grams', why: '', portion: '', grams: 0, kcal: 100, protein_g: 1, carbs_g: 1, fat_g: 1 },
    { name: '', why: 'x', portion: '', grams: 100, kcal: 100, protein_g: 1, carbs_g: 1, fat_g: 1 },
  ] }) + '\n```')
  assert.equal(r.length, 1)
  assert.equal(r[0].name.length, 60)
  assert.equal(r[0].kcal, 10000)
  assert.equal(r[0].protein, 0)
  assert.equal(r[0].carbs, 52)
  assert.ok(r[0].why.length < 40, r[0].why)
  assert.equal(ideas.parseIdeas('nope'), null)
})
await t('v1.20 keepIdeas drops over-cap, repeats and already-shown, keeps 3', () => {
  const mk = (name, kcal) => ({ name, kcal, why: '', portion: '1', grams: 100, protein: 10, carbs: 1, fat: 1, confidence: 0.5 })
  const k = ideas.keepIdeas([mk('A', 700), mk('B', 400), mk('b', 300), mk('C', 598), mk('Shown', 100), mk('D', 200), mk('E', 100)], 598, ['shown'])
  assert.deepEqual(k.map((x) => x.name), ['B', 'C', 'D'])
})
await t('v1.20 ideasView: Lose under goal, Lose past (orange), Lose surplus (red), Keep band/surplus, Gain above goal', () => {
  // Lose goal 606, balance 1204 = 598 left.
  assert.deepEqual(ideas.ideasView(1204, 606), { over: false, cap: 598, head: '598 kcal left', term: null })
  const past = ideas.ideasView(486, 606)
  assert.deepEqual([past.over, past.cap, past.head, past.term.text, past.term.ink], [true, 150, '120 kcal over your 606 goal', 'Deficit 486', 'text-over-ink'])
  const sur = ideas.ideasView(-80, 606)
  assert.deepEqual([sur.over, sur.term.text, sur.term.ink], [true, 'Surplus 80', 'text-deep-ink'])
  const even = ideas.ideasView(0, 606)
  assert.deepEqual([even.over, even.term.text], [true, 'Even 0'])
  assert.equal(ideas.ideasView(20, 0).over, false) // Keep in band: normal link
  assert.equal(ideas.ideasView(20, 0).head, 'On target')
  assert.equal(ideas.ideasView(-300, 0).over, true) // Keep surplus
  assert.equal(ideas.ideasView(-400, -300).over, false) // Gain above goal: normal link (assumption c)
  assert.deepEqual(ideas.ideasView(-100, -300), { over: false, cap: 200, head: '200 kcal left', term: null })
})
await t('v1.20 ideas request: same provider + model as the estimate, schema fields match the estimate items, only kcal left / protein / foods today / time', () => {
  const ask = { meal: 'dinner', time: '18:30', cap: 598, over: false, kcalLeft: 598, proteinToGo: 68, eatenToday: ['Kopi susu', 'Nasi uduk'], prefs: [], avoid: [] }
  const g = ideas.ideasBody('gemini', ask), o = ideas.ideasBody('openai', ask)
  assert.equal(o.model, ai.MODELS.openai)
  assert.equal(o.response_format.json_schema.schema, ideas.IDEAS_SCHEMA)
  assert.equal(g.generationConfig.responseFormat.text.schema, ideas.IDEAS_SCHEMA)
  assert.deepEqual(ideas.IDEAS_SCHEMA.properties.ideas.items.required, ['name', 'why', 'portion', 'grams', 'kcal', 'protein_g', 'carbs_g', 'fat_g'])
  const u = ideas.ideasUser(ask)
  assert.match(u, /18:30/); assert.match(u, /598 kcal/); assert.match(u, /68 g/); assert.match(u, /Kopi susu, Nasi uduk/)
  assert.doesNotMatch(u + ideas.ideasSystem(), /body weight|\bage\b|\bkg\b|weigh-in|your weight|\bmale\b|female|years old/i)
  assert.match(ideas.ideasUser({ ...ask, proteinToGo: null }), /already hit/)
  assert.match(ideas.ideasUser({ ...ask, prefs: ['Indonesian'], avoid: ['Ayam bakar'] }), /Indonesian[\s\S]*Ayam bakar/)
})
await t('v1.20 askIdeas posts to the chosen provider and model and keeps 3 under the cap', async () => {
  const calls = []
  const reply = { ideas: [1, 2, 3, 4].map((n) => ({ name: `Idea ${n}`, why: 'w', portion: '1 plate', grams: 300, kcal: n * 200, protein_g: 20, carbs_g: 30, fat_g: 10 })) }
  const f = async (url, init) => { calls.push({ url, init }); return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(reply) }] } }] }), { status: 200 }) }
  const r = await ideas.askIdeas({ provider: 'gemini', key: 'k' }, { meal: 'lunch', time: '12:00', cap: 598, over: false, kcalLeft: 598, proteinToGo: 10, eatenToday: [], prefs: [], avoid: [] }, { fetch: f })
  assert.deepEqual(r.map((x) => x.name), ['Idea 1', 'Idea 2'])
  assert.equal(calls[0].url, `${ai.GEMINI_BASE}/models/${ai.MODELS.gemini}:generateContent`)
  const fo = async (url, init) => { calls.push({ url, init }); return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(reply) } }] }), { status: 200 }) }
  await ideas.askIdeas({ provider: 'openai', key: 'k' }, { meal: 'lunch', time: '12:00', cap: 598, over: false, kcalLeft: 598, proteinToGo: 10, eatenToday: [], prefs: [], avoid: [] }, { fetch: fo })
  assert.equal(calls[1].url, `${ai.OPENAI_BASE}/chat/completions`)
  assert.equal(JSON.parse(calls[1].init.body).model, ai.MODELS.openai)
  const bad = async () => new Response('{}', { status: 429 })
  await assert.rejects(ideas.askIdeas({ provider: 'gemini', key: 'k' }, { meal: 'lunch', time: '12:00', cap: 598, over: false, kcalLeft: 598, proteinToGo: 10, eatenToday: [], prefs: [], avoid: [] }, { fetch: bad }), (e) => e.kind === 'busy')
})
await t('v1.20 local picks: fit the cap, nothing eaten today, no drinks, one per category and main protein, Favourites then recents then Indonesian', () => {
  const c = (id, name, kcal, protein, category, extra = {}) => ({ id, name, kcal, protein, category, serving: '1', fav: false, recent: -1, mine: false, ...extra })
  const cands = [
    c('a', 'Ayam bakar', 165, 25, 'Indonesian'), c('b', 'Ayam goreng', 260, 20, 'Indonesian'), c('t', 'Tempe goreng', 120, 8, 'Indonesian'),
    c('f', 'Pepes ikan', 180, 24, 'Protein'), c('g', 'Grilled chicken', 250, 46, 'Protein'), c('e', 'Telur rebus', 78, 6, 'Breakfast'),
    c('w', 'Whey protein shake', 120, 24, 'Drinks'), c('big', 'Nasi padang', 900, 30, 'Meals'), c('u_x', 'My salad', 300, 10, 'My foods', { fav: true, mine: true }),
  ]
  const p = ideas.localPicks(cands, { cap: 598, proteinHit: false, eatenIds: new Set(['b']), eatenNames: new Set(), n: 3 })
  const opts = { cap: 598, proteinHit: false, eatenIds: new Set(), eatenNames: new Set(), n: 3 }
  const base = ideas.localPicks(cands, opts).map((x) => x.id)
  assert.notEqual(base[0], 't')
  assert.equal(ideas.localPicks(cands.map((x) => ({ ...x, fav: x.id === 't' })), opts)[0].id, 't', 'a favourite is boosted to the top')
  assert.ok(p.every((x) => x.kcal <= 598 && x.category !== 'Drinks' && x.id !== 'b'))
  assert.equal(new Set(p.map((x) => x.category)).size, 3)
  const prots = p.map((x) => ideas.mainProtein(x.name)).filter(Boolean)
  assert.equal(new Set(prots).size, prots.length)
  const light = ideas.localPicks(cands, { cap: 150, proteinHit: false, eatenIds: new Set(), eatenNames: new Set(['telur rebus']), n: 3 })
  assert.ok(light.every((x) => x.kcal <= 150 && x.id !== 'e'))
  const plain = cands.map((x) => ({ ...x, fav: false }))
  assert.ok(!ideas.localPicks(plain, opts).some((x) => x.id === 'e'))
  assert.ok(ideas.localPicks(plain.map((x) => ({ ...x, recent: x.id === 'e' ? 0 : -1 })), opts).some((x) => x.id === 'e'), 'a recent food is boosted in')
})
await t('v1.20 "Show other ideas" counter (v1.21: 7 a day) in calorie-app:ideas, resets the next day, never in backups', () => {
  store.clear()
  assert.equal(ideas.refreshesUsed('2026-11-02'), 0)
  assert.equal(ideas.MAX_REFRESH, 7)
  for (let i = 0; i < 7; i++) ideas.countRefresh('2026-11-02')
  assert.equal(ideas.refreshesUsed('2026-11-02'), ideas.MAX_REFRESH)
  assert.equal(ideas.refreshesLeft(ideas.refreshesUsed('2026-11-02')), 0)
  assert.equal(ideas.refreshesUsed('2026-11-03'), 0)
  store.set('calorie-app:v3', JSON.stringify({ version: 3, profile: null, entries: [], exercises: [], closedDays: {}, favourites: [] }))
  const text = JSON.stringify(backup.makeBackup())
  assert.doesNotMatch(text, /calorie-app:ideas/)
  assert.equal(backup.IDEAS_COUNT_KEY, ideas.IDEAS_KEY)
  store.clear()
})

await t('v1.20.1 Custom chip text: trim, collapse whitespace, strip control and invisible characters, 60 max', () => {
  assert.equal(ideas.CUSTOM_MAX, 60)
  assert.equal(ideas.cleanCustom('  noodles,\n\t spicy   '), 'noodles, spicy')
  assert.equal(ideas.cleanCustom('no\u0000rice\u0007\u001b[31m'), 'no rice [31m')
  assert.equal(ideas.cleanCustom('soto\u200b\u202eayam\u2028\u00a0'), 'soto ayam')
  assert.equal(ideas.cleanCustom(' \n\t '), '')
  const long = ideas.cleanCustom('x'.repeat(59) + ' 🍜🍜')
  assert.equal(Array.from(long).length, 59, 'cut at 60 then trimmed')
  assert.equal(Array.from(ideas.cleanCustom('a'.repeat(58) + '🍜🍜🍜')).length, 60)
  assert.ok(!/[\uD800-\uDBFF]$/.test(ideas.cleanCustom('a'.repeat(59) + '🍜🍜')), 'never splits an emoji')
})
await t('v1.20.1 Custom ask: words go in the request as quoted data, schema adds closest, plain asks unchanged', () => {
  const ask = { meal: 'dinner', time: '18:30', cap: 598, over: false, kcalLeft: 598, proteinToGo: 68, eatenToday: [], prefs: ['Cheap'], avoid: [] }
  assert.doesNotMatch(ideas.ideasUser(ask), /asked for/)
  const u = ideas.ideasUser({ ...ask, custom: 'noodles, "spicy"' })
  assert.match(u, /The user asked for: "noodles, \\"spicy\\""\. Match it/)
  assert.match(u, /cheap[\s\S]*asked for/)
  assert.deepEqual(ideas.IDEAS_SCHEMA.required, ['ideas', 'closest'])
  assert.equal(ideas.IDEAS_SCHEMA.properties.closest.type, 'boolean')
  assert.match(ideas.ideasSystem(), /closest: true only when/)
  assert.equal(JSON.parse(JSON.stringify(ideas.ideasBody('openai', { ...ask, custom: 'noodles' }))).response_format.json_schema.strict, true)
})
await t('v1.20.1 C6 closest fits: 3 that fit the cap, flagged when the model says so or had to go over; never for plain asks', () => {
  const idea = (n, kcal) => ({ name: `Mie ${n}`, why: 'w', portion: '1 bowl', grams: 300, kcal, protein_g: 15, carbs_g: 50, fat_g: 10 })
  const a = { meal: 'dinner', time: '18:30', cap: 400, over: false, kcalLeft: 400, proteinToGo: 20, eatenToday: [], prefs: [], avoid: [], custom: 'noodles' }
  const fit = JSON.stringify({ ideas: [idea(1, 380), idea(2, 350), idea(3, 300), idea(4, 250)], closest: false })
  const r = ideas.readIdeas(fit, a)
  assert.deepEqual(r.ideas.map((i) => i.name), ['Mie 1', 'Mie 2', 'Mie 3']); assert.equal(r.closest, false)
  const said = ideas.readIdeas(JSON.stringify({ ideas: [idea(1, 390), idea(2, 360), idea(3, 320)], closest: true }), a)
  assert.equal(said.closest, true); assert.equal(said.ideas.length, 3)
  const over = ideas.readIdeas(JSON.stringify({ ideas: [idea(1, 650), idea(2, 390), idea(3, 360), idea(4, 320)], closest: false }), a)
  assert.equal(over.closest, true, 'had to drop one over the cap')
  assert.deepEqual(over.ideas.map((i) => i.kcal), [390, 360, 320])
  assert.ok(over.ideas.every((i) => i.kcal <= a.cap))
  const plain = ideas.readIdeas(JSON.stringify({ ideas: [idea(1, 650), idea(2, 390)], closest: true }), { ...a, custom: undefined })
  assert.equal(plain.closest, false)
  assert.equal(ideas.readIdeas('nope', a), null)
})

if (process.env.LIVE) await t('LIVE: Gemini accepts our request body (fake key reaches the key check)', async () => {
  const r = await fetch(`${ai.GEMINI_BASE}/models/${ai.MODELS.gemini}:generateContent`, { method: 'POST', headers: { 'x-goog-api-key': 'AIzaFakeKeyForShapeCheck', 'Content-Type': 'application/json' }, body: JSON.stringify(ai.geminiBody('data:image/jpeg;base64,/9j/4AAQ', 'Shared')) })
  const body = await r.text()
  assert.match(body, /API_KEY_INVALID/, body.slice(0, 300))
})

console.log(results.join('\n'))
console.log(`\n${results.length} AI checks passed`)
