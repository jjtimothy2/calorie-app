// v1.10.1: Add to Home Screen hint on the welcome screen. Chrome and Android fire beforeinstallprompt once, often
// before onboarding mounts, so it is caught here at start-up and kept for the Install button.
import { useEffect, useState } from 'react'

type PromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> }

let deferred: PromptEvent | null = null
let installed = false
const subs = new Set<() => void>()
const tell = () => subs.forEach((f) => f())

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e as PromptEvent; tell() })
  window.addEventListener('appinstalled', () => { installed = true; deferred = null; tell() })
}

/** Running from the Home Screen (installed PWA, or iOS standalone). */
export const isStandalone = () =>
  (typeof matchMedia === 'function' && matchMedia('(display-mode: standalone)').matches) ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true

/** iPhone, iPod, or iPad (which reports itself as a Mac with touch). */
export const isIos = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)

export type InstallState = { kind: 'hidden' } | { kind: 'ios' } | { kind: 'prompt'; install: () => Promise<void> } | { kind: 'menu' }

export function useInstall(): InstallState {
  const [, bump] = useState(0)
  useEffect(() => {
    const f = () => bump((n) => n + 1)
    subs.add(f)
    return () => { subs.delete(f) }
  }, [])
  if (installed || isStandalone()) return { kind: 'hidden' }
  if (isIos()) return { kind: 'ios' }
  if (deferred) {
    const ev = deferred
    return {
      kind: 'prompt',
      install: async () => {
        await ev.prompt()
        const { outcome } = await ev.userChoice
        deferred = null
        if (outcome === 'accepted') installed = true
        tell()
      },
    }
  }
  return { kind: 'menu' }
}
