import assert from 'node:assert/strict';
import test from 'node:test';

import { normalizeContextWindowUnpublished } from '../scripts/compile.mjs';

const MARKER = {
  source: 'https://provider.example/announcing-m',
  verifiedOn: '2026-10-09',
};

test('a model without the marker has nothing to normalize', () => {
  assert.equal(normalizeContextWindowUnpublished('m', {}), undefined);
});

test('a sourced, dated marker passes through unchanged', () => {
  assert.deepEqual(
    normalizeContextWindowUnpublished('m', { contextWindowUnpublished: { ...MARKER } }),
    MARKER,
  );
});

test('rejects a marker that is unsourced, undated, or carries other keys', () => {
  for (const marker of [
    { verifiedOn: MARKER.verifiedOn },
    { ...MARKER, source: 'provider.example/announcing-m' },
    { source: MARKER.source },
    { ...MARKER, verifiedOn: 'October 9, 2026' },
    { ...MARKER, contextTokens: 1 },
    'unpublished',
  ]) {
    assert.throws(() =>
      normalizeContextWindowUnpublished('m', { contextWindowUnpublished: marker }),
    );
  }
});

test('rejects a marker beside a declared context window', () => {
  assert.throws(
    () =>
      normalizeContextWindowUnpublished('m', {
        contextWindow: 1_000_000,
        contextWindowUnpublished: { ...MARKER },
      }),
    /keep only one/u,
  );
});
