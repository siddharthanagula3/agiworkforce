import { describe, expect, it, vi } from 'vitest';
import type { ChatCompletionRequest } from './request-processor';
import {
  collectManagedPromptMaterials,
  enrichManagedMemoryContext,
  isManagedMemoryToolAssistedTurn,
  prepareManagedAutoMemoryFacts,
} from './request-processor';

function makeRequest(): ChatCompletionRequest {
  return {
    model: 'auto',
    messages: [{ role: 'user', content: 'Plan my day.' }],
    stream: false,
  };
}

describe('enrichManagedMemoryContext', () => {
  it('loads account memories into the managed prompt before usage accounting', async () => {
    const query = vi
      .fn()
      .mockResolvedValue([
        { content: 'I prefer morning meetings.', category: 'preference', pinned: true },
      ]);
    const chatRequest = makeRequest();

    await enrichManagedMemoryContext({
      db: { query },
      userId: 'user-1',
      chatRequest,
      isTemporary: false,
    });

    expect(query).toHaveBeenCalledOnce();
    expect(chatRequest.messages[0]).toMatchObject({ role: 'system' });
    expect(chatRequest.messages[0]?.content).toContain('I prefer morning meetings.');
    expect(collectManagedPromptMaterials(chatRequest).join('\n')).toContain(
      'I prefer morning meetings.',
    );
  });

  it('does not load or inject account memory for Temporary Chats', async () => {
    const query = vi.fn();
    const chatRequest = makeRequest();

    await enrichManagedMemoryContext({
      db: { query },
      userId: 'user-1',
      chatRequest,
      isTemporary: true,
    });

    expect(query).not.toHaveBeenCalled();
    expect(chatRequest.messages).toEqual([{ role: 'user', content: 'Plan my day.' }]);
  });
});

describe('prepareManagedAutoMemoryFacts', () => {
  it('extracts conservative facts only for enabled non-API, non-temporary turns', () => {
    expect(
      prepareManagedAutoMemoryFacts({
        message: 'My name is Ada. I prefer morning meetings.',
        isTemporary: false,
        surface: 'web',
        policy: { enabled: true, allowToolAssistedGeneration: false },
      }),
    ).toEqual(["User's name is Ada", 'User prefers morning meetings']);

    expect(
      prepareManagedAutoMemoryFacts({
        message: 'My name is Ada.',
        isTemporary: true,
        surface: 'web',
        policy: { enabled: true, allowToolAssistedGeneration: false },
      }),
    ).toEqual([]);
    expect(
      prepareManagedAutoMemoryFacts({
        message: 'My name is Ada.',
        isTemporary: false,
        surface: 'mobile',
        policy: { enabled: false, allowToolAssistedGeneration: false },
      }),
    ).toEqual([]);
    expect(
      prepareManagedAutoMemoryFacts({
        message: 'My name is Ada.',
        isTemporary: false,
        surface: 'mobile',
        policy: { enabled: true, allowToolAssistedGeneration: false },
      }),
    ).toEqual(["User's name is Ada"]);
    expect(
      prepareManagedAutoMemoryFacts({
        message: 'My name is Ada.',
        isTemporary: false,
        surface: 'api',
        policy: { enabled: true, allowToolAssistedGeneration: true },
      }),
    ).toEqual([]);
  });

  it('classifies every tool/search execution surface conservatively', () => {
    expect(isManagedMemoryToolAssistedTurn({ ...makeRequest(), web_search: true }, undefined)).toBe(
      true,
    );
    expect(isManagedMemoryToolAssistedTurn(makeRequest(), [{ type: 'function' }])).toBe(true);
    expect(isManagedMemoryToolAssistedTurn(makeRequest(), undefined)).toBe(false);
  });
});
