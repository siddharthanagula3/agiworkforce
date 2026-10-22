import { addCsrfHeaders } from '@/lib/client/csrf';
import type { RemoteControlState } from '@agiworkforce/local-runtime-contract';
import { startRemoteControl, stopRemoteControl } from './runtime-client';

export const PAIR_FAILED = 'Pairing could not start.';

interface PairingResponse {
  code: string;
  expiresAt: number;
  signaling: { wsUrl: string };
  pairTokens: { desktop: string };
}

function isPairingResponse(value: unknown): value is PairingResponse {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  const signaling = record['signaling'] as Record<string, unknown> | undefined;
  const tokens = record['pairTokens'] as Record<string, unknown> | undefined;
  return (
    typeof record['code'] === 'string' &&
    typeof record['expiresAt'] === 'number' &&
    typeof signaling?.['wsUrl'] === 'string' &&
    typeof tokens?.['desktop'] === 'string'
  );
}

async function requestPairing(): Promise<PairingResponse> {
  const response = await fetch('/api/pair/initiate', {
    method: 'POST',
    credentials: 'same-origin',
    headers: await addCsrfHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ initiator: 'desktop' }),
  });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok || !isPairingResponse(body)) {
    const message =
      typeof body === 'object' &&
      body !== null &&
      typeof (body as { error?: unknown }).error === 'string'
        ? (body as { error: string }).error
        : PAIR_FAILED;
    throw new Error(message);
  }
  return body;
}

export async function beginRemotePairing(): Promise<RemoteControlState> {
  const pairing = await requestPairing();
  return startRemoteControl({
    code: pairing.code,
    wsUrl: pairing.signaling.wsUrl,
    pairToken: pairing.pairTokens.desktop,
    expiresAt: pairing.expiresAt,
  });
}

export async function refreshRemotePairing(): Promise<RemoteControlState> {
  await stopRemoteControl();
  return beginRemotePairing();
}
