/**
 * platformKeys.ts — the modifier symbol a shortcut hint should print.
 *
 * Both sidebars advertise the same search shortcut, and both hardcoded the
 * answer: web always printed "Ctrl+K", desktop always printed "⌘K". Neither is
 * conditional on the platform, so a Mac user on the web app is told to press a
 * key their keyboard does not have, and a Windows user running the desktop app
 * is shown a Command symbol. The handlers behind them already accept either
 * modifier (`event.metaKey || event.ctrlKey`) — only the LABEL was wrong.
 *
 * Detection order matters. `navigator.userAgentData.platform` is the modern,
 * non-deprecated signal; `navigator.platform` is the fallback that still works
 * everywhere today. Both are absent during SSR, where we intentionally return
 * the non-Mac form: the web app renders on the server, and a hint that
 * hydrates from "Ctrl" to "⌘" is less jarring than the reverse, since the
 * Ctrl form is also the correct one for the majority of visitors.
 */

interface UserAgentDataLike {
  platform?: string;
}

function detectIsApplePlatform(): boolean {
  if (typeof navigator === 'undefined') return false;

  const uaData = (navigator as Navigator & { userAgentData?: UserAgentDataLike }).userAgentData;
  if (typeof uaData?.platform === 'string' && uaData.platform.length > 0) {
    return /mac/i.test(uaData.platform);
  }

  // `navigator.platform` is deprecated but still the most reliable fallback.
  // iPadOS reports "MacIntel", which is correct for our purposes — it takes ⌘.
  const legacy = navigator.platform;
  if (typeof legacy === 'string' && legacy.length > 0) {
    return /mac|iphone|ipad|ipod/i.test(legacy);
  }

  return /mac|iphone|ipad|ipod/i.test(navigator.userAgent ?? '');
}

/** True when the current platform uses Command rather than Control. */
export function isApplePlatform(): boolean {
  return detectIsApplePlatform();
}

/** The primary modifier symbol for shortcut hints: `⌘` on Apple, `Ctrl` elsewhere. */
export function primaryModifierLabel(): string {
  return detectIsApplePlatform() ? '⌘' : 'Ctrl';
}

/**
 * A full shortcut label for `key`, e.g. `⌘K` or `Ctrl+K`.
 *
 * Apple convention omits the separator; Windows and Linux use `+`.
 */
export function shortcutLabel(key: string): string {
  return detectIsApplePlatform() ? `⌘${key.toUpperCase()}` : `Ctrl+${key.toUpperCase()}`;
}
