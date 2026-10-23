// Mockup vs build sheet. Usage: node tests/compare.mjs v1 home,log-exercise,verdict,history
import { chromium } from 'playwright'
import { execFileSync } from 'node:child_process'

const [ver, list] = process.argv.slice(2)
const OUT = new URL('../screenshots/', import.meta.url).pathname
const mock = `/workspace/proto-bot/builds/calorie-${ver}/index.html`
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1800, height: 1000 }, deviceScaleFactor: 2 })
await page.goto('file://' + mock)
const phones = page.locator('.phone')
const n = await phones.count()
const shots = []
for (let i = 0; i < n; i++) { const p = `/tmp/${ver}-mock-${i}.png`; await phones.nth(i).screenshot({ path: p }); shots.push(p) }
await browser.close()
const build = list.split(',').map((s) => `${OUT}${ver}-mobile-${s}.png`)
execFileSync('python3', [new URL('./compose.py', import.meta.url).pathname, `${OUT}${ver}-compare-mockup-top-vs-build-bottom.png`, String(shots.length), ...shots, ...build], { stdio: 'inherit' })
