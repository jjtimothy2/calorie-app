// v1.4.1 History chart scale + label checks, shared by tests/e2e.mjs and tests/live.mjs.
// Fixture (test data only, never in the app) reproduces Jordy's week: Sat 1,001 and Sun 3,232 closed,
// today (Mon) 1,559 open, goal +/-337; the week before has a 820 surplus and two tiny bars.
import assert from 'node:assert/strict'
import { daysAgo, chartTools } from './v14-chart.mjs'

// v1.4.2: protein varies so the Protein chart shows hit (solid) and missed (light) days around the target.
export const P = { 13: 150, 12: 95, 11: 160, 10: 142, 9: 170, 8: 130, 7: 155, 2: 98, 1: 182 }
const W = { 13: 410, 12: -820, 11: 45, 10: 260, 9: -60, 8: 380, 7: 520, 2: 1001, 1: 3232 }
/** today: open balance so far (BMR 1,837 + 0 burn - eaten). */
export function jordySeed(today = 1559, bmr = 1837) {
  const now = Date.now()
  const closedDays = {}, entries = []
  let n = 0
  for (const [i, bal] of Object.entries(W)) {
    const k = daysAgo(+i), eaten = 1837 - bal
    closedDays[k] = { bmr: 1837, movement: 0, burned: 0, eaten, balance: bal, goal: 337, protein: P[i], closedAt: now - +i * 864e5, auto: true }
    entries.push({ id: 'j' + ++n, date: k, meal: 'lunch', foodId: null, name: 'Logged meals', servingLabel: '1 portion', servingMult: 1, qty: 1, kcal: eaten, protein: P[i], carbs: 200, fat: 60, createdAt: now - +i * 864e5 })
  }
  entries.push({ id: 'j' + ++n, date: daysAgo(0), meal: 'breakfast', foodId: null, name: 'Kopi susu', servingLabel: '1 cup', servingMult: 1, qty: 1, kcal: bmr - today, protein: 8, carbs: 30, fat: 6, createdAt: now - 1e6 })
  return {
    version: 1,
    // male, BMR 1,837, movement off, Standard pace: v1.12 floored the target at 1,500 (goal 337); v1.13.1 migrates it with no floor: goal 550 today, closed days keep 337.
    profile: { age: 35, sex: 'male', heightCm: 178, weightKg: 85, activity: 'light', goal: 'lose', pace: 'standard', goalWeightKg: 78, bmr, bmrCustom: true, includeMovement: false, macros: { protein: null, carbs: null, fat: null } },
    entries, exercises: [], closedDays, favourites: [],
  }
}

export async function seedJordy(p, BASE, today, bmr) {
  await p.goto(BASE + '/')
  await p.evaluate((s) => { localStorage.clear(); localStorage.setItem('calorie-app:v1', JSON.stringify(s)); localStorage.setItem('calorie-app:backup', JSON.stringify({ lastExportAt: Date.now(), dismissedAt: null })) }, jordySeed(today, bmr))
  await p.goto(BASE + '/'); await p.getByRole('link', { name: 'History', exact: true }).click()
  await p.getByTestId('trend-chart').waitFor()
}

const label = (v, compact) => { const a = Math.abs(v); return compact && a >= 1000 ? `${(a / 1000).toFixed(1)}k` : a.toLocaleString('en-US') }

/** Reads the chart geometry and checks: a label on every non-zero visible bar, inside or just outside, within the svg;
 *  no bar past the plot; heights proportional; no cap mark; ref lines at 0 / goal; the average line unclamped. */
export async function geometry(p, { compact = false, id = 'chart' } = {}) {
  const svg = p.getByTestId(id)
  const g = await svg.evaluate((s) => {
    const n = (a) => Number(s.getAttribute(a))
    const vb = s.viewBox.baseVal
    const bars = [...s.querySelectorAll('[data-bar][data-visible=yes]')].map((b) => {
      const t = s.querySelector(`[data-label-for="${b.getAttribute('data-bar')}"]`); const bb = t?.getBBox()
      const r = t?.getBoundingClientRect(), sr = s.getBoundingClientRect()
      return {
        key: b.getAttribute('data-bar'), v: b.getAttribute('data-value') === '' ? null : Number(b.getAttribute('data-value')),
        hx: Number(b.getAttribute('data-hx')), y0: Number(b.getAttribute('data-y0')), y1: Number(b.getAttribute('data-y1')),
        over: b.getAttribute('data-over'), open: b.getAttribute('data-open'),
        label: t?.textContent ?? null, where: t?.getAttribute('data-label') ?? null,
        inSvg: r ? r.top >= sr.top - 1 && r.bottom <= sr.bottom + 1 && r.width > 0 : null, bb: bb ? [bb.y, bb.height] : null,
      }
    })
    const refs = [...s.querySelectorAll('[data-ref]')].map((r) => [Number(r.getAttribute('data-ref')), Number(r.querySelector('line').getAttribute('y1'))])
    const line = s.querySelector('[data-testid=trend-line]')
    return {
      top: n('data-top'), bottom: n('data-bottom'), zero: n('data-zero'), k: n('data-k'), pt: n('data-plot-top'), pb: n('data-plot-bottom'), vbH: vb.height,
      bars, refs, caps: s.querySelectorAll('[data-cap]').length, thin: [...s.querySelectorAll('rect')].filter((r) => Number(r.getAttribute('height')) <= 3.5).length,
      lineBox: line.getAttribute('d') ? (() => { const b = line.getBBox(); return [b.y, b.y + b.height] })() : null,
    }
  })
  assert.equal(g.caps, 0, 'no cap mark'); assert.equal(g.thin, 0, 'no thin cap-line rect')
  for (const b of g.bars) {
    if (b.v == null) continue
    assert.ok(b.y0 >= g.pt - 0.01 && b.y1 <= g.pb + 0.01, `bar ${b.key} ${b.v} inside the plot: ${b.y0}..${b.y1} vs ${g.pt}..${g.pb}`)
    if (b.v === 0) continue
    assert.equal(b.label, label(b.v, compact), `label on bar ${b.key} (${b.v})`)
    assert.ok(b.inSvg, `label of ${b.v} readable inside the chart`)
    if (b.open === 'no') assert.equal(b.over, 'no', `closed day ${b.v} never cut off`)
    if (b.over === 'no' && Math.abs(b.v) * g.k >= 4) assert.ok(Math.abs(b.hx - Math.abs(b.v) * g.k) < 0.02, `bar ${b.v} height proportional`)
  }
  for (const [r, y] of g.refs) assert.ok(Math.abs(y - (g.zero - r * g.k)) < 0.02, `ref ${r} at its value`)
  return g
}

export async function v141Checks(p, ctx, BASE) {
  const out = {}
  await seedJordy(p, BASE)
  const { swipe, pageNo, wait } = await chartTools(p, ctx)
  await wait(1100)
  let g = await geometry(p)
  // Lopsided scale: top fits the biggest closed deficit (3,232 + 10% -> 3,600), bottom (v1.4.2) the biggest
  // closed surplus (820) + 10% -> 950. Only one dashed line now: the goal at +550 (v1.13.1, was +337 held by the 1,500 floor).
  assert.deepEqual([g.top, g.bottom], [3600, 950], 'lopsided fixed scale')
  assert.deepEqual(g.refs.map((r) => r[0]), [0, 550]) // v1.13.1: today's plan has no floor on upgrade (1837 - 550 = 1287); closed days keep their 337
  const by = (v) => g.bars.find((b) => b.v === v)
  const sun = by(3232), mon = by(1559), sat = by(1001)
  assert.ok(sun && mon && sat, 'Jordy week bars')
  out.ratio = +(sun.hx / mon.hx).toFixed(3)
  assert.ok(Math.abs(out.ratio - 3232 / 1559) < 0.01, `3232 vs 1559 heights in proportion: ${out.ratio}`)
  assert.ok(Math.abs(sat.hx / sun.hx - 1001 / 3232) < 0.01)
  assert.ok(sun.y0 > g.pt, 'Sun not touching the top edge (headroom)')
  assert.equal(mon.open, 'yes'); assert.equal(mon.over, 'no')
  assert.deepEqual([sat.label, sun.label, mon.label], ['1,001', '3,232', '1,559'])
  // 7-day average (closed days only) is not clamped: its peak is the Sat/Sun mean 2,117 (rounded).
  const peak = g.zero - 2117 * g.k
  assert.ok(Math.abs(g.lineBox[0] - peak) < 1.5, `average line peak at ${peak.toFixed(1)}, got ${g.lineBox[0].toFixed(1)}`)
  out.labels = g.bars.filter((b) => b.label).map((b) => `${b.label}:${b.where}`).join(' ')
  // Week before: a surplus bar below zero, tiny bars labelled outside.
  await swipe(+1); assert.equal(await pageNo(), 1)
  g = await geometry(p)
  const sur = g.bars.find((b) => b.v === -820), tiny = g.bars.find((b) => b.v === 45), tinyS = g.bars.find((b) => b.v === -60)
  assert.ok(sur.y0 >= g.zero - 0.01 && sur.y1 < g.pb, 'surplus bar below zero, inside the plot')
  assert.equal(tiny.where, 'outside'); assert.equal(tinyS.where, 'outside')
  assert.equal(tiny.label, '45'); assert.equal(tinyS.label, '60')
  assert.ok(tiny.bb[0] + tiny.bb[1] <= tiny.y0 + 1, 'tiny deficit label above its bar')
  assert.ok(tinyS.bb[0] >= tinyS.y1 - 1, 'tiny surplus label below its bar')
  assert.deepEqual([g.top, g.bottom], [3600, 950], 'same scale on every page')
  // 30 days: every non-zero bar still labelled (compact).
  await p.getByRole('button', { name: /30d/ }).click(); await wait(1200)
  g = await geometry(p, { compact: true })
  out.labels30 = g.bars.filter((b) => b.label).length
  assert.equal(out.labels30, 10)
  await p.getByRole('button', { name: /7d/ }).click(); await wait(300)
  // Today's open bar can pass the scale (it starts near full BMR): it runs to the top edge, keeps its number, no cap.
  await seedJordy(p, BASE, 1820)
  await wait(1100)
  g = await geometry(p)
  const big = g.bars.find((b) => b.v === 1820)
  assert.equal(big.over, 'no')
  // A BMR of 5,200 with 200 kcal eaten: today is 5,000 so far, well past the 3,600 top.
  await seedJordy(p, BASE, 5000, 5200); await wait(1100)
  g = await geometry(p)
  const open = g.bars.find((b) => b.open === 'yes' && b.key === daysAgo(0))
  assert.ok(open.v > 3600, 'open bar beyond the scale: ' + open.v)
  assert.equal(open.over, 'yes'); assert.ok(Math.abs(open.y0 - g.pt) < 0.01, 'runs to the top edge')
  assert.equal(open.label, open.v.toLocaleString('en-US'))
  assert.deepEqual([g.top, g.bottom], [3600, 950], 'open day does not set the scale')
  out.openOver = open.v
  return out
}
