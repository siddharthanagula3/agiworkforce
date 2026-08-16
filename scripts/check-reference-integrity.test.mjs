import assert from 'node:assert/strict';
import test from 'node:test';

import {
  blockContext,
  ignoreQueryMap,
  isIntentional,
  validateAllowlist,
} from './check-reference-integrity.mjs';
import {
  buildPathIndex,
  extractComments,
  markdownProseLines,
  resolveReference,
} from './lib/comment-scan.mjs';

test('extracts line and block comments with 1-indexed line numbers', () => {
  const source = [
    'const a = 1;',
    '// first',
    '/* second',
    '   still second */',
    'const b = 2;',
  ].join('\n');
  const comments = extractComments(source, '.ts');
  assert.equal(comments.length, 3);
  assert.equal(comments[0].line, 2);
  assert.match(comments[0].text, /first/);
  assert.equal(comments[1].line, 3);
  assert.equal(comments[2].line, 4);
});

test('does not treat a URL scheme as a comment', () => {
  const comments = extractComments('const u = "https://example.com/x";', '.ts');
  assert.deepEqual(comments, []);
});

test('finds a real comment that follows a URL on the same line', () => {
  const comments = extractComments('const u = "https://x.dev"; // apps/web/real.ts', '.ts');
  assert.equal(comments.length, 1);
  assert.match(comments[0].text, /apps\/web\/real\.ts/);
});

test('treats Rust doc comments as comments', () => {
  const comments = extractComments(
    ['//! module doc', '/// item doc', 'fn x() {}'].join('\n'),
    '.rs',
  );
  assert.equal(comments.length, 2);
});

test('ignores a hash inside a TOML string but reads a real comment', () => {
  const comments = extractComments(
    ['a = "value # not a comment"', 'b = 1 # real'].join('\n'),
    '.toml',
  );
  assert.equal(comments.length, 1);
  assert.match(comments[0].text, /real/);
});

test('skips fenced code blocks in markdown', () => {
  const source = ['prose one', '```', 'inside fence', '```', 'prose two'].join('\n');
  const lines = markdownProseLines(source).map((l) => l.text);
  assert.ok(lines.includes('prose one'));
  assert.ok(lines.includes('prose two'));
  assert.ok(!lines.includes('inside fence'));
});

const index = buildPathIndex([
  'apps/mobile/services/streaming.ts',
  'apps/web/app/page.tsx',
  'docs/decisions/README.md',
]);

test('resolves an exact repo-root path', () => {
  assert.equal(resolveReference('apps/web/app/page.tsx', 'docs/x.md', index), true);
});

test("resolves a path written relative to the referencing file's package", () => {
  assert.equal(resolveReference('services/streaming.ts', 'apps/mobile/lib/thing.ts', index), true);
});

test('reports a genuinely missing path', () => {
  assert.equal(resolveReference('apps/web/lib/assert-quota.ts', 'docs/x.md', index), false);
});

test('resolves a directory only when directories are allowed', () => {
  assert.equal(resolveReference('docs/decisions', 'x.md', index), false);
  assert.equal(resolveReference('docs/decisions', 'x.md', index, { allowDirectory: true }), true);
});

test('normalises a trailing slash before resolving a directory', () => {
  assert.equal(resolveReference('docs/decisions/', 'x.md', index, { allowDirectory: true }), true);
});

test('joins contiguous comment lines into one block', () => {
  const comments = [
    { line: 1, text: 'The @agiworkforce/services facade' },
    { line: 2, text: 'was deleted at M8.' },
    { line: 9, text: 'unrelated' },
  ];
  const byLine = blockContext(comments);
  assert.match(byLine.get(1), /deleted/);
  assert.match(byLine.get(2), /facade/);
  assert.equal(byLine.get(9), 'unrelated');
});

test('intentional entries can be scoped by kind', () => {
  const intentional = [{ pathPrefix: 'docs/plan.md', kinds: ['package'], reason: 'x'.repeat(25) }];
  assert.equal(
    isIntentional({ file: 'docs/plan.md', kind: 'package', reference: '@a/b' }, intentional),
    true,
  );
  assert.equal(
    isIntentional({ file: 'docs/plan.md', kind: 'md-path', reference: 'apps/x.ts' }, intentional),
    false,
  );
});

test('an empty intentional entry never suppresses anything', () => {
  assert.equal(
    isIntentional({ file: 'a', kind: 'path', reference: 'b' }, [{ reason: 'x' }]),
    false,
  );
});

test('intentional entries require a substantive reason', () => {
  const errors = [];
  validateAllowlist({ intentional: [{ pathPrefix: 'a/', reason: 'too short' }] }, errors);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /at least 20 characters/);
});

test('knownContradictions require an owner', () => {
  const errors = [];
  validateAllowlist({ knownContradictions: [{ key: 'path::a::b' }] }, errors);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /needs an owner/);
});

test('a bare candidate is also asked as a directory', () => {
  const map = ignoreQueryMap(['apps/mobile/ios']);
  assert.deepEqual([...map.keys()], ['apps/mobile/ios', 'apps/mobile/ios/']);
  assert.equal(map.get('apps/mobile/ios/'), 'apps/mobile/ios');
});

test('a candidate that already ends in a slash is not duplicated or rewritten', () => {
  const map = ignoreQueryMap(['build/']);
  assert.deepEqual([...map.keys()], ['build/']);
  assert.equal(map.get('build/'), 'build/');
});

test('each query maps back to the reference it came from', () => {
  const map = ignoreQueryMap(['a/b', 'c/']);
  assert.deepEqual(
    [...map.entries()],
    [
      ['a/b', 'a/b'],
      ['a/b/', 'a/b'],
      ['c/', 'c/'],
    ],
  );
});
