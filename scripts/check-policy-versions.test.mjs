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
import {
  archiveExpectations,
  renderManifest,
  runPolicyArchiveCheck,
} from './lib/policy-archive.mjs';

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
    recordedSince: '2026-08-11',
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

const SUBPROCESSORS_PAGE = 'apps/web/app/subprocessors/page.tsx';
const LISTED = ['Alpha', 'Beta Cloud'];
const ADDED = 'Gamma Labs (operated by Delta, Inc.)';

function subprocessorsPage(names) {
  return [
    "import { POLICY_LAST_UPDATED } from '@/lib/legal-constants';",
    '',
    'const SUBS = [',
    ...names.flatMap((name) => [
      '  {',
      `    name: '${name}',`,
      "    purpose: 'Processes the requests you send.',",
      '  },',
    ]),
    '];',
    '',
    'export default function SubprocessorsPage() {',
    '  return <p>Last updated: {POLICY_LAST_UPDATED.subprocessors}.</p>;',
    '}',
    '',
  ].join('\n');
}

function checkSubprocessors({ names, date, versions }) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'policy-versions-subprocessors-'));
  const write = (relative, contents) => {
    fs.mkdirSync(path.dirname(path.join(root, relative)), { recursive: true });
    fs.writeFileSync(path.join(root, relative), contents);
  };
  write(
    CONSTANTS,
    [
      'export const POLICY_LAST_UPDATED = {',
      `  subprocessors: '${date}',`,
      '} as const;',
      '',
      'export const CANONICAL_POLICY_ROUTES = {',
      "  subprocessors: '/subprocessors',",
      '} as const;',
      '',
    ].join('\n'),
  );
  write(SUBPROCESSORS_PAGE, subprocessorsPage(names));
  write(
    REGISTRY,
    JSON.stringify(
      {
        note: 'fixture',
        recordedSince: '2026-09-28',
        documents: { subprocessors: { page: SUBPROCESSORS_PAGE, versions } },
      },
      null,
      2,
    ),
  );
  return runPolicyVersionsCheck(root);
}

const LISTED_VERSION = {
  date: '2026-09-28',
  digest: copyDigest(subprocessorsPage(LISTED)),
  note: 'Baseline recorded for the fixture.',
  subprocessorNames: LISTED,
};

test('passes when the latest version records the subprocessors the page lists', () => {
  assert.deepEqual(
    checkSubprocessors({ names: LISTED, date: '2026-09-28', versions: [LISTED_VERSION] }),
    [],
  );
});

test('fails when a subprocessor is added under a same-date entry that records no names', () => {
  const failures = checkSubprocessors({
    names: [...LISTED, ADDED],
    date: '2026-09-28',
    versions: [
      LISTED_VERSION,
      {
        date: '2026-09-28',
        digest: copyDigest(subprocessorsPage([...LISTED, ADDED])),
        note: 'Adds a row for an existing vendor.',
      },
    ],
  });
  assert.ok(
    failures.some(
      (failure) =>
        failure.includes(SUBPROCESSORS_PAGE) &&
        failure.includes('the registry has not recorded') &&
        failure.includes(`added ${ADDED}`),
    ),
    failures.join('\n'),
  );
});

test('fails when the subprocessor list changes under an entry whose date did not move', () => {
  const failures = checkSubprocessors({
    names: [...LISTED, ADDED],
    date: '2026-09-28',
    versions: [
      LISTED_VERSION,
      {
        date: '2026-09-28',
        digest: copyDigest(subprocessorsPage([...LISTED, ADDED])),
        note: 'Adds a row for an existing vendor.',
        subprocessorNames: [...LISTED, ADDED],
      },
    ],
  });
  assert.ok(
    failures.some((failure) => failure.includes('under an entry whose date did not move')),
    failures.join('\n'),
  );
});

test('accepts a changed list on an entry that moves the date and names the change', () => {
  const failures = checkSubprocessors({
    names: [...LISTED, ADDED],
    date: '2026-10-05',
    versions: [
      LISTED_VERSION,
      {
        date: '2026-10-05',
        digest: copyDigest(subprocessorsPage([...LISTED, ADDED])),
        summary: 'Adds Gamma Labs, which serves inference for the models it hosts.',
        subprocessorNames: [...LISTED, ADDED],
      },
    ],
  });
  assert.deepEqual(failures, []);
});

test('fails when the entry that changes the list does not name what was added or removed', () => {
  const failures = checkSubprocessors({
    names: [LISTED[0], ADDED],
    date: '2026-10-05',
    versions: [
      LISTED_VERSION,
      {
        date: '2026-10-05',
        digest: copyDigest(subprocessorsPage([LISTED[0], ADDED])),
        summary: 'Rewords several rows of the list for clarity.',
        subprocessorNames: [LISTED[0], ADDED],
      },
    ],
  });
  assert.ok(
    failures.some(
      (failure) =>
        failure.includes('summary does not name') &&
        failure.includes('Gamma Labs') &&
        failure.includes('Beta Cloud'),
    ),
    failures.join('\n'),
  );
});

test('fails when no version records the subprocessors the page lists', () => {
  const { subprocessorNames, ...unnamed } = LISTED_VERSION;
  assert.deepEqual(subprocessorNames, LISTED);
  const failures = checkSubprocessors({ names: LISTED, date: '2026-09-28', versions: [unnamed] });
  assert.ok(
    failures.some((failure) => failure.includes('no version records subprocessorNames')),
    failures.join('\n'),
  );
});

test('fails when the registry does not say when version histories began', () => {
  const index = registry();
  delete index.recordedSince;
  const failures = check({ index });
  assert.ok(
    failures.some((failure) => failure.includes('recordedSince')),
    failures.join('\n'),
  );
});

const INTRODUCED_ROUTES = { terms: '/terms', referralTerms: '/referral-terms' };

function introducedRegistry(summary) {
  return {
    recordedSince: '2026-09-21',
    documents: {
      terms: {
        versions: [
          {
            date: '2026-08-11',
            digest: 'a'.repeat(16),
            note: 'Baseline recorded for the fixture.',
          },
        ],
      },
      referralTerms: {
        versions: [
          {
            date: '2026-09-27',
            digest: 'b'.repeat(16),
            note: 'First version of the fixture terms.',
            ...(summary ? { summary } : {}),
          },
        ],
      },
    },
  };
}

test('lists a policy first published after version histories began, and not one that predates them', () => {
  const summary = 'The first version of the fixture referral terms.';
  const policies = archiveExpectations(introducedRegistry(summary), INTRODUCED_ROUTES, () => false);

  assert.deepEqual(Object.keys(policies), ['referralTerms']);
  assert.deepEqual(policies.referralTerms.versions, [
    { date: '2026-09-27', summary, status: 'current' },
  ]);
  assert.equal(JSON.parse(renderManifest(policies, '2026-09-21')).recordedSince, '2026-09-21');
});

test('requires a summary on the first version of a policy published after version histories began', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'policy-archive-'));
  const failures = runPolicyArchiveCheck(root, introducedRegistry(null), INTRODUCED_ROUTES);
  assert.ok(
    failures.some(
      (failure) => failure.includes('"referralTerms" 2026-09-27') && failure.includes('"summary"'),
    ),
    failures.join('\n'),
  );
});

test('the published policy set passes', () => {
  assert.deepEqual(runPolicyVersionsCheck(repoRoot), []);
});
