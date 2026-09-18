import { describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import type { ChatMessage } from '@agiworkforce/unified-chat';
import { ChatMessageList } from '../messages/ChatMessageList';

const LONG_URL = `https://example.com/${'a'.repeat(380)}`;
const LONG_TOKEN = 'x'.repeat(300);
const LONG_PROSE = 'The transcript column has to hold a long answer. '.repeat(210);
const MARKDOWN_TABLE = [
  '| column one | column two | column three |',
  '| --- | --- | --- |',
  `| ${LONG_TOKEN} | ${LONG_URL} | third |`,
].join('\n');
const TOOL_REQUEST = {
  query: LONG_TOKEN,
  url: LONG_URL,
  payload: Object.fromEntries(
    Array.from({ length: 40 }, (_, index) => [`field_${index}`, `${LONG_TOKEN}-${index}`]),
  ),
};

const OVERFLOW_CLASS = /(^|:)overflow(-x)?-(auto|hidden|scroll)$/;

function boundsHorizontally(element: Element): boolean {
  const style = element.getAttribute('style') ?? '';
  if (/overflow(-x)?:\s*(auto|hidden|scroll)/.test(style)) return true;
  return Array.from(element.classList).some((className) => OVERFLOW_CLASS.test(className));
}

function hasBoundedAncestor(element: Element, root: Element): boolean {
  let node: Element | null = element;
  while (node && node !== root) {
    if (boundsHorizontally(node)) return true;
    node = node.parentElement;
  }
  return boundsHorizontally(root);
}

function transcript(): ChatMessage[] {
  return [
    {
      id: 'user-1',
      role: 'user',
      content: `Read ${LONG_URL} and explain ${LONG_TOKEN}`,
      createdAt: new Date(Date.now() - 120_000).toISOString(),
    },
    {
      id: 'assistant-1',
      role: 'assistant',
      content: `${LONG_PROSE}\n\n${MARKDOWN_TABLE}\n\n\`\`\`json\n${JSON.stringify(TOOL_REQUEST, null, 2)}\n\`\`\``,
      createdAt: new Date(Date.now() - 60_000).toISOString(),
      metadata: {
        tools: [
          {
            id: 'tool-1',
            name: 'mcp__github__create_issue',
            status: 'awaiting_approval',
            requiresApproval: true,
            toolCallId: 'call_1',
            parameters: TOOL_REQUEST,
          },
        ],
      },
    },
  ] as unknown as ChatMessage[];
}

function renderTranscript() {
  return render(
    <ChatMessageList
      messages={transcript()}
      onRegenerate={vi.fn()}
      onContinue={vi.fn()}
      conversationId="conversation-overflow"
    />,
  );
}

/**
 * jsdom has no layout, so this pins the structure that produces the layout:
 * the scroll container's axes, a min-width floor on every flex descendant that
 * holds text, and a bounded ancestor over each element that can be wider than
 * the column.
 */
describe('the transcript column contains its own content', () => {
  it('bounds the virtualized scroll container on the horizontal axis', () => {
    const { container } = renderTranscript();

    const scroller = container.querySelector('[style*="overflow-x: hidden"]');
    expect(scroller).not.toBeNull();
    expect(scroller!.getAttribute('style')).toMatch(/overflow-y:\s*auto/);
  });

  it('gives every transcript row a min-width floor', () => {
    const { container } = renderTranscript();

    const scroller = container.querySelector('[style*="overflow-x: hidden"]')!;
    const rows = Array.from(scroller.children).filter(
      (child) => child.hasAttribute('aria-posinset') && child.childElementCount > 0,
    );
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.classList.contains('min-w-0')).toBe(true);
    }
  });

  it('wraps prose that has no break opportunity', () => {
    const { container } = renderTranscript();

    const prose = Array.from(container.querySelectorAll('.message-text'));
    expect(prose.length).toBeGreaterThan(0);
    for (const element of prose) {
      expect(element.classList.contains('break-words')).toBe(true);
    }

    const userProse = prose.find((element) => element.classList.contains('user-bubble'));
    expect(userProse).toBeDefined();
    expect(userProse!.classList.contains('wrap-anywhere')).toBe(true);
  });

  it('keeps the message body a shrinkable flex item', () => {
    const { container } = renderTranscript();

    const bodies = Array.from(container.querySelectorAll('.message-body'));
    expect(bodies.length).toBeGreaterThan(0);
  });

  it('puts a bounded ancestor over every block that can outgrow the column', () => {
    const { container } = renderTranscript();

    const candidates = Array.from(container.querySelectorAll('pre, table'));
    expect(candidates.length).toBeGreaterThan(0);
    for (const candidate of candidates) {
      expect(hasBoundedAncestor(candidate, container)).toBe(true);
    }
  });
});
