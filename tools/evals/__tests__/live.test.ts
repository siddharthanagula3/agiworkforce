import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { loadDataset } from '../src/dataset';
import { buildHaystack } from '../src/haystack';
import {
  activeFamilies,
  contextSkipReason,
  measurementFileName,
  outputPriceCeiling,
  resolveLiveTarget,
  spendRefusal,
  unsupportedSuiteReason,
  type RegistryLike,
} from '../src/live';
import { percentile } from '../src/metrics';
import { buildRequest, fingerprintRequest } from '../src/request';
import { runLive, runReplay } from '../src/run';
import { formatReport } from '../src/suite';
import type { Responder } from '../src/types';
import { measurementFileName as gateFileName } from '../scripts/promotion-gate.mjs';

function route(modelKey: string, outputPerMillion: number, isDefault = true) {
  return {
    modelKey,
    provider: 'gateway',
    providerModelId: `${modelKey}-wire`,
    harnessId: 'gateway/chat',
    availability: 'live',
    isDefault,
    pricing: { inputPerMillion: outputPerMillion / 4, outputPerMillion },
  };
}

const registry: RegistryLike = {
  models: {
    cheap: { lifecycle: { availability: 'live', deprecated: false } },
    mid: { lifecycle: { availability: 'live', deprecated: false } },
    costly: { lifecycle: { availability: 'live', deprecated: false } },
    retired: { lifecycle: { availability: 'live', deprecated: true } },
  },
  routes: {
    'direct/cheap': route('cheap', 0.4),
    'gateway/cheap': route('cheap', 0.5, false),
    'direct/mid': route('mid', 2),
    'direct/costly': route('costly', 60),
  },
  capabilities: {
    cheap: { textOutput: true, functionCalling: false },
    mid: { textOutput: true, functionCalling: true },
    costly: { textOutput: true, functionCalling: true },
  },
  limits: { cheap: { contextTokens: 32_000 }, mid: { contextTokens: 1_000_000 } },
  families: { 'lab/fast': { activeModelKey: 'cheap' }, 'lab/pro': { activeModelKey: 'costly' } },
};

describe('live target resolution', () => {
  it('resolves the default route, or a named route of the same model', () => {
    expect(resolveLiveTarget(registry, 'cheap').routeId).toBe('direct/cheap');
    expect(resolveLiveTarget(registry, 'cheap', 'gateway/cheap').routeId).toBe('gateway/cheap');
    expect(() => resolveLiveTarget(registry, 'cheap', 'direct/mid')).toThrow(/not a route/);
    expect(() => resolveLiveTarget(registry, 'retired')).toThrow(/non-deprecated/);
    expect(() => resolveLiveTarget(registry, 'missing')).toThrow(/not in the model registry/);
  });

  it('refuses a model priced above the registry median unless the costly override is given', () => {
    expect(outputPriceCeiling(registry)).toBe(2);
    expect(spendRefusal(registry, resolveLiveTarget(registry, 'cheap'), false)).toBeNull();
    expect(spendRefusal(registry, resolveLiveTarget(registry, 'costly'), false)).toMatch(
      /cheap models/,
    );
    expect(spendRefusal(registry, resolveLiveTarget(registry, 'costly'), true)).toBeNull();
  });

  it('skips a suite the model lacks the capability for, and a case beyond its context', () => {
    const cheap = resolveLiveTarget(registry, 'cheap');
    const mid = resolveLiveTarget(registry, 'mid');
    expect(unsupportedSuiteReason(loadDataset('tools'), cheap)).toMatch(/functionCalling/);
    expect(unsupportedSuiteReason(loadDataset('tools'), mid)).toBeNull();

    const longContext = loadDataset('long-context');
    const largest = longContext.cases.at(-1)!;
    expect(contextSkipReason(longContext, largest, cheap)).toMatch(/context window/);
    expect(contextSkipReason(longContext, largest, mid)).toBeNull();
  });

  it('writes a baseline only for families the model is active in', () => {
    expect(activeFamilies(registry, 'cheap')).toEqual(['lab/fast']);
    expect(activeFamilies(registry, 'mid')).toEqual([]);
  });

  it('names measurement files the same way the promotion gate reads them', () => {
    for (const key of ['lab/fast', 'plain-model', 'a b:c']) {
      expect(measurementFileName(key)).toBe(gateFileName(key));
    }
  });
});

describe('a live run', () => {
  const reasoning = loadDataset('reasoning');
  const tools = loadDataset('tools');
  let tick = 0;
  const metered: Responder = async (evalCase) => {
    tick += 1;
    return {
      text: evalCase.id === 'reasoning/age-puzzle' ? 'Answer: 36' : 'Answer: 0',
      usage: { inputTokens: 100, outputTokens: 10 },
      costUsd: 0.001 * tick,
      costSource: 'provider',
      latencyMs: 100 * tick,
      ttfbMs: 10 * tick,
    };
  };

  it('records cost and latency per case and summarises both per suite', async () => {
    tick = 0;
    const outcome = await runLive([reasoning, tools], {
      target: resolveLiveTarget(registry, 'cheap'),
      recordedOn: '2026-09-17',
      responderFor: () => metered,
    });
    const summary = outcome.report.suites.reasoning!;
    expect(summary.passed).toBe(1);
    expect(summary.failed).toHaveLength(reasoning.cases.length - 1);
    expect(summary.cost.meteredCases).toBe(reasoning.cases.length);
    expect(summary.cost.totalUsd).toBeCloseTo(0.028, 10);
    expect(summary.latency.p50Ms).toBe(400);
    expect(summary.latency.p95Ms).toBe(700);
    expect(outcome.report.unsupportedSuites.tools).toMatch(/functionCalling/);
    expect(formatReport(outcome.reports[0]!)).toMatch(/cost: \$0\.028000 total/);
    expect(formatReport(outcome.reports[0]!)).toMatch(/latency: p50 400 ms, p95 700 ms/);
  });

  it('replays its own recording with no network to the same scores', async () => {
    tick = 0;
    const outcome = await runLive([reasoning], {
      target: resolveLiveTarget(registry, 'cheap'),
      recordedOn: '2026-09-17',
      responderFor: () => metered,
    });
    const replayed = await runReplay([reasoning], outcome.recording);
    expect(replayed.report.suites.reasoning!.score).toBe(outcome.report.suites.reasoning!.score);
    expect(replayed.report.suites.reasoning!.cost).toEqual(outcome.report.suites.reasoning!.cost);
    expect(replayed.report.modelKey).toBe('cheap');
  });
});

describe('determinism', () => {
  it('generates the same haystack for the same seed and places the needle at its depth', () => {
    const spec = { seed: 7, targetChars: 5_000, depth: 0.25, needle: 'NEEDLE-SENTENCE.' };
    const first = buildHaystack(spec);
    expect(buildHaystack(spec)).toBe(first);
    expect(buildHaystack({ ...spec, seed: 8 })).not.toBe(first);
    const position = first.indexOf('NEEDLE-SENTENCE.') / first.length;
    expect(position).toBeGreaterThan(0.15);
    expect(position).toBeLessThan(0.35);
  });

  it('fingerprints the whole request, fixtures included', () => {
    const files = loadDataset('files');
    const evalCase = files.cases[0]!;
    const request = buildRequest(evalCase);
    const content = request.messages[0]!.content;
    expect(Array.isArray(content) && content[0]!.type).toBe('file');
    expect(fingerprintRequest(request)).toBe(fingerprintRequest(buildRequest(evalCase)));
    expect(
      fingerprintRequest(buildRequest({ ...evalCase, prompt: `${evalCase.prompt} ` })),
    ).not.toBe(fingerprintRequest(request));
  });

  it('embeds recorded fixtures as tool results, never fetching a live page', () => {
    const browser = loadDataset('browser');
    const evalCase = browser.cases[0]!;
    const request = buildRequest(evalCase);
    const fixture = readFileSync(
      fileURLToPath(new URL('../datasets/fixtures/browser/login-page.txt', import.meta.url)),
      'utf8',
    );
    expect(JSON.stringify(request.messages)).toContain(JSON.stringify(fixture).slice(1, -1));
  });

  it('computes nearest-rank percentiles', () => {
    expect(percentile([], 0.5)).toBeNull();
    expect(percentile([5, 1, 3, 2, 4], 0.5)).toBe(3);
    expect(percentile([5, 1, 3, 2, 4], 0.95)).toBe(5);
  });
});
