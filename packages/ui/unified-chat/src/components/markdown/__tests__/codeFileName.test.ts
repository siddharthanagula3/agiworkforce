import { describe, expect, it } from 'vitest';
import { codeFileFor } from '../codeFileName';

describe('codeFileFor', () => {
  it('names a mermaid block as a .mmd file', () => {
    expect(codeFileFor('mermaid')).toEqual({ fileName: 'code.mmd', extension: 'mmd' });
    expect(codeFileFor(' Mermaid ')).toEqual({ fileName: 'code.mmd', extension: 'mmd' });
  });

  it('keeps the existing names for highlighted, whole-file and unknown languages', () => {
    expect(codeFileFor('ts')).toEqual({ fileName: 'code.ts', extension: 'ts' });
    expect(codeFileFor('dockerfile')).toEqual({ fileName: 'Dockerfile', extension: '' });
    expect(codeFileFor('no-such-language')).toEqual({ fileName: 'code.txt', extension: 'txt' });
  });
});
