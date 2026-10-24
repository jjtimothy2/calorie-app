// Shared v1.1 fixture: a v1 state as written by the 1.0 app, with a +2,500 spike in the History week.
const pad = (n) => String(n).padStart(2, '0')
const key = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const DAY = 86_400_000, now = Date.now(), day = (i) => key(new Date(now - i * DAY))
// A saved v1 profile (as written by the current live app): movement on, 500 kcal deficit goal.
const profile = { age: 34, sex: 'female', heightCm: 168, weightKg: 68, activity: 'light', goal: 'lose', target: 1700, bmr: 1600, bmrCustom: true, includeMovement: true, dailyGoal: 500, macros: { protein: null, carbs: null, fat: null } }
// Six closed days: one +2,500 spike (deficit), the rest around +/-400.
const balances = { 6: 380, 5: -420, 4: 2500, 3: 350, 2: -300, 1: 410 }
const closedDays = Object.fromEntries(Object.entries(balances).map(([i, b]) => [day(+i), { bmr: 1600, movement: 600, burned: b === 2500 ? 900 : 0, eaten: 2200 + (b === 2500 ? 900 : 0) - b, balance: b, goal: 500, protein: b === 2500 ? 60 : 95 + +i * 4, closedAt: now - (+i - 1) * DAY, auto: true }]))
const e = (id, date, meal, name, kcal, protein, carbs, fat) => ({ id, date, meal, foodId: null, name, servingLabel: '1 serving', servingMult: 1, qty: 1, kcal, protein, carbs, fat, createdAt: now - 3600_000 })
const entries = [
  ...Object.entries(balances).map(([i, b]) => e('c' + i, day(+i), 'lunch', 'Logged meals', 2200 + (b === 2500 ? 900 : 0) - b, 90, 200, 60)),
  e('t1', day(0), 'breakfast', 'Greek yoghurt with berries', 260, 20, 30, 6),
  e('t2', day(0), 'lunch', 'Chicken rice', 610, 38, 72, 16),
  e('t3', day(0), 'snacks', 'Banana', 105, 1, 27, 0),
]
const STATE = { version: 1, profile, entries, exercises: [], closedDays, favourites: [] }
export { STATE }
