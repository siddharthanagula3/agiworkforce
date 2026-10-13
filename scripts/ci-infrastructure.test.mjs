import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const ACTION = '.github/actions/prepare-runner-memory';
const workflow = (name) => parse(readFileSync(path.join(ROOT, '.github/workflows', name), 'utf8'));

function memoryPreparation(t, overrides = {}) {
  const directory = mkdtempSync(path.join(tmpdir(), 'runner-memory-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const commands = path.join(directory, 'commands');
  const fake = {
    sudo: '#!/bin/sh\nprintf "%s\\n" "$*" >> "$COMMAND_LOG"\n',
    df: '#!/bin/sh\nprintf "Filesystem 1024-blocks Used Available Capacity Mounted\\nfixture 50000000 0 %s 0%% /\\n" "$AVAILABLE_KIB"\n',
    free: '#!/bin/sh\nexit 0\n',
    swapon: '#!/bin/sh\nexit 0\n',
  };
  for (const [name, content] of Object.entries(fake)) {
    const filename = path.join(directory, name);
    writeFileSync(filename, content);
    chmodSync(filename, 0o755);
  }
  const result = spawnSync('bash', [path.join(ROOT, ACTION, 'prepare.sh')], {
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${directory}${path.delimiter}${process.env.PATH}`,
      RUNNER_OS: 'Linux',
      RUNNER_ENVIRONMENT: 'github-hosted',
      RUNNER_TEMP: directory,
      AGI_SWAP_GIB: '8',
      AGI_MIN_FREE_GIB: '14',
      AVAILABLE_KIB: String(30 * 1024 * 1024),
      COMMAND_LOG: commands,
      ...overrides,
    },
  });
  let calls = '';
  try {
    calls = readFileSync(commands, 'utf8');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  return { ...result, calls };
}

test('runner preparation reclaims disk before creating private swap and activating it', (t) => {
  const result = memoryPreparation(t);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const calls = result.calls.trim().split('\n');
  assert.match(calls[0], /^rm -rf \/usr\/share\/dotnet /);
  assert.match(calls[1], /^install -m 600 \/dev\/null /);
  assert.match(calls[2], /^fallocate -l 8G /);
  assert.match(calls[3], /^mkswap /);
  assert.match(calls[4], /^swapon /);
  assert.equal(calls.length, 5);
});

test('insufficient disk cannot be consumed by a swap allocation', (t) => {
  const result = memoryPreparation(t, { AVAILABLE_KIB: String(10 * 1024 * 1024) });
  assert.equal(result.status, 1);
  assert.match(result.stdout, /Insufficient disk/);
  assert.doesNotMatch(result.calls, /fallocate|mkswap|swapon/);
});

test('runner preparation rejects local machines and invalid capacities before privileged commands', (t) => {
  for (const overrides of [
    { RUNNER_ENVIRONMENT: 'self-hosted' },
    { RUNNER_OS: 'macOS' },
    { AGI_SWAP_GIB: '8; echo unsafe' },
    { AGI_MIN_FREE_GIB: '0' },
  ]) {
    const result = memoryPreparation(t, overrides);
    assert.equal(result.status, 1);
    assert.equal(result.calls, '');
  }
});

test('every affected small-runner job prepares memory after checkout and before dependency installation', () => {
  for (const [name, id] of [
    ['ci.yml', 'js-verify'],
    ['ci.yml', 'web-a11y'],
    ['security-scanning.yml', 'web-image-scan-and-dast'],
    ['web-container-drill.yml', 'boot-outside-the-platform'],
    ['web-public-matrix.yml', 'public-matrix'],
  ]) {
    const steps = workflow(name).jobs[id].steps;
    const checkout = steps.findIndex((step) => step.uses?.startsWith('actions/checkout@'));
    const prepare = steps.findIndex((step) => step.uses === `./${ACTION}`);
    const install = steps.findIndex((step) => step.run === 'pnpm install --frozen-lockfile');
    assert.ok(prepare > checkout && prepare < install, `${name}:${id}`);
    assert.equal(steps[prepare].if, 'github.event.repository.private == true');
  }
});

test('private repositories cannot reach CodeQL extraction and retain an explicit Semgrep notice', () => {
  const { jobs } = workflow('codeql-analysis.yml');
  assert.equal(jobs.interpreted.if, 'github.event.repository.private == false');
  const scope = jobs.scope.steps;
  for (const step of scope.filter((item) => item.uses || item.id === 'rust')) {
    assert.equal(step.if, 'github.event.repository.private == false');
  }
  const notices = scope.filter((step) => step.run?.includes('::notice::'));
  assert.equal(notices.length, 1);
  assert.equal(notices[0].if, 'github.event.repository.private == true');
  assert.match(notices[0].run, /Semgrep gate in ci.yml remains the enforced static analysis/);
  assert.equal(jobs.rust.needs, 'scope');
  assert.equal(jobs.rust.if, "needs.scope.outputs.rust == 'true'");
  assert.deepEqual(jobs.interpreted.strategy.matrix.language, [
    'actions',
    'javascript-typescript',
    'ruby',
  ]);
});

test('the public acceptance matrix visits the canonical origin compiled into its server', () => {
  const environment = workflow('web-public-matrix.yml').jobs['public-matrix'].env;
  assert.ok(environment.PLAYWRIGHT_BASE_URL);
  assert.equal(environment.PLAYWRIGHT_BASE_URL, environment.NEXT_PUBLIC_APP_URL);
});

test('Rust auditing has one cache owner and reports without issue-writing permissions', () => {
  const { jobs, on } = workflow('codeql.yml');
  const job = jobs['rust-security'];
  assert.ok(Object.hasOwn(on, 'workflow_dispatch'));
  const setup = job.steps.find((step) =>
    step.uses?.startsWith('actions-rust-lang/setup-rust-toolchain@'),
  );
  assert.equal(setup.with.cache, false);
  const caches = job.steps.filter((step) => step.uses?.startsWith('Swatinem/rust-cache@'));
  assert.equal(caches.length, 1);
  assert.equal(caches[0].with['cache-bin'], false);
  assert.equal(caches[0].with.workspaces, '. -> target');
  assert.equal(job.permissions.issues, undefined);
  assert.ok(!job.steps.some((step) => step.uses?.startsWith('rustsec/audit-check@')));
  const audit = job.steps.find((step) => step.name === 'Run cargo audit (CVE scanning)');
  assert.match(audit.run, /test -f .cargo\/audit.toml/);
  assert.match(audit.run, /cargo audit --json --file Cargo.lock/);
  assert.match(audit.run, /exit "\$audit_status"/);
  assert.match(audit.run, /node scripts\/report-cargo-audit.mjs/);
});
