import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  BASELINE_PATH,
  REPO_ROOT,
  blankNonCode,
  checkDependencyDeadlines,
  fetchCalls,
  hasDeadline,
  loadBaseline,
  scan,
} from './check-dependency-deadlines.mjs';

const roots = [];

function fixture({ files, baseline = { known: [] } }) {
  const root = mkdtempSync(path.join(tmpdir(), 'deadlines-'));
  roots.push(root);
  mkdirSync(path.join(root, path.dirname(BASELINE_PATH)), { recursive: true });
  writeFileSync(path.join(root, BASELINE_PATH), JSON.stringify(baseline));
  for (const [relative, source] of Object.entries(files)) {
    mkdirSync(path.join(root, path.dirname(relative)), { recursive: true });
    writeFileSync(path.join(root, relative), source);
  }
  return root;
}

test.after(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

test('a fetch with no deadline fails and names its line', () => {
  const root = fixture({
    files: { 'src/a.ts': 'const x = 1;\nawait fetch(url, { method: "POST", headers });' },
  });
  const { errors } = checkDependencyDeadlines(root, ['src']);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /src\/a\.ts:2 calls fetch with no deadline/);
});

test('an explicit signal, a shorthand signal and an AbortController all pass', () => {
  const root = fixture({
    files: {
      'src/a.ts': [
        'await fetch(url, { signal: AbortSignal.timeout(5000) });',
        'await fetch(url, { headers, signal });',
        'const controller = new AbortController();',
        'await fetch(url, { signal: controller.signal });',
      ].join('\n'),
    },
  });
  assert.deepEqual(checkDependencyDeadlines(root, ['src']).errors, []);
});

test('a wrapper that forwards the caller init passes, because the caller set the deadline', () => {
  assert.equal(hasDeadline('input, init'), true);
  assert.equal(hasDeadline('url, { ...init, method }'), true);
  assert.equal(hasDeadline('url, { method: "GET" }'), false);
  assert.equal(hasDeadline('url'), false);
});

test('a fetch inside a comment or a string is not a call site', () => {
  const source = [
    '/**',
    ' * @example await fetch(url) with no deadline',
    ' */',
    "const doc = 'call fetch(url) before anything';",
    '// await fetch(url);',
    'await fetch(real, { signal });',
  ].join('\n');
  assert.deepEqual(
    fetchCalls(source).map((call) => call.line),
    [6],
  );
  assert.equal(blankNonCode(source).split('\n').length, source.split('\n').length);
});

test('a client module is not measured', () => {
  const root = fixture({
    files: {
      'src/a.ts': "'use client';\nawait fetch(url, { method: 'POST' });",
      'src/b.ts': 'await fetch(url, { method: "POST" });',
    },
  });
  const { errors } = checkDependencyDeadlines(root, ['src']);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /src\/b\.ts/);
});

test('a baselined file passes at its recorded count and fails above it', () => {
  const files = { 'src/a.ts': 'await fetch(a, {});\nawait fetch(b, {});' };
  const at = fixture({
    files,
    baseline: { known: [{ file: 'src/a.ts', calls: 2, reason: 'r', fix: 'f' }] },
  });
  assert.deepEqual(checkDependencyDeadlines(at, ['src']).errors, []);

  const above = fixture({
    files,
    baseline: { known: [{ file: 'src/a.ts', calls: 1, reason: 'r', fix: 'f' }] },
  });
  assert.match(checkDependencyDeadlines(above, ['src']).errors[0], /only shrinks/);
});

test('the recorded count must be lowered once a call is fixed, and the entry deleted when none is left', () => {
  const fewer = fixture({
    files: { 'src/a.ts': 'await fetch(a, {});' },
    baseline: { known: [{ file: 'src/a.ts', calls: 2, reason: 'r', fix: 'f' }] },
  });
  assert.match(checkDependencyDeadlines(fewer, ['src']).errors[0], /down to 1 calls from 2/);

  const none = fixture({
    files: { 'src/a.ts': 'await fetch(a, { signal });' },
    baseline: { known: [{ file: 'src/a.ts', calls: 1, reason: 'r', fix: 'f' }] },
  });
  assert.match(checkDependencyDeadlines(none, ['src']).errors[0], /Delete the entry/);
});

test('a baseline entry with no reason, no fix or no count fails', () => {
  const files = { 'src/a.ts': 'await fetch(a, {});' };
  const base = { file: 'src/a.ts', calls: 1, reason: 'r', fix: 'f' };
  for (const [field, value, pattern] of [
    ['reason', ' ', /carries no reason/],
    ['fix', '', /names no fix/],
    ['calls', 0, /does not say how many calls/],
  ]) {
    const root = fixture({ files, baseline: { known: [{ ...base, [field]: value }] } });
    assert.ok(
      checkDependencyDeadlines(root, ['src']).errors.some((e) => pattern.test(e)),
      field,
    );
  }
});

test('a scanned root with no product file fails rather than passing silently', () => {
  assert.match(checkDependencyDeadlines(fixture({ files: {} }), ['src']).errors[0], /no product/);
});

test('the guard measures the repository and its baseline accounts for every finding', () => {
  const { findings, files, calls } = scan(REPO_ROOT);
  assert.ok(files > 1000, `expected the server trees, read ${files} files`);
  assert.ok(calls > 30, `expected outbound calls, found ${calls}`);
  const known = new Set(loadBaseline().known.map((entry) => entry.file));
  for (const finding of findings) assert.ok(known.has(finding.file), finding.file);
  assert.deepEqual(checkDependencyDeadlines().errors, []);
});
