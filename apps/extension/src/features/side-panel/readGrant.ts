import {
  forgetTransientHostPermissions,
  recordTransientHostPermission,
} from '../computer-use/transientHostPermissions';
import { approvedSiteHostPattern, normalizeApprovedSiteOrigin } from '../options/site-allowlist';
import { readUserSiteAllowlist } from '../site-policy/store';

export interface ReadGrant {
  granted: boolean;
  release(): Promise<void>;
}

export interface ReadGrantDependencies {
  contains(permissions: chrome.permissions.Permissions): Promise<boolean>;
  request(permissions: chrome.permissions.Permissions): Promise<boolean>;
  remove(permissions: chrome.permissions.Permissions): Promise<boolean>;
  approvedSites(): Promise<string[]>;
  record(id: string, origin: string): Promise<void>;
  forget(ids: readonly string[]): Promise<unknown>;
}

const CHROME_READ_GRANT: ReadGrantDependencies = {
  contains: (permissions) => chrome.permissions.contains(permissions),
  request: (permissions) => chrome.permissions.request(permissions),
  remove: (permissions) => chrome.permissions.remove(permissions),
  approvedSites: () => readUserSiteAllowlist(),
  record: (id, origin) => recordTransientHostPermission(id, origin),
  forget: (ids) => forgetTransientHostPermissions(ids),
};

export function requestReadGrant(
  urls: readonly string[],
  dependencies: ReadGrantDependencies = CHROME_READ_GRANT,
): Promise<ReadGrant> {
  const origins = [
    ...new Set(
      urls
        .map((url) => normalizeApprovedSiteOrigin(url))
        .filter((origin): origin is string => origin !== null),
    ),
  ];
  const patterns = origins
    .map((origin) => approvedSiteHostPattern(origin))
    .filter((pattern): pattern is string => pattern !== null);
  if (patterns.length === 0) return Promise.resolve({ granted: false, release: async () => {} });
  const heldBefore = Promise.all(
    patterns.map((pattern) => dependencies.contains({ origins: [pattern] }).catch(() => false)),
  );
  const requested = dependencies.request({ origins: patterns }).catch(() => false);
  return (async () => {
    const held = await heldBefore;
    const added = origins.filter((_origin, index) => !held[index]);
    const ids = added.map(() => `read_once_${crypto.randomUUID()}`);
    await Promise.all(
      added.map((origin, index) => dependencies.record(ids[index]!, origin).catch(() => undefined)),
    );
    const granted = await requested;
    let released = false;
    const release = async (): Promise<void> => {
      if (released) return;
      released = true;
      const approved = await dependencies.approvedSites().catch(() => [] as string[]);
      const removable = added.filter((origin) => !approved.includes(origin));
      const removablePatterns = removable
        .map((origin) => approvedSiteHostPattern(origin))
        .filter((pattern): pattern is string => pattern !== null);
      if (removablePatterns.length > 0) {
        await dependencies.remove({ origins: removablePatterns }).catch(() => false);
      }
      await dependencies.forget(ids).catch(() => undefined);
    };
    if (!granted) await release();
    return { granted, release };
  })();
}
