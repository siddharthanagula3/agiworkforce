import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = resolve(import.meta.dirname, '../../..');

function read(relativePath: string): string {
  return readFileSync(resolve(repoRoot, relativePath), 'utf8');
}

const workflow = read('.github/workflows/cross-version-compatibility.yml');
const matrix = JSON.parse(read('.github/cross-version-matrix.json')) as {
  pairs: { id: string; status: string; command?: string }[];
};
const chain = JSON.parse(read('.github/cross-surface-e2e-chain.json')) as {
  tenant: { id: string; token: string; state: string };
  steps: { id: string; status: string }[];
};

/**
 * The §110 chain writes into a workspace, so it needs a tenant nobody minds it
 * writing to, and that tenant does not exist. A suite that quietly passed in
 * that state would be worse than no suite: it would close eighteen checklist
 * rows on nothing. What is asserted here is the opposite, that the workflow
 * still runs the chain, that the chain still reports every step it did not
 * run, and that no step can be marked covered while the credential is absent.
 */
describe('the cross-version workflow runs what the matrices claim', () => {
  it('runs a job for every covered §109 pair', () => {
    const covered = matrix.pairs.filter((pair) => pair.status === 'covered');
    expect(covered.length).toBeGreaterThan(0);
    for (const pair of covered) expect(workflow).toContain(pair.id);
  });

  it('runs the guard that keeps the matrices honest', () => {
    expect(workflow).toContain('node scripts/check-cross-version-matrix.mjs');
    expect(workflow).toContain('node --test scripts/check-cross-version-matrix.test.mjs');
  });

  it('names the pairs it cannot test rather than omitting them', () => {
    const blocked = matrix.pairs.filter((pair) => pair.status === 'blocked');
    expect(blocked.length).toBeGreaterThan(0);
    expect(workflow).toContain('unreleased-pairs');
    expect(workflow).toMatch(/expected to fail/i);
  });

  it('still runs the §110 chain, so its absence is reported and not skipped', () => {
    expect(workflow).toContain('node scripts/run-cross-surface-chain.mjs');
    expect(workflow).toContain(chain.tenant.id);
    expect(workflow).toContain(chain.tenant.token);
  });

  it('leaves every §110 step blocked, because the tenant it needs does not exist', () => {
    expect(chain.tenant.state).toBe('absent');
    expect(chain.steps.filter((step) => step.status === 'covered')).toHaveLength(0);
    expect(chain.steps).toHaveLength(18);
  });
});
