import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, URL } from 'node:url';
import { performance } from 'node:perf_hooks';
import {
  qualifyInternalCoverage,
  structuralSinkRules,
  warningIdentity,
} from './lib/semgrep-coverage.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SOURCE = 'apps/web/lib/hooks/useChatStream.ts';
const RULE = 'fixture.taint.sinks';
const VERSION = 'fixture-engine';
const hash = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const rule = () => ({
  id: RULE,
  mode: 'taint',
  languages: ['js', 'ts'],
  'pattern-sinks': [
    { patterns: [{ pattern: 'document.$METHOD($VALUE)' }] },
    { patterns: [{ pattern: '$ELEMENT.$METHOD($VALUE)' }] },
  ],
});

async function fixture(change = () => {}, behavior = 'complete') {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'coverage-test-'));
  try {
    const cwd = path.join(directory, 'checkout');
    fs.mkdirSync(path.dirname(path.join(cwd, SOURCE)), { recursive: true });
    fs.copyFileSync(path.join(ROOT, SOURCE), path.join(cwd, SOURCE));
    for (const argv of [
      ['init', '-q'],
      ['add', SOURCE],
      [
        '-c',
        'user.name=coverage fixture',
        '-c',
        'user.email=coverage-fixture@example.invalid',
        'commit',
        '-qm',
        'test: synthetic scanner coverage fixture',
      ],
    ]) {
      execFileSync('git', argv, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    }
    const bundle = { rules: [rule()] };
    const report = {
      version: VERSION,
      results: [],
      errors: [],
      skipped_rules: [],
      paths: { scanned: [SOURCE] },
      time: {
        fixpoint_timeouts: [
          {
            error_type: 'Fixpoint timeout',
            message: `[rules: 1, first: ${RULE}]`,
            location: { path: SOURCE, start: { line: 1 } },
          },
        ],
      },
    };
    const context = {
      version: VERSION,
      sourceBeforeAfterEqual: true,
      actualScannerExit: 0,
      head: execFileSync('git', ['rev-parse', 'HEAD'], { cwd, encoding: 'utf8' }).trim(),
      tree: execFileSync('git', ['rev-parse', 'HEAD^{tree}'], { cwd, encoding: 'utf8' }).trim(),
      sources: [
        {
          path: SOURCE,
          sha256: hash(fs.readFileSync(path.join(cwd, SOURCE))),
          bytes: fs.statSync(path.join(cwd, SOURCE)).size,
          symlink: false,
        },
      ],
    };
    change({ bundle, report, context, cwd });
    const bundlePath = path.join(directory, 'bundle.json');
    const reportPath = path.join(directory, 'report.json');
    const contextPath = path.join(directory, 'context.json');
    fs.writeFileSync(bundlePath, JSON.stringify(bundle));
    fs.writeFileSync(reportPath, JSON.stringify(report));
    context.rulesSha256 ??= hash(fs.readFileSync(bundlePath));
    context.reportSha256 ??= hash(fs.readFileSync(reportPath));
    fs.writeFileSync(contextPath, JSON.stringify(context));
    const replayedRules = [];
    const execute = async (argv, options) => {
      if (options.timeoutMs !== undefined) {
        assert.ok(Number.isSafeInteger(options.timeoutMs));
        assert.ok(options.timeoutMs > 0 && options.timeoutMs <= 120_000);
      }
      if (argv[0] === '--version')
        return { code: 0, stdout: behavior === 'wrong-version' ? 'other-engine' : VERSION };
      if (behavior === 'execution-error') throw new Error('synthetic-private-scanner-message');
      if (argv.includes('--time')) {
        const original = JSON.parse(fs.readFileSync(argv[argv.indexOf('--config') + 1], 'utf8'));
        assert.equal(original.rules.length, 1);
        const replayed = original.rules[0];
        assert.deepEqual(
          replayed,
          bundle.rules.find((item) => item.id === replayed.id),
        );
        replayedRules.push(replayed.id);
        const output = argv[argv.indexOf('--output') + 1];
        const targets = argv.slice(argv.indexOf('--output') + 2);
        assert.equal(targets.length, 1);
        assert.equal(fs.realpathSync(targets[0]), fs.realpathSync(path.join(cwd, SOURCE)));
        assert.ok(argv.includes('--timeout=30'));
        assert.ok(argv.includes('--jobs=1'));
        const replay = {
          version: VERSION,
          engine_requested: 'OSS',
          results: [],
          errors: [],
          skipped_rules: [],
          paths: { scanned: targets },
          time: { rules: [replayed.id], fixpoint_timeouts: [] },
        };
        if (behavior === 'replay-warning' && replayed.id === RULE)
          replay.time.fixpoint_timeouts.push({
            error_type: 'Fixpoint timeout',
            message: `[rules: 1, first: ${RULE}]`,
            location: { path: targets[0], start: { line: 1 } },
          });
        if (behavior === 'replay-unknown-warning')
          replay.time.fixpoint_timeouts.push({
            error_type: 'unknown',
            message: `[rules: 1, first: ${replayed.id}]`,
            location: { path: targets[0], start: { line: 1 } },
          });
        if (behavior === 'replay-wrong-rule-warning')
          replay.time.fixpoint_timeouts.push({
            error_type: 'Fixpoint timeout',
            message: '[rules: 1, first: fixture.other.rule]',
            location: { path: targets[0], start: { line: 1 } },
          });
        if (behavior === 'replay-grouped-warning')
          replay.time.fixpoint_timeouts.push({
            error_type: 'Fixpoint timeout',
            message: `[rules: 2, first: ${replayed.id}]`,
            location: { path: targets[0], start: { line: 1 } },
          });
        if (behavior === 'replay-foreign-warning')
          replay.time.fixpoint_timeouts.push({
            error_type: 'Fixpoint timeout',
            message: `[rules: 1, first: ${replayed.id}]`,
            location: { path: 'another.ts', start: { line: 1 } },
          });
        if (behavior === 'replay-finding')
          replay.results.push({ path: targets[0], check_id: replayed.id, start: { line: 1 } });
        if (behavior === 'replay-wrong-version') replay.version = 'other-engine';
        if (behavior === 'replay-wrong-engine') replay.engine_requested = 'PRO';
        if (behavior === 'replay-missing-rule') replay.time.rules = [];
        if (behavior === 'replay-extra-rule') replay.time.rules.push('fixture.other.rule');
        if (behavior === 'replay-missing-target') replay.paths.scanned = [];
        if (behavior === 'replay-extra-target') replay.paths.scanned.push('another.ts');
        if (behavior === 'replay-parse-error') replay.errors.push({ type: 'Syntax error' });
        if (behavior === 'replay-skipped-rule') replay.skipped_rules.push({ rule_id: replayed.id });
        if (behavior === 'replay-source-drift') fs.appendFileSync(path.join(cwd, SOURCE), '\n');
        fs.writeFileSync(output, JSON.stringify(replay));
        return { code: behavior === 'replay-nonzero-exit' ? 2 : 0, stdout: '' };
      }
      assert.ok(argv.includes('--disable-nosem'));
      if (behavior === 'source-drift') fs.appendFileSync(path.join(cwd, SOURCE), '\n');
      const output = argv[argv.indexOf('--output') + 1];
      const targets = argv.slice(argv.indexOf('--output') + 2);
      const controls = targets.at(-1);
      const results = [2, 3, 4, 5, 6].map((line) => ({
        path: controls,
        check_id: 'coverage-sink-0',
        start: { line },
      }));
      results.push({ path: controls, check_id: 'coverage-sink-1', start: { line: 9 } });
      const structural = {
        version: VERSION,
        results,
        errors: [],
        skipped_rules: [],
        paths: { scanned: targets },
      };
      if (behavior === 'potential-sink')
        structural.results.push({
          path: targets[0],
          check_id: 'coverage-sink-0',
          start: { line: 2 },
        });
      if (behavior === 'missing-control') structural.results.pop();
      if (behavior === 'negative-receiver')
        structural.results.push({
          path: controls,
          check_id: 'coverage-sink-0',
          start: { line: 12 },
        });
      if (behavior === 'empty-targets') structural.paths.scanned = [];
      if (behavior === 'duplicate-target') structural.paths.scanned.push(targets[0]);
      if (behavior === 'parse-error') structural.errors.push({ type: 'Syntax error' });
      if (behavior === 'skipped-rule')
        structural.skipped_rules.push({ rule_id: 'coverage-sink-0' });
      fs.writeFileSync(
        output,
        behavior === 'invalid-json' ? 'synthetic-private-invalid-json' : JSON.stringify(structural),
      );
      return { code: behavior === 'nonzero-exit' ? 2 : 0, stdout: '' };
    };
    const result = await qualifyInternalCoverage({
      report,
      reportPath,
      bundlePath,
      contextPath,
      expectedVersion: VERSION,
      cwd,
      execute,
    });
    if (report.time.fixpoint_timeouts.some((warning) => warning.message.startsWith('[rules: 2,'))) {
      assert.deepEqual(
        replayedRules.sort(),
        bundle.rules
          .filter((item) => item.mode === 'taint')
          .map((item) => item.id)
          .sort(),
      );
    }
    return result;
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

test('a source-bound single-rule warning requires all whole sources and six calibrated sink matches', async () => {
  assert.deepEqual(await fixture(), { nativeWarnings: 1, structurallyQualifiedPairs: 1 });
});

function aggregate({ bundle, report }) {
  bundle.rules.push({
    id: 'fixture.other.taint',
    mode: 'taint',
    languages: ['typescript'],
    options: { symbolic_propagation: true },
    'pattern-sources': [{ pattern: 'source(...)' }],
    'pattern-sinks': [{ pattern: 'sink(...)' }],
    'pattern-sanitizers': [{ pattern: 'sanitize(...)' }],
    'pattern-propagators': [{ pattern: '$TO = $FROM', from: '$FROM', to: '$TO' }],
  });
  report.engine_requested = 'OSS';
  report.time.fixpoint_timeouts[0].message = '[rules: 2, first: fixture.other.taint]';
}

test('an aggregate warning replays every original applicable taint object unchanged', async () => {
  assert.deepEqual(await fixture(aggregate), { nativeWarnings: 1, structurallyQualifiedPairs: 0 });
});

test('a replay retains its exact native warning and requires the existing calibrated no-sink predicate', async () => {
  assert.deepEqual(await fixture(aggregate, 'replay-warning'), {
    nativeWarnings: 1,
    structurallyQualifiedPairs: 1,
  });
});

test('all aggregate replay commands share the existing 120-second deadline', async (t) => {
  const clock = [0, 1, 2, 90_000, 90_001, 120_001];
  t.mock.method(performance, 'now', () => clock.shift() ?? 120_001);
  await assert.rejects(fixture(aggregate), /Aggregate coverage deadline exceeded/);
});

for (const behavior of [
  'replay-unknown-warning',
  'replay-wrong-rule-warning',
  'replay-grouped-warning',
  'replay-foreign-warning',
  'replay-finding',
  'replay-wrong-version',
  'replay-wrong-engine',
  'replay-missing-rule',
  'replay-extra-rule',
  'replay-missing-target',
  'replay-extra-target',
  'replay-parse-error',
  'replay-skipped-rule',
  'replay-nonzero-exit',
  'replay-source-drift',
]) {
  test(`${behavior} refuses aggregate coverage`, async () => {
    await assert.rejects(fixture(aggregate, behavior));
  });
}

for (const [name, change] of [
  [
    'zero count',
    ({ report }) => {
      report.time.fixpoint_timeouts[0].message = '[rules: 0, first: fixture.other.taint]';
    },
  ],
  [
    'leading-zero count',
    ({ report }) => {
      report.time.fixpoint_timeouts[0].message = '[rules: 02, first: fixture.other.taint]';
    },
  ],
  [
    'unsafe count',
    ({ report }) => {
      report.time.fixpoint_timeouts[0].message =
        '[rules: 9007199254740992, first: fixture.other.taint]';
    },
  ],
  [
    'omitted taint rule',
    ({ bundle }) => {
      bundle.rules.pop();
    },
  ],
  [
    'first rule is non-taint',
    ({ bundle }) => {
      bundle.rules[1].mode = 'search';
    },
  ],
  [
    'unsupported rule mode',
    ({ bundle }) => {
      bundle.rules[1].mode = 'join';
    },
  ],
  [
    'unsupported mixed language',
    ({ bundle }) => {
      bundle.rules[1].languages.push('python');
    },
  ],
  [
    'missing taint language',
    ({ bundle }) => {
      bundle.rules[1].languages = [];
    },
  ],
  [
    'unsupported generic taint',
    ({ bundle }) => {
      bundle.rules[1].languages = ['generic'];
    },
  ],
  [
    'unsupported engine',
    ({ report }) => {
      report.engine_requested = 'PRO';
    },
  ],
  [
    'unknown first rule',
    ({ report }) => {
      report.time.fixpoint_timeouts[0].message = '[rules: 2, first: unknown.rule]';
    },
  ],
]) {
  test(`${name} refuses aggregate coverage before reanalysis`, async () => {
    await assert.rejects(
      fixture((state) => {
        aggregate(state);
        change(state);
      }),
    );
  });
}

for (const behavior of [
  'potential-sink',
  'missing-control',
  'negative-receiver',
  'empty-targets',
  'duplicate-target',
  'parse-error',
  'skipped-rule',
  'invalid-json',
  'nonzero-exit',
  'wrong-version',
  'execution-error',
  'source-drift',
]) {
  test(`${behavior} never qualifies internal coverage`, async () => {
    await assert.rejects(fixture(() => {}, behavior));
  });
}

for (const [name, change] of [
  [
    'unknown rule',
    ({ report }) => {
      report.time.fixpoint_timeouts[0].message = '[rules: 1, first: unknown.rule]';
    },
  ],
  [
    'aggregate warning',
    ({ report }) => {
      report.time.fixpoint_timeouts[0].message = `[rules: 2, first: ${RULE}]`;
    },
  ],
  [
    'wrong source hash',
    ({ context }) => {
      context.sources[0].sha256 = '0'.repeat(64);
    },
  ],
  [
    'wrong report hash',
    ({ context }) => {
      context.reportSha256 = '0'.repeat(64);
    },
  ],
  [
    'wrong bundle hash',
    ({ context }) => {
      context.rulesSha256 = '0'.repeat(64);
    },
  ],
  [
    'wrong source revision',
    ({ context }) => {
      context.head = '0'.repeat(40);
    },
  ],
  [
    'unproven source stability',
    ({ context }) => {
      context.sourceBeforeAfterEqual = false;
    },
  ],
  [
    'failed original scanner',
    ({ context }) => {
      context.actualScannerExit = 2;
    },
  ],
  [
    'duplicate rule',
    ({ bundle }) => {
      bundle.rules.push(rule());
    },
  ],
  [
    'duplicate source',
    ({ context }) => {
      context.sources.push(context.sources[0]);
    },
  ],
  [
    'unsupported sink exactness',
    ({ bundle }) => {
      bundle.rules[0]['pattern-sinks'][0].exact = true;
    },
  ],
  [
    'unsupported sink side effects',
    ({ bundle }) => {
      bundle.rules[0]['pattern-sinks'][0]['by-side-effect'] = true;
    },
  ],
  [
    'unsupported sink labels',
    ({ bundle }) => {
      bundle.rules[0]['pattern-sinks'][0].requires = 'LABEL';
    },
  ],
  [
    'unsupported rule options',
    ({ bundle }) => {
      bundle.rules[0].options = { symbolic_propagation: true };
    },
  ],
  [
    'unknown diagnostic kind',
    ({ report }) => {
      report.time.fixpoint_timeouts[0].error_type = 'unknown';
    },
  ],
  [
    'position outside source',
    ({ report }) => {
      report.time.fixpoint_timeouts[0].location.start.line = Number.MAX_SAFE_INTEGER;
    },
  ],
  [
    'empty warnings with wrong report provenance',
    ({ report, context }) => {
      report.time.fixpoint_timeouts = [];
      context.reportSha256 = '0'.repeat(64);
    },
  ],
  [
    'empty warnings with wrong source provenance',
    ({ report, context }) => {
      report.time.fixpoint_timeouts = [];
      context.head = '0'.repeat(40);
    },
  ],
  [
    'empty warnings with wrong source bytes',
    ({ report, context }) => {
      report.time.fixpoint_timeouts = [];
      context.sources[0].sha256 = '0'.repeat(64);
    },
  ],
  [
    'empty warnings with incomplete inventory',
    ({ report, context }) => {
      report.time.fixpoint_timeouts = [];
      context.sources = [];
    },
  ],
  [
    'empty warnings with added source',
    ({ report, cwd }) => {
      report.time.fixpoint_timeouts = [];
      fs.writeFileSync(path.join(cwd, 'added.ts'), 'export const added = true;\n');
    },
  ],
]) {
  test(`${name} refuses instead of trusting original report claims`, async () => {
    await assert.rejects(fixture(change));
  });
}

test('zero warnings still require valid original provenance when it is supplied', async () => {
  assert.deepEqual(
    await fixture(({ report }) => {
      report.time.fixpoint_timeouts = [];
    }),
    { nativeWarnings: 0, structurallyQualifiedPairs: 0 },
  );
});

test('a warning cannot select a path outside the original source set', () => {
  assert.throws(() =>
    warningIdentity(
      {
        error_type: 'Fixpoint timeout',
        message: `[rules: 1, first: ${RULE}]`,
        location: { path: '../outside.ts', start: { line: 1 } },
      },
      new Set([SOURCE]),
    ),
  );
});

test('sink extraction preserves formula objects and rejects unsupported operators', () => {
  const original = rule();
  const derived = structuralSinkRules(original);
  assert.strictEqual(derived[0].patterns, original['pattern-sinks'][0].patterns);
  assert.strictEqual(derived[0].languages, original.languages);
  original['pattern-sinks'][0].patterns.push({ 'pattern-not': 'document.write($VALUE)' });
  assert.throws(() => structuralSinkRules(original));
});
