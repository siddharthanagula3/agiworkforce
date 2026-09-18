import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import {
  CLOSED_ORGANIZATION_MEMORY_POLICY,
  DISABLED_MANAGED_MEMORY_POLICY,
  MemoryIneligibleError,
  UNGOVERNED_MEMORY_POLICY,
  loadManagedMemoryContext,
  loadOrganizationMemoryPolicy,
  memoryEligibilityGate,
  memoryRetentionClass,
  writeConsolidatedMemory,
  type ConsolidatedMemoryWrite,
  type OrganizationMemoryPolicy,
} from '../managed-memory-context-service';

const ORG = '0190a000-0000-7000-8000-00000000b001';
const PROJECT = '0190a000-0000-7000-8000-00000000b002';
const NOW = Date.parse('2026-09-18T00:00:00.000Z');

function write(overrides: Partial<ConsolidatedMemoryWrite> = {}): ConsolidatedMemoryWrite {
  return {
    userId: 'u1',
    content: 'User prefers concise answers.',
    category: 'preference',
    source: 'web',
    ...overrides,
  };
}

function enforcing(retentionDays: number): OrganizationMemoryPolicy {
  return { allowMemory: true, retentionDays, retentionEnforced: true };
}

describe('memoryEligibilityGate', () => {
  it('refuses every write while the workspace has memory off', () => {
    const decision = memoryEligibilityGate({
      write: write({ organizationId: ORG }),
      organizationPolicy: CLOSED_ORGANIZATION_MEMORY_POLICY,
    });

    expect(decision).toMatchObject({
      eligible: false,
      reason: 'organization_memory_disabled',
    });
  });

  // The context taxonomy already answers which classes may produce a memory;
  // connector and web results may not, so neither may reach user_memories.
  it('refuses content taken from a connector or a web result', () => {
    for (const sourceClass of ['connector_result', 'web_result'] as const) {
      expect(
        memoryEligibilityGate({
          write: write({ sourceClass }),
          organizationPolicy: UNGOVERNED_MEMORY_POLICY,
        }),
      ).toMatchObject({ eligible: false, reason: 'source_class_cannot_generate_memory' });
    }

    expect(
      memoryEligibilityGate({
        write: write({ sourceClass: 'past_chat' }),
        organizationPolicy: UNGOVERNED_MEMORY_POLICY,
      }),
    ).toMatchObject({ eligible: true });
  });

  it('refuses a turn that ran outside AGI-managed storage', () => {
    for (const trustMode of ['local', 'byok'] as const) {
      expect(
        memoryEligibilityGate({
          write: write({ trustMode }),
          organizationPolicy: UNGOVERNED_MEMORY_POLICY,
        }),
      ).toMatchObject({ eligible: false, reason: 'trust_mode_outside_managed_storage' });
    }

    expect(
      memoryEligibilityGate({
        write: write({ trustMode: 'managed' }),
        organizationPolicy: UNGOVERNED_MEMORY_POLICY,
      }),
    ).toMatchObject({ eligible: true });
  });

  it('caps a memory at the enforced workspace retention window', () => {
    const decision = memoryEligibilityGate({
      write: write({ organizationId: ORG, expiresAt: '2027-09-18T00:00:00.000Z' }),
      organizationPolicy: enforcing(30),
      nowMs: NOW,
    });

    expect(decision).toMatchObject({
      eligible: true,
      expiresAt: new Date(NOW + 30 * 86_400_000).toISOString(),
    });
  });

  it('gives an open-ended memory the retention window as its expiry', () => {
    expect(
      memoryEligibilityGate({
        write: write({ organizationId: ORG }),
        organizationPolicy: enforcing(7),
        nowMs: NOW,
      }),
    ).toMatchObject({ expiresAt: new Date(NOW + 7 * 86_400_000).toISOString() });
  });

  // Migration 0138: retention_days is a recorded position until it is enforced.
  it('leaves the expiry alone when the workspace records retention but does not enforce it', () => {
    expect(
      memoryEligibilityGate({
        write: write({ organizationId: ORG }),
        organizationPolicy: { allowMemory: true, retentionDays: 7, retentionEnforced: false },
        nowMs: NOW,
      }),
    ).toMatchObject({ expiresAt: undefined });
  });

  it('keeps a shorter expiry the user asked for', () => {
    const soon = new Date(NOW + 2 * 86_400_000).toISOString();
    expect(
      memoryEligibilityGate({
        write: write({ organizationId: ORG, expiresAt: soon }),
        organizationPolicy: enforcing(30),
        nowMs: NOW,
      }),
    ).toMatchObject({ expiresAt: soon });
  });
});

describe('memoryRetentionClass', () => {
  it('separates a project’s standing context from an ordinary project fact', () => {
    expect(memoryRetentionClass({ projectId: null, category: 'decision' })).toBe('account');
    expect(memoryRetentionClass({ projectId: PROJECT, category: 'preference' })).toBe(
      'project_scoped',
    );
    for (const category of ['context', 'decision', 'summary']) {
      expect(memoryRetentionClass({ projectId: PROJECT, category })).toBe(
        'long_running_project_context',
      );
    }
  });
});

describe('writeConsolidatedMemory runs the gate before it persists', () => {
  it('writes nothing and names the reason when the workspace has memory off', async () => {
    const query = vi.fn(async (_sql: string) => [] as unknown[]);
    await expect(
      writeConsolidatedMemory({ query } as never, write({ organizationId: ORG })),
    ).rejects.toMatchObject({ reason: 'organization_memory_disabled' });

    const inserts = query.mock.calls.filter(([sql]) => sql.includes('insert into user_memories'));
    expect(inserts).toHaveLength(0);
  });

  it('stamps the retention ceiling on the row it writes', async () => {
    const query = vi.fn(async (_sql: string) => [{ outcome: 'inserted', id: 'm1' }]);
    await writeConsolidatedMemory({ query } as never, write({ organizationId: ORG }), {
      organizationPolicy: enforcing(1),
    });

    const [, params] = query.mock.calls[0] as unknown as [string, unknown[]];
    expect(typeof params[8]).toBe('string');
    expect(Date.parse(params[8] as string)).toBeGreaterThan(Date.now());
  });

  it('is a MemoryIneligibleError, so a caller can tell policy from failure', async () => {
    const query = vi.fn(async () => []);
    const error = await writeConsolidatedMemory(
      { query } as never,
      write({ trustMode: 'local' }),
    ).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(MemoryIneligibleError);
  });
});

describe('loadOrganizationMemoryPolicy', () => {
  it('treats a workspace with no policy row as closed', async () => {
    const query = vi.fn(async () => []);
    await expect(loadOrganizationMemoryPolicy({ query } as never, ORG)).resolves.toEqual(
      CLOSED_ORGANIZATION_MEMORY_POLICY,
    );
  });

  it('leaves a personal account ungoverned without a query', async () => {
    const query = vi.fn(async () => []);
    await expect(loadOrganizationMemoryPolicy({ query } as never, null)).resolves.toEqual(
      UNGOVERNED_MEMORY_POLICY,
    );
    expect(query).not.toHaveBeenCalled();
  });
});

describe('the disabled-memory contract', () => {
  it('reads no memory into context for a disabled user, even with rows to read', async () => {
    const query = vi.fn(async () => [
      { id: 'mem-1', content: 'I prefer mornings.', category: 'preference', pinned: true },
    ]);

    await expect(
      loadManagedMemoryContext({ query } as never, {
        userId: 'u1',
        policy: DISABLED_MANAGED_MEMORY_POLICY,
      }),
    ).resolves.toEqual([]);
    expect(query).not.toHaveBeenCalled();
  });
});
