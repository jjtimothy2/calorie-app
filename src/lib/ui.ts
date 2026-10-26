// v1.6.4: small UI preferences, in their own localStorage entry. Never inside calorie-app:v2 or calorie-app:ai.
export const UI_KEY = 'calorie-app:ui'

/** How the AI sheet's camera frame becomes the 56 px strip when the text field is tapped. */
export type TextTransition = 'fade' | 'snap'
export type UiPrefs = { textTransition: TextTransition }
const DEFAULTS: UiPrefs = { textTransition: 'fade' }

export function readUi(): UiPrefs {
  try {
    const j = JSON.parse(localStorage.getItem(UI_KEY) ?? 'null')
    return { textTransition: j?.textTransition === 'snap' ? 'snap' : 'fade' }
  } catch { return { ...DEFAULTS } }
}

export function saveUi(p: Partial<UiPrefs>) {
  try { localStorage.setItem(UI_KEY, JSON.stringify({ ...readUi(), ...p })) } catch { /* private mode: keep the default */ }
}

export const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

/** The transition actually used: Reduce Motion always snaps. */
export const effectiveTransition = (): TextTransition => (reducedMotion() ? 'snap' : readUi().textTransition)

/** Smooth fade length; the camera keeps running (behind the still) until it ends, then every track stops. */
export const FADE_MS = 200
