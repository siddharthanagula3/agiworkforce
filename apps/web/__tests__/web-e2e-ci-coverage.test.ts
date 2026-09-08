import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = resolve(import.meta.dirname, '../../..');
const e2eDir = resolve(repoRoot, 'apps/web/e2e');
const workflow = readFileSync(resolve(repoRoot, '.github/workflows/ci.yml'), 'utf8');

const HARNESS = 'qa-capability-harness';

function specs(): string[] {
  return readdirSync(e2eDir)
    .filter((name) => name.endsWith('.spec.ts'))
    .sort();
}

function needsSignIn(spec: string): boolean {
  return readFileSync(join(e2eDir, spec), 'utf8').includes(HARNESS);
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
    expect(specs().filter(needsSignIn).length).toBeGreaterThan(10);
  });
});
