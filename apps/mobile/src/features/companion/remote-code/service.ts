import * as Crypto from 'expo-crypto';
import {
  REMOTE_CODE_LIMITS,
  REMOTE_CODE_PROTOCOL_VERSION,
  type RemoteCodeRequestAction,
} from '@agiworkforce/types';
import { useConnectionStore } from '@/stores/connectionStore';

function requestId(): string | null {
  const globalCrypto = globalThis.crypto as { randomUUID?: () => string } | undefined;
  return globalCrypto?.randomUUID?.() ?? Crypto.randomUUID?.() ?? null;
}

async function sendCodeRequest(
  action: RemoteCodeRequestAction,
  fields: Record<string, unknown> = {},
): Promise<boolean> {
  const { sendControl, status } = useConnectionStore.getState();
  const id = requestId();
  if (status !== 'connected' || !id) return false;
  return sendControl(action, {
    ...fields,
    version: REMOTE_CODE_PROTOCOL_VERSION,
    requestId: id,
    sentAt: new Date().toISOString(),
  });
}

export function listCodeSessions(): Promise<boolean> {
  return sendCodeRequest('code.sessions.list');
}

export function attachCodeSession(rootId: string, threadId: string): Promise<boolean> {
  return sendCodeRequest('code.session.attach', { rootId, threadId });
}

export function detachCodeSession(rootId: string, threadId: string): Promise<boolean> {
  return sendCodeRequest('code.session.detach', { rootId, threadId });
}

export function steerCodeSession(
  rootId: string,
  threadId: string,
  guidance: string,
  interrupt: boolean,
): Promise<boolean> {
  const text = guidance.trim();
  if (!text || text.length > REMOTE_CODE_LIMITS.guidanceLength) return Promise.resolve(false);
  return sendCodeRequest('code.session.steer', { rootId, threadId, text, interrupt });
}

export function interruptCodeTurn(
  rootId: string,
  threadId: string,
  turnId: string,
): Promise<boolean> {
  return sendCodeRequest('code.turn.interrupt', { rootId, threadId, turnId });
}

export function answerCodeApproval(
  rootId: string,
  threadId: string,
  turnId: string,
  approvalRequestId: string,
  approved: boolean,
): Promise<boolean> {
  return sendCodeRequest('code.approval.respond', {
    rootId,
    threadId,
    turnId,
    approvalRequestId,
    approved,
  });
}
