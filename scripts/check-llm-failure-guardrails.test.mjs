import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  diffSkipRatchet,
  gitFiles,
  scanSkipSites,
  summarizeSkipCensus,
  unjustifiedByPath,
  validateSkipRatchet,
} from './check-llm-failure-guardrails.mjs';

const RATCHET_PATH = path.join(process.cwd(), 'scripts/config/skipped-test-ratchet.json');

const skipCall = ['it', '.skip'].join('');
const ignoreAttr = ['#[', 'ignore', ']'].join('');

test('whole-tree discovery includes new source and excludes ignored worktrees', () => {
  const repository = mkdtempSync(path.join(os.tmpdir(), 'agi-llm-failure-files-'));
  try {
    execFileSync('git', ['init', '-q'], { cwd: repository });
    writeFileSync(path.join(repository, '.gitignore'), '.worktrees/\n');
    writeFileSync(path.join(repository, 'tracked.ts'), 'export const tracked = true;\n');
    execFileSync('git', ['add', '.gitignore', 'tracked.ts'], { cwd: repository });
    writeFileSync(path.join(repository, 'new.ts'), 'export const fresh = true;\n');
    mkdirSync(path.join(repository, '.worktrees'));
    writeFileSync(
      path.join(repository, '.worktrees', 'other.test.ts'),
      'export const other = true;\n',
    );

    const files = gitFiles(['ls-files', '-c', '-o', '--exclude-standard', '-z'], repository).map(
      (file) => path.relative(repository, file),
    );

    assert.deepEqual(files.sort(), ['.gitignore', 'new.ts', 'tracked.ts']);
  } finally {
    rmSync(repository, { recursive: true, force: true });
  }
});

test('counts a rust ignore that carries an inline reason as justified', () => {
  const sites = scanSkipSites(
    'crates/x/src/lib.rs',
    ['#[test]', '#[ignore = "needs a live provider key"]', 'fn t() {}'].join('\n'),
  );
  assert.equal(sites.length, 1);
  assert.equal(sites[0].kind, 'rust-ignore');
  assert.equal(sites[0].justification, 'reason');
  assert.equal(sites[0].line, 2);
});

test('counts a bare rust ignore as unjustified', () => {
  const sites = scanSkipSites(
    'crates/x/src/lib.rs',
    ['#[test]', ignoreAttr, 'fn t() {}'].join('\n'),
  );
  assert.equal(sites.length, 1);
  assert.equal(sites[0].justification, 'none');
});

test('an empty rust ignore reason does not count as a reason', () => {
  const sites = scanSkipSites('crates/x/src/lib.rs', '#[ignore = "   "]\nfn t() {}');
  assert.equal(sites[0].justification, 'none');
});

test('an llm-guardrail-allow annotation within two lines justifies a js skip', () => {
  const annotated = scanSkipSites(
    'apps/web/a.test.ts',
    ['// llm-guardrail-allow: covered by the live suite', `${skipCall}('x', () => {});`].join('\n'),
  );
  assert.equal(annotated[0].justification, 'annotated');

  const tooFar = scanSkipSites(
    'apps/web/a.test.ts',
    [
      '// llm-guardrail-allow: covered by the live suite',
      '',
      '',
      '',
      `${skipCall}('x', () => {});`,
    ].join('\n'),
  );
  assert.equal(tooFar[0].justification, 'none');
});

test('a skip inside a comment is not a census site', () => {
  const sites = scanSkipSites('apps/web/a.test.ts', `// ${skipCall}('x', () => {});`);
  assert.deepEqual(sites, []);
});

test('summarizeSkipCensus splits the total by justification', () => {
  const tally = summarizeSkipCensus([
    { justification: 'reason' },
    { justification: 'annotated' },
    { justification: 'none' },
    { justification: 'none' },
  ]);
  assert.deepEqual(tally, { total: 4, reason: 1, annotated: 1, unjustified: 2 });
});

test('unjustifiedByPath counts only unjustified sites', () => {
  const counts = unjustifiedByPath([
    { path: 'a.ts', justification: 'none' },
    { path: 'a.ts', justification: 'none' },
    { path: 'a.ts', justification: 'annotated' },
    { path: 'b.rs', justification: 'reason' },
  ]);
  assert.deepEqual([...counts], [['a.ts', 2]]);
});

test('an undeclared skip fails the ratchet', () => {
  const violations = diffSkipRatchet(new Map([['a.ts', 1]]), []);
  assert.equal(violations.length, 1);
  assert.match(violations[0], /a\.ts has 1 undeclared/);
});

test('exceeding a declared count fails the ratchet', () => {
  const violations = diffSkipRatchet(new Map([['a.ts', 3]]), [{ path: 'a.ts', count: 2 }]);
  assert.equal(violations.length, 1);
  assert.match(violations[0], /has 3 undeclared skipped\/ignored test\(s\) \(2 declared/);
});

test('a declared count that stops reproducing fails as stale on a whole-tree scan', () => {
  const violations = diffSkipRatchet(new Map([['a.ts', 1]]), [{ path: 'a.ts', count: 2 }]);
  assert.equal(violations.length, 1);
  assert.match(violations[0], /only ratchets down/);
});

test('stale detection is off for a partial file list', () => {
  assert.deepEqual(
    diffSkipRatchet(new Map(), [{ path: 'a.ts', count: 2 }], { detectStale: false }),
    [],
  );
});

test('a matching count passes the ratchet', () => {
  assert.deepEqual(diffSkipRatchet(new Map([['a.ts', 2]]), [{ path: 'a.ts', count: 2 }]), []);
});

test('validateSkipRatchet rejects entries with no reason, no owner or a duplicate path', () => {
  assert.deepEqual(validateSkipRatchet({ debt: [] }), []);
  assert.match(validateSkipRatchet({}).join(), /must declare a "debt" array/);

  const errors = validateSkipRatchet({
    debt: [
      { path: 'a.ts', count: 1, reason: 'too short', trackedBy: 'X-1' },
      { path: 'a.ts', count: 0, reason: 'a'.repeat(20), trackedBy: '' },
    ],
  });
  assert.match(errors.join('\n'), /debt\[0\] must record a reason of at least 20 characters/);
  assert.match(errors.join('\n'), /debt\[1\] duplicates path a\.ts/);
  assert.match(errors.join('\n'), /debt\[1\] count must be a positive integer/);
  assert.match(errors.join('\n'), /debt\[1\] must name a tracking id/);
});

test('the checked-in ratchet is valid and every entry records a reason and an owner', () => {
  const config = JSON.parse(readFileSync(RATCHET_PATH, 'utf8'));
  assert.deepEqual(validateSkipRatchet(config), []);
  assert.ok(config.debt.length > 0, 'the seeded inventory must not be empty');
});

const GUARD = path.join(process.cwd(), 'scripts/check-llm-failure-guardrails.mjs');

function stagedFixture(run) {
  const repository = mkdtempSync(path.join(os.tmpdir(), 'agi-staged-guard-'));
  const git = (...args) =>
    execFileSync('git', args, { cwd: repository, stdio: ['ignore', 'pipe', 'pipe'] });
  const write = (file, value) => {
    mkdirSync(path.dirname(path.join(repository, file)), { recursive: true });
    writeFileSync(path.join(repository, file), value);
  };
  try {
    git('init', '-q');
    for (const file of [
      'docs/agent-context/llm-failure-taxonomy.json',
      'scripts/config/skipped-test-ratchet.json',
    ]) {
      write(file, readFileSync(path.join(process.cwd(), file), 'utf8'));
      git('add', '--', file);
    }
    const check = () => {
      try {
        return {
          status: 0,
          output: execFileSync(process.execPath, [GUARD, '--staged'], {
            cwd: repository,
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'pipe'],
          }),
        };
      } catch (error) {
        return { status: error.status, output: String(error.stdout) + String(error.stderr) };
      }
    };
    run({ repository, git, write, check });
  } finally {
    rmSync(repository, { recursive: true, force: true });
  }
}

const unsafeFixture = "new Function('return 1')();\n";
const safeFixture = 'export const value = 1;\n';

test('staged validation refuses bad index content hidden by a safe working copy', () => {
  stagedFixture(({ git, write, check }) => {
    write('src/fixture.ts', unsafeFixture);
    git('add', 'src/fixture.ts');
    write('src/fixture.ts', safeFixture);
    const result = check();
    assert.equal(result.status, 1, result.output);
    assert.match(result.output, /dynamic code execution sink/);
  });
});

test('staged validation accepts good index content despite an unstaged edit', () => {
  stagedFixture(({ git, write, check }) => {
    write('src/fixture.ts', safeFixture);
    git('add', 'src/fixture.ts');
    write('src/fixture.ts', unsafeFixture);
    const result = check();
    assert.equal(result.status, 0, result.output);
  });
});

for (const file of ['src/café file.ts', 'src/two\nlines.ts']) {
  test(`staged validation reads the exact filename ${JSON.stringify(file)}`, () => {
    stagedFixture(({ git, write, check }) => {
      write(file, unsafeFixture);
      git('add', '--', file);
      assert.equal(check().status, 1);
    });
  });
}

test('a staged source absent from the working tree is still checked', () => {
  stagedFixture(({ repository, git, write, check }) => {
    write('src/fixture.ts', unsafeFixture);
    git('add', 'src/fixture.ts');
    rmSync(path.join(repository, 'src/fixture.ts'));
    assert.equal(check().status, 1);
  });
});

test('staged snapshots retain their blobs and reject a changing index', async () => {
  const { stagedReader } = await import('./check-llm-failure-guardrails.mjs');
  stagedFixture(({ repository, git, write }) => {
    write('src/fixture.ts', safeFixture);
    git('add', 'src/fixture.ts');
    const reader = stagedReader(repository);
    write('src/fixture.ts', unsafeFixture);
    git('add', 'src/fixture.ts');
    assert.equal(reader.read(path.join(repository, 'src/fixture.ts')), safeFixture);
    assert.throws(() => reader.assertUnchanged(), /index changed/);
  });
});

test('production and unannotated test execution sinks remain refused', () => {
  for (const file of ['src/unsafe.ts', 'src/__tests__/unsafe.test.ts']) {
    stagedFixture(({ git, write, check }) => {
      write(file, unsafeFixture);
      git('add', '--', file);
      assert.equal(check().status, 1);
    });
  }
});

test('owned vm test harnesses and explicit fixture annotations retain their existing policy', () => {
  for (const source of [
    "import { runInNewContext } from 'node:vm'; runInNewContext('1 + 1');\n",
    '// llm-guardrail-allow: executes repository-owned webview JavaScript in jsdom\n' +
      unsafeFixture,
  ]) {
    stagedFixture(({ git, write, check }) => {
      write('src/__tests__/owned.test.ts', source);
      git('add', 'src/__tests__/owned.test.ts');
      const result = check();
      assert.equal(result.status, 0, result.output);
    });
  }
});

test('staged snapshots support an index larger than the Node default output buffer', async () => {
  const { stagedReader } = await import('./check-llm-failure-guardrails.mjs');
  stagedFixture(({ repository, git, write }) => {
    write('seed.ts', safeFixture);
    git('add', 'seed.ts');
    const blob = git('rev-parse', ':seed.ts').toString().trim();
    const names = Array.from(
      { length: 10000 },
      (_, index) => `virtual/${index}-${'x'.repeat(70)}.ts`,
    );
    const input = names.map((file) => `100644 ${blob}\t${file}\0`).join('');
    assert.ok(Buffer.byteLength(input) > 1024 * 1024);
    execFileSync('git', ['update-index', '-z', '--index-info'], { cwd: repository, input });
    const reader = stagedReader(repository);
    assert.equal(reader.read(path.join(repository, names.at(-1))), safeFixture);
    reader.assertUnchanged();
  });
});

for (const badIndex of [true, false]) {
  test(`staged taxonomy validation uses the index when badIndex=${badIndex}`, () => {
    stagedFixture(({ repository, git, write, check }) => {
      const file = 'docs/agent-context/llm-failure-taxonomy.json';
      const good = readFileSync(path.join(repository, file), 'utf8');
      if (badIndex) {
        write(file, '{}');
        git('add', '--', file);
        write(file, good);
      } else write(file, '{}');
      const result = check();
      assert.equal(result.status, badIndex ? 1 : 0, result.output);
    });
  });
}
