#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const LOCK_PATH = join(REPO_ROOT, 'skills-lock.json');

const HASH_ALGORITHM = 'agiskill-sha256-v1';
const LOCK_VERSION = 2;
const DEFAULT_ROOTS = ['.agents/skills'];
const DEFAULT_REFERENCE_TREES = ['packages/tools/skills/reference-bundles'];
const UNDECLARED_SOURCE = 'UNKNOWN — declare the upstream repo or URL before merging';
const KNOWN_SOURCE_TYPES = new Set(['github', 'url', 'first-party']);

function sha256Hex(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function hashSkillContent(bytes) {
  return `sha256:${sha256Hex(bytes)}`;
}

function collectTreeMembers(directory, prefix, out) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    if (entry.isSymbolicLink()) continue;
    const absolutePath = join(directory, entry.name);
    const relativePath = prefix === '' ? entry.name : `${prefix}/${entry.name}`;
    if (entry.isDirectory()) collectTreeMembers(absolutePath, relativePath, out);
    else if (entry.isFile()) out.push({ relativePath, absolutePath });
  }
}

function computeSkillTreeHash(packageDir) {
  const members = [];
  collectTreeMembers(packageDir, '', members);
  members.sort((left, right) =>
    Buffer.compare(
      Buffer.from(left.relativePath, 'utf-8'),
      Buffer.from(right.relativePath, 'utf-8'),
    ),
  );
  const digest = createHash('sha256');
  for (const member of members) {
    digest.update(member.relativePath, 'utf-8');
    digest.update(Uint8Array.from([0]));
    digest.update(sha256Hex(readFileSync(member.absolutePath)), 'utf-8');
    digest.update('\n', 'utf-8');
  }
  return `sha256-tree-v1:${digest.digest('hex')}`;
}

function discoverSkills(roots) {
  const found = new Map();
  for (const root of roots) {
    const absoluteRoot = join(REPO_ROOT, root);
    if (!existsSync(absoluteRoot)) continue;
    for (const entry of readdirSync(absoluteRoot, { withFileTypes: true })) {
      if (entry.name.startsWith('.')) continue;
      const absolute = join(absoluteRoot, entry.name);
      if (entry.isDirectory()) {
        const skillFile = join(absolute, 'SKILL.md');
        if (!existsSync(skillFile)) continue;
        found.set(entry.name, {
          id: entry.name,
          path: `${root}/${entry.name}`,
          hash: computeSkillTreeHash(absolute),
          version: readDeclaredVersion(readFileSync(skillFile, 'utf-8')),
        });
      } else if (
        entry.isFile() &&
        entry.name.toLowerCase().endsWith('.md') &&
        entry.name.toLowerCase() !== 'readme.md'
      ) {
        const id = entry.name.replace(/\.md$/i, '');
        const bytes = readFileSync(absolute);
        found.set(id, {
          id,
          path: `${root}/${entry.name}`,
          hash: hashSkillContent(bytes),
          version: readDeclaredVersion(bytes.toString('utf-8')),
        });
      }
    }
  }
  return found;
}

function readDeclaredVersion(source) {
  const fence = /^---[ \t]*\r?\n([\s\S]{0,131072}?)\r?\n---[ \t]*\r?\n/.exec(source);
  if (!fence) return null;
  const match = /^version:[ \t]*(.{1,256})$/m.exec(fence[1] ?? '');
  if (!match) return null;
  const value = (match[1] ?? '').trim().replace(/^['"]|['"]$/g, '');
  return value.length > 0 ? value : null;
}

function listSkillManifestsUnder(directory, out = []) {
  if (!existsSync(directory)) return out;
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    const absolute = join(directory, entry.name);
    if (entry.isDirectory()) listSkillManifestsUnder(absolute, out);
    else if (entry.isFile() && entry.name === 'SKILL.md') out.push(relative(REPO_ROOT, absolute));
  }
  return out;
}

function readLock() {
  if (!existsSync(LOCK_PATH)) {
    throw new Error('skills-lock.json is missing. Run with --regenerate to create it.');
  }
  return JSON.parse(readFileSync(LOCK_PATH, 'utf-8'));
}

function lockRoots(lock) {
  return Array.isArray(lock.roots) && lock.roots.length > 0 ? lock.roots : DEFAULT_ROOTS;
}

function lockReferenceTrees(lock) {
  return Array.isArray(lock.referenceTrees) ? lock.referenceTrees : DEFAULT_REFERENCE_TREES;
}

function verify() {
  const failures = [];
  const lock = readLock();

  if (lock.algorithm !== HASH_ALGORITHM) {
    failures.push(
      `skills-lock.json declares algorithm "${lock.algorithm ?? 'none'}"; this verifier only reproduces "${HASH_ALGORITHM}". ` +
        'Regenerate the lock so the recorded hashes are reproducible.',
    );
    return failures;
  }

  const roots = lockRoots(lock);
  const discovered = discoverSkills(roots);
  const locked = lock.skills && typeof lock.skills === 'object' ? lock.skills : {};

  for (const [id, skill] of discovered) {
    const entry = locked[id];
    if (!entry) {
      failures.push(
        `Unlocked skill "${id}" at ${skill.path}. Every skill under ${roots.join(', ')} must declare provenance in skills-lock.json — run --regenerate, then fill in source/sourceType.`,
      );
      continue;
    }
    if (!KNOWN_SOURCE_TYPES.has(entry.sourceType)) {
      failures.push(
        `Skill "${id}" has sourceType "${entry.sourceType ?? 'none'}"; expected one of ${[...KNOWN_SOURCE_TYPES].join(', ')}.`,
      );
    }
    if (
      typeof entry.source !== 'string' ||
      entry.source.length === 0 ||
      entry.source === UNDECLARED_SOURCE
    ) {
      failures.push(`Skill "${id}" has no declared upstream source.`);
    }
    if (entry.computedHash !== skill.hash) {
      failures.push(
        `Integrity mismatch for skill "${id}" at ${skill.path}:\n  locked:   ${entry.computedHash}\n  on disk:  ${skill.hash}`,
      );
    }
  }

  for (const id of Object.keys(locked)) {
    if (!discovered.has(id)) {
      failures.push(
        `Stale lock entry "${id}": no such skill under ${roots.join(', ')}. Remove it with --regenerate if the skill was intentionally deleted.`,
      );
    }
  }

  for (const tree of lockReferenceTrees(lock)) {
    const manifests = listSkillManifestsUnder(join(REPO_ROOT, tree));
    for (const manifest of manifests) {
      failures.push(
        `${manifest} makes ${tree} loadable. That tree is declared non-loadable reference material — either move the package under a locked skill root or drop the SKILL.md.`,
      );
    }
  }

  return failures;
}

function regenerate() {
  const existing = existsSync(LOCK_PATH) ? JSON.parse(readFileSync(LOCK_PATH, 'utf-8')) : {};
  const roots = lockRoots(existing);
  const previous = existing.skills && typeof existing.skills === 'object' ? existing.skills : {};
  const discovered = discoverSkills(roots);

  const skills = {};
  for (const id of [...discovered.keys()].sort()) {
    const skill = discovered.get(id);
    const prior = previous[id];
    skills[id] = {
      path: skill.path,
      source:
        typeof prior?.source === 'string' && prior.source.length > 0
          ? prior.source
          : UNDECLARED_SOURCE,
      sourceType: KNOWN_SOURCE_TYPES.has(prior?.sourceType) ? prior.sourceType : 'unknown',
      declaredVersion: skill.version,
      computedHash: skill.hash,
    };
  }

  const next = {
    version: LOCK_VERSION,
    algorithm: HASH_ALGORITHM,
    ...(Array.isArray(existing.notes) ? { notes: existing.notes } : {}),
    roots,
    referenceTrees: lockReferenceTrees(existing),
    skills,
  };
  writeFileSync(LOCK_PATH, `${JSON.stringify(next, null, 2)}\n`, 'utf-8');
  return Object.keys(skills).length;
}

function selfTest() {
  const skillMd = '---\nname: demo\ndescription: Demo skill.\nversion: 1.2.3\n---\n\nBody.\n';
  const runSh = '#!/bin/sh\necho hi\n';
  const expectedContent = 'sha256:876fc6cd47f405327f68e5420e911d24d10fa8d1d07c35f201c6743632f9e5bd';
  const expectedTree =
    'sha256-tree-v1:dc94c7538515151cb28463f134ce3cb4ab6fa0f5e40405675b7afff88ea40349';

  const failures = [];
  const actualContent = hashSkillContent(Buffer.from(skillMd, 'utf-8'));
  if (actualContent !== expectedContent) {
    failures.push(`content hash vector mismatch: ${actualContent} != ${expectedContent}`);
  }

  const members = [
    ['SKILL.md', Buffer.from(skillMd, 'utf-8')],
    ['scripts/run.sh', Buffer.from(runSh, 'utf-8')],
  ].sort((left, right) =>
    Buffer.compare(Buffer.from(left[0], 'utf-8'), Buffer.from(right[0], 'utf-8')),
  );
  const digest = createHash('sha256');
  for (const [relativePath, bytes] of members) {
    digest.update(relativePath, 'utf-8');
    digest.update(Uint8Array.from([0]));
    digest.update(sha256Hex(bytes), 'utf-8');
    digest.update('\n', 'utf-8');
  }
  const actualTree = `sha256-tree-v1:${digest.digest('hex')}`;
  if (actualTree !== expectedTree) {
    failures.push(`tree hash vector mismatch: ${actualTree} != ${expectedTree}`);
  }

  const fixtureRoot = join(REPO_ROOT, 'scripts', '__fixtures__', 'skills-lock-vector');
  if (existsSync(fixtureRoot) && statSync(fixtureRoot).isDirectory()) {
    const walked = computeSkillTreeHash(fixtureRoot);
    if (walked !== expectedTree) {
      failures.push(`on-disk walk vector mismatch: ${walked} != ${expectedTree}`);
    }
  } else {
    failures.push(`missing known-answer fixture: ${relative(REPO_ROOT, fixtureRoot)}`);
  }

  return failures;
}

const args = new Set(process.argv.slice(2));

if (args.has('--self-test')) {
  const failures = selfTest();
  if (failures.length > 0) {
    console.error('agiskill-sha256-v1 self-test failed:');
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
  }
  console.log('agiskill-sha256-v1 self-test passed.');
  process.exit(0);
}

if (args.has('--regenerate') || args.has('--write')) {
  const count = regenerate();
  console.log(`skills-lock.json regenerated with ${count} skill(s) using ${HASH_ALGORITHM}.`);
  console.log('Run `pnpm exec prettier --write skills-lock.json` before committing.');
  process.exit(0);
}

const selfTestFailures = selfTest();
if (selfTestFailures.length > 0) {
  console.error('agiskill-sha256-v1 self-test failed — refusing to report a verification result:');
  for (const failure of selfTestFailures) console.error(`- ${failure}`);
  process.exit(1);
}

const failures = verify();
if (failures.length > 0) {
  console.error('skills-lock.json verification failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log(`skills-lock.json verified (${HASH_ALGORITHM}).`);
