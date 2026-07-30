const VERIFIED_UNIVERSAL_LINK_HOSTS = new Set(['agiworkforce.com']);

export function isAgiWorkforceUniversalLinkHost(hostname: string | null): boolean {
  return hostname !== null && VERIFIED_UNIVERSAL_LINK_HOSTS.has(hostname.toLowerCase());
}
