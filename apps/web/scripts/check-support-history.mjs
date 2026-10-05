#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { parseFrontmatter } from './lib/support-frontmatter.mjs';

const DEFAULT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const DEFAULT_CONTENT = 'apps/web/content/support';
const COMMIT = /^[0-9a-f]{40,64}$/u;
const HISTORY_SCOPE =
  'Full first-parent publication history, following renames; a merge counts when its body differs from its first parent.';

export class SupportHistoryError extends Error {}

function git(root, args, input, allowedStatuses = []) {
  const result = spawnSync('git', ['-C', root, ...args], {
    input,
    encoding: 'utf8',
    maxBuffer: 8 * 1024 * 1024,
    timeout: 10_000,
    env: {
      ...process.env,
      GIT_NO_LAZY_FETCH: '1',
      GIT_NO_REPLACE_OBJECTS: '1',
      GIT_OPTIONAL_LOCKS: '0',
      GIT_TERMINAL_PROMPT: '0',
    },
  });
  if (result.error || (result.status !== 0 && !allowedStatuses.includes(result.status))) {
    throw new SupportHistoryError(
      `Git history unavailable (${args[0]}): ${result.error?.message ?? result.stderr.trim()}`,
    );
  }
  return result.stdout;
}

export function calendarDay(value, label) {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) {
    throw new SupportHistoryError(`${label}: invalid updated day ${JSON.stringify(value)}`);
  }
  const parsed = new Date(`${value}T00:00:00Z`);
  if (!Number.isFinite(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new SupportHistoryError(`${label}: invalid calendar day ${value}`);
  }
  return value;
}

function digest(raw) {
  return createHash('sha256').update(raw).digest('hex');
}

function historyEntries(raw, file) {
  const tokens = raw.split('\0');
  const entries = [];
  let cursor = 0;
  while (cursor < tokens.length) {
    if (tokens[cursor] === '') {
      cursor += 1;
      continue;
    }
    const commit = tokens[cursor++];
    const committedAt = tokens[cursor++];
    const parentText = tokens[cursor++];
    if (!COMMIT.test(commit) || !committedAt || parentText === undefined) {
      throw new SupportHistoryError(`${file}: malformed Git history record`);
    }
    const parents = parentText === '' ? [] : parentText.split(' ');
    if (parents.some((parent) => !COMMIT.test(parent))) {
      throw new SupportHistoryError(`${file}: malformed Git parent record`);
    }
    const changes = [];
    while (cursor < tokens.length) {
      if (tokens[cursor] === '') {
        cursor += 1;
        continue;
      }
      if (COMMIT.test(tokens[cursor])) break;
      const status = tokens[cursor++].replace(/^\n/u, '');
      if (!/^(?:[AMDT]|[RC]\d+)$/u.test(status)) {
        throw new SupportHistoryError(`${file}: unsupported Git history status ${status}`);
      }
      const oldPath = tokens[cursor++];
      const newPath = /^[RC]/u.test(status) ? tokens[cursor++] : oldPath;
      if (!oldPath || !newPath) {
        throw new SupportHistoryError(`${file}: missing Git history path`);
      }
      changes.push({ status, oldPath, newPath });
    }
    entries.push({ commit, committedAt, parents, changes });
  }
  return entries;
}

function readBlob(root, revision, file) {
  const tree = git(root, ['ls-tree', '-z', revision, '--', file]);
  if (tree === '') return null;
  const match = /^\d+ blob ([0-9a-f]{40,64})\t([^\0]+)\0$/u.exec(tree);
  if (!match || match[2] !== file) {
    throw new SupportHistoryError(`${file}: ambiguous or non-file Git tree entry at ${revision}`);
  }
  return git(root, ['cat-file', 'blob', match[1]]);
}

function assertRenameUnambiguous(root, entry, previousBody, file) {
  const tokens = git(root, [
    'diff-tree',
    '--no-commit-id',
    '--name-status',
    '-z',
    '-r',
    '--no-renames',
    entry.parents[0],
    entry.commit,
  ]).split('\0');
  let candidates = 0;
  for (let cursor = 0; cursor < tokens.length && tokens[cursor] !== ''; cursor += 2) {
    const status = tokens[cursor];
    const path = tokens[cursor + 1];
    if (!/^[AMDT]$/u.test(status) || !path) {
      throw new SupportHistoryError(`${file}: malformed rename ancestry diff`);
    }
    if (status !== 'D' || !path.endsWith('.md')) continue;
    const raw = readBlob(root, entry.parents[0], path);
    if (raw === null) throw new SupportHistoryError(`${file}: missing rename candidate history`);
    if (!raw.replace(/\r\n/gu, '\n').startsWith('---\n')) continue;
    if (parseFrontmatter(raw, `${path}@${entry.parents[0]}`).body === previousBody) candidates += 1;
  }
  if (candidates > 1) {
    throw new SupportHistoryError(
      `${file}: ambiguous rename history; ${candidates} deleted articles share the previous body`,
    );
  }
}

function latestBodyEvent(root, head, file, limit) {
  const entries = historyEntries(
    git(root, [
      'log',
      '--first-parent',
      '--follow',
      '--diff-merges=first-parent',
      '--find-renames',
      `--max-count=${limit + 1}`,
      '--format=%H%x00%cI%x00%P%x00',
      '--name-status',
      '-z',
      head,
      '--',
      file,
    ]),
    file,
  );
  if (entries.length === 0) throw new SupportHistoryError(`${file}: no committed body history`);
  if (entries.length > limit) {
    throw new SupportHistoryError(
      `${file}: history exceeds ${limit} file commits; provenance unresolved`,
    );
  }
  let path = file;
  let latest = null;
  for (const entry of entries) {
    const matching = entry.changes.filter((change) => change.newPath === path);
    if (matching.length !== 1 || matching[0].status.startsWith('C')) {
      throw new SupportHistoryError(`${file}: ambiguous file ancestry at ${entry.commit}`);
    }
    const change = matching[0];
    const parentPath = change.status.startsWith('R') ? change.oldPath : path;
    const raw = readBlob(root, entry.commit, path);
    if (raw === null)
      throw new SupportHistoryError(`${file}: missing history body at ${entry.commit}`);
    const body = parseFrontmatter(raw, `${path}@${entry.commit}`).body;
    const parentRaw = entry.parents[0] ? readBlob(root, entry.parents[0], parentPath) : null;
    if (parentRaw === null && entry.parents.length > 0 && change.status !== 'A') {
      throw new SupportHistoryError(`${file}: missing previous body at ${entry.commit}`);
    }
    const parentBody =
      parentRaw === null
        ? null
        : parseFrontmatter(parentRaw, `${parentPath}@${entry.parents[0]}`).body;
    if (change.status.startsWith('R') && parentBody !== null) {
      assertRenameUnambiguous(root, entry, parentBody, file);
    }
    const day = calendarDay(entry.committedAt.slice(0, 10), `${file}@${entry.commit}`);
    if (!Number.isFinite(Date.parse(entry.committedAt))) {
      throw new SupportHistoryError(`${file}: invalid Git commit timestamp`);
    }
    if (latest === null && body !== parentBody) {
      latest = {
        commit: entry.commit,
        committedAt: entry.committedAt,
        day,
        path,
        parentPath,
        addition: parentRaw === null,
        merge: entry.parents.length > 1,
      };
    }
    path = parentPath;
    if (parentRaw === null) break;
  }
  if (latest === null) throw new SupportHistoryError(`${file}: no body-change event proved`);
  return { latest, examinedFileCommits: entries.length };
}

function indexBlob(root, file) {
  const raw = git(root, ['ls-files', '--stage', '-z', '--', file]);
  if (raw === '') return null;
  const match = /^\d+ ([0-9a-f]{40,64}) 0\t([^\0]+)\0$/u.exec(raw);
  if (!match || match[2] !== file) {
    throw new SupportHistoryError(`${file}: unmerged or ambiguous index entry`);
  }
  return git(root, ['cat-file', 'blob', match[1]]);
}

function articlePaths(raw, contentPath) {
  return [
    ...new Set(
      raw.split('\0').filter((path) => path.endsWith('.md') && dirname(path) === contentPath),
    ),
  ].sort();
}

function assertFullHistory(root) {
  if (git(root, ['rev-parse', '--is-shallow-repository']).trim() !== 'false') {
    throw new SupportHistoryError(
      'Full Git history required: shallow checkout; fetch full history before checking support dates.',
    );
  }
  if (git(root, ['replace', '-l']).trim() !== '') {
    throw new SupportHistoryError(
      'Full Git history required: replacement objects make provenance ambiguous.',
    );
  }
  const partial = git(
    root,
    ['config', '--local', '--get-regexp', '^(extensions\\.partialclone|remote\\..*\\.promisor)$'],
    undefined,
    [1],
  );
  if (partial.split('\n').some((line) => line !== '' && !line.endsWith(' false'))) {
    throw new SupportHistoryError(
      'Full Git history required: partial/promisor checkout cannot prove all historical bodies without fetching.',
    );
  }
  const grafts = git(root, ['rev-parse', '--git-path', 'info/grafts']).trim();
  const graftPath = isAbsolute(grafts) ? grafts : join(root, grafts);
  if (existsSync(graftPath) && readFileSync(graftPath, 'utf8').trim() !== '') {
    throw new SupportHistoryError('Full Git history required: grafted history is not supported.');
  }
  const head = git(root, ['rev-parse', '--verify', 'HEAD']).trim();
  git(root, ['rev-list', '--parents', head]);
  return head;
}

export function sourceStillMatches(file, sourceSha256) {
  return existsSync(file) && digest(readFileSync(file, 'utf8')) === sourceSha256;
}

export function inspectSupportHistory({
  repoRoot = DEFAULT_ROOT,
  contentDir = DEFAULT_CONTENT,
  maxHistoryCommits = 1000,
} = {}) {
  const root = resolve(repoRoot);
  const directory = resolve(root, contentDir);
  const directoryPath = relative(root, directory);
  if (directoryPath === '..' || directoryPath.startsWith(`..${sep}`) || isAbsolute(directoryPath)) {
    throw new SupportHistoryError('Support content must be inside the Git working tree.');
  }
  if (!Number.isSafeInteger(maxHistoryCommits) || maxHistoryCommits < 1) {
    throw new SupportHistoryError('History budget must be a positive integer.');
  }
  const head = assertFullHistory(root);
  const workingNames = readdirSync(directory)
    .filter((name) => name.endsWith('.md'))
    .sort();
  const contentPath = directoryPath.split(sep).join('/');
  const indexPaths = articlePaths(git(root, ['ls-files', '-z', '--', contentPath]), contentPath);
  const trackedPaths = [
    ...articlePaths(
      git(root, ['ls-tree', '-r', '--name-only', '-z', head, '--', contentPath]),
      contentPath,
    ),
    ...indexPaths,
  ];
  const names = [
    ...new Set([
      ...workingNames,
      ...trackedPaths.map((path) => path.slice(contentPath.length + 1)),
    ]),
  ].sort();
  if (names.length === 0)
    throw new SupportHistoryError(
      'No support Markdown articles found; history check cannot pass over an empty corpus.',
    );
  const articles = names.map((name) => {
    const absolutePath = join(directory, name);
    const source = relative(root, absolutePath).split(sep).join('/');
    const raw = existsSync(absolutePath) ? readFileSync(absolutePath, 'utf8') : null;
    const row = {
      source,
      sourceSha256: raw === null ? null : digest(raw),
      sourceStable: null,
      issues: [],
    };
    try {
      if (raw === null)
        throw new SupportHistoryError(
          `${source}: tracked article missing from the working tree; deletion is pending, not committed provenance`,
        );
      const current = parseFrontmatter(raw, source);
      row.docId = current.data.id;
      row.workingUpdated = calendarDay(current.data.updated, source);
      const committedRaw = readBlob(root, head, source);
      const stagedRaw = indexBlob(root, source);
      if (committedRaw === null || stagedRaw === null) {
        throw new SupportHistoryError(
          `${source}: untracked or newly staged article; no committed current-path provenance`,
        );
      }
      const committed = parseFrontmatter(committedRaw, `${source}@HEAD`);
      const staged = parseFrontmatter(stagedRaw, `${source}@index`);
      row.committedUpdated = committed.data.updated;
      row.indexUpdated = calendarDay(staged.data.updated, `${source}@index`);
      row.indexSourceSha256 = digest(stagedRaw);
      row.committedBodySha256 = digest(committed.body);
      row.indexBodySha256 = digest(staged.body);
      row.workingBodySha256 = digest(current.body);
      row.indexBodyDiffersFromHead = staged.body !== committed.body;
      row.workingBodyDiffersFromHead = current.body !== committed.body;
      row.workingBodyDiffersFromIndex = current.body !== staged.body;
      row.workingMetadataDiffersFromHead =
        JSON.stringify(current.data) !== JSON.stringify(committed.data);
      row.indexMetadataDiffersFromHead =
        JSON.stringify(staged.data) !== JSON.stringify(committed.data);
      const history = latestBodyEvent(root, head, source, maxHistoryCommits);
      row.latestCommittedBodyChange = history.latest;
      row.examinedFileCommits = history.examinedFileCommits;
      if (row.workingBodyDiffersFromHead || row.indexBodyDiffersFromHead) {
        row.issues.push(
          'Uncommitted body change: working/index dates are pending declarations, not proved committed body dates.',
        );
      } else {
        if (row.workingUpdated !== history.latest.day) {
          row.issues.push(
            row.workingUpdated < history.latest.day
              ? `Body changed later than updated: ${history.latest.day} > ${row.workingUpdated} (${history.latest.commit}).`
              : `Updated is later than the last body change: ${row.workingUpdated} > ${history.latest.day}; a frontmatter-only review is not a body change.`,
          );
        }
        if (row.indexUpdated !== history.latest.day) {
          row.issues.push(
            row.indexUpdated < history.latest.day
              ? `Index body changed later than updated: ${history.latest.day} > ${row.indexUpdated} (${history.latest.commit}).`
              : `Index updated is later than the last body change: ${row.indexUpdated} > ${history.latest.day}; the staged metadata is not a body change.`,
          );
        }
      }
    } catch (error) {
      row.issues.push(error instanceof Error ? error.message : String(error));
    }
    return row;
  });
  const issues = [];
  const headStable = git(root, ['rev-parse', '--verify', 'HEAD']).trim() === head;
  if (!headStable)
    issues.push('HEAD changed during history collection; rerun against a stable source.');
  const namesAfter = readdirSync(directory)
    .filter((name) => name.endsWith('.md'))
    .sort();
  if (JSON.stringify(namesAfter) !== JSON.stringify(workingNames))
    issues.push('Article file set changed during history collection.');
  for (const row of articles) {
    row.sourceStable = sourceStillMatches(join(root, row.source), row.sourceSha256);
    if (!row.sourceStable)
      row.issues.push('Article source changed during history collection; provenance unresolved.');
    try {
      const staged = indexBlob(root, row.source);
      row.indexStable =
        staged !== null &&
        row.indexSourceSha256 !== undefined &&
        digest(staged) === row.indexSourceSha256;
      if (!row.indexStable)
        row.issues.push('Article index changed or was not resolved during history collection.');
    } catch (error) {
      row.indexStable = false;
      row.issues.push(error instanceof Error ? error.message : String(error));
    }
  }
  let indexArticleSetStable = false;
  try {
    const indexPathsAfter = articlePaths(
      git(root, ['ls-files', '-z', '--', contentPath]),
      contentPath,
    );
    indexArticleSetStable = JSON.stringify(indexPathsAfter) === JSON.stringify(indexPaths);
    if (!indexArticleSetStable)
      issues.push(
        'Article index file set changed during history collection; provenance unresolved.',
      );
  } catch (error) {
    issues.push(error instanceof Error ? error.message : String(error));
  }
  return {
    historyScope: HISTORY_SCOPE,
    head,
    headStable,
    indexArticleSetStable,
    articleCount: articles.length,
    articles,
    issues,
    ok: issues.length === 0 && articles.every((row) => row.issues.length === 0),
  };
}

function main(argv) {
  const options = {};
  let json = false;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--json') json = true;
    else if (argument === '--root' || argument === '--content') {
      const value = argv[++index];
      if (!value || value.startsWith('--'))
        throw new SupportHistoryError(`${argument} requires a path`);
      options[argument === '--root' ? 'repoRoot' : 'contentDir'] = value;
    } else throw new SupportHistoryError(`Unknown argument: ${argument}`);
  }
  const result = inspectSupportHistory(options);
  if (json) process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  else {
    for (const issue of result.issues) process.stderr.write(`check-support-history: ${issue}\n`);
    for (const article of result.articles) {
      for (const issue of article.issues) process.stderr.write(`${article.source}: ${issue}\n`);
    }
    process.stdout.write(
      `check-support-history: ${result.articleCount} articles, ${result.articles.filter((article) => article.issues.length > 0).length} unresolved or invalid dates.\n`,
    );
  }
  if (!result.ok) process.exitCode = 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(
      `check-support-history: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  }
}
