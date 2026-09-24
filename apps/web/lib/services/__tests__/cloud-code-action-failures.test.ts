import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';

const emitted: Array<Record<string, unknown>> = [];

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  logger: {
    info: (record: Record<string, unknown>) => emitted.push(record),
    error: (record: Record<string, unknown>) => emitted.push(record),
    warn: (record: Record<string, unknown>) => emitted.push(record),
    debug: (record: Record<string, unknown>) => emitted.push(record),
  },
}));

import { getE2BExecutor } from '@/lib/e2b/runtime';
import { OBSERVABILITY_ATTRIBUTE } from '@/lib/observability/attributes';
import {
  CODE_ACTION_SPANS,
  codeActionSpanName,
  type CodeAction,
} from '@/lib/observability/code-actions';

import {
  closeCloudCodeSession,
  commitAndPushCloudCodeSession,
  createCloudCodeSession,
  openCloudCodeSessionPullRequest,
  readCloudCodeSessionChanges,
  runCloudCodeCommand,
  runCloudCodeNotebookCell,
} from '../cloud-code-session-service';

const OWNER = { userId: 'usr_1', organizationId: null } as never;
const UNKNOWN_SESSION = 'not-a-session-id';
const PLAN = 'pro';

// Every action is driven for real against a database it never reaches: the
// session id is refused before any dependency is asked for.
const db = {} as DatabaseAdapter;

const DRIVERS: Readonly<Record<CodeAction, () => Promise<unknown>>> = {
  clone: () =>
    createCloudCodeSession(
      db,
      OWNER,
      { requestId: 'req_1', title: '', networkAccess: 'none' },
      PLAN,
    ),
  commit_push: () => commitAndPushCloudCodeSession(db, OWNER, UNKNOWN_SESSION, PLAN, 'msg'),
  diff: () => readCloudCodeSessionChanges(db, OWNER, UNKNOWN_SESSION, PLAN),
  notebook_execute: () =>
    runCloudCodeNotebookCell(db, OWNER, UNKNOWN_SESSION, { code: 'x', language: 'python' }, PLAN),
  pull_request: () => openCloudCodeSessionPullRequest(db, OWNER, UNKNOWN_SESSION),
  sandbox_provision: () => getE2BExecutor(),
  terminal_command: () => runCloudCodeCommand(db, OWNER, UNKNOWN_SESSION, 'ls', PLAN),
  worktree_cleanup: () => closeCloudCodeSession(db, OWNER, UNKNOWN_SESSION, PLAN),
};

/**
 * `sandbox_provision` answers null for every refusal it meets (no price
 * configured, no capacity, no plan) rather than raising, so its span closes ok
 * and a refused provision is not countable as one. Recording the cause belongs
 * with the refusal, in apps/web/lib/e2b/runtime.ts. Nothing else may join this
 * list, which is what the length assertion below holds.
 */
const FAILURE_NOT_COUNTABLE: readonly CodeAction[] = [];

beforeEach(() => {
  emitted.length = 0;
});

describe('a Code action that fails is countable as that action failing', () => {
  it('leaves no action whose refusal closes as a success', () => {
    expect(FAILURE_NOT_COUNTABLE).toEqual([]);
  });

  it('records the failure on every other action the registry declares', async () => {
    const unrecorded: string[] = [];

    for (const { action, domain } of CODE_ACTION_SPANS) {
      if (FAILURE_NOT_COUNTABLE.includes(action)) continue;
      emitted.length = 0;
      await DRIVERS[action]().catch(() => undefined);
      const span = emitted.find(
        (record) =>
          record['event'] === 'span' && record['span_name'] === codeActionSpanName(action),
      );
      if (span?.['status'] !== 'error') {
        unrecorded.push(`${action} did not record a failed span`);
        continue;
      }
      if (!span['error.type']) unrecorded.push(`${action} recorded no error type`);
      if (span['span_domain'] !== domain) {
        unrecorded.push(`${action} recorded the failure under ${String(span['span_domain'])}`);
      }
      if (span[OBSERVABILITY_ATTRIBUTE.codeAction] !== action) {
        unrecorded.push(`${action} did not carry its own name on the failure`);
      }
    }

    expect(unrecorded).toEqual([]);
  });

  it('keeps the call to GitHub separable from the sandbox work around it', async () => {
    await DRIVERS.pull_request().catch(() => undefined);

    const span = emitted.find(
      (record) =>
        record['event'] === 'span' && record['span_name'] === codeActionSpanName('pull_request'),
    );
    expect(span?.['span_domain']).toBe('external');
    expect(span?.['status']).toBe('error');
  });
});
