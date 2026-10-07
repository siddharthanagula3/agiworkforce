import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = resolve(import.meta.dirname, '../../..');
const e2eDir = resolve(repoRoot, 'apps/web/e2e');
const matrixDir = join(e2eDir, 'matrix');
const workflow = readFileSync(resolve(repoRoot, '.github/workflows/ci.yml'), 'utf8');
const matrixWorkflow = readFileSync(
  resolve(repoRoot, '.github/workflows/web-public-matrix.yml'),
  'utf8',
);

const HARNESS = 'qa-capability-harness';

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
  const step = workflow.split('Run signed-out Web Playwright flows')[1] ?? '';
  const command = step.split('- name:')[0] ?? '';
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

  it('runs exactly the specs that do not sign in', () => {
    const public_ = specs().filter((spec) => !needsSignIn(spec));
    expect(ciSpecList()).toEqual(public_);
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

  it('runs the whole folder from a workflow someone can start', () => {
    expect(matrixWorkflow).toMatch(/^\s*workflow_dispatch:/m);
    expect(matrixWorkflow).toMatch(/playwright test e2e\/matrix\b/);
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
