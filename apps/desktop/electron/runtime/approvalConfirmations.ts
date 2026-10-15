import type { DeveloperSessionEvent } from '@agiworkforce/local-runtime-contract';

/** Who sent an allow that has to be confirmed at this computer. */
export type ApprovalRequester = 'page' | 'phone';

export interface ApprovalIdentity {
  rootId: string;
  threadId: string;
  requestId: string;
}

const DECLINED_LIMIT = 500;

const open = new Set<string>();
const declined = new Map<string, Set<ApprovalRequester>>();

function keyOf({ rootId, threadId, requestId }: ApprovalIdentity): string {
  return JSON.stringify([rootId, threadId, requestId]);
}

/**
 * Claims the one native dialog an approval may have open, whoever asked for
 * it. The page and a paired phone used to keep a list each, so both could put
 * a dialog up for one request. False when one is already open.
 */
export function beginApprovalConfirmation(approval: ApprovalIdentity): boolean {
  const key = keyOf(approval);
  if (open.has(key)) return false;
  open.add(key);
  return true;
}

export function endApprovalConfirmation(approval: ApprovalIdentity): void {
  open.delete(keyOf(approval));
}

/**
 * The person at this computer chose Cancel for this request from this
 * requester. It stays declined for that requester for as long as the request
 * waits, so sending the allow again raises no window and no second dialog.
 */
export function noteApprovalDeclined(
  approval: ApprovalIdentity,
  requester: ApprovalRequester,
): void {
  const key = keyOf(approval);
  const requesters = declined.get(key) ?? new Set<ApprovalRequester>();
  requesters.add(requester);
  declined.delete(key);
  declined.set(key, requesters);
  for (const oldest of declined.keys()) {
    if (declined.size <= DECLINED_LIMIT) break;
    declined.delete(oldest);
  }
}

export function approvalWasDeclined(
  approval: ApprovalIdentity,
  requester: ApprovalRequester,
): boolean {
  return declined.get(keyOf(approval))?.has(requester) ?? false;
}

/** A request that is answered, or whose turn or runtime ended, is no longer waiting. */
export function noteApprovalSessionEvent(rootId: string, event: DeveloperSessionEvent): void {
  if (event.type === 'approval-answered') {
    declined.delete(keyOf({ rootId, threadId: event.threadId, requestId: event.requestId }));
    return;
  }
  if (event.type !== 'turn-finished' && event.type !== 'runtime-stopped') return;
  for (const key of [...declined.keys()]) {
    const [root, thread] = JSON.parse(key) as [string, string, string];
    if (root !== rootId) continue;
    if (event.type === 'runtime-stopped' || thread === event.threadId) declined.delete(key);
  }
}

export function resetApprovalConfirmations(): void {
  open.clear();
  declined.clear();
}
