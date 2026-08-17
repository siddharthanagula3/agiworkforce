import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import {
  diffSkipRatchet,
  scanSkipSites,
  summarizeSkipCensus,
  unjustifiedByPath,
  validateSkipRatchet,
} from './check-llm-failure-guardrails.mjs';

const RATCHET_PATH = path.join(process.cwd(), 'scripts/config/skipped-test-ratchet.json');

const skipCall = ['it', '.skip'].join('');
const ignoreAttr = ['#[', 'ignore', ']'].join('');

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
