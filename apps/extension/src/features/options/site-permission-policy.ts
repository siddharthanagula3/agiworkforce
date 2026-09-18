import {
  isBrowserProfileCapability,
  normalizeProfileSite,
  profileIsLive,
  revokeProfile,
  selectProfileForRequest,
  type BrowserPermissionProfile,
  type BrowserProfileCapability,
  type BrowserProfileDecision,
  type BrowserProfileScope,
} from '@agiworkforce/types';

export const APPROVED_SITE_PROMPT_STORAGE_KEY = 'agi_cu_ask_before_acting';

export const BROWSER_PROFILE_STORAGE_KEY = 'agi_browser_permission_profiles';

export const BROWSER_PROFILE_SCOPE_STORAGE_KEY = 'agi_browser_permission_scope';

export const BROWSER_PROFILE_HINT =
  'A permission profile is the grant, not the window: it names sites, what may be done on them, and when it lapses. Sessions run under a profile, so revoking one ends every session it was carrying.';

export type ApprovedSiteDefault = 'ask' | 'run';

export const UNAPPROVED_SITE_DEFAULT_HINT =
  'Sites you have not approved are blocked: AGI runs no browser automation, in-page assistant or page tools there. Approving a site below is the only way to override that default. Attaching a page to a side-panel message is a separate, explicit action that works on any ordinary site.';

export function readApprovedSiteDefault(stored: unknown): ApprovedSiteDefault {
  return stored === false ? 'run' : 'ask';
}

export function approvedSiteDefaultToStored(value: ApprovedSiteDefault): boolean {
  return value !== 'run';
}

export function parseApprovedSiteDefault(value: unknown): ApprovedSiteDefault {
  return value === 'run' ? 'run' : 'ask';
}

export function describeApprovedSiteDefault(value: ApprovedSiteDefault): string {
  return value === 'run'
    ? 'Approved sites run without asking.'
    : 'Approved sites ask before each action.';
}

export interface SitePermissionPolicyStorage {
  get(key: string): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function trimmed(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function finiteOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/**
 * A stored row is untrusted input: a profile whose scope, sites or capabilities
 * do not parse is dropped rather than repaired, because a repaired grant is one
 * nobody gave.
 */
export function sanitizeStoredProfile(value: unknown): BrowserPermissionProfile | null {
  const row = asRecord(value);
  if (!row) return null;

  const id = trimmed(row['id']);
  const userId = trimmed(row['userId']);
  if (!id || !userId) return null;

  const rawWorkspace = row['workspaceId'];
  const workspaceId =
    rawWorkspace === null || rawWorkspace === undefined ? null : trimmed(rawWorkspace);
  if (rawWorkspace !== null && rawWorkspace !== undefined && workspaceId === null) return null;

  const rawSites = row['sites'];
  const sites = Array.isArray(rawSites)
    ? [...new Set(rawSites.map(normalizeProfileSite).filter((site): site is string => !!site))]
    : [];
  const rawCapabilities = row['capabilities'];
  const capabilities = Array.isArray(rawCapabilities)
    ? [...new Set(rawCapabilities.filter(isBrowserProfileCapability))]
    : [];
  if (sites.length === 0 || capabilities.length === 0) return null;

  return {
    id,
    label: trimmed(row['label']) ?? id,
    userId,
    workspaceId,
    sites,
    capabilities: capabilities as BrowserProfileCapability[],
    createdAtMs: finiteOrNull(row['createdAtMs']) ?? 0,
    expiresAtMs: finiteOrNull(row['expiresAtMs']),
    revokedAtMs: finiteOrNull(row['revokedAtMs']),
  };
}

export function sanitizeStoredProfiles(value: unknown): BrowserPermissionProfile[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const profiles: BrowserPermissionProfile[] = [];
  for (const entry of value) {
    const profile = sanitizeStoredProfile(entry);
    if (!profile || seen.has(profile.id)) continue;
    seen.add(profile.id);
    profiles.push(profile);
  }
  return profiles;
}

export function sanitizeStoredScope(value: unknown): BrowserProfileScope | null {
  const row = asRecord(value);
  if (!row) return null;
  const userId = trimmed(row['userId']);
  if (!userId) return null;
  return { userId, workspaceId: trimmed(row['workspaceId']) };
}

export async function readBrowserPermissionProfiles(
  storage: SitePermissionPolicyStorage,
): Promise<BrowserPermissionProfile[]> {
  const items = await storage.get(BROWSER_PROFILE_STORAGE_KEY);
  return sanitizeStoredProfiles(items?.[BROWSER_PROFILE_STORAGE_KEY]);
}

export async function readBrowserProfileScope(
  storage: SitePermissionPolicyStorage,
): Promise<BrowserProfileScope | null> {
  const items = await storage.get(BROWSER_PROFILE_SCOPE_STORAGE_KEY);
  return sanitizeStoredScope(items?.[BROWSER_PROFILE_SCOPE_STORAGE_KEY]);
}

export async function writeBrowserPermissionProfiles(
  storage: SitePermissionPolicyStorage,
  profiles: readonly BrowserPermissionProfile[],
): Promise<void> {
  await storage.set({ [BROWSER_PROFILE_STORAGE_KEY]: profiles });
}

export async function revokeBrowserPermissionProfile(
  storage: SitePermissionPolicyStorage,
  profileId: string,
  viewer: BrowserProfileScope,
  nowMs: number = Date.now(),
): Promise<boolean> {
  const profiles = await readBrowserPermissionProfiles(storage);
  const target = profiles.find(
    (profile) =>
      profile.id === profileId &&
      profile.userId === viewer.userId &&
      profile.workspaceId === viewer.workspaceId,
  );
  if (!target || target.revokedAtMs !== null) return false;

  await writeBrowserPermissionProfiles(
    storage,
    profiles.map((profile) => (profile.id === profileId ? revokeProfile(profile, nowMs) : profile)),
  );
  return true;
}

/**
 * Profiles narrow, they never widen. With none granted for this scope the
 * existing site policy and per-origin browser-control grant still decide;
 * with one granted it has to admit the request as well.
 */
export function profileGateFor(
  profiles: readonly BrowserPermissionProfile[],
  viewer: BrowserProfileScope | null,
  request: {
    readonly url: string;
    readonly capability: BrowserProfileCapability;
    readonly nowMs: number;
  },
): BrowserProfileDecision | null {
  if (!viewer) return null;
  const mine = profiles.filter(
    (profile) => profile.userId === viewer.userId && profile.workspaceId === viewer.workspaceId,
  );
  if (mine.length === 0) return null;
  return selectProfileForRequest(mine, viewer, request);
}

export function liveProfilesFor(
  profiles: readonly BrowserPermissionProfile[],
  viewer: BrowserProfileScope,
  nowMs: number = Date.now(),
): BrowserPermissionProfile[] {
  return profiles.filter(
    (profile) =>
      profile.userId === viewer.userId &&
      profile.workspaceId === viewer.workspaceId &&
      profileIsLive(profile, nowMs),
  );
}

export interface SitePermissionPolicySection {
  element: HTMLElement;
  select: HTMLSelectElement;
  status: HTMLElement;
  loaded: Promise<void>;
}

export function createSitePermissionPolicySection(
  storage: SitePermissionPolicyStorage,
): SitePermissionPolicySection {
  const element = document.createElement('div');
  element.className = 'opt-row';

  const text = document.createElement('div');
  const label = document.createElement('div');
  label.className = 'opt-row-label';
  label.id = 'opt-site-policy-label';
  label.textContent = 'Default site permission';

  const hint = document.createElement('div');
  hint.className = 'opt-row-hint';
  hint.id = 'opt-site-policy-description';
  hint.textContent = UNAPPROVED_SITE_DEFAULT_HINT;

  const status = document.createElement('div');
  status.className = 'opt-row-hint';
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  status.setAttribute('aria-atomic', 'true');

  text.append(label, hint, status);

  const select = document.createElement('select');
  select.className = 'opt-policy-select';
  select.id = 'opt-site-policy-select';
  select.setAttribute('aria-labelledby', 'opt-site-policy-label');
  select.setAttribute('aria-describedby', 'opt-site-policy-description');
  for (const [value, optionLabel] of [
    ['ask', 'Approved sites: ask before each action'],
    ['run', 'Approved sites: run without asking'],
  ] as const) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = optionLabel;
    select.appendChild(option);
  }
  select.value = 'ask';
  select.disabled = true;

  element.append(text, select);

  let current: ApprovedSiteDefault = 'ask';

  const loaded = storage
    .get(APPROVED_SITE_PROMPT_STORAGE_KEY)
    .then((items) => {
      current = readApprovedSiteDefault(items[APPROVED_SITE_PROMPT_STORAGE_KEY]);
      select.value = current;
      select.disabled = false;
      status.textContent = describeApprovedSiteDefault(current);
    })
    .catch(() => {
      select.disabled = true;
      status.textContent = 'Default site permission could not be loaded.';
    });

  select.addEventListener('change', () => {
    const next = parseApprovedSiteDefault(select.value);
    const previous = current;
    select.disabled = true;
    status.textContent = 'Saving…';
    void storage
      .set({ [APPROVED_SITE_PROMPT_STORAGE_KEY]: approvedSiteDefaultToStored(next) })
      .then(() => {
        current = next;
        status.textContent = describeApprovedSiteDefault(next);
      })
      .catch(() => {
        select.value = previous;
        status.textContent = 'Could not save the default site permission. Please try again.';
      })
      .finally(() => {
        select.disabled = false;
      });
  });

  return { element, select, status, loaded };
}

export interface BrowserProfileSection {
  element: HTMLElement;
  status: HTMLElement;
  loaded: Promise<void>;
  refresh: () => Promise<void>;
}

function describeProfile(profile: BrowserPermissionProfile, nowMs: number): string {
  const sites = profile.sites.join(', ');
  const capabilities = profile.capabilities.join(', ');
  if (profile.revokedAtMs !== null) return `Revoked. ${sites}`;
  if (profile.expiresAtMs !== null && profile.expiresAtMs <= nowMs) {
    return `Expired. ${sites}`;
  }
  const expiry =
    profile.expiresAtMs === null
      ? 'no expiry'
      : `expires ${new Date(profile.expiresAtMs).toLocaleString()}`;
  return `${capabilities} on ${sites}, ${expiry}`;
}

/**
 * Lists the profiles this person holds in this workspace and nothing else. The
 * revoke control asks twice because re-granting means approving every site on
 * the profile again.
 */
export function createBrowserProfileSection(
  storage: SitePermissionPolicyStorage,
  viewer: BrowserProfileScope | null,
): BrowserProfileSection {
  const element = document.createElement('div');
  element.className = 'opt-row';

  const text = document.createElement('div');
  const label = document.createElement('div');
  label.className = 'opt-row-label';
  label.id = 'opt-browser-profile-label';
  label.textContent = 'Browser permission profiles';

  const hint = document.createElement('div');
  hint.className = 'opt-row-hint';
  hint.id = 'opt-browser-profile-description';
  hint.textContent = BROWSER_PROFILE_HINT;

  const status = document.createElement('div');
  status.className = 'opt-row-hint';
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  status.setAttribute('aria-atomic', 'true');

  const list = document.createElement('ul');
  list.className = 'opt-allowlist-list';
  list.setAttribute('aria-labelledby', 'opt-browser-profile-label');

  text.append(label, hint, status, list);
  element.append(text);

  const render = (profiles: readonly BrowserPermissionProfile[]): void => {
    const now = Date.now();
    list.replaceChildren();
    if (!viewer) {
      status.textContent = 'Sign in to see the permission profiles you hold.';
      return;
    }
    const mine = profiles.filter(
      (profile) => profile.userId === viewer.userId && profile.workspaceId === viewer.workspaceId,
    );
    if (mine.length === 0) {
      status.textContent = 'No permission profile is granted here yet.';
      return;
    }
    status.textContent = `${mine.length} permission profile${mine.length === 1 ? '' : 's'}.`;

    for (const profile of mine) {
      const item = document.createElement('li');
      item.className = 'opt-allowlist-item opt-profile-item';

      const name = document.createElement('div');
      name.className = 'opt-row-label';
      name.textContent = profile.label;

      const detail = document.createElement('div');
      detail.className = 'opt-row-hint';
      detail.textContent = describeProfile(profile, now);

      item.append(name, detail);

      if (profile.revokedAtMs === null) {
        const revoke = document.createElement('button');
        revoke.type = 'button';
        revoke.className = 'opt-btn-danger';
        revoke.textContent = 'Revoke profile';
        let confirming: ReturnType<typeof setTimeout> | null = null;

        const reset = (): void => {
          if (confirming !== null) clearTimeout(confirming);
          confirming = null;
          revoke.classList.remove('is-confirm');
          revoke.textContent = 'Revoke profile';
        };

        revoke.addEventListener('click', () => {
          if (!revoke.classList.contains('is-confirm')) {
            revoke.classList.add('is-confirm');
            revoke.textContent = 'Click again to revoke';
            status.textContent = `Click again to end every session on "${profile.label}". Using these sites again means granting them again.`;
            confirming = setTimeout(reset, 4000);
            return;
          }
          reset();
          revoke.disabled = true;
          void revokeBrowserPermissionProfile(storage, profile.id, viewer)
            .then(() => refresh())
            .catch(() => {
              revoke.disabled = false;
              status.textContent = 'The profile could not be revoked. Please try again.';
            });
        });

        item.append(revoke);
      }

      list.append(item);
    }
  };

  const refresh = async (): Promise<void> => {
    try {
      render(await readBrowserPermissionProfiles(storage));
    } catch {
      list.replaceChildren();
      status.textContent = 'Permission profiles could not be loaded.';
    }
  };

  return { element, status, loaded: refresh(), refresh };
}
