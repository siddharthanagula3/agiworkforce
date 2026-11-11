import { describe, expect, it } from 'vitest';

import { restoreRemovedFile } from './restore-removed-file';

const A = { id: 'a' };
const B = { id: 'b' };
const C = { id: 'c' };

describe('restoreRemovedFile', () => {
  it('puts the file back at its old position among the current files', () => {
    expect(restoreRemovedFile([B, C], A, 0)).toEqual([A, B, C]);
    expect(restoreRemovedFile([A, C], B, 1)).toEqual([A, B, C]);
  });

  it('keeps files that arrived while the removal was pending', () => {
    expect(restoreRemovedFile([B, C], A, 0).map((file) => file.id)).toEqual(['a', 'b', 'c']);
  });

  it('clamps an old position beyond the current list', () => {
    expect(restoreRemovedFile([A], C, 5)).toEqual([A, C]);
  });

  it('does not duplicate a file a refresh already returned', () => {
    expect(restoreRemovedFile([A, B], A, 0)).toEqual([A, B]);
  });
});
