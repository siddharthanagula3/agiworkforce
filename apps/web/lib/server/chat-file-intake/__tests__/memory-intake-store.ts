import type { ChatFileIntakeState } from '@agiworkforce/cloud-contracts';

import { refundDailyLargeFileBytes } from '../quotas';
import {
  intakeLeaseUntil,
  type ChatFileIntakeRow,
  type ChatFileIntakeStore,
  type IntakeEnding,
} from '../store';

const TERMINAL = new Set<ChatFileIntakeState>(['sealed', 'rejected', 'failed', 'cancelled']);

export interface MemoryIntakeStore extends ChatFileIntakeStore {
  rows: Map<string, ChatFileIntakeRow>;
  put(row: ChatFileIntakeRow): void;
  row(intakeId: string): ChatFileIntakeRow;
  remove(intakeId: string): void;
  calls: string[];
}

export function intakeRow(overrides: Partial<ChatFileIntakeRow> = {}): ChatFileIntakeRow {
  return {
    id: '3f6a2c1e-9b8d-4e7f-a1b2-c3d4e5f60718',
    userId: 'user-owner',
    organizationId: null,
    conversationId: null,
    temporaryChat: false,
    fileName: 'report.pdf',
    mimeType: 'application/pdf',
    byteCount: 40 * 1024 * 1024,
    declaredSha256: 'a'.repeat(64),
    stagingKey: 'chat-attachments/user-owner/1731000000000_abc123defgh45.pdf',
    multipartUploadId: 'upload-1',
    partBytes: 5 * 1024 * 1024,
    state: 'uploaded',
    refusalCode: null,
    failureCode: null,
    cancelReason: null,
    attempts: 0,
    firstSubmittedAt: null,
    scanBudgetWaitMs: 0,
    sealingEnteredAt: null,
    scanJobId: null,
    workflowRunId: null,
    etag: null,
    mediaAssetId: null,
    dailyBytesCharged: 40 * 1024 * 1024,
    bytesRefundedAt: null,
    leaseUntil: null,
    lastPartRequestAt: null,
    stateChangedAt: 0,
    objectsPurgedAt: null,
    createdAt: 0,
    ...overrides,
  };
}

/**
 * The intake rows in memory, answering each statement of `store.ts` with the
 * same compare-and-set rule: a row is changed only when the state, the run and
 * the lease the statement names all hold, so a lost race answers null exactly
 * as an update that matched nothing does.
 */
export function createMemoryIntakeStore(seed: ChatFileIntakeRow[] = []): MemoryIntakeStore {
  const rows = new Map<string, ChatFileIntakeRow>(seed.map((row) => [row.id, { ...row }]));
  const calls: string[] = [];

  function update(
    intakeId: string,
    matches: (row: ChatFileIntakeRow) => boolean,
    change: (row: ChatFileIntakeRow) => Partial<ChatFileIntakeRow>,
  ): ChatFileIntakeRow | null {
    const row = rows.get(intakeId);
    if (!row || !matches(row)) return null;
    const next = { ...row, ...change(row) };
    rows.set(intakeId, next);
    return { ...next };
  }

  const store: MemoryIntakeStore = {
    rows,
    calls,
    put(row) {
      rows.set(row.id, { ...row });
    },
    row(intakeId) {
      const row = rows.get(intakeId);
      if (!row) throw new Error(`No intake ${intakeId}`);
      return { ...row };
    },
    remove(intakeId) {
      rows.delete(intakeId);
    },
    async get(intakeId) {
      calls.push('get');
      const row = rows.get(intakeId);
      return row ? { ...row } : null;
    },
    async claim({ intakeId, runId, to, from, nowMs }) {
      calls.push(`claim:${to}`);
      return update(
        intakeId,
        (row) =>
          (row.state === to || from.includes(row.state)) &&
          (row.state === 'uploaded' ||
            row.workflowRunId === runId ||
            (row.leaseUntil !== null && row.leaseUntil < nowMs)),
        (row) => ({
          state: to,
          workflowRunId: runId,
          leaseUntil: intakeLeaseUntil(to, nowMs),
          stateChangedAt: row.state === to ? row.stateChangedAt : nowMs,
          firstSubmittedAt:
            to === 'scanning' ? (row.firstSubmittedAt ?? nowMs) : row.firstSubmittedAt,
          sealingEnteredAt:
            to === 'sealing' ? (row.sealingEnteredAt ?? nowMs) : row.sealingEnteredAt,
        }),
      );
    },
    async renew({ intakeId, runId, state, nowMs }) {
      calls.push(`renew:${state}`);
      return update(
        intakeId,
        (row) => row.state === state && row.workflowRunId === runId,
        () => ({ leaseUntil: intakeLeaseUntil(state, nowMs) }),
      );
    },
    async recordEtag({ intakeId, runId, etag }) {
      calls.push('recordEtag');
      return update(
        intakeId,
        (row) => row.state === 'inspecting' && row.workflowRunId === runId,
        () => ({ etag }),
      );
    },
    async recordAttempt({ intakeId, runId, attemptsBefore, jobId }) {
      calls.push('recordAttempt');
      return update(
        intakeId,
        (row) =>
          row.state === 'scanning' &&
          row.workflowRunId === runId &&
          row.attempts === attemptsBefore,
        (row) => ({ attempts: row.attempts + 1, scanJobId: jobId }),
      );
    },
    async addBudgetWait({ intakeId, runId, waitMs, capMs }) {
      calls.push('addBudgetWait');
      return update(
        intakeId,
        (row) => row.state === 'scanning' && row.workflowRunId === runId,
        (row) => ({ scanBudgetWaitMs: Math.min(row.scanBudgetWaitMs + waitMs, capMs) }),
      );
    },
    async returnToScanning({ intakeId, runId, nowMs }) {
      calls.push('returnToScanning');
      return update(
        intakeId,
        (row) => row.state === 'sealing' && row.workflowRunId === runId,
        () => ({
          state: 'scanning',
          leaseUntil: intakeLeaseUntil('scanning', nowMs),
          stateChangedAt: nowMs,
        }),
      );
    },
    async end({ intakeId, runId, from, ending, nowMs, userId }) {
      calls.push(`end:${ending.state}`);
      const prior = rows.get(intakeId);
      if (!prior) return null;
      const priorState = prior.state;
      const row = update(
        intakeId,
        (candidate) =>
          from.includes(candidate.state) &&
          (runId === null || candidate.workflowRunId === runId) &&
          (userId === undefined || candidate.userId === userId),
        () => endingColumns(ending, nowMs),
      );
      return row ? { row, priorState } : null;
    },
    async markPurged({ intakeId, nowMs }) {
      calls.push('markPurged');
      return (
        update(
          intakeId,
          (row) => row.objectsPurgedAt === null && TERMINAL.has(row.state),
          () => ({ objectsPurgedAt: nowMs }),
        ) !== null
      );
    },
    async refundDailyBytes({ intakeId, bytes, nowMs }) {
      calls.push('refundDailyBytes');
      const marked = update(
        intakeId,
        (row) => row.bytesRefundedAt === null && row.dailyBytesCharged > 0,
        () => ({ bytesRefundedAt: nowMs }),
      );
      if (!marked) return 0;
      const refund = Math.min(Math.max(0, Math.floor(bytes)), marked.dailyBytesCharged);
      if (refund === 0) return 0;
      const given = await refundDailyLargeFileBytes({
        userId: marked.userId,
        bytes: refund,
        chargedAtMs: marked.createdAt,
      });
      return given ? refund : 0;
    },
    async hasOtherScanning({ userId, intakeId }) {
      calls.push('hasOtherScanning');
      return [...rows.values()].some(
        (row) => row.userId === userId && row.id !== intakeId && row.state === 'scanning',
      );
    },
  };
  return store;
}

function endingColumns(ending: IntakeEnding, nowMs: number): Partial<ChatFileIntakeRow> {
  return {
    state: ending.state,
    refusalCode: ending.state === 'rejected' ? ending.refusalCode : null,
    failureCode: ending.state === 'failed' ? ending.failureCode : null,
    cancelReason: ending.state === 'cancelled' ? ending.cancelReason : null,
    leaseUntil: null,
    stateChangedAt: nowMs,
  };
}
