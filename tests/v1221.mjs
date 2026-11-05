// v1.22.1 (Jordy): the "get a key" links in Settings open in the phone's browser, not inside the installed app.
// iOS 17+ standalone: x-safari-https://… (Safari), no target. Android standalone: intent:// VIEW to the browser the
// app runs in, with S.browser_fallback_url. Browser tabs, desktop, iOS 16 standalone: the plain https link with
// target=_blank and the rel it had before. Nothing else in Settings changes: the card's HTML is the same on every
// platform once the link's href/target are set aside (and the same as BASELINE_URL's build, when given).
// WebKit with user agents and a simulated standalone mode. Usage: npx vite preview --port 4174 & node tests/v1221.mjs
import { webkit } from 'playwright'
import assert from 'node:assert/strict'

const BASE = (process.env.BASE_URL ?? 'http://localhost:4174/calorie-app').replace(/\/$/, '')
const BASELINE = process.env.BASELINE_URL?.replace(/\/$/, '')
const results = [], errors = []
const step = async (name, fn) => {
  try { await fn(); results.push(`PASS ${name}`) } catch (e) { results.push(`FAIL ${name}: ${e.message.slice(0, 800)}`); console.log(results.join('\n')); console.log(errors.join('\n')); throw e }
}
const pad = (n) => String(n).padStart(2, '0')
const key = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const ago = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return key(d) }
const profile = { age: 32, sex: 'male', heightCm: 175, weightKg: 92, activity: 'light', goal: 'lose', bmr: 1859, bmrCustom: false, includeMovement: false, goalWeightKg: 85, goalDate: ago(-120), planFrom: { date: ago(0), kg: 92 }, goalAssumed: false, macros: { protein: null, carbs: null, fat: null }, target: 1800, dailyGoal: 500 }
const V3 = JSON.stringify({ version: 3, profile, entries: [], exercises: [], closedDays: {}, favourites: [], weights: [{ date: ago(0), kg: 92 }] })
const UA = {
  ios18: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148',
  ios17: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
  ios16: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148',
  chrome: 'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Mobile Safari/537.36',
  samsung: 'Mozilla/5.0 (Linux; Android 15; SM-S931B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/28.0 Chrome/130.0.0.0 Mobile Safari/537.36',
  desktop: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36',
}
const GEM = 'https://aistudio.google.com/apikey', OAI = 'https://platform.openai.com/api-keys'
const intent = (url, pkg) => `intent://${url.slice(8)}#Intent;scheme=https;action=android.intent.action.VIEW;category=android.intent.category.BROWSABLE;package=${pkg};S.browser_fallback_url=${encodeURIComponent(url)};end`
const plain = (url, rel) => ({ href: url, target: '_blank', rel })
const CASES = [
  // [name, ua, standalone: 'ios' | 'media' | false, gemini link, openai link]
  ['iOS 18 home-screen app', UA.ios18, 'ios', { href: 'x-safari-' + GEM, target: null, rel: 'noopener' }, { href: 'x-safari-' + OAI, target: null, rel: 'noreferrer noopener' }],
  ['iOS 17 home-screen app', UA.ios17, 'ios', { href: 'x-safari-' + GEM, target: null, rel: 'noopener' }, { href: 'x-safari-' + OAI, target: null, rel: 'noreferrer noopener' }],
  ['iOS 16 home-screen app (no x-safari-https)', UA.ios16, 'ios', plain(GEM, 'noopener'), plain(OAI, 'noreferrer noopener')],
  ['iOS Safari tab', UA.ios17, false, plain(GEM, 'noopener'), plain(OAI, 'noreferrer noopener')],
  ['Android Chrome installed app', UA.chrome, 'media', { href: intent(GEM, 'com.android.chrome'), target: null, rel: 'noopener' }, { href: intent(OAI, 'com.android.chrome'), target: null, rel: 'noreferrer noopener' }],
  ['Android Samsung Internet installed app', UA.samsung, 'media', { href: intent(GEM, 'com.sec.android.app.sbrowser'), target: null, rel: 'noopener' }, { href: intent(OAI, 'com.sec.android.app.sbrowser'), target: null, rel: 'noreferrer noopener' }],
  ['Android Chrome tab', UA.chrome, false, plain(GEM, 'noopener'), plain(OAI, 'noreferrer noopener')],
  ['desktop browser', UA.desktop, false, plain(GEM, 'noopener'), plain(OAI, 'noreferrer noopener')],
  ['desktop installed app', UA.desktop, 'media', plain(GEM, 'noopener'), plain(OAI, 'noreferrer noopener')],
]

const browser = await webkit.launch()
const card = async (base, [, ua, standalone]) => {
  const ctx = await browser.newContext({ userAgent: ua, viewport: { width: 390, height: 844 }, serviceWorkers: 'block' })
  await ctx.addInitScript(([v3, mode]) => {
    if (!localStorage.getItem('calorie-app:v3')) {
      localStorage.setItem('calorie-app:v3', v3)
      localStorage.setItem('calorie-app:backup', JSON.stringify({ lastExportAt: Date.now(), dismissedAt: null }))
    }
    if (mode === 'ios') Object.defineProperty(Navigator.prototype, 'standalone', { get: () => true, configurable: true })
    if (mode === 'media') {
      const mm = window.matchMedia.bind(window)
      window.matchMedia = (q) => (/display-mode:\s*standalone/.test(q) ? { matches: true, media: q, onchange: null, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false } : mm(q))
    }
  }, [V3, standalone])
  const page = await ctx.newPage()
  page.on('console', (m) => { if ((m.type() === 'error' || m.type() === 'warning') && !/service worker/i.test(m.text())) errors.push(`${ua.slice(13, 40)}: ${m.type()}: ${m.text()}`) })
  page.on('pageerror', (er) => errors.push(`pageerror: ${er.message}`))
  await page.goto(base + '/settings'); await page.getByTestId('ai-key-link').waitFor()
  const attrs = (loc) => loc.evaluate((a) => ({ href: a.getAttribute('href'), target: a.getAttribute('target'), rel: a.getAttribute('rel') }))
  const norm = () => page.evaluate(() => {
    const c = document.querySelector('[data-testid="ai-key-link"]').closest('section, .card, [class*="rounded"]')?.parentElement?.closest('main') ?? document.querySelector('main')
    const x = c.cloneNode(true)
    x.querySelectorAll('a').forEach((a) => { a.removeAttribute('href'); a.removeAttribute('target') })
    return x.innerHTML
  })
  const gem = await attrs(page.getByTestId('ai-key-link'))
  const gemText = await page.getByTestId('ai-key-help').innerText()
  const html = await norm()
  await page.getByRole('group', { name: 'AI provider' }).getByRole('button', { name: 'OpenAI' }).click()
  const oaiLink = page.getByRole('link', { name: 'Get a key' })
  const oai = await attrs(oaiLink)
  await ctx.close()
  return { gem, oai, gemText, html }
}

let ref
for (const c of CASES) {
  await step(`${c[0]}: Gemini link ${c[3].href.slice(0, 32)}…, OpenAI link likewise; Settings otherwise unchanged`, async () => {
    const r = await card(BASE, c)
    assert.deepEqual(r.gem, c[3], 'Gemini "here" link')
    assert.deepEqual(r.oai, c[4], 'OpenAI "Get a key" link')
    assert.equal(r.gemText.replace(/\s+/g, ' ').trim(), "Don't have a key? Get one free here")
    if (!ref) ref = r.html
    assert.equal(r.html, ref, 'Settings HTML the same on every platform, links aside')
  })
}
if (BASELINE) {
  await step(`Settings HTML matches the previous build (${BASELINE}) apart from the links`, async () => {
    const old = await card(BASELINE, CASES.at(-2))
    assert.equal(old.html, ref)
  })
}
await browser.close()
console.log(results.join('\n'))
if (errors.length) { console.log(errors.join('\n')); process.exit(1) }
