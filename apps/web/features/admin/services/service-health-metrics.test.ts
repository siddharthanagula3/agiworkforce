import { describe, expect, it, vi } from 'vitest';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/server/neon-db', () => ({ getNeonDb: vi.fn() }));

import {
  REMOTE_DEVICE_ONLINE_WINDOW_MS,
  SERVICE_HEALTH_WINDOW_MS,
  readServiceHealth,
} from './service-health-metrics';

const NOW = new Date('2026-09-17T12:00:00.000Z');

function database(respond: (sql: string) => unknown[]): {
  db: DatabaseAdapter;
  query: ReturnType<typeof vi.fn>;
} {
  const query = vi.fn(async (sql: string) => respond(sql.replace(/\s+/g, ' ')));
  return { db: { query } as unknown as DatabaseAdapter, query };
}

describe('readServiceHealth', () => {
  it('maps each panel from its own source and derives rates from the counts', async () => {
    const { db, query } = database((sql) => {
      if (sql.includes('from public.security_audit_logs') && sql.includes('group by 1')) {
        return [
          {
            category: 'mcp',
            calls: '40',
            failures: '10',
            blocked: '2',
            latency_p50_ms: '120',
            latency_p95_ms: 900.5,
          },
        ];
      }
      if (sql.includes('from public.security_audit_logs')) {
        return [{ commands: '8', handed_off: '6', failures: '0', blocked: '2' }];
      }
      if (sql.includes('cloud_agent_approval_checkpoints')) {
        return [
          {
            device_steps: '5',
            resolved: '3',
            failed: '1',
            waiting: '1',
            resolve_p50_ms: '4200',
            devices_online: '2',
            devices_seen: '4',
          },
        ];
      }
      if (sql.includes('cloud_agent_runs')) {
        return [
          {
            queue: 'cloud-agent-turn',
            depth: '3',
            in_flight: '7',
            oldest_waiting_at: new Date('2026-09-17T11:58:00.000Z'),
          },
          { queue: 'video-generation', depth: 0, in_flight: 0, oldest_waiting_at: null },
        ];
      }
      if (sql.includes('project_knowledge_files')) {
        return [{ uploaded: '0', extracted: '0', extraction_p50_ms: null }];
      }
      return [];
    });

    const summary = await readServiceHealth(NOW, db);

    expect(summary.windowStart).toBe(
      new Date(NOW.getTime() - SERVICE_HEALTH_WINDOW_MS).toISOString(),
    );
    expect(summary.tools).toEqual([
      {
        category: 'mcp',
        calls: 40,
        failures: 10,
        blocked: 2,
        failureRate: 0.25,
        latencyP50Ms: 120,
        latencyP95Ms: 900.5,
      },
    ]);
    expect(summary.browser).toEqual({
      commands: 8,
      handedOff: 6,
      failures: 0,
      blocked: 2,
      failureRate: 0,
    });
    expect(summary.remote).toMatchObject({
      deviceSteps: 5,
      failed: 1,
      failureRate: 0.2,
      resolveP50Ms: 4200,
      devicesOnline: 2,
      devicesSeenInWindow: 4,
    });
    expect(summary.queues).toEqual([
      {
        queue: 'cloud-agent-turn',
        depth: 3,
        inFlight: 7,
        oldestWaitingAt: '2026-09-17T11:58:00.000Z',
      },
      { queue: 'video-generation', depth: 0, inFlight: 0, oldestWaitingAt: null },
    ]);
    expect(summary.files).toEqual({
      uploaded: 0,
      extracted: 0,
      withoutText: 0,
      extractionRate: null,
      extractionP50Ms: null,
    });

    const remoteCall = query.mock.calls.find(([sql]) =>
      String(sql).includes('cloud_agent_approval_checkpoints'),
    );
    expect(remoteCall?.[1]).toEqual([
      new Date(NOW.getTime() - SERVICE_HEALTH_WINDOW_MS).toISOString(),
      new Date(NOW.getTime() - REMOTE_DEVICE_ONLINE_WINDOW_MS).toISOString(),
    ]);
  });

  it('reads only aggregates, never a user or row identifier', async () => {
    const { db, query } = database(() => []);
    await readServiceHealth(NOW, db);

    for (const [sql] of query.mock.calls) {
      expect(String(sql)).not.toMatch(/\buser_id\b/u);
    }
  });

  it('reports an empty window as zero counts and unmeasured rates', async () => {
    const { db } = database(() => []);
    const summary = await readServiceHealth(NOW, db);

    expect(summary.tools).toEqual([]);
    expect(summary.browser.failureRate).toBeNull();
    expect(summary.remote.failureRate).toBeNull();
    expect(summary.files.extractionRate).toBeNull();
  });
});
