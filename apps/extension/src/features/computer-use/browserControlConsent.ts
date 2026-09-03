import { normalizeApprovedSiteOrigin } from '../options/site-allowlist';

export const BROWSER_CONTROL_CONSENT_STORAGE_KEY = 'agi_cu_browser_control_consent';

export const BROWSER_CONTROL_CONSENT_HEADLINE = 'This grants full DevTools-Protocol control';

export const BROWSER_CONTROL_CONSENT_BODY =
  'Approving browser control lets AGI attach the Chrome DevTools Protocol debugger to this origin ' +
  'and click, type, navigate, read the page DOM, and take screenshots inside your signed-in ' +
  'session there. Chrome shows a debugging banner while a run is attached. Chrome will ask you ' +
  'to grant site access for this origin, that grant is what makes the control possible, and you ' +
  'can withdraw it from chrome://extensions at any time. Grant this only on sites you trust with ' +
  'that session, and remove the site to revoke it.';

export interface BrowserControlConsentStorage {
  get(key: string): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
}

function chromeStorage(): BrowserControlConsentStorage {
  return {
    get: (key) => chrome.storage.local.get(key) as Promise<Record<string, unknown>>,
    set: (items) => chrome.storage.local.set(items),
  };
}

export function sanitizeBrowserControlConsent(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [
    ...new Set(
      value.map(normalizeApprovedSiteOrigin).filter((origin): origin is string => origin !== null),
    ),
  ].sort();
}

export async function readBrowserControlConsent(
  storage: BrowserControlConsentStorage = chromeStorage(),
): Promise<string[]> {
  const result = await storage.get(BROWSER_CONTROL_CONSENT_STORAGE_KEY);
  return sanitizeBrowserControlConsent(result?.[BROWSER_CONTROL_CONSENT_STORAGE_KEY]);
}

export function browserControlHostPattern(origin: string): string | null {
  const normalized = normalizeApprovedSiteOrigin(origin);
  return normalized === null ? null : `${normalized}/*`;
}

export interface BrowserControlPermissions {
  contains(permissions: chrome.permissions.Permissions): Promise<boolean>;
  request(permissions: chrome.permissions.Permissions): Promise<boolean>;
  remove(permissions: chrome.permissions.Permissions): Promise<boolean>;
}

function chromePermissions(): BrowserControlPermissions {
  return {
    contains: (permissions) => chrome.permissions.contains(permissions),
    request: (permissions) => chrome.permissions.request(permissions),
    remove: (permissions) => chrome.permissions.remove(permissions),
  };
}

export async function hasBrowserControlHostPermission(
  origin: string,
  permissions: BrowserControlPermissions = chromePermissions(),
): Promise<boolean> {
  const pattern = browserControlHostPattern(origin);
  if (!pattern) return false;
  try {
    return await permissions.contains({ origins: [pattern] });
  } catch {
    return false;
  }
}

export async function requestBrowserControlHostPermission(
  origin: string,
  permissions: BrowserControlPermissions = chromePermissions(),
): Promise<boolean> {
  const pattern = browserControlHostPattern(origin);
  if (!pattern) return false;
  try {
    return await permissions.request({ origins: [pattern] });
  } catch {
    return false;
  }
}

export async function removeBrowserControlHostPermission(
  origin: string,
  permissions: BrowserControlPermissions = chromePermissions(),
): Promise<void> {
  const pattern = browserControlHostPattern(origin);
  if (!pattern) return;
  try {
    await permissions.remove({ origins: [pattern] });
  } catch {
    // A pattern covered by a required host permission cannot be removed; the
    // stored record is revoked regardless, which is what gates the run.
  }
}

/**
 * The gate every computer-use entry point consults. Both halves must hold: the
 * in-extension record that the user read the DevTools-Protocol warning, and the
 * Chrome-enforced host grant that makes the reach real and revocable from
 * chrome://extensions.
 */
export async function hasBrowserControlConsent(
  origin: string,
  storage: BrowserControlConsentStorage = chromeStorage(),
  permissions: BrowserControlPermissions = chromePermissions(),
): Promise<boolean> {
  const normalized = normalizeApprovedSiteOrigin(origin);
  if (!normalized) return false;
  const granted = await readBrowserControlConsent(storage);
  if (!granted.includes(normalized)) return false;
  return hasBrowserControlHostPermission(normalized, permissions);
}

export async function grantBrowserControlConsent(
  origin: string,
  storage: BrowserControlConsentStorage = chromeStorage(),
): Promise<void> {
  const normalized = normalizeApprovedSiteOrigin(origin);
  if (!normalized) throw new Error('Browser control can only be granted to an http(s) origin.');
  const granted = await readBrowserControlConsent(storage);
  if (granted.includes(normalized)) return;
  await storage.set({
    [BROWSER_CONTROL_CONSENT_STORAGE_KEY]: sanitizeBrowserControlConsent([...granted, normalized]),
  });
}

export async function revokeBrowserControlConsent(
  origin: string,
  storage: BrowserControlConsentStorage = chromeStorage(),
): Promise<void> {
  const normalized = normalizeApprovedSiteOrigin(origin);
  if (!normalized) return;
  const granted = await readBrowserControlConsent(storage);
  if (!granted.includes(normalized)) return;
  await storage.set({
    [BROWSER_CONTROL_CONSENT_STORAGE_KEY]: granted.filter((entry) => entry !== normalized),
  });
}

export function browserControlConsentRequiredMessage(origin: string): string {
  return (
    `${origin} has not been granted full Chrome DevTools Protocol control. ` +
    'Open the AGI extension options, add the site, confirm "Grant full browser control", and ' +
    'accept the site-access prompt Chrome shows, before starting computer use.'
  );
}
