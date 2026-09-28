import { parseMeResponse } from '@agiworkforce/cloud-contracts';
import {
  resolveCapabilityDocumentDecision,
  type CapabilityDocumentWireView,
  type PlatformCapability,
} from '@agiworkforce/types';
import { FREE_TRIAL_GATEWAY } from './freeTrialClient';
import { platformRequestHeaders } from '../../platformHeaders';

export const CAPABILITY_DOCUMENT_PATH = '/api/me?surface=web';

export type CapabilityDocument = CapabilityDocumentWireView;

export async function fetchCapabilityDocument(
  token: string,
  signal?: AbortSignal,
): Promise<CapabilityDocument | null> {
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
  return parseMeResponse(await response.json()).capability_handshake ?? null;
}

export function capabilityAllowed(
  document: CapabilityDocument | null,
  capability: PlatformCapability,
): boolean {
  return resolveCapabilityDocumentDecision(document, capability)?.allowed ?? true;
}
