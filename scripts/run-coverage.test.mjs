import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { runCoverage } from './run-coverage.mjs';
import { parse } from 'yaml';

function fixture(t, cases) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'coverage-runner-')));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const projects = cases.map((_, i) => `packages/p${i}`);
  fs.writeFileSync(
    path.join(root, 'vitest.config.ts'),
    `({ test: { projects: ${JSON.stringify(projects)} } })`,
  );
  fs.writeFileSync(
    path.join(root, 'package.json'),
    JSON.stringify({
      scripts: {
        'test:coverage': 'node scripts/run-coverage.mjs --coverage.thresholds.lines=75',
      },
    }),
  );
  for (const [i, entry] of cases.entries()) {
    const cwd = path.join(root, projects[i]);
    const runner = path.join(cwd, 'node_modules/vitest');
    fs.mkdirSync(runner, { recursive: true });
    fs.writeFileSync(path.join(runner, 'package.json'), '{"name":"vitest"}');
    fs.writeFileSync(path.join(cwd, 'package.json'), '{}');
    const file = path.join(root, entry.shared ? 'shared.ts' : `file${i}.ts`);
    const report = {
      [file]: {
        path: file,
        statementMap: {
          0: { start: { line: 1, column: 0 }, end: { line: 1, column: 10 } },
          1: { start: { line: 2, column: 0 }, end: { line: 2, column: 10 } },
        },
        s: { 0: entry.hits?.[0] ?? 1, 1: entry.hits?.[1] ?? 1 },
        fnMap: {},
        f: {},
        branchMap: {},
        b: {},
      },
    };
    fs.writeFileSync(
      path.join(runner, 'vitest.mjs'),
      `
      import fs from 'node:fs'; import path from 'node:path';
      if(process.cwd() !== ${JSON.stringify(cwd)}) throw new Error('Wrong package cwd');
      const dir = process.argv.find(a=>a.startsWith('--coverage.reportsDirectory=')).split('=').slice(1).join('=');
      fs.mkdirSync(dir,{recursive:true});
      ${entry.missing ? '' : `fs.writeFileSync(path.join(dir,'coverage-final.json'),${JSON.stringify(entry.malformed ? 'broken' : JSON.stringify(entry.empty ? {} : report))});`}
      process.exitCode=${entry.exit ?? 0};
    `,
    );
  }
  return root;
}

test('uses each package runner and cwd, then merges duplicate source files by coverage', (t) => {
  const root = fixture(t, [
    { shared: true, hits: [1, 0] },
    { shared: true, hits: [0, 1] },
  ]);
  assert.equal(runCoverage(root), 0);
  const summary = JSON.parse(fs.readFileSync(path.join(root, 'coverage/coverage-summary.json')));
  assert.equal(summary.total.lines.total, 2);
  assert.equal(summary.total.lines.pct, 100);
});

test('a package test or threshold failure is not hidden by a passing aggregate', (t) => {
  assert.equal(runCoverage(fixture(t, [{ exit: 1 }, {}])), 1);
});

test('enforces the repository line floor', (t) => {
  assert.equal(runCoverage(fixture(t, [{ hits: [1, 0] }])), 1);
});

for (const kind of ['missing', 'malformed', 'empty']) {
  test(`${kind} reports fail even with stale passing evidence`, (t) => {
    const root = fixture(t, [{ [kind]: true }]);
    fs.mkdirSync(path.join(root, 'coverage'));
    fs.writeFileSync(path.join(root, 'coverage/coverage-final.json'), '{"stale":true}');
    assert.equal(runCoverage(root), 1);
    assert.equal(
      fs.readFileSync(path.join(root, 'coverage/coverage-final.json'), 'utf8').includes('stale'),
      false,
    );
  });
}

test('an empty project scope cannot report success', (t) => {
  assert.throws(() => runCoverage(fixture(t, [])), /nonempty/);
});

test('an invalid project scope cannot preserve a stale aggregate', (t) => {
  const root = fixture(t, []);
  fs.mkdirSync(path.join(root, 'coverage'));
  fs.writeFileSync(path.join(root, 'coverage/coverage-final.json'), '{"stale":true}');
  assert.throws(() => runCoverage(root), /nonempty/);
  assert.equal(fs.existsSync(path.join(root, 'coverage/coverage-final.json')), false);
});

test('CI propagates coverage failures and uploads only explicit coverage reports', () => {
  const workflow = parse(
    fs.readFileSync(new URL('../.github/workflows/test-l1.yml', import.meta.url), 'utf8'),
  );
  const steps = workflow.jobs['test-l1'].steps;
  const generation = steps.find((step) => step.name === 'Generate Coverage Report');
  assert.equal(generation.run, 'pnpm test:coverage');
  assert.equal(generation.if, '${{ !cancelled() }}');
  assert.notEqual(generation['continue-on-error'], true);
  const artifact = steps.find((step) => step.name === 'Preserve coverage evidence');
  assert.equal(artifact.with['if-no-files-found'], 'error');
  assert.equal(
    workflow.jobs['upload-coverage'].steps.find(
      (step) => step.name === 'Upload Coverage to Codecov',
    ).with.disable_search,
    true,
  );
});

test('only the isolated main-push uploader receives OIDC permission', () => {
  const workflow = parse(
    fs.readFileSync(new URL('../.github/workflows/test-l1.yml', import.meta.url), 'utf8'),
  );
  assert.equal(workflow.permissions['id-token'], undefined);
  assert.equal(workflow.jobs['test-l1'].permissions?.['id-token'], undefined);
  const job = workflow.jobs['upload-coverage'];
  assert.equal(job.needs, 'test-l1');
  assert.ok(job.if.includes("github.event_name == 'push'"));
  assert.deepEqual(job.permissions, { contents: 'read', 'id-token': 'write' });
  assert.ok(job.steps.every((step) => !step.run));
  const upload = job.steps.find((step) => step.name === 'Upload Coverage to Codecov');
  assert.equal(upload.with.use_oidc, true);
  assert.equal(upload.with.fail_ci_if_error, true);
});
