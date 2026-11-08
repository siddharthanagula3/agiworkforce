import { describe, expect, it, vi } from 'vitest';
import { conversationAsMarkdown, copyConversationMarkdown } from './conversation-markdown';

describe('Copy as Markdown on the public window', () => {
  it('copies the chat as Markdown', async () => {
    const write = vi.fn(async () => undefined);
    const messages = [
      { role: 'user', content: 'Draft a plan' },
      { role: 'assistant', content: 'Here is the plan.' },
    ];

    await copyConversationMarkdown('Domain strategy', messages, write);

    expect(write).toHaveBeenCalledWith(conversationAsMarkdown('Domain strategy', messages));
    expect(write.mock.calls[0]?.[0]).toContain('# Domain strategy');
    expect(write.mock.calls[0]?.[0]).toContain('## You');
    expect(write.mock.calls[0]?.[0]).toContain('Draft a plan');
    expect(write.mock.calls[0]?.[0]).toContain('## Assistant');
    expect(write.mock.calls[0]?.[0]).toContain('Here is the plan.');
  });
});
