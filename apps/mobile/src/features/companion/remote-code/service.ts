import * as Crypto from 'expo-crypto';
import {
  REMOTE_CODE_LIMITS,
  REMOTE_CODE_PROTOCOL_VERSION,
  type RemoteCodeRequestAction,
} from '@agiworkforce/types';
import { useConnectionStore } from '@/stores/connectionStore';
import { beginCodeSessionStart, forgetCodeSessionStart } from './store';

function requestId(): string | null {
  const globalCrypto = globalThis.crypto as { randomUUID?: () => string } | undefined;
  return globalCrypto?.randomUUID?.() ?? Crypto.randomUUID?.() ?? null;
}

async function sendCodeRequest(
  action: RemoteCodeRequestAction,
  fields: Record<string, unknown> = {},
  id: string | null = requestId(),
): Promise<boolean> {
  const { sendControl, status } = useConnectionStore.getState();
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

export async function startCodeSession(rootId: string, task: string): Promise<string | null> {
  const text = task.trim();
  const id = requestId();
  if (!id || !text || text.length > REMOTE_CODE_LIMITS.taskLength) return null;
  beginCodeSessionStart(id, rootId);
  const sent = await sendCodeRequest('code.session.start', { rootId, text }, id);
  if (!sent) {
    forgetCodeSessionStart(id);
    return null;
  }
  return id;
}

export function requestCodeTranscript(
  rootId: string,
  threadId: string,
  before: number | null,
): Promise<boolean> {
  return sendCodeRequest('code.session.history', { rootId, threadId, before });
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
