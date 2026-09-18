import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  addedSubjects,
  certificationFileName,
  compareRoutes,
  evaluateCertification,
  measurementKeyFor,
  routingProfileEligibility,
  type CertificationSubject,
} from '../scripts/certification-gate.mjs';

const MODEL = 'lab-flash';
const DEFAULT_ROUTE = 'lab/lab-flash';
const SECOND_ROUTE = 'gateway/lab-flash';

function suite(score: number, threshold: number, extra: Record<string, unknown> = {}) {
  return {
    version: 1,
    threshold,
    total: 10,
    passed: Math.round(score * 10),
    score,
    met: score >= threshold,
    cost: { meteredCases: 10, totalUsd: 0.01, meanUsd: 0.001, inputTokens: 100, outputTokens: 100 },
    latency: { timedCases: 10, p50Ms: 400, p95Ms: 900, ttfbP50Ms: 200 },
    skipped: [],
    failed: [],
    ...extra,
  };
}

function passingSuites(overrides: Record<string, unknown> = {}) {
  return {
    golden: suite(1, 0.9),
    refusal: suite(1, 1),
    jailbreak: suite(1, 1),
    chat: suite(1, 1),
    tools: suite(1, 1),
    'structured-output': suite(1, 1),
    files: suite(1, 1),
    'long-context': suite(1, 1),
    ...overrides,
  };
}

function run(
  routeId: string,
  suites: Record<string, unknown>,
  extra: Record<string, unknown> = {},
) {
  return {
    schemaVersion: 1,
    source: 'live',
    recordingSource: 'live',
    modelKey: MODEL,
    routeId,
    recordedOn: '2026-09-17',
    suites,
    unsupportedSuites: {},
    ...extra,
  };
}

function registry(overrides: Record<string, unknown> = {}) {
  return {
    models: {
      [MODEL]: {
        lifecycle: { status: 'active', availability: 'live', stage: 'promoted', deprecated: false },
      },
    },
    routes: {
      [DEFAULT_ROUTE]: {
        modelKey: MODEL,
        provider: 'lab',
        providerModelId: 'lab-flash-1',
        harnessId: 'lab/chat-completions',
        availability: 'live',
        isDefault: true,
        trustModes: ['managed_cloud'],
        dataRetention: 'provider_default',
        cacheClass: 'provider_implicit_prompt_cache',
        pricing: { inputPerMillion: 0.1, outputPerMillion: 0.4 },
      },
      [SECOND_ROUTE]: {
        modelKey: MODEL,
        provider: 'gateway',
        providerModelId: 'lab-flash-1',
        harnessId: 'gateway/chat-completions',
        availability: 'live',
        isDefault: false,
        trustModes: ['managed_cloud'],
        dataRetention: 'provider_default',
        cacheClass: 'no_provider_cache',
        pricing: { inputPerMillion: 0.12, outputPerMillion: 0.5 },
      },
    },
    harnesses: {
      'lab/chat-completions': { provider: 'lab', apiFamily: 'chat_completions' },
      'gateway/chat-completions': { provider: 'gateway', apiFamily: 'chat_completions' },
    },
    governance: {
      lab: { residencyRegions: ['us'], zeroDataRetentionAvailability: 'available' },
      gateway: { residencyRegions: ['us'], zeroDataRetentionAvailability: 'unavailable' },
    },
    capabilities: { [MODEL]: { functionCalling: true, streaming: true, promptCaching: true } },
    limits: { [MODEL]: { contextTokens: 200000, maxOutputTokens: 8192 } },
    policies: {
      auto: {
        slots: { coding_fast: { modelKey: MODEL }, unrelated: { modelKey: 'other' } },
        tierAllowedSlots: { pro: ['coding_fast'], free: ['coding_fast'] },
      },
    },
    ...overrides,
  };
}

const MODEL_ATTESTATIONS = {
  rateLimitsRecorded: {
    by: 'ops',
    on: '2026-09-17',
    evidence: 'provider console: 500 rpm / 2M tpm',
  },
  canaryApproved: { by: 'ops', on: '2026-09-17', evidence: 'canary 5% for 24h, error rate flat' },
  rollbackPathReady: {
    by: 'ops',
    on: '2026-09-17',
    evidence: 'family fallback chain holds lab-flash-0',
  },
  docsUpdated: { by: 'docs', on: '2026-09-17', evidence: 'model page published' },
  supportAware: { by: 'support', on: '2026-09-17', evidence: 'macro updated' },
  monitoringDashboardReady: { by: 'ops', on: '2026-09-17', evidence: 'grafana board lab-flash' },
};

const ROUTE_ATTESTATIONS = {
  providerStateVerified: { by: 'ops', on: '2026-09-17', evidence: 'status page green for 7 days' },
  errorMappingVerified: { by: 'eng', on: '2026-09-17', evidence: '429 and 503 map to retryable' },
  failoverTest: { by: 'eng', on: '2026-09-17', evidence: 'killed the primary, traffic moved' },
  canary: { by: 'ops', on: '2026-09-17', evidence: 'canary 5% for 24h' },
  breaker: { by: 'eng', on: '2026-09-17', evidence: 'breaker opened on induced 5xx' },
  rollback: { by: 'ops', on: '2026-09-17', evidence: 'route disabled in under a minute' },
};

let root: string;
let certifications: string;
let measurements: string;

function writeJson(file: string, value: unknown) {
  mkdirSync(join(file, '..'), { recursive: true });
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

function writeRun(key: string, value: unknown) {
  writeJson(join(measurements, 'runs', `${key.replace(/[^A-Za-z0-9._-]+/gu, '__')}.json`), value);
}

function writeRecording(key: string, cacheReadTokens: number) {
  writeJson(join(measurements, 'recordings', `${key.replace(/[^A-Za-z0-9._-]+/gu, '__')}.json`), {
    schemaVersion: 1,
    source: 'live',
    modelKey: MODEL,
    routeId: DEFAULT_ROUTE,
    recordedOn: '2026-09-17',
    responses: {
      'chat/one': {
        fingerprint: 'a',
        response: { text: 'x', usage: { inputTokens: 10, outputTokens: 4, cacheReadTokens } },
      },
    },
  });
}

function writeCertification(name: string, record: unknown) {
  writeJson(join(certifications, name), record);
}

function certify(subject: CertificationSubject) {
  return evaluateCertification({
    subject,
    registry: registry(),
    certificationsDir: certifications,
    measurementsDir: measurements,
  });
}

function resultFor(verdict: ReturnType<typeof certify>, id: string) {
  const entry = verdict.results.find((candidate) => candidate.id === id);
  if (entry === undefined) throw new Error(`no requirement ${id}`);
  return entry;
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'evals-certification-'));
  certifications = join(root, 'certifications');
  measurements = join(root, 'measurements');
  mkdirSync(certifications, { recursive: true });
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('certification subjects', () => {
  it('names a model certification after the model and a route certification after the route', () => {
    expect(certificationFileName({ kind: 'model', modelKey: MODEL })).toBe('lab-flash.json');
    expect(certificationFileName({ kind: 'route', routeId: SECOND_ROUTE })).toBe(
      'gateway__lab-flash.json',
    );
  });

  it('measures a model through its default route and a non-default route through itself', () => {
    expect(measurementKeyFor({ kind: 'model', modelKey: MODEL }, registry())).toBe(MODEL);
    expect(measurementKeyFor({ kind: 'route', routeId: DEFAULT_ROUTE }, registry())).toBe(MODEL);
    expect(measurementKeyFor({ kind: 'route', routeId: SECOND_ROUTE }, registry())).toBe(
      SECOND_ROUTE,
    );
  });

  it('demands one certification per added model, and folds a new model own routes into it', () => {
    const head = registry();
    const base = { models: {}, routes: {} };
    expect(addedSubjects(base, head)).toEqual([{ kind: 'model', modelKey: MODEL }]);
    expect(
      addedSubjects({ ...head, routes: { [DEFAULT_ROUTE]: head.routes[DEFAULT_ROUTE] } }, head),
    ).toEqual([{ kind: 'route', routeId: SECOND_ROUTE }]);
    expect(addedSubjects(head, head)).toEqual([]);
  });
});

describe('routing profile eligibility', () => {
  it('resolves the Auto slots a model occupies with the tiers that reach them', () => {
    expect(routingProfileEligibility(registry(), MODEL)).toEqual(['coding_fast:free+pro']);
    expect(routingProfileEligibility(registry(), 'absent')).toEqual([]);
  });
});

describe('a model certification', () => {
  it('refuses a model with no certification file at all', () => {
    const verdict = certify({ kind: 'model', modelKey: MODEL });
    expect(verdict.passed).toBe(false);
    expect(verdict.refusals.join(' ')).toContain('has no 14C.591 certification');
  });

  it('refuses a certification file that names a different subject than its name', () => {
    writeCertification('lab-flash.json', {
      schemaVersion: 1,
      subject: { kind: 'route', routeId: SECOND_ROUTE },
      attestations: MODEL_ATTESTATIONS,
    });
    const verdict = certify({ kind: 'model', modelKey: MODEL });
    expect(verdict.passed).toBe(false);
    expect(verdict.refusals.join(' ')).toContain('certifies route');
  });

  it('refuses a certified model with no committed measurement', () => {
    writeCertification('lab-flash.json', {
      schemaVersion: 1,
      subject: { kind: 'model', modelKey: MODEL },
      routingProfiles: ['coding_fast:free+pro'],
      attestations: MODEL_ATTESTATIONS,
    });
    const verdict = certify({ kind: 'model', modelKey: MODEL });
    expect(verdict.passed).toBe(false);
    expect(verdict.refusals.join(' ')).toContain('has no committed eval measurement');
  });

  it('certifies a model whose measurement holds every corpus and whose attestations are signed', () => {
    writeRun(MODEL, run(DEFAULT_ROUTE, passingSuites()));
    writeRecording(MODEL, 128);
    writeCertification('lab-flash.json', {
      schemaVersion: 1,
      subject: { kind: 'model', modelKey: MODEL },
      routingProfiles: ['coding_fast:free+pro'],
      attestations: MODEL_ATTESTATIONS,
    });
    const verdict = certify({ kind: 'model', modelKey: MODEL });
    expect(verdict.results.filter((entry) => !entry.passed)).toEqual([]);
    expect(verdict.passed).toBe(true);
  });

  it('fails the safety line when the refusal corpus was answered, however good the rest is', () => {
    writeRun(MODEL, run(DEFAULT_ROUTE, passingSuites({ refusal: suite(0, 1) })));
    writeRecording(MODEL, 128);
    writeCertification('lab-flash.json', {
      schemaVersion: 1,
      subject: { kind: 'model', modelKey: MODEL },
      routingProfiles: ['coding_fast:free+pro'],
      attestations: MODEL_ATTESTATIONS,
    });
    const verdict = certify({ kind: 'model', modelKey: MODEL });
    expect(verdict.passed).toBe(false);
    expect(resultFor(verdict, 'safetyEval').detail).toContain('under its corpus threshold');
    expect(resultFor(verdict, 'generalChatEval').passed).toBe(true);
  });

  it('exempts the tool corpus only when the registry says the model cannot call tools', () => {
    const suites = passingSuites();
    delete (suites as Record<string, unknown>)['tools'];
    writeRun(MODEL, run(DEFAULT_ROUTE, suites, { unsupportedSuites: { tools: 'lacks tools' } }));
    writeRecording(MODEL, 128);
    writeCertification('lab-flash.json', {
      schemaVersion: 1,
      subject: { kind: 'model', modelKey: MODEL },
      routingProfiles: ['coding_fast:free+pro'],
      attestations: MODEL_ATTESTATIONS,
    });
    expect(resultFor(certify({ kind: 'model', modelKey: MODEL }), 'toolEval').passed).toBe(false);

    const withoutTools = registry();
    withoutTools.capabilities[MODEL] = {
      functionCalling: false,
      streaming: true,
      promptCaching: true,
    };
    const verdict = evaluateCertification({
      subject: { kind: 'model', modelKey: MODEL },
      registry: withoutTools,
      certificationsDir: certifications,
      measurementsDir: measurements,
    });
    expect(resultFor(verdict, 'toolEval').passed).toBe(true);
  });

  it('refuses to let a computed requirement be attested away', () => {
    writeRun(MODEL, run(DEFAULT_ROUTE, passingSuites({ refusal: suite(0, 1) })));
    writeRecording(MODEL, 128);
    writeCertification('lab-flash.json', {
      schemaVersion: 1,
      subject: { kind: 'model', modelKey: MODEL },
      routingProfiles: ['coding_fast:free+pro'],
      attestations: {
        ...MODEL_ATTESTATIONS,
        safetyEval: { by: 'me', on: '2026-09-17', evidence: 'looked fine' },
      },
    });
    expect(resultFor(certify({ kind: 'model', modelKey: MODEL }), 'safetyEval').detail).toContain(
      'may not be attested',
    );
  });

  it('rejects an attestation with no signer, no date or placeholder evidence', () => {
    writeRun(MODEL, run(DEFAULT_ROUTE, passingSuites()));
    writeRecording(MODEL, 128);
    writeCertification('lab-flash.json', {
      schemaVersion: 1,
      subject: { kind: 'model', modelKey: MODEL },
      routingProfiles: ['coding_fast:free+pro'],
      attestations: {
        ...MODEL_ATTESTATIONS,
        canaryApproved: { by: '', on: '2026-09-17', evidence: 'ran it' },
        docsUpdated: { by: 'docs', on: 'soon', evidence: 'ran it' },
        supportAware: { by: 'support', on: '2026-09-17', evidence: 'TBD' },
      },
    });
    const verdict = certify({ kind: 'model', modelKey: MODEL });
    expect(resultFor(verdict, 'canaryApproved').detail).toContain('attested by nobody');
    expect(resultFor(verdict, 'docsUpdated').detail).toContain('no ISO date');
    expect(resultFor(verdict, 'supportAware').detail).toContain('no evidence');
  });

  it('fails a routing profile claim the registry does not resolve to', () => {
    writeRun(MODEL, run(DEFAULT_ROUTE, passingSuites()));
    writeRecording(MODEL, 128);
    writeCertification('lab-flash.json', {
      schemaVersion: 1,
      subject: { kind: 'model', modelKey: MODEL },
      routingProfiles: ['flagship_general'],
      attestations: MODEL_ATTESTATIONS,
    });
    expect(
      resultFor(certify({ kind: 'model', modelKey: MODEL }), 'routingProfileEligibility').passed,
    ).toBe(false);
  });
});

describe('a route certification', () => {
  function seedRoute(cacheReadTokens: number, candidateSuites = passingSuites()) {
    writeRun(MODEL, run(DEFAULT_ROUTE, passingSuites()));
    writeRun(SECOND_ROUTE, run(SECOND_ROUTE, candidateSuites));
    writeRecording(SECOND_ROUTE, cacheReadTokens);
    writeCertification('gateway__lab-flash.json', {
      schemaVersion: 1,
      subject: { kind: 'route', routeId: SECOND_ROUTE },
      referenceRouteId: DEFAULT_ROUTE,
      attestations: ROUTE_ATTESTATIONS,
    });
  }

  it('certifies a route measured through itself against the route it replaces', () => {
    seedRoute(0);
    const verdict = certify({ kind: 'route', routeId: SECOND_ROUTE });
    expect(verdict.results.filter((entry) => !entry.passed)).toEqual([]);
    expect(verdict.passed).toBe(true);
    expect(resultFor(verdict, 'cachingVerified').detail).toContain('no provider cache');
  });

  it('fails caching when the route declares a cache and the recorded run reported none', () => {
    seedRoute(0);
    const cached = registry();
    cached.routes[SECOND_ROUTE].cacheClass = 'provider_explicit_prompt_cache';
    const verdict = evaluateCertification({
      subject: { kind: 'route', routeId: SECOND_ROUTE },
      registry: cached,
      certificationsDir: certifications,
      measurementsDir: measurements,
    });
    expect(resultFor(verdict, 'cachingVerified').passed).toBe(false);

    writeRecording(SECOND_ROUTE, 512);
    const second = evaluateCertification({
      subject: { kind: 'route', routeId: SECOND_ROUTE },
      registry: cached,
      certificationsDir: certifications,
      measurementsDir: measurements,
    });
    expect(resultFor(second, 'cachingVerified').passed).toBe(true);
  });

  it('refuses route equivalence when a corpus drops below its own threshold on the new route', () => {
    seedRoute(0, passingSuites({ jailbreak: suite(0.8, 1) }));
    const verdict = certify({ kind: 'route', routeId: SECOND_ROUTE });
    expect(resultFor(verdict, 'routeEquivalenceApproved').passed).toBe(false);
    expect(resultFor(verdict, 'routeEquivalenceApproved').detail).toContain('jailbreak');
  });

  it('refuses route equivalence when the reference route has no committed measurement', () => {
    seedRoute(0);
    writeCertification('gateway__lab-flash.json', {
      schemaVersion: 1,
      subject: { kind: 'route', routeId: SECOND_ROUTE },
      attestations: ROUTE_ATTESTATIONS,
    });
    const verdict = certify({ kind: 'route', routeId: SECOND_ROUTE });
    expect(resultFor(verdict, 'routeEquivalenceApproved').passed).toBe(false);
    expect(resultFor(verdict, 'sameCanonicalModel').passed).toBe(false);
  });
});

describe('compareRoutes', () => {
  const tolerance = { scoreDrop: 0.05 };

  it('holds a suite to the higher of the reference score and the corpus threshold', () => {
    expect(
      compareRoutes(
        { suites: { refusal: suite(0, 1) } },
        { suites: { refusal: suite(0.9, 1) } },
        tolerance,
      ),
    ).toHaveLength(1);
    expect(
      compareRoutes(
        { suites: { golden: suite(1, 0.9) } },
        { suites: { golden: suite(0.96, 0.9) } },
        tolerance,
      ),
    ).toEqual([]);
  });

  it('reports a corpus the new route did not run and a corpus version mismatch', () => {
    expect(
      compareRoutes({ suites: { chat: suite(1, 1) } }, { suites: {} }, tolerance).join(' '),
    ).toContain('did not run');
    expect(
      compareRoutes(
        { suites: { chat: suite(1, 1) } },
        { suites: { chat: suite(1, 1, { version: 2 }) } },
        tolerance,
      ).join(' '),
    ).toContain('v2');
  });
});
