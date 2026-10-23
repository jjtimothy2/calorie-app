import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { serviceWorker } from './scripts/sw-plugin.ts'

// PWA tags only for the hosted build. The single-file build runs from file://, where a manifest or SW would just error.
const pwaHead = (base: string): Plugin => ({
  name: 'calorie-pwa-head',
  transformIndexHtml: () => [
    { tag: 'link', attrs: { rel: 'manifest', href: base + 'manifest.webmanifest' }, injectTo: 'head' },
    { tag: 'link', attrs: { rel: 'icon', href: base + 'favicon.svg', type: 'image/svg+xml' }, injectTo: 'head' },
    { tag: 'link', attrs: { rel: 'apple-touch-icon', href: base + 'icons/apple-touch-icon.png' }, injectTo: 'head' },
    { tag: 'meta', attrs: { name: 'mobile-web-app-capable', content: 'yes' }, injectTo: 'head' },
    { tag: 'meta', attrs: { name: 'apple-mobile-web-app-capable', content: 'yes' }, injectTo: 'head' },
    { tag: 'meta', attrs: { name: 'apple-mobile-web-app-status-bar-style', content: 'default' }, injectTo: 'head' },
    { tag: 'meta', attrs: { name: 'apple-mobile-web-app-title', content: 'Calories' }, injectTo: 'head' },
  ],
})

// Hosted under GitHub Pages at /calorie-app/. Override with BASE_PATH=/ for a root-domain host (Vercel, Netlify).
const BASE = process.env.BASE_PATH ?? '/calorie-app/'

// `--mode single` builds one self-contained bundle (see scripts/inline.mjs) that works from file://.
export default defineConfig(({ mode }) =>
  mode === 'single'
    ? {
        plugins: [react(), tailwindcss()],
        base: './',
        publicDir: false,
        build: {
          outDir: 'dist-single/tmp',
          emptyOutDir: true,
          assetsInlineLimit: 100_000_000,
          cssCodeSplit: false,
          modulePreload: false,
          rollupOptions: { output: { inlineDynamicImports: true } },
        },
      }
    : { base: BASE, plugins: [react(), tailwindcss(), pwaHead(BASE), serviceWorker()] },
)
