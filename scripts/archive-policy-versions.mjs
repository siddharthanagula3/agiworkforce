#!/usr/bin/env node
// A replaced policy stays readable. For every dated version the history in
// docs/compliance/policy-versions.json has moved past, this renders the text
// the page last published under that date, at the newest commit that printed
// that date with the text the history last records under it, and writes it
// where /legal/archive reads it.
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { CONSTANTS, REGISTRY, copyDigest, readConstantObject } from './check-policy-versions.mjs';
import {
  ARCHIVE_INDEX,
  ARCHIVE_MANIFEST,
  archiveExpectations,
  archiveFile,
  lastDigest,
  readGitObjects,
  renderIndex,
  renderManifest,
} from './lib/policy-archive.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SPEC = 'scripts/lib/policy-archive-render-spec.mjs';
const SPEC_NAME = 'policy-archive-render.test.ts';
const SPARSE = ['/apps/web/', '/packages/', '/*.json', '/*.ts', '/*.mjs', '/*.yaml'];

function git(args, input) {
  return execFileSync('git', ['-C', root, ...args], {
    encoding: 'utf8',
    input,
    maxBuffer: 512 * 1024 * 1024,
  });
}

function blobIds(specs) {
  return git(['cat-file', '--batch-check'], `${specs.join('\n')}\n`)
    .trimEnd()
    .split('\n')
    .map((line) => (line.endsWith(' missing') ? null : line.split(' ')[0]));
}

function datedCommits() {
  const commits = git(['log', '--format=%H %ct %cI', 'HEAD'])
    .trim()
    .split('\n')
    .map((line) => {
      const [sha, time, iso] = line.split(' ');
      return { sha, time: Number(time), iso };
    });
  const ids = blobIds(commits.map((commit) => `${commit.sha}:${CONSTANTS}`));
  const unique = [...new Set(ids.filter(Boolean))];
  const contents = readGitObjects(root, unique);
  const dates = new Map(
    unique.map((id, index) => [
      id,
      readConstantObject(contents[index] ?? '', 'POLICY_LAST_UPDATED') ?? {},
    ]),
  );
  return commits.map((commit, index) => ({
    ...commit,
    dates: ids[index] ? dates.get(ids[index]) : {},
  }));
}

function newestCommit(commits, mainline, target) {
  const candidates = commits
    .filter((commit) => commit.dates[target.key] === target.date)
    .sort(
      (left, right) =>
        Number(mainline.has(right.sha)) - Number(mainline.has(left.sha)) || right.time - left.time,
    );
  if (candidates.length === 0) return null;
  const pages = blobIds(candidates.map((commit) => `${commit.sha}:${target.page}`));
  const unique = [...new Set(pages.filter(Boolean))];
  const contents = readGitObjects(root, unique);
  const digests = new Map(unique.map((id, index) => [id, copyDigest(contents[index] ?? '')]));
  const index = pages.findIndex((id) => id !== null && digests.get(id) === target.digest);
  return index >= 0 ? candidates[index] : null;
}

function packageDirs(base, depth = 3) {
  const found = [];
  const visit = (relative, level) => {
    const absolute = path.join(root, relative);
    if (fs.existsSync(path.join(absolute, 'package.json'))) found.push(relative);
    if (level === 0) return;
    for (const entry of fs.readdirSync(absolute, { withFileTypes: true })) {
      if (entry.isDirectory() && entry.name !== 'node_modules' && !entry.name.startsWith('.')) {
        visit(path.join(relative, entry.name), level - 1);
      }
    }
  };
  visit(base, depth);
  return found;
}

function linkModules(dir) {
  for (const relative of ['.', 'apps/web', ...packageDirs('packages')]) {
    const from = path.join(root, relative, 'node_modules');
    const to = path.join(dir, relative, 'node_modules');
    if (fs.existsSync(from) && fs.existsSync(path.join(dir, relative)) && !fs.existsSync(to)) {
      fs.symlinkSync(from, to, 'dir');
    }
  }
}

function renderAt(commit, targets, workdir) {
  const dir = fs.mkdtempSync(path.join(workdir, 'policy-archive-'));
  try {
    git(['worktree', 'add', '--detach', '--no-checkout', dir, commit.sha]);
    execFileSync('git', ['-C', dir, 'sparse-checkout', 'set', '--no-cone', ...SPARSE]);
    execFileSync('git', ['-C', dir, 'checkout', '--quiet']);
    linkModules(dir);
    fs.copyFileSync(path.join(root, SPEC), path.join(dir, 'apps/web', SPEC_NAME));
    const payload = targets.map((target) => {
      const out = path.join(root, archiveFile(target.key, target.date));
      fs.mkdirSync(path.dirname(out), { recursive: true });
      return { ...target, commit: commit.sha, committedAt: commit.iso, out };
    });
    const result = spawnSync(
      path.join(root, 'apps/web/node_modules/.bin/vitest'),
      ['run', SPEC_NAME, '--reporter=dot'],
      {
        cwd: path.join(dir, 'apps/web'),
        env: { ...process.env, POLICY_ARCHIVE_TARGETS: JSON.stringify(payload) },
        stdio: 'inherit',
      },
    );
    if (result.status !== 0) throw new Error(`rendering the policies at ${commit.sha} failed`);
  } finally {
    spawnSync('git', ['-C', root, 'worktree', 'remove', '--force', dir], { stdio: 'ignore' });
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function main() {
  const flag = process.argv.indexOf('--workdir');
  const workdir = flag >= 0 ? path.resolve(process.argv[flag + 1]) : os.tmpdir();
  const registry = JSON.parse(fs.readFileSync(path.join(root, REGISTRY), 'utf8'));
  const routes = readConstantObject(
    fs.readFileSync(path.join(root, CONSTANTS), 'utf8'),
    'CANONICAL_POLICY_ROUTES',
  );
  const exists = (key, date) => fs.existsSync(path.join(root, archiveFile(key, date)));
  const missing = Object.entries(archiveExpectations(registry, routes, exists)).flatMap(
    ([key, policy]) =>
      policy.versions
        .map((version, position) => ({ version, newer: policy.versions[position - 1] }))
        .filter(({ version }) => version.status === 'missing')
        .map(({ version, newer }) => ({
          key,
          route: policy.route,
          page: registry.documents[key].page,
          date: version.date,
          digest: lastDigest(registry.documents[key], version.date),
          replacedOn: newer?.date ?? null,
        })),
  );

  const unresolved = [];
  if (missing.length > 0) {
    const commits = datedCommits();
    const mainline = new Set(git(['rev-list', '--first-parent', 'HEAD']).trim().split('\n'));
    const byCommit = new Map();
    for (const target of missing) {
      const commit = newestCommit(commits, mainline, target);
      if (!commit) {
        unresolved.push(target);
        continue;
      }
      const group = byCommit.get(commit.sha) ?? { commit, targets: [] };
      group.targets.push(target);
      byCommit.set(commit.sha, group);
    }
    for (const { commit, targets } of byCommit.values()) renderAt(commit, targets, workdir);
  }

  const policies = archiveExpectations(registry, routes, exists);
  fs.writeFileSync(
    path.join(root, ARCHIVE_MANIFEST),
    renderManifest(policies, registry.recordedSince),
  );
  fs.writeFileSync(path.join(root, ARCHIVE_INDEX), renderIndex(policies));

  for (const target of unresolved) {
    console.error(
      `${target.route} dated ${target.date}: no commit on this branch printed that date with the text ${REGISTRY} last records under it (digest ${target.digest}), so its text cannot be rendered. If it is lost, set "archive": "not-retained" on its first entry in ${REGISTRY}.`,
    );
  }
  if (unresolved.length > 0) process.exit(1);
  console.log(`archive-policy-versions: ${missing.length} version(s) archived.`);
}

main();
