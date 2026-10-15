import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@agiworkforce/context', async (importOriginal) => {
  const actual = await importOriginal<ContextModule>();
  return { ...actual, prohibitedMemoryCategory: vi.fn(actual.prohibitedMemoryCategory) };
});

import { extractCandidateMemoryFacts } from '@agiworkforce/agent-core';
import {
  PROHIBITED_MEMORY_CATEGORIES,
  prohibitedMemoryCategory,
  type ProhibitedMemoryCategory,
} from '@agiworkforce/context';
import {
  CLOSED_ORGANIZATION_MEMORY_POLICY,
  DISABLED_MANAGED_MEMORY_POLICY,
  MemoryIneligibleError,
  UNGOVERNED_MEMORY_POLICY,
  loadManagedMemoryContext,
  loadOrganizationMemoryPolicy,
  memoryEligibilityGate,
  readOrganizationMemoryPolicy,
  memoryRetentionClass,
  memoryWriteAdmission,
  persistManagedAutoMemoryFacts,
  writeConsolidatedMemory,
  type ConsolidatedMemoryWrite,
  type ManagedMemoryPolicy,
  type OrganizationMemoryPolicy,
} from '../managed-memory-context-service';
import { answerMemoryPolicyQuery, asQuery } from './memory-policy-stub';

type ContextModule = typeof import('@agiworkforce/context');

const ORG = '0190a000-0000-7000-8000-00000000b001';
const PROJECT = '0190a000-0000-7000-8000-00000000b002';
const NOW = Date.parse('2026-09-18T00:00:00.000Z');

const SAMPLE_PROHIBITED: { readonly [K in ProhibitedMemoryCategory]: string } = {
  credential: `User's password is ${'correct-horse-battery'}`,
  payment_instrument: 'User pays with card 4111 1111 1111 1111',
  government_identifier: 'User SSN is 123-45-6789',
  biometric: 'User unlocks the laptop with a fingerprint',
  precise_location: 'User lives at 221 Baker Street',
  criminal_history: 'User has a criminal record',
  immigration_status: 'User is undocumented',
};

function write(overrides: Partial<ConsolidatedMemoryWrite> = {}): ConsolidatedMemoryWrite {
  return {
    userId: 'u1',
    content: 'User prefers concise answers.',
    category: 'preference',
    source: 'web',
    ...overrides,
  };
}

const MEMORY_ON: ManagedMemoryPolicy = {
  enabled: true,
  generateFromHistory: true,
  allowToolAssistedGeneration: true,
  searchPastChats: true,
};

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

describe('the prohibited-content screen', () => {
  it('refuses a stated value in every category the policy declares', () => {
    for (const category of PROHIBITED_MEMORY_CATEGORIES) {
      const sample = SAMPLE_PROHIBITED[category];
      expect(prohibitedMemoryCategory(sample), sample).toBe(category);
      expect(
        memoryEligibilityGate({
          write: write({ content: sample }),
          organizationPolicy: UNGOVERNED_MEMORY_POLICY,
        }),
      ).toMatchObject({ eligible: false, reason: 'prohibited_content_category' });
    }
  });

  it('refuses before the workspace gate, so an open workspace is no way in', () => {
    const decision = memoryEligibilityGate({
      write: write({ content: SAMPLE_PROHIBITED.credential, organizationId: ORG }),
      organizationPolicy: enforcing(365),
    });
    expect(decision).toMatchObject({ eligible: false, reason: 'prohibited_content_category' });
  });

  it('never reaches the insert, and never repeats the value in the refusal', async () => {
    const query = vi.fn(async () => []);
    const error = await writeConsolidatedMemory(
      { query } as never,
      write({ content: SAMPLE_PROHIBITED.payment_instrument }),
    ).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(MemoryIneligibleError);
    expect((error as MemoryIneligibleError).message).not.toContain('4111');
    expect(query).not.toHaveBeenCalled();
  });
});

describe('the sensitive-topic opt-in', () => {
  const SENSITIVE = 'User is a practicing Catholic';
  const MODEL_IDENTITY_SENTENCES = [
    'User is a software engineer and a devout Muslim',
    'User is a 29-year-old Black woman working in tech',
    'User is a teacher and a proud Democrat',
  ];

  async function learnedWith(candidate: string, includeSensitiveTopics: boolean) {
    const query = asQuery(
      vi.fn(
        async (sql: string, _params?: unknown[]) =>
          answerMemoryPolicyQuery(sql, { includeSensitiveTopics }) ?? [
            { outcome: 'inserted', id: 'm1' },
          ],
      ),
    );
    await persistManagedAutoMemoryFacts({ query } as never, {
      userId: 'u1',
      candidates: [candidate],
    });
    return query.mock.calls.some(([sql]) => sql.includes('insert into user_memories'));
  }

  it('keeps a learned fact about a sensitive topic out while the opt-in is off', () => {
    const decision = memoryEligibilityGate({
      write: write({ content: SENSITIVE, source: 'auto' }),
      organizationPolicy: UNGOVERNED_MEMORY_POLICY,
      userPolicy: MEMORY_ON,
    });

    expect(decision).toMatchObject({ eligible: false, reason: 'sensitive_topic_not_opted_in' });
    expect(decision.eligible ? '' : decision.message).toContain(
      'Include sensitive topics in memory',
    );
  });

  it('keeps the same fact once the user turns on Include sensitive topics in memory', () => {
    expect(
      memoryEligibilityGate({
        write: write({ content: SENSITIVE, source: 'auto' }),
        organizationPolicy: UNGOVERNED_MEMORY_POLICY,
        userPolicy: { ...MEMORY_ON, includeSensitiveTopics: true },
      }),
    ).toMatchObject({ eligible: true });
  });

  it('keeps a diagnosis the user asked to remember, and learns one only once the opt-in is on', () => {
    const diagnosis = 'User was diagnosed with type 2 diabetes';
    const gate = (overrides: Partial<ConsolidatedMemoryWrite>, userPolicy: ManagedMemoryPolicy) =>
      memoryEligibilityGate({
        write: write({ content: diagnosis, ...overrides }),
        organizationPolicy: UNGOVERNED_MEMORY_POLICY,
        userPolicy,
      });

    expect(gate({ userRequested: true }, MEMORY_ON)).toMatchObject({ eligible: true });
    expect(gate({ source: 'auto' }, { ...MEMORY_ON, includeSensitiveTopics: true })).toMatchObject({
      eligible: true,
    });
    expect(gate({ source: 'auto' }, MEMORY_ON)).toMatchObject({
      eligible: false,
      reason: 'sensitive_topic_not_opted_in',
    });
  });

  it("keeps the pattern extractor's rewrite of a sensitive statement out while the opt-in is off", () => {
    for (const message of [
      "I'm a Teamster.",
      "I'm a member of the UAW.",
      "I'm a Trump supporter.",
      "I'm a lifelong Bernie supporter.",
      'I love going to mass every Sunday.',
      "I'm a breast cancer survivor.",
      "I'm a veteran with PTSD.",
      "I'm a mom with ADHD.",
      "I'm a nurse with lupus.",
      "I'm a cancer patient.",
      'Note that I have a history of depression.',
      'For future reference, I have chronic back pain.',
      "I'm a deaf developer.",
      'I love Bernie.',
      'I like Obama.',
      'I hate Republicans.',
      'I love the Labour Party.',
      'I love Jesus.',
      "I'm an ex-Mormon.",
      "I'm a Black woman in tech.",
      "I'm a 34 year old gay man living in Austin.",
      "I'm a nurse and a lesbian.",
      "I'm a dad of three and a practicing Catholic.",
      "I'm a 29-year-old Black woman working in tech.",
      "I'm a teacher and a proud Democrat.",
      "I'm a Black software engineer in Atlanta.",
      "I'm a Black business owner.",
      "I'm a Desi software developer.",
      "I'm a schizophrenic.",
      "I'm a mom of two with lupus.",
      "I'm a transplant recipient.",
      "I'm an ADHD adult.",
      "I'm a guy in my 40s with depression.",
      "Note that I'm in AA.",
      "I'm a worship leader at my church.",
      'I work as a pastor at Grace Church.',
      "I'm a union electrician.",
      "I'm a Labour councillor.",
      "I'm an animal rights activist.",
      "I'm a member of the NAACP.",
      "I'm a man married to a man.",
      "I'm a dad to two kids with my husband.",
      "I'm a veteran with a TBI.",
      "I'm a new mom recovering from a C-section.",
      "I'm a T1D.",
      "I'm a woman of trans experience.",
      "I'm a practising member of the Church of England.",
      "I'm a believer in God.",
      "I'm from a Muslim family.",
      'I like reading the Quran.',
      "I'm a second generation Nigerian immigrant.",
      "I'm a big fan of AOC.",
      'I prefer Democrats.',
      'I like conservative politics.',
      "I'm a Brexiteer.",
      "I'm a member of the KKK.",
      'Note that my partner and I are both women.',
    ]) {
      const [learned] = extractCandidateMemoryFacts(message);
      expect(learned, message).toBeDefined();
      expect(
        memoryEligibilityGate({
          write: write({ content: learned!, source: 'auto' }),
          organizationPolicy: UNGOVERNED_MEMORY_POLICY,
          userPolicy: MEMORY_ON,
        }),
        learned,
      ).toMatchObject({ eligible: false, reason: 'sensitive_topic_not_opted_in' });
    }
  });

  it("keeps the model extractor's identity sentences out while the opt-in is off", () => {
    for (const learned of MODEL_IDENTITY_SENTENCES) {
      expect(
        memoryEligibilityGate({
          write: write({ content: learned, source: 'auto' }),
          organizationPolicy: UNGOVERNED_MEMORY_POLICY,
          userPolicy: MEMORY_ON,
        }),
        learned,
      ).toMatchObject({ eligible: false, reason: 'sensitive_topic_not_opted_in' });
    }
  });

  it('persists none of those sentences through the learning path until the user opts in', async () => {
    const candidates = [
      ...extractCandidateMemoryFacts("I'm a 34 year old gay man living in Austin."),
      ...extractCandidateMemoryFacts("I'm a nurse and a lesbian."),
      ...extractCandidateMemoryFacts("I'm a dad of three and a practicing Catholic."),
      ...MODEL_IDENTITY_SENTENCES,
    ];
    expect(candidates).toHaveLength(6);

    for (const candidate of candidates) {
      expect(await learnedWith(candidate, false), `${candidate} with the opt-in off`).toBe(false);
      expect(await learnedWith(candidate, true), `${candidate} with the opt-in on`).toBe(true);
    }
  });

  it('persists none of the health, faith and politics facts the word lists missed until the user opts in', async () => {
    const candidates = [
      ...extractCandidateMemoryFacts(
        "I'm a rape survivor and I need help writing my victim impact statement.",
      ),
      'User has a brain tumor',
      'User attempted suicide last year',
      'User is a DSA member',
      'User is addicted to opioids',
      'User is a pastor',
      'User supports Black Lives Matter',
    ];
    expect(candidates).toHaveLength(7);

    for (const candidate of candidates) {
      expect(await learnedWith(candidate, false), `${candidate} with the opt-in off`).toBe(false);
      expect(await learnedWith(candidate, true), `${candidate} with the opt-in on`).toBe(true);
    }
  });

  it('keeps a sensitive fact the user asked to remember, with the opt-in off', () => {
    expect(
      memoryEligibilityGate({
        write: write({ content: SENSITIVE, userRequested: true }),
        organizationPolicy: UNGOVERNED_MEMORY_POLICY,
        userPolicy: MEMORY_ON,
      }),
    ).toMatchObject({ eligible: true });
  });

  it('treats an unread member policy as the opt-in being off', () => {
    expect(
      memoryEligibilityGate({
        write: write({ content: SENSITIVE }),
        organizationPolicy: UNGOVERNED_MEMORY_POLICY,
      }),
    ).toMatchObject({ eligible: false, reason: 'sensitive_topic_not_opted_in' });
  });

  it('never opens a category memory refuses outright, whatever the opt-in or the request', () => {
    expect(
      memoryEligibilityGate({
        write: write({ content: SAMPLE_PROHIBITED.criminal_history, userRequested: true }),
        organizationPolicy: UNGOVERNED_MEMORY_POLICY,
        userPolicy: { ...MEMORY_ON, includeSensitiveTopics: true },
      }),
    ).toMatchObject({ eligible: false, reason: 'prohibited_content_category' });
  });

  it('reads the opt-in itself when the caller hands it no policies', async () => {
    const insertWith = (capabilities: Record<string, boolean>) =>
      vi.fn(async (sql: string) =>
        sql.includes("settings -> 'capabilities'")
          ? [{ capabilities }]
          : [{ outcome: 'inserted', id: 'm1' }],
      );
    const learned = write({ content: SENSITIVE, source: 'auto' });

    const optedOut = insertWith({ memory: true });
    await expect(
      writeConsolidatedMemory({ query: optedOut } as never, learned),
    ).rejects.toMatchObject({ reason: 'sensitive_topic_not_opted_in' });
    expect(optedOut.mock.calls.some(([sql]) => sql.includes('into user_memories'))).toBe(false);

    const optedIn = insertWith({ memory: true, includeSensitiveTopics: true });
    await expect(
      writeConsolidatedMemory({ query: optedIn } as never, learned),
    ).resolves.toMatchObject({ outcome: 'inserted' });
  });
});

describe('memoryWriteAdmission', () => {
  it('screens the content once, whether or not the caller hands it the policies', async () => {
    const screen = vi.mocked(prohibitedMemoryCategory);
    const query = vi.fn(async (sql: string) =>
      sql.includes("settings -> 'capabilities'") ? [{ capabilities: { memory: true } }] : [],
    );

    for (const options of [
      { policies: { organization: UNGOVERNED_MEMORY_POLICY, user: MEMORY_ON } },
      {},
    ]) {
      screen.mockClear();
      await expect(
        memoryWriteAdmission({ query } as never, write(), options),
      ).resolves.toMatchObject({ eligible: true });
      expect(screen).toHaveBeenCalledTimes(1);
    }
  });
});

describe('the write funnel is fail closed', () => {
  it('resolves the member switch itself when the caller hands it no policies', async () => {
    const query = vi.fn(async (sql: string) =>
      sql.includes("settings -> 'capabilities'")
        ? [{ capabilities: { memory: false } }]
        : [{ outcome: 'inserted', id: 'm1' }],
    );

    await expect(writeConsolidatedMemory({ query } as never, write())).rejects.toMatchObject({
      reason: 'user_memory_disabled',
    });
    expect(query.mock.calls.some(([sql]) => sql.includes('into user_memories'))).toBe(false);
  });

  it('writes when that same read says the switch is on', async () => {
    const query = vi.fn(async (sql: string) =>
      sql.includes("settings -> 'capabilities'")
        ? [{ capabilities: { memory: true } }]
        : [{ outcome: 'inserted', id: 'm1' }],
    );

    await expect(writeConsolidatedMemory({ query } as never, write())).resolves.toMatchObject({
      outcome: 'inserted',
    });
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
      policies: { organization: enforcing(1), user: MEMORY_ON },
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

  it('still closes memory when the policy read fails', async () => {
    const query = vi.fn(async () => {
      throw new Error('connection reset');
    });
    await expect(loadOrganizationMemoryPolicy({ query } as never, ORG)).resolves.toEqual(
      CLOSED_ORGANIZATION_MEMORY_POLICY,
    );
  });
});

describe('readOrganizationMemoryPolicy', () => {
  it('reports a failed read as unreadable, not as a workspace that closed memory', async () => {
    const query = vi.fn(async () => {
      throw new Error('connection reset');
    });
    await expect(readOrganizationMemoryPolicy({ query } as never, ORG)).resolves.toEqual({
      readable: false,
    });
  });

  it('reads a workspace with no policy row as one that closed memory', async () => {
    const query = vi.fn(async () => []);
    await expect(readOrganizationMemoryPolicy({ query } as never, ORG)).resolves.toEqual({
      readable: true,
      policy: CLOSED_ORGANIZATION_MEMORY_POLICY,
    });
  });

  it('reads the workspace switch when there is a row', async () => {
    const query = vi.fn(async () => [
      { allow_memory: true, retention_days: 30, retention_enforced: true },
    ]);
    await expect(readOrganizationMemoryPolicy({ query } as never, ORG)).resolves.toEqual({
      readable: true,
      policy: { allowMemory: true, retentionDays: 30, retentionEnforced: true },
    });
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
