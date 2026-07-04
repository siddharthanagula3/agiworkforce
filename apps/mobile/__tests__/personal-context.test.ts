/**
 * Unit tests for buildPersonalContextBlocks — the per-turn system-block composer.
 */
import {
  buildPersonalContextBlocks,
  renderMemoryBlock,
} from '../src/features/memory/services/personalContext';
import type { Personalization } from '../stores/settingsStore';
import type { MemoryFact } from '../storage/types';

const NEUTRAL: Personalization = {
  fullName: '',
  nickname: '',
  occupation: '',
  instructions: '',
  style: 'default',
  warmth: 50,
  enthusiasm: 50,
  headersLists: 50,
  emoji: 50,
};

function fact(id: string, text: string): MemoryFact {
  return { id, fact: text, source_conversation_id: null, pinned: false, created_at: 0 };
}

describe('renderMemoryBlock', () => {
  it('returns empty for no memories', () => {
    expect(renderMemoryBlock([])).toBe('');
  });

  it('numbers facts', () => {
    const out = renderMemoryBlock([fact('1', 'likes Rust'), fact('2', 'lives in Pune')]);
    expect(out).toContain('1. likes Rust');
    expect(out).toContain('2. lives in Pune');
  });
});

describe('buildPersonalContextBlocks', () => {
  it('returns no blocks for default profile and no memories', () => {
    expect(buildPersonalContextBlocks({ personalization: NEUTRAL, memories: [] })).toEqual([]);
  });

  it('returns only a persona block when personalization is set but no memories', () => {
    const blocks = buildPersonalContextBlocks({
      personalization: { ...NEUTRAL, nickname: 'JD' },
      memories: [],
    });
    expect(blocks).toHaveLength(1);
    expect(blocks[0].role).toBe('system');
    expect(blocks[0].content).toContain('JD');
  });

  it('returns only a memory block when memories exist but profile is default', () => {
    const blocks = buildPersonalContextBlocks({
      personalization: NEUTRAL,
      memories: [fact('1', 'likes Rust')],
    });
    expect(blocks).toHaveLength(1);
    expect(blocks[0].content).toContain('likes Rust');
  });

  it('orders persona before memory when both present', () => {
    const blocks = buildPersonalContextBlocks({
      personalization: { ...NEUTRAL, nickname: 'JD' },
      memories: [fact('1', 'likes Rust')],
    });
    expect(blocks).toHaveLength(2);
    expect(blocks[0].content).toContain('personalization');
    expect(blocks[1].content).toContain('User memory');
  });
});
