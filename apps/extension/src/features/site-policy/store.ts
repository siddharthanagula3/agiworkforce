import {
  SITE_POLICY_ADMIN_UNAVAILABLE,
  evaluateSitePolicy,
  parseAdminSitePolicy,
  sitePolicyDenialMessage,
  type SitePolicyAdminState,
  type SitePolicyCapability,
  type SitePolicyEvaluation,
  type SitePolicyInput,
} from '@agiworkforce/types';

import { SITE_ALLOWLIST_STORAGE_KEY } from '../../background/policy';

/**
 * The org's site policy document. Two carriers, one shape:
 *
 *   `chrome.storage.managed`  the enterprise channel. Written by MDM / Chrome
 *                             policy, unwritable by the extension, so it is read
 *                             first and wins.
 *   `chrome.storage.local`    the workspace copy the signed-in surface syncs for
 *                             orgs without MDM.
 *
 * A carrier that holds a document the parser rejects, or that cannot be read at
 * all, resolves to {@link SITE_POLICY_ADMIN_UNAVAILABLE}, which denies every
 * capability everywhere until the policy reads cleanly again.
 */
export const ADMIN_SITE_POLICY_STORAGE_KEY = 'agi_admin_site_policy';

type StorageArea = Pick<chrome.storage.StorageArea, 'get'>;

function managedArea(): StorageArea | null {
  return chrome.storage?.managed ?? null;
}

function localArea(): StorageArea | null {
  return chrome.storage?.local ?? null;
}

async function readAdminPolicyFrom(
  area: StorageArea | null,
  onReadError: SitePolicyAdminState,
): Promise<SitePolicyAdminState> {
  if (!area) return null;
  let stored: Record<string, unknown>;
  try {
    stored = await area.get(ADMIN_SITE_POLICY_STORAGE_KEY);
  } catch {
    return onReadError;
  }
  const document = stored?.[ADMIN_SITE_POLICY_STORAGE_KEY];
  if (document === undefined || document === null) return null;
  const parsed = parseAdminSitePolicy(document);
  return parsed.ok ? parsed.policy : SITE_POLICY_ADMIN_UNAVAILABLE;
}

/**
 * A managed area that cannot be read leaves an org blocklist possibly in force
 * and the user allowlist still granting, so it denies. A local area that cannot
 * be read takes the user allowlist down with it, which already denies
 * everything, so it resolves to "no policy" and the ordinary
 * not-approved wording reaches the user.
 */
export async function readAdminSitePolicy(): Promise<SitePolicyAdminState> {
  const managed = await readAdminPolicyFrom(managedArea(), SITE_POLICY_ADMIN_UNAVAILABLE);
  if (managed !== null) return managed;
  return readAdminPolicyFrom(localArea(), null);
}

export function adminSitePolicyFromChange(value: unknown): SitePolicyAdminState {
  if (value === undefined || value === null) return null;
  const parsed = parseAdminSitePolicy(value);
  return parsed.ok ? parsed.policy : SITE_POLICY_ADMIN_UNAVAILABLE;
}

export async function readUserSiteAllowlist(): Promise<string[]> {
  const area = localArea();
  if (!area) return [];
  try {
    const stored = await area.get(SITE_ALLOWLIST_STORAGE_KEY);
    const list = stored?.[SITE_ALLOWLIST_STORAGE_KEY];
    return Array.isArray(list) ? (list as string[]).filter((o) => typeof o === 'string') : [];
  } catch {
    return [];
  }
}

export async function loadSitePolicyInput(): Promise<SitePolicyInput> {
  const [admin, userAllowlist] = await Promise.all([
    readAdminSitePolicy(),
    readUserSiteAllowlist(),
  ]);
  return { admin, userAllowlist };
}

export async function evaluateSiteAccess(
  url: string,
  capability: SitePolicyCapability,
): Promise<SitePolicyEvaluation> {
  return evaluateSitePolicy(await loadSitePolicyInput(), url, capability);
}

/**
 * Throws with the org's wording when the policy denies, and with the surface's
 * own `fallback` wording when the only thing missing is the user's approval.
 */
export async function assertSiteAccess(
  url: string,
  capability: SitePolicyCapability,
  fallback: string,
): Promise<SitePolicyEvaluation> {
  const evaluation = await evaluateSiteAccess(url, capability);
  if (!evaluation.allowed) throw new Error(sitePolicyDenialMessage(evaluation, fallback));
  return evaluation;
}
