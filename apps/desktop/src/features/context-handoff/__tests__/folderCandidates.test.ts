import { describe, expect, it } from 'vitest';
import {
  MAX_CHAT_ATTACHMENT_BYTES,
  MAX_CHAT_ATTACHMENT_COUNT,
} from '@agiworkforce/cloud-contracts';
import type { GlobMatch } from '../../../api/codeSearch';
import {
  isSelectionWithinCaps,
  selectDefaultCandidates,
  toFolderCandidates,
  totalBytes,
} from '../folderCandidates';

function match(overrides: Partial<GlobMatch> & Pick<GlobMatch, 'relativePath'>): GlobMatch {
  return {
    path: `/Users/x/repo/${overrides.relativePath}`,
    isFile: true,
    sizeBytes: 1_024,
    modifiedSecs: 0,
    ...overrides,
  };
}

describe('toFolderCandidates', () => {
  it('drops directories, which `**/*` also matches', () => {
    const result = toFolderCandidates([
      match({ relativePath: 'src', isFile: false }),
      match({ relativePath: 'README.md' }),
    ]);
    expect(result.map((c) => c.relativePath)).toEqual(['README.md']);
  });

  it('drops empty files and anything over the per-file cap', () => {
    const result = toFolderCandidates([
      match({ relativePath: 'empty.txt', sizeBytes: 0 }),
      match({ relativePath: 'huge.txt', sizeBytes: MAX_CHAT_ATTACHMENT_BYTES + 1 }),
      match({ relativePath: 'ok.txt', sizeBytes: MAX_CHAT_ATTACHMENT_BYTES }),
    ]);
    expect(result.map((c) => c.relativePath)).toEqual(['ok.txt']);
  });

  it('drops types the attachment pipeline has no MIME for', () => {
    const result = toFolderCandidates([
      match({ relativePath: 'app.wasm' }),
      match({ relativePath: 'notes.md' }),
    ]);
    expect(result.map((c) => c.relativePath)).toEqual(['notes.md']);
  });

  it('carries the root-relative path as the id so no home directory is uploaded', () => {
    const [candidate] = toFolderCandidates([
      match({ relativePath: 'src/index.ts', path: '/Users/siddhartha/repo/src/index.ts' }),
    ]);
    expect(candidate?.relativePath).toBe('src/index.ts');
    expect(candidate?.path).toBe('/Users/siddhartha/repo/src/index.ts');
  });

  it('preserves caller order, which is most-recently-modified first', () => {
    const result = toFolderCandidates([
      match({ relativePath: 'newest.md' }),
      match({ relativePath: 'older.md' }),
    ]);
    expect(result.map((c) => c.relativePath)).toEqual(['newest.md', 'older.md']);
  });
});

describe('selectDefaultCandidates', () => {
  it('stops at the count cap and reports how many were left out', () => {
    const candidates = toFolderCandidates(
      Array.from({ length: MAX_CHAT_ATTACHMENT_COUNT + 3 }, (_, i) =>
        match({ relativePath: `f${i}.md` }),
      ),
    );
    const { selected, omittedForCap } = selectDefaultCandidates(candidates);
    expect(selected).toHaveLength(MAX_CHAT_ATTACHMENT_COUNT);
    expect(omittedForCap).toBe(3);
  });

  it('stops at the total-bytes cap even when the count is fine', () => {
    const half = Math.floor(MAX_CHAT_ATTACHMENT_BYTES / 2) + 1;
    const candidates = toFolderCandidates([
      match({ relativePath: 'a.md', sizeBytes: half }),
      match({ relativePath: 'b.md', sizeBytes: half }),
    ]);
    const { selected, omittedForCap } = selectDefaultCandidates(candidates);
    expect(selected.map((c) => c.relativePath)).toEqual(['a.md']);
    expect(omittedForCap).toBe(1);
  });

  it('skips one oversized entry and keeps filling from the rest', () => {
    const big = MAX_CHAT_ATTACHMENT_BYTES - 512;
    const candidates = toFolderCandidates([
      match({ relativePath: 'big.md', sizeBytes: big }),
      match({ relativePath: 'wont-fit.md', sizeBytes: 4_096 }),
      match({ relativePath: 'fits.md', sizeBytes: 256 }),
    ]);
    const { selected } = selectDefaultCandidates(candidates);
    expect(selected.map((c) => c.relativePath)).toEqual(['big.md', 'fits.md']);
  });

  it('returns nothing for an empty folder rather than throwing', () => {
    expect(selectDefaultCandidates([])).toEqual({ selected: [], omittedForCap: 0 });
  });
});

describe('isSelectionWithinCaps', () => {
  it('refuses an empty selection so the sheet cannot confirm nothing', () => {
    expect(isSelectionWithinCaps([])).toBe(false);
  });

  it('agrees with the upload path on both caps', () => {
    const overCount = toFolderCandidates(
      Array.from({ length: MAX_CHAT_ATTACHMENT_COUNT + 1 }, (_, i) =>
        match({ relativePath: `f${i}.md` }),
      ),
    );
    expect(isSelectionWithinCaps(overCount)).toBe(false);

    const overBytes = toFolderCandidates([
      match({ relativePath: 'a.md', sizeBytes: MAX_CHAT_ATTACHMENT_BYTES }),
      match({ relativePath: 'b.md', sizeBytes: 1 }),
    ]);
    expect(isSelectionWithinCaps(overBytes)).toBe(false);

    const fine = toFolderCandidates([match({ relativePath: 'a.md', sizeBytes: 10 })]);
    expect(isSelectionWithinCaps(fine)).toBe(true);
  });
});

describe('totalBytes', () => {
  it('sums the selection for the sheet summary line', () => {
    const candidates = toFolderCandidates([
      match({ relativePath: 'a.md', sizeBytes: 100 }),
      match({ relativePath: 'b.md', sizeBytes: 250 }),
    ]);
    expect(totalBytes(candidates)).toBe(350);
  });
});
