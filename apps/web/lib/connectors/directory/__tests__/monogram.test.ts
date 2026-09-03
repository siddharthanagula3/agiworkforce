import { describe, expect, it } from 'vitest';

import { deriveMonogram } from '@/lib/connectors/directory/monogram';

describe('deriveMonogram', () => {
  it('takes the first letter of a single-word name', () => {
    expect(deriveMonogram('Notion')).toBe('N');
  });

  it('takes the first letter of the first two words of a multi-word name', () => {
    expect(deriveMonogram('Some Tool')).toBe('ST');
  });

  it('ignores extra words past the first two', () => {
    expect(deriveMonogram('Some Other Tool Entirely')).toBe('SO');
  });

  it('falls back for an empty or whitespace-only name', () => {
    expect(deriveMonogram('')).toBe('?');
    expect(deriveMonogram('   ')).toBe('?');
  });

  it('uppercases the letters it takes', () => {
    expect(deriveMonogram('inference.sh')).toBe('I');
  });
});
