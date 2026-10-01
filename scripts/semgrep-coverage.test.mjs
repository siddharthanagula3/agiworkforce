import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
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
    const execute = async (argv) => {
      if (argv[0] === '--version')
        return { code: 0, stdout: behavior === 'wrong-version' ? 'other-engine' : VERSION };
      if (behavior === 'execution-error') throw new Error('synthetic-private-scanner-message');
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
    return await qualifyInternalCoverage({
      report,
      reportPath,
      bundlePath,
      contextPath,
      expectedVersion: VERSION,
      cwd,
      execute,
    });
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

test('a source-bound single-rule warning requires all whole sources and six calibrated sink matches', async () => {
  assert.deepEqual(await fixture(), { nativeWarnings: 1, structurallyQualifiedPairs: 1 });
});

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
