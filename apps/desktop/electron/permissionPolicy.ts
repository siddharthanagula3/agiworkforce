import { CLOUD_APP_ORIGIN, RENDERER_HOST, RENDERER_SCHEME } from './config';

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
    const url = new URL(rawUrl);
    if (url.origin === CLOUD_APP_ORIGIN) return true;
    return (
      url.protocol === `${RENDERER_SCHEME}:` &&
      url.hostname === RENDERER_HOST &&
      url.username === '' &&
      url.password === ''
    );
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
