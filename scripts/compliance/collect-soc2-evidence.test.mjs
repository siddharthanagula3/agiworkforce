import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  COLLECTORS,
  Unavailable,
  createContext,
  criteriaCoverage,
  groupRunsByCommit,
  httpStatus,
  isInsideTrackedTree,
  parseArgs,
  parseGitHubRemote,
  parseKnownFlaws,
  parseVercelList,
  redact,
  redactText,
  renderSummary,
  runCollectors,
  runCommand,
  scheduledWorkflows,
  summarizeHistory,
  validateCatalog,
  vercelInspect,
  vercelRead,
} from './collect-soc2-evidence.mjs';

function catalog(controls) {
  return {
    lastReviewed: '2026-10-18',
    owners: ['Founder', 'Security'],
    frequencies: ['monthly', 'per-change'],
    scope: { cycle1: ['security'] },
    categories: { CC: 'security', A1: 'availability' },
    criteria: {
      'CC6.1': 'Logical access',
      'CC8.1': 'Change management',
      'A1.3': 'Recovery testing',
    },
    controls,
  };
}

function control(overrides = {}) {
  return {
    id: 'CM-01',
    title: 'Changes are committed',
    description: 'Every change is a commit on main.',
    criteria: ['CC8.1'],
    owner: 'Founder',
    frequency: 'per-change',
    status: 'operated',
    cycle1: 'in-scope',
    automation: 'automated',
    collectors: ['github.main-history'],
    implementation: ['present.md'],
    ...overrides,
  };
}

const exists = (file) => file === 'present.md';

test('a catalog whose controls and collectors match has no findings', () => {
  assert.deepEqual(validateCatalog(catalog([control()]), ['github.main-history'], exists), []);
});

test('a control citing a criterion outside the catalog fails', () => {
  const errors = validateCatalog(
    catalog([control({ criteria: ['CC8.2'] })]),
    ['github.main-history'],
    exists,
  );
  assert.match(errors.join('\n'), /CC8\.2 is not in the catalog's criteria/);
});

test('a criteria registry entry that is not a Trust Services Criterion id fails', () => {
  const broken = catalog([control()]);
  broken.criteria['CC10.1'] = 'not real';
  assert.match(
    validateCatalog(broken, ['github.main-history'], exists).join('\n'),
    /CC10\.1 is not a Trust Services Criterion id/,
  );
});

test('a control naming a collector that does not exist fails', () => {
  const errors = validateCatalog(
    catalog([control({ collectors: ['github.nothing'] })]),
    [],
    exists,
  );
  assert.match(errors.join('\n'), /collector github\.nothing does not exist/);
});

test('a collector no control cites fails', () => {
  const errors = validateCatalog(
    catalog([control()]),
    ['github.main-history', 'repo.orphan'],
    exists,
  );
  assert.deepEqual(errors, [
    'collector repo.orphan proves no control in docs/compliance/soc2-controls.json',
  ]);
});

test('an operated automated control with no collector fails', () => {
  const errors = validateCatalog(
    catalog([control({ collectors: [], manualEvidence: 'a screenshot' })]),
    [],
    exists,
  );
  assert.match(errors.join('\n'), /an automated control needs a collector/);
});

test('an operated manual control needs a collector or manual evidence', () => {
  const bare = control({ automation: 'manual', collectors: [] });
  assert.match(
    validateCatalog(catalog([bare]), [], exists).join('\n'),
    /no collector and no manualEvidence/,
  );
  const documented = control({
    automation: 'manual',
    collectors: [],
    manualEvidence: 'The signed review.',
  });
  assert.deepEqual(validateCatalog(catalog([documented]), [], exists), []);
});

test('a not-yet-operated control must state its gap and an operated one may not carry one', () => {
  const silent = control({ status: 'not-yet-operated', collectors: [], implementation: [] });
  assert.match(
    validateCatalog(catalog([silent]), [], exists).join('\n'),
    /must say what is missing/,
  );
  const stated = {
    ...silent,
    gap: 'There is one person, so no second reviewer exists to approve a change.',
  };
  assert.deepEqual(validateCatalog(catalog([stated]), [], exists), []);
  const contradictory = control({
    gap: 'There is one person, so no second reviewer exists to approve a change.',
  });
  assert.match(
    validateCatalog(catalog([contradictory]), ['github.main-history'], exists).join('\n'),
    /operated control carries a gap/,
  );
});

test('an implementation path that is not in the tree fails, and an operated control needs one', () => {
  const missing = control({ implementation: ['gone.md'] });
  assert.match(
    validateCatalog(catalog([missing]), ['github.main-history'], exists).join('\n'),
    /gone\.md does not exist/,
  );
  const none = control({ implementation: [] });
  assert.match(
    validateCatalog(catalog([none]), ['github.main-history'], exists).join('\n'),
    /names no path/,
  );
});

test('unknown owner, frequency, status and automation each fail, as does a reused id', () => {
  const odd = control({
    owner: 'Board',
    frequency: 'hourly',
    status: 'done',
    automation: 'robotic',
  });
  const errors = validateCatalog(catalog([odd, control()]), ['github.main-history'], exists).join(
    '\n',
  );
  for (const pattern of [
    /owner Board/,
    /frequency hourly/,
    /status must be/,
    /automation must be/,
    /id is used twice/,
  ]) {
    assert.match(errors, pattern);
  }
});

test('coverage separates criteria an operated control covers from those only a gap names', () => {
  const coverage = criteriaCoverage(
    catalog([
      control(),
      control({
        id: 'BR-02',
        criteria: ['A1.3'],
        status: 'not-yet-operated',
        cycle1: 'out-of-scope',
        gap: 'No restore drill has been run against production yet.',
      }),
    ]),
  );
  assert.deepEqual(coverage.covered, ['CC8.1']);
  assert.deepEqual(coverage.gapOnly, ['A1.3']);
  assert.deepEqual(coverage.unnamed, ['CC6.1']);
  assert.deepEqual(coverage.cycle1, { total: 2, covered: ['CC8.1'], uncovered: ['CC6.1'] });
});

test('cycle 1 scope must agree with the categories a control cites', () => {
  const parked = control({ cycle1: 'out-of-scope' });
  assert.match(
    validateCatalog(catalog([parked]), ['github.main-history'], exists).join('\n'),
    /out of scope for cycle 1 but every criterion it cites is in scope/,
  );
  const stray = control({ criteria: ['A1.3'] });
  assert.match(
    validateCatalog(catalog([stray]), ['github.main-history'], exists).join('\n'),
    /in scope for cycle 1 but cites no criterion in security/,
  );
  const unset = control({ cycle1: undefined });
  assert.match(
    validateCatalog(catalog([unset]), ['github.main-history'], exists).join('\n'),
    /cycle1 must be one of/,
  );
  const unknownCategory = catalog([control()]);
  unknownCategory.scope.cycle1 = ['security', 'speed'];
  assert.match(
    validateCatalog(unknownCategory, ['github.main-history'], exists).join('\n'),
    /scope\.cycle1: speed is not a category/,
  );
});

test('an email keeps only its domain and a handle is left alone', () => {
  assert.equal(
    redactText('owner jane.doe+ops@example.co.uk, login jane-doe'),
    'owner [redacted]@example.co.uk, login jane-doe',
  );
});

test('token shapes, URL credentials and the run secrets are removed entirely', () => {
  const githubToken = `ghp_${'a1'.repeat(18)}`;
  const fineGrained = `github_pat_${'B2'.repeat(20)}`;
  const runSecret = 'vercel-run-secret-value';
  const text = `a ${githubToken} b ${fineGrained} c postgres://app:PLACEHOLDER@db.example.com/app d ${runSecret} e Bearer ${'x'.repeat(30)}`;
  const out = redactText(text, [runSecret]);
  for (const leaked of [githubToken, fineGrained, 'PLACEHOLDER', runSecret, 'x'.repeat(30)]) {
    assert.equal(out.includes(leaked), false, `${leaked.slice(0, 12)} survived redaction`);
  }
  assert.match(out, /postgres:\/\/app:\[redacted\]@db\.example\.com/);
});

test('redaction walks nested objects and arrays and leaves numbers and booleans', () => {
  const value = redact({
    members: [{ email: 'a@corp.example', hasMfa: false, joined: 3 }],
    note: ['b@corp.example'],
  });
  assert.deepEqual(value, {
    members: [{ email: '[redacted]@corp.example', hasMfa: false, joined: 3 }],
    note: ['[redacted]@corp.example'],
  });
});

function fakeContext(responses, extra = {}) {
  const calls = [];
  const ctx = createContext({
    root: extra.root ?? os.tmpdir(),
    since: new Date('2026-09-17T00:00:00Z'),
    until: new Date('2026-10-18T00:00:00Z'),
    env: extra.env ?? {},
    options: extra.options ?? {},
    exec: async (command, args) => {
      calls.push([command, ...args].join(' '));
      for (const [pattern, response] of responses) {
        if (pattern.test([command, ...args].join(' '))) {
          if (response instanceof Error) throw response;
          return { code: 0, stdout: '', stderr: '', ...response };
        }
      }
      return { code: 1, stdout: '', stderr: `no fake for ${command} ${args.join(' ')}` };
    },
    fetchImpl: extra.fetchImpl,
  });
  return { ctx, calls };
}

test('a collector whose CLI is missing reports unavailable with the reason and the run continues', async () => {
  const { ctx } = fakeContext([[/^gh /, new Unavailable('gh is not installed')]]);
  const results = await runCollectors(
    {
      'github.collaborators': COLLECTORS['github.collaborators'],
      'github.ci-runs': COLLECTORS['github.ci-runs'],
    },
    ctx,
  );
  assert.deepEqual(
    results.map((result) => [result.collector, result.status, result.reason]),
    [
      ['github.collaborators', 'unavailable', 'gh is not installed'],
      ['github.ci-runs', 'unavailable', 'gh is not installed'],
    ],
  );
});

test('an unauthenticated gh makes the GitHub collectors unavailable, not failed', async () => {
  const { ctx } = fakeContext([
    [/^gh auth status/, { code: 1, stderr: 'You are not logged into any GitHub hosts.' }],
  ]);
  const [result] = await runCollectors(
    { 'github.collaborators': COLLECTORS['github.collaborators'] },
    ctx,
  );
  assert.equal(result.status, 'unavailable');
  assert.match(result.reason, /not authenticated/);
});

test('the Vercel member list without VERCEL_TOKEN and Neon without a project id are unavailable', async () => {
  const { ctx } = fakeContext([]);
  const results = await runCollectors(
    {
      'vercel.team-members': COLLECTORS['vercel.team-members'],
      'neon.members': COLLECTORS['neon.members'],
    },
    ctx,
  );
  assert.deepEqual(
    results.map((result) => result.status),
    ['unavailable', 'unavailable'],
  );
  assert.match(results[0].reason, /VERCEL_TOKEN is not set/);
  assert.match(results[1].reason, /NEON_PROJECT_ID is not set/);
});

test('an unexpected failure is an error, and its message is redacted', async () => {
  const { ctx } = fakeContext([]);
  const results = await runCollectors(
    {
      'x.broken': {
        area: 'test',
        describe: 'throws',
        run: async () => {
          throw new Error('refused for ops@corp.example');
        },
      },
    },
    ctx,
  );
  assert.equal(results[0].status, 'error');
  assert.equal(results[0].reason, 'refused for [redacted]@corp.example');
});

test('collected data is redacted before it is returned, including the run secrets', async () => {
  const { ctx } = fakeContext([], { env: { VERCEL_TOKEN: 'secret-token-value-123' } });
  const results = await runCollectors(
    {
      'x.leaky': {
        area: 'test',
        describe: 'leaks',
        run: async () => ({
          headline: 'ok',
          data: { email: 'a@corp.example', echoed: 'token secret-token-value-123' },
        }),
      },
    },
    ctx,
  );
  assert.deepEqual(results[0].data, {
    email: '[redacted]@corp.example',
    echoed: 'token [redacted]',
  });
});

test('Neon members carry MFA status with emails reduced to their domain', async () => {
  const project = { id: 'proj', org_id: 'org-1' };
  const { ctx } = fakeContext(
    [
      [/^neonctl me /, { stdout: '{}' }],
      [/^neonctl projects get proj /, { stdout: JSON.stringify(project) }],
      [
        /^neonctl api \/organizations\/org-1\/members /,
        {
          stdout: JSON.stringify({
            members: [
              {
                member: { id: 'm1', role: 'admin', joined_at: '2026-05-24T02:44:55Z' },
                user: { email: 'founder@corp.example', has_mfa: false },
              },
            ],
          }),
        },
      ],
      [
        /^neonctl api \/projects\/proj\/members /,
        { stdout: JSON.stringify({ project_members: [] }) },
      ],
    ],
    { env: { NEON_PROJECT_ID: 'proj' } },
  );
  const [result] = await runCollectors({ 'neon.members': COLLECTORS['neon.members'] }, ctx);
  assert.equal(result.status, 'available');
  assert.equal(result.data.membersWithoutMfa, 1);
  assert.deepEqual(result.data.organizationMembers[0], {
    memberId: 'm1',
    role: 'admin',
    joinedAt: '2026-05-24T02:44:55Z',
    email: '[redacted]@corp.example',
    hasMfa: false,
  });
});

test('secret scanning alerts are counted without ever carrying the secret value', async () => {
  const leaked = `ghp_${'z9'.repeat(18)}`;
  const { ctx } = fakeContext(
    [
      [/^gh auth status/, {}],
      [
        /^gh api repos\/o\/r$/,
        {
          stdout: JSON.stringify({
            default_branch: 'main',
            visibility: 'public',
            owner: { login: 'o', type: 'User' },
          }),
        },
      ],
      [
        /secret-scanning\/alerts/,
        {
          stdout: JSON.stringify([
            [
              {
                number: 7,
                secret: leaked,
                secret_type: 'github_personal_access_token',
                created_at: '2026-10-01T00:00:00Z',
              },
            ],
          ]),
        },
      ],
      [/code-scanning\/alerts/, { code: 1, stderr: 'gh: no analysis found (HTTP 404)' }],
      [/dependabot\/alerts/, { stdout: '[[]]' }],
    ],
    { options: { repo: 'o/r' } },
  );
  const [result] = await runCollectors(
    { 'github.security-alerts': COLLECTORS['github.security-alerts'] },
    ctx,
  );
  assert.equal(result.status, 'available');
  assert.equal(JSON.stringify(result).includes(leaked), false);
  assert.equal(result.data.secretScanning.open, 1);
  assert.deepEqual(result.data.codeScanning, {
    status: 'unavailable',
    reason: 'HTTP 404: gh: no analysis found (HTTP 404)',
  });
});

test('branch protection that GitHub refuses to show is unavailable, never reported as off', async () => {
  const { ctx } = fakeContext(
    [
      [/^gh auth status/, {}],
      [
        /^gh api repos\/o\/r$/,
        { stdout: JSON.stringify({ default_branch: 'main', owner: { login: 'o', type: 'User' } }) },
      ],
      [
        /branches\/main\/protection/,
        { code: 1, stderr: 'gh: Resource not accessible by integration (HTTP 403)' },
      ],
      [/rulesets/, { stdout: '[]' }],
      [/rules\/branches\/main/, { stdout: '[]' }],
    ],
    { options: { repo: 'o/r' } },
  );
  const [result] = await runCollectors(
    { 'github.branch-protection': COLLECTORS['github.branch-protection'] },
    ctx,
  );
  assert.equal(result.data.classicProtection.status, 'unavailable');
  assert.match(result.headline, /classic protection unavailable/);
});

test('a Neon member without an has_mfa field is unavailable, not counted as lacking MFA', async () => {
  const { ctx } = fakeContext(
    [
      [/^neonctl me /, { stdout: '{}' }],
      [/^neonctl projects get proj /, { stdout: JSON.stringify({ id: 'proj', org_id: 'org-1' }) }],
      [
        /^neonctl api \/organizations\/org-1\/members /,
        {
          stdout: JSON.stringify({ members: [{ member: { id: 'm1', role: 'admin' }, user: {} }] }),
        },
      ],
      [/^neonctl orgs list /, { stdout: JSON.stringify([{ id: 'org-1' }]) }],
      [
        /^neonctl api \/projects\/proj\/members /,
        { stdout: JSON.stringify({ project_members: [] }) },
      ],
    ],
    { env: { NEON_PROJECT_ID: 'proj' } },
  );
  const [result] = await runCollectors({ 'neon.members': COLLECTORS['neon.members'] }, ctx);
  assert.equal(result.data.organizationMembers[0].hasMfa.status, 'unavailable');
  assert.equal(result.data.membersWithoutMfa, 0);
  assert.equal(result.data.organizationRequiresMfa.status, 'unavailable');
});

test('only read commands reach the Vercel CLI, because it deploys any argument it does not know', async () => {
  const { ctx, calls } = fakeContext([[/^vercel whoami/, { stdout: 'founder' }]]);
  await assert.rejects(vercelRead(ctx, ['api', '/v3/teams']), /refusing vercel api/);
  await assert.rejects(vercelRead(ctx, ['deploy', '--prod']), /refusing vercel deploy/);
  assert.equal((await vercelRead(ctx, ['whoami'])).stdout, 'founder');
  assert.deepEqual(calls, ['vercel whoami']);
});

test('a command that is not installed rejects as unavailable', async () => {
  await assert.rejects(
    runCommand('agi-no-such-binary-for-soc2-test', []),
    (error) => error instanceof Unavailable,
  );
});

test('a commit counts as reviewed only through an approval by someone other than its author', () => {
  const summary = summarizeHistory(
    [
      {
        oid: 'a',
        committedDate: '2026-10-01T00:00:00Z',
        messageHeadline: 'direct',
        author: { user: { login: 'founder' } },
        associatedPullRequests: { nodes: [] },
      },
      {
        oid: 'b',
        committedDate: '2026-10-02T00:00:00Z',
        messageHeadline: 'self approved',
        author: { user: { login: 'founder' } },
        associatedPullRequests: {
          nodes: [
            {
              number: 1,
              mergedAt: '2026-10-02T00:00:00Z',
              baseRefName: 'main',
              author: { login: 'founder' },
              reviews: { nodes: [{ author: { login: 'founder' } }] },
            },
          ],
        },
      },
      {
        oid: 'c',
        committedDate: '2026-10-03T00:00:00Z',
        messageHeadline: 'reviewed',
        author: { user: { login: 'founder' } },
        associatedPullRequests: {
          nodes: [
            {
              number: 2,
              mergedAt: '2026-10-03T00:00:00Z',
              baseRefName: 'main',
              author: { login: 'founder' },
              reviews: { nodes: [{ author: { login: 'reviewer' } }] },
            },
          ],
        },
      },
      {
        oid: 'd',
        committedDate: '2026-10-04T00:00:00Z',
        messageHeadline: 'merged elsewhere',
        author: { user: { login: 'founder' } },
        associatedPullRequests: {
          nodes: [
            {
              number: 3,
              mergedAt: '2026-10-04T00:00:00Z',
              baseRefName: 'develop',
              author: { login: 'founder' },
              reviews: { nodes: [{ author: { login: 'reviewer' } }] },
            },
          ],
        },
      },
    ],
    'main',
  );
  assert.equal(summary.total, 4);
  assert.equal(summary.viaPullRequest, 2);
  assert.equal(summary.reviewedByAnother, 1);
  assert.deepEqual(summary.commits.find((commit) => commit.sha === 'c').approvedBy, ['reviewer']);
});

test('runs are grouped per pushed commit and the CI verdict takes the latest attempt', () => {
  const grouped = groupRunsByCommit(
    [
      {
        headSha: 's1',
        workflowName: 'CI',
        conclusion: 'failure',
        attempt: 1,
        databaseId: 10,
        createdAt: '2026-10-01T00:00:00Z',
      },
      {
        headSha: 's1',
        workflowName: 'CI',
        conclusion: 'success',
        attempt: 2,
        databaseId: 10,
        createdAt: '2026-10-01T00:00:00Z',
      },
      {
        headSha: 's1',
        workflowName: 'Security scanning',
        conclusion: 'success',
        attempt: 1,
        databaseId: 11,
        createdAt: '2026-10-01T00:00:00Z',
      },
      {
        headSha: 's2',
        workflowName: 'Security scanning',
        conclusion: '',
        status: 'in_progress',
        attempt: 1,
        databaseId: 12,
        createdAt: '2026-10-02T00:00:00Z',
      },
    ],
    'CI',
  );
  assert.deepEqual(grouped.ciConclusions, { success: 1, 'not-run': 1 });
  assert.equal(
    grouped.commits.find((commit) => commit.sha === 's2').runs[0].conclusion,
    'in_progress',
  );
});

test('only workflows with a schedule trigger are listed, with their crons', () => {
  const listed = scheduledWorkflows([
    {
      file: '.github/workflows/a.yml',
      source:
        "name: Drill\non:\n  schedule:\n    - cron: '13 5 * * 1'\n  workflow_dispatch:\njobs: {}\n",
    },
    {
      file: '.github/workflows/b.yml',
      source: 'name: CI\non:\n  push:\n    branches: [main]\njobs: {}\n',
    },
  ]);
  assert.deepEqual(listed, [
    { file: '.github/workflows/a.yml', name: 'Drill', crons: ['13 5 * * 1'] },
  ]);
});

test('the Vercel deployment table and its next-page token are parsed', () => {
  const parsed = parseVercelList(
    [
      'Age     Deployment                                     Status      Environment     Duration     Username',
      '  34m     https://app-1.vercel.app     ● Ready     Production      4m           founder',
      '  4d      https://app-2.vercel.app     ● Error     Production      2m           founder',
      '> To display the next page, run `vercel ls app --next 1791516617661`',
    ].join('\n'),
  );
  assert.deepEqual(
    parsed.rows.map((row) => [row.url, row.status, row.creator]),
    [
      ['https://app-1.vercel.app', 'Ready', 'founder'],
      ['https://app-2.vercel.app', 'Error', 'founder'],
    ],
  );
  assert.equal(parsed.next, '1791516617661');
});

test('an errored deployment is still read from the JSON vercel inspect prints with exit 1', async () => {
  const { ctx } = fakeContext([
    [
      /^vercel inspect https:\/\/bad/,
      {
        code: 1,
        stdout: JSON.stringify({ id: 'dpl_1', readyState: 'ERROR', createdAt: 1 }),
        stderr: 'Vercel CLI 50.1.3\nFetching deployment',
      },
    ],
    [
      /^vercel inspect https:\/\/gone/,
      { code: 1, stdout: '', stderr: 'Vercel CLI 50.1.3\nError: Deployment not found' },
    ],
  ]);
  assert.equal((await vercelInspect(ctx, 'https://bad')).readyState, 'ERROR');
  await assert.rejects(vercelInspect(ctx, 'https://gone'), /Error: Deployment not found/);
});

test('a gh failure with no HTTP status is retried once, and an HTTP refusal is not', async () => {
  let attempts = 0;
  const flaky = createContext({
    root: os.tmpdir(),
    since: new Date('2026-09-17T00:00:00Z'),
    until: new Date('2026-10-18T00:00:00Z'),
    env: {},
    options: { repo: 'o/r' },
    exec: async (command, args) => {
      const line = [command, ...args].join(' ');
      if (line === 'gh auth status') return { code: 0, stdout: '', stderr: '' };
      if (line === 'gh api repos/o/r')
        return {
          code: 0,
          stdout: JSON.stringify({ default_branch: 'main', owner: { login: 'o', type: 'User' } }),
          stderr: '',
        };
      if (line.startsWith('gh run list')) {
        attempts += 1;
        return attempts === 1
          ? { code: 1, stdout: '', stderr: 'read: connection reset by peer' }
          : { code: 0, stdout: '[]', stderr: '' };
      }
      return { code: 1, stdout: '', stderr: 'gh: Not Found (HTTP 404)' };
    },
  });
  const [result] = await runCollectors({ 'github.ci-runs': COLLECTORS['github.ci-runs'] }, flaky);
  assert.equal(result.status, 'available');
  assert.equal(attempts, 2);
});

test('known flaws are counted by severity from every table that has id and severity columns', () => {
  const register = parseKnownFlaws(
    [
      '## Web',
      '',
      '| id | severity | summary |',
      '| --- | --- | --- |',
      '| WEB-1 | Low | a |',
      '| WEB-2 | Medium | b |',
      '',
      '## Notes',
      '',
      '| term | meaning |',
      '| --- | --- |',
      '| x | y |',
    ].join('\n'),
  );
  assert.equal(register.open, 2);
  assert.deepEqual(register.bySeverity, { Low: 1, Medium: 1 });
});

test('remotes, HTTP statuses and arguments are read as expected', () => {
  assert.equal(parseGitHubRemote('git@github.com:owner/repo.git'), 'owner/repo');
  assert.equal(parseGitHubRemote('https://github.com/owner/repo'), 'owner/repo');
  assert.equal(parseGitHubRemote('https://gitlab.com/owner/repo'), null);
  assert.equal(httpStatus('gh: Branch not protected (HTTP 404)'), 404);
  const now = new Date('2026-10-18T12:00:00Z');
  const defaults = parseArgs([], now);
  assert.equal(defaults.until, now);
  assert.equal(defaults.since.toISOString(), '2026-09-17T12:00:00.000Z');
  const explicit = parseArgs(
    [
      '--since',
      '2026-09-01',
      '--until',
      '2026-10-01',
      '--only',
      'repo.secret-scan,deps.pnpm-audit',
    ],
    now,
  );
  assert.deepEqual(explicit.only, ['repo.secret-scan', 'deps.pnpm-audit']);
  assert.throws(() => parseArgs(['--since', '2026-02-30'], now), /not a calendar date/);
  assert.throws(
    () => parseArgs(['--since', '2026-10-02', '--until', '2026-10-01'], now),
    /before --until/,
  );
  assert.throws(() => parseArgs(['--write'], now), /unknown argument/);
});

test('an output directory inside the tree that git does not ignore is refused', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'soc2-tree-'));
  try {
    execFileSync('git', ['init', '-q'], { cwd: root });
    fs.writeFileSync(path.join(root, '.gitignore'), 'ignored/\n');
    assert.equal(isInsideTrackedTree(root, path.join(root, 'ignored', 'pack')), false);
    assert.equal(isInsideTrackedTree(root, path.join(root, 'tracked', 'pack')), true);
    assert.equal(isInsideTrackedTree(root, path.join(path.dirname(root), 'elsewhere')), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('the summary names every collector status, the manual checklist and the gaps', () => {
  const summaryCatalog = catalog([
    control(),
    control({
      id: 'AC-06',
      automation: 'manual',
      collectors: [],
      manualEvidence: 'The rotation record.',
      criteria: ['CC6.1'],
    }),
    control({
      id: 'BR-04',
      status: 'not-yet-operated',
      cycle1: 'out-of-scope',
      collectors: [],
      gap: 'No live load run is on record for the capacity target.',
      criteria: ['A1.3'],
    }),
  ]);
  const text = renderSummary({
    catalog: summaryCatalog,
    results: [
      {
        collector: 'github.main-history',
        area: 'change-management',
        status: 'unavailable',
        reason: 'gh is not installed',
      },
    ],
    meta: {
      generatedAt: '2026-10-18T00:00:00.000Z',
      since: '2026-09-17T00:00:00.000Z',
      until: '2026-10-18T00:00:00.000Z',
      gitHead: 'abc',
      uncommittedFiles: 0,
      catalogSha256: 'f'.repeat(64),
    },
  });
  assert.match(
    text,
    /\| `github.main-history` \| change-management \| unavailable \| gh is not installed \|/,
  );
  assert.match(text, /- \[ \] AC-06: The rotation record\./);
  assert.match(text, /- BR-04 Changes are committed: No live load run/);
  assert.match(text, /Cycle 1: 2 of 2 in-scope criteria have an operated control/);
  assert.match(text, /All categories: 2 of 3 criteria have an operated control/);
  assert.match(
    text,
    /\| BR-04 Changes are committed \| A1\.3 \| not-yet-operated \| out-of-scope \|/,
  );
});

test('the summary escapes backslashes before pipes so a reason stays in its own cell', () => {
  const text = renderSummary({
    catalog: catalog([control()]),
    results: [
      {
        collector: 'github.main-history',
        area: 'change-management',
        status: 'error',
        reason: 'C:\\repo\\|x failed\\',
      },
    ],
    meta: {
      generatedAt: '2026-10-18T00:00:00.000Z',
      since: '2026-09-17T00:00:00.000Z',
      until: '2026-10-18T00:00:00.000Z',
      gitHead: 'abc',
      uncommittedFiles: 0,
      catalogSha256: 'f'.repeat(64),
    },
  });
  assert.ok(
    text.includes(
      '| `github.main-history` | change-management | error | C:\\\\repo\\\\\\|x failed\\\\ |',
    ),
    text,
  );
});
