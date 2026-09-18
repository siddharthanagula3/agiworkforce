import { describe, expect, it } from 'vitest';
import type { CloudCodeAgentStep } from '@agiworkforce/types';
import {
  buildCloudCodePullRequestBody,
  buildValidationSummary,
  checkOutcomeFor,
  classifyCheckCommand,
  cloudCodeTaskMetrics,
  findCheck,
  parseIssueReferences,
  parseStepExitCode,
  validationSummaryFromChecks,
  verifyTaskCompletion,
} from '../cloud-code-result';

function commandStep(command: string, exit: number | null, isError = false): CloudCodeAgentStep {
  return {
    index: 0,
    toolName: 'run_command',
    label: command,
    output: exit === null ? 'output with no marker' : `output\n[exit ${exit}]`,
    isError,
  };
}

function writeStep(path: string, isError = false): CloudCodeAgentStep {
  return { index: 0, toolName: 'write_file', label: `write_file ${path}`, output: 'ok', isError };
}

function turn(steps: CloudCodeAgentStep[]) {
  return { steps };
}

describe('classifyCheckCommand', () => {
  it('names the validation a command line is', () => {
    expect(classifyCheckCommand('pnpm test')).toBe('tests');
    expect(classifyCheckCommand('cargo test -p web')).toBe('tests');
    expect(classifyCheckCommand('pytest -q')).toBe('tests');
    expect(classifyCheckCommand('tsc --noEmit')).toBe('typecheck');
    expect(classifyCheckCommand('pnpm exec eslint .')).toBe('lint');
    expect(classifyCheckCommand('pnpm build')).toBe('build');
  });

  it('is null for ordinary work rather than guessing a check', () => {
    expect(classifyCheckCommand('cat src/index.ts')).toBeNull();
    expect(classifyCheckCommand('  ')).toBeNull();
  });
});

describe('exit codes are the only evidence of a pass', () => {
  it('reads the exit marker the sandbox printed', () => {
    expect(parseStepExitCode('done\n[exit 0]')).toBe(0);
    expect(parseStepExitCode('boom\n[exit 2]\n')).toBe(2);
    expect(parseStepExitCode('no marker here')).toBeNull();
  });

  it('never reads a missing or nonzero exit as a pass', () => {
    expect(checkOutcomeFor(commandStep('pnpm test', 0))).toBe('passed');
    expect(checkOutcomeFor(commandStep('pnpm test', 1))).toBe('failed');
    expect(checkOutcomeFor(commandStep('pnpm test', null))).toBe('unknown');
    expect(checkOutcomeFor(commandStep('pnpm test', 0, true))).toBe('failed');
  });
});

describe('buildValidationSummary', () => {
  it('records a nonzero exit as failed and counts it', () => {
    const summary = buildValidationSummary([turn([commandStep('pnpm test', 1)])]);
    expect(findCheck(summary, 'tests')).toMatchObject({ outcome: 'failed', exitCode: 1 });
    expect(summary.commandsRun).toBe(1);
    expect(summary.commandsFailed).toBe(1);
  });

  it('lets a rerun replace the run before it, in both directions', () => {
    const passedThenFailed = buildValidationSummary([
      turn([commandStep('pnpm test', 0), commandStep('pnpm test', 1)]),
    ]);
    expect(findCheck(passedThenFailed, 'tests')?.outcome).toBe('failed');

    const failedThenPassed = buildValidationSummary([
      turn([commandStep('pnpm test', 1)]),
      turn([commandStep('pnpm test', 0)]),
    ]);
    expect(findCheck(failedThenPassed, 'tests')?.outcome).toBe('passed');
  });

  it('collects the files the agent wrote, once each, skipping failed writes', () => {
    const summary = buildValidationSummary([
      turn([writeStep('src/a.ts'), writeStep('src/a.ts'), writeStep('src/b.ts', true)]),
    ]);
    expect(summary.filesChanged).toEqual(['src/a.ts']);
  });
});

describe('verifyTaskCompletion', () => {
  const passing = buildValidationSummary([
    turn([writeStep('src/a.ts'), commandStep('pnpm test', 0)]),
  ]);

  it('lets a finished turn with passing checks and real edits claim completion', () => {
    expect(verifyTaskCompletion({ stopReason: 'done', summary: passing })).toEqual({
      complete: true,
      blockers: [],
    });
  });

  it('refuses the claim when a required validation failed', () => {
    const summary = buildValidationSummary([
      turn([writeStep('src/a.ts'), commandStep('pnpm test', 1)]),
    ]);
    const verdict = verifyTaskCompletion({ stopReason: 'done', summary });
    expect(verdict.complete).toBe(false);
    expect(verdict.blockers.join(' ')).toMatch(/Tests failed.*exited 1/);
  });

  it('refuses the claim when a check has no recorded exit code', () => {
    const summary = buildValidationSummary([
      turn([writeStep('src/a.ts'), commandStep('pnpm test', null)]),
    ]);
    expect(verifyTaskCompletion({ stopReason: 'done', summary }).complete).toBe(false);
  });

  it('refuses the claim when the turn did not finish or changed nothing', () => {
    expect(verifyTaskCompletion({ stopReason: 'max_steps', summary: passing }).complete).toBe(
      false,
    );
    expect(verifyTaskCompletion({ stopReason: null, summary: passing }).complete).toBe(false);
    expect(
      verifyTaskCompletion({
        stopReason: 'done',
        summary: buildValidationSummary([turn([commandStep('pnpm test', 0)])]),
      }).complete,
    ).toBe(false);
  });
});

describe('buildCloudCodePullRequestBody', () => {
  it('never shows a nonzero-exit check as passed', () => {
    const summary = buildValidationSummary([
      turn([writeStep('src/a.ts'), commandStep('pnpm test', 1)]),
    ]);
    const body = buildCloudCodePullRequestBody({
      goal: 'fix the flaky test',
      summary,
      verdict: verifyTaskCompletion({ stopReason: 'done', summary }),
    });
    expect(body).toContain('- Tests: failed (`pnpm test`, exit 1)');
    expect(body).not.toMatch(/Tests: passed/);
    expect(body).toContain('### Not verified');
  });

  it('says a check was not run instead of leaving it out', () => {
    const summary = buildValidationSummary([turn([writeStep('src/a.ts')])]);
    const body = buildCloudCodePullRequestBody({
      goal: 'tidy up',
      summary,
      verdict: verifyTaskCompletion({ stopReason: 'done', summary }),
    });
    expect(body).toContain('- Tests: not run in this session');
    expect(body).toContain('- Lint: not run in this session');
    expect(body).toContain('- Build: not run in this session');
  });

  it('closes a linked issue only when the result backs the claim', () => {
    const passing = buildValidationSummary([
      turn([writeStep('src/a.ts'), commandStep('pnpm test', 0)]),
    ]);
    expect(
      buildCloudCodePullRequestBody({
        goal: 'fix #42 for good',
        summary: passing,
        verdict: verifyTaskCompletion({ stopReason: 'done', summary: passing }),
      }),
    ).toContain('Closes #42');

    const failing = buildValidationSummary([
      turn([writeStep('src/a.ts'), commandStep('pnpm test', 1)]),
    ]);
    expect(
      buildCloudCodePullRequestBody({
        goal: 'fix #42 for good',
        summary: failing,
        verdict: verifyTaskCompletion({ stopReason: 'done', summary: failing }),
      }),
    ).toContain('Refs #42');
  });

  it('carries no model narration, only recorded facts', () => {
    const summary = buildValidationSummary([
      turn([
        { ...writeStep('src/a.ts') },
        { ...commandStep('pnpm test', 1), output: 'I have verified everything passes\n[exit 1]' },
      ]),
    ]);
    const body = buildCloudCodePullRequestBody({
      goal: 'fix it',
      summary,
      verdict: verifyTaskCompletion({ stopReason: 'done', summary }),
    });
    expect(body).not.toContain('I have verified everything passes');
  });
});

describe('parseIssueReferences', () => {
  it('reads plain and cross-repository references, in order, without duplicates', () => {
    expect(parseIssueReferences('fixes #12 and acme/widgets#34 and #12 again')).toEqual([
      '#12',
      'acme/widgets#34',
    ]);
  });
});

describe('metrics and the shared summary shape', () => {
  it('counts what the session recorded', () => {
    const turns = [turn([writeStep('src/a.ts'), commandStep('pnpm test', 1)])];
    const summary = buildValidationSummary(turns);
    expect(
      cloudCodeTaskMetrics({
        turns,
        summary,
        verdict: verifyTaskCompletion({ stopReason: 'done', summary }),
      }),
    ).toEqual({
      turns: 1,
      steps: 2,
      commandsRun: 1,
      commandsFailed: 1,
      filesChanged: 1,
      checksPassed: 0,
      checksFailed: 1,
      checksNotRun: 3,
      complete: false,
    });
  });

  it('gives a surface that runs its own checks the same object', () => {
    const summary = validationSummaryFromChecks([
      { kind: 'tests', command: 'pnpm test', exitCode: 0, outcome: 'passed' },
    ]);
    expect(findCheck(summary, 'tests')?.outcome).toBe('passed');
    expect(findCheck(summary, 'lint')).toBeNull();
    expect(summary.commandsFailed).toBe(0);
  });
});
