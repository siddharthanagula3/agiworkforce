import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';

const emitted: Array<Record<string, unknown>> = [];

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', () => ({
  logger: {
    info: (record: Record<string, unknown>) => emitted.push(record),
    error: (record: Record<string, unknown>) => emitted.push(record),
    warn: (record: Record<string, unknown>) => emitted.push(record),
    debug: (record: Record<string, unknown>) => emitted.push(record),
  },
}));

import { getE2BExecutor } from '@/lib/e2b/runtime';
import {
  closeCloudCodeSession,
  commitAndPushCloudCodeSession,
  createCloudCodeSession,
  openCloudCodeSessionPullRequest,
  readCloudCodeSessionChanges,
  runCloudCodeCommand,
  runCloudCodeNotebookCell,
} from '@/lib/services/cloud-code-session-service';

import { CODE_ACTION_SPANS, codeActionSpanName, type CodeAction } from '../code-actions';
import { OBSERVABILITY_ATTRIBUTE } from '../attributes';

const OWNER = { userId: 'usr_1', organizationId: null } as never;
const UNKNOWN_SESSION = 'not-a-session-id';
const PLAN = 'pro';

// A malformed session id is refused before any dependency is reached, so each
// action is driven for real without a database behind it.
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

function spanFor(action: CodeAction): Record<string, unknown> | undefined {
  const name = codeActionSpanName(action);
  return emitted.find((record) => record['event'] === 'span' && record['span_name'] === name);
}

beforeEach(() => {
  emitted.length = 0;
});

describe('every repository action a Code session takes opens a span', () => {
  it('has a product call site for each action the registry declares', async () => {
    const missing: string[] = [];
    for (const { action, domain } of CODE_ACTION_SPANS) {
      emitted.length = 0;
      await DRIVERS[action]().catch(() => undefined);
      const span = spanFor(action);
      if (!span) {
        missing.push(`${action} opened no span`);
        continue;
      }
      if (span['span_domain'] !== domain) {
        missing.push(`${action} opened a ${String(span['span_domain'])} span, not ${domain}`);
      }
      if (span[OBSERVABILITY_ATTRIBUTE.codeAction] !== action) {
        missing.push(`${action} did not carry its own name`);
      }
    }
    expect(missing).toEqual([]);
  });

  it('records the failure on the span rather than losing it in the request', async () => {
    await DRIVERS.terminal_command().catch(() => undefined);

    const span = spanFor('terminal_command');
    expect(span?.['status']).toBe('error');
    expect(span?.['error.type']).toBeTruthy();
    expect(span?.['duration_ms']).toBeTypeOf('number');
  });

  it('separates a call to GitHub from the sandbox work around it', () => {
    const external = CODE_ACTION_SPANS.filter((entry) => entry.domain === 'external');
    expect(external.map((entry) => entry.action)).toEqual(['pull_request']);
  });

  it('leaves the contract alone, so the same error still reaches the caller', async () => {
    await expect(DRIVERS.diff()).rejects.toThrow();
  });
});
