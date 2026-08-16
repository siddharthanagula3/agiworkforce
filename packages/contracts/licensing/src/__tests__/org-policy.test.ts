
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import type { LicenseClaims } from '../claims';
import {
  DEFAULT_POLICY_BASELINE,
  checkPolicyTightening,
  verifyOrgPolicy,
  type PolicyPermissions,
} from '../org-policy';

const fixturesDir = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '__fixtures__',
  'org-policy',
);

interface PolicyManifest {
  licenseClaims: LicenseClaims;
  referenceNowMs: number;
  cases: Array<{
    file: string;
    nowMs: number;
    baseline?: PolicyPermissions;
    expect: { ok: true } | { ok: false; code: string };
    note: string;
  }>;
}

const manifest = JSON.parse(
  readFileSync(join(fixturesDir, 'manifest.json'), 'utf8'),
) as PolicyManifest;

function readFixture(file: string): Uint8Array {
  return new Uint8Array(readFileSync(join(fixturesDir, file)));
}

describe('verifyOrgPolicy — fixture corpus replay', () => {
  it('exercises accept and every error variant', () => {
    const codes = new Set(manifest.cases.map((c) => ('code' in c.expect ? c.expect.code : 'ok')));
    for (const code of [
      'ok',
      'bad_signature',
      'org_mismatch',
      'not_yet_valid',
      'not_tightening',
      'malformed',
    ]) {
      expect(codes.has(code)).toBe(true);
    }
  });

  for (const testCase of manifest.cases) {
    it(`${testCase.file} → ${'code' in testCase.expect ? testCase.expect.code : 'ok'} (${testCase.note})`, () => {
      const result = verifyOrgPolicy(
        readFixture(testCase.file),
        manifest.licenseClaims,
        testCase.nowMs,
        testCase.baseline ? { baseline: testCase.baseline } : {},
      );
      if (testCase.expect.ok) {
        expect(result.ok).toBe(true);
        if (result.ok) expect(result.policy.orgId).toBe(manifest.licenseClaims.orgId);
      } else {
        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.error.code).toBe(testCase.expect.code);
          if (testCase.expect.code === 'not_tightening') {
            expect(result.error.violations && result.error.violations.length).toBeGreaterThan(0);
          }
        }
      }
    });
  }
});

describe('checkPolicyTightening — monotonic rule', () => {
  const permissive: PolicyPermissions = {
    allowedProviders: ['*'],
    allowedModels: ['*'],
    byok: 'allowed',
    egress: { managedCloud: true, byokDomainsAllowlist: ['*'] },
    retentionDays: undefined,
    auditExport: { required: false },
  };

  it('accepts a policy equal to the default baseline', () => {
    expect(checkPolicyTightening(permissive, DEFAULT_POLICY_BASELINE).ok).toBe(true);
  });

  it('accepts a strict tightening of every field', () => {
    const tighter: PolicyPermissions = {
      allowedProviders: ['anthropic'],
      allowedModels: ['local:*'],
      byok: 'forbidden',
      egress: { managedCloud: false, byokDomainsAllowlist: [] },
      retentionDays: 7,
      auditExport: { required: true },
    };
    expect(checkPolicyTightening(tighter, DEFAULT_POLICY_BASELINE).ok).toBe(true);
  });

  const tightBaseline: PolicyPermissions = {
    allowedProviders: ['anthropic'],
    allowedModels: ['local:*'],
    byok: 'forbidden',
    egress: { managedCloud: false, byokDomainsAllowlist: ['corp.example.com'] },
    retentionDays: 30,
    auditExport: { required: true },
  };

  it('rejects re-granting all providers ("*") vs a concrete baseline', () => {
    const r = checkPolicyTightening({ ...tightBaseline, allowedProviders: ['*'] }, tightBaseline);
    expect(r.ok).toBe(false);
    expect(r.violations.some((v) => v.includes('allowedProviders'))).toBe(true);
  });

  it('rejects adding a provider not in the baseline', () => {
    const r = checkPolicyTightening(
      { ...tightBaseline, allowedProviders: ['anthropic', 'openai'] },
      tightBaseline,
    );
    expect(r.ok).toBe(false);
    expect(r.violations.some((v) => v.includes('openai'))).toBe(true);
  });

  it('rejects loosening BYOK', () => {
    const r = checkPolicyTightening({ ...tightBaseline, byok: 'allowed' }, tightBaseline);
    expect(r.ok).toBe(false);
    expect(r.violations.some((v) => v.includes('byok'))).toBe(true);
  });

  it('rejects re-enabling managed-cloud egress', () => {
    const r = checkPolicyTightening(
      {
        ...tightBaseline,
        egress: { managedCloud: true, byokDomainsAllowlist: ['corp.example.com'] },
      },
      tightBaseline,
    );
    expect(r.ok).toBe(false);
    expect(r.violations.some((v) => v.includes('managedCloud'))).toBe(true);
  });

  it('rejects broadening the BYOK domain allowlist', () => {
    const r = checkPolicyTightening(
      {
        ...tightBaseline,
        egress: {
          managedCloud: false,
          byokDomainsAllowlist: ['corp.example.com', 'evil.example.com'],
        },
      },
      tightBaseline,
    );
    expect(r.ok).toBe(false);
    expect(r.violations.some((v) => v.includes('byokDomainsAllowlist'))).toBe(true);
  });

  it('rejects extending retention beyond the baseline', () => {
    const r = checkPolicyTightening({ ...tightBaseline, retentionDays: 90 }, tightBaseline);
    expect(r.ok).toBe(false);
    expect(r.violations.some((v) => v.includes('retentionDays'))).toBe(true);
  });

  it('rejects unbounded retention when the baseline bounds it', () => {
    const r = checkPolicyTightening({ ...tightBaseline, retentionDays: undefined }, tightBaseline);
    expect(r.ok).toBe(false);
    expect(r.violations.some((v) => v.includes('retentionDays'))).toBe(true);
  });

  it('rejects dropping a required audit export', () => {
    const r = checkPolicyTightening(
      { ...tightBaseline, auditExport: { required: false } },
      tightBaseline,
    );
    expect(r.ok).toBe(false);
    expect(r.violations.some((v) => v.includes('auditExport'))).toBe(true);
  });

  it('accepts tightening retention and keeping the audit requirement', () => {
    const r = checkPolicyTightening({ ...tightBaseline, retentionDays: 7 }, tightBaseline);
    expect(r.ok).toBe(true);
  });
});
