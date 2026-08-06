import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Guard rails for the trust surface: /security, /trust, /status, /sla.
 *
 * WHY THIS FILE EXISTS
 * The 2026 marketing audit found the site asserting things the code
 * contradicted, and the recurring mechanism was not deliberate exaggeration —
 * it was two habits:
 *
 *   1. Certification-adjacent language ("SOC 2", "ISO 27001", "HIPAA
 *      compliant", "penetration tested") drifting onto a page for a product
 *      that holds none of those. AGI has no SOC 2 report, no ISO 27001
 *      certificate, and no third-party penetration test.
 *   2. Unfalsifiable hedges ("is designed to", "where available", "where
 *      enabled", "should not be able to") standing in for a control. A
 *      reviewer can neither verify nor disprove them, so real drift hides
 *      inside them — which is exactly how an advertised audit trail survived
 *      over a table nothing wrote to.
 *
 * These tests read the page sources as text. That is deliberate: they must fail
 * on the words a future writer types, whether or not the component renders in a
 * test environment.
 *
 * If a check below fires on legitimate copy, the fix is to state the control
 * concretely or move it to the "what we have not done" section — not to widen
 * the pattern.
 */

const APP_DIR = path.resolve(__dirname, '..', '..');

const PAGES = {
  security: path.join(APP_DIR, 'security', 'page.tsx'),
  trust: path.join(APP_DIR, 'trust', 'page.tsx'),
  status: path.join(APP_DIR, 'status', 'page.tsx'),
  sla: path.join(APP_DIR, 'sla', 'page.tsx'),
} as const;

type PageName = keyof typeof PAGES;

function read(page: PageName): string {
  return readFileSync(PAGES[page], 'utf8');
}

/**
 * Strip comments before matching. The doc comments on these pages quote the
 * exact hedges and certification words they are banning, so leaving them in
 * would make every rule trip on its own explanation.
 */
function rendered(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//gu, '').replace(/^\s*\/\/.*$/gmu, '');
}

/**
 * Context around each occurrence of `term`, so a mention can be judged against
 * the copy surrounding it rather than the line it happens to sit on. A ledger
 * row puts the term in `item:` and the disclaimer in the adjacent field, and
 * both belong to the same claim.
 */
const CONTEXT_RADIUS = 420;

function occurrencesInContext(source: string, term: string): string[] {
  const haystack = source.toLowerCase();
  const needle = term.toLowerCase();
  const windows: string[] = [];
  let index = haystack.indexOf(needle);
  while (index !== -1) {
    windows.push(
      source.slice(Math.max(0, index - CONTEXT_RADIUS), index + needle.length + CONTEXT_RADIUS),
    );
    index = haystack.indexOf(needle, index + needle.length);
  }
  return windows;
}

/** Words that turn a certification mention into an explicit disclaimer. */
const NEGATION =
  /\b(no|not|none|never|without|lacks?|absent|unless|neither|nor|would prove|does not exist|deliberately|implying|imply|implies)\b/iu;

/** Certification and assurance terms that must never be claimed affirmatively. */
const CERTIFICATION_TERMS = [
  'SOC 2',
  'SOC2',
  'ISO 27001',
  'ISO27001',
  'HIPAA',
  'FedRAMP',
  'PCI DSS',
  'penetration test',
  'pen test',
  'pentest',
  'bug bounty',
] as const;

/**
 * Hedges that describe an intention rather than a deployed control. Each of
 * these appeared verbatim on the pre-2026-08 trust surface.
 */
const UNFALSIFIABLE_HEDGES = [
  'is designed to',
  'are designed to',
  'designed to be',
  'where available',
  'where enabled',
  'should not be able',
  'must keep',
  'is expected to',
  'are expected to',
] as const;

/** Absolute claims about certifications we could not make truthfully. */
const FORBIDDEN_PHRASES = [
  'soc 2 certified',
  'soc 2 compliant',
  'iso 27001 certified',
  'iso 27001 compliant',
  'hipaa compliant',
  'hipaa-compliant',
  'penetration tested',
  'independently audited',
  'third-party audited',
  'bank-grade',
  'military-grade',
  'enterprise-grade security',
] as const;

describe('trust surface — certification honesty', () => {
  for (const page of Object.keys(PAGES) as PageName[]) {
    it(`/${page} never claims a certification it does not hold`, () => {
      const source = rendered(read(page));
      const offenders: string[] = [];
      for (const term of CERTIFICATION_TERMS) {
        for (const context of occurrencesInContext(source, term)) {
          // A mention is allowed only inside copy that disclaims it.
          if (!NEGATION.test(context)) offenders.push(`${term}: ${context.trim()}`);
        }
      }
      expect(offenders).toEqual([]);
    });

    it(`/${page} contains no marketing-grade security superlatives`, () => {
      const lower = rendered(read(page)).toLowerCase();
      const hits = FORBIDDEN_PHRASES.filter((phrase) => lower.includes(phrase));
      expect(hits).toEqual([]);
    });
  }
});

describe('trust surface — falsifiable statements', () => {
  for (const page of Object.keys(PAGES) as PageName[]) {
    it(`/${page} states controls instead of hedging them`, () => {
      const source = rendered(read(page)).toLowerCase();
      const hits = UNFALSIFIABLE_HEDGES.filter((hedge) => source.includes(hedge));
      expect(hits).toEqual([]);
    });
  }
});

describe('trust surface — the honest-gap sections stay present', () => {
  it('/security keeps a "what we have not done" section', () => {
    const source = read('security');
    expect(source).toContain('id="not-done"');
    expect(source.toLowerCase()).toContain('what we have not done');
  });

  it('/security names the absent assurances explicitly', () => {
    const lower = read('security').toLowerCase();
    expect(lower).toContain('no soc 2');
    expect(lower).toContain('not certified');
    expect(lower).toContain('no third-party penetration test has been performed');
  });

  it('/security publishes a coordinated-disclosure process, not just an address', () => {
    const source = read('security');
    expect(source).toContain('id="report"');
    expect(source).toContain('mailto:contact@agiworkforce.com');
    const lower = source.toLowerCase();
    expect(lower).toContain('safe harbour');
    expect(lower).toContain('in scope');
    expect(lower).toContain('out of scope');
  });

  it('/security records the real row-level-security coverage rather than generalising', () => {
    // 22 of 170 hosted API route files obtain a user-scoped (RLS-bound) handle;
    // the rest enforce ownership in application code. Rounding this up is the
    // specific defect the audit caught, so the number stays on the page.
    expect(read('security')).toContain('22 of 170');
  });

  it('/trust carries dates, which is what its headline promises', () => {
    const source = read('trust');
    expect(source).toContain('LAST_REVIEWED');
    expect(source).toContain('NEXT_REVIEW');
    // Every ledger row carries its own as-of date.
    expect(source.match(/asOf: '\d{4}-\d{2}-\d{2}'/gu)?.length ?? 0).toBeGreaterThan(10);
  });

  it('/sla does not promise a named human or a contractual commitment', () => {
    const lower = rendered(read('sla')).toLowerCase();
    expect(lower).not.toContain('named support contact');
    expect(lower).toContain('not a binding commitment');
  });

  it('/status describes its own check mechanism correctly', () => {
    const lower = read('status').toLowerCase();
    // The page calls runHealthChecks() in-process precisely to avoid a
    // Host-header SSRF; claiming it fetches its own endpoint was false.
    expect(lower).toContain('in-process');
    expect(lower).not.toContain('call to our health endpoint');
    // And it must disclose what the three-check signal does not cover.
    expect(lower).toContain('not covered');
  });
});

describe('trust surface — pages reference each other', () => {
  const EXPECTED_LINKS: Record<PageName, string[]> = {
    security: ['/trust', '/status', '/sla', '/privacy', '/subprocessors', '/dpa'],
    trust: ['/security', '/status', '/sla', '/privacy', '/subprocessors', '/dpa'],
    status: ['/security', '/sla'],
    sla: ['/security', '/trust', '/status'],
  };

  for (const page of Object.keys(PAGES) as PageName[]) {
    it(`/${page} links to the rest of the surface`, () => {
      const source = read(page);
      for (const href of EXPECTED_LINKS[page]) {
        expect(source).toContain(`"${href}"`);
      }
    });
  }
});

describe('trust surface — managed cloud maturity is stated', () => {
  for (const page of ['security', 'trust', 'status', 'sla'] as PageName[]) {
    it(`/${page} calls Managed Cloud a public alpha`, () => {
      expect(read(page).toLowerCase()).toContain('public alpha');
    });
  }
});
