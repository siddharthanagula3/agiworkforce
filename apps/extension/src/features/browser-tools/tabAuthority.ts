import {
  browserControlConsentRequiredMessage,
  hasBrowserControlConsent,
} from '../computer-use/browserControlConsent';
import { normalizeApprovedSiteOrigin } from '../options/site-allowlist';
import { assertSiteAccess, readAdminSitePolicy } from '../site-policy/store';
import { hasOneTimeSiteGrant } from '../computer-use/oneTimeSiteGrants';
import { evaluateSitePolicy, sitePolicyDenialMessage } from '@agiworkforce/types';
import type { BrowserProfileCapability } from '@agiworkforce/types';

export const SITE_NOT_APPROVED_FOR_BROWSER_TOOLS =
  'is not on your AGI approved-sites list. Open the extension options, ' +
  'add this origin under "Approved sites", then try again.';

export interface AuthorizedTab {
  readonly tabId: number;
  readonly origin: string;
  readonly url: string;
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
export async function authorizeBrowserToolTab(tabId: number): Promise<AuthorizedTab> {
  let tab: chrome.tabs.Tab;
  try {
    tab = await chrome.tabs.get(tabId);
  } catch {
    throw new Error('Tab not found.');
  }
  const url = typeof tab.url === 'string' ? tab.url : '';
  if (!url) throw new Error('Tab has no URL.');
  const { origin } = await authorizeBrowserToolUrl(url);
  return { tabId, origin, url };
}

/**
 * The same bar for an address a command is about to open: navigating is how a
 * page's injected text would carry data off to a site nobody approved, so the
 * destination must be admitted exactly as the tab it leaves.
 */
export async function authorizeBrowserToolUrl(url: string): Promise<Omit<AuthorizedTab, 'tabId'>> {
  const authorized = await authorizeBrowserToolCapability(url, 'automation');

  let granted = false;
  try {
    granted = await hasBrowserControlConsent(authorized.origin);
  } catch {
    granted = false;
  }
  if (!granted) throw new Error(browserControlConsentRequiredMessage(authorized.origin));

  return authorized;
}

export async function authorizeBrowserToolCapability(
  url: string,
  capability: BrowserProfileCapability,
): Promise<Omit<AuthorizedTab, 'tabId'>> {
  const parsed = new URL(url);
  if (parsed.username || parsed.password)
    throw new Error('Browser task URLs cannot contain credentials.');
  const origin = normalizeApprovedSiteOrigin(parsed.origin);
  if (!origin) throw new Error('Only http and https tabs are supported.');
  const notApproved = `"${origin}" ${SITE_NOT_APPROVED_FOR_BROWSER_TOOLS}`;
  if (capability === 'automation' && hasOneTimeSiteGrant(origin)) {
    const evaluation = evaluateSitePolicy(
      { admin: await readAdminSitePolicy(), userAllowlist: [origin] },
      url,
      capability,
    );
    if (!evaluation.allowed) throw new Error(sitePolicyDenialMessage(evaluation, notApproved));
  } else {
    await assertSiteAccess(url, capability, notApproved);
  }

  return { origin, url };
}
