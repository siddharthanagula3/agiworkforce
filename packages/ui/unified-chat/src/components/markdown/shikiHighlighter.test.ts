import { beforeEach, describe, expect, it } from 'vitest';

import { clearHighlightCache, highlightToLines, readHighlightCache } from './shikiHighlighter';

describe('Shiki highlight cache', () => {
  beforeEach(() => {
    clearHighlightCache();
  });

  it('returns only the exact source stored under its bounded fingerprint key', async () => {
    const source = 'const alpha = 1;';
    const lines = await highlightToLines(source, 'javascript');

    expect(lines).not.toBeNull();
    expect(readHighlightCache(source, 'js')).toBe(lines);
    expect(readHighlightCache('const alpha = 2;', 'javascript')).toBeNull();
  });
});
