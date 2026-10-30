import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

const repoRoot = resolve(import.meta.dirname, '../../..');
const e2eDir = resolve(repoRoot, 'apps/web/e2e');
const matrixDir = join(e2eDir, 'matrix');
const workflow = readFileSync(resolve(repoRoot, '.github/workflows/ci.yml'), 'utf8');
const matrixWorkflow = readFileSync(
  resolve(repoRoot, '.github/workflows/web-public-matrix.yml'),
  'utf8',
);

const HARNESS = 'qa-capability-harness';
const DEV_RENDERER_SPECS = ['chat-rendering-regression.spec.ts'];
interface WorkflowJob {
  needs?: string | string[];
  env?: Record<string, string>;
  steps: {
    name?: string;
    run?: string;
    env?: Record<string, string>;
    'continue-on-error'?: boolean;
  }[];
}
const jobs = (parse(workflow) as { jobs: Record<string, WorkflowJob> }).jobs;

function runFor(job: string, step: string): string {
  return jobs[job]?.steps.find((entry) => entry.name === step)?.run ?? '';
}

/**
 * A spec belongs here only when its size, not its result, keeps it off the
 * push gate. Each entry says how large it is.
 */
const ON_DEMAND_MATRIX = [
  // Every public route x 8 widths x 2 themes, about 3,200 cases.
  'public-design-standard.spec.ts',
  // Three footer callers x 8 widths x 2 themes with native strip capture: 48
  // cases at about 42 seconds each, more than the push step's whole budget.
  'public-footer-measured.spec.ts',
  // Cold image, process, database and V8 observations are produced once for all widths.
  'public-runtime-proof.spec.ts',
];

function specs(dir = e2eDir): string[] {
  return readdirSync(dir)
    .filter((name) => name.endsWith('.spec.ts'))
    .sort();
}

function needsSignIn(spec: string, dir = e2eDir): boolean {
  return readFileSync(join(dir, spec), 'utf8').includes(HARNESS);
}

function ciSpecList(): string[] {
  const command = runFor('web-a11y', 'Run signed-out Web Playwright flows');
  return [...command.matchAll(/^\s*([a-z0-9-]+\.spec\.ts)/gim)].map((match) => match[1]!).sort();
}

function devSpecList(): string[] {
  const command = runFor('web-renderer-e2e', 'Run deterministic renderer fixtures');
  return [...command.matchAll(/^\s*([a-z0-9-]+\.spec\.ts)/gim)].map((match) => match[1]!).sort();
}

/**
 * The job used to name two specs by hand, so five public specs that cost
 * nothing to run were never run, and a new one joined them by default. The
 * authenticated specs are a separate problem: they need a real Clerk secret
 * this workflow does not have, which is recorded in the step's own comment.
 */
describe('web CI runs every browser spec that does not need an account', () => {
  it('finds specs to check', () => {
    expect(specs().length).toBeGreaterThan(5);
  });

  it('assigns every signed-out spec to exactly one blocking server lane', () => {
    const public_ = specs().filter((spec) => !needsSignIn(spec));
    expect(ciSpecList()).toEqual(public_.filter((spec) => !DEV_RENDERER_SPECS.includes(spec)));
    expect(devSpecList()).toEqual(DEV_RENDERER_SPECS);
    expect([...ciSpecList(), ...devSpecList()].sort()).toEqual(public_);
    expect(ciSpecList().filter((spec) => devSpecList().includes(spec))).toEqual([]);
  });

  it('executes the development renderer against a fresh dev server and deployed sandbox policy', () => {
    const job = jobs['web-renderer-e2e'];
    expect(job).toBeDefined();
    expect(job?.env?.['PLAYWRIGHT_REUSE_RUNNING_SERVER']).toBeUndefined();
    expect(job?.env?.['PLAYWRIGHT_BASE_URL']).toBe('http://localhost:3000');
    expect(job?.env?.['NEXT_PUBLIC_SANDBOX_ORIGIN']).toBe('http://localhost:3001');
    expect(new URL(job?.env?.['DATABASE_URL'] ?? '').hostname).toBe('localhost');
    const config = readFileSync(resolve(repoRoot, 'apps/web/playwright.config.ts'), 'utf8');
    expect(config).toMatch(/command:\s*'pnpm dev'/);
    const manifest = JSON.parse(readFileSync(resolve(repoRoot, 'apps/web/package.json'), 'utf8'));
    expect(manifest.scripts.dev).toBe('next dev');
    expect(
      runFor('web-renderer-e2e', 'Start the sandbox with deployed security headers'),
    ).toContain('node apps/web/e2e/lib/renderer-sandbox-server.mjs');
    const execution = job?.steps.find(
      (step) => step.name === 'Run deterministic renderer fixtures',
    );
    expect(execution?.run).toContain('pnpm exec playwright test');
    expect(execution?.run).not.toMatch(/--(?:list|grep|grep-invert)\b/);
    expect(execution?.['continue-on-error']).not.toBe(true);
    expect(jobs['ci-complete']?.needs).toContain('web-renderer-e2e');
  });

  it('keeps the renderer unavailable in the production browser lane', () => {
    const production = jobs['web-a11y']?.steps.find(
      (step) => step.name === 'Run signed-out Web Playwright flows',
    );
    expect(production?.env?.['QA_PRODUCTION_SERVER']).toBe('1');
    expect(ciSpecList()).toContain('dev-design-studies.spec.ts');
    const boundary = readFileSync(join(e2eDir, 'dev-design-studies.spec.ts'), 'utf8');
    expect(boundary).toContain('/dev/renderer-probe');
    expect(boundary).toContain("process.env['QA_PRODUCTION_SERVER']");
    expect(boundary).toMatch(/response\?\.status\(\)\)\.toBe\(404\)/);
  });

  it('names why the authenticated specs are absent rather than leaving it unsaid', () => {
    expect(workflow).toMatch(/authenticated specs cannot run/i);
    expect(workflow).toMatch(/clerk-ci\.invalid/);
    expect(workflow).toMatch(/CLERK_SECRET_KEY/);
  });

  it('still leaves authenticated specs to run, so this is a real gap and not a rename', () => {
    expect(specs().filter((spec) => needsSignIn(spec)).length).toBeGreaterThan(10);
  });
});

/**
 * The push step reads only the top level of `e2e/`, so a folder beside it is
 * a way out of the gate. This keeps the folder to the named matrix, keeps the
 * matrix signed-out, and keeps a workflow that actually runs it.
 */
describe('the on-demand matrix is a named exception, not a place to park specs', () => {
  it('holds exactly the specs listed as too large for a push', () => {
    expect(specs(matrixDir)).toEqual([...ON_DEMAND_MATRIX].sort());
  });

  it('holds no spec that signs in or that the push step also names', () => {
    expect(specs(matrixDir).filter((spec) => needsSignIn(spec, matrixDir))).toEqual([]);
    expect(ciSpecList().filter((spec) => ON_DEMAND_MATRIX.includes(spec))).toEqual([]);
  });

  it('runs every named matrix spec from a workflow someone can start', () => {
    expect(matrixWorkflow).toMatch(/^\s*workflow_dispatch:/m);
    for (const spec of ON_DEMAND_MATRIX) {
      expect(matrixWorkflow).toContain(`playwright test e2e/matrix/${spec}`);
    }
    expect(matrixWorkflow).not.toMatch(/continue-on-error/);
  });

  it('says beside the push step that the matrix runs on demand', () => {
    const earlier = (workflow.split('- name: Run signed-out Web Playwright flows')[0] ?? '').split(
      '- name:',
    );
    const comment = earlier[earlier.length - 1] ?? '';
    expect(comment).toMatch(/apps\/web\/e2e\/matrix/);
    expect(comment).toMatch(/on demand/i);
    expect(comment).toMatch(/web-public-matrix\.yml/);
  });
});
