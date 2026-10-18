import { CLOUD_APP_ORIGIN } from './config';

/**
 * Whether a document is the cloud app the window wraps. The window is also
 * allowed to navigate to sign-in providers, and the preload runs on their
 * pages too, so this is asked both of whoever calls the bridge and of whatever
 * page main is about to send something to.
 */
export function isTrustedPageUrl(rawUrl: string | undefined): boolean {
  if (!rawUrl) return false;
  try {
    return new URL(rawUrl).origin === new URL(CLOUD_APP_ORIGIN).origin;
  } catch {
    return false;
  }
}

/** Whether the page a window holds right now may be sent what main knows. */
export function showsTrustedPage(contents: { isDestroyed(): boolean; getURL(): string }): boolean {
  return !contents.isDestroyed() && isTrustedPageUrl(contents.getURL());
}

const TRUSTED_NON_MEDIA_PERMISSIONS = new Set([
  'notifications',
  'fullscreen',
  'clipboard-sanitized-write',
  'display-capture',
]);

export interface MediaPermissionDetails {
  requestingUrl?: string;
  securityOrigin?: string;
  mediaTypes?: Array<'video' | 'audio'>;
  mediaType?: 'video' | 'audio' | 'unknown';
}

export function isTrustedCloudRendererOrigin(rawUrl: string | undefined): boolean {
  if (!rawUrl) return false;
  try {
    return new URL(rawUrl).origin === CLOUD_APP_ORIGIN;
  } catch {
    return false;
  }
}

export function shouldGrantCloudPermissionRequest(
  permission: string,
  details: MediaPermissionDetails,
): boolean {
  const origin = details.securityOrigin ?? details.requestingUrl;
  if (!isTrustedCloudRendererOrigin(origin)) return false;
  if (permission !== 'media') return TRUSTED_NON_MEDIA_PERMISSIONS.has(permission);
  return (
    Array.isArray(details.mediaTypes) &&
    details.mediaTypes.length > 0 &&
    details.mediaTypes.every((mediaType) => mediaType === 'audio')
  );
}

export function shouldGrantCloudPermissionCheck(
  permission: string,
  requestingOrigin: string,
  details: MediaPermissionDetails,
): boolean {
  const origin = details.securityOrigin ?? details.requestingUrl ?? requestingOrigin;
  if (!isTrustedCloudRendererOrigin(origin)) return false;
  if (permission !== 'media') return TRUSTED_NON_MEDIA_PERMISSIONS.has(permission);
  return details.mediaType === 'audio';
}
