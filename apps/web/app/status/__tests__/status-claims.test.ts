import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { RENDER_CACHE_SECONDS } from '@/lib/server/render-cache';
import { evaluateJobHealth, JOB_HEALTH_THRESHOLDS } from '@/lib/server/slo/job-health';
import { CAPABILITY_DEGRADATION } from '@/lib/server/slo/degradation';

const webRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

function readWebFile(relativePath: string): string {
  return readFileSync(join(webRoot, relativePath), 'utf8');
}

const PAGE_SOURCE = readWebFile('app/status/page.tsx');
const PROBE_SOURCE = readWebFile('lib/server/health-check.ts');

interface CoveredRow {
  key: string;
  label: string;
  what: string;
}

const QUOTED = String.raw`(['"])((?:(?!\1)[^\\]|\\.)*)\1`;

function coveredRows(): CoveredRow[] {
  const start = PAGE_SOURCE.indexOf('const COVERED');
  const end = PAGE_SOURCE.indexOf('\n];', start);
  expect(start, 'COVERED block not found in page.tsx').toBeGreaterThan(-1);
  expect(end, 'COVERED block has no end').toBeGreaterThan(start);
  const block = PAGE_SOURCE.slice(start, end);
  const row = new RegExp(
    String.raw`key:\s*${QUOTED}[\s\S]*?label:\s*${QUOTED}[\s\S]*?what:\s*${QUOTED}`,
    'g',
  );
  const rows = [...block.matchAll(row)].map((match) => ({
    key: match[2] as string,
    label: match[4] as string,
    what: match[6] as string,
  }));
  expect(rows.length, 'COVERED rows parsed').toBe(block.match(/^\s+key: ['"]/gm)?.length);
  return rows;
}

function functionBody(source: string, name: string): string {
  const start = source.search(new RegExp(String.raw`function ${name}\(`));
  expect(start, `${name} not found`).toBeGreaterThan(-1);
  const end = source.indexOf('\n}\n', start);
  expect(end, `${name} has no end`).toBeGreaterThan(start);
  return source.slice(start, end);
}

function declaredCheckKeys(): string[] {
  const body = functionBody(PROBE_SOURCE, 'runHealthChecks');
  const literal = body.match(/const checks: HealthCheckResult\['checks'\] = \{([\s\S]*?)\n {2}\};/);
  expect(literal, 'checks literal not found in runHealthChecks').not.toBeNull();
  return [...(literal?.[1] ?? '').matchAll(/^\s+(\w+): \{ status/gm)].map((match) => match[1]!);
}

const COVERED = coveredRows();
const RUN_HEALTH_CHECKS = functionBody(PROBE_SOURCE, 'runHealthChecks');
const ROUTED_CAPABILITY = functionBody(PROBE_SOURCE, 'checkRoutedCapability');
const WORK_QUEUES = functionBody(PROBE_SOURCE, 'checkWorkQueues');
const RETRIEVAL = functionBody(PROBE_SOURCE, 'checkRetrieval');
const CACHE = functionBody(PROBE_SOURCE, 'checkCache');

interface ProbeBinding {
  copy: readonly string[];
  probe: readonly { in: string; contains: readonly string[] }[];
  absent?: readonly { in: string; pattern: RegExp }[];
}

const MODEL_CALL = /\b(fetch|streamRequest|streamText|generateText|completions)\b/;

const BINDINGS: Record<string, ProbeBinding> = {
  environment: {
    copy: ['Core service configuration is present'],
    probe: [
      {
        in: RUN_HEALTH_CHECKS,
        contains: [
          "criticality === 'core'",
          'unreadyCore.length === 0',
          "checks.environment.status = 'healthy'",
        ],
      },
    ],
  },
  database: {
    copy: [
      'A query is executed against the primary database',
      'reused for up to a minute',
      'The first read after that starts another query and is itself answered with the older one',
      'as old as the last successful check stated at the top of this page',
    ],
    probe: [
      {
        in: RUN_HEALTH_CHECKS,
        contains: ["getNeonDb().query('select 1')", 'timestamp: new Date().toISOString()'],
      },
      {
        in: PROBE_SOURCE,
        contains: [
          'getCachedHealthChecks = cachedRenderInput(runHealthChecks',
          'revalidate: RENDER_CACHE_SECONDS.liveSignal',
        ],
      },
    ],
  },
  cache: {
    copy: [
      'One read of a fixed key against the key-value store returns within a second',
      'fail closed without that store',
      'does not exercise the rate limiter',
      'the row passes and says not configured',
    ],
    probe: [
      {
        in: CACHE,
        contains: [
          'store.get<string>(CACHE_PROBE_KEY)',
          'CACHE_PROBE_TIMEOUT_MS',
          "{ status: 'healthy', message: 'not configured' }",
        ],
      },
      { in: PROBE_SOURCE, contains: ['const CACHE_PROBE_TIMEOUT_MS = 1_000;'] },
      { in: RUN_HEALTH_CHECKS, contains: ['checks.cache = await checkCache()'] },
    ],
    absent: [
      { in: CACHE, pattern: /store\.(?!get\b)\w+[<(]/ },
      { in: CACHE, pattern: /getKeyValueRateLimiter/ },
    ],
  },
  stripe: {
    copy: [
      'A read call to the payments API returns',
      'every plan price on sale is active',
      'some or all purchases may fail',
      'existing plans keep working and chat is unaffected',
    ],
    probe: [
      {
        in: RUN_HEALTH_CHECKS,
        contains: [
          'stripe.products.list',
          'stripe.prices.retrieve(priceId)',
          '!price.active && !isGrandfatheredPriceId(priceId)',
          'checks.stripe.status',
        ],
      },
    ],
    absent: [
      {
        in: RUN_HEALTH_CHECKS,
        pattern: /stripe\.\w+\.(create|update|del|cancel|confirm|capture)\b/,
      },
    ],
  },
  chat: {
    copy: [
      'default managed chat route resolves to a live model',
      'at least one provider behind it is configured',
      'marked every one of them degraded',
      'does not send a message through the model',
    ],
    probe: [
      { in: RUN_HEALTH_CHECKS, contains: ["checkRoutedCapability('chat')"] },
      {
        in: ROUTED_CAPABILITY,
        contains: [
          'getDefaultModelFor(null, kind)',
          'isModelLive(model)',
          'listAvailableManagedProviderIds()',
          'getProviderAvailabilityMap(providers)',
          'providers.every((provider) => availability[provider])',
        ],
      },
    ],
    absent: [{ in: ROUTED_CAPABILITY, pattern: MODEL_CALL }],
  },
  work: {
    copy: ['background job queues are draining', 'critical threshold', 'lapsed in bulk'],
    probe: [
      {
        in: WORK_QUEUES,
        contains: [
          'readJobQueueStats(getNeonDb())',
          'evaluateJobHealth(',
          "alert.severity === 'critical'",
        ],
      },
      { in: RUN_HEALTH_CHECKS, contains: ['checkWorkQueues()'] },
    ],
  },
  voice: {
    copy: ['default managed voice route resolves to a live model', 'does not open a voice session'],
    probe: [{ in: RUN_HEALTH_CHECKS, contains: ["checkRoutedCapability('voice')"] }],
    absent: [{ in: ROUTED_CAPABILITY, pattern: MODEL_CALL }],
  },
  search: {
    copy: [
      'retrieval index the search over your own content reads is present in the database',
      'runs after the Postgres probe in the same run, so it is exactly as old as that row',
      'never runs a query on your behalf',
    ],
    probe: [
      {
        in: PROBE_SOURCE,
        contains: [
          "'retrieval_documents', 'retrieval_chunks'",
          'public.idx_retrieval_chunks_search_vector',
        ],
      },
      { in: RETRIEVAL, contains: ['to_regclass', 'pg_extension'] },
      { in: RUN_HEALTH_CHECKS, contains: ['checks.search = retrieval.search'] },
    ],
    absent: [{ in: RETRIEVAL, pattern: /\bfrom\s+(public\.)?retrieval_/i }],
  },
  vector: {
    copy: [
      'vector extension and the embedding index',
      'same catalogue query as the Search row',
      'never runs a query on your behalf',
    ],
    probe: [
      {
        in: PROBE_SOURCE,
        contains: ["const EMBEDDING_INDEX = 'public.idx_retrieval_chunks_embedding';"],
      },
      {
        in: RETRIEVAL,
        contains: ["extname = 'vector'", 'row.vector_extension', 'row.embedding_index'],
      },
      { in: RUN_HEALTH_CHECKS, contains: ['checks.vector = retrieval.vector'] },
    ],
    absent: [{ in: RETRIEVAL, pattern: /\bfrom\s+(public\.)?retrieval_/i }],
  },
};

describe('the scope rows on /status are bound to the checks they describe', () => {
  it('parses every COVERED row it can see in the page source', () => {
    expect(COVERED.length).toBeGreaterThan(0);
    for (const row of COVERED) {
      expect(row.label.length, row.key).toBeGreaterThan(0);
      expect(row.what.length, row.key).toBeGreaterThan(0);
    }
  });

  it('describes only checks that runHealthChecks sets', () => {
    const declared = declaredCheckKeys();
    const unknown = COVERED.map((row) => row.key).filter((key) => !declared.includes(key));

    expect(declared.length).toBeGreaterThan(0);
    expect(unknown).toEqual([]);
  });

  it('gives every check runHealthChecks sets a row, so none moves the state unseen', () => {
    const described = COVERED.map((row) => row.key);
    const undescribed = declaredCheckKeys().filter((key) => !described.includes(key));

    expect(undescribed).toEqual([]);
  });

  it('has a binding for exactly the rows it shows, so a new row cannot ship unbound', () => {
    expect(Object.keys(BINDINGS).sort()).toEqual(COVERED.map((row) => row.key).sort());
  });

  it.each(COVERED.map((row) => [row.key, row] as const))(
    'binds the %s row to its probe',
    (key, row) => {
      const binding = BINDINGS[key];
      expect(binding, `${key} has no binding`).toBeDefined();

      for (const phrase of binding!.copy) {
        expect(row.what, `${key} copy no longer says: ${phrase}`).toContain(phrase);
      }
      for (const { in: source, contains } of binding!.probe) {
        for (const fragment of contains) {
          expect(source, `${key} probe no longer contains: ${fragment}`).toContain(fragment);
        }
      }
      for (const { in: source, pattern } of binding!.absent ?? []) {
        expect(source, `${key} probe now matches ${pattern}`).not.toMatch(pattern);
      }
    },
  );

  it('keeps a failing payments probe from reporting a platform outage', () => {
    const core = RUN_HEALTH_CHECKS.match(/const coreHealthy =([\s\S]*?);/);
    const nonCore = RUN_HEALTH_CHECKS.match(/const nonCoreHealthy = \[([\s\S]*?)\]/);

    expect(core).not.toBeNull();
    expect(nonCore).not.toBeNull();
    expect(core![1]).not.toContain('stripe');
    expect(nonCore![1]).toContain('checks.stripe');
  });

  it('counts the cache store as core and semantic search as degradable, as their rows say', () => {
    const core = RUN_HEALTH_CHECKS.match(/const coreHealthy =([\s\S]*?);/);
    const nonCore = RUN_HEALTH_CHECKS.match(/const nonCoreHealthy = \[([\s\S]*?)\]/);

    expect(core![1]).toContain("checks.cache.status === 'healthy'");
    expect(core![1]).not.toContain('vector');
    expect(nonCore![1]).toContain('checks.vector');
    expect(COVERED.find((row) => row.key === 'cache')?.what).toContain('counts as a core check');
  });

  it('runs the retrieval probe after the Postgres probe, as the search row says', () => {
    const postgres = RUN_HEALTH_CHECKS.indexOf("getNeonDb().query('select 1')");
    const retrieval = RUN_HEALTH_CHECKS.indexOf('await checkRetrieval()');

    expect(postgres).toBeGreaterThan(-1);
    expect(retrieval).toBeGreaterThan(postgres);
    expect(COVERED.find((row) => row.key === 'search')?.what).toContain(
      'runs after the Postgres probe in the same run',
    );
  });

  it('reuses the answer for the minute the database row states', () => {
    expect(RENDER_CACHE_SECONDS.liveSignal).toBe(60);
    expect(COVERED.find((row) => row.key === 'database')?.what).toContain('up to a minute');
  });

  it('bounds no row by the reuse window, since a result older than it is still shown', () => {
    for (const row of COVERED) {
      expect(row.what, row.key).not.toMatch(/that far behind|the same minute|at most a minute/i);
    }
    expect(PAGE_SOURCE).toContain('itself answered with the older result');
  });

  it('reads the work row critical threshold from the thresholds the probe judges by', () => {
    const queue = { queue: 'agent', queued: 1, dead: 0 };
    const severityFor = (oldestQueuedAgeMs: number, stuck: number) =>
      evaluateJobHealth([{ ...queue, oldestQueuedAgeMs, stuck }])[0]?.severity;

    expect(severityFor(JOB_HEALTH_THRESHOLDS.criticalAgeMs, 0)).toBe('critical');
    expect(severityFor(JOB_HEALTH_THRESHOLDS.criticalAgeMs - 1, 0)).not.toBe('critical');
    expect(severityFor(0, JOB_HEALTH_THRESHOLDS.criticalStuck)).toBe('critical');
    expect(severityFor(0, JOB_HEALTH_THRESHOLDS.criticalStuck - 1)).not.toBe('critical');
    expect(JOB_HEALTH_THRESHOLDS.criticalStuck).toBeGreaterThan(JOB_HEALTH_THRESHOLDS.warningStuck);
  });
});

interface DegradationProof {
  file: string;
  test: string;
}

const DEGRADATION_PROOFS: Record<string, readonly DegradationProof[]> = {
  chat: [
    {
      file: 'app/api/llm/v1/chat/completions/__tests__/route.managed-failover.test.ts',
      test: 'rotates Auto on a direct-provider 429 before any response bytes are sent',
    },
    {
      file: 'app/api/llm/v1/chat/completions/lib/upstream-error-copy.test.ts',
      test: 'tells the reader what the policy says it will',
    },
  ],
  work: [
    {
      file: 'lib/jobs/__tests__/job-service.test.ts',
      test: 'routes a kind to its queue and returns the first job for a repeated key',
    },
    {
      file: 'lib/jobs/__tests__/job-service.test.ts',
      test: 're-queues an expired lease that still has attempts and dead-letters the last one',
    },
  ],
  research: [
    {
      file: 'app/api/llm/v1/chat/completions/lib/research-loop.test.ts',
      test: 'keeps partial material and synthesizes when a LATER gathering round fails',
    },
  ],
  code: [
    {
      file: 'app/api/llm/v1/chat/completions/lib/tool-loop.e2e.test.ts',
      test: 'fails closed with an explicit error when no E2B executor is available (no key configured)',
    },
  ],
  'file-upload': [
    {
      file: 'app/api/uploads/__tests__/local-project-knowledge-route.test.ts',
      test: 'names the condition and the next step when the bytes cannot be stored',
    },
  ],
  search: [
    {
      file: 'app/api/llm/v1/chat/completions/lib/tool-loop.web-search.test.ts',
      test: 'returns an honest tool-result error (not x_stream_error) when the search backend is not configured, the turn continues, not terminates',
    },
  ],
  'billing-events': [
    {
      file: 'app/api/checkout/route.test.ts',
      test: 'does not create checkout when Stripe subscription state cannot be read',
    },
  ],
};

const UNPROVEN_DEGRADATION = [
  'authentication',
  'tool-execution',
  'browser',
  'remote-control',
  'file-parsing',
  'notifications',
];

const UNPROVEN_DEGRADATION_CEILING = 6;

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function declaresTest(source: string, name: string): boolean {
  const declaration = new RegExp(
    String.raw`(?<![\w.])(?:it|test)(?:\.each\([^)]*\))?\(\s*(['"\`])${escapeRegExp(name)}\1`,
  );
  return declaration.test(source);
}

describe('the degraded modes on /status are proven or counted', () => {
  const ids = CAPABILITY_DEGRADATION.map((entry) => entry.id);

  it('accounts for every capability in exactly one place', () => {
    const proven = Object.keys(DEGRADATION_PROOFS);
    const both = proven.filter((id) => UNPROVEN_DEGRADATION.includes(id));
    const unaccounted = ids.filter(
      (id) => !proven.includes(id) && !UNPROVEN_DEGRADATION.includes(id),
    );
    const unknown = [...proven, ...UNPROVEN_DEGRADATION].filter((id) => !ids.includes(id));

    expect(both).toEqual([]);
    expect(unaccounted).toEqual([]);
    expect(unknown).toEqual([]);
  });

  it('keeps the unproven count at its ceiling, which only comes down', () => {
    expect(UNPROVEN_DEGRADATION.length).toBe(UNPROVEN_DEGRADATION_CEILING);
  });

  it.each(Object.entries(DEGRADATION_PROOFS))('proves %s with tests that exist', (id, proofs) => {
    expect(proofs.length, id).toBeGreaterThan(0);
    for (const proof of proofs) {
      expect(existsSync(join(webRoot, proof.file)), `${id}: ${proof.file} is missing`).toBe(true);
      const source = readWebFile(proof.file);
      expect(
        declaresTest(source, proof.test),
        `${id}: ${proof.file} no longer declares "${proof.test}"`,
      ).toBe(true);
      expect(source).not.toMatch(
        new RegExp(String.raw`(?:it|test)\.(?:skip|todo)\(\s*['"\`]${escapeRegExp(proof.test)}`),
      );
    }
  });

  it('recognises a test declaration and rejects a name that is only mentioned', () => {
    const source = "it('holds queued work', () => {});\n// holds the rest\n";

    expect(declaresTest(source, 'holds queued work')).toBe(true);
    expect(declaresTest(source, 'holds the rest')).toBe(false);
    expect(declaresTest(source, 'holds queued')).toBe(false);
  });
});
