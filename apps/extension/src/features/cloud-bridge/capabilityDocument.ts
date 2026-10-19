import {
  MANAGED_CLOUD_SETTINGS_PREFERENCES_PATH,
  parseMeResponse,
} from '@agiworkforce/cloud-contracts';
import {
  resolveCapabilityDocumentDecision,
  type CapabilityDocumentWireView,
  type PlatformCapability,
} from '@agiworkforce/types';
import { FREE_TRIAL_GATEWAY } from './freeTrialClient';
import { platformRequestHeaders } from '../../platformHeaders';

export const ACCOUNT_ME_PATH = '/api/me';
export const CAPABILITY_DOCUMENT_PATH = `${ACCOUNT_ME_PATH}?surface=web`;

export type CapabilityDocument = CapabilityDocumentWireView;

export interface AccountSummary {
  capabilityDocument: CapabilityDocument | null;
  displayName: string | null;
  email: string | null;
  planName: string | null;
  planTier: string | null;
  greetingName: string | null;
}

async function nameOptedOut(token: string, signal?: AbortSignal): Promise<boolean> {
  try {
    const response = await fetch(`${FREE_TRIAL_GATEWAY}${MANAGED_CLOUD_SETTINGS_PREFERENCES_PATH}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        'X-Requested-With': 'XMLHttpRequest',
        ...platformRequestHeaders(),
      },
      ...(signal ? { signal } : {}),
    });
    if (!response.ok) return false;
    const body = (await response.json()) as { settings?: { general?: { preferredName?: unknown } } };
    const preferredName = body.settings?.general?.preferredName;
    return typeof preferredName === 'string' && preferredName.trim() === '';
  } catch {
    return false;
  }
}

export async function fetchAccountSummary(
  token: string,
  signal?: AbortSignal,
): Promise<AccountSummary | null> {
  const optedOut = nameOptedOut(token, signal);
  const response = await fetch(`${FREE_TRIAL_GATEWAY}${CAPABILITY_DOCUMENT_PATH}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      'X-Requested-With': 'XMLHttpRequest',
      ...platformRequestHeaders(),
    },
    ...(signal ? { signal } : {}),
  });
  if (!response.ok) return null;
  const me = parseMeResponse(await response.json());
  return {
    capabilityDocument: me.capability_handshake ?? null,
    displayName: me.profile?.display_name?.trim() || null,
    email: me.email,
    planName: me.plan.display_name.trim() || null,
    planTier: me.plan.effective_tier ?? me.plan.tier,
    greetingName: (await optedOut) ? null : me.profile?.preferred_name?.trim() || me.name || null,
  };
}

export function capabilityAllowed(
  document: CapabilityDocument | null,
  capability: PlatformCapability,
): boolean {
  return resolveCapabilityDocumentDecision(document, capability)?.allowed ?? false;
}
