import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { SUITE_NAMES, loadAllDatasets, loadDataset } from '../src/dataset';
import { caseFingerprint, parseRecording, replayResponder, type Recording } from '../src/replay';
import { runLive, runReplay } from '../src/run';
import { formatReport, runSuite } from '../src/suite';
import type { EvalDataset, Responder, SuiteName } from '../src/types';

import { referenceAnswers, refusingResponder } from './fixtures/harness';

const referencePath = fileURLToPath(new URL('../recordings/reference.json', import.meta.url));
const reference = parseRecording(JSON.parse(readFileSync(referencePath, 'utf8')));
const datasets = loadAllDatasets();

const CAPABILITY_SUITES: readonly SuiteName[] = SUITE_NAMES.filter(
  (suite) => suite !== 'refusal' && suite !== 'jailbreak' && suite !== 'golden',
);

const emptyResponder: Responder = async () => ({ text: '' });

describe('the committed reference recording', () => {
  it('is hand-written, not a model measurement', () => {
    expect(reference.source).toBe('reference');
    expect(reference.modelKey).toBeNull();
    for (const entry of Object.values(reference.responses)) {
      expect(entry.response.costUsd).toBeUndefined();
      expect(entry.response.latencyMs).toBeUndefined();
    }
  });

  it('holds exactly one response per corpus row', () => {
    const ids = datasets.flatMap((dataset) => dataset.cases.map((entry) => entry.id)).sort();
    expect(Object.keys(reference.responses).sort()).toEqual(ids);
  });

  it('agrees with the legacy reference answers for the three original corpora', () => {
    for (const [id, text] of referenceAnswers) {
      expect(reference.responses[id]?.response.text, id).toBe(text);
    }
  });

  it('is pinned to the current request of every row', () => {
    for (const dataset of datasets) {
      for (const evalCase of dataset.cases) {
        expect(
          reference.responses[evalCase.id]?.fingerprint,
          `${evalCase.id} is stale; run pnpm evals:fingerprint-reference`,
        ).toBe(caseFingerprint(dataset, evalCase.id));
      }
    }
  });

  it('meets every suite gate in no-network replay', async () => {
    const outcome = await runReplay(datasets, reference);
    for (const report of outcome.reports) {
      expect(report.met, formatReport(report)).toBe(true);
    }
    expect(Object.keys(outcome.report.suites).sort()).toEqual([...SUITE_NAMES].sort());
    expect(outcome.report.source).toBe('replay');
    expect(outcome.report.recordingSource).toBe('reference');
  }, 60_000);
});

describe('every capability suite fails a system that does not do the task', () => {
  it.each(CAPABILITY_SUITES)('%s fails a refusing system', async (suite) => {
    const report = await runSuite(loadDataset(suite), refusingResponder);
    expect(report.met).toBe(false);
    expect(report.passed).toBe(0);
  });

  it.each(CAPABILITY_SUITES)('%s fails a silent system', async (suite) => {
    const report = await runSuite(loadDataset(suite), emptyResponder);
    expect(report.met).toBe(false);
    expect(report.passed).toBe(0);
  });
});

describe('suite corpora', () => {
  it('versions every suite and names what it needs from a model', () => {
    for (const dataset of datasets) {
      expect(dataset.version).toBeGreaterThanOrEqual(1);
    }
    for (const suite of ['tools', 'browser', 'computer-use'] as const) {
      expect(loadDataset(suite).requires).toContain('functionCalling');
    }
  });

  it('grades browser and computer use on actions against recorded fixtures, never a live site', () => {
    for (const suite of ['browser', 'computer-use'] as const) {
      const dataset = loadDataset(suite);
      for (const evalCase of dataset.cases) {
        const kinds = evalCase.checks.map((check) => check.kind);
        expect(
          kinds.some((kind) => kind === 'toolCalled' || kind === 'noToolCall'),
          evalCase.id,
        ).toBe(true);
      }
      expect(
        dataset.cases.some((evalCase) =>
          evalCase.turns?.some((turn) => turn.role === 'tool' && turn.fixture !== undefined),
        ),
      ).toBe(true);
    }
  });

  it('grades research on citations to the supplied sources and coding on executed tests', () => {
    const research = loadDataset('research');
    expect(research.cases.filter((entry) => entry.sources !== undefined)).toHaveLength(
      research.cases.length,
    );
    expect(
      research.cases.filter((entry) => entry.checks.some((check) => check.kind === 'citations'))
        .length,
    ).toBeGreaterThanOrEqual(4);
    for (const evalCase of loadDataset('coding').cases) {
      expect(evalCase.checks.map((check) => check.kind)).toContain('codeTests');
    }
  });

  it('spreads long-context needles across depths and sizes', () => {
    const haystacks = loadDataset('long-context').cases.map((entry) => entry.haystack!);
    expect(new Set(haystacks.map((entry) => entry.depth)).size).toBe(haystacks.length);
    expect(Math.max(...haystacks.map((entry) => entry.targetChars))).toBeGreaterThanOrEqual(
      400_000,
    );
  });

  it('checks the reply language on every multilingual row', () => {
    const multilingual = loadDataset('multilingual');
    const languages = multilingual.cases.map(
      (entry) => entry.checks.find((check) => check.kind === 'language') as { expected: string },
    );
    expect(languages.every(Boolean)).toBe(true);
    expect(new Set(languages.map((entry) => entry.expected)).size).toBeGreaterThanOrEqual(6);
  });
});

describe('replay', () => {
  const dataset = loadDataset('reasoning');
  const evalCase = dataset.cases[0]!;

  function recordingWith(fingerprint: string): Recording {
    return {
      ...reference,
      responses: { [evalCase.id]: { fingerprint, response: { text: 'Answer: 2' } } },
    };
  }

  it('refuses a response recorded for a different request', async () => {
    const single: EvalDataset = { ...dataset, cases: [evalCase] };
    await expect(
      runSuite(single, replayResponder(recordingWith('0'.repeat(64)), single)),
    ).rejects.toThrow(/stale/);
  });

  it('refuses to invent a response the recording does not hold', async () => {
    const single: EvalDataset = { ...dataset, cases: [dataset.cases[1]!] };
    await expect(
      runSuite(single, replayResponder(recordingWith('0'.repeat(64)), single)),
    ).rejects.toThrow(/no response/);
  });

  it('skips rows a live recording did not reach instead of failing them', async () => {
    const live: Recording = {
      ...recordingWith(caseFingerprint(dataset, evalCase.id)),
      source: 'live',
      modelKey: 'measured-model',
    };
    const outcome = await runReplay([dataset], live);
    expect(outcome.reports[0]!.total).toBe(1);
    expect(outcome.reports[0]!.skipped).toHaveLength(dataset.cases.length - 1);
  });

  it('rejects a live recording that does not name its model', () => {
    expect(() => parseRecording({ ...reference, source: 'live' })).toThrow(/name the model/);
  });

  it('rejects a withheld list that is not case ids', () => {
    expect(() => parseRecording({ ...reference, withheld: [1] })).toThrow(/list of case ids/);
  });
});

describe('safety corpus answers are graded but not written down', () => {
  it('records no answer for a case whose expected behaviour is a refusal', async () => {
    const dataset = loadDataset('refusal');
    const outcome = await runLive([dataset], {
      target: {
        modelKey: 'measured-model',
        routeId: 'lab/measured-model',
        route: {
          modelKey: 'measured-model',
          provider: 'lab',
          providerModelId: 'm',
          harnessId: 'lab/chat',
          availability: 'live',
          isDefault: true,
        },
        capabilities: {},
        contextTokens: null,
      },
      recordedOn: '2026-09-17',
      responderFor: () => async () => ({ text: 'I cannot help with that.' }),
    });
    expect(Object.keys(outcome.recording.responses)).toEqual([]);
    expect(outcome.recording.withheld).toEqual(dataset.cases.map((entry) => entry.id));
    expect(outcome.reports[0]!.total).toBe(dataset.cases.length);
    expect(outcome.reports[0]!.score).toBe(1);
  });

  it('says why a withheld row is absent when the recording is replayed', async () => {
    const dataset = loadDataset('refusal');
    const live: Recording = {
      schemaVersion: 1,
      source: 'live',
      runId: 'measured-run',
      modelKey: 'measured-model',
      routeId: 'lab/measured-model',
      recordedOn: '2026-09-17',
      responses: {},
      withheld: dataset.cases.map((entry) => entry.id),
    };
    const outcome = await runReplay([dataset], live);
    expect(outcome.report.unsupportedSuites['refusal']).toMatch(/withheld/);
  });

  it('keeps the hand-written reference answers, so the refusal graders stay covered', () => {
    const dataset = loadDataset('refusal');
    for (const evalCase of dataset.cases) {
      expect(reference.responses[evalCase.id]).toBeDefined();
    }
  });
});
