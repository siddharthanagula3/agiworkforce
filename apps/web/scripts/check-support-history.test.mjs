import assert from 'node:assert/strict';
import childProcess, { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { syncBuiltinESMExports } from 'node:module';
import { dirname, join } from 'node:path';
import process from 'node:process';
import { test } from 'node:test';
import { fileURLToPath, URL } from 'node:url';
import {
  calendarDay,
  inspectSupportHistory,
  sourceStillMatches,
} from './check-support-history.mjs';
import { parseFrontmatter } from './lib/support-frontmatter.mjs';

const SCRIPT = fileURLToPath(new URL('./check-support-history.mjs', import.meta.url));

function git(root, args, day = '2026-08-01', input) {
  return execFileSync('git', ['-C', root, ...args], {
    input,
    encoding: 'utf8',
    env: {
      ...process.env,
      GIT_AUTHOR_DATE: `${day}T12:00:00+00:00`,
      GIT_COMMITTER_DATE: `${day}T12:00:00+00:00`,
    },
    stdio: ['pipe', 'pipe', 'pipe'],
  }).trim();
}

function fixture(t) {
  const directory = mkdtempSync(join(tmpdir(), 'support-history-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const root = join(directory, 'repository');
  mkdirSync(root);
  git(root, ['init', '--quiet', '--initial-branch=main']);
  git(root, ['config', 'user.name', 'History fixture']);
  git(root, ['config', 'user.email', 'history-fixture@example.invalid']);
  mkdirSync(join(root, 'content'));
  return { root, directory, source: 'content/probe.md' };
}

function article(updated = '2026-08-01', body = 'Original body.', title = 'A guide') {
  return `---\nid: probe\ntitle: ${title}\npath: /help\ncategory: probe\ntags: probe\nupdated: ${updated}\nscope: public\n---\n\n## Steps\n\n${body}\n`;
}

function write(f, raw, source = f.source) {
  mkdirSync(dirname(join(f.root, source)), { recursive: true });
  writeFileSync(join(f.root, source), raw);
}

function commit(f, day = '2026-08-01') {
  git(f.root, ['add', '--', 'content']);
  git(f.root, ['-c', 'core.hooksPath=/dev/null', 'commit', '--quiet', '-m', 'fixture'], day);
  return git(f.root, ['rev-parse', 'HEAD']);
}

function inspect(f, options = {}) {
  return inspectSupportHistory({ repoRoot: f.root, contentDir: 'content', ...options });
}

function onlyRow(result) {
  assert.equal(result.articleCount, 1);
  assert.equal(result.articles.length, 1);
  return result.articles[0];
}

function expectIssue(result, pattern) {
  assert.equal(result.ok, false);
  assert.match(onlyRow(result).issues.join('\n'), pattern);
}

test('the canonical parser retains strict missing, duplicate and unknown frontmatter checks', () => {
  assert.equal(parseFrontmatter(article(), 'probe').body, '\n## Steps\n\nOriginal body.\n');
  for (const [raw, pattern] of [
    [article().replace('updated: 2026-08-01\n', ''), /missing required frontmatter key: updated/u],
    [
      article().replace('scope: public', 'updated: 2026-08-01\nscope: public'),
      /duplicate frontmatter key/u,
    ],
    [
      article().replace('scope: public', 'reviewed: yesterday\nscope: public'),
      /unknown frontmatter key/u,
    ],
    [article().replace('scope: public', 'scope: private'), /scope must be/u],
  ])
    assert.throws(() => parseFrontmatter(raw, 'probe'), pattern);
});

test('calendar validation accepts leap days and rejects normalized impossible dates', () => {
  assert.equal(calendarDay('2024-02-29', 'probe'), '2024-02-29');
  for (const day of [
    '2026-02-29',
    '2026-02-30',
    '2026-13-01',
    '2026-00-01',
    '2026-01-00',
    '2026-8-01',
  ]) {
    assert.throws(() => calendarDay(day, 'probe'), /invalid/u);
  }
});

test('a committed article records its body addition day and stable source/index evidence', (t) => {
  const f = fixture(t);
  write(f, article());
  const head = commit(f);
  const result = inspect(f);
  assert.equal(result.ok, true);
  const row = onlyRow(result);
  assert.equal(row.latestCommittedBodyChange.commit, head);
  assert.equal(row.latestCommittedBodyChange.day, '2026-08-01');
  assert.equal(row.latestCommittedBodyChange.addition, true);
  assert.equal(row.sourceStable, true);
  assert.equal(row.indexStable, true);
  assert.equal(result.indexArticleSetStable, true);
  assert.equal(row.workingBodyDiffersFromHead, false);
});

test('a later frontmatter-only commit does not advance the body date', (t) => {
  const f = fixture(t);
  write(f, article());
  const addition = commit(f);
  write(f, article('2026-08-01', 'Original body.', 'Renamed title'));
  commit(f, '2026-08-05');
  const result = inspect(f);
  assert.equal(result.ok, true);
  assert.equal(onlyRow(result).latestCommittedBodyChange.commit, addition);
});

test('a body edit after updated fails and the CLI exits nonzero', (t) => {
  const f = fixture(t);
  write(f, article());
  commit(f);
  write(f, article('2026-08-01', 'Changed body.'));
  commit(f, '2026-08-05');
  expectIssue(inspect(f), /Body changed later than updated: 2026-08-05 > 2026-08-01/u);
  const cli = spawnSync(
    process.execPath,
    [SCRIPT, '--root', f.root, '--content', 'content', '--json'],
    { encoding: 'utf8' },
  );
  assert.equal(cli.status, 1);
  assert.equal(JSON.parse(cli.stdout).ok, false);
});

test('an unsupported later metadata date fails even when body did not change', (t) => {
  const f = fixture(t);
  write(f, article());
  commit(f);
  write(f, article('2026-08-05'));
  commit(f, '2026-08-05');
  expectIssue(inspect(f), /Updated is later than the last body change/u);
});

test('missing and impossible article dates fail instead of disappearing from coverage', (t) => {
  const f = fixture(t);
  write(f, article());
  commit(f);
  write(f, article('2026-02-30'));
  expectIssue(inspect(f), /invalid calendar day/u);
  write(f, article().replace('updated: 2026-08-01\n', ''));
  expectIssue(inspect(f), /missing required frontmatter key/u);
});

test('an unchanged rename preserves the earlier body day', (t) => {
  const f = fixture(t);
  write(f, article());
  const addition = commit(f);
  renameSync(join(f.root, f.source), join(f.root, 'content/renamed.md'));
  f.source = 'content/renamed.md';
  commit(f, '2026-08-05');
  const result = inspect(f);
  assert.equal(result.ok, true);
  assert.equal(onlyRow(result).latestCommittedBodyChange.commit, addition);
  assert.equal(onlyRow(result).latestCommittedBodyChange.path, 'content/probe.md');
});

test('rename with a body edit records the new path change day', (t) => {
  const f = fixture(t);
  write(f, article('2026-08-01', 'Original body. '.repeat(20)));
  commit(f);
  renameSync(join(f.root, f.source), join(f.root, 'content/renamed.md'));
  f.source = 'content/renamed.md';
  write(f, article('2026-08-05', `${'Original body. '.repeat(20)}An additional instruction.`));
  const changed = commit(f, '2026-08-05');
  const result = inspect(f);
  assert.equal(result.ok, true);
  assert.equal(onlyRow(result).latestCommittedBodyChange.commit, changed);
  assert.equal(onlyRow(result).latestCommittedBodyChange.day, '2026-08-05');
});

test('indistinguishable deleted bodies make a Git-selected rename explicitly unresolved', (t) => {
  const f = fixture(t);
  write(f, article());
  write(f, article().replace('id: probe', 'id: other'), 'content/other.md');
  commit(f);
  renameSync(join(f.root, f.source), join(f.root, 'content/renamed.md'));
  f.source = 'content/renamed.md';
  unlinkSync(join(f.root, 'content/other.md'));
  commit(f, '2026-08-05');
  expectIssue(inspect(f), /ambiguous rename history/u);
});

test('the rename lineage may begin outside the current content directory', (t) => {
  const f = fixture(t);
  write(f, article(), 'archive/old.md');
  git(f.root, ['add', '--', 'archive']);
  git(f.root, ['-c', 'core.hooksPath=/dev/null', 'commit', '--quiet', '-m', 'fixture']);
  renameSync(join(f.root, 'archive/old.md'), join(f.root, f.source));
  git(f.root, ['add', '--', 'archive', 'content']);
  git(
    f.root,
    ['-c', 'core.hooksPath=/dev/null', 'commit', '--quiet', '-m', 'fixture'],
    '2026-08-05',
  );
  const result = inspect(f);
  assert.equal(result.ok, true);
  assert.equal(onlyRow(result).latestCommittedBodyChange.path, 'archive/old.md');
});

test('a recreated path starts a new article body lineage', (t) => {
  const f = fixture(t);
  write(f, article());
  commit(f);
  unlinkSync(join(f.root, f.source));
  commit(f, '2026-08-03');
  write(f, article('2026-08-05', 'A new guide.'));
  const recreated = commit(f, '2026-08-05');
  const result = inspect(f);
  assert.equal(result.ok, true);
  assert.equal(onlyRow(result).latestCommittedBodyChange.commit, recreated);
  assert.equal(onlyRow(result).latestCommittedBodyChange.addition, true);
});

test('a merge records the publication body change against its first parent without switching branches', (t) => {
  const f = fixture(t);
  write(f, article());
  const base = commit(f);
  write(f, article('2026-08-05', 'Branch instruction.'));
  git(f.root, ['add', '--', 'content']);
  const sideTree = git(f.root, ['write-tree']);
  const side = git(
    f.root,
    ['commit-tree', sideTree, '-p', base, '-m', 'side fixture'],
    '2026-08-05',
  );
  write(f, article('2026-08-01', 'Original body.', 'Main title'));
  git(f.root, ['add', '--', 'content']);
  const mainTree = git(f.root, ['write-tree']);
  const main = git(
    f.root,
    ['commit-tree', mainTree, '-p', base, '-m', 'main fixture'],
    '2026-08-06',
  );
  write(f, article('2026-08-08', 'Branch instruction.', 'Main title'));
  git(f.root, ['add', '--', 'content']);
  const mergeTree = git(f.root, ['write-tree']);
  const merge = git(
    f.root,
    ['commit-tree', mergeTree, '-p', main, '-p', side, '-m', 'merge fixture'],
    '2026-08-08',
  );
  git(f.root, ['update-ref', 'HEAD', merge]);
  const result = inspect(f);
  assert.equal(result.ok, true);
  assert.equal(onlyRow(result).latestCommittedBodyChange.commit, merge);
  assert.equal(onlyRow(result).latestCommittedBodyChange.merge, true);
});

test('an uncommitted working body stays pending even with today declared in updated', (t) => {
  const f = fixture(t);
  write(f, article());
  commit(f);
  write(f, article('2026-08-05', 'Pending instruction.'));
  const result = inspect(f);
  expectIssue(result, /Uncommitted body change/u);
  const row = onlyRow(result);
  assert.equal(row.workingUpdated, '2026-08-05');
  assert.equal(row.latestCommittedBodyChange.day, '2026-08-01');
  assert.equal(row.workingBodyDiffersFromHead, true);
  assert.equal(row.indexBodyDiffersFromHead, false);
});

test('a staged pending body cannot pass when the working body matches HEAD again', (t) => {
  const f = fixture(t);
  write(f, article());
  commit(f);
  write(f, article('2026-08-05', 'Pending staged instruction.'));
  git(f.root, ['add', '--', 'content']);
  write(f, article());
  const result = inspect(f);
  expectIssue(result, /Uncommitted body change/u);
  const row = onlyRow(result);
  assert.equal(row.workingBodyDiffersFromHead, false);
  assert.equal(row.indexBodyDiffersFromHead, true);
  assert.equal(row.indexUpdated, '2026-08-05');
});

test('staged frontmatter with a wrong later date cannot pass under a correct working date', (t) => {
  const f = fixture(t);
  write(f, article());
  commit(f);
  write(f, article('2026-08-05'));
  git(f.root, ['add', '--', 'content']);
  write(f, article());
  const result = inspect(f);
  const row = onlyRow(result);
  assert.equal(row.workingBodyDiffersFromHead, false);
  assert.equal(row.indexBodyDiffersFromHead, false);
  assert.equal(row.workingUpdated, '2026-08-01');
  assert.equal(row.indexUpdated, '2026-08-05');
  expectIssue(result, /Index updated is later than the last body change/u);
});

test('frontmatter corrections can prove unchanged committed body dates before commit', (t) => {
  const f = fixture(t);
  write(f, article('2026-07-31'));
  commit(f);
  expectIssue(inspect(f), /Body changed later/u);
  write(f, article());
  expectIssue(inspect(f), /Index body changed later than updated/u);
  git(f.root, ['add', '--', 'content']);
  const result = inspect(f);
  assert.equal(result.ok, true);
  assert.equal(onlyRow(result).workingMetadataDiffersFromHead, true);
  assert.equal(onlyRow(result).indexMetadataDiffersFromHead, true);
  assert.equal(onlyRow(result).indexBodyDiffersFromHead, false);
});

test('line ending conversion is not a new content body day', (t) => {
  const f = fixture(t);
  write(f, article());
  const addition = commit(f);
  write(f, article().replace(/\n/gu, '\r\n'));
  commit(f, '2026-08-05');
  const result = inspect(f);
  assert.equal(result.ok, true);
  assert.equal(onlyRow(result).latestCommittedBodyChange.commit, addition);
});

test('untracked and newly staged articles fail with explicit missing committed provenance', (t) => {
  const f = fixture(t);
  write(f, article());
  commit(f);
  write(f, article().replace('id: probe', 'id: added'), 'content/added.md');
  for (const staged of [false, true]) {
    if (staged) git(f.root, ['add', '--', 'content/added.md']);
    const result = inspect(f);
    assert.equal(result.ok, false);
    const row = result.articles.find((entry) => entry.docId === 'added');
    assert.ok(row);
    assert.match(row.issues.join('\n'), /no committed current-path provenance/u);
  }
});

test('a new staged article introduced during collection cannot escape the index file set', (t) => {
  const f = fixture(t);
  write(f, article());
  commit(f);
  const added = 'content/added.md';
  const originalSpawnSync = childProcess.spawnSync;
  let introduced = false;
  const intercepted = t.mock.method(childProcess, 'spawnSync', (command, args, options) => {
    const result = originalSpawnSync(command, args, options);
    if (!introduced && command === 'git' && args[1] === f.root && args[2] === 'log') {
      introduced = true;
      write(f, article().replace('id: probe', 'id: added'), added);
      git(f.root, ['add', '--', added]);
      unlinkSync(join(f.root, added));
    }
    return result;
  });
  syncBuiltinESMExports();
  let result;
  try {
    result = inspect(f);
  } finally {
    intercepted.mock.restore();
    syncBuiltinESMExports();
  }
  assert.equal(introduced, true);
  assert.equal(git(f.root, ['ls-files', '--', added]), added);
  assert.throws(() => readFileSync(join(f.root, added)), { code: 'ENOENT' });
  assert.equal(onlyRow(result).sourceStable, true);
  assert.equal(onlyRow(result).indexStable, true);
  assert.equal(result.headStable, true);
  assert.equal(result.ok, false);
  assert.equal(result.indexArticleSetStable, false);
  assert.match(result.issues.join('\n'), /Article index file set changed/u);
});

test('unavailable final index enumeration cannot prove a stable article set', (t) => {
  const f = fixture(t);
  write(f, article());
  commit(f);
  const originalSpawnSync = childProcess.spawnSync;
  let enumerations = 0;
  const intercepted = t.mock.method(childProcess, 'spawnSync', (command, args, options) => {
    const result = originalSpawnSync(command, args, options);
    if (command === 'git' && args[1] === f.root && args[2] === 'ls-files' && args[3] === '-z') {
      enumerations += 1;
      if (enumerations === 2)
        return { ...result, status: 1, stderr: 'Fixture index enumeration unavailable.\n' };
    }
    return result;
  });
  syncBuiltinESMExports();
  let result;
  try {
    result = inspect(f);
  } finally {
    intercepted.mock.restore();
    syncBuiltinESMExports();
  }
  assert.equal(enumerations, 2);
  assert.equal(onlyRow(result).sourceStable, true);
  assert.equal(onlyRow(result).indexStable, true);
  assert.equal(result.headStable, true);
  assert.equal(result.indexArticleSetStable, false);
  assert.equal(result.ok, false);
  assert.match(result.issues.join('\n'), /Git history unavailable \(ls-files\)/u);
});

test('a shallow local clone fails clearly despite containing a currently valid article', (t) => {
  const f = fixture(t);
  write(f, article());
  commit(f);
  write(f, article('2026-08-01', 'Original body.', 'New title'));
  commit(f, '2026-08-05');
  const clone = join(f.directory, 'shallow');
  execFileSync('git', ['clone', '--quiet', '--depth=1', `file://${f.root}`, clone], {
    stdio: 'pipe',
  });
  assert.throws(
    () => inspectSupportHistory({ repoRoot: clone, contentDir: 'content' }),
    /Full Git history required: shallow checkout/u,
  );
});

test('missing historical blobs fail instead of substituting the current date', (t) => {
  const f = fixture(t);
  write(f, article());
  const addition = commit(f);
  const blob = git(f.root, ['rev-parse', `${addition}:${f.source}`]);
  write(f, article('2026-08-05', 'Changed body.'));
  commit(f, '2026-08-05');
  unlinkSync(join(f.root, '.git/objects', blob.slice(0, 2), blob.slice(2)));
  expectIssue(inspect(f), /Git history unavailable \(cat-file\)/u);
});

test('missing parent commit objects fail the full-history prerequisite', (t) => {
  const f = fixture(t);
  write(f, article());
  const addition = commit(f);
  write(f, article('2026-08-01', 'Original body.', 'Changed title'));
  commit(f, '2026-08-05');
  unlinkSync(join(f.root, '.git/objects', addition.slice(0, 2), addition.slice(2)));
  assert.throws(() => inspect(f), /Git history unavailable \(rev-list\)/u);
});

test('replacement history and over-budget file history fail rather than guess', (t) => {
  const f = fixture(t);
  write(f, article());
  const addition = commit(f);
  for (const day of ['2026-08-03', '2026-08-05']) {
    write(f, article('2026-08-01', 'Original body.', `Title ${day}`));
    commit(f, day);
  }
  expectIssue(inspect(f, { maxHistoryCommits: 2 }), /history exceeds 2 file commits/u);
  const latest = git(f.root, ['rev-parse', 'HEAD']);
  git(f.root, ['replace', addition, latest]);
  assert.throws(() => inspect(f), /replacement objects/u);
});

test('an empty corpus or repository without commits cannot pass', (t) => {
  const f = fixture(t);
  assert.throws(() => inspect(f), /Git history unavailable/u);
  write(f, article());
  commit(f);
  unlinkSync(join(f.root, f.source));
  commit(f, '2026-08-05');
  assert.throws(() => inspect(f), /No support Markdown articles/u);
});

test('a missing tracked article cannot disappear from an otherwise valid corpus', (t) => {
  const f = fixture(t);
  write(f, article());
  write(f, article().replace('id: probe', 'id: remaining'), 'content/remaining.md');
  commit(f);
  unlinkSync(join(f.root, f.source));
  const result = inspect(f);
  assert.equal(result.articleCount, 2);
  assert.equal(result.ok, false);
  const missing = result.articles.find((row) => row.source === f.source);
  assert.ok(missing);
  assert.match(missing.issues.join('\n'), /tracked article missing from the working tree/u);
});

test('partial checkout fails before any lazy object fetch can be attempted', (t) => {
  const f = fixture(t);
  write(f, article());
  commit(f);
  git(f.root, ['config', 'remote.origin.promisor', 'true']);
  assert.throws(() => inspect(f), /partial\/promisor checkout/u);
});

test('a body revert is itself a body change, even if the old body hash returns', (t) => {
  const f = fixture(t);
  write(f, article());
  commit(f);
  write(f, article('2026-08-05', 'Changed body.'));
  commit(f, '2026-08-05');
  write(f, article('2026-08-08'));
  const reverted = commit(f, '2026-08-08');
  const result = inspect(f);
  assert.equal(result.ok, true);
  assert.equal(onlyRow(result).latestCommittedBodyChange.commit, reverted);
});

test('source-stability witness detects changed and removed files', (t) => {
  const f = fixture(t);
  write(f, article());
  const file = join(f.root, f.source);
  const hash = createHash('sha256').update(readFileSync(file)).digest('hex');
  assert.equal(sourceStillMatches(file, hash), true);
  write(f, article('2026-08-05', 'Changed body.'));
  assert.equal(sourceStillMatches(file, hash), false);
  unlinkSync(file);
  assert.equal(sourceStillMatches(file, hash), false);
});

test('CLI rejects missing and unknown arguments without a green empty selection', (t) => {
  const f = fixture(t);
  for (const args of [['--content'], ['--unknown']]) {
    const cli = spawnSync(process.execPath, [SCRIPT, ...args, '--root', f.root], {
      encoding: 'utf8',
    });
    assert.equal(cli.status, 1);
    assert.match(cli.stderr, /requires a path|Unknown argument/u);
  }
});
