import { approvedSiteHostPattern } from '../options/site-allowlist';

export interface HostPermissionReconcileDeps {
  grantedOrigins(): Promise<readonly string[]>;
  requiredOrigins(): readonly string[];
  approvedOrigins(): Promise<readonly string[]>;
  remove(pattern: string): Promise<unknown>;
}

export function planHostPermissionRelease(
  granted: readonly string[],
  required: readonly string[],
  approved: readonly string[],
): string[] {
  const kept = new Set<string>(required);
  for (const origin of approved) {
    const pattern = approvedSiteHostPattern(origin);
    if (pattern) kept.add(pattern);
  }
  return [...new Set(granted)].filter((pattern) => !kept.has(pattern));
}

/**
 * Chrome keeps an optional host grant until it is removed, but an "Allow once"
 * record lives in session storage, which a browser restart or an extension
 * update clears. On those starts every grant the user did not approve for good
 * is released; an unreadable approved list keeps none.
 */
export async function releaseUnapprovedHostPermissions(
  deps: HostPermissionReconcileDeps,
): Promise<string[]> {
  const granted = await deps.grantedOrigins();
  if (granted.length === 0) return [];
  const approved = await deps.approvedOrigins().catch(() => [] as string[]);
  const release = planHostPermissionRelease(granted, deps.requiredOrigins(), approved);
  const released: string[] = [];
  for (const pattern of release) {
    await deps.remove(pattern).then(
      () => released.push(pattern),
      () => undefined,
    );
  }
  return released;
}

export function chromeHostPermissionReconcileDeps(
  approvedOrigins: () => Promise<readonly string[]>,
): HostPermissionReconcileDeps {
  return {
    grantedOrigins: async () => (await chrome.permissions.getAll()).origins ?? [],
    requiredOrigins: () => {
      const manifest = chrome.runtime.getManifest();
      return [
        ...(manifest.host_permissions ?? []),
        ...(manifest.content_scripts ?? []).flatMap((script) => script.matches ?? []),
      ];
    },
    approvedOrigins,
    remove: (pattern) => chrome.permissions.remove({ origins: [pattern] }),
  };
}
