# Calorie counter

Mobile-first personal web app (installable PWA, data stays on the device). v0 food logging, v1 daily balance (BMR + exercise - food), v2 macros with a protein focus.
Mockups: `/workspace/proto-bot/builds/calorie-v0`, `calorie-v1`, `calorie-v2`.
Vite + React + TypeScript + Tailwind v4 + React Router. All data in localStorage (`calorie-app:v1`). Food and MET values are illustrative.

- `npm install`
- `npm run dev` (dev server at http://localhost:5173/calorie-app/) or `npm run build && npx vite preview --port 4174` (http://localhost:4174/calorie-app/)
- `npm run test:unit`, `npm run test:e2e`, `npm run test:pwa` (e2e and pwa need the preview server on :4174; screenshots go to `screenshots/`)
- `node tests/compare.mjs v2 home-protein,nutrition,history-protein` builds a mockup vs build sheet
- `npm run build:single` writes one self-contained HTML file (hash routing) to `dist-single/calorie-app-prototype-v2.html`; `npm run test:single` checks it from file:// (routes, reload persistence, console). No PWA bits in this build.

## Deploy (static hosting)

Live: https://jjtimothy2.github.io/calorie-app/ (GitHub Pages). `.github/workflows/deploy.yml` builds and deploys on every push to `main`.

The app is built for the base path `/calorie-app/` (`base` in `vite.config.ts`). Router basename, SW registration and precache list, and the PWA head tags all follow `import.meta.env.BASE_URL`; the manifest uses relative URLs. The build also writes `dist/404.html` (a copy of `index.html`) so GitHub Pages serves the app for deep links on refresh. For a host at the domain root set `BASE_PATH=/` (the Vercel and Netlify configs already do).

`npm run build` produces `dist/`, a plain static site. Any static host works; nothing server-side, no accounts in the app.
- Vercel: `vercel.json` (build `npm run build`, output `dist`, SPA rewrite to `index.html`, no-cache for `sw.js`).
- Netlify: `netlify.toml` plus `public/_redirects` (`/* /index.html 200`) and `public/_headers` (copied into `dist/`).
- Elsewhere: serve `dist/` and send unknown paths to `/index.html` (BrowserRouter). Build with `BASE_PATH` matching where it is served. HTTPS is required for install and offline.

## PWA

- `public/manifest.webmanifest`: "Calorie counter" / "Calories", standalone, portrait, theme `#f7f5f0`.
- Icons: `npm run icons` renders `public/icons/*.png` (192, 512, maskable 192/512, apple-touch 180) and `favicon.svg` from one SVG mark in `scripts/icons.mjs`.
- Service worker: `scripts/sw-plugin.ts` writes `dist/sw.js` after each build, precaching every built file under a content-hashed cache name. Navigations are network first with the cached shell as offline fallback; assets are cache first. Old caches are dropped on activate. Registered in `src/main.tsx` for production builds only.
- iOS: apple-mobile-web-app-capable, status bar style `default`, apple-touch-icon (injected by `vite.config.ts`, hosted build only).
- Layout: phone frame only in a wide browser tab (`framed:` variant = min-width 768px and display-mode browser); installed or on a phone it is full-bleed. Safe-area insets pad the top, the tab bar, sheets and toasts.

## Backup

Me > Backup. Export downloads `calorie-backup-YYYY-MM-DD.json`: `{ app: "calorie-counter", schema: 1, exportedAt, data: { every calorie-app:* key } }`. Import validates the file (app id, schema, state shape), shows a summary and asks before replacing anything; bad files get a friendly error and nothing changes. Restore also works from the first onboarding screen (new phone). "Last backup: X days ago" sits under the buttons; Home shows a dismissible reminder after 7 days without one. Backup bookkeeping lives in `calorie-app:backup` and is not exported. Load demo week is under Me > Developer.

## v1 Daily balance
- Balance = BMR + daily movement + exercise - food. Positive is a deficit (green), negative a surplus (orange).
- BMR from onboarding (Mifflin-St Jeor), editable in Me, recalculated when weight changes unless overridden.
- "Include daily movement" toggle (default on) adds BMR x (activity factor - 1).
- Exercise log with MET list, duration and intensity: kcal = MET x kg x hours.
- Days auto-close at midnight; "Close day" locks today early and shows the verdict. History shows up/down bars,
  weekly total (closed days) and an estimated kg change at 7,700 kcal per kg.

## v2 Macros
- Protein target defaults to 1.6 g per kg. Fat gets 40% of the calories left after protein, never under 0.6 g per kg. Carbs take the rest. All three editable in Me (a fat override re-splits carbs).
- Home "Protein left today" card links to the Nutrition tab (protein ring, carbs and fat bars, top protein sources).
- History Balance/Protein toggle: protein bars vs a dashed target line, solid when hit, "X / 7 days" and daily average.
- Protein is pink everywhere; orange only means surplus.
- Over a macro target the UI says so ("Fat 70 g, +14 g over") with a darker shade of that macro colour, never orange.
- Home equation reads BMR + Movement + Exercise − Eaten = Balance; Movement is hidden only when the daily movement setting is off.

Design tokens live in `src/index.css` (`@theme`). Calcs in `src/lib/calc.ts`, state in `src/lib/store.tsx`, foods in `src/data/foods.ts`, METs in `src/data/activities.ts`.
