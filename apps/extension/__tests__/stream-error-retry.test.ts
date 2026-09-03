import { describe, expect, it, vi } from 'vitest';
import { buildBubbleWithTools } from '../src/features/side-panel/bubbles';
import {
  applyStreamFailure,
  type SidePanelChatMessage,
} from '../src/features/side-panel/chat-state';

function failedMessage(overrides: Partial<SidePanelChatMessage> = {}): SidePanelChatMessage {
  return {
    id: 'stream-1',
    role: 'assistant',
    content: '',
    error: true,
    errorText: 'upstream connection reset',
    timestamp: 0,
    ...overrides,
  };
}

describe('failed stream presentation', () => {
  it('keeps the provider error out of the message body', () => {
    const messages: SidePanelChatMessage[] = [
      { id: 'u1', role: 'user', content: 'hello', timestamp: 0 },
      {
        id: 'stream-1',
        role: 'assistant',
        content: 'partial answer',
        streaming: true,
        timestamp: 1,
      },
    ];

    applyStreamFailure(messages, 'stream-1', 'upstream connection reset', 2);

    const assistant = messages.at(-1)!;
    expect(assistant.content).toBe('partial answer');
    expect(assistant.content).not.toContain('Error:');
    expect(assistant.errorText).toBe('upstream connection reset');
  });

  it('renders the failure with a retry control', () => {
    const onRetry = vi.fn();
    const node = buildBubbleWithTools(failedMessage(), { onRetry });

    const footer = node.querySelector('.sp-bubble-error-footer');
    expect(footer).not.toBeNull();
    expect(footer?.getAttribute('role')).toBe('alert');
    expect(footer?.querySelector('.sp-bubble-error-text')?.textContent).toBe(
      'upstream connection reset',
    );

    const retry = footer?.querySelector('.sp-bubble-retry-btn') as HTMLButtonElement | null;
    expect(retry).not.toBeNull();
    retry!.click();
    expect(onRetry).toHaveBeenCalledWith('stream-1');
    expect(retry!.disabled).toBe(true);
  });

  it('offers retry on a failure that also produced tool activity', () => {
    const onRetry = vi.fn();
    const node = buildBubbleWithTools(
      failedMessage({ content: '[TOOL:search:success]done[/TOOL]' }),
      { onRetry },
    );

    expect(node.querySelector('.sp-bubble-error-footer')).not.toBeNull();
    expect(node.querySelector('.sp-bubble-retry-btn')).not.toBeNull();
  });

  it('renders no failure footer for a successful message', () => {
    const node = buildBubbleWithTools(
      { id: 'ok', role: 'assistant', content: 'all good', timestamp: 0 },
      { onRetry: vi.fn() },
    );
    expect(node.querySelector('.sp-bubble-error-footer')).toBeNull();
  });

  it('omits the retry control when no handler is supplied', () => {
    const node = buildBubbleWithTools(failedMessage(), {});
    expect(node.querySelector('.sp-bubble-error-text')?.textContent).toBe(
      'upstream connection reset',
    );
    expect(node.querySelector('.sp-bubble-retry-btn')).toBeNull();
  });
});
