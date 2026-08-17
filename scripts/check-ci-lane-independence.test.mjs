import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import test from 'node:test';

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
