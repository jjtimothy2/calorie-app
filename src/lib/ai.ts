// v1.5: AI photo estimate with the user's own API key ("bring your own key").
// v1.6: photo optional (text, photo or both); the AI's numbers are always used, our food list only picks the emoji.
// Pure module (no React, no runtime imports) so unit tests can compile and run it on Node.
// The key lives in its own localStorage entry, never inside calorie-app:v2, never in a backup, never logged.
import type { Food } from '../data/foods'

export type Provider = 'openai' | 'gemini'
export type AiSettings = { provider: Provider; key: string }

/** Device-only storage key. backup.ts skips it on export and on restore. */
export const AI_KEY = 'calorie-app:ai'

/** Change the model here. Both are current, vision-capable and cheap (checked against the providers' docs, Oct 2026). */
export const MODELS: Record<Provider, string> = {
  gemini: 'gemini-3.5-flash-lite', // free tier in Google AI Studio; paid $0.30 in / $2.50 out per 1M tokens
  openai: 'gpt-6-luna', // $0.10 in / $0.50 out per 1M tokens
}
export const PROVIDER_LABEL: Record<Provider, string> = { gemini: 'Gemini', openai: 'OpenAI' }
/** Picker order; Gemini is the default (its Flash-Lite model is on Google AI Studio's free tier). */
export const PROVIDERS: Provider[] = ['gemini', 'openai']
export const DEFAULT_PROVIDER: Provider = 'gemini'
export const KEY_URL: Record<Provider, string> = {
  openai: 'https://platform.openai.com/api-keys',
  gemini: 'https://aistudio.google.com/apikey',
}
export const OPENAI_BASE = 'https://api.openai.com/v1'
export const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta'
const TIMEOUT_MS = 45_000

export function readAi(): AiSettings | null {
  try {
    const j = JSON.parse(localStorage.getItem(AI_KEY) ?? 'null')
    if (j && (j.provider === 'openai' || j.provider === 'gemini') && typeof j.key === 'string' && j.key.trim()) return { provider: j.provider, key: j.key.trim() }
  } catch { /* ignore */ }
  return null
}
export function saveAi(s: AiSettings) { localStorage.setItem(AI_KEY, JSON.stringify({ provider: s.provider, key: s.key.trim() })) }
export function clearAi() { localStorage.removeItem(AI_KEY) }

// ---------- Errors ----------
export type AiErrorKind = 'key' | 'offline' | 'busy' | 'noFood' | 'failed' | 'model'
export class AiError extends Error {
  kind: AiErrorKind
  constructor(kind: AiErrorKind) { super(kind); this.kind = kind; this.name = 'AiError' }
}
/** Plain words for each error. Never includes the provider's own message (OpenAI echoes part of the key back). */
export function errorText(kind: AiErrorKind, provider: Provider): { title: string; body: string } {
  const p = PROVIDER_LABEL[provider]
  switch (kind) {
    case 'key': return { title: 'Your key didn’t work', body: `${p} said the API key is wrong or turned off. Check it in Me › AI photo estimate.` }
    case 'offline': return { title: 'No internet', body: 'Your meal couldn’t be sent. Check your connection and try again.' }
    case 'busy': return { title: `${p} is busy`, body: `Too many requests, or your ${p} account is out of credit. Wait a minute and try again.` }
    case 'noFood': return { title: 'No food found', body: 'The AI couldn’t find any food in that. Describe what you ate in a few words, or try a closer, brighter photo.' }
    case 'model': return { title: 'Model not available', body: `This ${p} key can’t use ${MODELS[provider]}. Check the key’s project or billing.` }
    default: return { title: 'Something went wrong', body: `${p} sent an answer we couldn’t read. Try again.` }
  }
}

// ---------- Prompt ----------
export const ESTIMATE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['dish', 'scale_ref', 'items'],
  properties: {
    dish: { type: 'string', description: 'Short name for the whole meal, e.g. Nasi campur' },
    // v1.6.1: the size reference the model used. Parsed leniently (older answers have none); shown as "Sized using: …".
    scale_ref: { type: 'string', description: 'The size reference used for grams in 1 to 3 words, e.g. "spoon", "hand", "plate rim"; empty string when there is none or no photo' },
    items: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'portion', 'grams', 'kcal', 'protein_g', 'carbs_g', 'fat_g', 'confidence'],
        properties: {
          name: { type: 'string' },
          portion: { type: 'string', description: 'Short everyday portion for these grams, e.g. "1 plate", "2 pieces", "1 tbsp", or empty string' },
          grams: { type: 'number' },
          kcal: { type: 'number' },
          protein_g: { type: 'number' },
          carbs_g: { type: 'number' },
          fat_g: { type: 'number' },
          confidence: { type: 'number', description: '0 to 1' },
        },
      },
    },
  },
} as const

/** v1.6: one prompt for photo, text or both. No food list is sent; the AI's own numbers are used as they are. */
export function systemPrompt(hasPhoto: boolean) {
  return [
    'You are a careful nutritionist estimating a meal for a calorie counter used mostly in Indonesia.',
    hasPhoto
      ? 'You get a photo of the meal and maybe a note from the user. The note is the user’s own words about what they ate: trust it over what the photo seems to show, and use it for anything the photo can’t show (hidden fillings, cooking method, how much was eaten).'
      : 'There is no photo. The user’s description is the whole meal: list exactly the foods it names, with the amounts it gives. When no amount is given, use a typical Indonesian portion (e.g. warung or warteg plate, one piece of gorengan, one porsi as sold by street vendors), not a Western or restaurant portion.',
    ...(hasPhoto ? [
      'Size first: before guessing any grams, look in and around the photo for a size reference and judge every portion against it: a spoon or fork (about 15 to 18 cm long; a tablespoon bowl holds about 15 ml), a hand or fingers, chopsticks (about 20 to 23 cm), a phone (about 15 cm), a cup or glass, or the plate or bowl rim.',
      'If there is no reference, assume a standard 25 cm dinner plate, use typical Indonesian portions, and lower confidence. Put the reference you used in scale_ref in 1 to 3 words, e.g. "spoon", "hand", "chopsticks", "plate rim"; use an empty string when there was none.',
    ] : []),
    'Meals are often Indonesian: nasi campur, nasi padang, warteg plates, gorengan, sate, bakso, mie ayam, martabak, sambal, santan (coconut milk) curries, krupuk.',
    'Be accurate rather than low. Count what is easy to miss: frying oil soaked into gorengan, ayam goreng, tempe and tahu goreng and fried rice or noodles; santan in gulai, rendang, opor, sayur lodeh and nasi uduk; sweet kecap, peanut sauce, sambal and oil-based sauces; sugar in drinks and desserts; margarine and condensed milk on martabak manis.',
    'Rice: a plain warung portion of nasi putih is about 150 to 200 g cooked (about 200 to 260 kcal); a nasi padang or warteg plate often has more.',
    'List each separate food as its own item (rice, each side, sambal, krupuk, drinks). grams is the portion actually eaten. kcal, protein_g, carbs_g and fat_g are for those grams. portion is a short everyday description of those grams, e.g. "1 plate", "2 pieces", "1 tbsp", "1 glass", or an empty string.',
    'Follow the note: "Shared" means only the user’s share (about half unless the note says otherwise), "Half eaten" means half the portion, "Extra sambal" means more sambal, "Santan" means the dish is cooked with coconut milk, "No rice" means leave rice out.',
    hasPhoto ? 'If there is no food in the photo or note, return an empty items array.' : 'If the description is not food, return an empty items array.',
    hasPhoto ? 'Answer with JSON only: {"dish": string, "scale_ref": string, "items": [{"name", "portion", "grams", "kcal", "protein_g", "carbs_g", "fat_g", "confidence"}]}.' : 'Answer with JSON only: {"dish": string, "scale_ref": "", "items": [{"name", "portion", "grams", "kcal", "protein_g", "carbs_g", "fat_g", "confidence"}]}.',
  ].join('\n')
}
export function userPrompt(note: string, hasPhoto: boolean) {
  const t = note.trim()
  if (!hasPhoto) return `What I ate: ${t}\nEstimate this meal.`
  return (t ? `My note: ${t}` : 'No note.') + '\nEstimate this meal.'
}

/** v1.6.1: the results line about size. Photo only: "Sized using: spoon", or the no-reference line. Text only: nothing. */
export const NO_SCALE_REF = 'No size reference, portions are a guess'
export function scaleLine(scaleRef: string, hasPhoto: boolean): string | null {
  if (!hasPhoto) return null
  const r = scaleRef.trim().replace(/[.\s]+$/, '')
  if (!r || /^(none|no\b|n\/a|unknown|not\b|nothing|-)/i.test(r)) return NO_SCALE_REF
  return `Sized using: ${r.length > 32 ? r.slice(0, 31).trimEnd() + '…' : r}`
}

/** Chip tap: append to the note (or take it out again), comma separated. */
export function toggleNoteChip(note: string, chip: string): string {
  const parts = note.split(',').map((s) => s.trim()).filter(Boolean)
  const i = parts.findIndex((p) => p.toLowerCase() === chip.toLowerCase())
  if (i >= 0) parts.splice(i, 1)
  else parts.push(chip)
  return parts.join(', ')
}
export const noteHas = (note: string, chip: string) => note.split(',').some((p) => p.trim().toLowerCase() === chip.toLowerCase())

// ---------- Parsing ----------
export type AiItem = { name: string; portion: string; grams: number; kcal: number; protein: number; carbs: number; fat: number; confidence: number }
/** scaleRef (v1.6.1): the size reference the model says it used ('' when missing or none). */
export type AiEstimate = { dish: string; scaleRef: string; items: AiItem[] }

const num = (v: unknown) => (typeof v === 'number' ? v : typeof v === 'string' ? Number(v.replace(/[^0-9.]/g, '')) : NaN)

/** Reads the model's text into a clean estimate. Tolerates ```json fences and stray prose. null = unreadable. */
export function parseEstimate(text: string): AiEstimate | null {
  if (typeof text !== 'string') return null
  let s = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim()
  let j: unknown
  try { j = JSON.parse(s) } catch {
    const a = s.indexOf('{'), b = s.lastIndexOf('}')
    if (a < 0 || b <= a) return null
    s = s.slice(a, b + 1)
    try { j = JSON.parse(s) } catch { return null }
  }
  if (Array.isArray(j)) j = { dish: '', items: j }
  if (typeof j !== 'object' || j === null) return null
  const o = j as Record<string, unknown>
  const raw = Array.isArray(o.items) ? o.items : Array.isArray(o.foods) ? o.foods : null
  if (!raw) return null
  const items: AiItem[] = []
  for (const r of raw) {
    if (typeof r !== 'object' || r === null) continue
    const x = r as Record<string, unknown>
    const name = typeof x.name === 'string' ? x.name.trim().slice(0, 60) : ''
    const grams = Math.round(num(x.grams))
    if (!name || !Number.isFinite(grams) || grams <= 0 || grams > 3000) continue
    const k = num(x.kcal)
    const g = (v: unknown) => { const n = num(v); return Number.isFinite(n) && n >= 0 ? n : 0 }
    const conf = num(x.confidence)
    items.push({
      name,
      portion: typeof x.portion === 'string' ? x.portion.trim().slice(0, 30) : '',
      grams,
      kcal: Number.isFinite(k) && k >= 0 ? Math.min(k, 10000) : 0,
      protein: g(x.protein_g ?? x.protein),
      carbs: g(x.carbs_g ?? x.carbs),
      fat: g(x.fat_g ?? x.fat),
      confidence: Number.isFinite(conf) ? Math.max(0, Math.min(1, conf > 1 ? conf / 100 : conf)) : 0.5,
    })
  }
  const dish = typeof o.dish === 'string' && o.dish.trim() ? o.dish.trim().slice(0, 40) : ''
  const scaleRef = typeof o.scale_ref === 'string' ? o.scale_ref.trim().slice(0, 80) : ''
  return { dish, scaleRef, items }
}

// ---------- Food list: emoji only (v1.6) ----------
export const normName = (s: string) =>
  s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

/** A few everyday words the AI uses for list foods. Keys and values are normalised names. */
const ALIASES: Record<string, string> = {
  'rice': 'nasi putih',
  'steamed rice': 'nasi putih',
  'plain rice': 'nasi putih',
  'fried rice': 'nasi goreng',
  'fried chicken': 'ayam goreng',
  'grilled chicken': 'ayam bakar',
  'chili sauce': 'sambal',
  'chilli sauce': 'sambal',
  'chili paste': 'sambal',
  'fried tempeh': 'tempe goreng',
  'tempeh': 'tempe goreng',
  'fried tofu': 'tahu goreng',
  'crackers': 'kerupuk',
  'krupuk': 'kerupuk',
  'prawn crackers': 'kerupuk',
  'water spinach': 'kangkung tumis',
  'kangkung': 'kangkung tumis',
  'fried banana': 'pisang goreng',
  'iced sweet tea': 'es teh manis',
}

/** Names a food answers to: the full name, the part before "(" or ",", and the part in brackets. */
function namesOf(f: Food): string[] {
  const full = normName(f.name)
  const main = normName(f.name.split(/[(,]/)[0])
  const inner = /\(([^)]+)\)/.exec(f.name)?.[1]
  return [...new Set([full, main, ...(inner ? [normName(inner)] : [])])].filter(Boolean)
}

/** v1.6: used only to pick an emoji. Our food for an AI name: same name, then an alias, then the longest list name inside the AI's name. */
export function matchFood(item: Pick<AiItem, 'name'>, foods: Food[]): Food | null {
  const byName = new Map<string, Food>()
  for (const f of foods) for (const n of namesOf(f)) if (!byName.has(n)) byName.set(n, f)
  const n = normName(item.name)
  if (!n) return null
  if (byName.has(n)) return byName.get(n)!
  if (ALIASES[n] && byName.has(ALIASES[n])) return byName.get(ALIASES[n])!
  // Phrase containment, e.g. "Sayur lodeh with santan" -> Sayur lodeh, "Sambal terasi" -> Sambal.
  let best: { f: Food; len: number } | null = null
  const hay = ` ${n} `
  for (const f of foods) {
    const main = normName(f.name.split(/[(,]/)[0])
    if (main.length >= 4 && hay.includes(` ${main} `) && (!best || main.length > best.len)) best = { f, len: main.length }
  }
  if (best) return best.f
  for (const [alias, target] of Object.entries(ALIASES)) {
    if (alias.length >= 4 && hay.includes(` ${alias} `) && byName.has(target)) return byName.get(target)!
  }
  return null
}

/** One row on the results sheet. v1.6: always the AI's own numbers; the stepper scales them per gram of the AI's grams. */
export type PhotoItem = { key: string; name: string; grams: number; emojiName: string; ai: AiItem }
export type PhotoMacros = { kcal: number; protein: number; carbs: number; fat: number }
export function toPhotoItems(est: AiEstimate, foods: Food[]): PhotoItem[] {
  return est.items.map((ai, i) => ({ key: `${i}-${ai.name}`, name: ai.name, grams: ai.grams, emojiName: matchFood(ai, foods)?.name ?? ai.name, ai }))
}
export function itemMacros(it: Pick<PhotoItem, 'ai'>, grams: number): PhotoMacros {
  const r = grams / it.ai.grams
  return { kcal: it.ai.kcal * r, protein: it.ai.protein * r, carbs: it.ai.carbs * r, fat: it.ai.fat * r }
}
/** Stepper size: 5 g for small items (sambal), 10 g otherwise. */
export const gramStep = (g: number) => (g < 50 ? 5 : 10)

/** v1.6: the AI's own portion words ("1 plate"). Shown only at the AI's grams; once the stepper moves, the grams say it. */
export function portionLabel(it: Pick<PhotoItem, 'ai'>, grams: number): string {
  return grams === it.ai.grams ? it.ai.portion : ''
}

// ---------- Requests ----------
/** v1.6: photo is optional. With no photo, the request has no image part at all. */
export function openaiBody(dataUrl: string | null, note: string) {
  const text = { type: 'text', text: userPrompt(note, !!dataUrl) }
  return {
    model: MODELS.openai,
    reasoning_effort: 'low',
    messages: [
      { role: 'system', content: systemPrompt(!!dataUrl) },
      { role: 'user', content: dataUrl ? [text, { type: 'image_url', image_url: { url: dataUrl, detail: 'high' } }] : [text] },
    ],
    response_format: { type: 'json_schema', json_schema: { name: 'meal_estimate', strict: true, schema: ESTIMATE_SCHEMA } },
  }
}
export function geminiBody(dataUrl: string | null, note: string) {
  const text = { text: userPrompt(note, !!dataUrl) }
  return {
    systemInstruction: { parts: [{ text: systemPrompt(!!dataUrl) }] },
    contents: [{ role: 'user', parts: dataUrl ? [{ inlineData: { mimeType: 'image/jpeg', data: dataUrl.replace(/^data:[^,]*,/, '') } }, text] : [text] }],
    generationConfig: { temperature: 0.2, responseFormat: { text: { mimeType: 'APPLICATION_JSON', schema: ESTIMATE_SCHEMA } } },
  }
}

type Fetch = typeof fetch
const online = () => typeof navigator === 'undefined' || navigator.onLine !== false

async function send(f: Fetch, url: string, init: RequestInit, signal?: AbortSignal): Promise<Response> {
  const ctl = new AbortController()
  const t = setTimeout(() => ctl.abort(), TIMEOUT_MS)
  const onAbort = () => ctl.abort()
  signal?.addEventListener('abort', onAbort)
  try {
    return await f(url, { ...init, signal: ctl.signal, cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer' })
  } finally { clearTimeout(t); signal?.removeEventListener('abort', onAbort) }
}

/** HTTP status (and body) to an error kind. */
export async function classify(provider: Provider, res: Response): Promise<AiErrorKind> {
  let body = ''
  try { body = await res.text() } catch { /* ignore */ }
  if (res.status === 401 || res.status === 403) return 'key'
  if (provider === 'gemini' && res.status === 400 && /API_KEY_INVALID|API key not valid|API_KEY/i.test(body)) return 'key'
  if (res.status === 404) return 'model'
  if (res.status === 429 || res.status >= 500) return 'busy'
  return 'failed'
}

/**
 * OpenAI leaves CORS headers off 401 answers on /chat/completions, so a wrong key looks like a network error to the
 * browser. /v1/models does send them, so ask it which one it was.
 */
async function explainNetworkError(f: Fetch, s: AiSettings): Promise<AiErrorKind> {
  if (!online()) return 'offline'
  if (s.provider !== 'openai') return 'offline'
  try {
    const r = await send(f, `${OPENAI_BASE}/models`, { headers: { Authorization: `Bearer ${s.key}` } })
    return r.ok ? 'failed' : await classify('openai', r)
  } catch { return 'offline' }
}

/** Cheap check that the key works and can use our model: a free model lookup, no tokens spent. */
export async function testKey(s: AiSettings, f: Fetch = fetch): Promise<true> {
  if (!online()) throw new AiError('offline')
  const url = s.provider === 'openai' ? `${OPENAI_BASE}/models/${MODELS.openai}` : `${GEMINI_BASE}/models/${MODELS.gemini}`
  const headers: Record<string, string> = s.provider === 'openai' ? { Authorization: `Bearer ${s.key}` } : { 'x-goog-api-key': s.key }
  let res: Response
  try { res = await send(f, url, { headers }) } catch (e) {
    if ((e as Error)?.name === 'AbortError') throw new AiError('failed')
    throw new AiError(await explainNetworkError(f, s))
  }
  if (!res.ok) throw new AiError(await classify(s.provider, res))
  return true
}

/** Sends the downscaled photo (or none) and the text, returns the parsed estimate. Throws AiError. Nothing is stored. */
export async function estimateMeal(s: AiSettings, dataUrl: string | null, note: string, opts: { signal?: AbortSignal; fetch?: Fetch } = {}): Promise<AiEstimate> {
  const f = opts.fetch ?? fetch
  if (!dataUrl && !note.trim()) throw new AiError('noFood')
  if (!online()) throw new AiError('offline')
  const req: { url: string; headers: Record<string, string>; body: unknown } = s.provider === 'openai'
    ? { url: `${OPENAI_BASE}/chat/completions`, headers: { Authorization: `Bearer ${s.key}`, 'Content-Type': 'application/json' }, body: openaiBody(dataUrl, note) }
    : { url: `${GEMINI_BASE}/models/${MODELS.gemini}:generateContent`, headers: { 'x-goog-api-key': s.key, 'Content-Type': 'application/json' }, body: geminiBody(dataUrl, note) }
  let res: Response
  try {
    res = await send(f, req.url, { method: 'POST', headers: req.headers, body: JSON.stringify(req.body) }, opts.signal)
  } catch (e) {
    if (opts.signal?.aborted) throw e
    if ((e as Error)?.name === 'AbortError') throw new AiError('failed')
    throw new AiError(await explainNetworkError(f, s))
  }
  if (!res.ok) throw new AiError(await classify(s.provider, res))
  let j: Record<string, unknown>
  try { j = await res.json() } catch { throw new AiError('failed') }
  const text = s.provider === 'openai' ? openaiText(j) : geminiText(j)
  if (text == null) throw new AiError('failed')
  const est = parseEstimate(text)
  if (!est) throw new AiError('failed')
  if (!est.items.length) throw new AiError('noFood')
  return est
}

type J = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
export function openaiText(j: J): string | null {
  const msg = j?.choices?.[0]?.message
  if (!msg) return null
  if (typeof msg.refusal === 'string' && msg.refusal) return '{"dish":"","items":[]}'
  return typeof msg.content === 'string' ? msg.content : null
}
export function geminiText(j: J): string | null {
  const c = j?.candidates?.[0]
  if (!c) return j?.promptFeedback?.blockReason ? '{"dish":"","items":[]}' : null
  const parts = c?.content?.parts
  if (!Array.isArray(parts)) return c.finishReason === 'SAFETY' ? '{"dish":"","items":[]}' : null
  return parts.filter((p: J) => typeof p?.text === 'string' && !p.thought).map((p: J) => p.text).join('')
}
