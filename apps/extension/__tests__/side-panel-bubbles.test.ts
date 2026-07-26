import { describe, it, expect, vi } from 'vitest';
import {
  buildBubbleWithTools,
  buildToolCallEl,
  resolveManagedArtifactUrl,
} from '../src/features/side-panel/bubbles';
import {
  applyCanonicalAgentEvent,
  type SidePanelChatMessage,
} from '../src/features/side-panel/chat-state';

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

  it('renders a generated artifact as an authenticated AGI open/download action', () => {
    const messages: SidePanelChatMessage[] = [];
    const assistant = applyCanonicalAgentEvent(messages, 'stream-1', {
      schemaVersion: 3,
      sessionId: 'session-1',
      turnId: 'turn-1',
      sequence: 1,
      emittedAtMs: 1_000,
      event: {
        type: 'artifact-produced',
        artifactId: 'artifact-1',
        name: 'report.pdf',
        mimeType: 'application/pdf',
        uri: '/api/files/asset-1',
      },
    });

    const node = buildBubbleWithTools(assistant);
    const link = node.querySelector<HTMLAnchorElement>('.sp-agent-artifact-link');
    expect(link?.textContent).toContain('Open or download');
    expect(link?.href).toBe('https://agiworkforce.com/api/files/asset-1');
  });

  it('renders an honest unavailable state for a non-web artifact URI', () => {
    const messages: SidePanelChatMessage[] = [];
    const assistant = applyCanonicalAgentEvent(messages, 'stream-2', {
      schemaVersion: 3,
      sessionId: 'session-1',
      turnId: 'turn-2',
      sequence: 1,
      emittedAtMs: 1_000,
      event: {
        type: 'artifact-produced',
        artifactId: 'artifact-2',
        name: 'draft.txt',
        mimeType: 'text/plain',
        uri: 'managed://files/draft.txt',
      },
    });

    const node = buildBubbleWithTools(assistant);
    expect(node.querySelector('.sp-agent-artifact-link')).toBeNull();
    expect(node.textContent).toContain('Download unavailable in Chrome');
  });

  it('renders actionable approve and decline controls for a managed tool boundary', () => {
    const messages: SidePanelChatMessage[] = [];
    const assistant = applyCanonicalAgentEvent(messages, 'stream-3', {
      schemaVersion: 3,
      sessionId: 'session-1',
      turnId: 'turn-3',
      sequence: 1,
      emittedAtMs: 1_000,
      event: {
        type: 'approval-requested',
        approvalId: 'approval-1',
        toolCallId: 'call-1',
        name: 'create_calendar_event',
        category: 'connector',
        summary: 'Create a calendar event',
        input: { title: 'Demo' },
        riskLevel: 'medium',
      },
    });
    const resolve = vi.fn();

    const node = buildBubbleWithTools(assistant, { onResolveApproval: resolve });
    node.querySelector<HTMLButtonElement>('[aria-label="Approve create_calendar_event"]')?.click();
    node.querySelector<HTMLButtonElement>('[aria-label="Decline create_calendar_event"]')?.click();

    expect(resolve).toHaveBeenNthCalledWith(1, 'call-1', 'approved');
    expect(resolve).toHaveBeenNthCalledWith(2, 'call-1', 'rejected');
  });
});

describe('resolveManagedArtifactUrl', () => {
  it('allows HTTPS payload URLs and rejects non-web schemes', () => {
    expect(resolveManagedArtifactUrl('https://downloads.example.com/report.pdf')).toBe(
      'https://downloads.example.com/report.pdf',
    );
    expect(resolveManagedArtifactUrl('javascript:alert(1)')).toBeNull();
    expect(resolveManagedArtifactUrl('http://downloads.example.com/report.pdf')).toBeNull();
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
