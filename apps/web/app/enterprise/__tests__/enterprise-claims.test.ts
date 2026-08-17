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

describe('/enterprise — control claims stay accurate: shipped controls say so, unbuilt ones do not', () => {
  // AUDIT-FIX (competitive-gap-2026-08-15, G12): this test originally required
  // SSO/SCIM/Audit to read as contract-scoped, not-yet-shipped commitments.
  // That was accurate when written, but apps/web/features/admin/pages/
  // AdminConsolePage.tsx's Identity readiness row has since flipped to
  // "Implemented — entitlement-gated": first-party SSO sign-in and SCIM
  // provisioning are live code paths gated on the `enterprise_controls`
  // billing capability. Calling a shipped, gated control "roadmap" is the
  // same honesty bug this suite exists to catch — it just runs in the other
  // direction — so the assertion below now requires the opposite: these rows
  // must say "implemented" and must NOT regress to roadmap/ask-us framing.
  // Audit is checked separately (below) because
  // services/api-gateway/src/routes/enterprise.ts gates its audit-events
  // routes on organization-admin membership, NOT `enterprise_controls` — a
  // test that demanded the same entitlement wording there would itself be
  // asserting something the code does not do. Retention is unchanged: there
  // is still no per-organization retention control, so that row keeps the
  // original contract-scoped assertion.
  it('states SSO and directory provisioning as implemented and entitlement-gated', () => {
    const source = rendered();
    for (const control of ["k: 'SSO'", "k: 'Directory provisioning'"]) {
      const index = source.indexOf(control);
      expect(index, `${control} row missing`).toBeGreaterThan(-1);
      const context = source.slice(index, index + 420).toLowerCase();
      expect(/implemented/u.test(context), `${control} does not say it is implemented`).toBe(true);
      expect(
        /entitlement|enterprise_controls/u.test(context),
        `${control} does not name its entitlement gate`,
      ).toBe(true);
      expect(
        /roadmap|ask us for current implementation status|scoped and dated in your contract/u.test(
          context,
        ),
        `${control} regressed to roadmap/not-yet-built framing`,
      ).toBe(false);
    }
  });

  it('states audit logging as implemented and gated on org-admin membership, not the SSO entitlement', () => {
    const source = rendered();
    const index = source.indexOf("k: 'Audit'");
    expect(index, "'Audit' row missing").toBeGreaterThan(-1);
    const context = source.slice(index, index + 420).toLowerCase();
    expect(/implemented/u.test(context), 'Audit does not say it is implemented').toBe(true);
    expect(/admin/u.test(context), 'Audit does not name its real (admin-membership) gate').toBe(
      true,
    );
    expect(
      /roadmap|ask us for current implementation status|scoped and dated in your contract/u.test(
        context,
      ),
      'Audit regressed to roadmap/not-yet-built framing',
    ).toBe(false);
  });

  it('keeps retention scoped as a contract commitment, since it is not shipped', () => {
    const source = rendered();
    const index = source.indexOf("k: 'Retention'");
    expect(index, 'Retention row missing').toBeGreaterThan(-1);
    const context = source.slice(index, index + 420).toLowerCase();
    expect(
      /scoped|no per-organization|not a shipped control|commitment/u.test(context),
      'Retention is stated without contract scoping',
    ).toBe(true);
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
