import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Claim guard for /enterprise, the page a security reviewer reads first.
 *
 * The 2026 marketing audit (ledger DOC-024) found enterprise identity,
 * governance and certification controls described as if they shipped. The page
 * was rewritten to scope them as contract commitments, but the rewrite left one
 * hole: a source comment stated "the section carries a visible status date"
 * while the page rendered no date at all, under an eyebrow reading "honest as
 * of today". That is the same defect /trust was rewritten to remove — a claim
 * of datedness with no date behind it — so it is asserted here rather than left
 * to the next reader to notice.
 *
 * These tests read the source as text, matching
 * `app/security/__tests__/trust-surface-claims.test.ts`: they must fail on the
 * words a future writer types, whether or not the component renders under test.
 */

const PAGE = path.join(path.resolve(__dirname, '..'), 'page.tsx');

/**
 * Strip comments before matching. This file's own explanation quotes the copy
 * it bans, and the page's comments quote the shipped-control wording that was
 * cut, so leaving them in would make every rule trip on its own rationale.
 */
function rendered(): string {
  return readFileSync(PAGE, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//gu, '')
    .replace(/^\s*\/\/.*$/gmu, '');
}

describe('/enterprise — dated posture', () => {
  it('declares a review date and renders it', () => {
    const source = rendered();
    const declaration = source.match(/const STATUS_AS_OF = '([^']+)'/u);
    expect(declaration).not.toBeNull();

    const asOf = declaration![1];
    // A constant nothing renders is not a date on the page. Both the control
    // ledger and the compliance ledger must carry it.
    const interpolations = source.match(/\$\{STATUS_AS_OF\}/gu) ?? [];
    expect(interpolations.length).toBeGreaterThanOrEqual(2);
    expect(asOf).toMatch(/\d{4}/u);
  });

  it('never says "as of today", which is a date that ages into a lie', () => {
    expect(rendered().toLowerCase()).not.toContain('as of today');
  });
});

describe('/enterprise — control claims stay scoped, not shipped', () => {
  it('scopes SSO, SCIM, audit and retention as contract commitments', () => {
    const source = rendered();
    // Each control row must sit next to language that says it is scoped on a
    // contract or not shipped, rather than offered as an available toggle.
    for (const control of ['SSO', 'SCIM', 'Audit', 'Retention']) {
      const index = source.indexOf(control);
      expect(index, `${control} row missing`).toBeGreaterThan(-1);
      const context = source.slice(index, index + 420).toLowerCase();
      expect(
        /scoped|no per-organization|not a shipped control|commitment/u.test(context),
        `${control} is stated without contract scoping`,
      ).toBe(true);
    }
  });

  it('claims no certification it does not hold', () => {
    const source = rendered();
    for (const term of ['SOC 2', 'ISO 27001', 'HIPAA']) {
      const index = source.indexOf(term);
      expect(index, `${term} row missing`).toBeGreaterThan(-1);
      const context = source.slice(index, index + 200).toLowerCase();
      expect(
        /planned|roadmap|not available|no audit report|not held/u.test(context),
        `${term} is claimed affirmatively`,
      ).toBe(true);
    }
  });

  it('promises no data residency or region pinning, which does not exist', () => {
    const lower = rendered().toLowerCase();
    expect(lower).not.toContain('residency');
    expect(lower).not.toContain('custom regions');
  });
});
