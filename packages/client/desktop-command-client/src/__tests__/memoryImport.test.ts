import { describe, expect, it, vi } from 'vitest';

import {
  parseChatGPTExport,
  parseClaudeExport,
  dedupCandidates,
  acceptCandidates,
  type MemoryCandidate,
} from '../memoryImport';

// ── Sample fixtures ──────────────────────────────────────────────────────────

const CHATGPT_FIXTURE = [
  {
    id: 'conv-1',
    title: 'Coding session',
    create_time: 1_704_067_200,
    mapping: {
      'node-root': {
        id: 'node-root',
        message: null,
        children: ['node-1'],
      },
      'node-1': {
        id: 'node-1',
        message: {
          author: { role: 'user' },
          content: {
            content_type: 'text',
            parts: ['I prefer TypeScript strict mode for all my projects.'],
          },
          create_time: 1_704_067_300,
        },
      },
      'node-2': {
        id: 'node-2',
        message: {
          author: { role: 'assistant' },
          content: { content_type: 'text', parts: ['Sure, here is how to enable it...'] },
          create_time: 1_704_067_310,
        },
      },
      'node-3': {
        id: 'node-3',
        message: {
          author: { role: 'user' },
          content: {
            content_type: 'text',
            parts: ['I work at an AI startup building agent platforms.'],
          },
        },
      },
      'node-4': {
        id: 'node-4',
        message: {
          author: { role: 'user' },
          content: { content_type: 'text', parts: ['hi'] }, // too short — skipped
        },
      },
      'node-5': {
        id: 'node-5',
        message: {
          author: { role: 'user' },
          content: { content_type: 'text', parts: ['How do I set up Vite?'] }, // ends with ? — skipped
        },
      },
    },
  },
];

const CLAUDE_FIXTURE = [
  {
    uuid: 'conv-c1',
    name: 'Setup chat',
    created_at: '2026-04-01T12:00:00Z',
    chat_messages: [
      {
        sender: 'human',
        text: "I always use Tailwind for styling — please don't suggest plain CSS.",
        created_at: '2026-04-01T12:00:00Z',
      },
      {
        sender: 'assistant',
        text: 'Got it.',
      },
      {
        sender: 'human',
        content: [{ type: 'text', text: "Actually, that's wrong — pnpm not npm." }],
      },
    ],
  },
];

// ── Tests ────────────────────────────────────────────────────────────────────

describe('parseChatGPTExport', () => {
  it('returns [] for non-array input', () => {
    expect(parseChatGPTExport(null)).toEqual([]);
    expect(parseChatGPTExport('hello')).toEqual([]);
    expect(parseChatGPTExport({})).toEqual([]);
  });

  it('extracts user-stated preferences and facts, skipping junk', () => {
    const out = parseChatGPTExport(CHATGPT_FIXTURE);
    expect(out.length).toBe(2);
    expect(out[0]!.category).toBe('preference');
    expect(out[0]!.content).toContain('TypeScript strict mode');
    expect(out[0]!.source).toBe('chatgpt-export');
    expect(out[0]!.sourceConversation).toBe('Coding session');
    expect(out[0]!.sourceTimestamp).toMatch(/^2024-/);
    expect(out[1]!.category).toBe('fact');
    expect(out[1]!.content).toContain('AI startup');
  });
});

describe('parseClaudeExport', () => {
  it('returns [] for non-array input', () => {
    expect(parseClaudeExport(null)).toEqual([]);
  });

  it('extracts preferences, accepts both `text` and `content[]` shapes', () => {
    const out = parseClaudeExport(CLAUDE_FIXTURE);
    expect(out.length).toBe(2);
    expect(out[0]!.category).toBe('preference');
    expect(out[0]!.content).toContain('Tailwind');
    expect(out[1]!.category).toBe('correction');
    expect(out[1]!.content).toContain('pnpm not npm');
  });
});

describe('dedupCandidates', () => {
  it('drops duplicates by category + first-100-char prefix', () => {
    const a: MemoryCandidate = {
      id: 'a',
      content: 'I prefer TypeScript with strict mode.',
      category: 'preference',
      source: 'chatgpt-export',
      importance: 0.6,
    };
    const b: MemoryCandidate = {
      id: 'b',
      content: 'I prefer TypeScript with strict mode.',
      category: 'preference',
      source: 'claude-export',
      importance: 0.6,
    };
    const c: MemoryCandidate = {
      id: 'c',
      content: 'I prefer TypeScript with strict mode.',
      category: 'fact', // different category — kept
      source: 'chatgpt-export',
      importance: 0.5,
    };
    const out = dedupCandidates([a, b, c]);
    expect(out).toHaveLength(2);
    expect(out[0]!.id).toBe('a');
    expect(out[1]!.id).toBe('c');
  });
});

describe('acceptCandidates', () => {
  it('calls addMemory once per candidate and returns insert count', async () => {
    const candidates = parseChatGPTExport(CHATGPT_FIXTURE);
    const addMemory = vi.fn().mockResolvedValue(undefined);
    const inserted = await acceptCandidates(candidates, addMemory);
    expect(inserted).toBe(candidates.length);
    expect(addMemory).toHaveBeenCalledTimes(candidates.length);
    expect(addMemory.mock.calls[0]![0]).toMatchObject({
      category: 'preference',
      source: 'chatgpt-export',
    });
  });

  it('reports per-candidate failures via onError but keeps going', async () => {
    const candidates = parseChatGPTExport(CHATGPT_FIXTURE);
    const addMemory = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('db full'));
    const onError = vi.fn();
    const inserted = await acceptCandidates(candidates, addMemory, onError);
    expect(inserted).toBe(1);
    expect(onError).toHaveBeenCalledTimes(1);
  });
});
