// Natural-language amounts: formatAmount('1 piece', 2) -> '2 pieces', ('1/2 cup', 3) -> '1.5 cups'.

const SINGULAR: Record<string, string> = { pieces: 'piece', skewers: 'skewer', eggs: 'egg', squares: 'square', cookies: 'cookie' }
const INVARIANT = new Set(['g', 'kg', 'ml', 'tbsp', 'tsp', 'fish', 'oz'])
const ADJECTIVES = new Set(['small', 'medium', 'large'])

export function pluralise(word: string): string {
  const w = word.toLowerCase()
  if (INVARIANT.has(w)) return word
  if (/(s|x|z|ch|sh)$/.test(w)) return word + 'es'
  if (/[^aeiou]y$/.test(w)) return word.slice(0, -1) + 'ies'
  return word + 's'
}

const fmtNum = (n: number) => String(Math.round(n * 100) / 100)

/** Parse "10 skewers" -> { count: 10, words: ['skewer'] } with the noun singularised. */
function parse(label: string) {
  const clean = label.replace(/\s*\(.*\)\s*$/, '').trim()
  const m = clean.match(/^(\d+(?:\.\d+)?|\d+\/\d+)\s+(.*)$/)
  let count = 1
  let rest = clean
  if (m) {
    const [a, b] = m[1].split('/').map(Number)
    count = b ? a / b : a
    rest = m[2]
  }
  const words = rest.split(' ')
  const i = nounIndex(words)
  if (i >= 0) {
    const lower = words[i].toLowerCase()
    if (SINGULAR[lower]) words[i] = SINGULAR[lower]
  }
  return { count, words, nounAt: i, lowerFirst: !m }
}

/** First word that is not a size adjective; -1 if the unit is only an adjective ("2 medium"). */
function nounIndex(words: string[]) {
  return words.findIndex((w) => !ADJECTIVES.has(w.toLowerCase()) && /^[a-z]/i.test(w))
}

export function formatAmount(servingLabel: string, qty: number): string {
  const { count, words, nounAt, lowerFirst } = parse(servingLabel)
  const total = count * qty
  const out = [...words]
  if (lowerFirst) out[0] = out[0].toLowerCase() // "Medium portion" -> "2 medium portions"
  if (nounAt >= 0 && total > 1) out[nounAt] = pluralise(out[nounAt])
  return `${fmtNum(total)} ${out.join(' ')}`
}
