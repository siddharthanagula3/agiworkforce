import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { EnhancedMessage } from '../../../stores/chat/types';

vi.mock('../MessageRuntimeActivity', () => ({
  MessageRuntimeInlineActivity: ({ messageId }: { messageId: string }) => (
    <div data-testid="message-runtime-activity">
      <div data-testid="status-trail">{messageId}</div>
      <div data-testid="action-log-timeline">{messageId}</div>
      <div data-testid="message-approvals">{messageId}</div>
    </div>
  ),
}));

vi.mock('../ReasoningAccordion', () => ({
  ReasoningAccordion: ({ content }: { content: string }) => (
    <div data-testid="reasoning-accordion">{content}</div>
  ),
}));

vi.mock('../MessageBubble/InlinePanelList', () => ({
  InlinePanelList: ({ messageId }: { messageId: string }) => (
    <div data-testid="inline-panels">{messageId}</div>
  ),
}));

vi.mock('../MessageBubble/WidgetList', () => ({
  WidgetList: ({
    messageId,
    widgets,
  }: {
    messageId: string;
    widgets: Array<{ id: string }>;
  }) => <div data-testid="widget-list">{`${messageId}:${widgets.length}`}</div>,
}));

vi.mock('../MessageBubble/MessageAttachments', () => ({
  MessageAttachments: () => <div data-testid="message-attachments" />,
}));

vi.mock('../SourcesFooter', () => ({
  SourcesFooter: ({ content }: { content: string }) => <div data-testid="sources-footer">{content}</div>,
}));

vi.mock('../Visualizations/CodeBlock', () => ({
  CodeBlock: ({ code }: { code: string }) => <pre>{code}</pre>,
}));

import { ThinkingMessageBlock } from '../MessageBubble/ThinkingMessageBlock';

const message: EnhancedMessage = {
  id: 'assistant-1',
  role: 'assistant',
  content: '<thinking>Plan the tool calls</thinking>\nFinal answer',
  timestamp: new Date('2026-03-11T12:00:00.000Z'),
  metadata: {
    widgets: [{ id: 'widget-1', type: 'table' }],
  },
  inlinePanels: [
    {
      id: 'panel-1',
      type: 'code',
      content: { code: { filePath: 'src/app.ts', content: 'const x = 1;' } },
      isCollapsed: false,
      timestamp: new Date('2026-03-11T12:00:01.000Z'),
    },
  ],
};

describe('ThinkingMessageBlock', () => {
  it('renders the same inline runtime surfaces as the standard assistant path', () => {
    render(
      <ThinkingMessageBlock
        message={message}
        thinkingMatch={{
          content: 'Plan the tool calls',
          pattern: 'thinking',
          fullMatch: '<thinking>Plan the tool calls</thinking>',
        }}
        showAvatar={false}
        showActions={false}
        enableActions={false}
        copied={false}
        onCopy={() => {}}
        onBookmark={() => {}}
        onImageClick={() => {}}
        onMouseEnter={() => {}}
        onMouseLeave={() => {}}
      />,
    );

    expect(screen.getByTestId('status-trail')).toHaveTextContent('assistant-1');
    expect(screen.getByTestId('action-log-timeline')).toHaveTextContent('assistant-1');
    expect(screen.getByTestId('message-approvals')).toHaveTextContent('assistant-1');
    expect(screen.getByTestId('inline-panels')).toHaveTextContent('assistant-1');
    expect(screen.getByTestId('widget-list')).toHaveTextContent('assistant-1:1');
    expect(screen.getByTestId('reasoning-accordion')).toHaveTextContent('Plan the tool calls');
    // "Final answer" appears in both the markdown body and the sources footer test double.
    expect(screen.getAllByText('Final answer')).toHaveLength(2);
  });
});
