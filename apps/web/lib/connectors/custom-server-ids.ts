export const CUSTOM_SERVER_PREFIX = 'custom-';
export const ORG_SHARED_SERVER_PREFIX = 'orgmcp-';

export function customServerId(shortId: string): string {
  return `${CUSTOM_SERVER_PREFIX}${shortId}`;
}

export function orgSharedServerId(orgShortId: string): string {
  return `${ORG_SHARED_SERVER_PREFIX}${orgShortId}`;
}
