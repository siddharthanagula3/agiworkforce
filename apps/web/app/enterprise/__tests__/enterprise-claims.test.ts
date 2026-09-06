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
 * of today". That is the same defect /trust was rewritten to remove, a claim
 * of datedness with no date behind it, so it is asserted here rather than left
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

describe('/enterprise, dated posture', () => {
  it('declares a review date and renders it', () => {
    const source = rendered();
    const declaration = source.match(/const STATUS_AS_OF = '([^']+)'/u);
    expect(declaration).not.toBeNull();

    const asOf = declaration![1];
    // A constant nothing renders is not a date on the page. Both the control
    // section and the compliance ledger must carry it, as a JSX expression or
    // inside a template literal.
    const interpolations = source.match(/\$?\{STATUS_AS_OF\}/gu) ?? [];
    expect(interpolations.length).toBeGreaterThanOrEqual(2);
    expect(asOf).toMatch(/\d{4}/u);
  });

  it('never says "as of today", which is a date that ages into a lie', () => {
    expect(rendered().toLowerCase()).not.toContain('as of today');
  });
});

/**
 * The contract-coverage section: the intro that states the build status and
 * the entitlement gate for every control block under it, through the control
 * blocks themselves, stopping before the contract-terms ledger.
 */
function contractSection(): string {
  const source = rendered();
  const start = source.indexOf('id="contract-coverage"');
  const end = source.indexOf('caption="Contract terms"');
  expect(start, 'contract coverage section missing').toBeGreaterThan(-1);
  expect(end, 'contract terms ledger missing').toBeGreaterThan(start);
  return source.slice(start, end);
}

/**
 * One control block inside the contract-coverage section, found by its eyebrow
 * and read up to the next block, lower-cased for matching.
 */
function controlBlock(eyebrow: string): string {
  const section = contractSection();
  const anchor = `eyebrow="${eyebrow}"`;
  const start = section.indexOf(anchor);
  expect(start, `${eyebrow} control block missing`).toBeGreaterThan(-1);
  const rest = section.slice(start + anchor.length);
  const next = rest.search(/<SplitFeature|<Ledger/u);
  return (next === -1 ? rest : rest.slice(0, next)).toLowerCase();
}

const ROADMAP_FRAMING =
  /roadmap|ask us for current implementation status|scoped and dated in your contract/u;

describe('/enterprise, control claims stay accurate: shipped controls say so, unbuilt ones do not', () => {
  // These blocks must match shipped code. SSO and SCIM are implemented and
  // gated on the `enterprise_controls` entitlement, so the section that
  // introduces them must read "implemented" and name the gate, and forbid
  // roadmap/ask-us framing, underclaiming a shipped, gated control is the same
  // honesty bug as overclaiming one. Audit is checked separately below, and
  // retention keeps its opt-in assertion.
  it('states SSO and directory provisioning as implemented and entitlement-gated', () => {
    const section = contractSection().toLowerCase();
    const identity = controlBlock('Identity');
    expect(/sso|single sign-on/u.test(identity), 'Identity block does not name SSO').toBe(true);
    expect(
      /directory provisioning|scim/u.test(identity),
      'Identity block does not name directory provisioning',
    ).toBe(true);
    expect(
      /implemented/u.test(section),
      'the contract section does not say its controls are implemented',
    ).toBe(true);
    expect(
      /entitlement|enterprise_controls/u.test(section),
      'the contract section does not name its entitlement gate',
    ).toBe(true);
    expect(
      ROADMAP_FRAMING.test(section),
      'the contract section regressed to roadmap/not-yet-built framing',
    ).toBe(false);
  });

  it('states audit logging as implemented and gated on org-admin membership, not the SSO entitlement', () => {
    const section = contractSection().toLowerCase();
    const audit = controlBlock('Audit');
    expect(/implemented/u.test(section), 'Audit does not say it is implemented').toBe(true);
    expect(/admin/u.test(audit), 'Audit does not name its real (admin-membership) gate').toBe(true);
    expect(ROADMAP_FRAMING.test(audit), 'Audit regressed to roadmap/not-yet-built framing').toBe(
      false,
    );
  });

  it('describes retention as the opt-in control it actually is', () => {
    // Retention shipped in 0138, so contract-scoping language would now
    // UNDERclaim it. The risk moved rather than disappeared: the failure to
    // guard against is implying that setting a window deletes anything. It
    // does not until an owner switches enforcement on, and the earlier
    // "org-level retention windows, you set them" phrasing is exactly the
    // overclaim that got this block rewritten the first time.
    const context = controlBlock('Policy and retention');

    expect(
      /until enforcement is on|recorded position|whether it is enforced/u.test(context),
      'Retention does not say the window is inert until enforcement is switched on',
    ).toBe(true);
    expect(
      /nothing is deleted/u.test(context),
      'Retention does not state that nothing is deleted before enforcement',
    ).toBe(true);
    expect(
      /legal hold/u.test(context),
      'Retention does not mention that legal holds suspend it',
    ).toBe(true);
  });

  it('does not promise deletion the sweep would refuse to perform', () => {
    // The sweep fails closed: if the hold set cannot be read it deletes
    // nothing. A page that promises unconditional nightly deletion would be
    // describing behaviour the code deliberately does not have.
    const source = rendered().toLowerCase();
    expect(
      /retention windows\. you set them/u.test(source),
      'Retention regressed to the unconditional "you set them" claim',
    ).toBe(false);
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
