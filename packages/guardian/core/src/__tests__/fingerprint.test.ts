import { describe, expect, it } from 'vitest';

import { computeFingerprint, normalizeEvidence, normalizePath } from '../fingerprint.js';

describe('fingerprint stability', () => {
  const base = {
    repositoryId: 42,
    ruleId: 'guardian/trust-local-egress-001',
    path: 'apps/desktop/src-tauri/src/router.rs',
    symbol: 'route_request',
    evidence:
      'The error branch at line 108 invokes the managed provider without checking trust_mode.',
  };

  it('is stable when line numbers in evidence change', () => {
    const moved = {
      ...base,
      evidence:
        'The error branch at line 240 invokes the managed provider without checking trust_mode.',
    };
    expect(computeFingerprint(base)).toBe(computeFingerprint(moved));
  });

  it('is stable when commit SHAs appear in evidence', () => {
    const withSha = { ...base, evidence: `${base.evidence} (introduced in deadbeefcafe1234)` };
    const withOtherSha = { ...base, evidence: `${base.evidence} (introduced in 0123456789abcdef)` };
    expect(computeFingerprint(withSha)).toBe(computeFingerprint(withOtherSha));
  });

  it('is stable across path separator and ./ prefix differences', () => {
    expect(
      computeFingerprint({ ...base, path: './apps\\desktop\\src-tauri\\src\\router.rs' }),
    ).toBe(computeFingerprint(base));
  });

  it('differs across rules, paths, and repositories', () => {
    expect(computeFingerprint({ ...base, ruleId: 'other/rule' })).not.toBe(
      computeFingerprint(base),
    );
    expect(computeFingerprint({ ...base, path: 'apps/web/other.ts' })).not.toBe(
      computeFingerprint(base),
    );
    expect(computeFingerprint({ ...base, repositoryId: 43 })).not.toBe(computeFingerprint(base));
  });

  it('normalizeEvidence collapses positions, hashes, and whitespace', () => {
    const a = normalizeEvidence('Error   at src/x.ts:120:4 in commit abcdef1234567');
    const b = normalizeEvidence('error at src/x.ts:99:1 in commit 7654321fedcba');
    expect(a).toBe(b);
  });

  it('normalizePath strips leading ./ and converts backslashes', () => {
    expect(normalizePath('./a/b.ts')).toBe('a/b.ts');
    expect(normalizePath('a\\b\\c.ts')).toBe('a/b/c.ts');
  });
});
