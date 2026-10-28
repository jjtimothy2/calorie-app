// Tiny service worker generator: after `vite build`, writes dist/sw.js that precaches every built file.
// The cache name is a hash of the file list + contents, so each deploy gets a fresh cache and old ones are dropped.
import { createHash } from 'node:crypto'
import { copyFileSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import type { Plugin } from 'vite'

// Bumped per release (v1.1: new storage key and formulas). The content hash below changes on every build anyway.
export const APP_VERSION = 'v1.13.5'

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? walk(join(dir, f)) : [join(dir, f)]))

const SKIP = new Set(['sw.js', '_redirects', '_headers', '404.html', '.nojekyll'])

export function serviceWorker(): Plugin {
  let outDir = 'dist'
  let base = '/'
  return {
    name: 'calorie-sw',
    apply: 'build',
    configResolved(c) { outDir = c.build.outDir; base = c.base },
    closeBundle() {
      // GitHub Pages SPA fallback: unknown paths serve 404.html, which is the app shell, so deep links work on refresh.
      copyFileSync(join(outDir, 'index.html'), join(outDir, '404.html'))
      writeFileSync(join(outDir, '.nojekyll'), '')
      const files = walk(outDir).map((f) => relative(outDir, f).split('\\').join('/')).filter((f) => !SKIP.has(f) && !f.startsWith('preview/')).sort()
      const hash = createHash('sha256')
      for (const f of files) hash.update(f).update(readFileSync(join(outDir, f)))
      const version = `${APP_VERSION}-${hash.digest('hex').slice(0, 12)}`
      const urls = files.map((f) => base + (f === 'index.html' ? '' : f))
      writeFileSync(join(outDir, 'sw.js'), SW(version, urls, base))
    },
  }
}

const SW = (version: string, urls: string[], base: string) => `// Generated at build time by scripts/sw-plugin.ts. Offline cache for the app shell.
// A build served under /preview/ keeps its own cache prefix and only deletes its own old caches.
// The live app (prefix calorie-) deletes every other calorie- cache, including the retired v1.3 preview's.
const PREFIX = ${JSON.stringify(base.includes('/preview/') ? 'calorie-preview-' : 'calorie-')}
const CACHE = PREFIX + '${version}'
const PRECACHE = ${JSON.stringify(urls)}
const SHELL = ${JSON.stringify(base)}

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()))
})
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith(PREFIX) && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})
self.addEventListener('fetch', (e) => {
  const req = e.request
  // v1.5: AI calls (api.openai.com, generativelanguage.googleapis.com) are cross-origin POST/GET, so they never touch the cache.
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return
  if (req.mode === 'navigate') {
    // SPA: any route is the app shell. Network first so a new deploy shows up, cached shell when offline.
    // GitHub Pages answers deep links with 404.html (the app shell, status 404); serve the cached shell as a clean 200 instead.
    const shell = () => caches.match(SHELL, { cacheName: CACHE, ignoreVary: true })
    e.respondWith(fetch(req).then((res) => (res.status === 404 ? shell().then((hit) => hit || res) : res)).catch(shell))
    return
  }
  e.respondWith(caches.match(req, { cacheName: CACHE, ignoreVary: true }).then((hit) => hit || fetch(req)))
})
`
