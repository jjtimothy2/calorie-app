// v1.20.1 (approved by Jordy 2 Nov 2026). 1) Home equation card (Reed's option 1): the goal sentence under the divider
// is gone on open days (the gauge says the same); one quiet full-width row takes its place: "✦ What should I eat?" left
// and › right, same size, weight and green ink as the Protein card's View ›, the whole row a 44 px target, and the
// card no taller than v1.20. "✦ Still hungry? Light ideas" over the goal. Past open days end at the equation; a closed
// day keeps its "Finished ... Nice work." sentence. 2) AI result sheet: the portion stepper (−, number, +) and the
// remove ✕ are 44x44 tap targets (32 px look kept, ::before hit areas), proven by geometry and elementFromPoint hit
// testing, solid and non-overlapping, row fits at 375 and 390 with nothing clipped. 3) Custom chip C1-C6: "+ Custom"
// last; tap opens a 16 px field with "Get ideas" (focus only on that tap); cleaned words (60 max) in the request; the
// chip shows the words + ✕, ✕ clears; a Custom ask uses one of the 5 a day; hidden with no key, offline or over;
// "Closest fits for your calories left" when it cannot match. Schema stays v3; :v2 :v1 :ai :foods byte-identical,
// :ideas only counts. Mocked Gemini (no network). WebKit at 390x844 and 375x667.
// Screenshots: screenshots/v1201-{home-row,home-over,result,custom-open,custom-selected}-{390x844,375x667}.png.
// Usage: npm run build && npx vite preview --port 4174 & node tests/v1201.mjs
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
const T = at('08:00').getTime()
const profile = { age: 32, sex: 'male', heightCm: 175, weightKg: 92, activity: 'light', goal: 'lose', bmr: 1859, bmrCustom: false, includeMovement: false, goalWeightKg: 85, goalDate: ago(-120), planFrom: { date: ago(3), kg: 92 }, goalAssumed: false, macros: { protein: null, carbs: null, fat: null }, target: 1800, dailyGoal: 500 }
const q = (id, name, kcal, protein) => ({ id, date: TODAY, meal: 'breakfast', foodId: null, name, servingLabel: 'Quick add', servingMult: 1, qty: 1, kcal, protein, carbs: 20, fat: 5, createdAt: T + id.length })
const entries = [q('q1', 'Kopi susu', 140, 10), { id: 'f1', date: TODAY, meal: 'lunch', foodId: 'tempe-goreng', name: 'Tempe goreng', servingLabel: '1 piece', servingMult: 1, qty: 1, kcal: 120, protein: 8, carbs: 6, fat: 8, createdAt: T + 9 }]
const V3 = JSON.stringify({ version: 3, profile, entries, exercises: [], closedDays: {}, favourites: [], weights: [{ date: ago(3), kg: 92 }] })
const FIXED = {
  'calorie-app:v2': '{"version":2,"profile":null,"entries":[],"exercises":[],"closedDays":{},"favourites":[]}',
  'calorie-app:v1': '{"version":1,"entries":[]}',
  'calorie-app:ai': JSON.stringify({ provider: 'gemini', key: 'AIzaTEST-not-a-real-key-000000000000' }),
  'calorie-app:foods': JSON.stringify({ version: 1, foods: [{ id: 'u_bubur', name: 'Bubur ayam', kcal: 320, protein: 12, carbs: 45, fat: 8, createdAt: 1, updatedAt: 1 }] }),
  'calorie-app:ideas': JSON.stringify({ date: TODAY, count: 2 }),
}
const idea = (name, kcal, protein, why = 'High protein, fits your dinner', portion = '1 plate', grams = 380) => ({ name, why, portion, grams, kcal, protein_g: protein, carbs_g: 40, fat_g: 12 })
const SET1 = { ideas: [idea('Ayam bakar, nasi merah, lalapan, sambal terasi', 480, 38), idea('Pepes ikan with rice', 420, 32, 'Lean fish, light on oil'), idea('Gado-gado', 450, 18, 'Veg and peanut, filling', '1 bowl', 350)] }
const SET_CUSTOM = { ideas: [idea('Mie ayam pedas', 520, 24, 'Spicy noodles, fits your dinner', '1 bowl', 400), idea('Kwetiau goreng seafood', 560, 22, 'Noodles with prawns'), idea('Mie rebus telur', 430, 18, 'Light noodle soup', '1 bowl', 450)], closest: false }
const SET_CLOSE = { ideas: [idea('Pizza besar keju', 2400, 60, 'Too big for today'), idea('Roti bakar keju', 380, 14, 'Cheesy, fits your calories', '2 slices', 140), idea('Martabak telur mini', 450, 20, 'Closest to a pizza'), idea('Pisang goreng keju', 300, 5, 'Sweet cheese snack', '2 pieces', 160)], closest: true }
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET, POST, OPTIONS' }

// In the page: tap targets united with their ::before box (geo), and the 1 px grid hit test (as in v1142).
const MEASURE = (root, sel) => [...root.querySelectorAll(sel)].filter((e) => e.getClientRects().length).map((el) => {
  const r = el.getBoundingClientRect(), cs = getComputedStyle(el), b = getComputedStyle(el, '::before')
  let g = { l: r.left, t: r.top, r: r.right, b: r.bottom }
  if (b.content !== 'none' && b.position === 'absolute') {
    const px = (v) => parseFloat(v)
    const pl = r.left + px(cs.borderLeftWidth), pt = r.top + px(cs.borderTopWidth), pr = r.right - px(cs.borderRightWidth), pb = r.bottom - px(cs.borderBottomWidth)
    const qq = { l: pl + px(b.left), t: pt + px(b.top), r: pr - px(b.right), b: pb - px(b.bottom) }
    g = { l: Math.min(g.l, qq.l), t: Math.min(g.t, qq.t), r: Math.max(g.r, qq.r), b: Math.max(g.b, qq.b) }
  }
  const own = (x, y) => { const e = document.elementFromPoint(x, y); return !!e && (e === el || el.contains(e)) }
  let n = 0, hl = 1e9, ht = 1e9, hr = -1e9, hb = -1e9
  for (let x = Math.floor(g.l) - 3; x <= Math.ceil(g.r) + 3; x++) for (let y = Math.floor(g.t) - 3; y <= Math.ceil(g.b) + 3; y++) {
    if (own(x + 0.5, y + 0.5)) { n++; hl = Math.min(hl, x); ht = Math.min(ht, y); hr = Math.max(hr, x + 1); hb = Math.max(hb, y + 1) }
  }
  return { name: el.getAttribute('aria-label') || el.dataset.testid || el.tagName, box: [r.width, r.height], geo: g, gw: g.r - g.l, gh: g.b - g.t, hw: hr - hl, hh: hb - ht, solid: n / Math.max(1, (hr - hl) * (hb - ht)) }
})

const browser = await webkit.launch()
for (const [w, h] of [[390, 844], [375, 667]]) {
  const tag = `${w}x${h}`
  const asks = []
  const ctx = await browser.newContext({ ...devices['iPhone 14'], viewport: { width: w, height: h }, deviceScaleFactor: 3, hasTouch: true, isMobile: true, serviceWorkers: 'block', timezoneId: 'Asia/Jakarta' })
  await ctx.route('https://generativelanguage.googleapis.com/**', (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS })
    const text = JSON.parse(route.request().postData()).contents[0].parts[0].text
    asks.push(text)
    const set = /asked for: "pizza/.test(text) ? SET_CLOSE : /asked for:/.test(text) ? SET_CUSTOM : SET1
    return route.fulfill({ status: 200, contentType: 'application/json', headers: CORS, body: JSON.stringify(geminiOk(set)) })
  })
  await ctx.addInitScript(([v3, fixed]) => {
    if (localStorage.getItem('calorie-app:v3')) return
    localStorage.setItem('calorie-app:v3', v3)
    for (const [k, v] of Object.entries(fixed)) localStorage.setItem(k, v)
    localStorage.setItem('calorie-app:backup', JSON.stringify({ lastExportAt: Date.now(), dismissedAt: null }))
  }, [V3, FIXED])
  const page = await ctx.newPage()
  await page.clock.setFixedTime(at('18:30'))
  page.on('console', (m) => { if ((m.type() === 'error' || m.type() === 'warning') && !/service worker/i.test(m.text())) errors.push(`${tag}: ${m.type()}: ${m.text()}`) })
  page.on('pageerror', (er) => errors.push(`${tag}: pageerror: ${er.message}`))
  const dialog = page.getByRole('dialog')
  const box = (loc) => loc.evaluate((e) => { const r = e.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height } })
  const tapLoc = async (loc) => { await loc.scrollIntoViewIfNeeded(); const b = await box(loc); await page.touchscreen.tap(b.l + b.w / 2, b.t + b.h / 2) }
  const home = async () => { await page.goto(BASE + '/'); await page.getByTestId('balance').waitFor(); await page.waitForTimeout(300) }
  const raw = () => page.evaluate(() => Object.fromEntries(['v1', 'v2', 'ai', 'foods', 'ideas'].map((k) => [k, localStorage.getItem(`calorie-app:${k}`)])))
  // Ink extents (CSS px) of a box from real pixels: columns whose pixels differ from the card background.
  const ink = async (b) => {
    const png = await page.screenshot({ clip: { x: b.l, y: b.t, width: b.w, height: b.h }, scale: 'device' })
    return page.evaluate(async ([src, b]) => {
      const img = await createImageBitmap(await (await fetch(`data:image/png;base64,${src}`)).blob())
      const c = new OffscreenCanvas(img.width, img.height), x = c.getContext('2d'); x.drawImage(img, 0, 0)
      const d = x.getImageData(0, 0, img.width, img.height).data, k = img.width / b.w
      const bg = [d[0], d[1], d[2]]
      let l = 1e9, r = -1
      for (let yy = 0; yy < img.height; yy++) for (let xx = 0; xx < img.width; xx++) {
        const i = (yy * img.width + xx) * 4
        if (Math.abs(d[i] - bg[0]) + Math.abs(d[i + 1] - bg[1]) + Math.abs(d[i + 2] - bg[2]) > 90) { l = Math.min(l, xx); r = Math.max(r, xx + 1) }
      }
      return { l: b.l + l / k, r: b.l + r / k, c: b.l + (l + r) / 2 / k }
    }, [png.toString('base64'), b])
  }
  const css = (loc, ...k) => loc.evaluate((e, k) => { const c = getComputedStyle(e); return k.map((x) => c[x]) }, k)
  // The row: full content width under the divider, ✦ at the left edge, › at the right, View › type, 44 px, whole row
  // hit-tested, card no taller than v1.20 (v1.20 = this card without the row + the goal sentence + the 20 px link).
  const row = async (label, text) => {
    const link = page.getByTestId('ideas-link'), card = link.locator('xpath=..')
    await card.evaluate((e) => e.scrollIntoView({ block: 'center' })); await page.waitForTimeout(400)
    assert.equal((await page.getByTestId('ideas-text').innerText()).trim(), text)
    assert.equal(await page.getByTestId('goal-progress').count(), 0, 'no repeated goal line')
    assert.equal(await link.getAttribute('aria-label'), null); assert.equal(await page.getByRole('button', { name: text, exact: true }).count(), 1, 'accessible name is the words')
    const [lb, cb, eq, sv, ch, tx] = await Promise.all([box(link), box(card), box(page.getByTestId('equation')), box(link.locator('svg')), box(page.getByTestId('ideas-chev')), box(page.getByTestId('ideas-text'))])
    const [bl, pl, br, pr, bt] = (await css(card, 'borderLeftWidth', 'paddingLeft', 'borderRightWidth', 'paddingRight')).map(parseFloat).concat(parseFloat((await css(link, 'borderTopWidth'))[0]))
    assert.ok(Math.abs(lb.l - (cb.l + bl + pl)) < 0.5 && Math.abs(lb.r - (cb.r - br - pr)) < 0.5, `${label}: row ${lb.l}-${lb.r} spans the content box ${cb.l + bl + pl}-${cb.r - br - pr}`)
    assert.ok(Math.abs(lb.l - eq.l) < 0.5 && Math.abs(lb.r - eq.r) < 0.5, `${label}: row edges = equation edges`)
    assert.equal(bt, 1, 'the divider is the row top border'); assert.ok(lb.t >= eq.b, 'under the equation')
    assert.ok(lb.h >= 44, `${label}: row ${lb.h} tall`)
    assert.ok(Math.abs(sv.l - lb.l) < 0.5, `${label}: ✦ at the left edge (${sv.l} vs ${lb.l})`)
    assert.ok(tx.l > sv.r && tx.r < ch.l, 'text between ✦ and ›')
    assert.ok(Math.abs(ch.r - lb.r) < 0.5, `${label}: › at the right edge (${ch.r} vs ${lb.r})`)
    const chi = await ink({ l: ch.l - 2, t: ch.t, w: ch.w + 2, h: ch.h })
    assert.ok(lb.r - chi.r <= 2, `${label}: › ink ends ${(lb.r - chi.r).toFixed(2)} px from the edge`)
    const midY = (l) => (l.t + l.b) / 2
    assert.ok(Math.abs(midY(sv) - midY(lb)) <= 2 && Math.abs(midY(ch) - midY(lb)) <= 2, 'one line, centred in the row')
    // same type as View ›
    const view = page.getByTestId('protein-card').getByText('View ›')
    const vt = await css(view, 'fontSize', 'fontWeight', 'color'), rt = await css(link, 'fontSize', 'fontWeight', 'color')
    assert.deepEqual(rt, vt, `${label}: row type ${rt} = View › ${vt}`)
    assert.deepEqual(await css(page.getByTestId('ideas-text'), 'fontWeight'), [vt[1]], 'not bolder than View ›')
    // whole row is the target
    const m = (await card.evaluate(MEASURE, '[data-testid=ideas-link]'))[0]
    assert.ok(m.hw >= lb.w - 1 && m.hh >= 44 && m.solid >= 0.999, `${label}: hit ${m.hw}x${m.hh} solid ${m.solid}`)
    // card height: now vs v1.20 (goal sentence + link growth 20)
    const v = await card.evaluate((c, msg) => {
      const l = c.querySelector('[data-testid=ideas-link]'), now = c.getBoundingClientRect().height
      l.style.display = 'none'; const base = c.getBoundingClientRect().height
      const p = document.createElement('p'); p.className = 'mt-2.5 border-t border-line pt-2.5 text-center text-[14px] text-mute'; p.textContent = msg; c.append(p)
      const withGoal = c.getBoundingClientRect().height; p.remove(); l.style.display = ''
      return { now, base, v120: withGoal + 20 }
    }, await page.getByTestId('ring').getAttribute('data-message'))
    assert.ok(v.now <= v.v120, `${label}: card ${v.now} vs v1.20 ${v.v120}`)
    return { row: [lb.l, lb.r, lb.h], icon: sv.l, chevInkEnd: +chi.r.toFixed(2), card: v }
  }

  await step(`${tag} Home row "✦ What should I eat?  ›": no goal line, full width under the divider, View › type, 44 px whole-row target, card not taller than v1.20`, async () => {
    await home()
    const m = await row('row', 'What should I eat?'); console.log(`  ${tag} row ${JSON.stringify(m)}`)
    await page.screenshot({ path: `${OUT}v1201-home-row-${tag}.png` })
    // taps at the far left and on the › both open Meal Ideas
    for (const fx of [0.02, 0.98]) {
      const b = await box(page.getByTestId('ideas-link'))
      await page.touchscreen.tap(b.l + b.w * fx, b.t + 4); await dialog.waitFor(); await page.waitForTimeout(250)
      await page.keyboard.press('Escape'); await dialog.waitFor({ state: 'detached' })
    }
  })

  await step(`${tag} Home over goal: "✦ Still hungry? Light ideas  ›" in the same row`, async () => {
    const before = await raw()
    await page.evaluate((e) => { const s = JSON.parse(localStorage.getItem('calorie-app:v3')); s.entries.push(e); localStorage.setItem('calorie-app:v3', JSON.stringify(s)) }, q('big', 'Nasi padang', 1600, 30))
    await home()
    assert.match(await page.getByTestId('ring').getAttribute('data-message'), /kcal over your/)
    const m = await row('over', 'Still hungry? Light ideas'); console.log(`  ${tag} over ${JSON.stringify(m)}`)
    await page.screenshot({ path: `${OUT}v1201-home-over-${tag}.png` })
    await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('calorie-app:v3')); s.entries = s.entries.filter((e) => e.id !== 'big'); localStorage.setItem('calorie-app:v3', JSON.stringify(s)) })
    assert.deepEqual(await raw(), before)
  })

  await step(`${tag} past open day: no row, card ends at the equation; the gauge keeps the sentence for screen readers`, async () => {
    await home()
    await tapLoc(page.getByTestId('day-prev')); await page.waitForTimeout(300)
    assert.equal(await page.getByTestId('ideas-link').count(), 0)
    assert.equal(await page.getByTestId('goal-progress').count(), 0)
    const card = page.getByTestId('equation').locator('xpath=..')
    const [cb, eq] = await Promise.all([box(card), box(page.getByTestId('equation'))])
    const [pb, bb] = (await css(card, 'paddingBottom', 'borderBottomWidth')).map(parseFloat)
    assert.ok(Math.abs(cb.b - pb - bb - eq.b) < 0.5, `card ends at the equation (${cb.b} vs ${eq.b})`)
    assert.match(await page.getByTestId('ring').locator('.sr-only').innerText(), /kcal|On target/)
  })

  await step(`${tag} AI result sheet: −, number, + and ✕ are 44x44 tap targets (geometry and hit testing), solid, no overlaps; 32 px look kept; row fits, nothing clipped`, async () => {
    await home()
    await tapLoc(page.getByTestId('ideas-link')); await dialog.getByTestId('ideas-list').waitFor(); await page.waitForTimeout(250)
    await tapLoc(dialog.getByRole('button', { name: /^Log this: Ayam bakar/ }))
    await dialog.getByRole('button', { name: /^Log 1 item/ }).waitFor(); await page.waitForTimeout(400)
    const list = dialog.getByRole('list', { name: 'Estimated items' })
    const m = await list.evaluate(MEASURE, '[data-testid=qty-dec], [data-testid=qty-edit], [data-testid=qty-inc], [data-testid=item-remove]')
    assert.deepEqual(m.map((t) => t.name.split(' ')[0]), ['Remove', 'Less', '1', 'More'])
    for (const t of m) {
      assert.ok(t.gw >= 44 - 0.01 && t.gh >= 44 - 0.01, `${t.name} area ${t.gw}x${t.gh}`)
      assert.ok(t.hw >= 44 && t.hh >= 44, `${t.name} hit-tested ${t.hw}x${t.hh}`)
      assert.ok(t.solid >= 0.999, `${t.name} hit area not solid (${t.solid})`)
      assert.ok(t.geo.r <= w && t.geo.l >= 0, `${t.name} area inside the screen`)
    }
    for (let i = 0; i < m.length; i++) for (let j = i + 1; j < m.length; j++) {
      const a = m[i].geo, b = m[j].geo, ow = Math.min(a.r, b.r) - Math.max(a.l, b.l), oh = Math.min(a.b, b.b) - Math.max(a.t, b.t)
      assert.ok(!(ow > 0.5 && oh > 0.5), `${m[i].name} overlaps ${m[j].name}`)
    }
    assert.deepEqual(m.map((t) => t.box.map(Math.round)), [[32, 32], [32, 32], [52, 32], [32, 32]], 'same compact look')
    // ✕ taps in its extended corner (5 px outside the 32 px glyph box) still hit the ✕
    const x = await box(list.getByTestId('item-remove'))
    assert.equal(await page.evaluate(([px, py]) => document.elementFromPoint(px, py)?.dataset.testid, [x.l - 5, x.t - 5]), 'item-remove')
    // the row: name, kcal and ✕ on one line without overlap; nothing past the screen; name not clipped
    const [nm, kc] = await Promise.all([box(list.getByTestId('item-name')), box(list.getByTestId('item-kcal'))])
    assert.ok(nm.r <= kc.l && kc.r <= x.l, 'name | kcal | ✕ in order, no overlap')
    const bad = await dialog.evaluate((d, vw) => {
      const out = []
      for (const e of d.querySelectorAll('*')) { const b = e.getBoundingClientRect(); if (b.width && (b.right > vw + 0.5 || b.left < -0.5)) out.push(`${e.tagName} ${b.left}-${b.right}`) }
      for (const e of d.querySelectorAll('[data-testid=item-name], [data-testid=item-kcal]')) if (e.scrollWidth > e.clientWidth + 1) out.push(`clipped ${e.innerText}`)
      for (const e of d.querySelectorAll('button, input')) { const b = e.getBoundingClientRect(); if (b.width && e.tagName === 'INPUT' && parseFloat(getComputedStyle(e).fontSize) < 16) out.push('input font') }
      return out
    }, w)
    assert.deepEqual(bad, [])
    // the + target still works, and the ✕ removes the item
    await tapLoc(list.getByTestId('qty-inc'))
    assert.equal(await list.getByTestId('qty').innerText(), '2')
    await page.screenshot({ path: `${OUT}v1201-result-${tag}.png` })
    const x2 = await box(list.getByTestId('item-remove'))
    assert.equal(await page.evaluate(([px, py]) => document.elementFromPoint(px, py)?.dataset.testid, [x2.r + 4, x2.b + 4]), 'item-remove')
    await page.touchscreen.tap(x2.r + 4, x2.b + 4) // inside the ::before, outside the 32 px box
    await page.waitForTimeout(400)
    assert.equal(await list.getByTestId('ai-item').count(), 0, '✕ extended area removes the item')
    assert.match(await dialog.innerText(), /All items removed/)
  })

  await step(`${tag} storage: v3, :v1 :v2 :ai :foods :ideas byte-identical`, async () => {
    const s = await page.evaluate(() => JSON.parse(localStorage.getItem('calorie-app:v3')))
    assert.equal(s.version, 3)
    const r = await raw()
    for (const k of ['v1', 'v2', 'ai', 'foods', 'ideas']) assert.equal(r[k], FIXED[`calorie-app:${k}`], k)
  })

  // ---------- Custom chip (C1-C6) ----------
  const count = async () => JSON.parse((await raw()).ideas).count
  const openIdeas = async () => { await home(); await tapLoc(page.getByTestId('ideas-link')); await dialog.getByTestId('ideas-list').waitFor(); await page.waitForTimeout(300) }
  const chip = () => dialog.getByTestId('custom-chip')
  const noClip = () => dialog.evaluate((d, vw) => {
    const out = []
    for (const e of d.querySelectorAll('*')) { const b = e.getBoundingClientRect(); if (b.width && (b.right > vw + 0.5 || b.left < -0.5)) out.push(`${e.tagName}.${e.dataset.testid ?? ''} ${b.left}-${b.right}`) }
    for (const e of d.querySelectorAll('[role=group] button, [data-testid=custom-form] *')) if (e.scrollWidth > e.clientWidth + 1 && e.tagName !== 'INPUT') out.push(`clipped ${e.dataset.testid ?? e.innerText}`)
    for (const e of d.querySelectorAll('[role=group] button, [data-testid=custom-form] input, [data-testid=custom-form] button')) if (e.getBoundingClientRect().height < 44 - 0.01) out.push(`short ${e.dataset.testid ?? e.innerText} ${e.getBoundingClientRect().height}`)
    return out
  }, w)

  await step(`${tag} C1 + C2: "+ Custom" last; the sheet opens with no field and no input focused; tap opens a 16 px field "e.g. noodles, spicy, no rice" + "Get ideas", focused`, async () => {
    await openIdeas()
    const names = await dialog.getByRole('group', { name: 'Preferences' }).getByRole('button').allInnerTexts()
    assert.deepEqual(names.map((n) => n.trim()), ['Indonesian', 'Quick', 'Cheap', '+ Custom'])
    assert.equal(await dialog.getByTestId('custom-form').count(), 0)
    assert.equal(await page.evaluate(() => document.activeElement?.tagName), 'DIV', 'focus on the sheet, keyboard closed')
    assert.equal(await page.locator('input:focus, textarea:focus').count(), 0)
    assert.equal(await chip().getAttribute('aria-expanded'), 'false')
    await tapLoc(chip())
    const input = dialog.getByTestId('custom-input')
    await input.waitFor()
    assert.equal(await chip().getAttribute('aria-expanded'), 'true')
    assert.equal(await page.evaluate(() => document.activeElement?.dataset.testid), 'custom-input', 'focused by the tap')
    assert.equal(await input.getAttribute('placeholder'), 'e.g. noodles, spicy, no rice')
    assert.deepEqual(await css(input, 'fontSize'), ['16px'])
    assert.equal(await input.getAttribute('maxlength'), '60')
    const go = dialog.getByRole('button', { name: 'Get ideas' })
    assert.equal(await go.isDisabled(), true, 'nothing to send yet')
    const [ib, gb, cb] = await Promise.all([box(input), box(go), box(chip())])
    assert.ok(ib.t > cb.b, 'field under the chips'); assert.ok(gb.l >= ib.r, 'Get ideas beside the field')
    assert.deepEqual(await noClip(), [])
    await page.screenshot({ path: `${OUT}v1201-custom-open-${tag}.png` })
  })

  await step(`${tag} C3 + C4: cleaned words in the request; chip becomes "noodles, spicy ✕"; one of the 5 used; ✕ clears without using one`, async () => {
    const input = dialog.getByTestId('custom-input')
    const n0 = await count(), a0 = asks.length
    // control, zero-width and runs of whitespace, set as a paste would (React sees the input event)
    await input.evaluate((e) => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(e, '  noodles,\u0000\u200b   spicy \t '); e.dispatchEvent(new Event('input', { bubbles: true })) })
    await tapLoc(dialog.getByRole('button', { name: 'Get ideas' }))
    await dialog.getByText('Mie ayam pedas').waitFor(); await page.waitForTimeout(300)
    assert.equal(asks.length, a0 + 1)
    assert.match(asks.at(-1), /The user asked for: "noodles, spicy"\. Match it/)
    assert.doesNotMatch(asks.at(-1), /[\u0000-\u001f\u200b]noodles|noodles,[\u0000\u200b]/)
    assert.equal(await count(), n0 + 1, 'a Custom ask uses one of the 5')
    assert.equal(await dialog.getByTestId('custom-form').count(), 0, 'field closes')
    assert.equal((await chip().innerText()).trim(), 'noodles, spicy ✕')
    assert.equal(await chip().getAttribute('aria-pressed'), 'true')
    assert.equal(await chip().getAttribute('aria-label'), 'Clear custom: noodles, spicy')
    const onBg = await page.evaluate(() => { const e = document.createElement('span'); e.className = 'bg-ink'; document.body.append(e); const c = getComputedStyle(e).backgroundColor; e.remove(); return c })
    assert.deepEqual(await css(chip(), 'backgroundColor'), [onBg], 'selected look, like the other chips')
    assert.equal(await dialog.getByTestId('ideas-closest').count(), 0)
    assert.deepEqual(await dialog.locator('[data-testid=idea][data-source=ai] [data-testid=idea-name]').allInnerTexts(), ['Mie ayam pedas', 'Kwetiau goreng seafood', 'Mie rebus telur'])
    assert.deepEqual(await noClip(), [])
    await chip().scrollIntoViewIfNeeded()
    await page.screenshot({ path: `${OUT}v1201-custom-selected-${tag}.png` })
    // a chip tap keeps the words in the request
    await tapLoc(dialog.getByRole('button', { name: 'Cheap' })); await dialog.getByTestId('ideas-list').waitFor(); await page.waitForTimeout(300)
    assert.match(asks.at(-1), /cheap[\s\S]*asked for: "noodles, spicy"/)
    assert.equal(await count(), n0 + 1, 'chips do not count')
    await tapLoc(dialog.getByRole('button', { name: 'Cheap' })); await page.waitForTimeout(300); await dialog.getByTestId('ideas-list').waitFor()
    await tapLoc(chip()); await dialog.getByTestId('ideas-list').waitFor(); await page.waitForTimeout(300)
    assert.equal((await chip().innerText()).trim(), '+ Custom')
    assert.doesNotMatch(asks.at(-1), /asked for/)
    assert.equal(await count(), n0 + 1, 'clearing does not count')
  })

  await step(`${tag} C6: cannot match within the calories -> 3 that fit + "Closest fits for your calories left"; 60 chars max, long chip wraps, nothing clips`, async () => {
    const n0 = await count()
    await tapLoc(chip())
    const input = dialog.getByTestId('custom-input')
    await input.waitFor()
    await input.fill('pizza besar keju, extra cheese, thick crust, with fries and cola please')
    assert.equal((await input.inputValue()).length, 60, 'maxlength 60')
    await tapLoc(dialog.getByRole('button', { name: 'Get ideas' }))
    await dialog.getByTestId('ideas-closest').waitFor(); await page.waitForTimeout(300)
    assert.equal(await dialog.getByTestId('ideas-closest').innerText(), 'Closest fits for your calories left')
    const text = asks.at(-1).match(/asked for: (".*?")\. Match/)[1]
    assert.equal(JSON.parse(text), 'pizza besar keju, extra cheese, thick crust, with fries and', '60 typed, trailing space trimmed')
    const names = await dialog.locator('[data-testid=idea][data-source=ai] [data-testid=idea-name]').allInnerTexts()
    assert.deepEqual(names, ['Roti bakar keju', 'Martabak telur mini', 'Pisang goreng keju'])
    const cap = Number((await dialog.getByTestId('ideas-head').innerText()).match(/^([\d,]+) kcal left/)[1].replace(/,/g, ''))
    for (const k of await dialog.locator('[data-testid=idea][data-source=ai] [data-testid=idea-kcal]').allInnerTexts()) assert.ok(Number(k.replace(/[^\d]/g, '')) <= cap)
    assert.equal(await count(), n0 + 1)
    assert.deepEqual(await noClip(), [])
    const cb = await box(chip()); assert.ok(cb.r <= w - 15 && cb.h >= 44, `long chip ${cb.l}-${cb.r} x ${cb.h}`)
    await tapLoc(chip()); await page.waitForTimeout(300); await dialog.getByTestId('ideas-list').waitFor()
    assert.equal(await dialog.getByTestId('ideas-closest').count(), 0, 'note goes with the custom ask')
    await page.keyboard.press('Escape'); await dialog.waitFor({ state: 'detached' })
  })

  await step(`${tag} C4 cap + C5: at 7 used (v1.21) "+ Custom" is muted and does not open the field; hidden with no key, offline and over the goal`, async () => {
    const before = await raw()
    await page.evaluate((t) => localStorage.setItem('calorie-app:ideas', JSON.stringify({ date: t, count: 7 })), TODAY)
    await openIdeas()
    assert.equal(await chip().getAttribute('aria-disabled'), 'true')
    await tapLoc(chip())
    assert.equal(await dialog.getByTestId('custom-input').count(), 0)
    assert.equal(await dialog.getByTestId('custom-capped').innerText(), 'No more new ideas today. Resets tomorrow.')
    await page.evaluate((v) => localStorage.setItem('calorie-app:ideas', v), before.ideas)
    // offline
    await home(); await ctx.setOffline(true); await page.waitForTimeout(200)
    await tapLoc(page.getByTestId('ideas-link')); await dialog.getByTestId('ideas-offline').waitFor()
    assert.equal(await chip().count(), 0, 'offline')
    await page.keyboard.press('Escape'); await dialog.waitFor({ state: 'detached' }); await ctx.setOffline(false)
    // no key
    await page.evaluate(() => localStorage.removeItem('calorie-app:ai'))
    await home(); await tapLoc(page.getByTestId('ideas-link')); await dialog.getByTestId('ideas-nokey').waitFor()
    assert.equal(await chip().count(), 0, 'no key')
    await page.keyboard.press('Escape'); await dialog.waitFor({ state: 'detached' })
    await page.evaluate((v) => localStorage.setItem('calorie-app:ai', v), before.ai)
    // over the goal
    await page.evaluate((e) => { const s = JSON.parse(localStorage.getItem('calorie-app:v3')); s.entries.push(e); localStorage.setItem('calorie-app:v3', JSON.stringify(s)) }, q('big', 'Nasi padang', 1600, 30))
    await openIdeas()
    assert.equal(await chip().count(), 0, 'over')
    await page.keyboard.press('Escape'); await dialog.waitFor({ state: 'detached' })
    await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('calorie-app:v3')); s.entries = s.entries.filter((e) => e.id !== 'big'); localStorage.setItem('calorie-app:v3', JSON.stringify(s)) })
    assert.deepEqual(await raw(), before)
  })

  await step(`${tag} closed today: no row, the closed sentence stays (it says "Finished ..."); storage after: v3, :v1 :v2 :ai :foods byte-identical, :ideas counted 2 Custom asks`, async () => {
    await home()
    await page.getByRole('button', { name: 'Close day' }).click()
    await home(); await page.getByTestId('closed-pill').waitFor()
    assert.equal(await page.getByTestId('ideas-link').count(), 0)
    assert.match(await page.getByTestId('goal-progress').innerText(), /^Finished /)
    const s = await page.evaluate(() => JSON.parse(localStorage.getItem('calorie-app:v3')))
    assert.equal(s.version, 3)
    const r = await raw()
    for (const k of ['v1', 'v2', 'ai', 'foods']) assert.equal(r[k], FIXED[`calorie-app:${k}`], k)
    assert.deepEqual(JSON.parse(r.ideas), { date: TODAY, count: 4 })
  })
  await ctx.close()
}
await browser.close()
console.log(results.join('\n'))
if (errors.length) { console.log(errors.join('\n')); process.exit(1) }
console.log(`\n${results.length} passed`)
