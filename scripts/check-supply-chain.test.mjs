import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { stringify } from 'yaml';

import {
  BASELINE_PATH,
  REPO_ROOT,
  checkSupplyChain,
  containerFiles,
  imageReferences,
  tagOf,
  workspaceInstalls,
} from './check-supply-chain.mjs';

const roots = [];

const CLEAN_WORKFLOW = `jobs:
  a:
    steps:
      - run: pnpm install --frozen-lockfile
`;

function dependabot(updates) {
  return stringify({ version: 2, updates });
}

function updater(ecosystem, overrides = {}) {
  return {
    'package-ecosystem': ecosystem,
    directory: '/',
    schedule: { interval: 'weekly', day: 'monday' },
    ...overrides,
  };
}

const WORKSPACES = {
  'pnpm-workspace.yaml': "packages:\n  - 'apps/*'\n",
  'Cargo.toml':
    '[workspace]\nmembers = ["apps/desktop", "crates/*"]\n[workspace.lints.clippy]\nunsafe_code = "deny"\n',
  'Cargo.lock': 'version = 4\n',
  'apps/desktop/Cargo.toml':
    '[package]\nname = "fixture-desktop"\nversion = "0.0.1"\n[dependencies]\nfixture-core = { path = "../../crates/core" }\n',
  'apps/desktop/package.json': '{"name":"fixture-desktop"}',
  'crates/core/Cargo.toml':
    '[package]\nname = "fixture-core"\nversion = "0.0.1"\n[lints]\nworkspace = true\n',
};

function fixture({ files = {}, workflow = CLEAN_WORKFLOW, baseline, manifest }) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'supply-chain-'));
  roots.push(root);
  fs.mkdirSync(path.join(root, '.github/workflows'), { recursive: true });
  fs.mkdirSync(path.join(root, 'scripts/config'), { recursive: true });
  fs.writeFileSync(
    path.join(root, 'package.json'),
    JSON.stringify(manifest ?? { pnpm: { onlyBuiltDependencies: ['sharp'] } }),
  );
  fs.writeFileSync(path.join(root, 'pnpm-lock.yaml'), 'lockfileVersion: 9\n');
  fs.writeFileSync(path.join(root, '.github/workflows/ci.yml'), workflow);
  fs.writeFileSync(path.join(root, '.github/dependabot.yml'), dependabot([updater('npm')]));
  for (const [relative, body] of Object.entries(files)) {
    fs.mkdirSync(path.join(root, path.dirname(relative)), { recursive: true });
    fs.writeFileSync(path.join(root, relative), body);
  }
  if (baseline !== undefined) {
    fs.writeFileSync(path.join(root, BASELINE_PATH), JSON.stringify(baseline));
  }
  return root;
}

const REASON =
  'Recorded by the fixture to stand in for a real reason that says why this reference is still here and who owes the fix.';

test.after(() => {
  for (const root of roots) fs.rmSync(root, { recursive: true, force: true });
});

test('a digest-pinned image passes and a latest tag fails', () => {
  const pinned = fixture({
    files: { Dockerfile: 'FROM node:24-alpine@sha256:' + 'a'.repeat(64) + '\n' },
  });
  assert.deepEqual(checkSupplyChain(pinned).failures, []);

  const moving = fixture({ files: { 'docker-compose.yml': '  image: acme/api:latest\n' } });
  assert.match(checkSupplyChain(moving).failures.join('\n'), /whatever was pushed last/);

  const untagged = fixture({ files: { 'docker-compose.yml': '  image: acme/api\n' } });
  assert.match(checkSupplyChain(untagged).failures.join('\n'), /whatever was pushed last/);
});

test('a tag that is not a digest is reported separately from a moving tag', () => {
  const root = fixture({ files: { Dockerfile: 'FROM node:24-alpine\n' } });
  const failures = checkSupplyChain(root).failures;
  assert.equal(failures.length, 1);
  assert.match(failures[0], /by tag, not by digest/);
});

test('ignored worktrees are excluded from container image checks', () => {
  const root = fixture({ files: { Dockerfile: 'FROM node:24-alpine@sha256:' + 'a'.repeat(64) } });
  execFileSync('git', ['init', '-q'], { cwd: root });
  fs.writeFileSync(path.join(root, '.gitignore'), '.worktrees/\n');
  fs.mkdirSync(path.join(root, '.worktrees', 'other'), { recursive: true });
  fs.writeFileSync(path.join(root, '.worktrees', 'other', 'Dockerfile'), 'FROM node:latest\n');
  assert.deepEqual(containerFiles(root), ['Dockerfile']);
  assert.deepEqual(checkSupplyChain(root).failures, []);
});

test('a build argument is not read as an image name', () => {
  const root = fixture({
    files: {
      Dockerfile: 'ARG BASE=node:24@sha256:' + 'b'.repeat(64) + '\nFROM ${BASE} AS build\n',
    },
  });
  assert.deepEqual(checkSupplyChain(root).failures, []);
});

test('an unfrozen workspace install fails, and a pinned tool install does not', () => {
  const unfrozen = fixture({
    workflow: 'jobs:\n  a:\n    steps:\n      - run: pnpm install\n',
  });
  assert.match(checkSupplyChain(unfrozen).failures.join('\n'), /without a frozen lockfile/);

  const tool = fixture({
    workflow:
      'jobs:\n  a:\n    steps:\n      - run: |\n          npm install --global vercel@58.4.0\n          pnpm exec playwright install --with-deps\n          pnpm install --frozen-lockfile\n',
  });
  assert.deepEqual(checkSupplyChain(tool).failures, []);
});

test('Docker install fallbacks and continued shell instructions cannot bypass the lockfile', () => {
  const root = fixture({
    files: {
      Dockerfile:
        'FROM node:24-alpine@sha256:' +
        'a'.repeat(64) +
        '\nRUN pnpm install --frozen-lockfile 2>/dev/null || \\\n    pnpm install\n',
    },
  });
  assert.match(checkSupplyChain(root).failures.join('\n'), /Dockerfile.*without a frozen lockfile/);
});

test('filtered Vercel workspace installs still require a frozen lockfile', () => {
  const root = fixture({
    files: {
      'apps/desktop/vercel.json': JSON.stringify({
        installCommand: 'pnpm install --filter @agiworkforce/desktop...',
      }),
    },
  });
  assert.match(
    checkSupplyChain(root).failures.join('\n'),
    /vercel.json.*without a frozen lockfile/,
  );
});

test('a frozen flag in a shell comment does not bless an unlocked install', () => {
  const root = fixture({
    workflow: 'jobs:\n  a:\n    steps:\n      - run: pnpm install # --frozen-lockfile\n',
  });
  assert.match(checkSupplyChain(root).failures.join('\n'), /without a frozen lockfile/);
});

test('offline resolution and explicitly disabled freezing do not satisfy the lockfile gate', () => {
  for (const flags of [
    '--offline',
    '--frozen-lockfile=false',
    '--frozen-lockfile --no-frozen-lockfile',
  ]) {
    const root = fixture({
      workflow: `jobs:\n  a:\n    steps:\n      - run: pnpm install ${flags}\n`,
    });
    assert.match(checkSupplyChain(root).failures.join('\n'), /without a frozen lockfile/);
  }
});

test('a filter before the install verb is checked and quoted comments remain arguments', () => {
  const root = fixture({
    workflow: 'jobs:\n  a:\n    steps:\n      - run: pnpm --filter "app#name" install\n',
  });
  assert.match(checkSupplyChain(root).failures.join('\n'), /without a frozen lockfile/);
  assert.deepEqual(
    workspaceInstalls({ file: 'f', line: 1, body: 'pnpm db:migrate -- apply --target ci' }),
    [],
  );
});

test('values, wrappers, redirections and another manager cannot impersonate freezing', () => {
  for (const command of [
    "pnpm install --filter '--frozen-lockfile'",
    'npm install --frozen-lockfile',
    '(pnpm install)',
    "sh -c 'pnpm install'",
    'pnpm install > /tmp/install.log',
    "env sh -c 'pnpm install'",
    'npm install --cache /tmp/npm-cache',
    'pnpm install --lockfile-dir .',
  ]) {
    const root = fixture({ workflow: `jobs:\n  a:\n    steps:\n      - run: ${command}\n` });
    assert.match(checkSupplyChain(root).failures.join('\n'), /without a frozen lockfile/, command);
  }
});

test('Docker JSON instructions and build mount options are also checked', () => {
  for (const instruction of [
    'RUN ["pnpm", "install"]',
    'RUN ["sh", "-c", "pnpm install"]',
    'RUN --mount=type=cache,target=/pnpm pnpm install',
  ]) {
    const root = fixture({
      files: {
        Dockerfile: 'FROM node:24-alpine@sha256:' + 'a'.repeat(64) + '\n' + instruction + '\n',
      },
    });
    assert.match(
      checkSupplyChain(root).failures.join('\n'),
      /Dockerfile.*without a frozen lockfile/,
      instruction,
    );
  }
});

test('a download piped into a shell fails', () => {
  const root = fixture({
    workflow:
      'jobs:\n  a:\n    steps:\n      - run: |\n          curl -fsSL https://example.com/i.sh | sh\n          pnpm install --frozen-lockfile\n',
  });
  assert.match(
    checkSupplyChain(root).failures.join('\n'),
    /pipes a download straight into a shell/,
  );
});

test('an install-script allowlist and a lockfile are both required', () => {
  const noAllowlist = fixture({ manifest: {} });
  assert.match(checkSupplyChain(noAllowlist).failures.join('\n'), /onlyBuiltDependencies/);

  const noLock = fixture({});
  fs.rmSync(path.join(noLock, 'pnpm-lock.yaml'));
  assert.match(checkSupplyChain(noLock).failures.join('\n'), /pnpm-lock\.yaml is missing/);
});

test('a baseline entry needs a reason and dies when it stops matching', () => {
  const labelled = fixture({
    files: { 'docker-compose.yml': '  image: acme/api:latest\n' },
    baseline: { 'moving-tags': [{ id: 'docker-compose.yml:acme/api:latest', reason: 'legacy' }] },
  });
  assert.match(checkSupplyChain(labelled).failures.join('\n'), /needs a reason, not a label/);

  const declared = fixture({
    files: { 'docker-compose.yml': '  image: acme/api:latest\n' },
    baseline: { 'moving-tags': [{ id: 'docker-compose.yml:acme/api:latest', reason: REASON }] },
  });
  assert.deepEqual(checkSupplyChain(declared).failures, []);

  const stale = fixture({
    baseline: { 'moving-tags': [{ id: 'gone.yml:acme/api:latest', reason: REASON }] },
  });
  assert.match(checkSupplyChain(stale).failures.join('\n'), /no longer matches anything/);
});

test('an empty workflow walk fails rather than passing silently', () => {
  const root = fixture({
    workflow: 'jobs:\n  a:\n    steps:\n      - uses: actions/checkout@v7\n',
  });
  assert.match(checkSupplyChain(root).failures.join('\n'), /the walk would be empty/);
});

test('helpers read what they claim to read', () => {
  assert.equal(tagOf('ghcr.io/org/app:1.2.3'), '1.2.3');
  assert.equal(tagOf('ghcr.io:5000/org/app'), null);
  assert.deepEqual(
    imageReferences('FROM node:24 AS a\n  image: "redis:7"\n', 'f').map((r) => r.reference),
    ['node:24', 'redis:7'],
  );
  assert.deepEqual(
    workspaceInstalls({ file: 'f', line: 1, body: 'npm ci --ignore-scripts' }).map(
      (i) => i.command,
    ),
    ['npm ci --ignore-scripts'],
  );
});

test('the repository itself passes and the walk finds its containers', () => {
  const { failures, images, installs } = checkSupplyChain(REPO_ROOT);
  assert.deepEqual(failures, []);
  assert.ok(images > 0, 'the repository builds containers');
  assert.ok(installs > 0, 'CI installs the workspace');
  assert.ok(containerFiles(REPO_ROOT).includes('apps/web/Dockerfile'));
});

test('a pnpm member updater cannot resolve the shared workspace from its leaf', () => {
  const root = fixture({
    files: {
      'pnpm-workspace.yaml': WORKSPACES['pnpm-workspace.yaml'],
      'apps/mobile/package.json': '{"name":"fixture-mobile"}',
      '.github/dependabot.yml': dependabot([
        updater('npm'),
        updater('npm', { directory: '/apps/mobile' }),
      ]),
    },
  });
  assert.match(checkSupplyChain(root).failures.join('\n'), /pnpm workspace.*root/);
});

test('a Cargo member updater must retain its shared root and inherited path crate lints', () => {
  const root = fixture({
    files: {
      ...WORKSPACES,
      '.github/dependabot.yml': dependabot([
        updater('npm'),
        updater('cargo'),
        updater('cargo', { directory: '/apps/desktop' }),
      ]),
    },
  });
  assert.match(checkSupplyChain(root).failures.join('\n'), /Cargo workspace.*root/);
});

test('root updaters cover shared workspaces while Actions and Docker retain their directories', () => {
  const root = fixture({
    files: {
      ...WORKSPACES,
      '.github/dependabot.yml': dependabot([
        updater('npm'),
        updater('cargo'),
        updater('github-actions'),
        updater('docker', { directory: '/services/scanner' }),
      ]),
    },
  });
  assert.deepEqual(checkSupplyChain(root).failures, []);
});

test('a standalone npm or Cargo project is not mistaken for a shared workspace', () => {
  const root = fixture({
    files: {
      '.github/dependabot.yml': dependabot([
        updater('npm', { directory: '/apps/standalone' }),
        updater('cargo', { directory: '/rust-standalone' }),
      ]),
    },
  });
  assert.deepEqual(checkSupplyChain(root).failures, []);
});

for (const ecosystem of ['npm', 'cargo']) {
  test(`${ecosystem} workspace member directories cannot bypass root validation`, () => {
    const root = fixture({
      files: {
        ...WORKSPACES,
        '.github/dependabot.yml': dependabot([
          updater(ecosystem, { directory: undefined, directories: ['/', '/apps/desktop'] }),
          updater(ecosystem === 'npm' ? 'cargo' : 'npm'),
        ]),
      },
    });
    assert.match(checkSupplyChain(root).failures.join('\n'), /workspace.*root/);
  });

  test(`an omitted ${ecosystem} workspace updater cannot look like maintained dependencies`, () => {
    const root = fixture({
      files: {
        ...WORKSPACES,
        '.github/dependabot.yml': dependabot([updater(ecosystem === 'npm' ? 'cargo' : 'npm')]),
      },
    });
    assert.match(checkSupplyChain(root).failures.join('\n'), /workspace.*root updater/);
  });
}

test('the directories form can select each workspace root without selecting members', () => {
  const root = fixture({
    files: {
      ...WORKSPACES,
      '.github/dependabot.yml': dependabot([
        updater('npm', { directory: undefined, directories: ['/'] }),
        updater('cargo', { directory: undefined, directories: ['/'] }),
      ]),
    },
  });
  assert.deepEqual(checkSupplyChain(root).failures, []);
});

for (const [name, document] of [
  ['invalid YAML', 'updates: [unterminated'],
  ['null configuration', 'null'],
  ['missing updates', 'version: 2'],
  ['empty updates', 'version: 2\nupdates: []'],
  ['nonarray updates', 'version: 2\nupdates: {}'],
  ['invalid updater', dependabot([null])],
  ['missing ecosystem', dependabot([{ directory: '/' }])],
  ['missing directories', dependabot([updater('npm', { directory: undefined })])],
  ['empty directories', dependabot([updater('npm', { directory: undefined, directories: [] })])],
  ['invalid directory', dependabot([updater('npm', { directory: 1 })])],
  ['both directory forms', dependabot([updater('npm', { directories: ['/'] })])],
]) {
  test(`${name} produces a controlled updater configuration failure`, () => {
    const root = fixture({ files: { '.github/dependabot.yml': document } });
    assert.match(checkSupplyChain(root).failures.join('\n'), /dependabot\.yml/);
  });
}

test('a missing updater configuration cannot pass silently', () => {
  const root = fixture({});
  fs.rmSync(path.join(root, '.github/dependabot.yml'));
  assert.match(checkSupplyChain(root).failures.join('\n'), /dependabot\.yml.*missing/);
});

test('independent projects outside shared workspace membership keep their own updater roots', () => {
  const root = fixture({
    files: {
      ...WORKSPACES,
      'independent/js/package.json': '{"name":"fixture-independent"}',
      'independent/js/pnpm-lock.yaml': 'lockfileVersion: 9\n',
      'independent/rust/Cargo.toml': '[package]\nname = "fixture-independent"\nversion = "0.0.1"\n',
      'independent/rust/Cargo.lock': 'version = 4\n',
      '.github/dependabot.yml': dependabot([
        updater('npm'),
        updater('cargo'),
        updater('npm', { directory: '/independent/js' }),
        updater('cargo', { directory: '/independent/rust' }),
      ]),
    },
  });
  assert.deepEqual(checkSupplyChain(root).failures, []);
});

test('explicitly excluded standalone projects are not shared workspace members', () => {
  const root = fixture({
    files: {
      ...WORKSPACES,
      'pnpm-workspace.yaml': "packages:\n  - 'apps/*'\n  - '!apps/standalone'\n",
      'Cargo.toml':
        '[workspace]\nmembers = ["apps/desktop", "crates/*"]\nexclude = ["crates/standalone"]\n',
      'apps/standalone/package.json': '{"name":"fixture-standalone"}',
      'apps/standalone/pnpm-lock.yaml': 'lockfileVersion: 9\n',
      'crates/standalone/Cargo.toml': '[package]\nname = "fixture-standalone"\nversion = "0.0.1"\n',
      'crates/standalone/Cargo.lock': 'version = 4\n',
      '.github/dependabot.yml': dependabot([
        updater('npm'),
        updater('cargo'),
        updater('npm', { directory: '/apps/standalone' }),
        updater('cargo', { directory: '/crates/standalone' }),
      ]),
    },
  });
  assert.deepEqual(checkSupplyChain(root).failures, []);
});

test('alternate valid TOML tables cannot hide a shared Cargo workspace', () => {
  const root = fixture({
    files: {
      ...WORKSPACES,
      'Cargo.toml': 'workspace = { members = ["apps/desktop", "crates/*"] }\n',
      '.github/dependabot.yml': dependabot([
        updater('npm'),
        updater('cargo'),
        updater('cargo', { directory: '/apps/desktop' }),
      ]),
    },
  });
  assert.match(checkSupplyChain(root).failures.join('\n'), /Cargo workspace.*root/);
});

for (const [name, owner, document] of [
  ['invalid pnpm workspace YAML', 'pnpm-workspace.yaml', 'packages: [unterminated'],
  ['invalid Cargo TOML', 'Cargo.toml', 'workspace = [unterminated'],
]) {
  test(`${name} cannot silently remove updater ownership`, () => {
    const root = fixture({ files: { ...WORKSPACES, [owner]: document } });
    assert.match(checkSupplyChain(root).failures.join('\n'), /workspace ownership/);
  });
}
