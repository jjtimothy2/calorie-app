// Renders the app icons from one SVG mark (green tile, white balance ring). Run: node scripts/icons.mjs
import { chromium } from 'playwright'
import { writeFileSync } from 'node:fs'

const GREEN = '#178046' // --color-g-ink
const LIGHT = '#e3f4ea' // --color-g-soft
// The mark on a 100x100 grid; `s` scales it around the centre (maskable icons keep it inside the 80% safe zone).
const mark = (s = 1, rounded = true) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <rect width="100" height="100" rx="${rounded ? 22 : 0}" fill="${GREEN}"/>
  <g transform="translate(50 50) scale(${s}) translate(-50 -50)">
    <circle cx="50" cy="50" r="26" fill="none" stroke="${LIGHT}" stroke-opacity=".35" stroke-width="11"/>
    <path d="M50 24a26 26 0 1 1-24.7 34" fill="none" stroke="#fff" stroke-width="11" stroke-linecap="round"/>
    <circle cx="50" cy="50" r="6.5" fill="#fff"/>
  </g>
</svg>`

writeFileSync('public/icons/mark.svg', mark())
writeFileSync('public/favicon.svg', mark())
const out = [
  ['icon-192.png', 192, mark(1, false)],
  ['icon-512.png', 512, mark(1, false)],
  ['maskable-512.png', 512, mark(0.72, false)],
  ['maskable-192.png', 192, mark(0.72, false)],
  ['apple-touch-icon.png', 180, mark(0.9, false)], // iOS rounds the corners itself
]
const browser = await chromium.launch()
const page = await browser.newPage()
for (const [name, size, svg] of out) {
  await page.setViewportSize({ width: size, height: size })
  await page.setContent(`<style>html,body{margin:0}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`)
  await page.screenshot({ path: `public/icons/${name}`, omitBackground: true })
  console.log(name, size)
}
await browser.close()
