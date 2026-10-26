# Calorie counter

Mobile-first personal web app (installable PWA, data stays on the device). v0 food logging, v1 daily balance (BMR + exercise - food), v2 macros with a protein focus.
Mockups: `/workspace/proto-bot/builds/calorie-v0`, `calorie-v1`, `calorie-v2`.
Vite + React + TypeScript + Tailwind v4 + React Router. All data in localStorage (`calorie-app:v2`; a 1.0 `calorie-app:v1` copy is migrated on load and left in place). Food and MET values are illustrative.

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

Me > Backup. Export downloads `calorie-backup-YYYY-MM-DD.json`: `{ app: "calorie-counter", schema: 1, exportedAt, data: { every calorie-app:* key } }`. Import validates the file (app id, schema, state shape), shows a summary and asks before replacing anything; bad files get a friendly error and nothing changes. Restore also works from the first onboarding screen (new phone). "Last backup: X days ago" sits under the buttons; Home shows a dismissible reminder after 7 days without one. Backup bookkeeping lives in `calorie-app:backup` and is not exported; neither is the AI key (`calorie-app:ai`). Load demo week is under Me > Developer.

## v1 Daily balance
- Balance = BMR + daily movement + exercise - food. Positive is a deficit (green), negative a surplus (orange).
- BMR from onboarding (Mifflin-St Jeor), editable in Me, recalculated when weight changes unless overridden.
- "Include daily movement" toggle (default on) adds BMR x (activity factor - 1).
- Exercise log with MET list, duration and intensity: kcal = MET x kg x hours.
- Days auto-close at midnight; "Close day" locks today early and shows the verdict. History shows up/down bars,
  weekly total (closed days) and an estimated kg change at 7,700 kcal per kg.

## v2 Macros
- v1.1 daily target: BMR + movement (off by default for new profiles) minus pace x 7,700 / 7 (Gentle 0.25, Standard 0.5, Faster 0.75 kg a week). The deficit is capped at 20% of BMR + movement and the target never goes under BMR.
- Protein 1.6 g per kg of goal weight (optional, defaults to current weight). Fat 25% of the target, never under 0.6 g per kg of goal weight. Carbs take the rest, never under 100 g: protein drops first (to 1.2 g per kg), then the target rises. All three editable in Me (a fat override re-splits carbs).
- Home "Protein left today" card links to the Nutrition tab (protein ring, carbs and fat bars, top protein sources).
- History Balance/Protein toggle: protein bars vs a dashed target line, solid when hit, "X / 7 days" and daily average.
- Protein is pink everywhere; orange only means surplus.
- Over a macro target the UI says so ("Fat 70 g, +14 g over") with a darker shade of that macro colour, never orange.
- Home equation reads BMR + Movement + Exercise − Eaten = Balance; Movement is hidden only when the daily movement setting is off.

Design tokens live in `src/index.css` (`@theme`). Calcs in `src/lib/calc.ts`, state in `src/lib/store.tsx`, foods in `src/data/foods.ts`, METs in `src/data/activities.ts`.

## v1.11 Add Calories, a cleaner Log bar, meal pill and Beverages

- The Log bottom button reads "Add Calories" (no emoji) on solid green #178046 with cream text (about 4.9:1 contrast). The Exercise tab's "Quick add burn" button uses the same green. The sheet title, the add-item search button, the photo sheet's "Add Calories instead" and the empty Log link all say Add Calories too.
- The Add Calories sheet shows "From a label, menu or your own count" under kcal (linked to the field for screen readers).
- The bottom bar has 20 px on both sides plus the safe area, so the 56 px buttons line up with the search box.
- The Log meal selector is a 44 px cream pill with a thin border and a chevron, sized to the meal. The native picker still opens on tap (the select sits invisibly on top).
- New meal: Beverages, after Snacks. It is in the meal picker, the meal chips in every sheet and its own section on Today. It is never picked by time of day. The demo week logs Es teh manis under Beverages.
- No data changes (still version 2): old data and backups load unchanged, and existing entries keep their meals. Cache v1.11. Tests: tests/v111.mjs (bar, pill, sheet, Beverages on Today, Exercise button, default meal by hour, old data, demo week, at 390x844 and 375x667).

## v1.10.2 History no longer goes blank for new users

- Fixed: opening History before your first closed day froze on a blank screen in Safari (iPhone). The 7-day average line has nothing to draw until a day is closed, and measuring that empty line for its draw-in animation threw "The element's path is empty", which took the whole app down. The chart now skips the animation when there is no line. Reduced motion users were never affected.
- History shows "Your history shows up here after your first full day." until the first day is closed, with today still listed below and the charts in place.
- Every screen sits inside an error boundary: if a screen crashes it shows a "Something went wrong" card with Reload and Go to Today instead of a blank page. Moving to another tab clears it.
- No data changes (still version 2). Cache v1.10.2. Tests: tests/v1102.mjs (fresh user, today only, after the first closed day, crash card, with motion on and off, at 390x844 and 375x667).

## v1.10.1 Add item, favourite saved foods, typed servings, My foods on Log, install hint

- The AI breakdown sheet has "+ Add item": pick a favourite, saved, recent or searched food, or Quick add, and it joins that meal (same groupId, groupName and meal). A single AI item gets "+ Add item to this meal" in its edit sheet; adding one turns it into a group of 2.
- Saved foods have a favourite star like built-in foods, and show in Favourites. Deleting a saved food also takes it out of favourites. Favourite ids with no food behind them are skipped.
- Tap the amount in any food sheet to type servings on the decimal keypad: 1.5, 0.75 or 1,5 all work. It must be above 0 (at most 99) and rounds to 2 decimals. Plus and minus still step by whole servings (half steps below 1).
- Log has a My foods chip (the chip row scrolls sideways on small phones) with a New food button (the quick add form with Save, nothing is logged) and Edit and Delete on each row. "No match" now offers "Save to my foods" next to Quick add calories. The My foods card left Me.
- The welcome screen shows an install hint: Share then Add to Home Screen on iPhone and iPad, an Install button when the browser offers one (beforeinstallprompt), or the browser menu otherwise. It is hidden when the app already runs from the Home Screen.
- Gemini key setup says "Don't have a key? Get one free here", with "here" linking to Google AI Studio in a new tab.
- Data: calorie-app:v2, calorie-app:ai and calorie-app:foods keep their shape. Favourites may now hold u_ ids (already a string list), and backups carry everything as before.
- Fix: editing a built-in food in an AI meal keeps its group.
- Tests: tests/v1101.mjs (390x844 and 375x667), plus updated v19-myfoods and v110. Screenshots: screenshots/v1101-*.

## v1.10 Watch question, saved food bookmark, AI meal groups

- Onboarding asks "Do you wear a watch that tracks your burn?" after the goal. Yes turns daily movement off (includeMovement false), skips Activity, works the pace from resting burn and shows a note: add your watch's active calories each day with Quick add burn. No goes to Activity with movement on, as before. The pace you pick is kept, even when it lands on the floor (the example man with a watch: gentle 1,584, standard and faster 1,500 kcal).
- Saved foods (calorie-app:foods) show a small bookmark icon in Recent, search and their sheets, with no text (screen readers hear "Saved food"). The Mine tag and the "your food" copy are gone.
- An AI estimate with 2 or more items logs as one meal row on Today (name, item count, AI, total). Tapping it opens a breakdown: each item's kcal and macros, tap to edit, X to remove, and Delete whole meal with a Keep or Delete check. A 1-item estimate stays a normal row. History and other days still list items one by one.
- Entries get optional groupId and groupName. Old calorie-app:v2 data loads unchanged, calorie-app:ai and calorie-app:foods keep their shape, and backups carry groups both ways.
- Fix: editing an entry with decimal macros (AI items, like 4.9 g protein) no longer gets stuck on the number field's whole-number check.
- Tests: tests/v110.mjs (390x844 and 375x667), plus updated v18-onboarding, v19-myfoods, v15-photo, v162-sheet, e2e, single and live. Screenshots: screenshots/v110-*.

## v1.9 My foods

- A named quick add saves your food to My foods, kept in a new key, calorie-app:foods ({ version: 1, foods }). Unnamed quick adds stay one-off. calorie-app:v2 and calorie-app:ai are unchanged, and no foods key is written until you save one.
- Names are de-duped (case and extra spaces ignored): adding the same name again updates that food's numbers and keeps its id and first name. The quick add form says whether it will save or update.
- Your foods use ids u_<id> and show in Recent and Log search with a Mine tag (ranked with favourites). One tap logs a serving; the row opens a sheet with an amount stepper.
- Me has a My foods card: tap a food to edit its name and numbers or delete it. A clash with another food's name is refused. Edits apply next time; past entries are never changed, and deleting a food keeps them.
- Entries from your foods edit their own numbers on Today (amount kept), with an Edit food link. Old entries (foodId null) render as before.
- Backup export includes your foods, import restores them, and a backup without them clears them (import replaces everything). Reset all data clears them.
- Tests: tests/v19-myfoods.mjs. Screenshots: screenshots/v19-*.

## v1.8 Onboarding, no deficit cap

- New onboarding: a welcome screen (app name, one line, Get started, a Restore a backup link, and a plate-in-the-ring illustration drawn in inline SVG that stays still under prefers-reduced-motion). Then one question per screen with a progress bar: sex, age, height and weight, goal, activity, pace. Keep skips pace.
- Pace chips show each option's real daily target, or "at the minimum" when the floor kicks in.
- Target reveal: the number counts up (shown instantly under reduced motion), and the maths sits behind a "How we worked this out" sheet.
- An optional extras screen follows: an Add to Home Screen tip and AI key setup (opens Me with the key field focused). Skip or Done goes to Home.
- New profiles start with daily movement on (includeMovement true).
- The 20% deficit cap is gone. The pace deficit is applied in full, down to the floor: 1,500 kcal for men, 1,200 for women, or BMR when movement is on. The "capped" copy is gone too.
- Existing profiles are not re-onboarded and their movement setting is not changed. calorie-app:v2 and calorie-app:ai are unchanged, and closed days keep their stored numbers.
- Tests: tests/v18-onboarding.mjs (example: man, 32, 175 cm, 92 kg, lightly active: gentle 2,281, standard 2,006, faster 1,859 kcal). Screenshots: screenshots/v18-*.

## v1.7.1 Three AI pills, no tap ring

- The sparkle menu has three pills, bottom to top: Take photo (capture=environment, opens the rear camera directly), From library (no capture flag, opens the photo picker; iOS may show its small menu first) and Type it. Pickers open and the text field focuses inside the tap. Both photo paths land on the photo sheet with the note unfocused.
- Retake reopens the picker the photo came from (camera = Retake, library = Change). Retake and the remove button are 44 px.
- No border, outline or ring on any pill when tapped (menu, strip and photo buttons): pressed = #efe7d8 fill and scale .97 (`.pill-press`), no iOS tap highlight. Focus only moves into the menu when it was opened from the keyboard, and keyboard focus keeps the normal ring.
- The Type it strip offers Take photo and From library inline, with the spoon tip as one muted line.
- calorie-app:v2 and calorie-app:ai are unchanged. Tests: tests/v171-pills.mjs (replaces v17-menu.mjs).

## v1.7 AI button menu, native camera

- Log > Food: tapping the sparkle AI button pops two pills above it: Take photo (bottom, closest to the thumb) and Type it. A tap outside, the sparkle again or Escape closes it; arrow keys, Tab, Home and End move between the pills.
- Take photo opens the phone's rear camera directly (file input with capture=environment, clicked inside the tap). After a shot the AI sheet opens with the photo and the note field is not focused. Cancelling the camera leaves the log as it was.
- Type it opens the sheet with "What did you eat?" focused inside the tap (keyboard comes up) and a dashed "Add a photo (optional)" strip above it. The strip offers Take photo and Choose from photos (no capture flag) inline, plus the spoon or hand tip.
- Removed: the live camera (getUserMedia, retries, freeze frame, fade) and the "Text field transition" setting. The old calorie-app:ui value is ignored. calorie-app:v2 and calorie-app:ai are unchanged.
- Tests: tests/v17-menu.mjs, now tests/v171-pills.mjs (WebKit, 390x844 and 375x667); v163-camera and v164-transition retired; v15-photo, v152-ios and v162-sheet updated.

## v1.6.3 Live camera in the AI sheet (replaced in v1.7)

- The AI button is one four-point star (34 px in the 56 px cream button) filled green #2F8F5B to orange #D9663F. Each star gets its own gradient id (React useId). The sheet heading uses the gradient star; the small ones (Estimate, loading, Today label) are the same star in currentColor.
- Opening the sheet starts the rear camera (getUserMedia, facingMode environment, no audio) as a live preview filling the big frame, with a round shutter and a small gallery button (file picker, no capture flag). The shutter draws the current frame to a canvas and it goes through the usual 1024 px JPEG downscale (never stored).
- Text first folds the frame into the strip and stops the camera; tapping the strip unfolds it and restarts the camera. Change on a taken photo goes back to the live camera.
- The camera only runs while the big empty frame is on screen: every track stops on close, text first, a photo, loading/results/errors, and when the app is hidden, and it restarts when you come back.
- No camera (permission refused, no camera, no getUserMedia, or an error): the sheet opens on the thin strip with "Use a photo", which opens the file picker. A refusal is remembered until the app reloads, so there is no prompt loop.
- Tests: tests/v163-camera.mjs (Chrome and iPhone WebKit with a mocked camera stream, tests/camera-mock.mjs); the other sheet tests use the mock too.

## v1.6.2 Photo-first AI sheet

- Tapping the sparkle opens a big empty photo frame ("Tap to take a photo"), the spoon tip under it, an "Add a note (optional)" field, the chips and Estimate. The keyboard stays down.
- Text first: tapping the field with no photo folds the frame into a 56 px dashed "Add a photo (optional)" strip, and the label crossfades to "What did you eat?". Tapping the strip unfolds the frame and opens the picker. A photo always keeps the frame big.
- Estimate needs a photo, 2 or more typed characters, or a chip.
- The fold is one 280 ms ease-out height animation (field and chips move with it, dashed border fades in). With reduced motion it switches instantly.
- The sparkle in the 56 px Log button is 34 px.
- Acceptance tests: tests/v162-sheet.mjs (iPhone WebKit).

## v1.6.1 AI button polish, size-aware photo prompt

- The AI button on Log is sparkle only (no text), 56 px round, card background, line border, green sparkle. Its accessible name is "Estimate with AI".
- The AI sheet uses the app palette: SVG sparkle in currentColor instead of the emoji, green on card tiles, errors in the danger red.
- Photo prompt: before guessing grams the model looks for a size reference (spoon or fork 15 to 18 cm, tablespoon about 15 ml, hand, chopsticks, phone, cup, plate or bowl rim). With none it assumes a 25 cm dinner plate, typical Indonesian portions and lower confidence. Text-only prompts are unchanged.
- The answer has a `scale_ref` string (parsed leniently; older answers without it still work).
- Under Add photo: "Tip: put a spoon or your hand in the shot for better portions."
- Photo results show "Sized using: <reference>" or "No size reference, portions are a guess" under the dish name. Text-only results show neither.
- Today keeps the AI marker on AI entries, now an SVG sparkle plus "AI" in muted ink.

## v1.6 AI button, text or photo, AI numbers only

- Log > Food: the camera is now a round ✨ "AI" button (56 px, right of Quick add, aria-label "AI estimate"). Offline it reads "Needs internet"; with no key it opens the set-up sheet.
- One sheet: "What did you eat?" text box on top, an optional Add photo button (camera or library) below it, the same chips, then Estimate. Estimate works with text only, photo only or both, and is disabled when there is neither.
- A text-only request sends no image; the prompt asks for typical Indonesian portions when no size is given.
- Every item uses the AI's grams, kcal, protein, carbs and fat; the stepper scales them per gram. Our food list only picks the emoji, and is no longer sent in the prompt. The AI returns an optional portion ("1 plate", "1 tbsp"), shown at the AI's grams and dropped before the line would wrap.
- Better prompt: Indonesian dishes, cooking oil, santan, sauces and sambal, rice portions, and the user's words over the photo.
- Results, edit before logging and "nothing saved but the entries" are unchanged. Entries keep `source: 'photo'` (now meaning AI) so older data stays valid; Today shows them as ✨ AI.
- Tests: `node tests/ai.mjs`, `node tests/v15-photo.mjs`, `node tests/v152-ios.mjs` (`SHOTS=1` writes `screenshots/v16-*.png`).

## v1.5.2 Camera on the right, note field fix (iPhone)

- Log > Food: Quick add on the left, camera on the right. The camera is a 56 px round button, 8 px from the screen edge plus the safe area (`.pr-safe-cam`). Still Food only, hidden on closed days and with the keyboard up.
- Fixed: on iPhone a tap on the photo note only nudged the sheet and the keyboard closed. Opening the keyboard shrinks the viewport, Log re-renders (its keyboard check) and passes a new `onClose` to `Sheet`; Sheet's focus effect depended on `onClose`, so it re-ran and moved focus back to the sheet. `Sheet` now keeps `onClose` in a ref and runs its focus setup once on open. This fixes every sheet.
- With the keyboard up, sheets sit above it and keep the focused field and the main button (`data-keep-visible`, e.g. Estimate) in view. Chips tapped while typing keep the keyboard; tapped otherwise they do not open it.
- Tests: `tests/v152-ios.mjs` (WebKit, iPhone emulation with touch, in `test:e2e`; keyboard simulated by a shorter viewport). Screenshots: `node scripts/v152-shots.mjs` -> `screenshots/v152-*.png`.

## v1.5.1 Photo results show carbs and fat

- Each item's second line is portion, then protein, carbs and fat in the Nutrition colours, e.g. `1 thigh · 26P 6C 21F`. Screen readers hear "26 g protein, 6 g carbs, 21 g fat".
- Food-list items use our per-gram values for all macros; AI-only items use the AI's. Everything follows the grams stepper.
- The Total row has kcal with Protein, Carbs and Fat pills under it.
- If an item line would wrap (390 or 375 px), the portion label is dropped; text never shrinks.
- Screenshots: `screenshots/v151-results-*.png` (`node scripts/v151-shots.mjs` with the preview server running).

## v1.5 AI photo estimate (bring your own key)

- Log > Food: round camera button next to Quick add (right of it since v1.5.2) (hidden on closed days and with the keyboard up, like the bar). Offline it reads "Needs internet". No key yet: a set-up sheet with a button to Me.
- Me > AI photo estimate: Gemini (default) or OpenAI, masked key with Show/Hide, Save, Test key (free model lookup, no tokens), Remove key. The key lives only in `localStorage["calorie-app:ai"]`: never in backups (export or restore), never logged, cleared by Reset all data.
- Models are constants in `src/lib/ai.ts` (`MODELS`): `gemini-3.5-flash-lite` (on the Gemini free tier) and `gpt-6-luna`. Calls go straight from the browser (both providers allow CORS). OpenAI drops CORS headers on 401 from chat completions, so a network error while online is checked against `GET /v1/models` to tell "wrong key" from "no internet".
- Flow: pick or take a photo (`input type=file accept=image/*`, no capture) -> downscaled in the browser to 1024 px JPEG -> optional note and chips (Shared, Half eaten, Extra sambal, Santan, No rice) -> strict JSON (dish, items with grams, kcal, protein, optional carbs, fat, confidence). Items that match our food list use our per-gram values; others keep the AI's numbers and are marked "AI estimate". Grams stepper, remove, then Log N items. Entries get `source: 'photo'` (optional field, old data unchanged). The photo is never stored.
- Errors in plain words (wrong key, no internet, busy or out of credit, no food found, unreadable answer), each with Retake / Try again and Quick add.
- The service worker only handles same-origin GETs, so API calls are never cached.
- Tests: `tests/ai.mjs` (unit, `LIVE=1` also checks the Gemini request shape against the real API with a fake key) and `tests/v15-photo.mjs` (e2e, mocked providers). Screenshots: `node scripts/v15-shots.mjs` -> `screenshots/v15-*.png`.

## v1.4.2 Goal line and Protein chart

- Balance: one dashed goal line labelled `goal 337` (no mirrored -goal line). The scale bottom fits only the biggest closed-day surplus + ~10% (rounded to 50 kcal); with no surplus a small margin stays below zero. Top rule unchanged.
- Protein uses the same chart (`BalanceTrendChart variant="protein"`): pink bars with a number on each, solid when the day hit the target, light when not, today faded as an open day; 7-day average of closed days with a soft fill; dashed target line labelled in grams; hold to scrub, swipe to page, same snap and reduced-motion rules.
- Protein scale is fixed across all history: top = max(biggest day, target) + ~10%; bars only go up.
- Balance and Protein share one period: switching tabs keeps the shown week or month.
- Tests: `tests/v142-chart.mjs` (in e2e and live). Screenshots: `node scripts/v142-shots.mjs` -> `screenshots/v142-*.png`.

## v1.4.1 History chart scale fix
- Fixed, lopsided y scale for the whole history (`trendScale` in `src/lib/trend.ts`): top = biggest closed-day deficit + ~10%, bottom = bigger of the biggest closed surplus or the goal + ~10% (rounded up to 50). No closed day is ever cut off; paging never changes the scale.
- No cap mark. Bars and the 7-day average line use the same unclamped scale, so heights are in proportion (3,232 is 2.07x 1,559).
- Today's open bar may pass the scale (it starts near full BMR): it runs to the top edge of the plot and keeps its number.
- Every non-zero bar shows its value: inside the bar when it fits, otherwise just above (deficit) or below (surplus). 30 days uses short vertical labels (380, 1.6k). Labels sit above the average line.
- Tests: `tests/v141-chart.mjs` (Jordy's week: Sat 1,001, Sun 3,232, Mon 1,559 open, goal 337), screenshots `node scripts/v141-shots.mjs`.

## v1.4 History chart
- Balance view: daily deficit/surplus bars plus a smooth 7-day average line of closed days with a soft fill; 0 and ± daily goal lines stay. One fixed y scale across the whole history.
- Press and hold (150 ms) to scrub: snaps day by day, the header shows that day's balance, date and 7-day average; release brings the period header back.
- Swipe sideways to page by 7 or 30 days (momentum, snap of 340 ms or less, never past today; instant with reduced motion). The day list follows the shown period. Vertical drags still scroll the page.
- Haptics (`src/lib/haptics.ts`): `navigator.vibrate` on Android, the iOS 18+ `<input switch>` tick on iPhone, once per scrub day and once per swipe settle; silent if neither works.
- Tests: `tests/v14-chart.mjs` (used by e2e and live), screenshots `node scripts/v14-shots.mjs`.
