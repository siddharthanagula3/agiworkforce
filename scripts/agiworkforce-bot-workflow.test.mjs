import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import test from 'node:test';
import { parse as parseYaml } from 'yaml';

const WORKFLOW = path.join(process.cwd(), '.github/workflows/agiworkforce-bot.yml');
const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;

function stepScript(name) {
  const workflow = parseYaml(fs.readFileSync(WORKFLOW, 'utf8'));
  const step = workflow.jobs.process.steps.find((candidate) => candidate.name === name);
  assert.ok(step, `step ${name} exists`);
  return step.with.script;
}

function run(name, { github, context, core }) {
  const script = new AsyncFunction('github', 'context', 'core', 'process', stepScript(name));
  return script(github, context, core, { env: {} });
}

function makeContext(eventName, payload) {
  return {
    eventName,
    repo: { owner: 'o', repo: 'r' },
    sha: 'default-branch-sha',
    issue: { number: 7 },
    payload,
  };
}

test('the bot reacts through the endpoint that matches the comment resource', async () => {
  const calls = [];
  const github = {
    rest: {
      reactions: {
        createForIssueComment: async (args) => calls.push(['issue', args]),
        createForPullRequestReviewComment: async (args) => calls.push(['review', args]),
      },
    },
  };
  const core = { warning: () => {} };

  await run('React to comment', {
    github,
    core,
    context: makeContext('issue_comment', { comment: { id: 11 } }),
  });
  await run('React to comment', {
    github,
    core,
    context: makeContext('pull_request_review_comment', {
      comment: { id: 12 },
      pull_request: { head: { sha: 'abc' } },
    }),
  });

  assert.deepEqual(
    calls.map(([kind, args]) => [kind, args.comment_id]),
    [
      ['issue', 11],
      ['review', 12],
    ],
  );
});

test('a failed reaction is reported as a warning and does not stop the command', async () => {
  const warnings = [];
  const github = {
    rest: {
      reactions: {
        createForIssueComment: async () => {
          throw new Error('boom');
        },
      },
    },
  };

  await run('React to comment', {
    github,
    core: { warning: (message) => warnings.push(message) },
    context: makeContext('issue_comment', { comment: { id: 1 } }),
  });

  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /boom/);
});

function makeCheckGithub({ heads, runsByRef }) {
  const comments = [];
  const listedRefs = [];
  const listForRef = async () => {};
  let headReads = 0;
  const github = {
    paginate: async (method, args) => {
      assert.equal(method, listForRef);
      listedRefs.push(args.ref);
      return runsByRef[args.ref] ?? [];
    },
    rest: {
      pulls: {
        get: async ({ pull_number }) => {
          assert.equal(pull_number, 7);
          const sha = heads[Math.min(headReads, heads.length - 1)];
          headReads += 1;
          return { data: { head: { sha } } };
        },
      },
      checks: { listForRef },
      issues: { createComment: async (args) => comments.push(args.body) },
    },
  };
  return { github, comments, listedRefs };
}

test('check reports the pull request head, not the event commit', async () => {
  const { github, comments, listedRefs } = makeCheckGithub({
    heads: ['pr-head-sha-0123456789'],
    runsByRef: {
      'pr-head-sha-0123456789': [{ name: 'build', status: 'completed', conclusion: 'failure' }],
      'default-branch-sha': [{ name: 'build', status: 'completed', conclusion: 'success' }],
    },
  });

  await run('Handle check command', {
    github,
    core: {},
    context: makeContext('issue_comment', { comment: { id: 1 }, issue: { number: 7 } }),
  });

  assert.deepEqual(listedRefs, ['pr-head-sha-0123456789']);
  assert.equal(comments.length, 1);
  assert.match(comments[0], /pr-head-sha/);
  assert.match(comments[0], /\| build \| completed \| FAIL \|/);
  assert.doesNotMatch(comments[0], /PASS/);
});

test('check follows a head that moves while its checks are read', async () => {
  const { github, comments, listedRefs } = makeCheckGithub({
    heads: ['old-head-sha-000000', 'new-head-sha-111111', 'new-head-sha-111111'],
    runsByRef: {
      'old-head-sha-000000': [{ name: 'build', status: 'completed', conclusion: 'success' }],
      'new-head-sha-111111': [{ name: 'build', status: 'in_progress', conclusion: null }],
    },
  });

  await run('Handle check command', {
    github,
    core: {},
    context: makeContext('issue_comment', { comment: { id: 1 }, issue: { number: 7 } }),
  });

  assert.deepEqual(listedRefs, ['old-head-sha-000000', 'new-head-sha-111111']);
  assert.match(comments[0], /new-head-sha/);
  assert.doesNotMatch(comments[0], /old-head/);
  assert.match(comments[0], /PENDING/);
});

test('check refuses to publish a report when the head never settles', async () => {
  const { github, comments } = makeCheckGithub({
    heads: [
      'a000000000000',
      'b000000000000',
      'c000000000000',
      'd000000000000',
      'e000000000000',
      'f000000000000',
    ],
    runsByRef: {},
  });

  await run('Handle check command', {
    github,
    core: {},
    context: makeContext('issue_comment', { comment: { id: 1 }, issue: { number: 7 } }),
  });

  assert.match(comments[0], /head changed/);
  assert.doesNotMatch(comments[0], /\| Check \|/);
});

test('help text describes check as a status report', () => {
  assert.doesNotMatch(stepScript('Handle help command'), /Run build checks/);
});

function makeListingGithub({ pr, files = [], reviews = [] }) {
  const comments = [];
  const listFiles = async () => {
    throw new Error('listFiles must be read through paginate');
  };
  const listReviews = async () => {
    throw new Error('listReviews must be read through paginate');
  };
  const github = {
    paginate: async (method) => {
      if (method === listFiles) return files;
      if (method === listReviews) return reviews;
      throw new Error('unexpected paginate target');
    },
    rest: {
      pulls: {
        get: async () => ({ data: pr }),
        listFiles,
        listReviews,
      },
      issues: { createComment: async (args) => comments.push(args.body) },
    },
  };
  return { github, comments };
}

function manyFiles(count, overrides = {}) {
  return Array.from({ length: count }, (_, index) => ({
    filename: `src/file-${index}.ts`,
    additions: 1,
    deletions: 0,
    status: 'modified',
    ...overrides,
  }));
}

const issueContext = () =>
  makeContext('issue_comment', { comment: { id: 1 }, issue: { number: 7 } });

test('explain counts every page of files', async () => {
  const { github, comments } = makeListingGithub({ pr: {}, files: manyFiles(250) });

  await run('Handle explain command', { github, core: {}, context: issueContext() });

  assert.match(comments[0], /\*\*250\*\* files changed: \*\*\+250\*\*/);
  assert.match(comments[0], /\.\.\.and 220 more files/);
  assert.doesNotMatch(comments[0], /at most 3000/);
});

test('explain says so when GitHub stopped listing files', async () => {
  const { github, comments } = makeListingGithub({ pr: {}, files: manyFiles(3000) });

  await run('Handle explain command', { github, core: {}, context: issueContext() });

  assert.match(comments[0], /at most 3000 files/);
});

test('review inspects files beyond the first page', async () => {
  const files = [
    ...manyFiles(150),
    { filename: 'config/secrets.json', additions: 1, deletions: 0 },
  ];
  const { github, comments } = makeListingGithub({ pr: {}, files });

  await run('Handle review command', { github, core: {}, context: issueContext() });

  assert.match(comments[0], /SECURITY: config\/secrets\.json/);
  assert.match(comments[0], /Files changed: 151/);
});

test('review does not claim a clean pass over files GitHub stopped listing', async () => {
  const { github, comments } = makeListingGithub({ pr: {}, files: manyFiles(3000) });

  await run('Handle review command', { github, core: {}, context: issueContext() });

  assert.doesNotMatch(comments[0], /No obvious issues found\.\n/);
  assert.match(comments[0], /first 3000 files/);
});

test('stats reports the pull request totals and every review', async () => {
  const { github, comments } = makeListingGithub({
    pr: {
      commits: 130,
      changed_files: 420,
      additions: 9,
      deletions: 4,
      mergeable: true,
      draft: false,
    },
    reviews: Array.from({ length: 45 }, (_, index) => ({ id: index })),
  });

  await run('Handle stats command', { github, core: {}, context: issueContext() });

  assert.match(comments[0], /\| Commits \| 130 \|/);
  assert.match(comments[0], /\| Files changed \| 420 \|/);
  assert.match(comments[0], /\| Reviews \| 45 \|/);
  assert.match(comments[0], /\| Mergeable \| OK \|/);
});

test('stats reports a conflict only when GitHub says there is one', async () => {
  const base = { commits: 1, changed_files: 1, additions: 1, deletions: 0, draft: false };
  const conflict = makeListingGithub({ pr: { ...base, mergeable: false } });
  const unknown = makeListingGithub({ pr: { ...base, mergeable: null } });

  await run('Handle stats command', { github: conflict.github, core: {}, context: issueContext() });
  await run('Handle stats command', { github: unknown.github, core: {}, context: issueContext() });

  assert.match(conflict.comments[0], /\| Mergeable \| CONFLICT \|/);
  assert.match(unknown.comments[0], /\| Mergeable \| UNKNOWN/);
  assert.doesNotMatch(unknown.comments[0], /CONFLICT/);
});
