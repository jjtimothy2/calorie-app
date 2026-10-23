// Unit check for natural serving amounts across every serving label in the food data.
import { execSync } from 'node:child_process'
import { readFileSync, renameSync } from 'node:fs'
import assert from 'node:assert/strict'
const out = 'node_modules/.tmp/amount'
execSync(`npx tsc --ignoreConfig --outDir ${out} src/lib/amount.ts --module esnext --target es2022 --skipLibCheck`)
renameSync(`${out}/amount.js`, `${out}/amount.mjs`)
const { formatAmount: f } = await import(new URL(`../${out}/amount.mjs`, import.meta.url))
const cases = [
  ['1 piece', 1, '1 piece'], ['1 piece', 2, '2 pieces'], ['1 serving', 1.5, '1.5 servings'], ['1 bowl', 2, '2 bowls'],
  ['1/2 cup', 3, '1.5 cups'], ['10 skewers', 0.5, '5 skewers'], ['2 pieces', 0.5, '1 piece'], ['2 eggs', 1.5, '3 eggs'],
  ['Medium portion', 2, '2 medium portions'], ['100 g', 2, '200 g'], ['1 tbsp', 3, '3 tbsp'], ['1 fish + sambal', 2, '2 fish + sambal'],
  ['1 glass', 2, '2 glasses'], ['1 sandwich', 2, '2 sandwiches'], ['1 small bag', 2, '2 small bags'], ['2 medium', 2, '4 medium'],
  ['1 plate (300 g)', 2, '2 plates'], ['1 bowl cooked', 2, '2 bowls cooked'], ['1 scoop + water', 2, '2 scoops + water'],
]
for (const [l, q, want] of cases) assert.equal(f(l, q), want, `${l} x${q}`)
// every label in the data: singular at 1x when count is 1, no "1 pieces", no " × "
const labels = [...new Set([...readFileSync('src/data/foods.ts', 'utf8').matchAll(/^\s+\['[^']+', '[^']+', '([^']+)'/gm)].map((m) => m[1]))]
for (const l of labels) for (const q of [0.5, 1, 1.5, 2, 3]) {
  const s = f(l, q)
  assert.doesNotMatch(s, /×|^(0\.5|1) (pieces|skewers|eggs|squares|cookies|plates|bowls|cups|slices)\b/, `${l} x${q} -> ${s}`)
}
console.log(`PASS amount formatting: ${cases.length} cases + ${labels.length} labels x 5 quantities`)
