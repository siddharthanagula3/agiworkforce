import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

vi.mock('server-only', () => ({}));

import {
  ANONYMIZED_USER_COLUMNS,
  UNDELETED_USER_TABLES,
  USER_SCOPED_TABLES,
} from '@/lib/server/account-erasure';
import {
  ORGANIZATION_SCOPED_TABLES,
  ORGANIZATION_UNDELETED_TABLES,
} from '@/lib/server/organization-erasure';
import {
  METERING_EVIDENCE_RETENTION_DAYS,
  STATUTORY_RECORD_RETENTION_DAYS,
} from '@/lib/billing/financial-record-retention';
import {
  SECURITY_AUDIT_LOG_RETENTION_DAYS,
  SECURITY_LOG_RETENTION_CRON_PATH,
} from '@/lib/server/security-log-retention';

import {
  RETENTION_MATRIX,
  accountErasureProgress,
  resolveDeletionStatus,
  renderRetentionMatrixMarkdown,
  scheduledDeletionProgress,
  storesOutlivingTheirSubject,
  unclassifiedStores,
  type RetentionEntry,
} from '../deletion-manifest';

function entry(store: string): RetentionEntry {
  const found = RETENTION_MATRIX.find((candidate) => candidate.store === store);
  if (!found) throw new Error(`${store} is missing from the retention matrix`);
  return found;
}

describe('the matrix covers every store the erasure paths know about', () => {
  it('classifies every one of them', () => {
    expect(unclassifiedStores()).toEqual([]);
  });

  it('carries every account-scoped, tenant-scoped and deliberately retained table', () => {
    const stores = new Set(RETENTION_MATRIX.map((candidate) => candidate.store));
    const expected = [
      ...USER_SCOPED_TABLES.map((row) => row.table),
      ...ORGANIZATION_SCOPED_TABLES.map((row) => row.table),
      ...ANONYMIZED_USER_COLUMNS.map((row) => row.table),
      ...Object.keys(UNDELETED_USER_TABLES),
      ...Object.keys(ORGANIZATION_UNDELETED_TABLES),
    ];
    expect(expected.filter((store) => !stores.has(store))).toEqual([]);
  });

  it('names the stores that are not tables, which no inventory enumerates', () => {
    const outside = RETENTION_MATRIX.filter((candidate) => candidate.kind !== 'table');
    expect(outside.map((candidate) => candidate.store)).toContain('media object storage');
    expect(outside.every((candidate) => candidate.dataClass !== 'telemetry')).toBe(true);
  });
});

describe('what a data class buys', () => {
  it('erases every conversation store with its subject', () => {
    for (const store of ['web_conversations', 'web_artifacts', 'research_reports', 'user_memories'])
      expect(entry(store)).toMatchObject({
        dataClass: 'customer_content',
        erasedWithSubject: true,
      });
  });

  it('erases derived content with its subject too, not only the source it came from', () => {
    for (const store of ['retrieval_chunks', 'retrieval_documents', 'web_artifact_index'])
      expect(entry(store)).toMatchObject({ dataClass: 'derived_content', erasedWithSubject: true });
  });

  it('gives every customer-content table a deletion path', () => {
    const missing = RETENTION_MATRIX.filter(
      (candidate) =>
        candidate.dataClass === 'customer_content' &&
        candidate.deletionPath === null &&
        candidate.retainedReason === null,
    );
    expect(missing.map((candidate) => candidate.store)).toEqual([]);
  });

  it('keeps an append-only trail out of the erasure path and says why', () => {
    for (const store of ['security_audit_logs', 'enterprise_audit_events', 'support_access_events'])
      expect(entry(store).dataClass).toBe('audit_trail');
    expect(entry('enterprise_audit_events').erasedWithSubject).toBe(false);
    expect(entry('erasure_tombstones').retainedReason).toMatch(/suppression list/i);
  });
});

describe('retention windows are read from the schedules that own them', () => {
  it('takes the financial windows from the financial schedule', () => {
    expect(entry('credit_transactions').maximumAgeDays).toBe(STATUTORY_RECORD_RETENTION_DAYS);
    expect(entry('usage_events').maximumAgeDays).toBe(METERING_EVIDENCE_RETENTION_DAYS);
    expect(entry('organization_usage_ledger').maximumAgeDays).toBe(STATUTORY_RECORD_RETENTION_DAYS);
  });

  it('takes the security-log window and its sweep from the security-log module', () => {
    expect(entry('security_audit_logs')).toMatchObject({
      maximumAgeDays: SECURITY_AUDIT_LOG_RETENTION_DAYS,
    });
    expect(entry('security_audit_logs').deletionPath).toContain(SECURITY_LOG_RETENTION_CRON_PATH);
  });

  it('holds no maximum age for a live entitlement, which is erased instead of aged out', () => {
    expect(entry('subscriptions').maximumAgeDays).toBeNull();
    expect(entry('subscriptions').erasedWithSubject).toBe(true);
    expect(entry('token_credits').erasedWithSubject).toBe(true);
  });

  it('states one window per data class rather than one for the whole product', () => {
    const windows = new Set(
      RETENTION_MATRIX.map((candidate) => candidate.maximumAgeDays).filter(
        (days): days is number => days !== null,
      ),
    );
    expect(windows.size).toBeGreaterThan(1);
  });
});

describe('the stores that outlive their subject', () => {
  it('is empty, so a store added without a deletion path fails this', () => {
    expect(storesOutlivingTheirSubject().map((candidate) => candidate.store)).toEqual([]);
  });

  it('names the path that reaches the cached MCP response bodies', () => {
    const cache = entry('mcp_response_cache');
    expect(cache.erasedWithSubject).toBe(true);
    expect(cache.deletionPath).toContain('eraseConnectorResponseCache');
  });
});

describe('deletion reports four states, not two', () => {
  const progress = {
    scheduledFor: null,
    activeLegalHolds: 0,
    storesAttempted: 0,
    storesCleared: 0,
    storesFailed: 0,
    objectsFailed: 0,
  };

  it('is blocked while a legal hold preserves the subject', () => {
    const outcome = resolveDeletionStatus({
      ...progress,
      activeLegalHolds: 2,
      storesAttempted: 80,
      storesCleared: 80,
    });
    expect(outcome.status).toBe('blocked');
    expect(outcome.reason).toMatch(/nothing was deleted/);
  });

  it('is pending while it is only scheduled', () => {
    const outcome = resolveDeletionStatus({
      ...progress,
      scheduledFor: '2026-10-18T00:00:00.000Z',
    });
    expect(outcome.status).toBe('pending');
    expect(outcome.reason).toContain('2026-10-18T00:00:00.000Z');
  });

  it('is partial when a single store failed, however many succeeded', () => {
    const outcome = resolveDeletionStatus({
      ...progress,
      storesAttempted: 84,
      storesCleared: 83,
      storesFailed: 1,
    });
    expect(outcome.status).toBe('partial');
  });

  it('is partial when the rows went but a stored object did not', () => {
    const outcome = resolveDeletionStatus({
      ...progress,
      storesAttempted: 84,
      storesCleared: 84,
      objectsFailed: 3,
    });
    expect(outcome.status).toBe('partial');
    expect(outcome.reason).toMatch(/3 stored object/);
  });

  it('is complete only when every store cleared and every object was freed', () => {
    const outcome = resolveDeletionStatus({
      ...progress,
      storesAttempted: 84,
      storesCleared: 84,
    });
    expect(outcome.status).toBe('complete');
  });
});

describe('accountErasureProgress', () => {
  const report = {
    userId: 'user-1',
    mediaObjectsDeleted: 0,
    mediaObjectsFailed: 0,
    mediaRowsDeleted: 0,
    backupObjectsDeleted: 0,
    backupObjectsFailed: 0,
    knowledgeObjectsDeleted: 0,
    knowledgeObjectsFailed: 0,
    avatarObjectsDeleted: 0,
    avatarObjectsFailed: 0,
    cacheKeysDeleted: 0,
    cacheKeysFailed: 0,
    tables: {} as Record<string, Record<string, unknown>>,
    anonymized: {} as Record<string, Record<string, unknown>>,
    complete: true,
    profileRetained: false,
  };

  function erasable(): string {
    const entry = RETENTION_MATRIX.find(
      (candidate) => candidate.kind === 'table' && candidate.deletionPath !== null,
    );
    expect(entry).toBeDefined();
    return entry?.store as string;
  }

  it('counts a store the matrix knows and ignores one it does not', () => {
    const store = erasable();
    const progress = accountErasureProgress({
      ...report,
      tables: { [store]: { deleted: true }, not_a_store_in_the_matrix: { deleted: true } },
    } as never);

    expect(progress.storesAttempted).toBe(1);
    expect(progress.storesCleared).toBe(1);
    expect(resolveDeletionStatus(progress).status).toBe('complete');
  });

  it('does not count a store the erasure skipped because the schema has no such table', () => {
    const progress = accountErasureProgress({
      ...report,
      tables: { [erasable()]: { deleted: false, skipped: true } },
    } as never);

    expect(progress.storesAttempted).toBe(0);
    expect(resolveDeletionStatus(progress).status).toBe('pending');
  });

  it('carries a failed store and an unfreed object through to partial', () => {
    const progress = accountErasureProgress({
      ...report,
      tables: { [erasable()]: { deleted: false, error: 'boom' } },
      mediaObjectsFailed: 2,
      cacheKeysFailed: 1,
    } as never);

    expect(progress.storesFailed).toBe(1);
    expect(progress.objectsFailed).toBe(3);
    expect(resolveDeletionStatus(progress).status).toBe('partial');
  });

  it('reads a retained legal-hold row as a hold, which blocks the whole deletion', () => {
    const progress = accountErasureProgress({
      ...report,
      tables: { legal_holds: { deleted: false, retainedForRetry: true, error: 'held' } },
    } as never);

    expect(progress.activeLegalHolds).toBe(1);
    expect(resolveDeletionStatus(progress).status).toBe('blocked');
  });

  it('claims no hold for a deletion that has only been scheduled', () => {
    const progress = scheduledDeletionProgress('2026-09-19T00:00:00.000Z');

    expect(progress.storesAttempted).toBe(0);
    expect(resolveDeletionStatus(progress)).toEqual({
      status: 'pending',
      reason: 'Deletion is scheduled for 2026-09-19T00:00:00.000Z and has not started.',
    });
  });
});

describe('the published matrix is the one the code holds', () => {
  const doc = readFileSync(
    join(process.cwd(), '../../docs/architecture/RETENTION_MATRIX.md'),
    'utf8',
  );

  function storesNamedIn(markdown: string): string[] {
    return [...markdown.matchAll(/^\|\s*`([^`]+)`\s*\|/gmu)].map((row) => row[1] as string).sort();
  }

  it('publishes a row for every store and no store the code dropped', () => {
    expect(storesNamedIn(doc)).toEqual(storesNamedIn(renderRetentionMatrixMarkdown()));
  });

  it('states the deletion path each row was rendered with', () => {
    for (const entry of RETENTION_MATRIX) {
      if (!entry.deletionPath) continue;
      expect(doc, `${entry.store} is published without its deletion path`).toContain(
        entry.deletionPath.replace(/\|/g, '/'),
      );
    }
  });
});
