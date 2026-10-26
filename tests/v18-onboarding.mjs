// v1.8 onboarding: welcome (plate-in-ring illustration, Get started, Restore a backup), one question per screen with a
// thin progress bar (sex, age, height + weight, goal, activity, pace; pace skipped for Keep), the target reveal (count-up,
// "How we worked this out" sheet), then a skippable extras screen. New profiles start with daily movement on; the 20%
// deficit cap is gone (floor only). Existing v2 profiles are never sent back to onboarding and their storage is untouched.
// Screenshots at 390x844 and 375x667: screenshots/v18-*.png. Nothing may overflow at 375x667.
// Usage: npm run build && npx vite preview --port 4174 & node tests/v18-onboarding.mjs
import { chromium } from 'playwright'
import assert from 'node:assert/strict'
import { writeFileSync } from 'node:fs'

const BASE = (process.env.BASE_URL ?? 'http://localhost:4174/calorie-app').replace(/\/$/, '')
const OUT = new URL('../screenshots/', import.meta.url).pathname
const TMP = new URL('../node_modules/.tmp/', import.meta.url).pathname
const results = [], errors = []
const step = async (name, fn) => {
  const t = Date.now()
  try { await fn(); results.push(`PASS ${name} (${Date.now() - t} ms)`) } catch (e) { results.push(`FAIL ${name}: ${e.message}`); console.log(results.join('\n')); throw e }
}
const watch = (pg) => {
  pg.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`${m.type()}: ${m.text()}`) })
  pg.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
}
const num = async (loc) => Number((await loc.innerText()).replace(/[^0-9]/g, ''))
const pnow = (pg) => pg.getByRole('progressbar').first().getAttribute('aria-valuenow').then(Number)
const browser = await chromium.launch()
const ctxFor = (w, h, reduce = true) => browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, reducedMotion: reduce ? 'reduce' : 'no-preference' })
const fresh = async (ctx) => {
  const pg = await ctx.newPage(); watch(pg)
  await pg.goto(BASE + '/')
  await pg.evaluate(() => localStorage.clear())
  await pg.goto(BASE + '/')
  await pg.waitForURL('**/onboarding')
  await pg.getByTestId('ob-welcome').waitFor()
  return pg
}
/** Walk to the activity step and pick it. Answers default to the 32-year-old 92 kg 175 cm man (Jordy's simulation). */
const answer = async (pg, { sex = 'male', age = 32, h = 175, w = 92, goal = 'lose', act = 'light' } = {}) => {
  await pg.getByTestId('ob-start').click()
  await pg.getByTestId(`ob-sex-${sex}`).click()
  await pg.getByTestId('ob-age').fill(String(age)); await pg.getByTestId('ob-next').click()
  await pg.getByTestId('ob-height').fill(String(h)); await pg.getByTestId('ob-weight').fill(String(w)); await pg.getByTestId('ob-next').click()
  await pg.getByTestId(`ob-goal-${goal}`).click()
  await pg.getByTestId(`ob-act-${act}`).click()
}
const ls = (pg) => pg.evaluate(() => JSON.parse(localStorage.getItem('calorie-app:v2')))
/** Nothing sticks out sideways, and the step's main button (if any) is on screen without scrolling. */
const noOverflow = async (pg, what) => {
  const r = await pg.evaluate(() => {
    const W = innerWidth, H = innerHeight
    const wide = [...document.querySelectorAll('main *')].filter((el) => { const b = el.getBoundingClientRect(); return b.width > 0 && (b.right > W + 0.5 || b.left < -0.5) }).map((el) => el.dataset.testid || el.tagName + '.' + (el.className?.baseVal ?? el.className)).slice(0, 5)
    const main = document.querySelector('main')
    const btn = document.querySelector('[data-testid=ob-next],[data-testid=ob-start],[data-testid=ob-done]')
    const bb = btn?.getBoundingClientRect()
    return { docW: document.documentElement.scrollWidth, W, H, wide, mainScroll: main.scrollHeight - main.clientHeight, mainX: main.scrollWidth - main.clientWidth, btnBottom: bb?.bottom ?? 0 }
  })
  assert.ok(r.docW <= r.W, `${what}: page is ${r.docW}px wide at ${r.W}`)
  assert.equal(r.mainX, 0, `${what}: main scrolls sideways`)
  assert.deepEqual(r.wide, [], `${what}: elements outside the viewport`)
  assert.ok(r.mainScroll <= 1, `${what}: content taller than the screen by ${r.mainScroll}px`)
  assert.ok(r.btnBottom <= r.H, `${what}: main button below the fold (${r.btnBottom} > ${r.H})`)
}

// ---------- Welcome, illustration, reduced motion ----------
await step('welcome: app name, one line, Get started, Restore a backup, plate-in-ring illustration (inline SVG, single variant)', async () => {
  const ctx = await ctxFor(390, 844)
  const pg = await fresh(ctx)
  const w = pg.getByTestId('ob-welcome')
  assert.equal(await w.getByRole('heading', { level: 1 }).innerText(), 'Calorie counter')
  assert.match(await w.innerText(), /Know your daily calories in a minute\. Everything stays on your phone\./)
  assert.equal(await pg.getByTestId('ob-start').innerText(), 'Get started')
  assert.equal(await w.getByRole('button', { name: 'Restore a backup' }).count(), 1)
  const art = pg.getByTestId('welcome-art')
  assert.equal(await art.evaluate((el) => el.tagName.toLowerCase()), 'svg')
  assert.equal(await art.getAttribute('aria-hidden'), 'true')
  assert.equal(await art.getAttribute('data-variant'), null) // only variant A ships, no preview helper
  assert.equal(await art.locator('image, use[href^=http]').count(), 0) // fully inline, works offline
  assert.ok((await art.locator('path, circle').count()) > 5)
  const bb = await art.boundingBox(); assert.ok(bb.width > 150 && bb.height > 120, JSON.stringify(bb))
  // No progress bar or back button on the welcome screen.
  assert.equal(await pg.getByRole('progressbar').count(), 0)
  assert.equal(await pg.getByTestId('ob-back').count(), 0)
  // The ?art= preview helper is gone: the param changes nothing.
  await pg.goto(BASE + '/onboarding?art=snap'); await pg.getByTestId('welcome-art').waitFor()
  assert.equal(await pg.getByTestId('welcome-art').getAttribute('data-variant'), null)
  await ctx.close()
})
await step('reduced motion: no animation on welcome, steps or the target reveal (number shown at once)', async () => {
  const ctx = await ctxFor(390, 844, true)
  const pg = await fresh(ctx)
  const running = () => pg.evaluate(() => document.getAnimations().filter((a) => a.playState === 'running').length)
  await pg.waitForTimeout(100)
  assert.equal(await running(), 0)
  const styles = await pg.getByTestId('welcome-art').evaluate((svg) => [...svg.querySelectorAll('.wa-draw, .wa-pop, .wa-fade, .wa-steam')].map((el) => getComputedStyle(el).animationName))
  assert.ok(styles.length > 0 && styles.every((n) => n === 'none'), styles.join())
  await answer(pg)
  assert.equal(await running(), 0)
  await pg.getByTestId('ob-next').click()
  assert.equal(await num(pg.getByTestId('target')), 2006) // straight to the final number, no count-up
  assert.equal(await running(), 0)
  await ctx.close()
})
await step('with motion allowed: the illustration animates and the target counts up', async () => {
  const ctx = await ctxFor(390, 844, false)
  const pg = await fresh(ctx)
  const names = await pg.getByTestId('welcome-art').evaluate((svg) => [...svg.querySelectorAll('.wa-draw, .wa-pop')].map((el) => getComputedStyle(el).animationName))
  assert.ok(names.some((n) => n !== 'none'), names.join())
  await answer(pg)
  await pg.getByTestId('ob-next').click()
  const first = await num(pg.getByTestId('target'))
  assert.ok(first < 2006, `starts below the target (${first})`)
  await pg.waitForFunction(() => document.querySelector('[data-testid=target]').textContent === '2,006', null, { timeout: 3000 })
  await ctx.close()
})

// ---------- Flow ----------
await step('step order sex, age, body, goal, activity, pace, target, extras; progress bar advances every step', async () => {
  const ctx = await ctxFor(390, 844)
  const pg = await fresh(ctx)
  const seen = []
  const where = async () => (await pg.locator('main h1').first().innerText())
  await pg.getByTestId('ob-start').click()
  seen.push([await where(), await pnow(pg)])
  await pg.getByTestId('ob-sex-male').click()
  await pg.getByTestId('ob-age').waitFor(); seen.push([await where(), await pnow(pg)])
  assert.equal(await pg.getByTestId('ob-next').isDisabled(), true) // Continue waits for a valid age
  await pg.getByTestId('ob-age').fill('32'); await pg.getByTestId('ob-next').click()
  await pg.getByTestId('ob-height').waitFor(); seen.push([await where(), await pnow(pg)])
  await pg.getByTestId('ob-height').fill('175'); await pg.getByTestId('ob-weight').fill('92'); await pg.getByTestId('ob-next').click()
  await pg.getByTestId('ob-goal-lose').waitFor(); seen.push([await where(), await pnow(pg)])
  await pg.getByTestId('ob-goal-lose').click()
  await pg.getByTestId('ob-act-light').waitFor(); seen.push([await where(), await pnow(pg)])
  await pg.getByTestId('ob-act-light').click()
  await pg.getByTestId('ob-pace').waitFor(); seen.push([await where(), await pnow(pg)])
  await pg.getByTestId('ob-next').click()
  await pg.getByTestId('ob-target').waitFor(); seen.push(['target', await pnow(pg)])
  assert.deepEqual(seen.map((s) => s[0]), ["What's your sex?", 'How old are you?', 'Your height and weight', "What's your goal?", 'How active is a normal week?', 'How fast should you lose?', 'target'])
  const vals = seen.map((s) => s[1])
  for (let i = 1; i < vals.length; i++) assert.ok(vals[i] > vals[i - 1], `progress ${vals.join(' -> ')}`)
  assert.equal(vals.at(-1), 100)
  assert.equal(await pg.getByRole('progressbar').getAttribute('aria-label'), 'All questions answered')
  // Back goes to the previous question with the answer kept.
  await pg.getByTestId('ob-back').click()
  assert.equal(await pg.getByTestId('ob-pace-standard').getAttribute('aria-pressed'), 'true')
  await pg.getByTestId('ob-back').click()
  assert.equal(await pg.getByTestId('ob-act-light').getAttribute('aria-pressed'), 'true')
  await ctx.close()
})
await step('Keep skips pace: activity goes straight to the target; 5 questions, not 6', async () => {
  const ctx = await ctxFor(390, 844)
  const pg = await fresh(ctx)
  await pg.getByTestId('ob-start').click()
  assert.equal(await pg.getByRole('progressbar').getAttribute('aria-label'), 'Question 1 of 6')
  await pg.getByTestId('ob-sex-male').click()
  await pg.getByTestId('ob-age').fill('32'); await pg.getByTestId('ob-next').click()
  await pg.getByTestId('ob-height').fill('175'); await pg.getByTestId('ob-weight').fill('92'); await pg.getByTestId('ob-next').click()
  await pg.getByTestId('ob-goal-keep').click()
  await pg.getByTestId('ob-act-light').waitFor()
  assert.equal(await pg.getByRole('progressbar').getAttribute('aria-label'), 'Question 5 of 5')
  await pg.getByTestId('ob-act-light').click()
  await pg.getByTestId('ob-target').waitFor()
  assert.equal(await pg.getByTestId('ob-pace').count(), 0)
  assert.equal(await num(pg.getByTestId('target')), 2556) // keep = daily burn 1859 + 697
  assert.equal(await pg.getByTestId('goal-line').innerText(), 'Keeps your current weight')
  await pg.getByTestId('ob-next').click(); await pg.getByTestId('ob-skip').click()
  await pg.waitForURL(BASE + '/')
  const p = (await ls(pg)).profile
  assert.deepEqual([p.goal, p.target, p.dailyGoal, p.includeMovement], ['keep', 2556, 0, true])
  await ctx.close()
})
await step('pace chips show real targets after the floor; no cap (male 32, 92 kg, 175 cm, light: 2281 / 2006 / 1859)', async () => {
  const ctx = await ctxFor(390, 844)
  const pg = await fresh(ctx)
  await answer(pg)
  // BMR 10x92 + 6.25x175 - 5x32 + 5 = 1859; light +697 -> 2556. Gentle -275, Standard -550, Faster -825 = 1731 -> BMR floor 1859.
  const chip = (p) => pg.getByTestId(`ob-pace-${p}`).innerText()
  assert.match(await chip('gentle'), /Gentle[\s\S]*2,281 kcal[\s\S]*about 0\.25 kg a week/)
  assert.match(await chip('standard'), /Standard[\s\S]*2,006 kcal[\s\S]*about 0\.5 kg a week/)
  assert.match(await chip('faster'), /Faster[\s\S]*1,859 kcal[\s\S]*about 0\.65 kg a week/) // held at BMR: 697 a day = 0.63 kg, to the nearest 0.05
  assert.match(await pg.getByTestId('ob-pace-hint').innerText(), /About 550 kcal a day under your 2,556 kcal daily burn/)
  await pg.getByTestId('ob-pace-faster').click()
  assert.match(await pg.getByTestId('ob-pace-hint').innerText(), /Faster is held at your resting burn \(1,859 kcal\)/)
  await pg.getByTestId('ob-pace-gentle').click()
  await pg.getByTestId('ob-next').click()
  assert.equal(await num(pg.getByTestId('target')), 2281)
  await pg.getByTestId('ob-back').click(); await pg.getByTestId('ob-pace-faster').click(); await pg.getByTestId('ob-next').click()
  assert.equal(await num(pg.getByTestId('target')), 1859)
  assert.match(await pg.getByTestId('floor-line').innerText(), /resting burn \(1,859 kcal\)/)
  await pg.getByTestId('ob-back').click(); await pg.getByTestId('ob-pace-standard').click(); await pg.getByTestId('ob-next').click()
  assert.equal(await num(pg.getByTestId('target')), 2006)
  assert.equal(await pg.getByTestId('goal-line').innerText(), 'Lose about 0.5 kg a week')
  assert.equal(await pg.getByTestId('floor-line').count(), 0)
  assert.doesNotMatch(await pg.locator('main').innerText(), /cap/i)
  // How we worked this out: BMR + movement = burn, minus the pace, = target.
  await pg.getByTestId('ob-how').click()
  const sheet = pg.getByRole('dialog', { name: 'How we worked this out' })
  const t = await sheet.innerText()
  for (const re of [/Resting burn \(BMR\)\s*1,859 kcal/, /Daily movement \(lightly active\)\s*\+697 kcal/, /Your daily burn\s*2,556 kcal/, /Standard pace\s*−550 kcal/, /Daily target\s*2,006 kcal/]) assert.match(t, re)
  assert.doesNotMatch(t, /cap/i)
  await pg.getByTestId('ob-how-close').click()
  await sheet.waitFor({ state: 'detached' })
  await ctx.close()
})
await step('pace chips read "at the minimum" when the floor swallows the pace', async () => {
  const ctx = await ctxFor(390, 844)
  const pg = await fresh(ctx)
  // 80-year-old woman, 150 cm, 40 kg, desk job: BMR 777 + 155 = 932, under the 1,200 floor for every pace.
  await answer(pg, { sex: 'female', age: 80, h: 150, w: 40, act: 'sedentary' })
  for (const p of ['gentle', 'standard', 'faster']) assert.match(await pg.getByTestId(`ob-pace-${p}`).innerText(), /1,200 kcal[\s\S]*at the minimum/, p)
  assert.match(await pg.getByTestId('ob-pace-hint').innerText(), /already at the 1,200 kcal minimum/)
  await ctx.close()
})
await step('extras are skippable (Skip and Done land on Home); a new profile has includeMovement true', async () => {
  for (const how of ['ob-skip', 'ob-done']) {
    const ctx = await ctxFor(390, 844)
    const pg = await fresh(ctx)
    await answer(pg)
    await pg.getByTestId('ob-next').click()
    await pg.getByTestId('ob-next').click()
    await pg.getByTestId('ob-extras').waitFor()
    assert.match(await pg.getByTestId('ob-a2hs').innerText(), /Add to Home Screen/)
    assert.match(await pg.getByTestId('ob-ai').innerText(), /Set up AI photo estimates/)
    await pg.getByTestId(how).click()
    await pg.waitForURL(BASE + '/')
    await pg.getByTestId('balance').waitFor()
    const st = await ls(pg)
    assert.equal(st.version, 2)
    const p = st.profile
    assert.deepEqual([p.includeMovement, p.sex, p.age, p.heightCm, p.weightKg, p.activity, p.goal, p.pace, p.bmr, p.bmrCustom, p.target, p.dailyGoal, p.goalWeightKg], [true, 'male', 32, 175, 92, 'light', 'lose', 'standard', 1859, false, 2006, 550, 92])
    assert.equal(await num(pg.getByTestId('eq-movement')), 697)
    // Same profile keys as before v1.8 (shape unchanged).
    assert.deepEqual(Object.keys(p).sort(), ['activity', 'age', 'bmr', 'bmrCustom', 'dailyGoal', 'goal', 'goalWeightKg', 'heightCm', 'includeMovement', 'macros', 'pace', 'sex', 'target', 'weightKg'])
    await pg.goto(BASE + '/onboarding'); await pg.waitForURL(BASE + '/') // never re-onboarded
    await ctx.close()
  }
})
await step('extras: "Set up AI photo estimates" saves the profile and opens key setup in Me', async () => {
  const ctx = await ctxFor(390, 844)
  const pg = await fresh(ctx)
  await answer(pg)
  await pg.getByTestId('ob-next').click(); await pg.getByTestId('ob-next').click()
  await pg.getByTestId('ob-ai').click()
  await pg.waitForURL('**/settings?ai=1')
  assert.equal((await ls(pg)).profile.includeMovement, true)
  await pg.waitForFunction(() => document.activeElement?.getAttribute('placeholder') === 'AIza…', null, { timeout: 3000 }) // the key field is focused
  await pg.waitForTimeout(500)
  assert.ok(pg.url().endsWith('/settings?ai=1'), `stays on key setup (${pg.url()})`) // not bounced to Home by the onboarding redirect
  await ctx.close()
})
await step('Restore a backup from the welcome screen restores the data and goes Home', async () => {
  const ctx = await ctxFor(390, 844)
  const pg = await fresh(ctx)
  const profile = { age: 40, sex: 'female', heightCm: 160, weightKg: 60, activity: 'moderate', goal: 'keep', pace: 'standard', goalWeightKg: 60, bmr: 1300, bmrCustom: true, includeMovement: false, target: 1300, dailyGoal: 0, macros: { protein: null, carbs: null, fat: null } }
  const data = { version: 2, profile, entries: [], exercises: [], closedDays: {}, favourites: [] }
  const file = TMP + 'v18-backup.json'
  writeFileSync(file, JSON.stringify({ app: 'calorie-counter', schema: 2, exportedAt: '2026-10-20T00:00:00.000Z', data: { 'calorie-app:v2': data } }))
  const [chooser] = await Promise.all([pg.waitForEvent('filechooser'), pg.getByRole('button', { name: 'Restore a backup' }).click()])
  await chooser.setFiles(file)
  const dlg = pg.getByRole('dialog', { name: 'Restore backup' })
  await dlg.getByRole('button', { name: 'Restore' }).click()
  await pg.waitForURL(BASE + '/')
  await pg.getByTestId('balance').waitFor()
  const p = (await ls(pg)).profile
  assert.deepEqual([p.includeMovement, p.bmr, p.goal, p.age], [false, 1300, 'keep', 40]) // a restored profile keeps its own setting
  await ctx.close()
})

// ---------- Existing users ----------
await step('existing v2 profile (movement off) is NOT sent to onboarding; calorie-app:v2 and :ai stay byte-identical', async () => {
  const ctx = await ctxFor(390, 844)
  const pg = await ctx.newPage(); watch(pg)
  const day = (i) => { const d = new Date(Date.now() - i * 864e5); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
  // Written as v1.7.1 would: woman, BMR 1600, movement off, Keep (target 1,600, goal 0: unaffected by the cap removal).
  const profile = { age: 34, sex: 'female', heightCm: 168, weightKg: 68, activity: 'light', goal: 'keep', pace: 'standard', goalWeightKg: 68, bmr: 1600, bmrCustom: true, includeMovement: false, target: 1600, dailyGoal: 0, macros: { protein: 110, carbs: null, fat: null } }
  const closedDays = { [day(2)]: { bmr: 1600, movement: 0, burned: 0, eaten: 1500, balance: 100, goal: 320, protein: 90, closedAt: Date.now() - 2 * 864e5, auto: false }, [day(1)]: { bmr: 1600, movement: 0, burned: 0, eaten: 1700, balance: -100, goal: 0, protein: 80, closedAt: Date.now() - 864e5, auto: true } }
  const entries = [{ id: 'a', date: day(2), meal: 'lunch', foodId: null, name: 'Rice', servingLabel: '1 serving', servingMult: 1, qty: 1, kcal: 1500, protein: 90, carbs: 200, fat: 30, createdAt: 1 }, { id: 'b', date: day(1), meal: 'lunch', foodId: null, name: 'Noodles', servingLabel: '1 serving', servingMult: 1, qty: 1, kcal: 1700, protein: 80, carbs: 250, fat: 40, createdAt: 2 }]
  const V2 = JSON.stringify({ version: 2, profile, entries, exercises: [], closedDays, favourites: [] })
  const AI = JSON.stringify({ provider: 'gemini', key: 'AIzaTEST-not-a-real-key-000000000000' })
  await pg.goto(BASE + '/')
  await pg.evaluate(([v2, ai]) => { localStorage.clear(); localStorage.setItem('calorie-app:v2', v2); localStorage.setItem('calorie-app:ai', ai); localStorage.setItem('calorie-app:backup', JSON.stringify({ lastExportAt: Date.now(), dismissedAt: null })) }, [V2, AI])
  for (const path of ['/', '/onboarding', '/settings', '/history', '/nutrition', '/']) {
    await pg.goto(BASE + path)
    await pg.waitForLoadState('networkidle')
    assert.ok(!pg.url().includes('/onboarding'), `sent to onboarding from ${path}`)
    assert.equal(await pg.getByTestId('onboarding').count(), 0)
  }
  await pg.getByTestId('balance').waitFor()
  assert.equal(await pg.getByTestId('eq-movement').count(), 0) // movement stays off
  const after = await pg.evaluate(() => [localStorage.getItem('calorie-app:v2'), localStorage.getItem('calorie-app:ai')])
  assert.equal(after[0], V2, 'calorie-app:v2 changed')
  assert.equal(after[1], AI, 'calorie-app:ai changed')
  await ctx.close()
})

// ---------- Screenshots + overflow ----------
for (const [w, h] of [[390, 844], [375, 667]]) {
  await step(`screenshots at ${w}x${h}: welcome, question, pace chips, target reveal, extras${w === 375 ? '; nothing overflows' : ''}`, async () => {
    const ctx = await ctxFor(w, h)
    const pg = await fresh(ctx)
    const shot = async (name) => { if (w === 375) await noOverflow(pg, name); await pg.screenshot({ path: `${OUT}v18-${name}-${w}x${h}.png` }) }
    await shot('welcome')
    await pg.getByTestId('ob-start').click()
    await pg.getByTestId('ob-sex-male').waitFor()
    await shot('question-sex')
    await pg.getByTestId('ob-sex-male').click()
    await pg.getByTestId('ob-age').fill('32')
    if (w === 375) await noOverflow(pg, 'question-age')
    await pg.getByTestId('ob-next').click()
    await pg.getByTestId('ob-height').fill('175'); await pg.getByTestId('ob-weight').fill('92')
    if (w === 375) await noOverflow(pg, 'question-body')
    await pg.getByTestId('ob-next').click()
    await pg.getByTestId('ob-goal-lose').waitFor()
    if (w === 375) await noOverflow(pg, 'question-goal')
    await pg.getByTestId('ob-goal-lose').click()
    await pg.getByTestId('ob-act-light').waitFor()
    if (w === 375) await noOverflow(pg, 'question-activity')
    await pg.getByTestId('ob-act-light').click()
    await pg.getByTestId('ob-pace').waitFor()
    await shot('pace')
    await pg.getByTestId('ob-next').click()
    await pg.getByTestId('ob-target').waitFor()
    await shot('target')
    await pg.getByTestId('ob-how').click()
    await pg.getByRole('dialog', { name: 'How we worked this out' }).waitFor()
    await pg.waitForTimeout(150)
    await pg.screenshot({ path: `${OUT}v18-how-${w}x${h}.png` })
    await pg.getByTestId('ob-how-close').click()
    await pg.getByTestId('ob-next').click()
    await pg.getByTestId('ob-extras').waitFor()
    await shot('extras')
    await ctx.close()
  })
}

await step('no console errors or warnings', async () => { assert.deepEqual(errors, []) })
await browser.close()
console.log(results.join('\n'))
console.log(`${results.length} v1.8 onboarding checks passed, no console errors`)
