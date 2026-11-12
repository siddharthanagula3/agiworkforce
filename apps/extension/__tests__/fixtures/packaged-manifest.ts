import sourceManifest from '../../manifest.json';

export const PACKAGED_HOST_PERMISSIONS: readonly string[] = [
  ...sourceManifest.host_permissions,
  'https://clerk.agiworkforce.com/*',
  'https://accounts.agiworkforce.com/*',
];

export function packagedManifest(): { host_permissions: readonly string[] } {
  return { host_permissions: PACKAGED_HOST_PERMISSIONS };
}
