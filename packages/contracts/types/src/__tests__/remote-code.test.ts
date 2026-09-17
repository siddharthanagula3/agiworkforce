import { describe, expect, it } from 'vitest';
import {
  REMOTE_CODE_LIMITS,
  diffPaths,
  extractUnifiedDiff,
  isTestCommand,
  parseRemoteCodeEvent,
  parseRemoteCodeRequest,
  parseRemoteCodeSessions,
  parseRemoteCodeSnapshot,
  parseTestSummary,
} from '../remote-code';

const SENT_AT = '2026-09-17T12:00:00.000Z';

describe('remote code requests', () => {
  it('accepts a steer with guidance and keeps the interrupt choice explicit', () => {
    expect(
      parseRemoteCodeRequest('code.session.steer', {
        version: 1,
        requestId: 'req-1',
        sentAt: SENT_AT,
        rootId: 'root-1',
        threadId: 'thread-1',
        text: '  use the existing retry helper  ',
      }),
    ).toEqual({
      action: 'code.session.steer',
      version: 1,
      requestId: 'req-1',
      sentAt: SENT_AT,
      rootId: 'root-1',
      threadId: 'thread-1',
      text: 'use the existing retry helper',
      interrupt: false,
    });
  });

  it('refuses empty or oversized guidance', () => {
    const base = { version: 1, requestId: 'r', sentAt: SENT_AT, rootId: 'a', threadId: 'b' };
    expect(parseRemoteCodeRequest('code.session.steer', { ...base, text: '   ' })).toBeNull();
    expect(
      parseRemoteCodeRequest('code.session.steer', {
        ...base,
        text: 'x'.repeat(REMOTE_CODE_LIMITS.guidanceLength + 1),
      }),
    ).toBeNull();
  });

  it('needs an explicit boolean before answering an approval', () => {
    const base = {
      version: 1,
      requestId: 'r',
      sentAt: SENT_AT,
      rootId: 'a',
      threadId: 'b',
      turnId: 't',
      approvalRequestId: 'ap-1',
    };
    expect(
      parseRemoteCodeRequest('code.approval.respond', { ...base, approved: 'yes' }),
    ).toBeNull();
    expect(
      parseRemoteCodeRequest('code.approval.respond', { ...base, approved: true }),
    ).toMatchObject({ approvalRequestId: 'ap-1', approved: true });
  });

  it('ignores actions it does not own and payloads on another protocol version', () => {
    expect(parseRemoteCodeRequest('dispatch.task.create', { version: 1 })).toBeNull();
    expect(
      parseRemoteCodeRequest('code.sessions.list', { version: 2, requestId: 'r', sentAt: SENT_AT }),
    ).toBeNull();
  });
});

describe('diffs in tool output', () => {
  const patch = [
    'diff --git a/src/retry.ts b/src/retry.ts',
    '--- a/src/retry.ts',
    '+++ b/src/retry.ts',
    '@@ -1,2 +1,2 @@',
    '-const attempts = 3;',
    '+const attempts = 5;',
  ].join('\n');

  it('finds a unified diff after other output and names its files', () => {
    const found = extractUnifiedDiff(`Applied edit.\n${patch}\n`);
    expect(found).toBe(patch);
    expect(diffPaths(found ?? '')).toEqual(['src/retry.ts']);
  });

  it('does not treat a stray dashed line as a diff', () => {
    expect(extractUnifiedDiff('--- a/section heading\nno hunks here')).toBeNull();
  });
});

describe('test results in tool output', () => {
  it('recognises test commands across ecosystems', () => {
    expect(isTestCommand('pnpm --filter web exec vitest run src/a.test.ts')).toBe(true);
    expect(isTestCommand('cargo test -p agi')).toBe(true);
    expect(isTestCommand('pnpm test')).toBe(true);
    expect(isTestCommand('ls -la')).toBe(false);
  });

  it('reads vitest and jest summaries', () => {
    expect(parseTestSummary(' Tests  3 failed | 41 passed (44)', true)).toEqual({
      status: 'failed',
      passed: 41,
      failed: 3,
      skipped: null,
    });
    expect(parseTestSummary('Tests:       2 skipped, 10 passed, 12 total', false)).toEqual({
      status: 'passed',
      passed: 10,
      failed: null,
      skipped: 2,
    });
  });

  it('sums every cargo test binary', () => {
    const output = [
      'test result: ok. 12 passed; 0 failed; 1 ignored; 0 measured',
      'test result: FAILED. 3 passed; 2 failed; 0 ignored; 0 measured',
    ].join('\n');
    expect(parseTestSummary(output, true)).toEqual({
      status: 'failed',
      passed: 15,
      failed: 2,
      skipped: 1,
    });
  });

  it('reads pytest and reports a failing exit as failed even without counts', () => {
    expect(parseTestSummary('==== 1 failed, 8 passed in 0.52s ====', true)).toMatchObject({
      status: 'failed',
      passed: 8,
      failed: 1,
    });
    expect(parseTestSummary('segmentation fault', true)).toMatchObject({ status: 'failed' });
  });
});

describe('host messages the phone accepts', () => {
  const snapshot = {
    action: 'code.session.snapshot',
    version: 1,
    rootId: 'root-1',
    threadId: 'thread-1',
    title: 'Fix retry',
    status: 'running',
    activeTurnId: 'turn-1',
    partialResponse: 'Editing',
    messages: [{ role: 'user', text: 'go' }],
    pendingApprovals: [{ turnId: 'turn-1', requestId: 'ap-1', summary: 'Run tests', detail: '' }],
    fileChanges: [{ path: 'a.ts', kind: 'created', tool: 'write_file', changedAt: SENT_AT }],
    queuedGuidance: [],
    syncedAt: SENT_AT,
  };

  it('reads a snapshot and refuses one with a role the transcript does not show', () => {
    expect(parseRemoteCodeSnapshot(snapshot)).toEqual(snapshot);
    expect(
      parseRemoteCodeSnapshot({ ...snapshot, messages: [{ role: 'system', text: 'x' }] }),
    ).toBeNull();
  });

  it('reads the session list, including folders the host could not open', () => {
    const sessions = {
      action: 'code.sessions',
      version: 1,
      sessions: [
        {
          rootId: 'root-1',
          threadId: 'thread-1',
          title: 'Fix retry',
          folder: 'api',
          branch: null,
          status: 'idle',
          model: null,
          updatedAt: SENT_AT,
        },
      ],
      unavailable: [{ folder: 'web', message: 'CLI missing' }],
      syncedAt: SENT_AT,
    };
    expect(parseRemoteCodeSessions(sessions)).toEqual(sessions);
    expect(parseRemoteCodeSessions({ ...sessions, version: 2 })).toBeNull();
  });

  it('reads live diff and test events and refuses an oversized diff', () => {
    const diff = {
      action: 'code.session.event',
      version: 1,
      rootId: 'root-1',
      threadId: 'thread-1',
      event: { type: 'diff', diff: { path: 'a.ts', patch: '@@ -1 +1 @@', truncated: false } },
      sentAt: SENT_AT,
    };
    expect(parseRemoteCodeEvent(diff)).toEqual(diff);
    expect(
      parseRemoteCodeEvent({
        ...diff,
        event: {
          type: 'diff',
          diff: {
            path: 'a.ts',
            patch: 'x'.repeat(REMOTE_CODE_LIMITS.diffLength + 1),
            truncated: true,
          },
        },
      }),
    ).toBeNull();
    expect(
      parseRemoteCodeEvent({
        ...diff,
        event: {
          type: 'test-run',
          testRun: {
            toolCallId: 'c',
            command: 'pnpm test',
            status: 'failed',
            passed: 3,
            failed: 1,
            skipped: null,
            output: 'Tests 1 failed | 3 passed',
            finishedAt: SENT_AT,
          },
        },
      }),
    ).not.toBeNull();
  });
});
