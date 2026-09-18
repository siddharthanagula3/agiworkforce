import {
  browserControlConsentRequiredMessage,
  hasBrowserControlConsent,
} from '../computer-use/browserControlConsent';
import { normalizeApprovedSiteOrigin } from '../options/site-allowlist';
import {
  profileGateFor,
  readBrowserPermissionProfiles,
  readBrowserProfileScope,
  type SitePermissionPolicyStorage,
} from '../options/site-permission-policy';
import { assertSiteAccess } from '../site-policy/store';

export const SITE_NOT_APPROVED_FOR_BROWSER_TOOLS =
  'is not on your AGI Workforce approved-sites list. Open the extension options, ' +
  'add this origin under "Approved sites", then try again.';

export interface AuthorizedTab {
  readonly tabId: number;
  readonly origin: string;
  readonly url: string;
  /** The permission profile this tab runs under, when the person holds any. */
  readonly profileId: string | null;
}

function localStorageArea(): SitePermissionPolicyStorage {
  return {
    get: (key) => chrome.storage.local.get(key) as Promise<Record<string, unknown>>,
    set: (items) => chrome.storage.local.set(items),
  };
}

/**
 * A profile is a durable grant with an expiry, not the live tab. Holding one
 * makes it the authority for this origin; holding none leaves the site policy
 * and the per-origin browser-control grant deciding, which is what they did
 * before profiles existed.
 */
async function profileForTab(
  url: string,
  storage: SitePermissionPolicyStorage,
): Promise<string | null> {
  const [profiles, viewer] = await Promise.all([
    readBrowserPermissionProfiles(storage),
    readBrowserProfileScope(storage),
  ]);
  const decision = profileGateFor(profiles, viewer, {
    url,
    capability: 'automation',
    nowMs: Date.now(),
  });
  if (!decision) return null;
  if (!decision.allowed) throw new Error(decision.message);
  return decision.profile.id;
}

/**
 * The gate every download, console and network capability passes before it
 * touches a tab, held to the same bar as click and type: the tab's live origin
 * must be admitted by the site policy AND carry the separate browser-control
 * grant.
 *
 * It reads the tab's URL at call time rather than trusting a caller-supplied
 * origin, so a tab that navigated off an approved origin after the panel
 * rendered fails here instead of leaking the new origin's page data.
 */
export async function authorizeBrowserToolTab(
  tabId: number,
  storage: SitePermissionPolicyStorage = localStorageArea(),
): Promise<AuthorizedTab> {
  let tab: chrome.tabs.Tab;
  try {
    tab = await chrome.tabs.get(tabId);
  } catch {
    throw new Error('Tab not found.');
  }
  const url = typeof tab.url === 'string' ? tab.url : '';
  if (!url) throw new Error('Tab has no URL.');

  const origin = normalizeApprovedSiteOrigin(new URL(url).origin);
  if (!origin) throw new Error('Only http and https tabs are supported.');

  await assertSiteAccess(url, 'automation', `"${origin}" ${SITE_NOT_APPROVED_FOR_BROWSER_TOOLS}`);

  let granted = false;
  try {
    granted = await hasBrowserControlConsent(origin);
  } catch {
    granted = false;
  }
  if (!granted) throw new Error(browserControlConsentRequiredMessage(origin));

  const profileId = await profileForTab(url, storage);

  return { tabId, origin, url, profileId };
}
