# Calorie counter prototype v2

Mobile-first web prototype. v0 food logging, v1 daily balance (BMR + exercise - food), v2 macros with a protein focus.
Mockups: `/workspace/proto-bot/builds/calorie-v0`, `calorie-v1`, `calorie-v2`.
Vite + React + TypeScript + Tailwind v4 + React Router. All data in localStorage (`calorie-app:v1`). Food and MET values are illustrative.

- `npm install`
- `npm run dev` (dev server) or `npm run build && npx vite preview --port 4174`
- `npm run test:unit`, `npm run test:e2e` (e2e needs the preview server on :4174; writes screenshots to `screenshots/`)
- `node tests/compare.mjs v2 home-protein,nutrition,history-protein` builds a mockup vs build sheet
- `npm run build:single` writes one self-contained HTML file (hash routing) to `dist-single/calorie-app-prototype-v2.html`; `npm run test:single` checks it from file:// (routes, reload persistence, console)

## v1 Daily balance
- Balance = BMR + daily movement + exercise - food. Positive is a deficit (green), negative a surplus (orange).
- BMR from onboarding (Mifflin-St Jeor), editable in Me, recalculated when weight changes unless overridden.
- "Include daily movement" toggle (default on) adds BMR x (activity factor - 1).
- Exercise log with MET list, duration and intensity: kcal = MET x kg x hours.
- Days auto-close at midnight; "Close day" locks today early and shows the verdict. History shows up/down bars,
  weekly total (closed days) and an estimated kg change at 7,700 kcal per kg.

## v2 Macros
- Protein target defaults to 1.6 g per kg. Carbs (60%) and fat (40%) split the remaining food budget. All three editable in Me.
- Home "Protein left today" card links to the Nutrition tab (protein ring, carbs and fat bars, top protein sources).
- History Balance/Protein toggle: protein bars vs a dashed target line, solid when hit, "X / 7 days" and daily average.
- Protein is pink everywhere; orange only means surplus.

Design tokens live in `src/index.css` (`@theme`). Calcs in `src/lib/calc.ts`, state in `src/lib/store.tsx`, foods in `src/data/foods.ts`, METs in `src/data/activities.ts`.
