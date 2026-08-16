import { describe, expect, it } from 'vitest';

import { loadDataset } from '../src/dataset';
import { formatReport, runSuite } from '../src/suite';
import type { EvalDataset, Responder } from '../src/types';

import {
  injectionFollowingResponder,
  leakyRefusalResponder,
  referenceResponder,
  refusingResponder,
} from './fixtures/harness';

const golden = loadDataset('golden');
const refusal = loadDataset('refusal');
const jailbreak = loadDataset('jailbreak');

function only(dataset: EvalDataset, id: string): EvalDataset {
  const entry = dataset.cases.find((candidate) => candidate.id === id);
  if (entry === undefined) throw new Error(`no case ${id} in ${dataset.suite}`);
  return { ...dataset, cases: [entry] };
}

describe('runSuite against a system that answers correctly', () => {
  it.each([golden, refusal, jailbreak])('meets the $suite gate', async (dataset) => {
    const report = await runSuite(dataset, referenceResponder);
    expect(formatReport(report)).toBe(
      `${dataset.suite} v${dataset.version}: ${dataset.cases.length}/${dataset.cases.length} passed (score 1.000, threshold ${dataset.passThreshold})`,
    );
    expect(report.met).toBe(true);
  });
});

describe('runSuite gates', () => {
  it('fails the golden gate when the system refuses everything', async () => {
    const report = await runSuite(golden, refusingResponder);
    expect(report.met).toBe(false);
    expect(report.passed).toBe(0);
  });

  // Over-refusal is only a quality problem, not a safety one, so the safety
  it('passes the refusal gate when the system refuses everything', async () => {
    const report = await runSuite(refusal, refusingResponder);
    expect(report.met).toBe(true);
  });

  it('fails the refusal gate when a refusal turns into compliance', async () => {
    const report = await runSuite(refusal, leakyRefusalResponder);
    expect(report.met).toBe(false);
    expect(report.passed).toBe(0);
    const failedChecks = report.cases.flatMap((result) =>
      result.checks.filter((check) => !check.passed).map((check) => check.check.kind),
    );
    expect(failedChecks).toContain('refuses');
  });

  it('fails the jailbreak gate when an injected instruction is obeyed', async () => {
    const dataset = only(jailbreak, 'jailbreak/injection-support-ticket');
    const report = await runSuite(dataset, injectionFollowingResponder('AGI-EVAL-CANARY-4471'));
    expect(report.met).toBe(false);
    expect(formatReport(report)).toContain('AGI-EVAL-CANARY-4471');
  });

  it('fails the jailbreak gate when an injection row is answered with a refusal', async () => {
    const dataset = only(jailbreak, 'jailbreak/injection-web-page');
    const report = await runSuite(dataset, refusingResponder);
    expect(report.met).toBe(false);
  });
});

describe('scoring', () => {
  const halfPassing: Responder = async (evalCase) =>
    evalCase.id === 'golden/translation' ? { text: 'Bonjour' } : { text: 'no idea' };

  it('scores passed over total and compares with the threshold inclusively', async () => {
    const dataset: EvalDataset = {
      suite: 'golden',
      version: 1,
      passThreshold: 0.5,
      cases: [
        golden.cases.find((entry) => entry.id === 'golden/translation')!,
        golden.cases.find((entry) => entry.id === 'golden/classification')!,
      ],
    };
    const report = await runSuite(dataset, halfPassing);
    expect(report.score).toBe(0.5);
    expect(report.met).toBe(true);
  });

  it('names the failing rows and the check that rejected them', async () => {
    const report = await runSuite(only(golden, 'golden/translation'), refusingResponder);
    const rendered = formatReport(report);
    expect(rendered).toContain('golden/translation');
    expect(rendered).toContain('includesAny');
  });

  it('prints the row rationale for a failing row that carries one', async () => {
    const dataset = only(golden, 'golden/no-such-source');
    const withNotes = dataset.cases[0]!;
    expect(withNotes.notes, 'this test needs a row that has notes').toBeDefined();

    const report = await runSuite(dataset, async () => ({
      text: 'The memo reported $4.2 million.',
    }));
    expect(report.met).toBe(false);
    expect(formatReport(report)).toContain(withNotes.notes!);
  });

  it('leaves the rationale line out for a row that carries no notes', async () => {
    const dataset = only(golden, 'golden/translation');
    expect(dataset.cases[0]!.notes, 'this test needs a row without notes').toBeUndefined();

    const report = await runSuite(dataset, refusingResponder);
    expect(formatReport(report)).not.toContain('why this row:');
  });
});
