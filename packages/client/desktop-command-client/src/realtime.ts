import { command } from '@agiworkforce/client-runtime';

export interface PairRequestPrompt {
  requestId: string;
  extensionId: string;
  code: string;
  expiresInMs: number;
}

export const BRIDGE_PAIR_REQUEST_EVENT = 'bridge:pair-request';
export const BRIDGE_PAIR_REQUEST_CONFIRMED_EVENT = 'bridge:pair-request-confirmed';

export async function bridgePendingPairRequests(): Promise<PairRequestPrompt[]> {
  return command<PairRequestPrompt[]>('bridge_pending_pair_requests');
}
export async function bridgeDenyPairRequest(requestId: string): Promise<boolean> {
  return command<boolean>('bridge_deny_pair_request', { requestId });
}
