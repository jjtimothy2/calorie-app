// Inlines the `--mode single` build into one HTML file.
import { readFileSync, writeFileSync, rmSync, statSync } from 'node:fs'
import { join } from 'node:path'

const dir = 'dist-single/tmp'
const out = 'dist-single/calorie-app-prototype-v2.html'
let html = readFileSync(join(dir, 'index.html'), 'utf8')
html = html.replace(/<script type="module" crossorigin src="\.\/(.+?)"><\/script>/g, (_, f) => {
  const js = readFileSync(join(dir, f), 'utf8').replace(/<\/script/gi, '<\\/script')
  return `<script type="module">${js}</script>`
})
html = html.replace(/<link rel="stylesheet" crossorigin href="\.\/(.+?)">/g, (_, f) => `<style>${readFileSync(join(dir, f), 'utf8')}</style>`)
if (/(src|href)="\.\//.test(html)) throw new Error('unresolved asset reference left in HTML')
writeFileSync(out, html)
rmSync(dir, { recursive: true })
console.log(out, Math.round(statSync(out).size / 1024) + ' KB')
