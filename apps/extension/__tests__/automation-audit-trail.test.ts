/**
 * Every browser action the extension takes has to leave a receipt the account
 * can read back. These cover the three things that go wrong with a trail: a
 * claim nobody checked, a receipt that carries the page, and a receipt lost to
 * a service-worker restart.
 *
 * @vitest-environment jsdom
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { startAutomationAttempt } from '@agiworkforce/types';

const storage = vi.hoisted(() => {
  const local: Record<string, unknown> = {};
  return {
    local,
    reset(): void {
      for (const key of Object.keys(local)) delete local[key];
    },
  };
});

vi.stubGlobal('chrome', {
  runtime: { getManifest: () => ({ version: '1.2.0' }), lastError: null },
  storage: {
    local: {
      get: (keys: string | string[]) => {
        const result: Record<string, unknown> = {};
        for (const key of typeof keys === 'string' ? [keys] : keys) {
          if (key in storage.local) result[key] = storage.local[key];
        }
        return Promise.resolve(result);
      },
      set: (items: Record<string, unknown>) => {
        Object.assign(storage.local, items);
        return Promise.resolve();
      },
    },
  },
});

const authToken = vi.hoisted(() => ({ value: 'bearer-for-this-test' as string | null }));

vi.mock('../src/features/cloud-bridge/freeTrialClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/features/cloud-bridge/freeTrialClient')>()),
  FREE_TRIAL_GATEWAY: 'https://agiworkforce.example',
  getAuthToken: () => Promise.resolve(authToken.value),
}));

const {
  AUTOMATION_AUDIT_BATCH_SIZE,
  AUTOMATION_AUDIT_OUTBOX_KEY,
  AUTOMATION_OUTCOMES_PATH,
  buildAutomationAuditReport,
  flushAutomationAuditOutbox,
  recordAutomationAction,
  resetAutomationAuditFlushForTests,
} = await import('../src/features/observability/automationAudit');

function attempt(action = 'click'): ReturnType<typeof startAutomationAttempt> {
  return startAutomationAttempt({
    runId: 'run-under-test',
    action,
    surface: 'extension',
    sessionKind: 'user-chrome',
    startedAtMs: 1_000,
  });
}

beforeEach(() => {
  storage.reset();
  authToken.value = 'bearer-for-this-test';
  resetAutomationAuditFlushForTests();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('the receipt an action leaves', () => {
  it('records an unchecked success as a failure rather than taking the claim', () => {
    const { outcome } = buildAutomationAuditReport(
      attempt(),
      { claim: 'succeeded', verification: { check: 'the tab url was read', passed: false } },
      { deviceId: 'install-1', target: 'https://example.com/a', eventId: crypto.randomUUID() },
    );

    expect(outcome.status).toBe('failed');
    expect(outcome.verified).toBe(false);
  });

  it('keeps a verified success verified', () => {
    const { outcome, report } = buildAutomationAuditReport(
      attempt(),
      { claim: 'succeeded', verification: { check: 'the tab url was read', passed: true } },
      { deviceId: 'install-1', target: 'https://example.com/a', eventId: crypto.randomUUID() },
    );

    expect(outcome.status).toBe('succeeded');
    expect(report.claim).toBe('succeeded');
    expect(report.verification?.passed).toBe(true);
  });

  it('names an origin, never the page the run was on', () => {
    const { report } = buildAutomationAuditReport(
      attempt('navigate'),
      { claim: 'succeeded', verification: { check: 'the tab url was read', passed: true } },
      {
        deviceId: 'install-1',
        target: 'https://example.com/inbox?thread=private-subject-line',
        eventId: crypto.randomUUID(),
      },
    );

    expect(report.target).toBe('https://example.com');
    expect(JSON.stringify(report)).not.toContain('private-subject-line');
  });

  it('keeps only the origin of a url the driver observed or a refusal named', () => {
    const page = 'https://mail.example.com/inbox?thread=private-subject-line&token=abc123';
    const observed = buildAutomationAuditReport(
      attempt('click'),
      {
        claim: 'succeeded',
        verification: {
          check: 'the tab url was read after the click',
          passed: true,
          observed: page,
        },
      },
      { deviceId: null, target: page, eventId: crypto.randomUUID() },
    ).report;
    const refused = buildAutomationAuditReport(
      attempt('navigate'),
      { claim: 'refused', reason: `Navigation to ${page} is off the approved list.` },
      { deviceId: null, target: null, eventId: crypto.randomUUID() },
    ).report;

    expect(observed.verification?.observed).toBe('https://mail.example.com');
    expect(refused.reason).toBe('Navigation to https://mail.example.com is off the approved list.');
    for (const report of [observed, refused]) {
      expect(JSON.stringify(report)).not.toMatch(/private-subject-line|abc123|inbox/);
    }
  });

  it('drops a target that is not an http origin', () => {
    const { report } = buildAutomationAuditReport(
      attempt(),
      { claim: 'failed', reason: 'the tab was closed' },
      { deviceId: null, target: 'chrome://settings', eventId: crypto.randomUUID() },
    );

    expect(report.target).toBeNull();
  });

  it('bounds a reason so one long refusal cannot have the batch refused', () => {
    const { report } = buildAutomationAuditReport(
      attempt(),
      { claim: 'refused', reason: 'x'.repeat(5_000) },
      { deviceId: null, target: null, eventId: crypto.randomUUID() },
    );

    expect(report.reason?.length).toBe(300);
  });

  it('carries the surface and session kind the extension actually drives', () => {
    const { report } = buildAutomationAuditReport(
      attempt(),
      { claim: 'refused', reason: 'the user did not approve it' },
      { deviceId: 'install-1', target: null, eventId: crypto.randomUUID() },
    );

    expect(report.surface).toBe('extension');
    expect(report.sessionKind).toBe('user-chrome');
  });
});

describe('the outbox between the action and the account', () => {
  it('queues to storage, so a service-worker restart still has the receipt', async () => {
    await recordAutomationAction(
      attempt(),
      { claim: 'succeeded', verification: { check: 'the tab url was read', passed: true } },
      'https://example.com/a',
    );

    const queued = storage.local[AUTOMATION_AUDIT_OUTBOX_KEY] as unknown[];
    expect(queued).toHaveLength(1);
  });

  it('posts the queue to the account ingest and clears what was accepted', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ accepted: 1 }),
    });
    await recordAutomationAction(attempt(), { claim: 'failed', reason: 'it failed' }, null);

    await expect(flushAutomationAuditOutbox(fetchMock as unknown as typeof fetch)).resolves.toBe(
      true,
    );

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`https://agiworkforce.example${AUTOMATION_OUTCOMES_PATH}`);
    expect((init.headers as Record<string, string>)['Authorization']).toBe(
      'Bearer bearer-for-this-test',
    );
    expect(storage.local[AUTOMATION_AUDIT_OUTBOX_KEY]).toEqual([]);
  });

  it('keeps the queue when the ingest refused it', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, json: () => Promise.resolve({}) });
    await recordAutomationAction(attempt(), { claim: 'failed', reason: 'it failed' }, null);

    await expect(flushAutomationAuditOutbox(fetchMock as unknown as typeof fetch)).resolves.toBe(
      false,
    );
    expect(storage.local[AUTOMATION_AUDIT_OUTBOX_KEY]).toHaveLength(1);
  });

  it('keeps the queue when the ingest took fewer than it was sent', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ accepted: 0 }),
    });
    await recordAutomationAction(attempt(), { claim: 'failed', reason: 'it failed' }, null);

    await expect(flushAutomationAuditOutbox(fetchMock as unknown as typeof fetch)).resolves.toBe(
      false,
    );
    expect(storage.local[AUTOMATION_AUDIT_OUTBOX_KEY]).toHaveLength(1);
  });

  it('sends nothing when nobody is signed in, and keeps the receipt for when they are', async () => {
    authToken.value = null;
    const fetchMock = vi.fn();
    await recordAutomationAction(attempt(), { claim: 'failed', reason: 'it failed' }, null);

    await expect(flushAutomationAuditOutbox(fetchMock as unknown as typeof fetch)).resolves.toBe(
      false,
    );
    expect(fetchMock).not.toHaveBeenCalled();
    expect(storage.local[AUTOMATION_AUDIT_OUTBOX_KEY]).toHaveLength(1);
  });

  it('drops the oldest receipts rather than refusing the newest', async () => {
    for (let index = 0; index < AUTOMATION_AUDIT_BATCH_SIZE + 5; index += 1) {
      await recordAutomationAction(
        attempt(`action-${index}`),
        { claim: 'failed', reason: 'it failed' },
        null,
      );
    }

    const queued = storage.local[AUTOMATION_AUDIT_OUTBOX_KEY] as { action: string }[];
    expect(queued).toHaveLength(AUTOMATION_AUDIT_BATCH_SIZE);
    expect(queued[queued.length - 1]?.action).toBe(`action-${AUTOMATION_AUDIT_BATCH_SIZE + 4}`);
  });
});
