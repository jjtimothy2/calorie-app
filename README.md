# Calorie counter prototype v0

Mobile-first web prototype built from Reed's PRD v0 and the PM mockup (`/workspace/proto-bot/builds/calorie-v0`).
Vite + React + TypeScript + Tailwind v4 + React Router. All data in localStorage (`calorie-app:v1`). Food values are illustrative.

- `npm install`
- `npm run dev` (dev server) or `npm run build && npx vite preview --port 4174`
- `npm run test:e2e` (needs the preview server on :4174; writes screenshots to `screenshots/`)

Design tokens live in `src/index.css` (`@theme`). Target calc in `src/lib/calc.ts`, state in `src/lib/store.tsx`, foods in `src/data/foods.ts`.
