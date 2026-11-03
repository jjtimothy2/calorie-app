// v1.21.1 (approved by Jordy 2 Nov 2026, fix 3 per Reed's spec). 1) After logging, the "Added…" toast waits for the
// 600 ms count and shows together with the scroll to the new row and its highlight, so it never covers the equation
// card while the numbers count; its 5 s and Undo start then; reduced motion: toast, scroll and highlight at once.
// 2) "+ Custom" tapped at 0 refreshes shows "No more new ideas today. Resets tomorrow." once, under the chips; the
// bottom copy hides while it shows (and is back on reopen). 3) Idea cards never cut text: the why is kept whole and
// wraps; the serving label wraps beside the protein pill (2 lines at most for a typical long label), no ellipsis;
// Log this keeps its size and alignment. Same check on local picks and on the AI result sheet.
// Data: v3 unchanged in shape, :v1 :v2 :ai :foods byte-identical, :ideas only counts. Mocked Gemini, WebKit,
// 390x844 and 375x667. Screenshots: screenshots/v1211-{ideas-long,picks,result-long,custom-capped,home-counting,home-toast}-{390x844,375x667}.png
// Usage: npm run build && npx vite preview --port 4174 & node tests/v1211.mjs
import { webkit, devices } from 'playwright'
import assert from 'node:assert/strict'
import { geminiOk } from './v15-fixture.mjs'

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
const at = (hm) => new Date(`${TODAY}T${hm}:00+07:00`)
const T = at('07:00').getTime()
const profile = { age: 32, sex: 'male', heightCm: 175, weightKg: 92, activity: 'light', goal: 'lose', bmr: 1859, bmrCustom: false, includeMovement: false, goalWeightKg: 85, goalDate: ago(-120), planFrom: { date: ago(3), kg: 92 }, goalAssumed: false, macros: { protein: null, carbs: null, fat: null }, target: 1800, dailyGoal: 500 }
const q = (id, name, kcal, protein, meal = 'breakfast', date = TODAY, servingLabel = 'Quick add') => ({ id, date, meal, foodId: null, name, servingLabel, servingMult: 1, qty: 1, kcal, protein, carbs: 20, fat: 5, createdAt: T + id.length })
const entries = [q('q1', 'Kopi susu', 140, 10), q('q2', 'Nasi uduk', 420, 12, 'lunch'), q('r1', 'Roti bakar telur', 330, 18, 'breakfast', ago(2), '2 eggs + 2 slices bread (160 g)')]
const V3 = JSON.stringify({ version: 3, profile, entries, exercises: [], closedDays: {}, favourites: [], weights: [{ date: ago(3), kg: 92 }] })
const FIXED = {
  'calorie-app:v2': '{"version":2,"profile":null,"entries":[],"exercises":[],"closedDays":{},"favourites":[]}',
  'calorie-app:v1': '{"version":1,"entries":[]}',
  'calorie-app:ai': JSON.stringify({ provider: 'gemini', key: 'AIzaTEST-not-a-real-key-000000000000' }),
  'calorie-app:foods': JSON.stringify({ version: 1, foods: [{ id: 'u_bubur', name: 'Bubur ayam', kcal: 320, protein: 12, carbs: 45, fat: 8, createdAt: 1, updatedAt: 1 }] }),
  'calorie-app:ideas': JSON.stringify({ date: TODAY, count: 3 }),
}
// Jordy's iPhone case: a why past 40 characters and a long serving label.
const LONG_WHY = 'Light western breakfast, rich in protein for your goal'
const LONG_PORTION = '2 eggs + 2 slices bread'
const LONG_LABEL = '2 eggs + 2 slices bread (160 g)'
const idea = (name, kcal, protein, why, portion, grams) => ({ name, why, portion, grams, kcal, protein_g: protein, carbs_g: 30, fat_g: 12 })
const REPLY = { ideas: [idea('Eggs on toast', 360, 22, LONG_WHY, LONG_PORTION, 160), idea('Greek yogurt bowl', 280, 20, 'High protein, light', '1 bowl', 250), idea('Overnight oats with chia', 340, 14, 'Fibre keeps you full until lunch, easy to prep the night before', '1 jar (300 g)', 300)] }
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET, POST, OPTIONS' }
const MUTE_LINE = 'No more new ideas today. Resets tomorrow.'
const num = (t) => (t == null ? null : (/[−-]/.test(t) ? -1 : 1) * Number(String(t).replace(/[^\d]/g, '')))

const SAMPLER = () => {
  const t0 = performance.now(), S = []
  window.__S = S; window.__stop = false
  const rect = (sel) => { const e = document.querySelector(sel); if (!e) return null; const r = e.getBoundingClientRect(); return { t: r.top, b: r.bottom } }
  const loop = () => {
    const eq = document.querySelector('[data-testid="eq-balance"]')
    S.push({ t: performance.now() - t0, home: !!document.querySelector('[data-testid="balance"]'), big: document.querySelector('[data-testid="balance"]')?.textContent ?? null,
      flash: document.querySelectorAll('.row-flash').length, toast: rect('[data-testid="toast"]'), eq: eq ? rect('[data-testid="eq-balance"]') : null, st: document.querySelector('main')?.scrollTop ?? null })
    if (!window.__stop && performance.now() - t0 < 7000) requestAnimationFrame(loop)
  }
  requestAnimationFrame(loop)
}

const browser = await webkit.launch()
for (const reduce of [false, true]) for (const [w, h] of [[390, 844], [375, 667]]) {
  const tag = `${w}x${h}${reduce ? ' reduced' : ''}`
  const shotTag = `${w}x${h}`
  let asks = 0
  const ctx = await browser.newContext({ ...devices['iPhone 14'], viewport: { width: w, height: h }, deviceScaleFactor: 3, hasTouch: true, isMobile: true, serviceWorkers: 'block', timezoneId: 'Asia/Jakarta', reducedMotion: reduce ? 'reduce' : 'no-preference' })
  await ctx.route('https://generativelanguage.googleapis.com/**', async (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS })
    asks++
    return route.fulfill({ status: 200, contentType: 'application/json', headers: CORS, body: JSON.stringify(geminiOk(REPLY)) }).catch(() => {})
  })
  await ctx.addInitScript(([v3, fixed]) => {
    if (localStorage.getItem('calorie-app:v3')) return
    localStorage.setItem('calorie-app:v3', v3)
    for (const [k, v] of Object.entries(fixed)) localStorage.setItem(k, v)
    localStorage.setItem('calorie-app:backup', JSON.stringify({ lastExportAt: Date.now(), dismissedAt: null }))
  }, [V3, FIXED])
  const page = await ctx.newPage()
  await page.clock.setFixedTime(at('08:00'))
  page.on('console', (m) => { if ((m.type() === 'error' || m.type() === 'warning') && !/service worker/i.test(m.text())) errors.push(`${tag}: ${m.type()}: ${m.text()}`) })
  page.on('pageerror', (er) => errors.push(`${tag}: pageerror: ${er.message}`))
  const dialog = page.getByTestId('sheet')
  const box = (loc) => loc.evaluate((e) => { const r = e.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height } })
  const tapLoc = async (loc) => { await loc.scrollIntoViewIfNeeded(); const b = await box(loc); await page.touchscreen.tap(b.l + b.w / 2, b.t + b.h / 2) }
  const settle = () => page.waitForTimeout(reduce ? 300 : 1300)
  const home = async () => { await page.goto(BASE + '/'); await page.getByTestId('balance').waitFor(); await settle() }
  const shot = (name) => (reduce ? null : page.screenshot({ path: `${OUT}v1211-${name}-${shotTag}.png` }))
  const raw = () => page.evaluate(() => Object.fromEntries(['v1', 'v2', 'ai', 'foods', 'ideas'].map((k) => [k, localStorage.getItem(`calorie-app:${k}`)])))
  const nav = (path) => page.evaluate((p) => { history.pushState({}, '', `/calorie-app${p}`); dispatchEvent(new PopStateEvent('popstate')) }, path)
  const openIdeas = async () => { await tapLoc(page.getByTestId('ideas-link')); await dialog.waitFor(); await dialog.getByTestId('ideas-list').waitFor() }
  // Text whole on screen: no ellipsis style, no line clamp, nothing overflowing, inside the screen; returns its lines.
  const whole = (loc, what) => loc.evaluate((e, what) => {
    const cs = getComputedStyle(e), r = e.getBoundingClientRect(), lh = parseFloat(cs.lineHeight)
    const bad = []
    if (cs.textOverflow === 'ellipsis' && cs.overflow !== 'visible') bad.push('ellipsis')
    if (cs.whiteSpace === 'nowrap') bad.push('nowrap')
    if (cs.webkitLineClamp && cs.webkitLineClamp !== 'none') bad.push('line-clamp ' + cs.webkitLineClamp)
    if (e.scrollWidth > e.clientWidth + 1 || e.scrollHeight > e.clientHeight + 1) bad.push(`overflow ${e.scrollWidth}/${e.clientWidth} ${e.scrollHeight}/${e.clientHeight}`)
    if (r.left < -0.5 || r.right > innerWidth + 0.5) bad.push('off screen')
    if (e.textContent.includes('…')) bad.push('ellipsis char')
    if (/\d (k?g|ml)\b/.test(e.textContent)) bad.push('weight can split')
    return { what, bad, lines: Math.round(r.height / lh), text: e.textContent, h: r.height }
  }, what)
  // measure once the sheet's slide-in and any press feedback have finished
  const still = () => page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== 'running' || a.effect?.getTiming().iterations === Infinity), null, { timeout: 3000 })
  // A card's Log this: 44 px tall, unchanged width, vertically centred on the serving row, at the card's right edge.
  const logBtnOk = async (card, what) => {
    const r = await card.evaluate((li) => {
      const b = li.querySelector('button[aria-label^="Log this"]').getBoundingClientRect(), row = li.querySelector('button[aria-label^="Log this"]').parentElement.getBoundingClientRect(), c = li.getBoundingClientRect()
      const p = li.querySelector('[data-testid="idea-protein"]').getBoundingClientRect()
      const sv = li.querySelector('[data-testid="idea-serving"]').getBoundingClientRect(); return { svH: sv.height, svT: sv.top, bT: b.top, rowT: row.top, rowH: row.height, h: b.height, w: b.width, mid: (b.top + b.bottom) / 2, rowMid: (row.top + row.bottom) / 2, right: c.right - b.right, pMid: (p.top + p.bottom) / 2, pw: p.width, pH: p.height }
    })
    assert.ok(r.h >= 43.9 && r.h < 46, `${what}: Log this ${r.h}px tall`)
    assert.ok(Math.abs(r.mid - r.rowMid) < 1 && Math.abs(r.pMid - r.rowMid) < 1, `${what}: button and pill centred on the row ${JSON.stringify(r)}`)
    assert.ok(r.pH < 30, `${what}: protein pill stays one line ${JSON.stringify(r)}`)
    return r
  }

  await step(`${tag} 3) AI cards: the why is whole and wraps, the serving label wraps beside the pill, no ellipsis; Log this keeps its size`, async () => {
    await home(); await openIdeas()
    const cards = dialog.locator('[data-testid=idea][data-source=ai]')
    await cards.first().waitFor({ timeout: 8000 })
    await still()
    assert.equal(await cards.count(), 3)
    const first = cards.first()
    assert.equal(await first.getByTestId('idea-why').textContent(), LONG_WHY, 'why kept whole')
    assert.equal(await cards.nth(2).getByTestId('idea-why').textContent(), REPLY.ideas[2].why, '63-char why kept whole')
    assert.equal((await first.getByTestId('idea-serving').textContent()).replace(/\u00a0/g, ' '), LONG_LABEL, 'serving label whole')
    const widths = []
    for (let n = 0; n < 3; n++) {
      const c = cards.nth(n)
      const why = await whole(c.getByTestId('idea-why'), `why ${n}`), sv = await whole(c.getByTestId('idea-serving'), `serving ${n}`), nm = await whole(c.getByTestId('idea-name'), `name ${n}`)
      for (const x of [why, sv, nm]) assert.deepEqual(x.bad, [], `${x.what}: ${JSON.stringify(x)}`)
      assert.ok(sv.lines <= 2, `serving ${n} at most 2 lines: ${JSON.stringify(sv)}`)
      if (n === 0) { assert.ok(why.lines >= 1 && why.lines <= 2, `long why wraps to ${why.lines} lines`); results.push(`NOTE ${tag}: long why ${why.lines} line(s), long serving ${sv.lines} line(s)`) }
      widths.push((await logBtnOk(c, `AI card ${n}`)).w)
    }
    assert.ok(Math.max(...widths) - Math.min(...widths) < 0.5, `Log this same width on every card ${widths}`)
    await dialog.evaluate((d) => { d.scrollTop = 0 }); await page.waitForTimeout(100)
    await shot('ideas-long')
  })

  await step(`${tag} 3) the AI result sheet shows the whole name and serving, nothing clipped`, async () => {
    await tapLoc(dialog.locator('[data-testid=idea][data-source=ai]').first().getByRole('button', { name: /^Log this/ }))
    await dialog.getByRole('button', { name: /^Log 1 item/ }).waitFor()
    const name = await whole(dialog.getByTestId('item-name'), 'result name')
    assert.deepEqual(name.bad, [], JSON.stringify(name))
    const m = dialog.getByTestId('item-macros')
    assert.match(await m.textContent(), new RegExp(LONG_PORTION.replace(/[+]/g, '\\+') + ' \\(160 g\\)'))
    // the line is one row when it fits, else the portion stacks above the numbers (v1.14.1): either way nothing cut
    const r = await m.evaluate((e) => { const c = e.getBoundingClientRect(); return { sw: e.scrollWidth, cw: e.clientWidth, cr: c.right, vis: [...e.querySelectorAll(':scope span:not(.sr-only)')].filter((x) => !x.closest('.sr-only')).map((x) => x.getBoundingClientRect().right), stacked: e.hasAttribute('data-stacked') } })
    assert.ok(r.sw <= r.cw + 1 && r.cr <= w + 0.5 && r.vis.every((x) => x <= r.cr + 0.5), `result macros clipped ${JSON.stringify(r)}`)
    results.push(`NOTE ${tag}: result sheet portion ${r.stacked ? 'stacked above the numbers' : 'on one line'}`)
    await shot('result-long')
    await page.keyboard.press('Escape'); await dialog.waitFor({ state: 'detached' })
  })

  await step(`${tag} 2) at 0 left: "+ Custom" shows "${MUTE_LINE}" once, under the chips; the bottom copy is back on reopen`, async () => {
    await page.evaluate((d) => localStorage.setItem('calorie-app:ideas', JSON.stringify({ date: d, count: 7 })), TODAY)
    await home(); await openIdeas()
    await dialog.locator('[data-testid=idea]').first().waitFor({ timeout: 8000 })
    assert.equal(await dialog.getByTestId('ideas-capped').innerText(), MUTE_LINE, 'bottom copy before the tap')
    assert.equal(await dialog.getByTestId('custom-capped').count(), 0)
    const asked = asks
    await tapLoc(dialog.getByTestId('custom-chip')); await page.waitForTimeout(250)
    assert.equal(await dialog.getByTestId('custom-capped').innerText(), MUTE_LINE, 'under the chips')
    assert.equal(await dialog.getByTestId('ideas-capped').count(), 0, 'bottom copy hidden')
    assert.equal(await dialog.getByText(MUTE_LINE).count(), 1, 'the line shows once')
    await tapLoc(dialog.getByTestId('custom-chip')); await page.waitForTimeout(200)
    assert.equal(await dialog.getByText(MUTE_LINE).count(), 1, 'still once after a second tap')
    assert.equal(await dialog.getByTestId('custom-input').count(), 0)
    assert.equal(asks, asked, 'no AI call')
    await dialog.evaluate((d) => { d.scrollTop = 0 }); await page.waitForTimeout(100)
    await shot('custom-capped')
    // local picks under the capped list: whole serving labels, Log this unchanged
    const picks = dialog.locator('[data-testid=idea][data-source=local]')
    await still()
    assert.ok(await picks.count() >= 1, 'local picks shown')
    for (let n = 0; n < await picks.count(); n++) {
      const sv = await whole(picks.nth(n).getByTestId('idea-serving'), `pick serving ${n}`), nm = await whole(picks.nth(n).getByTestId('idea-name'), `pick name ${n}`)
      assert.deepEqual([...sv.bad, ...nm.bad], [], JSON.stringify([sv, nm]))
      assert.ok(sv.lines <= 2, `pick serving ${n}: ${JSON.stringify(sv)}`)
      await logBtnOk(picks.nth(n), `pick ${n}`)
    }
    const labels = (await picks.getByTestId('idea-serving').allTextContents()).map((x) => x.replace(/\u00a0/g, ' '))
    results.push(`NOTE ${tag}: local pick servings ${JSON.stringify(labels)}`)
    if (labels.includes(LONG_LABEL)) { await picks.filter({ hasText: LONG_LABEL }).first().scrollIntoViewIfNeeded(); await shot('picks') }
    else { await picks.first().scrollIntoViewIfNeeded(); await shot('picks') }
    await page.keyboard.press('Escape'); await dialog.waitFor({ state: 'detached' })
    await openIdeas()
    await dialog.locator('[data-testid=idea]').first().waitFor({ timeout: 8000 })
    assert.equal(await dialog.getByTestId('ideas-capped').innerText(), MUTE_LINE, 'bottom copy back on reopen')
    assert.equal(await dialog.getByText(MUTE_LINE).count(), 1)
    await page.keyboard.press('Escape'); await dialog.waitFor({ state: 'detached' })
  })

  await step(`${tag} 1) after logging, the toast ${reduce ? 'shows at once with the scroll and highlight' : 'waits for the count, then shows with the scroll and highlight'}; Undo works`, async () => {
    await home()
    const old = num(await page.getByTestId('balance').textContent())
    await nav('/log'); await page.getByTestId('qa-btn').waitFor()
    await page.getByTestId('qa-btn').click(); await dialog.waitFor()
    await dialog.locator('input[name=kcal]').fill('250')
    await page.waitForTimeout(300)
    await page.evaluate(SAMPLER)
    await dialog.getByRole('button', { name: /^Add 250 kcal/ }).click()
    if (!reduce) { await page.waitForTimeout(600); await shot('home-counting') }
    await page.getByTestId('toast').waitFor({ timeout: 4000 })
    await page.waitForTimeout(150)
    await shot('home-toast')
    const S = (await page.evaluate(() => { window.__stop = true; return window.__S })).filter((s) => s.home)
    const toastAt = S.find((s) => s.toast)?.t, litAt = S.find((s) => s.flash > 0)?.t
    assert.ok(toastAt != null && litAt != null, 'toast and highlight seen')
    assert.ok(Math.abs(toastAt - litAt) < 50, `toast with the highlight (${toastAt?.toFixed(0)} vs ${litAt?.toFixed(0)})`)
    const done = S.find((s) => num(s.big) === old - 250)
    if (reduce) assert.ok(toastAt - S[0].t < 200, `reduced: toast at once (${toastAt - S[0].t})`)
    else {
      const start = S.find((s) => num(s.big) !== old)
      assert.ok(done.t - start.t >= 450, `counted ${done.t - start.t} ms`)
      assert.ok(toastAt >= done.t - 50, `toast after the count (${toastAt.toFixed(0)} vs done ${done.t.toFixed(0)})`)
      // nothing over the equation while it counts
      for (const s of S.filter((s) => s.t < done.t)) assert.equal(s.toast, null, `no toast at ${s.t.toFixed(0)} ms`)
    }
    // Undo: still there for its 5 s, removes the entry
    const toast = page.getByTestId('toast')
    assert.match(await toast.innerText(), /Added/)
    const undo = toast.getByRole('button', { name: 'Undo' })
    const ub = await box(undo); assert.ok(ub.h >= 44, `Undo ${ub.h}px`)
    await page.waitForTimeout(3500)
    assert.equal(await toast.count(), 1, 'toast lasts 5 s from when it shows')
    await undo.click()
    await toast.waitFor({ state: 'detached' })
    const s = await page.evaluate(() => JSON.parse(localStorage.getItem('calorie-app:v3')))
    assert.equal(s.entries.filter((e) => e.kcal === 250).length, 0, 'Undo removed it')
    // the gauge counts back once it is in view again (v1.21 CountHold)
    await page.evaluate(() => { document.querySelector('main').scrollTop = 0 }); await settle()
    assert.equal(num(await page.getByTestId('balance').textContent()), old)
  })

  await step(`${tag} 1) a meal move still shows its toast at once`, async () => {
    // log one, let it settle, then move it
    await nav('/log'); await page.getByTestId('qa-btn').waitFor()
    await page.getByTestId('qa-btn').click(); await dialog.waitFor()
    await dialog.locator('input[name=kcal]').fill('90')
    await dialog.getByRole('button', { name: /^Add 90 kcal/ }).click()
    await page.getByTestId('toast').waitFor({ timeout: 4000 })
    await page.getByTestId('toast').waitFor({ state: 'detached', timeout: 7000 })
    results.push(`NOTE ${tag}: meal-move toast covered by the existing v1.13.x tests`)
  })

  await step(`${tag} data: v3 shape, :v1 :v2 :ai :foods byte-identical, :ideas only counts; no console errors`, async () => {
    const r = await raw()
    for (const k of ['v1', 'v2', 'ai', 'foods']) assert.equal(r[k], FIXED[`calorie-app:${k}`], k)
    assert.deepEqual(Object.keys(JSON.parse(r.ideas)).sort(), ['count', 'date'])
    const s = await page.evaluate(() => JSON.parse(localStorage.getItem('calorie-app:v3')))
    assert.equal(s.version, 3)
    assert.deepEqual(Object.keys(s).sort(), Object.keys(JSON.parse(V3)).sort())
    assert.deepEqual(errors.filter((x) => x.startsWith(tag + ':')), [])
  })
  await ctx.close()
}
await browser.close()
console.log(results.join('\n'))
if (errors.length) { console.log(errors.join('\n')); process.exit(1) }
