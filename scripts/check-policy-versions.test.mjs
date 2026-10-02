import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  CONSTANTS,
  PROVIDER_CATALOG,
  REGISTRY,
  copyDigest,
  publishedCopy,
  readConstantObject,
  readPublications,
  runPolicyArchiveSourceCheck,
  runPolicyVersionsCheck,
} from './check-policy-versions.mjs';
import { REGISTRY as MODEL_REGISTRY } from './check-subprocessor-coverage.mjs';
import {
  archiveExpectations,
  archiveFile,
  byArchivePreference,
  publicationStanding,
  renderManifest,
  runPolicyArchiveCheck,
} from './lib/policy-archive.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fixtureRoots = [];

after(() => {
  for (const root of fixtureRoots) fs.rmSync(root, { recursive: true, force: true });
});

function fixtureRoot(prefix) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  fixtureRoots.push(root);
  return root;
}
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
  const root = fixtureRoot('policy-versions-');
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
const PROVIDERS = ['alpha', 'beta', 'beta_anthropic'];

function subprocessorsPage(names, providers = PROVIDERS) {
  return [
    "import { POLICY_LAST_UPDATED } from '@/lib/legal-constants';",
    '',
    'const SUBS = [',
    ...names.flatMap((name, index) => {
      const ids = index === 0 ? providers : [];
      return [
        '  {',
        `    name: '${name}',`,
        index === 0
          ? `    purpose: 'Serves the models of ${ids.join(' and ')}.',`
          : "    purpose: 'Processes the requests you send.',",
        `    registryProviderIds: [${ids.map((id) => `'${id}'`).join(', ')}],`,
        '  },',
      ];
    }),
    '];',
    '',
    'export default function SubprocessorsPage() {',
    '  return <p>Last updated: {POLICY_LAST_UPDATED.subprocessors}.</p>;',
    '}',
    '',
  ].join('\n');
}

function checkSubprocessors({
  names,
  providers = PROVIDERS,
  date,
  versions,
  labels = {},
  gateways = {},
}) {
  const root = fixtureRoot('policy-versions-subprocessors-');
  const write = (relative, contents) => {
    fs.mkdirSync(path.dirname(path.join(root, relative)), { recursive: true });
    fs.writeFileSync(path.join(root, relative), contents);
  };
  if (labels !== null) {
    write(
      PROVIDER_CATALOG,
      JSON.stringify({
        providers: Object.fromEntries(Object.entries(labels).map(([id, label]) => [id, { label }])),
      }),
    );
  }
  write(
    MODEL_REGISTRY,
    JSON.stringify({
      gateways: Object.fromEntries(
        Object.entries(gateways).map(([id, displayName]) => [id, { id, displayName }]),
      ),
    }),
  );
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
  write(SUBPROCESSORS_PAGE, subprocessorsPage(names, providers));
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
  subprocessorProviders: ['alpha', 'beta'],
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

test('does not count a subprocessor name that only appears inside a longer word as naming it', () => {
  const names = [...LISTED, 'Expo'];
  const moved = (summary) =>
    checkSubprocessors({
      names,
      date: '2026-10-05',
      versions: [
        LISTED_VERSION,
        {
          date: '2026-10-05',
          digest: copyDigest(subprocessorsPage(names)),
          summary,
          subprocessorNames: names,
        },
      ],
    });

  assert.ok(
    moved('Exposes the region each row processes in.').some((failure) =>
      failure.includes('the summary does not name Expo'),
    ),
  );
  assert.deepEqual(moved('Adds Expo, which delivers push notifications to the mobile app.'), []);
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

test('fails when a provider is added inside an existing row and no version records it', () => {
  const providers = [...PROVIDERS, 'gamma'];
  const failures = checkSubprocessors({
    names: LISTED,
    providers,
    date: '2026-09-28',
    versions: [
      LISTED_VERSION,
      {
        date: '2026-09-28',
        digest: copyDigest(subprocessorsPage(LISTED, providers)),
        note: 'Names Gamma among the model providers; wording only, date stays.',
      },
    ],
  });
  assert.ok(
    failures.some(
      (failure) =>
        failure.includes(SUBPROCESSORS_PAGE) &&
        failure.includes('the registry has not recorded') &&
        failure.includes('added gamma'),
    ),
    failures.join('\n'),
  );
});

test('fails when a provider added inside a row is recorded under an entry whose date did not move', () => {
  const providers = [...PROVIDERS, 'gamma'];
  const failures = checkSubprocessors({
    names: LISTED,
    providers,
    date: '2026-09-28',
    versions: [
      LISTED_VERSION,
      {
        date: '2026-09-28',
        digest: copyDigest(subprocessorsPage(LISTED, providers)),
        note: 'Names Gamma among the model providers; wording only, date stays.',
        subprocessorProviders: ['alpha', 'beta', 'gamma'],
      },
    ],
  });
  assert.ok(
    failures.some(
      (failure) =>
        failure.includes('providers the subprocessor list names changed (added gamma)') &&
        failure.includes('under an entry whose date did not move'),
    ),
    failures.join('\n'),
  );
});

test('holds a provider added inside a row to a dated entry whose summary names it', () => {
  const providers = [...PROVIDERS, 'gamma', 'gamma_anthropic'];
  const moved = (summary) =>
    checkSubprocessors({
      names: LISTED,
      providers,
      date: '2026-10-05',
      versions: [
        LISTED_VERSION,
        {
          date: '2026-10-05',
          digest: copyDigest(subprocessorsPage(LISTED, providers)),
          summary,
          subprocessorProviders: ['alpha', 'beta', 'gamma'],
        },
      ],
    });

  assert.ok(
    moved('Rewords the model provider row for clarity.').some((failure) =>
      failure.includes('the summary does not name gamma, which this version added gamma'),
    ),
  );
  assert.deepEqual(moved('Gamma now serves Managed Cloud chat for the models it hosts.'), []);
});

test('counts the label the product shows for a provider as naming it', () => {
  const moved = (added, summary) => {
    const providers = [...PROVIDERS, added];
    return checkSubprocessors({
      names: LISTED,
      providers,
      date: '2026-10-05',
      labels: { vercel_gateway: 'Vercel AI Gateway' },
      gateways: { dr_relay: 'Delta Relay' },
      versions: [
        LISTED_VERSION,
        {
          date: '2026-10-05',
          digest: copyDigest(subprocessorsPage(LISTED, providers)),
          summary,
          subprocessorProviders: ['alpha', 'beta', added],
        },
      ],
    });
  };

  assert.deepEqual(
    moved('vercel_gateway', 'Vercel now also serves Managed Cloud chat through Vercel AI Gateway.'),
    [],
  );
  assert.deepEqual(moved('vercel_gateway', 'The vercel_gateway route now serves chat.'), []);
  assert.ok(
    moved('vercel_gateway', 'Vercel now also serves Managed Cloud chat.').some((failure) =>
      failure.includes('the summary does not name vercel_gateway'),
    ),
  );
  assert.deepEqual(moved('dr_relay', 'Delta Relay now serves Managed Cloud chat.'), []);
});

test('does not count a provider id that only appears inside a longer word as naming it', () => {
  const providers = [...PROVIDERS, 'meta'];
  const moved = (summary) =>
    checkSubprocessors({
      names: LISTED,
      providers,
      date: '2026-10-05',
      versions: [
        LISTED_VERSION,
        {
          date: '2026-10-05',
          digest: copyDigest(subprocessorsPage(LISTED, providers)),
          summary,
          subprocessorProviders: ['alpha', 'beta', 'meta'],
        },
      ],
    });

  assert.ok(
    moved('Pictures now lose their metadata before they are sent.').some((failure) =>
      failure.includes('the summary does not name meta'),
    ),
  );
  assert.deepEqual(moved("Meta's open models now serve Managed Cloud chat."), []);
});

test('fails when the provider labels cannot be read', () => {
  const failures = checkSubprocessors({
    names: LISTED,
    date: '2026-09-28',
    versions: [LISTED_VERSION],
    labels: null,
  });
  assert.ok(
    failures.some(
      (failure) => failure.includes(PROVIDER_CATALOG) && failure.includes('could not be read'),
    ),
    failures.join('\n'),
  );
});

test('does not count an Anthropic-dialect route of a listed provider as a new provider', () => {
  const providers = [...PROVIDERS, 'alpha_anthropic'];
  assert.deepEqual(
    checkSubprocessors({
      names: LISTED,
      providers,
      date: '2026-09-28',
      versions: [
        LISTED_VERSION,
        {
          date: '2026-09-28',
          digest: copyDigest(subprocessorsPage(LISTED, providers)),
          note: 'Adds the Anthropic-dialect route of a provider the row already names.',
        },
      ],
    }),
    [],
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
    { date: '2026-09-27', summary, status: 'current', published: null },
  ]);
  assert.equal(JSON.parse(renderManifest(policies, '2026-09-21')).recordedSince, '2026-09-21');
});

test('requires a summary on the first version of a policy published after version histories began', () => {
  const root = fixtureRoot('policy-archive-');
  const failures = runPolicyArchiveCheck(root, introducedRegistry(null), INTRODUCED_ROUTES);
  assert.ok(
    failures.some(
      (failure) => failure.includes('"referralTerms" 2026-09-27') && failure.includes('"summary"'),
    ),
    failures.join('\n'),
  );
});

function archiveRepository(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'policy-archive-source-'));
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'policy-archive-git-'));
  t.after(() => {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(home, { recursive: true, force: true });
  });
  const config = path.join(home, 'config');
  fs.writeFileSync(config, '');
  const environment = {
    PATH: process.env.PATH,
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_CONFIG_GLOBAL: config,
    GIT_AUTHOR_NAME: 'Policy Fixture',
    GIT_AUTHOR_EMAIL: 'policy@example.invalid',
    GIT_COMMITTER_NAME: 'Policy Fixture',
    GIT_COMMITTER_EMAIL: 'policy@example.invalid',
  };
  const git = (...args) => {
    const result = spawnSync('git', args, { cwd: root, env: environment, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim();
  };
  const write = (relative, contents) => {
    fs.mkdirSync(path.dirname(path.join(root, relative)), { recursive: true });
    fs.writeFileSync(path.join(root, relative), contents);
  };
  const commit = (message) => {
    git('add', '-A');
    git('commit', '--quiet', '-m', message);
    return git('rev-parse', 'HEAD');
  };
  git('init', '--quiet');
  return { root, git, write, commit };
}

test('fails when an archived version holds the text of the version that replaced it', (t) => {
  const settled = termsPage();
  const revised = termsPage('We may cancel your account at any time.');
  const { root, write, commit } = archiveRepository(t);
  write(CONSTANTS, constants());
  write(TERMS_PAGE, settled);
  const published = commit('the 11 august terms');
  write(TERMS_PAGE, revised);
  const early = commit('the revised terms land before their date moves');
  write(CONSTANTS, constants({ termsDate: '2026-09-21' }));
  const moved = commit('the terms date moves');
  const index = registry([
    { date: '2026-08-11', digest: copyDigest(settled), note: 'Baseline recorded for the fixture.' },
    {
      date: '2026-09-21',
      digest: copyDigest(revised),
      summary: 'Lets us cancel an account at any time.',
    },
  ]);
  const routes = { terms: '/terms' };
  const archiveAt = (sha) =>
    write(archiveFile('terms', '2026-08-11'), JSON.stringify({ commit: sha }));

  archiveAt(early);
  const failures = runPolicyArchiveSourceCheck(root, index, routes);
  assert.ok(
    failures.some(
      (failure) =>
        failure.includes(archiveFile('terms', '2026-08-11')) &&
        failure.includes('records under 2026-09-21'),
    ),
    failures.join('\n'),
  );

  archiveAt(moved);
  assert.ok(
    runPolicyArchiveSourceCheck(root, index, routes).some((failure) =>
      failure.includes('printed 2026-09-21 rather than 2026-08-11'),
    ),
  );

  archiveAt(published);
  assert.deepEqual(runPolicyArchiveSourceCheck(root, index, routes), []);
});

test('fails when an archived version names a commit this branch does not descend from', (t) => {
  const settled = termsPage();
  const revised = termsPage('We may cancel your account at any time.');
  const { root, git, write, commit } = archiveRepository(t);
  write(CONSTANTS, constants());
  write(TERMS_PAGE, settled);
  const published = commit('the 11 august terms');
  const trunk = git('symbolic-ref', '--short', 'HEAD');
  git('checkout', '--quiet', '-b', 'lane');
  write('notes.txt', 'Work that never reaches the main line.\n');
  const lane = commit('a lane commit that still prints the 11 august terms');
  git('checkout', '--quiet', trunk);
  git('branch', '--quiet', '-D', 'lane');
  write(TERMS_PAGE, revised);
  write(CONSTANTS, constants({ termsDate: '2026-09-21' }));
  commit('the terms date moves');
  const index = registry([
    { date: '2026-08-11', digest: copyDigest(settled), note: 'Baseline recorded for the fixture.' },
    {
      date: '2026-09-21',
      digest: copyDigest(revised),
      summary: 'Lets us cancel an account at any time.',
    },
  ]);
  const routes = { terms: '/terms' };
  const archiveAt = (sha) =>
    write(archiveFile('terms', '2026-08-11'), JSON.stringify({ commit: sha }));

  archiveAt(lane);
  const failures = runPolicyArchiveSourceCheck(root, index, routes);
  assert.ok(
    failures.some(
      (failure) =>
        failure.includes(archiveFile('terms', '2026-08-11')) &&
        failure.includes(lane) &&
        failure.includes('not on the history of this branch'),
    ),
    failures.join('\n'),
  );

  archiveAt(published);
  assert.deepEqual(runPolicyArchiveSourceCheck(root, index, routes), []);
});

test('archives from a commit origin/main holds before a newer one only this branch holds', () => {
  const commits = [
    { sha: 'lane-tip', time: 50 },
    { sha: 'merged-side', time: 40 },
    { sha: 'main-tip', time: 30 },
    { sha: 'main-earlier', time: 20 },
    { sha: 'lane-side', time: 10 },
  ];
  const published = new Set(['merged-side', 'main-tip', 'main-earlier']);
  const mainline = new Set(['lane-tip', 'main-tip', 'main-earlier']);
  assert.deepEqual(
    commits.sort(byArchivePreference(published, mainline)).map((commit) => commit.sha),
    ['main-tip', 'main-earlier', 'merged-side', 'lane-tip', 'lane-side'],
  );
});

test('archives a version production served from the commit it served before a newer one with the same text', () => {
  const commits = [
    { sha: 'main-tip', time: 30 },
    { sha: 'main-earlier', time: 20 },
    { sha: 'served', time: 10 },
  ];
  const onMain = new Set(['main-tip', 'main-earlier', 'served']);
  assert.deepEqual(
    commits
      .sort(byArchivePreference(onMain, onMain, new Set(['served'])))
      .map((commit) => commit.sha),
    ['served', 'main-tip', 'main-earlier'],
  );
});

const TERMS_ROUTES = { terms: '/terms' };

function servedRecord(checkedOn, served, main) {
  return { checkedOn, served, main, note: 'Production checked for the fixture.' };
}

function datedTermsHistory(t, dates) {
  const { root, git, write, commit } = archiveRepository(t);
  const pages = dates.map((date) => termsPage(`These terms were settled on ${date}.`));
  const commits = dates.map((date, position) => {
    write(CONSTANTS, constants({ termsDate: date }));
    write(TERMS_PAGE, pages[position]);
    return commit(`the terms dated ${date}`);
  });
  const versions = dates.map((date, position) => ({
    date,
    digest: copyDigest(pages[position]),
    ...(position === 0
      ? { note: 'Baseline recorded for the fixture.' }
      : { summary: `Revises the fixture terms as settled on ${date}.` }),
  }));
  return { root, git, commits, versions };
}

function publicationsOf(root, index) {
  const { records, failures } = readPublications(root, index);
  assert.deepEqual(failures, []);
  const standing = publicationStanding(records);
  const published = archiveExpectations(
    index,
    TERMS_ROUTES,
    () => true,
    standing,
  ).terms.versions.map((version) => [version.date, version.published]);
  const unknown = runPolicyArchiveCheck(root, index, TERMS_ROUTES, standing).filter((failure) =>
    failure.includes('no record in "publications"'),
  );
  return { published, unknown };
}

test('says a replaced version applied when production served it, and was never published when main replaced it first', (t) => {
  const dates = ['2026-08-11', '2026-09-21', '2026-09-25', '2026-09-30'];
  const { root, commits, versions } = datedTermsHistory(t, dates);
  const index = {
    ...registry(versions),
    publications: [servedRecord('2026-09-26', commits[0], commits[2])],
  };

  const first = publicationsOf(root, index);
  assert.deepEqual(first.published, [
    ['2026-09-30', null],
    ['2026-09-25', null],
    ['2026-09-21', false],
    ['2026-08-11', true],
  ]);
  assert.equal(first.unknown.length, 1);
  assert.match(first.unknown[0], /"terms" 2026-09-25/);

  index.publications.push(servedRecord('2026-10-01', commits[2], commits[3]));
  const second = publicationsOf(root, index);
  assert.deepEqual(second.published, [
    ['2026-09-30', null],
    ['2026-09-25', true],
    ['2026-09-21', false],
    ['2026-08-11', true],
  ]);
  assert.deepEqual(second.unknown, []);
});

test('clears a replacement made while production lags once a record names the commit that moves the date, which main cannot', (t) => {
  const { root, commits, versions } = datedTermsHistory(t, [
    '2026-08-11',
    '2026-09-23',
    '2026-10-05',
  ]);
  const [served, mainHead, movesDate] = commits;
  const index = {
    ...registry(versions),
    publications: [servedRecord('2026-10-02', served, mainHead)],
  };

  const unrecorded = publicationsOf(root, index);
  assert.equal(unrecorded.unknown.length, 1);
  assert.match(unrecorded.unknown[0], /"terms" 2026-09-23/);
  assert.match(
    unrecorded.unknown[0],
    /as "main" a commit that prints a later date for this policy: main's head if main has replaced this version, otherwise the commit on this branch that moves the date/,
  );

  index.publications.push(servedRecord('2026-10-05', served, mainHead));
  assert.equal(publicationsOf(root, index).unknown.length, 1);

  index.publications.push(servedRecord('2026-10-05', served, movesDate));
  const recorded = publicationsOf(root, index);
  assert.deepEqual(recorded.unknown, []);
  assert.deepEqual(recorded.published, [
    ['2026-10-05', null],
    ['2026-09-23', false],
    ['2026-08-11', true],
  ]);
});

test('fails when production served a version the history does not record', (t) => {
  const { root, commits, versions } = datedTermsHistory(t, ['2026-08-11', '2026-09-21']);
  const index = {
    ...registry([{ ...versions[1], note: 'Baseline recorded for the fixture.' }]),
    publications: [servedRecord('2026-09-22', commits[0], commits[1])],
  };

  const { failures } = readPublications(root, index);
  assert.ok(
    failures.some(
      (failure) =>
        failure.includes('"terms"') &&
        failure.includes('production served the version dated 2026-08-11') &&
        failure.includes(commits[0]),
    ),
    failures.join('\n'),
  );
});

test('fails on a publication record that names no readable main-line commit, or on none at all', (t) => {
  const { root, git, commits, versions } = datedTermsHistory(t, ['2026-08-11', '2026-09-21']);
  const trunk = git('symbolic-ref', '--short', 'HEAD');
  git('checkout', '--quiet', '-b', 'deployed');
  fs.writeFileSync(path.join(root, 'notes.txt'), 'A deploy built from a branch main never held.\n');
  git('add', '-A');
  git('commit', '--quiet', '-m', 'a commit only the deploy branch holds');
  const deployed = git('rev-parse', 'HEAD');
  git('checkout', '--quiet', trunk);
  git('branch', '--quiet', '-D', 'deployed');
  const failuresFor = (publications) =>
    readPublications(root, { ...registry(versions), publications }).failures;

  assert.ok(
    failuresFor([servedRecord('2026-09-22', deployed, commits[1])]).some((failure) =>
      failure.includes('not on the history of this branch'),
    ),
  );
  assert.ok(
    failuresFor([servedRecord('2026-09-22', 'f'.repeat(40), commits[1])]).some((failure) =>
      failure.includes('does not hold'),
    ),
  );
  assert.ok(
    failuresFor([servedRecord('22 September', commits[0].slice(0, 10), commits[1])]).some(
      (failure) => failure.includes('checkedOn') || failure.includes('full commit id'),
    ),
  );
  assert.ok(failuresFor([]).some((failure) => failure.includes('at least one day')));
});

test('the published policy set records what production served and words every replaced version by it', () => {
  const index = JSON.parse(fs.readFileSync(path.join(repoRoot, REGISTRY), 'utf8'));
  const { records, failures } = readPublications(repoRoot, index);
  assert.deepEqual(failures, []);

  const standing = publicationStanding(records);
  assert.equal(standing('privacy', '2026-09-12'), true);
  assert.equal(standing('terms', '2026-08-11'), true);
  for (const [key, date] of [
    ['privacy', '2026-09-21'],
    ['privacy', '2026-09-22'],
    ['privacy', '2026-09-27'],
    ['subprocessors', '2026-09-21'],
    ['subprocessors', '2026-09-22'],
    ['mobile', '2026-09-21'],
    ['terms', '2026-09-22'],
  ]) {
    assert.equal(standing(key, date), false, `${key} ${date}`);
  }
});

test('the published policy set passes', () => {
  assert.deepEqual(runPolicyVersionsCheck(repoRoot), []);
});

test('every archived policy version holds the text its history last records under its date', () => {
  const index = JSON.parse(fs.readFileSync(path.join(repoRoot, REGISTRY), 'utf8'));
  const routes = readConstantObject(
    fs.readFileSync(path.join(repoRoot, CONSTANTS), 'utf8'),
    'CANONICAL_POLICY_ROUTES',
  );
  assert.deepEqual(runPolicyArchiveSourceCheck(repoRoot, index, routes), []);
});
