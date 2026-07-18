import { describe, expect, it, vi } from 'vitest';
import type { ChatCompletionRequest } from './request-processor';
import { collectManagedPromptMaterials, enrichManagedMemoryContext } from './request-processor';

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
