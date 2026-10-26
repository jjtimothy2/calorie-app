// Light haptic tick for chart scrubbing and swipe settle. Fails silent everywhere.
// Android / Chrome: navigator.vibrate(8). iOS Safari 18+: no Vibration API, but toggling a native
// <input type="checkbox" switch> plays the system switch tick, so we keep a hidden one and click its label.
type Kind = 'select' | 'settle'

let label: HTMLLabelElement | null = null
const ensureSwitch = () => {
  if (label || typeof document === 'undefined') return label
  label = document.createElement('label')
  label.setAttribute('aria-hidden', 'true')
  label.style.cssText = 'position:fixed;left:-9999px;top:0;width:1px;height:1px;overflow:hidden;opacity:0;pointer-events:none'
  const input = document.createElement('input')
  input.type = 'checkbox'
  input.setAttribute('switch', '')
  input.tabIndex = -1
  label.appendChild(input)
  document.body.appendChild(label)
  return label
}

/** Debug counter so headless tests can see the helper fired (it cannot feel the tick). */
declare global { interface Window { __haptics?: { kind: Kind; via: string; t: number }[] } }

export function haptic(kind: Kind = 'select') {
  try {
    const log = (via: string) => { (window.__haptics ??= []).push({ kind, via, t: Math.round(performance.now()) }) }
    const nav = navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }
    if (typeof nav.vibrate === 'function') {
      // Chrome blocks (and logs) vibrate before the first user tap, so skip until then.
      if (nav.userActivation && !nav.userActivation.hasBeenActive) return log('skipped')
      nav.vibrate(8)
      return log('vibrate')
    }
    const l = ensureSwitch()
    if (l) { l.click(); log('switch') }
  } catch { /* fail silent */ }
}
