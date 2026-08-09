import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Ledger DOC-024 — enterprise-readiness and security-control claims that the
 * codebase does not support.
 *
 * WHY THIS FILE EXISTS, AND WHY IT IS NOT SCOPED TO A PAGE
 * The trust surface already had a guard (`app/security/__tests__/
 * trust-surface-claims.test.ts`) and it covered four pages: /security, /trust,
 * /status, /sla. Compliance copy does not stay on four pages. It is written
 * wherever a buyer might ask — /enterprise, /dpa, /about, /press, and the next
 * page someone adds — and the defect DOC-024 records is exactly what happens
 * when a claim is cut from the guarded page and survives on an unguarded one.
 *
 * That is not hypothetical. /trust removed an assertion that a SOC 2
 * evidence-collection programme was underway (its own source comment records
 * the removal). The identical claim — "Evidence collection is part of the Cloud
 * release path" — was still shipping on /enterprise afterwards, on a page whose
 * heading reads "We claim only what is complete". Nothing in this repository
 * collects, stores, or tracks audit evidence.
 *
 * So this guard walks EVERY `page.tsx` under `apps/web/app` plus every
 * component under `features/marketing`. A new page inherits the rules the day
 * it is created, which is the only version of this check that closes the class
 * rather than the instance.
 *
 * The same shape held for governance: six pages sold org-wide BYOK enforcement
 * as a control while `packages/contracts/licensing/src/org-policy.ts` says its
 * schema "is not wired into any surface's enforcement path". Those rows are
 * rewritten and asserted below.
 *
 * These tests read the sources as text. That is deliberate, and matches the
 * trust-surface guard: they must fail on the words a future writer types,
 * whether or not the component renders under test.
 *
 * If a rule below fires on legitimate copy, the fix is to state the fact
 * plainly — "not held", "no auditor is engaged" — or to move it to a
 * "what we have not done" section. It is not to widen the pattern.
 */

const WEB_ROOT = path.resolve(__dirname, '..', '..');
const APP_DIR = path.join(WEB_ROOT, 'app');
/**
 * Marketing components are scanned too. Every claim site found today is a
 * `page.tsx`, but the shared hero/ledger/footer components render on those same
 * pages, and a sentence moved into one of them would leave this guard's reach
 * without leaving the user's screen.
 */
const MARKETING_DIR = path.join(WEB_ROOT, 'features', 'marketing');

function collect(dir: string, matches: (entry: string) => boolean, found: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '__tests__' || entry === '.next') continue;
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      collect(full, matches, found);
    } else if (matches(entry)) {
      found.push(full);
    }
  }
  return found;
}

const PAGES = [
  ...collect(APP_DIR, (entry) => entry === 'page.tsx'),
  ...collect(
    MARKETING_DIR,
    (entry) => entry.endsWith('.tsx') && !entry.includes('.test.') && !entry.includes('.spec.'),
  ),
].sort();

/** Route (or component path) for a source file, for readable failure messages. */
function routeOf(file: string): string {
  if (path.basename(file) !== 'page.tsx') return path.relative(WEB_ROOT, file);
  const rel = path.relative(APP_DIR, path.dirname(file));
  return rel === '' ? '/' : `/${rel}`;
}

/**
 * Strip comments before matching. Page comments quote the wording they exist to
 * ban — including this file's own motivating example — so leaving them in would
 * make every rule trip on its own rationale.
 */
function rendered(file: string): string {
  return readFileSync(file, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//gu, '')
    .replace(/^\s*\/\/.*$/gmu, '');
}

/** Words that turn a mention into an explicit disclaimer. */
const NEGATION =
  /\b(no|not|none|never|without|lacks?|absent|unless|neither|nor|removed|remove|cut|would prove|does not exist|deliberately|implying|imply|implies)\b/iu;

/**
 * Certifications and assurances AGI does not hold. A mention is allowed only
 * where the surrounding copy disclaims it.
 */
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

/** Absolute claims no page can make truthfully. No disclaimer rescues these. */
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
  'fully compliant',
] as const;

/**
 * Language that asserts an audit or certification PROGRAMME rather than a
 * certificate. This is the subtler half of DOC-024 and the half that survived
 * the first pass: "we hold no SOC 2" reads as honest right up until the next
 * sentence describes evidence collection, a readiness assessment, or an
 * engaged auditor. None of that exists here, and a procurement reviewer treats
 * a programme claim as a date they can plan around.
 *
 * The certification rule above cannot catch these. Its 420-character window
 * finds the neighbouring "No SOC 2 report exists" and passes the whole row —
 * which is precisely how the /enterprise claim survived. So these phrases are
 * judged on their own SENTENCE: the text between the previous sentence break
 * and the phrase itself must negate it.
 */
const PROGRAMME_PHRASES = [
  'evidence collection',
  'evidence-collection',
  'audit is underway',
  'audit underway',
  'audit is in progress',
  'audit in progress',
  'readiness assessment',
  'soc 2 readiness',
  'working toward soc 2',
  'working towards soc 2',
  'pursuing soc 2',
  'pursuing iso 27001',
  'compliance programme',
  'compliance program',
  'undergoing an audit',
  'audit preparation',
  'auditor is engaged',
  'auditor engaged',
  'certification body is engaged',
  'certification body engaged',
] as const;

/**
 * Governance controls the site sold as available, with no mechanism behind
 * them. `packages/contracts/licensing/src/org-policy.ts` carries the signed
 * org-policy schema — `byok: 'allowed' | 'forbidden' | 'allowlist'`, provider
 * and model allowlists, egress rules — and states in its own header: "this pass
 * ships the schema + verifier + fixtures only. It is not wired into any
 * surface's enforcement path."
 *
 * Six pages nevertheless offered org-wide BYOK enforcement as a control,
 * including "BYOK enforcement today" on /solutions and "Require BYOK org-wide
 * on enterprise contracts. Zero managed-cloud spend unless you opt in." on
 * /use-cases/it-providers. No code path can deliver either sentence. An
 * enforcement claim is judged on its own sentence for the same reason the
 * programme phrases are: the neighbouring "scoped by contract" reads as a
 * disclaimer from four hundred characters away and as a delivery date up close.
 */
const ENFORCEMENT_PHRASES = [
  'byok enforcement',
  'enforce byok',
  'require byok',
  'byok org-wide',
  'org-wide byok',
] as const;

/**
 * The sentence containing `index`.
 *
 * `;` counts as a break, and that is the whole point of narrowing to a
 * sentence: "BYOK enforcement today; identity, audit, and retention scoped by
 * contract" placed the claim and the disclaimer in one line, and the disclaimer
 * governed only the clause after the semicolon. `:` deliberately does NOT
 * break, because a colon introduces an explanation of the same claim.
 */
const SENTENCE_BREAKS = ['.', '!', '?', ';', '\n'] as const;

function sentenceAround(source: string, index: number): string {
  let start = 0;
  let end = source.length;
  for (const boundary of SENTENCE_BREAKS) {
    const before = source.lastIndexOf(boundary, index - 1);
    if (before > start) start = before + 1;
    const after = source.indexOf(boundary, index);
    if (after !== -1 && after < end) end = after;
  }
  return source.slice(start, end);
}

/** Occurrences of `phrase` whose own sentence does not disclaim it. */
function undisclaimed(source: string, phrases: readonly string[], label: string): string[] {
  const lower = source.toLowerCase();
  const offenders: string[] = [];
  for (const phrase of phrases) {
    let index = lower.indexOf(phrase);
    while (index !== -1) {
      const sentence = sentenceAround(source, index);
      if (!NEGATION.test(sentence)) offenders.push(`${label} — "${phrase}" in: ${sentence.trim()}`);
      index = lower.indexOf(phrase, index + phrase.length);
    }
  }
  return offenders;
}

describe('DOC-024 — every route page, certification honesty', () => {
  it('scans the pages that actually carry compliance copy', () => {
    // A guard that silently walks an empty tree is worse than no guard. Pin the
    // known claim sites so a refactor that moves them cannot mute this file.
    const routes = new Set(PAGES.map(routeOf));
    for (const route of [
      '/enterprise',
      '/trust',
      '/security',
      '/dpa',
      '/about',
      '/press',
      '/teams',
      '/solutions',
      '/business',
      '/contact-sales',
      '/use-cases/it-providers',
    ]) {
      expect(routes.has(route), `${route} is no longer covered by this guard`).toBe(true);
    }
    expect(PAGES.length).toBeGreaterThan(50);
  });

  it('claims no certification AGI does not hold', () => {
    const offenders: string[] = [];
    for (const file of PAGES) {
      const source = rendered(file);
      for (const term of CERTIFICATION_TERMS) {
        for (const context of occurrencesInContext(source, term)) {
          if (!NEGATION.test(context))
            offenders.push(`${routeOf(file)} — ${term}: ${context.trim()}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('uses no marketing-grade security superlative', () => {
    const offenders: string[] = [];
    for (const file of PAGES) {
      const lower = rendered(file).toLowerCase();
      for (const phrase of FORBIDDEN_PHRASES) {
        if (lower.includes(phrase)) offenders.push(`${routeOf(file)} — ${phrase}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('asserts no audit or certification programme, which does not exist', () => {
    const offenders = PAGES.flatMap((file) =>
      undisclaimed(rendered(file), PROGRAMME_PHRASES, routeOf(file)),
    );
    expect(offenders).toEqual([]);
  });

  it('offers no org-wide BYOK enforcement, which no surface implements', () => {
    const offenders = PAGES.flatMap((file) =>
      undisclaimed(rendered(file), ENFORCEMENT_PHRASES, routeOf(file)),
    );
    expect(offenders).toEqual([]);
  });
});

describe('DOC-024 — the org-policy schema is still unenforced', () => {
  /**
   * The copy rewritten above is only true while this stays true. If a surface
   * ever does read and enforce a signed org policy, that header changes and
   * this test fails — which is the prompt to put the capability back on the
   * pages, not to delete the assertion.
   */
  it('still declares itself schema-only, so the pages must not promise enforcement', () => {
    const contract = readFileSync(
      path.resolve(
        WEB_ROOT,
        '..',
        '..',
        'packages',
        'contracts',
        'licensing',
        'src',
        'org-policy.ts',
      ),
      'utf8',
    );
    // The header wraps across comment lines, so match on collapsed whitespace.
    const collapsed = contract.replace(/\s*\n\s*\*\s*/gu, ' ');
    expect(collapsed).toContain("It is not wired into any surface's enforcement path");
  });
});

describe('DOC-024 — /enterprise agrees with the dated ledger', () => {
  const ENTERPRISE = path.join(APP_DIR, 'enterprise', 'page.tsx');

  it('states SOC 2 as not held, in the same terms /trust uses', () => {
    const lower = rendered(ENTERPRISE).toLowerCase();
    expect(lower).toContain('no auditor is engaged');
    expect(lower).toContain('no audit is in progress');
  });

  it('does not understate the data-subject-rights paths that shipped', () => {
    // /api/user/export, /api/user/delete-account and the
    // /api/cron/purge-deleted-accounts job all exist, and /trust records them
    // as Implemented. A page that calls the same controls "in progress"
    // disagrees with the ledger just as loudly as one that oversells them.
    const lower = rendered(ENTERPRISE).toLowerCase();
    expect(lower).not.toContain('are being verified');
    expect(lower).toContain('implemented');
    expect(lower).toContain('erasure');
  });
});
