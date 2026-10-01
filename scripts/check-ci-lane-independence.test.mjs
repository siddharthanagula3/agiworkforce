import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { parse as parseYaml } from 'yaml';

const WORKFLOW = path.join(process.cwd(), '.github/workflows/ci.yml');
const AGGREGATE = 'ci-complete';

const LANE_MARKERS = {
  guards: [
    'check-no-conflict-markers.py',
    'check:hook-fire-sites',
    'check:module-reachability',
    'check:hardcoded-arrays',
    'check:secrets',
  ],
  javascript: [
    'turbo run lint --affected',
    'turbo run typecheck --affected',
    'turbo run build --affected',
    'pnpm test:affected',
  ],
  rust: ['cargo clippy', 'cargo deny', 'cargo test'],
  security: ['semgrep scan', 'pnpm audit --audit-level'],
  database: ['pnpm test:db-migrate', 'db:migrate -- verify', 'db:rls-probe'],
  e2e: ['playwright test', 'detox build', 'test:e2e', 'a11y:audit'],
};

function parseJobs(source) {
  const lines = source.split('\n');
  const jobsAt = lines.indexOf('jobs:');
  assert.notEqual(jobsAt, -1, 'ci.yml declares no jobs');

  const header = /^ {2}([A-Za-z0-9_-]+):$/;
  const starts = [];
  for (let i = jobsAt + 1; i < lines.length; i += 1) {
    if (header.test(lines[i])) starts.push(i);
  }

  const jobs = new Map();
  for (let n = 0; n < starts.length; n += 1) {
    const from = starts[n];
    const to = n + 1 < starts.length ? starts[n + 1] : lines.length;
    const block = lines.slice(from, to);
    const name = header.exec(lines[from])[1];

    const needs = [];
    for (let i = 1; i < block.length; i += 1) {
      const inline = /^ {4}needs: (.+)$/.exec(block[i]);
      if (inline) {
        needs.push(
          ...inline[1]
            .replace(/^\[|\]$/g, '')
            .split(',')
            .map((entry) => entry.trim().replace(/^['"]|['"]$/g, ''))
            .filter(Boolean),
        );
        break;
      }
      if (block[i] === '    needs:') {
        for (let j = i + 1; j < block.length; j += 1) {
          const item = /^ {6}- (\S+)$/.exec(block[j]);
          if (!item) break;
          needs.push(item[1]);
        }
        break;
      }
    }

    const condition = /^ {4}if: (.+)$/m.exec(block.join('\n'))?.[1] ?? '';
    const commands = block.filter((line) => !/^\s*#/.test(line)).join('\n');

    jobs.set(name, { needs, condition, commands });
  }
  return jobs;
}

function lanesOf(job) {
  return Object.entries(LANE_MARKERS)
    .filter(([, markers]) => markers.some((marker) => job.commands.includes(marker)))
    .map(([lane]) => lane);
}

const jobs = parseJobs(fs.readFileSync(WORKFLOW, 'utf8'));

test('CI change detection selects every lane when the prior commit is unavailable', () => {
  const step = parseYaml(fs.readFileSync(WORKFLOW, 'utf8')).jobs.scope.steps.find(
    (entry) => entry.id === 'scope',
  );
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ci-change-scope-'));
  const environment = {
    PATH: process.env.PATH,
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_CONFIG_GLOBAL: path.join(directory, 'empty-config'),
    GIT_AUTHOR_NAME: 'Scope Fixture',
    GIT_AUTHOR_EMAIL: 'scope@example.invalid',
    GIT_COMMITTER_NAME: 'Scope Fixture',
    GIT_COMMITTER_EMAIL: 'scope@example.invalid',
  };
  function git(...args) {
    const result = spawnSync('git', args, {
      cwd: directory,
      env: environment,
      encoding: 'utf8',
      timeout: 5000,
    });
    assert.equal(result.error, undefined);
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim();
  }
  try {
    fs.writeFileSync(environment.GIT_CONFIG_GLOBAL, '');
    git('init', '--quiet');
    fs.mkdirSync(path.join(directory, 'apps/web'), { recursive: true });
    fs.writeFileSync(path.join(directory, 'apps/web/fixture.txt'), 'before');
    git('add', 'apps/web/fixture.txt');
    git('commit', '--quiet', '-m', 'fixture: before');
    const before = git('rev-parse', 'HEAD');
    git('update-ref', 'refs/remotes/origin/main', before);
    fs.writeFileSync(path.join(directory, 'apps/web/fixture.txt'), 'after');
    git('commit', '--quiet', '-am', 'fixture: after');
    for (const file of [
      'scripts/production-deploy-scope.mjs',
      'scripts/verify-deployment.mjs',
      'scripts/config/deploy-gates.json',
    ]) {
      fs.mkdirSync(path.dirname(path.join(directory, file)), { recursive: true });
      fs.copyFileSync(path.join(process.cwd(), file), path.join(directory, file));
    }

    for (const [event, prior, all] of [
      ['push', 'f'.repeat(40), true],
      ['push', '0'.repeat(40), true],
      ['push', '', true],
      ['push', before, false],
      ['pull_request', '', false],
    ]) {
      const output = path.join(directory, 'github-output');
      fs.writeFileSync(output, '');
      const result = spawnSync(
        'bash',
        ['-e', '-o', 'pipefail', '-c', step.run.replaceAll('${{ github.event_name }}', event)],
        {
          cwd: directory,
          env: {
            ...environment,
            GITHUB_EVENT_NAME: event,
            BEFORE_SHA: prior,
            BASE_REF: 'main',
            GITHUB_OUTPUT: output,
          },
          encoding: 'utf8',
          timeout: 5000,
        },
      );
      assert.equal(result.error, undefined);
      assert.equal(result.signal, null);
      assert.equal(result.status, 0, `${event}/${prior}: ${result.stderr}`);
      const flags = Object.fromEntries(
        fs
          .readFileSync(output, 'utf8')
          .trim()
          .split('\n')
          .map((line) => line.split('=')),
      );
      assert.deepEqual(flags, {
        web: 'true',
        signaling: String(all),
        sandbox: String(all),
        desktop: String(all),
        native: String(all),
        extension: String(all),
        vscode: String(all),
        mobile: String(all),
      });
    }
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('every job depends only on jobs that exist', () => {
  for (const [name, job] of jobs) {
    for (const dependency of job.needs) {
      assert.ok(jobs.has(dependency), `${name} needs unknown job ${dependency}`);
    }
  }
});

test('no verification lane is a dependency of another lane', () => {
  const verification = new Set(
    [...jobs]
      .filter(([name, job]) => name !== AGGREGATE && lanesOf(job).length > 0)
      .map(([name]) => name),
  );
  assert.ok(verification.size > 1, 'expected more than one verification lane');

  const violations = [];
  for (const [name, job] of jobs) {
    if (name === AGGREGATE) continue;
    for (const dependency of job.needs) {
      if (verification.has(dependency)) {
        violations.push(`${name} needs ${dependency} (${lanesOf(jobs.get(dependency)).join('+')})`);
      }
    }
  }
  assert.deepEqual(
    violations,
    [],
    `a failure in these dependencies would skip the dependent lane instead of reporting it:\n${violations.join('\n')}`,
  );
});

test('no single job bundles more than one verification lane', () => {
  const bundled = [];
  for (const [name, job] of jobs) {
    if (name === AGGREGATE) continue;
    const lanes = lanesOf(job);
    if (lanes.length > 1) bundled.push(`${name} runs ${lanes.join(' + ')}`);
  }
  assert.deepEqual(bundled, [], `monolithic jobs:\n${bundled.join('\n')}`);
});

test('the aggregate gate waits on every other job', () => {
  const aggregate = jobs.get(AGGREGATE);
  assert.ok(aggregate, `ci.yml has no ${AGGREGATE} job`);
  const missing = [...jobs.keys()].filter(
    (name) => name !== AGGREGATE && !aggregate.needs.includes(name),
  );
  assert.deepEqual(missing, [], `${AGGREGATE} does not wait on: ${missing.join(', ')}`);
  assert.match(aggregate.condition, /always\(\)/);
});

test('platform lanes still gate on change detection', () => {
  const gated = [...jobs].filter(([, job]) =>
    /needs\.\w[\w-]*\.outputs\.\w+_changed/.test(job.condition),
  );
  assert.ok(
    gated.length >= 8,
    `expected the expensive lanes to stay change-gated, saw ${gated.length}`,
  );
  for (const [name, job] of gated) {
    const source = /needs\.([\w-]+)\.outputs/.exec(job.condition)[1];
    assert.ok(job.needs.includes(source), `${name} reads ${source} outputs without needing it`);
    assert.deepEqual(
      lanesOf(jobs.get(source)),
      [],
      `${name} gates on ${source}, which also runs verification work`,
    );
  }
});

const securitySteps = parseYaml(fs.readFileSync(WORKFLOW, 'utf8')).jobs.security.steps;

for (const level of ['critical', 'high']) {
  const step = securitySteps.find((entry) =>
    entry.name?.startsWith(`Dependency audit (JS), ${level} (blocking`),
  );

  for (const scenario of ['clean', 'advisory', 'transient', 'persistent']) {
    test(`${level} audit preserves output and blocking decisions under bash errexit: ${scenario}`, () => {
      assert.ok(step?.run, `missing actual ${level} dependency audit script`);
      assert.equal(step.shell, 'bash');
      const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ci-audit-capture-'));
      try {
        fs.writeFileSync(
          path.join(directory, 'pnpm'),
          `#!/bin/sh
set -eu
printf '%s\\n' "$*" >> "$AUDIT_CASE_DIR/calls"
count=$(wc -l < "$AUDIT_CASE_DIR/calls" | tr -d ' ')
case "$AUDIT_SCENARIO" in
  clean) printf '%s\\n' 'synthetic audit clean'; exit 0 ;;
  advisory) printf '%s\\n' 'synthetic vulnerability blocks audit'; exit 7 ;;
  transient)
    if [ "$count" -eq 1 ]; then printf '%s\\n' 'ERR_SOCKET_TIMEOUT synthetic transient'; exit 1; fi
    printf '%s\\n' 'synthetic audit recovered'; exit 0 ;;
  persistent) printf '%s\\n' 'ERR_PNPM_FETCH synthetic persistent'; exit 1 ;;
  *) exit 99 ;;
esac
`,
          { mode: 0o700 },
        );
        fs.writeFileSync(
          path.join(directory, 'sleep'),
          '#!/bin/sh\nprintf \'%s\\n\' "$*" >> "$AUDIT_CASE_DIR/sleeps"\n',
          { mode: 0o700 },
        );
        const result = spawnSync('/bin/bash', ['-e', '-o', 'pipefail', '-c', step.run], {
          encoding: 'utf8',
          env: {
            PATH: `${directory}:/usr/bin:/bin`,
            AUDIT_CASE_DIR: directory,
            AUDIT_SCENARIO: scenario,
          },
          timeout: 5000,
        });
        assert.equal(result.error, undefined);
        assert.equal(result.signal, null);
        const expectedCalls = { clean: 1, advisory: 1, transient: 2, persistent: 3 }[scenario];
        assert.deepEqual(
          fs.readFileSync(path.join(directory, 'calls'), 'utf8').trim().split('\n'),
          Array(expectedCalls).fill(`audit --audit-level=${level}`),
        );
        const sleeps = fs.existsSync(path.join(directory, 'sleeps'))
          ? fs.readFileSync(path.join(directory, 'sleeps'), 'utf8').trim().split('\n')
          : [];
        assert.deepEqual(
          sleeps,
          Array(scenario === 'persistent' ? 3 : scenario === 'transient' ? 1 : 0).fill('60'),
        );
        assert.equal(
          result.status,
          scenario === 'advisory' ? 7 : scenario === 'persistent' ? 1 : 0,
        );
        assert.equal(result.stderr, '');
        if (scenario === 'advisory') {
          assert.match(result.stdout, /synthetic vulnerability blocks audit/);
          assert.doesNotMatch(result.stdout, /retrying|unreachable/);
        } else if (scenario === 'transient') {
          assert.match(result.stdout, /ERR_SOCKET_TIMEOUT synthetic transient/);
          assert.match(result.stdout, /synthetic audit recovered/);
          assert.match(result.stdout, /unreachable on attempt 1; retrying/);
          assert.doesNotMatch(result.stdout, /after 3 attempts/);
        } else if (scenario === 'persistent') {
          assert.equal(
            (result.stdout.match(/ERR_PNPM_FETCH synthetic persistent/g) ?? []).length,
            3,
          );
          assert.match(result.stdout, /unreachable after 3 attempts/);
        } else {
          assert.match(result.stdout, /synthetic audit clean/);
          assert.doesNotMatch(result.stdout, /retrying|unreachable/);
        }
      } finally {
        fs.rmSync(directory, { recursive: true, force: true });
      }
    });
  }
}
