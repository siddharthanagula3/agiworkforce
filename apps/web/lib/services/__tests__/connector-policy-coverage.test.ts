import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Connector governance is enforced where the tool catalog is assembled, which
 * is the single path chat, scheduled tasks, and cloud agent runs all share.
 *
 * Enforcing per caller instead would mean a connector blocked in chat that a
 * scheduled task can still reach — a rule that holds in one place and not
 * another is not a control. This reads the source so that property cannot be
 * quietly undone.
 */
const LOADER = 'lib/user-connector-tools.ts';

function source(): string {
  return readFileSync(join(process.cwd(), LOADER), 'utf8');
}

describe('connector policy covers the shared tool catalog', () => {
  it('the shared loader applies the workspace policy', () => {
    expect(source()).toContain('applyConnectorPolicy(');
  });

  it('filters the catalog rather than only marking it', () => {
    // A tool the model is never told about cannot be called; a tool that is
    // offered with a flag on it can.
    const text = source();
    const helper = text.slice(text.indexOf('async function applyConnectorPolicy'));
    expect(helper.slice(0, 2000)).toMatch(/defs\.filter\(/);
  });

  it('applies the policy before the per-turn tool denial, not after', () => {
    // The per-turn hook is a caller's own restriction. The workspace policy is
    // the administrator's and has to bound what a caller can widen.
    const text = source();
    expect(text.indexOf('applyConnectorPolicy(')).toBeLessThan(
      text.indexOf('const isToolDenied = options.isToolDenied'),
    );
  });

  it('tells a custom connector from a catalog one', () => {
    // They are different risks and the policy governs them separately, so the
    // loader has to know which is which.
    expect(source()).toContain('customServerIds');
  });

  it('leaves the catalog alone for a personal-scope caller', () => {
    const text = source();
    const helper = text.slice(text.indexOf('async function applyConnectorPolicy'));
    expect(helper.slice(0, 800)).toMatch(/if \(!organizationId[^)]*\) return defs;/);
  });
});
