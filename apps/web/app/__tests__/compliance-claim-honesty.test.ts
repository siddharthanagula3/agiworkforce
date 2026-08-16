import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const WEB_ROOT = path.resolve(__dirname, '..', '..');
const APP_DIR = path.join(WEB_ROOT, 'app');
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

function routeOf(file: string): string {
  if (path.basename(file) !== 'page.tsx') return path.relative(WEB_ROOT, file);
  const rel = path.relative(APP_DIR, path.dirname(file));
  return rel === '' ? '/' : `/${rel}`;
}

function rendered(file: string): string {
  return readFileSync(file, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//gu, '')
    .replace(/^\s*\/\/.*$/gmu, '');
}

const NEGATION =
  /\b(no|not|none|never|without|lacks?|absent|unless|neither|nor|removed|remove|cut|would prove|does not exist|deliberately|implying|imply|implies)\b/iu;

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

const ENFORCEMENT_PHRASES = [
  'byok enforcement',
  'enforce byok',
  'require byok',
  'byok org-wide',
  'org-wide byok',
] as const;

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
    const lower = rendered(ENTERPRISE).toLowerCase();
    expect(lower).not.toContain('are being verified');
    expect(lower).toContain('implemented');
    expect(lower).toContain('erasure');
  });
});
