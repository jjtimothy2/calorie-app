import { sumEntries } from '../lib/calc'
import type { Entry } from '../lib/types'

/**
 * v1.13.5: one muted line under each meal header on Home with that meal's protein, carbs and fat, e.g.
 * "P 37 · C 60 · F 16 g" (whole grams, "g" once at the end, P a touch stronger). AI group items count toward their meal,
 * so moving a group moves its grams. Food rows stay calories-only.
 *
 * 13 px Instrument Sans in text-mute (#6B675F, about 5:1 on the card) with "P 37" semibold in text-ink-soft. Not
 * mute-soft (#8A7F72), which fails contrast on cream at this size. Screen readers hear the aria-label ("Protein 37 g,
 * carbs 60 g, fat 16 g"); the visual text is aria-hidden.
 *
 * No macro data: an item logged without macros (quick add with the optional fields left blank, stored as 0) adds
 * nothing, so the line counts only the known grams. A meal with no macros at all (everything rounds to 0 g) and an
 * empty meal show no line. Past and closed days use the same entries, so the line shows there too.
 */
const g = (n: number) => (Number.isFinite(n) ? Math.round(Math.max(0, n)) : 0)

export function MealMacros({ entries }: { entries: Entry[] }) {
  if (!entries.length) return null
  const t = sumEntries(entries)
  const p = g(t.protein), c = g(t.carbs), f = g(t.fat)
  if (p + c + f === 0) return null
  return (
    <p className="mt-0.5 text-[13px] leading-[18px] text-mute tabular-nums" data-testid="meal-macros" data-macros={`${p}/${c}/${f}`} role="note" aria-label={`Protein ${p} g, carbs ${c} g, fat ${f} g`}>
      <span aria-hidden="true"><span className="font-semibold text-ink-soft">P {p}</span><Dot />C {c}<Dot />F {f} g</span>
    </p>
  )
}

const Dot = () => <span className="mx-0.5">{' · '}</span>
