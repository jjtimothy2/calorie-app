// v1.4.2 checks, shared by tests/e2e.mjs and tests/live.mjs (test data only, never in the app):
// Balance: one dashed goal line labelled 'goal 337', no mirrored -goal line, bottom fits the biggest surplus only.
// Protein: the Balance chart style (pink bars with numbers, solid = hit, light = missed, 7-day average with soft fill,
// dashed target line 'N g'), hold to scrub, swipe paging, a fixed scale that never clips, and one period shared with Balance.
import assert from 'node:assert/strict'
import { daysAgo, chartTools } from './v14-chart.mjs'
import { seedJordy, geometry, P } from './v141-chart.mjs'

const refsOf = (p, id) => p.getByTestId(id).locator('[data-ref]').evaluateAll((els) => els.map((e) => ({ r: e.getAttribute('data-ref'), label: e.querySelector('text')?.textContent ?? null, dashed: e.querySelector('line').getAttribute('stroke-dasharray') })))

export async function v142Checks(p, ctx, BASE) {
  const out = {}
  await seedJordy(p, BASE)
  const { touch, wait, box, pageNo, visibleDays, swipe } = await chartTools(p, ctx)
  await wait(1100)

  // ---- Balance: goal line relabelled, -goal line gone, bottom = biggest closed surplus (820) + 10% -> 950.
  let refs = await refsOf(p, 'chart')
  assert.deepEqual(refs, [{ r: '0', label: '0', dashed: null }, { r: '337', label: 'goal 337', dashed: '4 4' }], 'solid 0 + dashed goal line only')
  const svgText = await p.getByTestId('chart').evaluate((s) => [...s.querySelectorAll('[data-ref] text')].map((t) => t.textContent).join('|'))
  assert.ok(!/[−-]337|\+337/.test(svgText), 'no ±337 labels: ' + svgText)
  let g = await geometry(p)
  assert.deepEqual([g.top, g.bottom], [3600, 950])
  // The two left labels never overlap.
  const lab = await p.getByTestId('chart').evaluate((s) => [...s.querySelectorAll('[data-ref] text')].map((t) => { const b = t.getBBox(); return [b.y, b.y + b.height, b.x] }))
  assert.ok(lab[0][0] >= lab[1][1] - 0.5 || lab[1][0] >= lab[0][1] - 0.5, '0 and goal labels apart: ' + JSON.stringify(lab))
  assert.ok(lab.every((l) => l[2] >= -0.5), 'labels inside the left gutter')
  out.goalLabel = refs[1].label

  // ---- Protein tab.
  await p.getByRole('button', { name: 'Protein' }).click(); await wait(1100)
  const chart = p.getByTestId('trend-chart')
  assert.equal(await chart.getAttribute('data-variant'), 'protein')
  const target = Number((await p.getByText(/^target \d+ g$/).innerText()).match(/\d+/)[0])
  out.target = target
  refs = await refsOf(p, 'protein-chart')
  assert.deepEqual(refs, [{ r: '0', label: '0', dashed: null }, { r: String(target), label: `${target} g`, dashed: '4 4' }], 'dashed target line labelled in grams')
  g = await geometry(p, { id: 'protein-chart' })
  // Fixed scale over all history: top = max(biggest day 182, target) + ~10%, bars only go up.
  const all = await p.locator('[data-pbar]').evaluateAll((els) => els.map((e) => e.getAttribute('data-value')).filter((v) => v !== '').map(Number))
  assert.equal(g.top, Math.ceil(Math.max(target, ...all) * 1.1 / 10) * 10, 'protein top = max(day, target) + 10%')
  assert.equal(g.bottom, 0)
  for (const b of g.bars) if (b.v != null) assert.ok(b.y1 <= g.zero + 0.01 && b.y0 >= g.pt - 0.01 && b.over === 'no', `protein bar ${b.v} up from zero, never clipped`)
  // Pink bars with a number, solid when the target is hit, light when not; today's open bar fainter.
  const bars = await p.locator('[data-pbar][data-visible=yes]').evaluateAll((els) => els.map((e) => {
    const r = e.querySelector('rect'); const t = document.querySelector(`[data-label-for="${e.getAttribute('data-pbar')}"]`)
    return { key: e.getAttribute('data-pbar'), v: e.getAttribute('data-value') === '' ? null : Number(e.getAttribute('data-value')), hit: e.getAttribute('data-hit'), open: e.getAttribute('data-open'),
      fill: r ? getComputedStyle(r).fill : null, op: r ? Number(r.getAttribute('opacity')) : null, label: t?.textContent ?? null, where: t?.getAttribute('data-label') ?? null }
  }))
  assert.equal(bars.length, 7)
  const sun = bars.find((b) => b.key === daysAgo(1)), sat = bars.find((b) => b.key === daysAgo(2)), mon = bars.find((b) => b.key === daysAgo(0))
  assert.deepEqual([sun.v, sat.v, mon.v], [P[1], P[2], 8])
  for (const b of bars.filter((x) => x.v != null)) {
    assert.equal(b.fill, 'rgb(200, 69, 111)', 'pink #C8456F bar')
    assert.equal(b.hit, b.v >= target ? 'yes' : 'no')
    assert.equal(b.label, String(b.v), `number on bar ${b.v}`)
    const want = (b.open === 'yes' ? 0.5 : 1) * (b.hit === 'yes' ? 1 : 0.4)
    assert.ok(Math.abs(b.op - want) < 1e-6, `bar ${b.v} opacity ${b.op} (want ${want})`)
  }
  assert.equal(sun.hit, 'yes'); assert.equal(sat.hit, 'no'); assert.equal(mon.open, 'yes')
  assert.equal(sun.where, 'inside'); assert.equal(mon.where, 'outside')
  out.proteinLabels = bars.filter((b) => b.label).map((b) => `${b.label}:${b.hit}:${b.where}`).join(' ')
  // 7-day average line of closed days with a soft pink fill.
  const line = await p.getByTestId('trend-line').evaluate((l) => ({ d: l.getAttribute('d').length, area: l.parentElement.querySelector('.trend-area').getAttribute('fill') }))
  assert.ok(line.d > 30, 'protein average line drawn'); assert.equal(line.area, 'url(#trend-fill-protein)')
  const hit = bars.filter((b) => b.hit === 'yes').length
  assert.equal(await p.getByTestId('protein-hit').innerText(), `${hit} / 7`)
  const range0 = await p.getByTestId('period-range').innerText()
  assert.match(range0, /^Week · \d+ (\w+ )?– \d+ \w+$/)

  // ---- Hold to scrub: 150 ms, per-day snap with haptics, header = grams, date, 7-day average. Release restores.
  let r = await box(); const y = r.y + r.height * 0.45
  await touch('touchStart', r.x + r.width * 0.5, y); await wait(60); await touch('touchEnd'); await wait(150)
  assert.equal(await p.getByTestId('scrub-header').count(), 0, 'tap does not scrub')
  await p.evaluate(() => { window.__haptics = [] })
  await touch('touchStart', r.x + r.width * 0.3, y); await wait(260)
  assert.equal(await p.getByTestId('scrub-header').count(), 1, 'hold starts scrubbing')
  const seen = new Set()
  for (let s = 0; s <= 16; s++) { await touch('touchMove', r.x + r.width * (0.3 + (0.47 * s) / 16), y); await wait(30); seen.add(await p.getByTestId('scrub-header').locator('.eyebrow').first().innerText()) }
  out.scrubHeader = (await p.getByTestId('scrub-header').innerText()).replace(/\n/g, ' | ')
  assert.match(out.scrubHeader, /^Sun \d+ \w{3} \| 182 g \| target hit · closed \| 7-day avg \| \d+ g \| a day$/)
  const ticks = await p.evaluate(() => window.__haptics.filter((h) => h.kind === 'select').length)
  assert.ok(seen.size >= 3 && ticks === seen.size, `one haptic per day: ${ticks} vs ${seen.size}`)
  assert.equal(await p.locator('[data-testid=protein-chart] [data-bar] text[font-size="13"][font-weight="700"]').count(), 1)
  await touch('touchEnd'); await wait(150)
  assert.equal(await p.getByTestId('scrub-header').count(), 0); assert.equal(await p.getByTestId('period-range').innerText(), range0)

  // ---- Swipe pages by 7 days; the day list follows; can't pass today or the oldest page.
  await p.evaluate(() => { window.__haptics = [] })
  await swipe(+1); assert.equal(await pageNo(), 1)
  assert.equal((await p.evaluate(() => window.__haptics)).filter((h) => h.kind === 'settle').length, 1, 'one settle tick')
  const range1 = await p.getByTestId('period-range').innerText()
  assert.notEqual(range1, range0); assert.match(range1, /^Week · /)
  let d = await visibleDays(); assert.deepEqual([d.length, d[0], d[6]], [7, daysAgo(7), daysAgo(13)], 'protein day list follows the week')
  assert.equal(await p.getByTestId('protein-hit').innerText(), `${[13, 12, 11, 10, 9, 8, 7].filter((i) => P[i] >= target).length} / 7`)
  assert.equal(Number(await p.getByTestId('protein-chart').getAttribute('data-top')), g.top, 'same scale on every page')
  await swipe(+1); assert.equal(await pageNo(), 1, 'oldest page is the end')

  // ---- Shared period: switching tabs keeps the same week (both ways), headers name that week.
  await p.getByRole('button', { name: 'Balance' }).click(); await wait(400)
  assert.equal(await pageNo(), 1, 'Balance opens on the same week')
  assert.equal(await p.getByTestId('period-range').innerText(), range1)
  d = await visibleDays(); assert.deepEqual([d[0], d[6]], [daysAgo(7), daysAgo(13)])
  await swipe(-1); assert.equal(await pageNo(), 0)
  await p.getByRole('button', { name: 'Protein' }).click(); await wait(400)
  assert.equal(await pageNo(), 0, 'Protein follows the week chosen on Balance')
  assert.equal(await p.getByTestId('period-range').innerText(), range0)
  await swipe(-1); assert.equal(await pageNo(), 0, "can't swipe past today")
  out.sharedPeriod = `${range1} <-> ${range0}`

  // ---- 30 days: compact labels on every logged bar, nothing clipped.
  await p.getByRole('button', { name: /30d/ }).click(); await wait(1200)
  g = await geometry(p, { compact: true, id: 'protein-chart' })
  out.labels30 = g.bars.filter((b) => b.label).length
  assert.equal(out.labels30, Object.keys(P).length + 1)
  assert.equal(await p.locator('[data-pbar][data-visible=yes]').count(), 30)
  await p.getByRole('button', { name: /7d/ }).click(); await wait(300)
  await p.getByRole('button', { name: 'Balance' }).click(); await wait(300)
  return out
}

/** Reduced motion on the Protein chart: no entry animation, swipe snaps instantly. */
export async function v142ReducedMotion(p, ctx, BASE) {
  await seedJordy(p, BASE)
  await p.getByRole('button', { name: 'Protein' }).click()
  const { swipe, pageNo, wait } = await chartTools(p, ctx)
  assert.deepEqual(await p.getByTestId('trend-line').evaluate((el) => el.getAnimations().length), 0)
  await swipe(+1, { settle: 0 }); await wait(40)
  assert.equal(await pageNo(), 1, 'instant snap')
}
