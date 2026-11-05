// v1.22.1: links that leave the app (the "get a key" links in Settings). In an installed PWA a plain
// target=_blank link opens inside the app: an in-app Safari view on iOS, a Custom Tab on Android. These hand the
// link to the real browser instead:
// - iOS 17+ standalone: x-safari-https://… opens the page in Safari (Safari's own registered scheme; iOS 16 and
//   earlier do not know it, so they keep the plain link). iOS only lets a web app open Safari this way, not another
//   default browser.
// - Android standalone: an intent:// VIEW link aimed at the browser the app was installed from (Chrome unless the UA
//   says Samsung Internet, Edge or Firefox), with S.browser_fallback_url so it still opens if that browser is missing.
// - Everywhere else (a browser tab, desktop, unknown): the plain https link, target=_blank rel=noopener.
// Only fixed https URLs from our own code go through here.
import { isIos, isStandalone } from './install'

export type LinkProps = { href: string; target?: '_blank'; rel: string }

/** iOS major version from the UA (iPhone OS 17_4, or Version/17.4 for iPad as a Mac); 0 when unknown. */
export function iosMajor(ua: string): number {
  const os = /OS (\d+)[_.]\d/.exec(ua)
  const ver = /Version\/(\d+)\./.exec(ua)
  return Math.max(os ? Number(os[1]) : 0, ver ? Number(ver[1]) : 0)
}

/** The Android browser running this app, by its package name. */
export function androidPackage(ua: string): string {
  if (/SamsungBrowser\//.test(ua)) return 'com.sec.android.app.sbrowser'
  if (/EdgA\//.test(ua)) return 'com.microsoft.emmx'
  if (/Firefox\//.test(ua)) return 'org.mozilla.firefox'
  return 'com.android.chrome'
}

export type LinkEnv = { ua: string; standalone: boolean; ios: boolean }

/** `rel` is kept as each link had it before (the OpenAI link also says noreferrer). */
export function externalLink(url: string, rel = 'noopener', env?: LinkEnv): LinkProps {
  const plain: LinkProps = { href: url, target: '_blank', rel }
  if (!/^https:\/\//.test(url)) return plain
  const e = env ?? (typeof navigator === 'undefined' ? null : { ua: navigator.userAgent, standalone: isStandalone(), ios: isIos() })
  if (!e || !e.standalone) return plain
  if (e.ios) return iosMajor(e.ua) >= 17 ? { href: 'x-safari-' + url, rel } : plain
  if (/Android/.test(e.ua)) {
    const rest = url.slice('https://'.length)
    return { href: `intent://${rest}#Intent;scheme=https;action=android.intent.action.VIEW;category=android.intent.category.BROWSABLE;package=${androidPackage(e.ua)};S.browser_fallback_url=${encodeURIComponent(url)};end`, rel }
  }
  return plain
}
