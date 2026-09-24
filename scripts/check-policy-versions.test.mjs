import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  CONSTANTS,
  REGISTRY,
  copyDigest,
  publishedCopy,
  runPolicyVersionsCheck,
} from './check-policy-versions.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TERMS_PAGE = 'apps/web/app/terms/page.tsx';
const INDEX_PAGE = 'apps/web/app/legal/page.tsx';

function constants({ termsDate = '2026-08-11', extraDate = '' } = {}) {
  return [
    'export const POLICY_LAST_UPDATED = {',
    `  terms: '${termsDate}',`,
    extraDate,
    '} as const;',
    '',
    'export const CANONICAL_POLICY_ROUTES = {',
    "  terms: '/terms',",
    "  legalIndex: '/legal',",
    '} as const;',
    '',
  ].join('\n');
}

function termsPage(body = 'You may cancel at any time from Settings.') {
  return [
    "import { POLICY_LAST_UPDATED } from '@/lib/legal-constants';",
    '',
    'export default function TermsPage() {',
    '  return (',
    '    <main className="agi-ds-page">',
    `      <p>${body}</p>`,
    '      <p>Last updated: {POLICY_LAST_UPDATED.terms}.</p>',
    '    </main>',
    '  );',
    '}',
    '',
  ].join('\n');
}

const INDEX_SOURCE =
  'export default function Legal() {\n  return <p>Every legal document we publish.</p>;\n}\n';

function registry(
  versions = [
    {
      date: '2026-08-11',
      digest: copyDigest(termsPage()),
      note: 'Baseline recorded for the fixture.',
    },
  ],
) {
  return {
    note: 'fixture',
    documents: {
      terms: { page: TERMS_PAGE, versions },
      legalIndex: {
        page: INDEX_PAGE,
        versions: [
          {
            date: null,
            digest: copyDigest(INDEX_SOURCE),
            note: 'The index prints no date of its own.',
          },
        ],
      },
    },
  };
}

function check({ constantsSource = constants(), page = termsPage(), index = registry() } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'policy-versions-'));
  const write = (relative, contents) => {
    fs.mkdirSync(path.dirname(path.join(root, relative)), { recursive: true });
    fs.writeFileSync(path.join(root, relative), contents);
  };
  write(CONSTANTS, constantsSource);
  write(TERMS_PAGE, page);
  write(INDEX_PAGE, INDEX_SOURCE);
  write(REGISTRY, JSON.stringify(index, null, 2));
  return runPolicyVersionsCheck(root);
}

test('passes when every page matches its latest version and prints its date', () => {
  assert.deepEqual(check(), []);
});

test('reads prose and ignores class names, comments and formatting', () => {
  const reflowed = termsPage('You may cancel at any time\n        from Settings.').replace(
    'className="agi-ds-page"',
    'className="agi-ds-page agi-ds-page--wide"',
  );
  assert.equal(copyDigest(reflowed), copyDigest(termsPage()));
  assert.match(publishedCopy(termsPage()), /You may cancel at any time from Settings\./);
  assert.doesNotMatch(publishedCopy(termsPage()), /agi-ds-page/);
});

test('detects a change in JSX prose containing a semicolon', () => {
  const original = termsPage('Your provider handles this content; we do not retain it.');
  const changed = termsPage('Your provider handles this content; we retain it.');
  assert.match(publishedCopy(original), /we do not retain it/);
  assert.notEqual(copyDigest(original), copyDigest(changed));
});

test('fails when the published text changes and no version records it', () => {
  const failures = check({ page: termsPage('We may cancel your account at any time.') });
  assert.ok(
    failures.some((failure) =>
      failure.includes('the published text changed since its last recorded version'),
    ),
  );
});

test('fails when the date moves without a version for it', () => {
  const failures = check({ constantsSource: constants({ termsDate: '2026-09-21' }) });
  assert.ok(failures.some((failure) => failure.includes('the latest version is dated 2026-08-11')));
});

test('accepts a new dated version, and an editorial one only with a note', () => {
  const changed = termsPage('We may cancel your account at any time.');
  const dated = registry([
    {
      date: '2026-08-11',
      digest: copyDigest(termsPage()),
      note: 'Baseline recorded for the fixture.',
    },
    { date: '2026-09-21', digest: copyDigest(changed) },
  ]);
  assert.deepEqual(
    check({ constantsSource: constants({ termsDate: '2026-09-21' }), page: changed, index: dated }),
    [],
  );

  const editorial = registry([
    {
      date: '2026-08-11',
      digest: copyDigest(termsPage()),
      note: 'Baseline recorded for the fixture.',
    },
    { date: '2026-08-11', digest: copyDigest(changed) },
  ]);
  const failures = check({ page: changed, index: editorial });
  assert.ok(
    failures.some((failure) => failure.includes('needs a note saying why the change is editorial')),
  );
});

test('refuses a version dated before the one it follows', () => {
  const index = registry([
    {
      date: '2026-08-11',
      digest: copyDigest(termsPage()),
      note: 'Baseline recorded for the fixture.',
    },
    {
      date: '2026-07-01',
      digest: copyDigest(termsPage()),
      note: 'A backdated entry for the fixture.',
    },
  ]);
  const failures = check({ index });
  assert.ok(failures.some((failure) => failure.includes('before the version it follows')));
});

test('fails on a canonical route with no recorded version', () => {
  const index = registry();
  delete index.documents.legalIndex;
  const failures = check({ index });
  assert.ok(
    failures.some((failure) =>
      failure.includes('/legal is a canonical policy route with no recorded version'),
    ),
  );
});

test('fails when a dated page does not print its own date', () => {
  const failures = check({
    page: termsPage().replace('POLICY_LAST_UPDATED.terms', "'2026-08-11'"),
  });
  assert.ok(
    failures.some((failure) => failure.includes('does not print POLICY_LAST_UPDATED.terms')),
  );
});

test('fails on a date that belongs to no canonical route', () => {
  const failures = check({ constantsSource: constants({ extraDate: "  retired: '2026-01-01'," }) });
  assert.ok(
    failures.some((failure) =>
      failure.includes('POLICY_LAST_UPDATED.retired dates no canonical route'),
    ),
  );
});

test('the published policy set passes', () => {
  assert.deepEqual(runPolicyVersionsCheck(repoRoot), []);
});
