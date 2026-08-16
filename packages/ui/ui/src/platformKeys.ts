
interface UserAgentDataLike {
  platform?: string;
}

function detectIsApplePlatform(): boolean {
  if (typeof navigator === 'undefined') return false;

  const uaData = (navigator as Navigator & { userAgentData?: UserAgentDataLike }).userAgentData;
  if (typeof uaData?.platform === 'string' && uaData.platform.length > 0) {
    return /mac/i.test(uaData.platform);
  }

  const legacy = navigator.platform;
  if (typeof legacy === 'string' && legacy.length > 0) {
    return /mac|iphone|ipad|ipod/i.test(legacy);
  }

  return /mac|iphone|ipad|ipod/i.test(navigator.userAgent ?? '');
}

export function isApplePlatform(): boolean {
  return detectIsApplePlatform();
}

export function primaryModifierLabel(): string {
  return detectIsApplePlatform() ? '⌘' : 'Ctrl';
}

export function shortcutLabel(key: string): string {
  return detectIsApplePlatform() ? `⌘${key.toUpperCase()}` : `Ctrl+${key.toUpperCase()}`;
}
