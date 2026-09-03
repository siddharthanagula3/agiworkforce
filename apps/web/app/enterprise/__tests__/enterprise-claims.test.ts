import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

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
    // ledger and the compliance ledger must carry it.
    const interpolations = source.match(/\$\{STATUS_AS_OF\}/gu) ?? [];
    expect(interpolations.length).toBeGreaterThanOrEqual(2);
    expect(asOf).toMatch(/\d{4}/u);
  });

  it('never says "as of today", which is a date that ages into a lie', () => {
    expect(rendered().toLowerCase()).not.toContain('as of today');
  });
});

describe('/enterprise, control claims stay accurate: shipped controls say so, unbuilt ones do not', () => {
  it('states SSO and directory provisioning as implemented and entitlement-gated', () => {
    const source = rendered();
    for (const control of ["label: 'SSO'", "label: 'Directory provisioning'"]) {
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
    const index = source.indexOf("label: 'Audit'");
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

  it('describes retention as the opt-in control it actually is', () => {
    // Retention shipped in 0138, so contract-scoping language would now
    // UNDERclaim it. The risk moved rather than disappeared: the failure to
    // guard against is implying that setting a window deletes anything. It
    // does not until an owner switches enforcement on, and the earlier
    // "org-level retention windows, you set them" phrasing is exactly the
    // overclaim that got this row rewritten the first time.
    const source = rendered();
    const index = source.indexOf("label: 'Retention'");
    expect(index, 'Retention row missing').toBeGreaterThan(-1);
    const context = source.slice(index, index + 900).toLowerCase();

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
