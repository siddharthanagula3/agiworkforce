import { describe, it, expect } from 'vitest';
import { buildBubbleWithTools, buildToolCallEl } from '../src/features/side-panel/bubbles';
import type { SidePanelChatMessage } from '../src/features/side-panel/chat-state';

function msg(overrides: Partial<SidePanelChatMessage> = {}): SidePanelChatMessage {
  return { id: 'm1', role: 'user', content: 'hello world', timestamp: 0, ...overrides };
}

describe('side-panel buildBubbleWithTools (real render)', () => {
  it('renders a user message into a right-tagged bubble with its text', () => {
    const node = buildBubbleWithTools(msg({ role: 'user', content: 'hello world' }));
    expect(node.className).toContain('sp-msg-user');
    expect(node.getAttribute('data-id')).toBe('m1');
    expect(node.textContent).toContain('hello world');
  });

  it('renders an assistant message as an assistant bubble', () => {
    const node = buildBubbleWithTools(msg({ role: 'assistant', content: 'the answer is 42' }));
    expect(node.className).toContain('sp-msg-assistant');
    expect(node.textContent).toContain('the answer is 42');
  });

  it('renders an embedded tool call (parses the [TOOL:...] fence into a tool element)', () => {
    const content = 'before\n[TOOL:bash:success] ran ls\ntotal 0\n[/TOOL]\nafter';
    const node = buildBubbleWithTools(msg({ role: 'assistant', content }));
    // The tool fence must surface the tool name/summary as visible UI, not raw text.
    expect(node.textContent).toContain('bash');
    expect(node.textContent).not.toContain('[TOOL:bash:success]');
  });
});

describe('side-panel buildToolCallEl (real render)', () => {
  it('renders a tool-call element carrying the name, summary, and state', () => {
    const node = buildToolCallEl({
      name: 'search',
      summary: 'find files',
      body: 'match.ts',
      state: 'success',
    });
    expect(node.textContent).toContain('search');
    expect(node.textContent).toContain('find files');
  });
});
