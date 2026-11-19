// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

type NeonDbModule = typeof import('@/lib/server/neon-db');
type ClaimedUserScopeDbModule = typeof import('@/lib/server/claimed-user-scope-db');
type OutboundContentInspectionModule = typeof import('@/lib/security/outbound-content-inspection');
type OrganizationPolicyGateModule = typeof import('@/lib/services/organization-policy-gate');
type ChatFilePreparationModule = typeof import('@/lib/server/chat-file-preparation');
type RetrievalIndexServiceModule = typeof import('@/lib/services/retrieval-index-service');

vi.mock('@/lib/server/neon-db', async (importOriginal) => ({
  ...(await importOriginal<NeonDbModule>()),
  getNeonDb: vi.fn(() => ({ marker: 'neon' })),
}));
vi.mock('@/lib/server/claimed-user-scope-db', async (importOriginal) => ({
  ...(await importOriginal<ClaimedUserScopeDbModule>()),
  createClaimedUserScopedDb: vi.fn(() => ({ marker: 'scoped' })),
}));
vi.mock('@/lib/security/outbound-content-inspection', async (importOriginal) => ({
  ...(await importOriginal<OutboundContentInspectionModule>()),
  inspectOutboundContent: vi.fn(),
}));
vi.mock('@/lib/services/organization-policy-gate', async (importOriginal) => ({
  ...(await importOriginal<OrganizationPolicyGateModule>()),
  resolveSecretHandlingPolicy: vi.fn(),
}));
vi.mock('@/lib/server/chat-file-preparation', async (importOriginal) => ({
  ...(await importOriginal<ChatFilePreparationModule>()),
  prepareChatFileStep: vi.fn(),
}));
vi.mock('@/lib/services/retrieval-index-service', async (importOriginal) => ({
  ...(await importOriginal<RetrievalIndexServiceModule>()),
  requestMediaAssetReindex: vi.fn(),
}));

import {
  inspectOutboundContent,
  type InspectOutboundInput,
} from '@/lib/security/outbound-content-inspection';
import { createClaimedUserScopedDb } from '@/lib/server/claimed-user-scope-db';
import { resolveSecretHandlingPolicy } from '@/lib/services/organization-policy-gate';
import { createChatFileIntakeDeps, parseChatFileIntakeWorkflowInput } from '../steps';
import { intakeRow } from './memory-intake-store';

const INPUT = {
  version: 1 as const,
  intakeId: intakeRow().id,
  userId: 'user-owner',
  organizationId: null,
};

function capturedInput(): InspectOutboundInput<unknown> {
  const call = vi.mocked(inspectOutboundContent).mock.calls[0];
  if (!call) throw new Error('The content inspection was never asked.');
  return call[0] as InspectOutboundInput<unknown>;
}

describe('createChatFileIntakeDeps', () => {
  it('works through the person’s own scoped role', () => {
    createChatFileIntakeDeps({ ...INPUT, organizationId: '7a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d' });
    expect(createClaimedUserScopedDb).toHaveBeenCalledWith(
      { marker: 'neon' },
      { userId: 'user-owner', organizationId: '7a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d' },
    );
  });

  it('reads and moves only rows of the person the run was started for', async () => {
    const query = vi.fn(async () => [] as unknown[]);
    vi.mocked(createClaimedUserScopedDb).mockReturnValueOnce({ query } as never);
    const deps = createChatFileIntakeDeps(INPUT);
    const runId = 'run-1';
    const nowMs = Date.parse('2026-11-15T09:00:00.000Z');

    await deps.store.get(INPUT.intakeId);
    await deps.store.claim({
      intakeId: INPUT.intakeId,
      runId,
      to: 'inspecting',
      from: ['uploaded'],
      nowMs,
    });
    await deps.store.renew({ intakeId: INPUT.intakeId, runId, state: 'scanning', nowMs });
    await deps.store.recordEtag({ intakeId: INPUT.intakeId, runId, etag: '"e"' });
    await deps.store.recordAttempt({
      intakeId: INPUT.intakeId,
      runId,
      attemptsBefore: 0,
      jobId: null,
    });
    await deps.store.addBudgetWait({ intakeId: INPUT.intakeId, runId, waitMs: 1, capMs: 2 });
    await deps.store.returnToScanning({ intakeId: INPUT.intakeId, runId, nowMs });
    await deps.store.end({
      intakeId: INPUT.intakeId,
      runId,
      from: ['scanning'],
      ending: { state: 'cancelled', cancelReason: 'client' },
      nowMs,
    });
    await deps.store.markPurged({ intakeId: INPUT.intakeId, nowMs });
    await deps.store.refundDailyBytes({ intakeId: INPUT.intakeId, bytes: 1, nowMs });

    expect(query).toHaveBeenCalledTimes(10);
    for (const [sql, params] of query.mock.calls as unknown as Array<[string, unknown[]]>) {
      expect(sql).toMatch(/\buser_id = \$\d+/);
      expect(params).toContain(INPUT.userId);
    }
  });

  it('answers nothing, and sends no statement, for a cancel by someone other than the run’s owner', async () => {
    const query = vi.fn(async () => [] as unknown[]);
    vi.mocked(createClaimedUserScopedDb).mockReturnValueOnce({ query } as never);
    const deps = createChatFileIntakeDeps(INPUT);

    await expect(
      deps.store.end({
        intakeId: INPUT.intakeId,
        runId: null,
        from: ['scanning'],
        ending: { state: 'cancelled', cancelReason: 'client' },
        nowMs: 0,
        userId: 'someone-else',
      }),
    ).resolves.toBeNull();
    expect(query).not.toHaveBeenCalled();
  });

  it.each([
    ['blocked', 'blocked'],
    ['redacted', 'blocked'],
    ['allowed', 'allowed'],
  ] as const)('reads a %s data policy verdict as %s', async (action, expected) => {
    vi.mocked(inspectOutboundContent).mockResolvedValue({
      action,
      findings: [],
      value: {},
      message: 'not sent',
    } as never);
    const deps = createChatFileIntakeDeps(INPUT);
    const row = intakeRow();
    const head = new Uint8Array([1, 2, 3]);

    await expect(deps.inspectContent(row, head, [])).resolves.toBe(expected);
    expect(capturedInput()).toMatchObject({
      channel: 'upload',
      value: { fileName: row.fileName, mimeType: row.mimeType, content: head },
      userId: row.userId,
      resourceId: row.stagingKey,
    });
  });

  it('holds a redact policy to block, since a large file is kept as it was sent', async () => {
    vi.mocked(inspectOutboundContent).mockResolvedValue({
      action: 'allowed',
      findings: [],
      value: {},
    });
    const deps = createChatFileIntakeDeps(INPUT);
    await deps.inspectContent(intakeRow(), new Uint8Array(1), []);
    const { resolveMode } = capturedInput();

    vi.mocked(resolveSecretHandlingPolicy).mockResolvedValueOnce({
      mode: 'redact',
      organizationId: null,
    });
    await expect(resolveMode()).resolves.toEqual({ mode: 'block', organizationId: null });
    vi.mocked(resolveSecretHandlingPolicy).mockResolvedValueOnce({
      mode: 'warn',
      organizationId: 'org',
    });
    await expect(resolveMode()).resolves.toEqual({ mode: 'warn', organizationId: 'org' });
  });
});

describe('parseChatFileIntakeWorkflowInput', () => {
  it('takes a well formed input and refuses anything else', () => {
    expect(parseChatFileIntakeWorkflowInput(INPUT)).toEqual(INPUT);
    for (const bad of [
      { ...INPUT, version: 2 },
      { ...INPUT, intakeId: 'not-a-uuid' },
      { ...INPUT, userId: ' ' },
      { ...INPUT, organizationId: 'org' },
    ]) {
      expect(() => parseChatFileIntakeWorkflowInput(bad as typeof INPUT)).toThrow();
    }
  });
});
