import { SITE_ALLOWLIST_STORAGE_KEY } from '../../background/policy';
import {
  removeBrowserControlHostPermission,
  revokeBrowserControlConsent,
} from '../computer-use/browserControlConsent';
import {
  normalizeApprovedSiteOrigin,
  sanitizeApprovedSiteOrigins,
} from '../options/site-allowlist';

export const USER_SITE_BLOCKLIST_STORAGE_KEY = 'agi_site_blocklist';

export interface BlocklistStorage {
  get(key: string): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
}

export interface BlockedSiteGrants {
  revokeConsent(origin: string): Promise<void>;
  removeHostPermission(origin: string): Promise<void>;
}

function chromeLocal(): BlocklistStorage {
  return {
    get: (key) => chrome.storage.local.get(key),
    set: (items) => chrome.storage.local.set(items),
  };
}

const CHROME_GRANTS: BlockedSiteGrants = {
  revokeConsent: (origin) => revokeBrowserControlConsent(origin),
  removeHostPermission: (origin) => removeBrowserControlHostPermission(origin),
};

export function blockedSiteOrigin(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  return normalizeApprovedSiteOrigin(
    /^[a-z][a-z0-9+.-]*:\/\//iu.test(trimmed) ? trimmed : `https://${trimmed}`,
  );
}

export async function readUserSiteBlocklist(
  storage: BlocklistStorage = chromeLocal(),
): Promise<string[]> {
  try {
    const stored = await storage.get(USER_SITE_BLOCKLIST_STORAGE_KEY);
    return sanitizeApprovedSiteOrigins(stored[USER_SITE_BLOCKLIST_STORAGE_KEY]);
  } catch {
    return [];
  }
}

export async function isUserBlockedSite(
  url: string,
  storage: BlocklistStorage = chromeLocal(),
): Promise<boolean> {
  const origin = normalizeApprovedSiteOrigin(url);
  if (!origin) return false;
  return (await readUserSiteBlocklist(storage)).includes(origin);
}

export async function blockSite(
  origin: string,
  storage: BlocklistStorage = chromeLocal(),
  grants: BlockedSiteGrants = CHROME_GRANTS,
): Promise<string[]> {
  const normalized = normalizeApprovedSiteOrigin(origin);
  if (!normalized) throw new Error('Only a website address can be blocked.');
  const [blocked, stored] = await Promise.all([
    readUserSiteBlocklist(storage),
    storage.get(SITE_ALLOWLIST_STORAGE_KEY),
  ]);
  const allowlist = sanitizeApprovedSiteOrigins(stored[SITE_ALLOWLIST_STORAGE_KEY]);
  const next = blocked.includes(normalized) ? blocked : [...blocked, normalized];
  await storage.set({
    [USER_SITE_BLOCKLIST_STORAGE_KEY]: next,
    [SITE_ALLOWLIST_STORAGE_KEY]: allowlist.filter((entry) => entry !== normalized),
  });
  await grants.revokeConsent(normalized);
  await grants.removeHostPermission(normalized);
  return next;
}

export async function unblockSite(
  origin: string,
  storage: BlocklistStorage = chromeLocal(),
): Promise<string[]> {
  const normalized = normalizeApprovedSiteOrigin(origin);
  const next = (await readUserSiteBlocklist(storage)).filter((entry) => entry !== normalized);
  await storage.set({ [USER_SITE_BLOCKLIST_STORAGE_KEY]: next });
  return next;
}
