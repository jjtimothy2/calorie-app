// v1.21 (approved by Jordy 2 Nov 2026). Motion: 1) after logging from a sheet, Home lets the gauge needle, the big
// number and the equation count in view, then scrolls to the new row and highlights it; 2) back on Home from another
// tab with a changed value, the needle sweeps in step with the number (no jump ahead); 3) every sheet close slides down
// with the scrim fading (250 ms, ease-in): Escape, scrim tap, a close button, logging; a sheet handing over to another
// sheet does not; 4) Eaten, Exercise and Deficit/Surplus count with the big number's counter; counts hold while the
// gauge is off screen; 5) reduced motion: instant values, a quick fade, Home still scrolls to the row.
// Ideas counter: 6) "Show other ideas · N left today" (N muted), 7 a day; 7) at 0 the muted line "No more new ideas
// today. Resets tomorrow." replaces it, ideas and local picks stay; 8) at 0 "+ Custom" is muted and a tap shows that
// line instead of the field; 9) a v1.20.x day with 5 used shows 2 left, a new local day has 7.
// Data: v3 unchanged in shape, :v1 :v2 :ai :foods byte-identical, :ideas only counts. Mocked Gemini, WebKit,
// 390x844 and 375x667. Screenshots: screenshots/v121-{ideas-left,ideas-capped,custom-capped,home-mid}-{390x844,375x667}.png
// Usage: npm run build && npx vite preview --port 4174 & node tests/v121-motion.mjs
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
const q = (id, name, kcal, protein, meal = 'breakfast') => ({ id, date: TODAY, meal, foodId: null, name, servingLabel: 'Quick add', servingMult: 1, qty: 1, kcal, protein, carbs: 20, fat: 5, createdAt: T + id.length })
const entries = [q('q1', 'Kopi susu', 140, 10), q('q2', 'Nasi uduk', 420, 12, 'lunch'), { id: 'f1', date: TODAY, meal: 'lunch', foodId: 'tempe-goreng', name: 'Tempe goreng', servingLabel: '1 piece', servingMult: 1, qty: 1, kcal: 120, protein: 8, carbs: 6, fat: 8, createdAt: T + 9 }]
const V3 = JSON.stringify({ version: 3, profile, entries, exercises: [], closedDays: {}, favourites: [], weights: [{ date: ago(3), kg: 92 }] })
const FIXED = {
  'calorie-app:v2': '{"version":2,"profile":null,"entries":[],"exercises":[],"closedDays":{},"favourites":[]}',
  'calorie-app:v1': '{"version":1,"entries":[]}',
  'calorie-app:ai': JSON.stringify({ provider: 'gemini', key: 'AIzaTEST-not-a-real-key-000000000000' }),
  'calorie-app:foods': JSON.stringify({ version: 1, foods: [{ id: 'u_bubur', name: 'Bubur ayam', kcal: 320, protein: 12, carbs: 45, fat: 8, createdAt: 1, updatedAt: 1 }] }),
  // A v1.20.x day: 5 of the old 5 used. From v1.21 that reads as 2 of 7 left.
  'calorie-app:ideas': JSON.stringify({ date: TODAY, count: 5 }),
}
const idea = (name, kcal, protein, why = 'High protein, fits your dinner', portion = '1 plate', grams = 380) => ({ name, why, portion, grams, kcal, protein_g: protein, carbs_g: 40, fat_g: 12 })
const set = (n) => ({ ideas: [idea(`Idea ${n}a`, 300 + n, 20), idea(`Idea ${n}b`, 320 + n, 22), idea(`Idea ${n}c`, 340 + n, 24)] })
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET, POST, OPTIONS' }
const MUTE_LINE = 'No more new ideas today. Resets tomorrow.'
// Every other value's progress sits within the big number's progress one frame either side (small slack for rounding).
const inStep = (P, keys) => {
  for (let i = 0; i < P.length; i++) {
    const lo = Math.min(P[Math.max(0, i - 1)].b, P[i].b, P[Math.min(P.length - 1, i + 1)].b) - 0.02
    const hi = Math.max(P[Math.max(0, i - 1)].b, P[i].b, P[Math.min(P.length - 1, i + 1)].b) + 0.02
    for (const k of keys) assert.ok(P[i][k] >= lo && P[i][k] <= hi, `${k} in step at ${P[i].t.toFixed(0)} ms: ${P[i][k].toFixed(3)} vs number ${P[i].b.toFixed(3)} (${lo.toFixed(3)}..${hi.toFixed(3)})`)
  }
}
const num = (t) => (t == null ? null : (/[−-]/.test(t) ? -1 : 1) * Number(String(t).replace(/[^\d]/g, '')))

// In the page: sample Home every frame (big number, needle drawn/target angle, equation numbers, scroll, highlight,
// toast, the closing sheet copy) until stopped.
const SAMPLER = () => {
  const t0 = performance.now(), S = []
  window.__S = S; window.__stop = false
  const txt = (id) => document.querySelector(`[data-testid="${id}"]`)?.textContent ?? null
  const loop = () => {
    const n = document.querySelector('[data-testid="gauge-needle"]'), main = document.querySelector('main')
    const g = document.querySelector('[data-sheet-ghost]'), panel = g?.children[1]
    let gy = null
    if (panel) { const m = new DOMMatrix(getComputedStyle(panel).transform); gy = panel.offsetHeight ? m.m42 / panel.offsetHeight : null }
    S.push({
      // vd: the angle actually drawn (computed transform), so a CSS transition lagging behind would show
      vd: n ? (() => { const m = new DOMMatrix(getComputedStyle(n).transform); return Math.atan2(m.b, m.a) * 180 / Math.PI })() : null,
      t: performance.now() - t0, home: !!n, big: txt('balance'), sd: n ? Number(n.dataset.shownDeg) : null, td: n ? Number(n.dataset.deg) : null,
      eaten: txt('eaten'), ex: txt('eq-burned'), bal: txt('eq-balance'), st: main?.scrollTop ?? null, flash: document.querySelectorAll('.row-flash').length,
      toast: !!document.querySelector('[data-testid="toast"]'), ghost: !!g, gy, dialog: !!document.querySelector('[data-testid="sheet"]'),
    })
    if (!window.__stop && performance.now() - t0 < 6000) requestAnimationFrame(loop)
  }
  requestAnimationFrame(loop)
}
// Watch for the closing copy of a sheet: when it arrives, what it is, how it moves, when it goes.
const GHOST_WATCH = () => {
  const t0 = performance.now(), G = { t0, act: null, add: null, gone: null, frames: [], info: null }
  window.__G = G
  // the user's action (key, tap, click): the copy has to be there within a frame or two of it
  // (the last input event before the copy appeared; a tap's click can trail its touchend)
  const evs = []
  for (const ev of ['keydown', 'pointerup', 'touchend', 'click']) document.addEventListener(ev, () => { evs.push(performance.now() - t0) }, { capture: true })
  const mo = new MutationObserver(() => {
    const g = document.querySelector('[data-sheet-ghost]')
    if (g && G.add == null) {
      G.add = performance.now() - t0
      G.act = evs.filter((x) => x <= G.add).at(-1) ?? null
      const panel = g.children[1], shade = g.children[0], cs = getComputedStyle(panel), ss = getComputedStyle(shade), gs = getComputedStyle(g)
      G.info = {
        inert: g.hasAttribute('inert'), hidden: g.getAttribute('aria-hidden'), ids: g.querySelectorAll('[data-testid],[id],[role]').length + (g.hasAttribute('data-testid') ? 1 : 0),
        pe: gs.pointerEvents, cls: g.className, panelAnim: [cs.animationName, cs.animationDuration, cs.animationTimingFunction], shadeAnim: [ss.animationName, ss.animationDuration, ss.animationTimingFunction],
        ghostAnim: [gs.animationName, gs.animationDuration], liveDialogs: document.querySelectorAll('[data-testid="sheet"]').length,
      }
      const loop = () => {
        if (!g.isConnected) return
        const m = new DOMMatrix(getComputedStyle(panel).transform)
        G.frames.push({ t: performance.now() - t0, y: panel.offsetHeight ? m.m42 / panel.offsetHeight : 0, shade: Number(getComputedStyle(shade).opacity), op: Number(getComputedStyle(g).opacity) })
        requestAnimationFrame(loop)
      }
      requestAnimationFrame(loop)
    }
    if (G.add != null && G.gone == null && !g) { G.gone = performance.now() - t0; mo.disconnect() }
  })
  mo.observe(document.body, { childList: true, subtree: true })
}

const browser = await webkit.launch()
for (const reduce of [false, true]) for (const [w, h] of [[390, 844], [375, 667]]) {
  const tag = `${w}x${h}${reduce ? ' reduced' : ''}`
  const shotTag = `${w}x${h}`
  let slow = false, nSet = 0
  const ctx = await browser.newContext({ ...devices['iPhone 14'], viewport: { width: w, height: h }, deviceScaleFactor: 3, hasTouch: true, isMobile: true, serviceWorkers: 'block', timezoneId: 'Asia/Jakarta', reducedMotion: reduce ? 'reduce' : 'no-preference' })
  await ctx.route('https://generativelanguage.googleapis.com/**', async (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS })
    if (slow) await new Promise((r) => setTimeout(r, 2500))
    return route.fulfill({ status: 200, contentType: 'application/json', headers: CORS, body: JSON.stringify(geminiOk(set(++nSet))) }).catch(() => {})
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
  const dialog = page.getByTestId('sheet')
  const box = (loc) => loc.evaluate((e) => { const r = e.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height } })
  const tapLoc = async (loc) => { await loc.scrollIntoViewIfNeeded(); const b = await box(loc); await page.touchscreen.tap(b.l + b.w / 2, b.t + b.h / 2) }
  const settle = () => page.waitForTimeout(reduce ? 300 : 1300)
  const home = async () => { await page.goto(BASE + '/'); await page.getByTestId('balance').waitFor(); await settle() }
  const shot = (name) => page.screenshot({ path: `${OUT}v121-${name}-${shotTag}.png` })
  const raw = () => page.evaluate(() => Object.fromEntries(['v1', 'v2', 'ai', 'foods', 'ideas'].map((k) => [k, localStorage.getItem(`calorie-app:${k}`)])))
  const nav = (path) => page.evaluate((p) => { history.pushState({}, '', `/calorie-app${p}`); dispatchEvent(new PopStateEvent('popstate')) }, path)
  const samples = async (ms) => { await page.waitForTimeout(ms); return page.evaluate(() => { window.__stop = true; return window.__S }) }
  const ghost = async (ms = 700) => { await page.waitForTimeout(ms); return page.evaluate(() => window.__G) }
  // 44 px tap (min > 0), inside the sheet and the screen, no text clipped
  const fits = async (loc, what, min = 44) => {
    const r = await loc.evaluate((e) => { const b = e.getBoundingClientRect(), d = e.closest('[data-testid=sheet]').getBoundingClientRect(); return { h: b.height, l: b.left, r: b.right, dl: d.left, dr: d.right, sw: e.scrollWidth, cw: e.clientWidth, vw: innerWidth } })
    if (min) assert.ok(r.h >= min, `${what}: ${r.h}px tall`)
    assert.ok(r.l >= r.dl - 0.5 && r.r <= r.dr + 0.5 && r.r <= r.vw + 0.5, `${what}: inside the sheet ${JSON.stringify(r)}`)
    assert.ok(r.sw <= r.cw + 1, `${what}: no clipped text ${JSON.stringify(r)}`)
  }
  const color = (loc) => loc.evaluate((e) => getComputedStyle(e).color)
  const openIdeas = async () => { await tapLoc(page.getByTestId('ideas-link')); await dialog.waitFor(); await dialog.getByTestId('ideas-list').waitFor() }

  // A closing sheet: a copy slides down 250 ms ease-in with the scrim fading (reduced motion: 150 ms fade), inert,
  // hidden from assistive tech, no test ids, gone right after; the real dialog leaves at once.
  const checkGhost = (G, what) => {
    assert.ok(G.add != null && G.act != null && G.add - G.act < 120, `${what}: closing copy appears at once (${G.act} -> ${G.add})`)
    assert.ok(G.gone != null, `${what}: copy removed`)
    const i = G.info
    assert.equal(i.inert, true); assert.equal(i.hidden, 'true'); assert.equal(i.ids, 0, 'no test ids, ids or roles in the copy'); assert.equal(i.pe, 'none')
    if (reduce) {
      assert.match(i.cls, /sheet-ghost-fade/)
      assert.deepEqual(i.ghostAnim, ['fade-out', '0.15s'], `${what}: reduced = quick fade`)
      assert.ok(G.gone - G.act < 500, `${what}: fade done in ${G.gone - G.act}`)
      assert.ok(G.frames.every((f) => Math.abs(f.y) < 0.01), 'no slide with reduced motion')
    } else {
      assert.deepEqual(i.panelAnim, ['sheet-down', '0.25s', 'cubic-bezier(0.4, 0, 1, 1)'], `${what}: slide down 250 ms ease-in`)
      assert.deepEqual(i.shadeAnim, ['fade-out', '0.25s', 'cubic-bezier(0.4, 0, 1, 1)'], `${what}: scrim fades with it`)
      assert.ok(G.gone - G.act >= 240 && G.gone - G.act < 700, `${what}: lasts ${G.gone - G.act} ms from the action`)
      const mid = G.frames.filter((f) => f.y > 0.05 && f.y < 0.95)
      assert.ok(mid.length >= 1, `${what}: seen mid-slide ${JSON.stringify(G.frames.map((f) => +f.y.toFixed(2)))}`)
      for (let k = 1; k < G.frames.length; k++) assert.ok(G.frames[k].y >= G.frames[k - 1].y - 0.001, 'only moves down')
      // ease-in: slow start (first quarter of the time covers less than a quarter of the way)
      const early = G.frames.filter((f) => f.t - G.add < 80)
      if (early.length) assert.ok(early.every((f) => f.y < 0.35), `${what}: eases in ${JSON.stringify(early)}`)
    }
  }

  await step(`${tag} 9) migration: a v1.20.x day with 5 used shows "Show other ideas · 2 left today", N in muted text`, async () => {
    await home()
    await openIdeas()
    const more = dialog.getByTestId('ideas-more')
    assert.equal(await more.innerText(), 'Show other ideas · 2 left today')
    assert.equal(await page.getByRole('button', { name: 'Show other ideas · 2 left today' }).count(), 1, 'accessible name')
    const [cMore, cLeft, cFoot] = await Promise.all([color(more), color(dialog.getByTestId('ideas-left')), color(dialog.getByTestId('ideas-foot'))])
    assert.equal(cLeft, cFoot, 'count in the muted ink'); assert.notEqual(cLeft, cMore, 'count not in the button ink')
    assert.equal(await dialog.getByTestId('ideas-left').evaluate((e) => getComputedStyle(e).fontWeight), '400')
    assert.equal(await dialog.getByTestId('ideas-capped').count(), 0)
    await fits(more, 'Show other ideas')
    await dialog.getByTestId('ideas-more').scrollIntoViewIfNeeded(); await page.waitForTimeout(150)
    await shot('ideas-left')
  })

  await step(`${tag} 6) + 7) each refresh counts down (1 left), then at 0 the muted "${MUTE_LINE}" replaces the button; ideas and local picks stay`, async () => {
    await tapLoc(dialog.getByTestId('ideas-more'))
    await dialog.getByText(`Idea ${nSet}a`).waitFor()
    assert.equal(await dialog.getByTestId('ideas-more').innerText(), 'Show other ideas · 1 left today')
    assert.equal(JSON.parse((await raw()).ideas).count, 6)
    await tapLoc(dialog.getByTestId('ideas-more'))
    await dialog.getByText(`Idea ${nSet}a`).waitFor()
    assert.equal(JSON.parse((await raw()).ideas).count, 7)
    assert.equal(await dialog.getByTestId('ideas-more').count(), 0)
    const capped = dialog.getByTestId('ideas-capped')
    assert.equal(await capped.innerText(), MUTE_LINE)
    assert.equal(await color(capped), await color(dialog.getByTestId('ideas-foot')), 'muted line')
    assert.deepEqual(await dialog.locator('[data-testid=idea][data-source=ai] [data-testid=idea-name]').allInnerTexts(), [`Idea ${nSet}a`, `Idea ${nSet}b`, `Idea ${nSet}c`], 'current ideas stay')
    assert.ok(await dialog.getByTestId('ideas-picks').getByTestId('idea').count() >= 1, 'local picks stay')
    await capped.scrollIntoViewIfNeeded(); await page.waitForTimeout(150)
    await shot('ideas-capped')
  })

  await step(`${tag} 8) at 0 "+ Custom" is muted (still tappable) and a tap shows "${MUTE_LINE}" instead of the field`, async () => {
    const chip = dialog.getByTestId('custom-chip')
    assert.equal(await chip.innerText(), '+ Custom')
    assert.equal(await chip.evaluate((b) => b.disabled), false, 'takes the tap'); assert.equal(await chip.getAttribute('aria-disabled'), 'true')
    assert.equal(await color(chip), await color(dialog.getByTestId('ideas-foot')), 'muted chip')
    const asked = nSet
    await tapLoc(chip); await page.waitForTimeout(250)
    assert.equal(await dialog.getByTestId('custom-input').count(), 0, 'no field')
    assert.equal(await dialog.getByTestId('custom-capped').innerText(), MUTE_LINE)
    await fits(chip, '+ Custom'); await fits(dialog.getByTestId('custom-capped'), 'custom line', 0); await fits(dialog.getByTestId('ideas-capped'), 'capped line', 0)
    assert.equal(nSet, asked, 'no AI call'); assert.equal(JSON.parse((await raw()).ideas).count, 7)
    await dialog.evaluate((d) => { d.scrollTop = 0 }); await page.waitForTimeout(100)
    await shot('custom-capped')
    await page.keyboard.press('Escape'); await dialog.waitFor({ state: 'detached' })
    await openIdeas()
    assert.equal(await dialog.getByTestId('ideas-capped').innerText(), MUTE_LINE, 'still at 0 on reopen')
    await page.keyboard.press('Escape'); await dialog.waitFor({ state: 'detached' })
  })

  await step(`${tag} 9) resets at local midnight: yesterday's 7 shows 7 left today; a stray count past 7 clamps at 0`, async () => {
    await page.evaluate((d) => localStorage.setItem('calorie-app:ideas', JSON.stringify({ date: d, count: 7 })), ago(1))
    await home(); await openIdeas()
    assert.equal(await dialog.getByTestId('ideas-more').innerText(), 'Show other ideas · 7 left today')
    await page.keyboard.press('Escape'); await dialog.waitFor({ state: 'detached' })
    await page.evaluate((d) => localStorage.setItem('calorie-app:ideas', JSON.stringify({ date: d, count: 9 })), TODAY)
    await home(); await openIdeas()
    assert.equal(await dialog.getByTestId('ideas-capped').innerText(), MUTE_LINE)
    await page.keyboard.press('Escape'); await dialog.waitFor({ state: 'detached' })
    await page.evaluate((d) => localStorage.setItem('calorie-app:ideas', JSON.stringify({ date: d, count: 5 })), TODAY)
  })

  await step(`${tag} 3) sheets close with the slide (Escape, scrim tap, Cancel button), never vanish; swipe close uses the same 250 ms ease-in`, async () => {
    await home()
    // Escape
    await nav('/log'); await page.getByTestId('qa-btn').waitFor()
    await page.getByTestId('qa-btn').click(); await dialog.waitFor(); await page.waitForTimeout(400)
    await page.evaluate(GHOST_WATCH)
    await page.keyboard.press('Escape')
    assert.equal(await dialog.count(), 0, 'the real dialog leaves at once')
    checkGhost(await ghost(), 'Escape')
    // Scrim
    await page.getByTestId('qa-btn').click(); await dialog.waitFor(); await page.waitForTimeout(400)
    await page.evaluate(GHOST_WATCH)
    await page.touchscreen.tap(w / 2, 20)
    checkGhost(await ghost(), 'scrim')
    // Swipe close: the release transition is the same motion.
    await page.getByTestId('qa-btn').click(); await dialog.waitFor(); await page.waitForTimeout(400)
    const sw = await dialog.evaluate((d) => { d.dataset.closing = ''; const c = getComputedStyle(d), s = getComputedStyle(d.previousElementSibling); const r = [c.transitionProperty, c.transitionDuration, c.transitionTimingFunction, s.transitionDuration, s.transitionTimingFunction]; delete d.dataset.closing; return r })
    if (!reduce) assert.deepEqual(sw, ['translate, transform', '0.25s, 0.25s', 'cubic-bezier(0.4, 0, 1, 1), cubic-bezier(0.4, 0, 1, 1)', '0.25s', 'cubic-bezier(0.4, 0, 1, 1)'])
    await page.keyboard.press('Escape'); await dialog.waitFor({ state: 'detached' }); await page.waitForTimeout(400)
    // A close button: Cancel while Ideas are loading.
    await home()
    slow = true
    await tapLoc(page.getByTestId('ideas-link')); await dialog.getByTestId('ideas-loading').waitFor(); await page.waitForTimeout(300)
    await page.evaluate(GHOST_WATCH)
    await tapLoc(dialog.getByRole('button', { name: 'Cancel' }))
    checkGhost(await ghost(), 'Cancel')
    slow = false
    await page.waitForTimeout(2600)
  })

  await step(`${tag} 3) a sheet handing over to another sheet does not slide (Ideas -> AI result), and logging from it lands on Home`, async () => {
    await home(); await openIdeas()
    await dialog.locator('[data-testid=idea][data-source=ai]').first().waitFor({ timeout: 8000 }).catch(async () => { throw new Error('no AI ideas: ' + (await dialog.innerText())) })
    await page.evaluate(GHOST_WATCH)
    await tapLoc(dialog.locator('[data-testid=idea][data-source=ai]').first().getByRole('button', { name: /^Log this/ }))
    await dialog.getByRole('button', { name: /^Log 1 item/ }).waitFor()
    await page.waitForTimeout(400)
    assert.equal((await page.evaluate(() => window.__G)).add, null, 'no closing copy on a hand-over')
    await page.evaluate(GHOST_WATCH); await page.evaluate(SAMPLER)
    await tapLoc(dialog.getByRole('button', { name: /^Log 1 item/ }))
    checkGhost(await ghost(800), 'log from Ideas')
    const S = await samples(reduce ? 600 : 1800)
    assert.ok(S.some((s) => s.flash > 0), 'row highlighted')
    await page.waitForTimeout(5000)
  })

  await step(`${tag} 1) + 3) + 4) log from a sheet: closing slide, toast at once, gauge needle + big number + Eaten + Deficit count in view and in step, then scroll + highlight`, async () => {
    await home()
    const old = { big: num(await page.getByTestId('balance').textContent()), deg: Number(await page.getByTestId('gauge-needle').getAttribute('data-deg')), eaten: num(await page.getByTestId('eaten').textContent()), bal: num(await page.getByTestId('eq-balance').textContent()) }
    await nav('/log'); await page.getByTestId('qa-btn').waitFor()
    await page.getByTestId('qa-btn').click(); await dialog.waitFor()
    await dialog.locator('input[name=kcal]').fill('300')
    await page.waitForTimeout(300)
    await page.evaluate(SAMPLER); await page.evaluate(GHOST_WATCH)
    await dialog.getByRole('button', { name: /^Add 300 kcal/ }).click()
    if (!reduce) { await page.waitForTimeout(330); await shot('home-mid') }
    const S = (await samples(reduce ? 1500 : 2700)).filter((s) => s.home)
    const G = await page.evaluate(() => window.__G)
    checkGhost(G, 'logging')
    const e = (await page.evaluate(() => JSON.parse(localStorage.getItem('calorie-app:v3')))).entries.filter((x) => x.kcal === 300).sort((a, b) => b.createdAt - a.createdAt)[0]
    assert.equal(e.meal, 'dinner')
    if (process.env.DUMP) console.log(JSON.stringify({ old, G: G.add, S: S.slice(0, 50).map((s) => [Math.round(s.t), s.big, s.sd, s.td, s.eaten, s.bal, s.st, s.flash]) }))
    const last = S.at(-1)
    const nw = { big: num(last.big), deg: last.td, eaten: num(last.eaten), bal: num(last.bal) }
    assert.deepEqual([nw.big, nw.eaten, nw.bal], [old.big - 300, old.eaten + 300, old.bal - 300], 'final values')
    assert.ok(Math.abs(last.sd - last.td) < 0.11, 'needle ends on its target')
    assert.ok(S.find((s) => s.toast)?.t - S[0].t < 150, 'toast shows at once')
    const row = () => page.evaluate((id) => { const r = document.querySelector(`[data-ids~="${id}"]`).getBoundingClientRect(), m = document.querySelector('main').getBoundingClientRect(); return { t: r.top - m.top, b: m.bottom - r.bottom, cls: document.querySelector(`[data-ids~="${id}"]`).className } }, e.id)
    if (reduce) {
      for (const s of S) assert.deepEqual([num(s.big), num(s.eaten), num(s.bal), s.sd], [nw.big, nw.eaten, nw.bal, s.td], 'reduced: values final on the first frame')
      const lit = S.find((s) => s.flash > 0)
      assert.ok(lit && lit.t - S[0].t < 200, 'reduced: highlight at once')
      const moved = S.find((s) => s.st > 0)
      if (moved) assert.ok(moved.t - S[0].t < 300, 'reduced: scrolls at once')
    } else {
      // the first Home frame still shows the old values: nothing jumps ahead
      assert.ok(Math.abs(num(S[0].big) - old.big) <= 15, `starts from ${S[0].big}, was ${old.big}`)
      assert.ok(Math.abs(S[0].sd - old.deg) < 1.5, `needle starts at ${S[0].sd}, was ${old.deg}`)
      const mids = S.filter((s) => num(s.big) !== old.big && num(s.big) !== nw.big)
      assert.ok(mids.length >= 4, `big number counts (${mids.length} frames between)`)
      assert.ok(S.filter((s) => num(s.eaten) !== old.eaten && num(s.eaten) !== nw.eaten).length >= 4, 'Eaten counts')
      assert.ok(S.filter((s) => num(s.bal) !== old.bal && num(s.bal) !== nw.bal).length >= 4, 'Deficit counts')
      // in step: number, needle, Eaten and Deficit share one progress at every frame. Each is drawn by its own
      // component, so a frame can catch one a frame behind: allow the number's progress one frame either side.
      const P = S.map((s) => ({ t: s.t, b: (num(s.big) - old.big) / (nw.big - old.big), n: (s.sd - old.deg) / (nw.deg - old.deg), e: (num(s.eaten) - old.eaten) / (nw.eaten - old.eaten), d: (num(s.bal) - old.bal) / (nw.bal - old.bal), v: (s.vd - old.deg) / (nw.deg - old.deg) }))
      inStep(P, ['n', 'v', 'e', 'd'])
      // the count runs only once the closing sheet has gone, and takes about 600 ms
      const start = S.find((s) => num(s.big) !== old.big), done = S.find((s) => num(s.big) === nw.big && Math.abs(s.sd - s.td) < 0.11)
      assert.ok(start.t >= G.add + 200 - 40, `count starts after the sheet slid away (${start.t.toFixed(0)} vs ${G.add.toFixed(0)})`)
      assert.ok(done.t - start.t >= 450 && done.t - start.t < 900, `count ${done.t - start.t} ms`)
      // the gauge stays in view (Home at the top) until the count is done; then scroll + highlight
      const st0 = S[0].st
      for (const s of S.filter((s) => s.t < done.t - 30)) { assert.equal(s.st, st0, `no scroll during the count (${s.t.toFixed(0)})`); assert.equal(s.flash, 0, 'no highlight yet') }
      const lit = S.find((s) => s.flash > 0)
      assert.ok(lit && lit.t >= done.t - 50 && lit.t < done.t + 300, `highlight after the count (${lit?.t} vs ${done.t})`)
    }
    await page.waitForTimeout(reduce ? 200 : 600)
    const r = await row()
    assert.ok(r.t >= -1 && r.b >= -1, `new row scrolled into view ${JSON.stringify(r)}`)
    await page.waitForTimeout(5200)
  })

  await step(`${tag} 4) counts wait while the gauge is off screen: edit a row at the bottom, the number holds, scroll up, it counts`, async () => {
    await home()
    const before = num(await page.getByTestId('balance').textContent())
    await page.evaluate(() => { const m = document.querySelector('main'); m.scrollTop = m.scrollHeight })
    await page.waitForTimeout(400)
    const vis = await page.getByTestId('ring').evaluate((r) => { const a = r.getBoundingClientRect(), m = r.closest('main').getBoundingClientRect(); return Math.max(0, Math.min(a.bottom, m.bottom) - Math.max(a.top, m.top)) / a.height })
    if (vis < 0.4) {
      await tapLoc(page.locator('[data-ids~="q2"]'))
      await dialog.waitFor(); await dialog.locator('input[name=kcal]').fill('520'); await page.waitForTimeout(200)
      await dialog.getByRole('button', { name: /^Save/ }).click(); await dialog.waitFor({ state: 'detached' })
      await page.waitForTimeout(1200)
      if (!reduce) assert.equal(num(await page.getByTestId('balance').textContent()), before, 'held while off screen')
      await page.evaluate(SAMPLER)
      await page.evaluate(() => document.querySelector('main').scrollTo({ top: 0 }))
      const S = (await samples(reduce ? 400 : 1400)).filter((s) => s.home)
      assert.equal(num(S.at(-1).big), before - 100)
      if (!reduce) assert.ok(S.filter((s) => num(s.big) !== before && num(s.big) !== before - 100).length >= 3, 'counts in view')
      await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('calorie-app:v3')); s.entries.find((e) => e.id === 'q2').kcal = 420; localStorage.setItem('calorie-app:v3', JSON.stringify(s)) })
    } else results.push(`NOTE ${tag}: Home too short to hide the gauge, hold step skipped`)
  })

  await step(`${tag} 2) back on Home from another tab with a changed value: the needle sweeps in step with the number, no jump`, async () => {
    await home()
    const old = { big: num(await page.getByTestId('balance').textContent()), deg: Number(await page.getByTestId('gauge-needle').getAttribute('data-deg')) }
    await page.getByRole('link', { name: /^Me/ }).click(); await page.locator('#movement').waitFor()
    await page.locator('#movement').check(); await page.getByRole('button', { name: 'Save changes' }).click(); await page.getByText('Saved.').waitFor()
    await page.evaluate(SAMPLER)
    await page.getByRole('link', { name: /^Today|^Home/ }).first().click()
    const S = (await samples(reduce ? 500 : 1500)).filter((s) => s.home)
    const last = S.at(-1), nw = { big: num(last.big), deg: last.td }
    assert.ok(nw.big > old.big + 50 && nw.deg !== old.deg, `value changed ${old.big} -> ${nw.big}`)
    if (reduce) for (const s of S) assert.deepEqual([num(s.big), s.sd], [nw.big, s.td], 'reduced: instant')
    else {
      assert.ok(Math.abs(S[0].sd - old.deg) < 1.5 && Math.abs(num(S[0].big) - old.big) <= 15, `first frame: needle ${S[0].sd} (was ${old.deg}), number ${S[0].big}`)
      assert.ok(S.filter((s) => num(s.big) !== old.big && num(s.big) !== nw.big).length >= 4, 'counts')
      inStep(S.map((s) => ({ t: s.t, b: (num(s.big) - old.big) / (nw.big - old.big), n: (s.sd - old.deg) / (nw.deg - old.deg), v: (s.vd - old.deg) / (nw.deg - old.deg) })), ['n', 'v'])
    }
    assert.ok(Math.abs(last.sd - last.td) < 0.11)
    await page.evaluate((p) => { const s = JSON.parse(localStorage.getItem('calorie-app:v3')); s.profile.includeMovement = false; localStorage.setItem('calorie-app:v3', JSON.stringify(s)) })
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
