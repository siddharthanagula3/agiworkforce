// @vitest-environment node
import { createMemoryKeyValueStore, type KeyValueStore } from '@agiworkforce/key-value';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type KeyValueModule = typeof import('@/lib/server/key-value');
type StepsModule = typeof import('@/lib/server/chat-file-intake/steps');

const runtime = vi.hoisted(() => ({
  sleep: (_ms: number): void => undefined,
}));

vi.mock('workflow', () => ({
  sleep: vi.fn(async (ms: number) => runtime.sleep(ms)),
  getWorkflowMetadata: vi.fn(() => ({ workflowRunId: 'wrun-1' })),
}));
vi.mock('@/lib/server/key-value', async (importOriginal) => ({
  ...(await importOriginal<KeyValueModule>()),
  getKeyValueStore: vi.fn(),
}));
vi.mock('@/lib/server/chat-file-intake/steps', async (importOriginal) => {
  const actual = await importOriginal<StepsModule>();
  return {
    ...actual,
    createChatFileIntakeDeps: vi.fn(),
    runChatFileIntakeStep: vi.fn(actual.runChatFileIntakeStep),
  };
});

import { sleep } from 'workflow';

import { CHAT_LARGE_FILE_POLICY } from '@/lib/chat-attachment-policy';
import {
  createIntakeHarness,
  putStagedFile,
  START_MS,
  stubMemoryObjectStorage,
  type IntakeHarness,
} from '@/lib/server/chat-file-intake/__tests__/inline-executor';
import {
  createFakeScanner,
  type ScannerCall,
  type ScannerScriptReply,
} from '@/lib/server/chat-file-intake/__tests__/fake-scanner';
import { intakeRow } from '@/lib/server/chat-file-intake/__tests__/memory-intake-store';
import {
  createChatFileIntakeDeps,
  runChatFileIntakeStep,
} from '@/lib/server/chat-file-intake/steps';
import type { ChatFileIntakeRow } from '@/lib/server/chat-file-intake/store';
import { getKeyValueStore } from '@/lib/server/key-value';
import { chatFileIntakeWorkflow } from '../chat-file-intake-workflow';

const { intake } = CHAT_LARGE_FILE_POLICY;
const MINUTE = 60_000;
const RUN = 'wrun-1';
const DAY_KEY = 'agi:chat-files:daily-bytes:user-owner:2026-11-15';

let kv: KeyValueStore;

beforeEach(() => {
  stubMemoryObjectStorage();
  kv = createMemoryKeyValueStore();
  vi.mocked(getKeyValueStore).mockReturnValue(kv);
});

interface Script {
  submit?: (call: ScannerCall, index: number, elapsedMs: number) => ScannerScriptReply | undefined;
  poll?: (call: ScannerCall, index: number, elapsedMs: number) => ScannerScriptReply | undefined;
}

async function intakeRun(script: Script) {
  const base = intakeRow({ createdAt: START_MS, stateChangedAt: START_MS });
  const staged = await putStagedFile(base);
  const row: ChatFileIntakeRow = { ...base, declaredSha256: staged.sha256 };
  await kv.increment(DAY_KEY, row.dailyBytesCharged);
  const clean = {
    answer: 'pollDoneClean',
    verdict: { sha256: staged.sha256, bytes: row.byteCount, etag: staged.etag },
  };
  let harness: IntakeHarness | null = null;
  const elapsed = () => (harness ? harness.clock.now() - START_MS : 0);
  const scanner = createFakeScanner({
    submit: (call, index) =>
      script.submit?.(call, index, elapsed()) ?? { answer: 'submitAccepted' },
    poll: (call, index) => script.poll?.(call, index, elapsed()) ?? clean,
  });
  const ready = createIntakeHarness({ scanner, rows: [row] });
  harness = ready;
  const sleeps: Array<{ ms: number; wokeAtMs: number; leaseUntil: number | null; state: string }> =
    [];
  runtime.sleep = (ms) => {
    ready.clock.advance(ms);
    const current = ready.store.row(row.id);
    sleeps.push({
      ms,
      wokeAtMs: ready.clock.now(),
      leaseUntil: current.leaseUntil,
      state: current.state,
    });
  };
  vi.mocked(createChatFileIntakeDeps).mockReturnValue(ready.deps);

  await chatFileIntakeWorkflow({
    version: 1,
    intakeId: row.id,
    userId: row.userId,
    organizationId: null,
  });

  return {
    row: ready.store.row(row.id),
    harness: ready,
    scanner,
    sleeps,
    elapsedMs: elapsed(),
    clean,
  };
}

describe('the scan stage of the intake workflow', () => {
  it('waits out queue_full for 25 minutes, then scans clean on the first attempt', async () => {
    const run = await intakeRun({
      submit: (_call, _index, elapsed) =>
        elapsed < 25 * MINUTE ? { answer: 'submitQueueFull' } : { answer: 'submitAccepted' },
    });

    expect(run.row.state).toBe('sealed');
    expect(run.row.attempts).toBe(1);
    expect(run.row.scanBudgetWaitMs).toBe(0);
    expect(run.scanner.submits().length).toBeGreaterThan(20);
    expect(new Set(run.scanner.submits().map((call) => call.jobId))).toEqual(
      new Set([`${run.row.id}:1`]),
    );
  });

  it('gives up queue_full at the give-up window and refunds the bytes', async () => {
    const run = await intakeRun({ submit: () => ({ answer: 'submitQueueFull' }) });

    expect(run.row).toMatchObject({
      state: 'failed',
      failureCode: 'scan_unavailable',
      attempts: 0,
    });
    expect(run.elapsedMs).toBeGreaterThanOrEqual(intake.scanGiveUpMs);
    expect(run.elapsedMs).toBeLessThan(intake.scanGiveUpMs + 2 * MINUTE);
    expect(run.row.bytesRefundedAt).not.toBeNull();
    expect(await kv.get(DAY_KEY)).toBe(0);
  });

  it('waits out source_budget for 70 minutes, counting it apart from the give-up window', async () => {
    const run = await intakeRun({
      submit: (_call, _index, elapsed) =>
        elapsed < 70 * MINUTE ? { answer: 'submitSourceBudget' } : { answer: 'submitAccepted' },
    });

    expect(run.row.state).toBe('sealed');
    expect(run.row.attempts).toBe(1);
    expect(run.row.scanBudgetWaitMs).toBeGreaterThanOrEqual(70 * MINUTE - 877_000);
    expect(run.row.scanBudgetWaitMs).toBeLessThanOrEqual(intake.budgetWaitMaxMs);
  });

  it('gives up source_budget once the budget wait and the give-up window are both spent', async () => {
    const run = await intakeRun({ submit: () => ({ answer: 'submitSourceBudget' }) });

    expect(run.row).toMatchObject({ state: 'failed', failureCode: 'scan_unavailable' });
    expect(run.row.scanBudgetWaitMs).toBe(intake.budgetWaitMaxMs);
    expect(run.elapsedMs).toBeGreaterThanOrEqual(intake.budgetWaitMaxMs + intake.scanGiveUpMs);
    expect(run.elapsedMs).toBeLessThan(intake.budgetWaitMaxMs + intake.scanGiveUpMs + 15 * MINUTE);
  });

  it('never sleeps longer than the give-up window, whatever Retry-After asks', async () => {
    const queued = await intakeRun({
      submit: () => ({ answer: 'submitQueueFull', retryAfter: '3600' }),
    });
    expect(queued.sleeps.map((entry) => entry.ms)).toContain(intake.scanGiveUpMs);
    expect(Math.max(...queued.sleeps.map((entry) => entry.ms))).toBe(intake.scanGiveUpMs);
    expect(queued.row).toMatchObject({ state: 'failed', failureCode: 'scan_unavailable' });
    expect(queued.elapsedMs).toBe(intake.scanGiveUpMs);
    expect(vi.mocked(sleep).mock.calls.every(([ms]) => Number(ms) <= intake.scanGiveUpMs)).toBe(
      true,
    );
  });

  it('caps a sleep longer than the give-up window that a step hands back, whatever step it is', async () => {
    const actual = await vi.importActual<typeof import('@/lib/server/chat-file-intake/steps')>(
      '@/lib/server/chat-file-intake/steps',
    );
    let calls = 0;
    vi.mocked(runChatFileIntakeStep).mockImplementation(async (...args) => {
      const next = await actual.runChatFileIntakeStep(...args);
      calls += 1;
      return calls === 2 && next.next === 'submit' ? { ...next, sleepMs: 6 * 60 * MINUTE } : next;
    });
    vi.mocked(sleep).mockClear();

    try {
      const run = await intakeRun({});

      expect(vi.mocked(sleep).mock.calls[0]).toEqual([intake.scanGiveUpMs]);
      expect(run.sleeps[0]?.ms).toBe(intake.scanGiveUpMs);
      expect(run.row.state).toBe('sealed');
    } finally {
      vi.mocked(runChatFileIntakeStep).mockImplementation(actual.runChatFileIntakeStep);
    }
  });

  it('sleeps a long source_budget Retry-After in slices, renewing the lease at each wake', async () => {
    const run = await intakeRun({
      submit: (_call, index) =>
        index === 0
          ? { answer: 'submitSourceBudget', retryAfter: '3600' }
          : { answer: 'submitAccepted' },
    });

    const slices = run.sleeps.slice(0, 2).map((entry) => entry.ms);
    expect(slices).toEqual([intake.scanGiveUpMs, 3_600_000 - intake.scanGiveUpMs]);
    expect(run.scanner.submits()).toHaveLength(2);
    expect(run.row.state).toBe('sealed');
    expect(run.row.scanBudgetWaitMs).toBe(3_600_000);
    const renewals = run.harness.store.calls.filter((call) => call === 'renew:scanning').length;
    expect(renewals).toBeGreaterThanOrEqual(3);
    for (const entry of run.sleeps) {
      expect(entry.state).toBe('scanning');
      expect(entry.leaseUntil).toBeGreaterThan(entry.wokeAtMs);
    }
  });

  it('counts a failed submit as an attempt and retries after the backoff', async () => {
    const run = await intakeRun({
      submit: (_call, index) => (index < 3 ? 'unreachable' : { answer: 'submitAccepted' }),
    });

    expect(run.row.state).toBe('sealed');
    expect(run.row.attempts).toBe(4);
    expect(run.sleeps.slice(0, 3).map((entry) => entry.ms)).toEqual([10_000, 30_000, 60_000]);
    expect(run.scanner.submits().map((call) => call.jobId)).toEqual(
      [1, 2, 3, 4].map((attempt) => `${run.row.id}:${attempt}`),
    );
  });

  it('ends scan_unavailable after the last attempt ends incomplete, refunding within the cap', async () => {
    const run = await intakeRun({ poll: () => ({ answer: 'pollDoneDeadline' }) });

    expect(run.row).toMatchObject({
      state: 'failed',
      failureCode: 'scan_unavailable',
      attempts: intake.maxScanAttempts,
    });
    expect(run.scanner.submits()).toHaveLength(intake.maxScanAttempts);
    expect(await kv.get(DAY_KEY)).toBe(0);
  });

  it.each(['pollDoneSourceUnavailable', 'pollDoneScanFailed', 'pollUnknown'])(
    'retries a scan answered %s and seals on the next attempt',
    async (answer) => {
      const run = await intakeRun({
        poll: (_call, index) => (index === 0 ? { answer } : undefined),
      });

      expect(run.row.state).toBe('sealed');
      expect(run.row.attempts).toBe(2);
      expect(run.scanner.polls()[0]?.jobId).toBe(`${run.row.id}:1`);
      expect(run.scanner.submits().map((call) => call.jobId)).toEqual([
        `${run.row.id}:1`,
        `${run.row.id}:2`,
      ]);
    },
  );

  it('refuses a source that changed under the scanner', async () => {
    const run = await intakeRun({ poll: () => ({ answer: 'pollDoneSourceChanged' }) });

    expect(run.row).toMatchObject({ state: 'rejected', refusalCode: 'changed_during_check' });
    expect(run.scanner.submits()).toHaveLength(1);
  });
});

describe('the attempt deadline', () => {
  async function scanningHarness() {
    const base = intakeRow({
      state: 'scanning',
      workflowRunId: RUN,
      leaseUntil: START_MS + 30 * MINUTE,
      attempts: 1,
      firstSubmittedAt: START_MS,
      createdAt: START_MS,
    });
    const staged = await putStagedFile(base);
    const row = { ...base, etag: staged.etag, scanJobId: `${base.id}:1` };
    const scanner = createFakeScanner({
      poll: () => ({ answer: 'pollScanning', body: { deadlineMs: 200_000 } }),
    });
    return { row, harness: createIntakeHarness({ scanner, rows: [row] }) };
  }

  it('keeps polling 230 seconds into a 200 second deadline and starts a new attempt at 261', async () => {
    const { row, harness } = await scanningHarness();
    const poll = {
      next: 'poll' as const,
      pollIndex: 3,
      scanningSinceMs: START_MS,
      deadlineMs: 200_000,
    };

    harness.clock.advance(230_000);
    await expect(
      runChatFileIntakeStep(harness.deps, { intakeId: row.id, runId: RUN }, poll),
    ).resolves.toMatchObject({ next: 'poll', scanningSinceMs: START_MS, deadlineMs: 200_000 });

    harness.clock.advance(31_000);
    await expect(
      runChatFileIntakeStep(harness.deps, { intakeId: row.id, runId: RUN }, poll),
    ).resolves.toEqual({ next: 'submit', sleepMs: 10_000 });
  });
});
