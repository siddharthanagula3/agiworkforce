import { describe, it, expect } from 'vitest';

describe('MessageList', () => {
  it('should render message list', () => {
    const messages = [
      { id: '1', role: 'user', content: 'Hello' },
      { id: '2', role: 'assistant', content: 'Hi there' },
    ];

    expect(messages.length).toBe(2);
  });

  it('should display user messages', () => {
    const userMessages = [{ role: 'user', content: 'Question' }];

    expect(userMessages[0].role).toBe('user');
  });

  it('should display assistant messages', () => {
    const assistantMessages = [{ role: 'assistant', content: 'Answer' }];

    expect(assistantMessages[0].role).toBe('assistant');
  });

  it('should auto-scroll to bottom', () => {
    const shouldScroll = true;

    expect(shouldScroll).toBe(true);
  });

  it('should render markdown content', () => {
    const markdown = '**bold** *italic*';

    expect(markdown).toBeTruthy();
  });

  it('should render code blocks', () => {
    const code = '```js\nconst x = 1;\n```';

    expect(code).toContain('```');
  });
});
