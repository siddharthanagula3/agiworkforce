import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  isManagedCloudBroadcastOwnedBy,
  isCurrentManagedCloudOperation,
  normalizeManagedCloudOwner,
  sameManagedCloudCredential,
  sameManagedCloudOwner,
  selectManagedCloudCancellationCredential,
} from '../src/features/cloud-bridge/managedCloudAuthority';

const OWNER_A = { accountId: 'account-a', authIncarnation: 'session-a' } as const;
const OWNER_B = { accountId: 'account-b', authIncarnation: 'session-b' } as const;
const here = dirname(fileURLToPath(import.meta.url));
const backgroundSource = readFileSync(resolve(here, '../src/background.ts'), 'utf8');
const sidePanelSource = readFileSync(resolve(here, '../src/side_panel.ts'), 'utf8');

function sourceBetween(source: string, startMarker: string, endMarker: string): string {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end);
}

describe('Managed Cloud account/session authority', () => {
  it('requires both account and auth incarnation to match', () => {
    expect(sameManagedCloudOwner(OWNER_A, { ...OWNER_A })).toBe(true);
    expect(
      sameManagedCloudOwner(OWNER_A, {
        accountId: OWNER_A.accountId,
        authIncarnation: 'session-a-replacement',
      }),
    ).toBe(false);
    expect(sameManagedCloudOwner(OWNER_A, OWNER_B)).toBe(false);
  });

  it('requires the exact admitted bearer before clearing a rejected credential', () => {
    const rejectedA = { owner: OWNER_A, token: 'token-a' };

    expect(sameManagedCloudCredential(rejectedA, { ...rejectedA, owner: { ...OWNER_A } })).toBe(
      true,
    );
    expect(sameManagedCloudCredential(rejectedA, { owner: OWNER_B, token: 'token-a' })).toBe(false);
    expect(
      sameManagedCloudCredential(rejectedA, { owner: OWNER_A, token: 'token-refreshed' }),
    ).toBe(false);
  });

  it('rejects malformed owners crossing message or storage boundaries', () => {
    expect(normalizeManagedCloudOwner(OWNER_A)).toEqual(OWNER_A);
    expect(normalizeManagedCloudOwner({ accountId: 'account-a' })).toBeNull();
    expect(
      normalizeManagedCloudOwner({ accountId: 'account-a', authIncarnation: 'bad\u0000session' }),
    ).toBeNull();
  });

  it('suppresses a delayed callback after its registered operation is removed or replaced', () => {
    const accountAOperation = { owner: OWNER_A, token: 'token-a' };
    const accountBOperation = { owner: OWNER_B, token: 'token-b' };

    expect(isCurrentManagedCloudOperation(accountAOperation, accountAOperation)).toBe(true);
    expect(isCurrentManagedCloudOperation(undefined, accountAOperation)).toBe(false);
    expect(isCurrentManagedCloudOperation(accountBOperation, accountAOperation)).toBe(false);
  });

  it('rejects an account A broadcast after the panel has switched to account B', () => {
    expect(isManagedCloudBroadcastOwnedBy(OWNER_A, OWNER_A, OWNER_A)).toBe(true);
    expect(isManagedCloudBroadcastOwnedBy(OWNER_B, OWNER_A, OWNER_A)).toBe(false);
    expect(isManagedCloudBroadcastOwnedBy(OWNER_B, OWNER_B, OWNER_A)).toBe(false);
  });

  it('cancels an admitted A run with captured token A even when ambient auth is B', () => {
    const capturedA = { owner: OWNER_A, token: 'captured-token-a' };
    const ambientB = { owner: OWNER_B, token: 'ambient-token-b' };

    expect(selectManagedCloudCancellationCredential(OWNER_A, capturedA, ambientB)).toBe(capturedA);
    expect(selectManagedCloudCancellationCredential(OWNER_A, null, ambientB)).toBeNull();
    expect(selectManagedCloudCancellationCredential(OWNER_B, null, ambientB)).toBe(ambientB);
  });

  it('wires owner invalidation to abort first and cancel with the admitted token', () => {
    const cancellationHelper = sourceBetween(
      backgroundSource,
      'async function cancelManagedCloudRunWithCapturedCredential',
      'async function invalidateManagedCloudOwner',
    );
    expect(cancellationHelper).toContain('getAuthToken: async () => active.token');

    const invalidationHelper = sourceBetween(
      backgroundSource,
      'async function invalidateManagedCloudOwner',
      '// Pending requests waiting for responses',
    );
    expect(invalidationHelper).toMatch(
      /sameManagedCloudOwner\(active\.owner, owner\)[\s\S]*active\.controller\.abort\(\)[\s\S]*activeChatStreams\.delete\(streamKey\)[\s\S]*cancelManagedCloudRunWithCapturedCredential\(active\)/,
    );
    expect(invalidationHelper.indexOf('active.controller.abort()')).toBeLessThan(
      invalidationHelper.indexOf('loadScheduledTaskRunJournalsForTeardown()'),
    );
    expect(invalidationHelper.indexOf('recovery.controller.abort()')).toBeLessThan(
      invalidationHelper.indexOf('loadScheduledTaskRunJournalsForTeardown()'),
    );
  });

  it('retires explicit owner transitions and registers recovery before its first journal await', () => {
    const transitionCase = sourceBetween(
      backgroundSource,
      "case 'MANAGED_CLOUD_AUTH_CHANGED':",
      "case 'GET_CONNECTION_STATUS':",
    );
    expect(transitionCase).toContain('retireManagedCloudOwner(previousOwner)');
    expect(transitionCase.indexOf('retireManagedCloudOwner(previousOwner)')).toBeLessThan(
      transitionCase.indexOf('await invalidateManagedCloudOwner(previousOwner, true)'),
    );

    const recovery = sourceBetween(
      backgroundSource,
      'async function recoverScheduledTaskRun',
      'async function recoverScheduledTaskRuns',
    );
    expect(
      recovery.indexOf('activeScheduledRecoveries.set(journal.requestId, recoveryGate)'),
    ).toBeLessThan(recovery.indexOf('await executeScheduledTaskJournal('));
    expect(recovery).toContain('isRetiredManagedCloudOwner(credential.owner)');
    expect(recovery).toMatch(
      /!sameManagedCloudOwner\(journal\.owner, credential\.owner\)[\s\S]*abandonScheduledTaskRun\([\s\S]*journal\.owner\.accountId === credential\.owner\.accountId \? credential : null/,
    );
  });

  it('keeps an execution-changing update blocked until the old journal is abandoned', () => {
    const updateCase = sourceBetween(
      backgroundSource,
      "case 'UPDATE_SCHEDULED_TASK':",
      "case 'DELETE_SCHEDULED_TASK':",
    );
    const successfulCommit = sourceBetween(
      updateCase,
      'if (response.success && invalidatesExecution)',
      'return response',
    );
    expect(
      successfulCommit.indexOf('await abandonScheduledTaskRun(journal, credential)'),
    ).toBeLessThan(successfulCommit.indexOf('scheduledTaskExecutions.activate('));
  });

  it('re-opens task execution when an invalidated update or delete is rejected', () => {
    const updateCase = sourceBetween(
      backgroundSource,
      "case 'UPDATE_SCHEDULED_TASK':",
      "case 'DELETE_SCHEDULED_TASK':",
    );
    const deleteCase = sourceBetween(
      backgroundSource,
      "case 'DELETE_SCHEDULED_TASK':",
      "case 'NLWEB_PROBE'",
    );

    expect(updateCase).toMatch(
      /!response\.success && mutationGeneration !== undefined[\s\S]*scheduledTaskExecutions\.activate\(updateMessage\.taskId, mutationGeneration\)/,
    );
    expect(deleteCase).toMatch(
      /!response\.success && mutationGeneration !== undefined[\s\S]*scheduledTaskExecutions\.activate\(deleteMessage\.taskId, mutationGeneration\)/,
    );
  });

  it('keeps account-bound or corrupt prompt tasks behind exact Managed Cloud authority', () => {
    const execution = sourceBetween(
      backgroundSource,
      'async function executeScheduledTask(',
      '// EXT-1, EXT-2',
    );
    const boundCredential = execution.indexOf('if (task.managedCloudAccountId !== undefined) {');
    const promptResolution = execution.indexOf('await scheduledTaskManagedPrompt(task)');
    const runningNotification = execution.indexOf('await notifyScheduledTaskRunning(');

    expect(boundCredential).toBeGreaterThanOrEqual(0);
    expect(boundCredential).toBeLessThan(promptResolution);
    expect(execution).toContain(
      'task.managedCloudAccountId !== undefined || managedPrompt !== undefined',
    );
    expect(
      execution.indexOf("throw new Error('The Managed Cloud prompt is unavailable.')"),
    ).toBeLessThan(runningNotification);
  });

  it('uses task-lease authority for exhausted-recovery failure notifications', () => {
    const recovery = sourceBetween(
      backgroundSource,
      'async function recoverScheduledTaskRun',
      'async function recoverScheduledTaskRuns',
    );
    expect(recovery).toContain(
      '`could not be recovered: ${detail}`,\n      journal.owner,\n      lease.controller.signal',
    );
    expect(recovery).not.toContain(
      '`could not be recovered: ${detail}`,\n      journal.owner,\n      recoveryGate.controller.signal',
    );
  });

  it('rechecks a post-marker tombstone before handing paid work to transport', () => {
    const execution = sourceBetween(
      backgroundSource,
      'async function executeScheduledTaskJournalWithAuthority',
      'function isRetryableScheduledResult',
    );
    const marker = execution.indexOf('{ dispatchStartedAt: Date.now() }');
    const tombstone = execution.indexOf('state.journal.cancellationPending', marker);
    const abandoned = execution.indexOf(
      'abandonedScheduledTaskRequestIds.has(state.journal.requestId)',
      marker,
    );
    const dispatch = execution.indexOf('result = await handleChatMessage(', marker);
    expect(marker).toBeGreaterThanOrEqual(0);
    expect(tombstone).toBeGreaterThan(marker);
    expect(abandoned).toBeGreaterThan(marker);
    expect(tombstone).toBeLessThan(dispatch);
    expect(abandoned).toBeLessThan(dispatch);
  });

  it('carries exact panel authority through managed schedule create, list, update, and delete', () => {
    const createCase = sourceBetween(
      backgroundSource,
      "case 'CREATE_SCHEDULED_TASK':",
      "case 'LIST_SCHEDULED_TASKS':",
    );
    const listCase = sourceBetween(
      backgroundSource,
      "case 'LIST_SCHEDULED_TASKS':",
      "case 'UPDATE_SCHEDULED_TASK':",
    );
    const updateCase = sourceBetween(
      backgroundSource,
      "case 'UPDATE_SCHEDULED_TASK':",
      "case 'DELETE_SCHEDULED_TASK':",
    );
    const deleteCase = sourceBetween(
      backgroundSource,
      "case 'DELETE_SCHEDULED_TASK':",
      "case 'NLWEB_PROBE'",
    );

    expect(createCase).toContain('normalizeManagedCloudOwner(createMessage.owner)');
    expect(createCase).toContain('getExactScheduledMutationCredential(requestedOwner)');
    expect(listCase).toContain('normalizeManagedCloudOwner(listMessage.owner)');
    expect(listCase).toContain('getExactScheduledMutationCredential(requestedOwner)');
    expect(updateCase).toContain('normalizeManagedCloudOwner(updateMessage.owner)');
    expect(updateCase).toContain('getExactScheduledMutationCredential(requestedOwner)');
    expect(deleteCase).toContain('normalizeManagedCloudOwner(deleteMessage.owner)');
    expect(deleteCase).toContain('getExactScheduledMutationCredential(requestedOwner)');
    expect(sidePanelSource).toContain("type: 'LIST_SCHEDULED_TASKS',");
    expect(sidePanelSource).toContain('...(request.owner ? { owner: request.owner } : {})');
  });

  it('tears down only rejected-owner computer use before exact Clerk compare-and-clear', () => {
    const rejectionHelper = sourceBetween(
      backgroundSource,
      'async function invalidateRejectedManagedCloudCredential',
      '// Pending requests waiting for responses',
    );
    expect(rejectionHelper).toMatch(
      /sameManagedCloudOwner\(computerUseLease\.authOwner, rejected\.owner\)[\s\S]*cancelActiveComputerUseRun\('account_changed', computerUseLease\.runId\)/,
    );
    expect(rejectionHelper).toContain('invalidateManagedCloudOwner(rejected.owner)');
    expect(rejectionHelper).toContain(
      'signOutClerkIfCurrent({ owner: rejected.owner, token: rejected.token })',
    );
    expect(rejectionHelper).not.toContain('clearPendingComputerUseStart');
  });

  it('routes chat, resume, approval, and in-page auth failures through rejected-owner teardown', () => {
    const rejectionCalls = backgroundSource.match(
      /result\.code === 'auth_required'[\s\S]{0,120}invalidateRejectedManagedCloudCredential\(activeStream\)/g,
    );
    expect(rejectionCalls).toHaveLength(4);
  });

  it('never substitutes ambient B auth for cancellation of an admitted A stream', () => {
    const cancelCase = sourceBetween(
      backgroundSource,
      "case 'CANCEL_STREAM':",
      "case 'OPEN_SIDE_PANEL':",
    );
    expect(cancelCase).toContain('const currentCredential = active ? null');
    expect(cancelCase).toContain('active ? { token: active.token, owner: active.owner } : null');
    expect(cancelCase).toContain('selectManagedCloudCancellationCredential(');
    expect(cancelCase).toContain('getAuthToken: async () => credential.token');
  });

  it('resets renderer state before exposing B and gates delayed A chunks', () => {
    const transition = sourceBetween(
      sidePanelSource,
      'async function transitionManagedCloudOwner',
      'function injectStyles',
    );
    expect(transition.indexOf('cancelCurrentManagedStream(false)')).toBeLessThan(
      transition.indexOf('_ctx.managedCloudOwner = nextOwner'),
    );
    expect(transition).toContain('ownerByStreamId.clear()');
    expect(transition).toContain("type: 'MANAGED_CLOUD_AUTH_CHANGED'");
    expect(sidePanelSource).toContain('isManagedCloudBroadcastOwnedBy(');
  });
});
