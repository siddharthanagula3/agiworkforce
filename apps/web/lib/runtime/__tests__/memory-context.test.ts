import { describe, it, expect } from 'vitest';
import type { MemoryFact } from '@agiworkforce/unified-chat';
import { buildMemorySystemContent, withMemorySystemMessage } from '../memory-context';

function fact(text: string): MemoryFact {
  return {
    id: `mem_${text.length}_${text.slice(0, 4)}`,
    text,
    createdAt: '2026-06-15T00:00:00.000Z',
    updatedAt: '2026-06-15T00:00:00.000Z',
  };
}

describe('buildMemorySystemContent', () => {
  it('returns null when there are no facts', () => {
    expect(buildMemorySystemContent([])).toBeNull();
  });

  it('returns null when every fact is blank', () => {
    expect(buildMemorySystemContent([fact('   '), fact('')])).toBeNull();
  });

  it('renders facts as a bulleted list with guidance preamble', () => {
    const content = buildMemorySystemContent([fact('Prefers Python'), fact('Lives in Bangalore')]);
    expect(content).toContain('saved the following facts');
    expect(content).toContain('- Prefers Python');
    expect(content).toContain('- Lives in Bangalore');
  });

  it('skips blank facts but keeps the real ones', () => {
    const content = buildMemorySystemContent([fact('Real fact'), fact('   ')]);
    expect(content).toContain('- Real fact');
    expect(content?.match(/- /g) ?? []).toHaveLength(1);
  });

  it('caps the number of facts to keep the prompt bounded', () => {
    const many = Array.from({ length: 200 }, (_, i) => fact(`fact number ${i}`));
    const content = buildMemorySystemContent(many)!;
    const bullets = content.split('\n').filter((l) => l.startsWith('- '));
    expect(bullets.length).toBeLessThanOrEqual(50);
  });

  it('respects the total character budget', () => {
    const big = Array.from({ length: 50 }, () => fact('x'.repeat(300)));
    const content = buildMemorySystemContent(big)!;
    // Guidance preamble is small; the bulk is the bullet list which is budgeted.
    expect(content.length).toBeLessThan(4000 + 500);
  });
});

describe('withMemorySystemMessage', () => {
  it('is a no-op when memory content is null', () => {
    const history = [{ role: 'user', content: 'hi' }];
    expect(withMemorySystemMessage(history, null)).toBe(history);
  });

  it('prepends a system message when none exists', () => {
    const history = [{ role: 'user', content: 'hi' }];
    const result = withMemorySystemMessage(history, 'remember this');
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ role: 'system', content: 'remember this' });
    expect(result[1]).toEqual({ role: 'user', content: 'hi' });
  });

  it('merges into an existing leading system message', () => {
    const history = [
      { role: 'system', content: 'You are helpful.' },
      { role: 'user', content: 'hi' },
    ];
    const result = withMemorySystemMessage(history, 'remember this');
    expect(result).toHaveLength(2);
    expect(result[0]?.role).toBe('system');
    expect(result[0]?.content).toBe('remember this\n\nYou are helpful.');
    expect(result[1]).toEqual({ role: 'user', content: 'hi' });
  });

  it('does not mutate the input history', () => {
    const history = [{ role: 'user', content: 'hi' }];
    withMemorySystemMessage(history, 'remember this');
    expect(history).toHaveLength(1);
  });
});
