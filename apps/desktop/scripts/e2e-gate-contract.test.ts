import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

const repositoryRoot = path.resolve(import.meta.dirname, '../../..');
const workflowPath = path.join(repositoryRoot, '.github/workflows/e2e-tests.yml');
const workflowSource = fs.readFileSync(workflowPath, 'utf8');
const workflow = parse(workflowSource) as {
  on: {
    push: { paths: string[] };
    pull_request: { paths: string[] };
  };
  concurrency: { 'cancel-in-progress': boolean | string };
  jobs: Record<
    string,
    {
      name: string;
      'continue-on-error'?: boolean;
      steps: Array<{
        name: string;
        if?: string;
        run?: string;
        with?: Record<string, string>;
      }>;
    }
  >;
};

const job = workflow.jobs['e2e-tests']!;
const step = (predicate: (candidate: (typeof job.steps)[number]) => boolean) =>
  job.steps.find(predicate);

const playwrightConfig = fs.readFileSync(
  path.join(repositoryRoot, 'apps/desktop/playwright.config.ts'),
  'utf8',
);
const jsonReporterOutput = playwrightConfig.match(/\['json',\s*\{\s*outputFile:\s*'([^']+)'/u)?.[1];
const declaredProjects = [...playwrightConfig.matchAll(/name:\s*'([^']+)'/gu)].map(
  (match) => match[1]!,
);

const playwrightSteps = job.steps.filter((candidate) =>
  /pnpm exec playwright test/u.test(candidate.run ?? ''),
);
const gateStep = step((candidate) => candidate.name === 'Check test results');
const uploadStep = step((candidate) => candidate.with?.['name'] === 'playwright-report');

describe('desktop E2E gate contract', () => {
  it('runs the gate against pull requests that edit the gate itself', () => {
    expect(workflow.on.push.paths).toContain('.github/workflows/e2e-tests.yml');
    expect(workflow.on.pull_request.paths).toContain('.github/workflows/e2e-tests.yml');
  });

  it('never cancels an in-progress run on main or develop', () => {
    expect(workflow.concurrency['cancel-in-progress']).not.toBe(true);
    expect(String(workflow.concurrency['cancel-in-progress'])).toContain(
      "github.event_name == 'pull_request'",
    );
  });

  it('keeps E2E blocking with no continue-on-error escape', () => {
    expect(job['continue-on-error']).toBeUndefined();
    expect(workflowSource).not.toMatch(/^\s*continue-on-error:\s*true/mu);
    expect(job.name).toBe('E2E Tests');
  });

  it('runs every project in one invocation so one report covers all of them', () => {
    expect(playwrightSteps).toHaveLength(1);
    const projects = [...playwrightSteps[0]!.run!.matchAll(/--project=(\S+)/gu)].map(
      (match) => match[1]!,
    );
    expect(projects).toEqual(['smoke', 'chat', 'v3-locks']);
    for (const project of projects) {
      expect(declaredProjects).toContain(project);
    }
  });

  it('does not override the configured reporters, which would discard the JSON report', () => {
    for (const workflowStep of job.steps) {
      expect(workflowStep.run ?? '').not.toMatch(/--reporter[= ]/u);
    }
  });

  it('reads the results file the Playwright config actually writes', () => {
    expect(jsonReporterOutput).toBe('playwright-report/results.json');
    expect(gateStep?.run).toContain(`apps/desktop/${jsonReporterOutput}`);
    expect(gateStep?.run).not.toContain('test-results/results.json');
  });

  it('fails the gate when no report was produced instead of passing silently', () => {
    expect(gateStep?.if).toBe('always()');
    expect(gateStep?.run).not.toMatch(/if \[ -f [^\]]*results\.json \]/u);
    expect(gateStep?.run).toContain('process.exit(1)');
  });

  it('uploads the HTML report directory, not the raw output directory', () => {
    expect(uploadStep?.with?.['path']).toBe('apps/desktop/playwright-report/');
  });
});

describe('desktop E2E results gate script', () => {
  const script = gateStep?.run
    ?.match(/<<'EOF'\n([\s\S]*?)\n\s*EOF/u)?.[1]
    ?.replace(/^ {10}/gmu, '');

  const runGate = (report: unknown | undefined) => {
    expect(script, 'gate step embeds no Node results checker').toBeTypeOf('string');
    const workdir = fs.mkdtempSync(path.join(import.meta.dirname, '.e2e-gate-'));
    try {
      fs.mkdirSync(path.join(workdir, 'apps/desktop/playwright-report'), { recursive: true });
      if (report !== undefined) {
        fs.writeFileSync(
          path.join(workdir, 'apps/desktop/playwright-report/results.json'),
          JSON.stringify(report),
        );
      }
      const scriptPath = path.join(workdir, 'check-e2e-results.mjs');
      fs.writeFileSync(scriptPath, script!);
      return spawnSync(process.execPath, [scriptPath], { cwd: workdir, encoding: 'utf8' });
    } finally {
      fs.rmSync(workdir, { recursive: true, force: true });
    }
  };

  it('fails when the run produced no report at all', () => {
    const result = runGate(undefined);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('No readable Playwright report');
  });

  it('fails when the report executed zero tests', () => {
    const result = runGate({ stats: { expected: 0, unexpected: 0, flaky: 0 } });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('zero executed tests');
  });

  it('fails when tests failed', () => {
    const result = runGate({ stats: { expected: 10, unexpected: 2, flaky: 0 } });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('2 unexpected failure(s)');
  });

  it('passes only on a report with executed and no failing tests', () => {
    const result = runGate({ stats: { expected: 12, unexpected: 0, flaky: 1 } });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('All tests passed');
  });
});
