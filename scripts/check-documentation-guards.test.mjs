import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const scripts = path.dirname(fileURLToPath(import.meta.url));

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'documentation-guards-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  execFileSync('git', ['init', '--quiet'], { cwd: root });
  const write = (name, content) => {
    const destination = path.join(root, name);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.writeFileSync(destination, content);
  };
  const stage = (...names) => execFileSync('git', ['add', '--', ...names], { cwd: root });
  const run = (name) => {
    const result = spawnSync(process.execPath, [path.join(scripts, name)], {
      cwd: root,
      encoding: 'utf8',
      timeout: 15_000,
    });
    assert.equal(result.signal, null, result.stderr);
    assert.equal(result.error, undefined);
    return result;
  };
  write('README.md', '# Fixture\n');
  stage('README.md');
  return { root, write, stage, run };
}

function agentFixture(t) {
  const f = fixture(t);
  f.write(
    'AGENTS.md',
    'canonical owner\nworking tree\nfails closed\ntrust boundaries\nnever hand-edit\n',
  );
  f.write('CLAUDE.md', 'Read AGENTS.md.\n');
  f.stage('AGENTS.md', 'CLAUDE.md');
  return f;
}

for (const staged of [false, true]) {
  test(`agent guard rejects an unexpected ${staged ? 'staged' : 'untracked'} scoped contract`, (t) => {
    const f = agentFixture(t);
    f.write('apps/unregistered/AGENTS.md', '# Unexpected contract\n');
    if (staged) f.stage('apps/unregistered/AGENTS.md');
    const result = f.run('check-agent-docs.mjs');
    assert.equal(result.status, 1, result.stdout);
    assert.match(result.stderr, /apps\/unregistered\/AGENTS\.md.*unregistered scoped/);
  });
}

test('agent guard preserves ignored, registered web and declared vendor scopes', (t) => {
  const f = agentFixture(t);
  f.write('.gitignore', 'ignored/\n');
  f.write('ignored/AGENTS.md', '# Ignored\n');
  f.write('apps/web/AGENTS.md', '# Generated web contract\n');
  f.write('.agents/skills/vendor/AGENTS.md', '# Vendored contract\n');
  f.write(
    'skills-lock.json',
    JSON.stringify({ skills: { vendor: { sourceType: 'github', path: '.agents/skills/vendor' } } }),
  );
  assert.equal(f.run('check-agent-docs.mjs').status, 0);
  f.write('.agents/skills/vendor-lookalike/AGENTS.md', '# First-party contract\n');
  const result = f.run('check-agent-docs.mjs');
  assert.equal(result.status, 1, result.stdout);
  assert.match(result.stderr, /vendor-lookalike/);
});

test('agent guard still validates tracked contracts after an ignore rule is added', (t) => {
  const f = agentFixture(t);
  f.write('apps/unregistered/CLAUDE.md', '# Unexpected\n');
  f.stage('apps/unregistered/CLAUDE.md');
  f.write('.gitignore', 'apps/unregistered/\n');
  assert.equal(f.run('check-agent-docs.mjs').status, 1);
});

for (const staged of [false, true]) {
  test(`registry rejects an unexpected ${staged ? 'staged' : 'untracked'} root document`, (t) => {
    const f = fixture(t);
    f.write('unowned.md', '# Unowned\n');
    if (staged) f.stage('unowned.md');
    const result = f.run('check-doc-registry.mjs');
    assert.equal(result.status, 1, result.stdout);
    assert.match(result.stderr, /unowned\.md: root markdown/);
  });
}

test('registry admits current untracked owned docs, excludes ignored docs, and reads literal filenames', (t) => {
  const f = fixture(t);
  f.write('.gitignore', 'ignored.md\n');
  f.write('ignored.md', 'Read `TODO.md`.\n');
  f.write('docs/development/quoted-"name\nnext.md', '# Owned\n');
  const result = f.run('check-doc-registry.mjs');
  assert.equal(result.status, 0, result.stderr);
});

test('registry rejects retired citations in untracked owned prose', (t) => {
  const f = fixture(t);
  f.write('docs/development/commands.md', '# Commands\nRead `TODO.md` for current tasks.\n');
  const result = f.run('check-doc-registry.mjs');
  assert.equal(result.status, 1, result.stdout);
  assert.match(result.stderr, /cites `TODO\.md` as current/);
});

test('registry rejects an untracked archive tree even when it contains no Markdown', (t) => {
  const f = fixture(t);
  f.write('apps/web/archive/copied.ts', 'export const copied = true;\n');
  const result = f.run('check-doc-registry.mjs');
  assert.equal(result.status, 1, result.stdout);
  assert.match(result.stderr, /archive\/copied\.ts sits in an archive/);
});

test('registry follows current files after a tracked document is removed', (t) => {
  const f = fixture(t);
  f.write('docs/development/old.md', '# Old\n');
  f.stage('docs/development/old.md');
  fs.unlinkSync(path.join(f.root, 'docs/development/old.md'));
  f.write('docs/development/new.md', '# Current\n');
  const result = f.run('check-doc-registry.mjs');
  assert.equal(result.status, 0, result.stderr);
});

const validMetadata = 'Status: Current\nOwner: Repository maintainers\nLast updated: 2024-02-29\n';

function statusFixture(t, content) {
  const f = fixture(t);
  f.write(
    'docs/agent-context/doc-status.json',
    JSON.stringify({ currentSourcesOfTruth: ['docs/product/example.md'], currentEvidence: [] }),
  );
  f.write('docs/product/example.md', `# Example\n\n${content}`);
  return f;
}

for (const content of [
  validMetadata,
  '**Status:** Current target; implementation incomplete\n**Owner:** Platform\n**Last updated:** 2024-02-29\n',
  '**Status**: Current\n**Owner**: Platform\n**Last updated**: 2000-02-29\n',
]) {
  test(`status guard accepts valid top-level metadata: ${content.split('\n')[0]}`, (t) => {
    const result = statusFixture(t, content).run('check-doc-status.mjs');
    assert.equal(result.status, 0, result.stderr);
  });
}

for (const [label, content] of [
  ['backtick-fenced-only metadata', `\`\`\`md\n${validMetadata}\`\`\`\n`],
  ['tilde-fenced-only metadata', `~~~md\n${validMetadata}~~~\n`],
  ['shorter fence inside a longer fence', `\`\`\`\`md\n\`\`\`\n${validMetadata}\`\`\`\`\n`],
  ['different fence inside an open fence', `\`\`\`md\n~~~\n${validMetadata}\`\`\`\n`],
  ['Ownerish instead of Owner', validMetadata.replace('Owner:', 'Ownerish:')],
  ['empty owner', validMetadata.replace('Repository maintainers', '')],
  ['impossible calendar date', validMetadata.replace('2024-02-29', '2026-02-30')],
  ['non-leap-century date', validMetadata.replace('2024-02-29', '1900-02-29')],
  ['non-calendar date', validMetadata.replace('2024-02-29', 'next Friday')],
  ['body-section metadata', `## Historical example\n\n${validMetadata}`],
  [
    'quoted metadata',
    validMetadata
      .split('\n')
      .map((line) => `> ${line}`)
      .join('\n'),
  ],
  ['missing status', validMetadata.replace('Status: Current\n', '')],
  ['conflicting duplicate owner', validMetadata + 'Owner: Someone else\n'],
]) {
  test(`status guard rejects ${label}`, (t) => {
    const result = statusFixture(t, content).run('check-doc-status.mjs');
    assert.equal(result.status, 1, result.stdout);
    assert.match(result.stderr, /docs\/product\/example\.md/);
  });
}

test('status guard still refuses a missing registered document', (t) => {
  const f = statusFixture(t, validMetadata);
  fs.unlinkSync(path.join(f.root, 'docs/product/example.md'));
  const result = f.run('check-doc-status.mjs');
  assert.equal(result.status, 1, result.stdout);
  assert.match(result.stderr, /Current doc is missing/);
});
