import { describe, expect, it } from 'vitest';

import {
  loadContextSuites,
  loadersFor,
  runContextCase,
  runContextSuite,
  type ContextEvalCase,
} from '../src/context-eval';

/**
 * These corpora grade the engine the product assembles a turn with, over
 * fixtures. Nothing here reaches a model, a provider or a network.
 */

const suites = loadContextSuites();

describe('context retrieval corpora', () => {
  it('measures more than one capability', () => {
    expect(suites.length).toBeGreaterThan(1);
    expect(new Set(suites.map((suite) => suite.suite)).size).toBe(suites.length);
  });

  for (const suite of suites) {
    describe(suite.suite, () => {
      it('is gated, versioned and says where its rows came from', () => {
        expect(suite.passThreshold).toBeGreaterThan(0);
        expect(suite.version).toBeGreaterThan(0);
        expect(suite.priority).toMatch(/^P[01]$/u);
        expect(suite.provenance.length).toBeGreaterThan(0);
        expect(suite.measures.length).toBeGreaterThan(0);
        expect(suite.cases.length).toBeGreaterThan(0);
      });

      it('gives every case a stable id and something to assert', () => {
        for (const evalCase of suite.cases) {
          expect(evalCase.id.startsWith(`${suite.suite}/`), evalCase.id).toBe(true);
          expect(Object.keys(evalCase.expect).length, evalCase.id).toBeGreaterThan(0);
          expect(evalCase.sources.length, evalCase.id).toBeGreaterThan(0);
        }
        expect(new Set(suite.cases.map((evalCase) => evalCase.id)).size).toBe(suite.cases.length);
      });

      it('scores at or above its own threshold', async () => {
        const result = await runContextSuite(suite);
        const failures = result.results
          .filter((row) => !row.passed)
          .map((row) => `${row.caseId}: ${row.failures.join('; ')}`);

        expect(failures).toEqual([]);
        expect(result.score).toBeGreaterThanOrEqual(suite.passThreshold);
        expect(result.completeness).toBe(1);
      });

      it('holds every isolation case as a hard gate', async () => {
        const isolation = suite.cases.filter((evalCase) => evalCase.isolation === true);
        for (const evalCase of isolation) {
          expect(evalCase.expect.excludes?.length ?? 0, evalCase.id).toBeGreaterThan(0);
          expect(suite.priority, evalCase.id).toBe('P0');
          expect((await runContextCase(evalCase)).passed, evalCase.id).toBe(true);
        }
      });
    });
  }
});

describe('the harness fails a turn that leaks', () => {
  const leaking: ContextEvalCase = {
    id: 'harness/leak',
    risk: 'high',
    actor: { userId: 'u-1', organizationId: null },
    sources: [
      { sourceClass: 'account_memory', locator: 'memory/mine', ownerUserId: 'u-1', text: 'Mine.' },
    ],
    expect: { excludes: ['account_memory:memory/mine'] },
  };

  it('reports the leaked source rather than scoring it', async () => {
    const result = await runContextCase(leaking);

    expect(result.passed).toBe(false);
    expect(result.failures).toEqual([
      'account_memory:memory/mine reached the turn and must never be retrievable here',
    ]);
  });

  it('refuses a case that asserts nothing', async () => {
    const result = await runContextCase({ ...leaking, expect: {} });

    expect(result.passed).toBe(false);
    expect(result.failures).toEqual(['the case asserts nothing']);
  });

  it('reports an assembly order the engine did not produce', async () => {
    const result = await runContextCase({
      ...leaking,
      expect: { order: ['past_chat'] },
    });

    expect(result.passed).toBe(false);
    expect(result.failures[0]).toContain('assembled account_memory, expected past_chat');
  });

  it('builds one loader per class, carrying every row of that class', () => {
    const loaders = loadersFor([
      { sourceClass: 'account_memory', locator: 'a', text: 'a' },
      { sourceClass: 'account_memory', locator: 'b', text: 'b' },
      { sourceClass: 'web_result', locator: 'c', text: 'c' },
    ]);

    expect(loaders.map((loader) => loader.sourceClass)).toEqual(['account_memory', 'web_result']);
    expect(loaders[0]?.load({ userId: 'u-1', organizationId: null })).toHaveLength(2);
  });
});
