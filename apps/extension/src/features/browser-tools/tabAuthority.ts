import { SITE_ALLOWLIST_STORAGE_KEY } from '../../background/policy';
import {
  browserControlConsentRequiredMessage,
  hasBrowserControlConsent,
} from '../computer-use/browserControlConsent';
import { normalizeApprovedSiteOrigin } from '../options/site-allowlist';

export const SITE_NOT_APPROVED_FOR_BROWSER_TOOLS =
  'is not on your AGI Workforce approved-sites list. Open the extension options, ' +
  'add this origin under "Approved sites", then try again.';

export interface AuthorizedTab {
  readonly tabId: number;
  readonly origin: string;
  readonly url: string;
}

async function readSiteAllowlist(): Promise<ReadonlySet<string>> {
  try {
    const result = await chrome.storage.local.get([SITE_ALLOWLIST_STORAGE_KEY]);
    const list = result[SITE_ALLOWLIST_STORAGE_KEY];
    if (Array.isArray(list)) return new Set(list as string[]);
  } catch {
    return new Set<string>();
  }
  return new Set<string>();
}

/**
 * The gate every download, console and network capability passes before it
 * touches a tab, held to the same bar as click and type: the tab's live origin
 * must be on the site allowlist AND carry the separate browser-control grant.
 *
 * It reads the tab's URL at call time rather than trusting a caller-supplied
 * origin, so a tab that navigated off an approved origin after the panel
 * rendered fails here instead of leaking the new origin's page data.
 */
export async function authorizeBrowserToolTab(tabId: number): Promise<AuthorizedTab> {
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

  const allowlist = await readSiteAllowlist();
  if (!allowlist.has(origin)) {
    throw new Error(`"${origin}" ${SITE_NOT_APPROVED_FOR_BROWSER_TOOLS}`);
  }

  let granted = false;
  try {
    granted = await hasBrowserControlConsent(origin);
  } catch {
    granted = false;
  }
  if (!granted) throw new Error(browserControlConsentRequiredMessage(origin));

  return { tabId, origin, url };
}
