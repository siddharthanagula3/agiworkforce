import { describe, expect, it } from 'vitest';

import { loadContextSuites, runContextCase, type ContextEvalCase } from '../src/context-eval';
import { loadDataset } from '../src/dataset';
import { gradeCase } from '../src/grader';
import type { EvalCase } from '../src/types';

// Each property is found by what a case measures (family label or expectation), never by id,
// and each is shown to fail an answer or an assembly that breaks it.
const research = loadDataset('research');
const grounding = loadContextSuites().find((suite) => suite.suite === 'research-grounding');

function casesOfFamily(family: string): readonly EvalCase[] {
  return research.cases.filter((evalCase) => evalCase.family === family);
}

function groundingCases(predicate: (evalCase: ContextEvalCase) => boolean) {
  return (grounding?.cases ?? []).filter(predicate);
}

async function passes(evalCase: EvalCase, text: string): Promise<boolean> {
  return (await gradeCase(evalCase, { text, stopReason: 'end_turn' })).passed;
}

async function failedChecks(evalCase: EvalCase, text: string): Promise<readonly string[]> {
  const graded = await gradeCase(evalCase, { text, stopReason: 'end_turn' });
  return graded.checks.filter((check) => !check.passed).map((check) => check.check.kind);
}

describe('research evals cover every property research is held to', () => {
  it('finds the offline research grounding suite', () => {
    expect(grounding?.priority).toBe('P0');
  });

  it('contradictions: an answer that reports one side of a conflict fails', async () => {
    const cases = casesOfFamily('conflict');
    expect(cases.length).toBeGreaterThan(0);
    for (const evalCase of cases) {
      expect(
        await failedChecks(
          evalCase,
          'The clinic opened in 2019 [1], and the trust newsletter gives 2021 [2].',
        ),
        `${evalCase.id} must fail an answer that never says the sources conflict`,
      ).toEqual(['includesAny']);
      expect(
        await passes(
          evalCase,
          'The sources disagree: the council says it opened in 2019 [1], the trust says 2021 [2].',
        ),
        `${evalCase.id} must pass an answer that names the conflict`,
      ).toBe(true);
    }
  });

  it('completeness: a synthesis that leaves a source out fails', async () => {
    const cases = casesOfFamily('synthesise');
    expect(cases.length).toBeGreaterThan(0);
    for (const evalCase of cases) {
      expect(
        await failedChecks(
          evalCase,
          'Headcount was 143: 120 at the end of 2024 [1] plus 35 hires [2].',
        ),
        `${evalCase.id} must fail an answer missing a source`,
      ).toEqual(['citations']);
      expect(
        await passes(
          evalCase,
          'Headcount was 143: 120 at the end of 2024 [1], plus 35 hires [2], minus 12 leavers [3].',
        ),
      ).toBe(true);
    }
  });

  it('source restrictions: an answer that brings in an outside source fails', async () => {
    const cases = casesOfFamily('source-restriction');
    expect(cases.length).toBeGreaterThan(0);
    for (const evalCase of cases) {
      expect(
        await failedChecks(
          evalCase,
          'The pilot cut heating demand by 18 percent [1], in line with https://example.org/study.',
        ),
        `${evalCase.id} must fail an answer reaching outside the brief`,
      ).toEqual(['sourceRestriction']);
      expect(await passes(evalCase, 'The pilot cut heating demand by 18 percent [1].')).toBe(true);
    }

    const policyCases = groundingCases((evalCase) => evalCase.policy !== undefined);
    expect(policyCases.length).toBeGreaterThan(0);
    for (const evalCase of policyCases) {
      expect((await runContextCase(evalCase)).passed, evalCase.id).toBe(true);
    }
  });

  it('freshness: a source past its window is dropped and counted as stale', async () => {
    const cases = groundingCases((evalCase) =>
      Object.values(evalCase.expect.excludedFor ?? {}).includes('stale'),
    );
    expect(cases.length).toBeGreaterThan(0);
    for (const evalCase of cases) {
      expect((await runContextCase(evalCase)).passed, evalCase.id).toBe(true);
      const kept = await runContextCase({
        ...evalCase,
        sources: evalCase.sources.map((source) => ({ ...source, dropStale: false })),
      });
      expect(kept.passed, `${evalCase.id} must notice a stale source that was kept`).toBe(false);
    }
  });

  it("private-data isolation: another workspace's source never grounds the answer", async () => {
    const cases = groundingCases((evalCase) => evalCase.isolation !== undefined);
    expect(cases.length).toBeGreaterThan(0);
    for (const evalCase of cases) {
      expect((await runContextCase(evalCase)).passed, evalCase.id).toBe(true);
      expect(evalCase.expect.excludes?.length ?? 0, evalCase.id).toBeGreaterThan(0);
    }
  });
});
