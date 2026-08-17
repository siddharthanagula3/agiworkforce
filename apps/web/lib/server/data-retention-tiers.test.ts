import { describe, expect, it } from 'vitest';
import {
  DATA_STORE_RETENTION,
  ERASURE_FAN_OUT_STORES,
  type DataStoreRetention,
} from '@/lib/server/data-retention-tiers';

describe('data retention tiers', () => {
  it('gives every enumerated store a data class, a tier and a bounded retention', () => {
    expect(DATA_STORE_RETENTION.length).toBeGreaterThan(0);
    for (const entry of DATA_STORE_RETENTION) {
      expect(entry.dataClass, `${entry.store} has no data class`).toBeTruthy();
      expect(entry.tier, `${entry.store} has no retention tier`).toBeTruthy();
      expect(
        entry.maxRetention.trim().length,
        `${entry.store} has no retention bound`,
      ).toBeGreaterThan(0);
      expect(
        entry.covers.trim().length,
        `${entry.store} does not say what it holds`,
      ).toBeGreaterThan(0);
    }
  });

  it('names every store exactly once', () => {
    const names = DATA_STORE_RETENTION.map((entry) => entry.store);
    expect(new Set(names).size).toBe(names.length);
  });

  it('covers every place user data lands, not only the primary database', () => {
    const names = new Set(DATA_STORE_RETENTION.map((entry) => entry.store));
    for (const store of [
      'neon_postgres_user_tables',
      'neon_postgres_search_indexes',
      'object_storage_media',
      'redis_sandbox_sessions',
      'redis_rate_limit_counters',
      'neon_backups',
      'sentry_error_events',
    ]) {
      expect(names.has(store), `${store} is not enumerated`).toBe(true);
    }
  });

  it('gives every store that is not erased on request a reason it survives', () => {
    const survivors = DATA_STORE_RETENTION.filter(
      (entry: DataStoreRetention) => entry.erasure !== 'erasure_fan_out',
    );
    for (const entry of survivors) {
      expect(
        ['cascade', 'ttl_expiry', 'retained_by_obligation', 'vendor_deletion_request'],
        `${entry.store} has no stated survival mechanism`,
      ).toContain(entry.erasure);
    }
  });

  it('requires the sandbox cache to be purged by the erasure path, not left to its TTL', () => {
    const sandbox = DATA_STORE_RETENTION.find((entry) => entry.store === 'redis_sandbox_sessions');
    expect(sandbox?.erasure).toBe('erasure_fan_out');
    expect(ERASURE_FAN_OUT_STORES).toContain('redis_sandbox_sessions');
  });
});
