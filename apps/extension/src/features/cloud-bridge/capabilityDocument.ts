import { parseMeResponse } from '@agiworkforce/cloud-contracts';
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

async function readAccountError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as Record<string, unknown>;
    const error = body['error'];
    const message =
      typeof error === 'string'
        ? error
        : error && typeof error === 'object'
          ? (error as Record<string, unknown>)['message']
          : body['message'];
    if (typeof message === 'string' && message.trim()) return message.trim();
  } catch {
    return `Your name could not be saved (${response.status}).`;
  }
  return `Your name could not be saved (${response.status}).`;
}

export async function saveAccountDisplayName(token: string, displayName: string): Promise<void> {
  const response = await fetch(`${FREE_TRIAL_GATEWAY}${ACCOUNT_ME_PATH}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'X-Requested-With': 'XMLHttpRequest',
      ...platformRequestHeaders(),
    },
    body: JSON.stringify({ display_name: displayName }),
  });
  if (!response.ok) throw new Error(await readAccountError(response));
}
