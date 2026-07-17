/**
 * Tests for MessageBubble link sanitization.
 *
 * Regression: PKG-CHAT-LINK-HREF-XSS — markdown links with `javascript:`,
 * `data:`, or other dangerous schemes must NOT render as clickable anchors.
 */
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MessageBubble, safeHref } from '../MessageBubble';
import type { ChatMessage } from '../../lib/types';

function renderMessage(content: string): string {
  const message: ChatMessage = {
    id: 'm1',
    role: 'assistant',
    content,
    createdAt: '2026-05-06T12:00:00.000Z',
  };
  return renderToStaticMarkup(<MessageBubble message={message} isLast={false} />);
}

describe('safeHref', () => {
  it('allows http(s) URLs', () => {
    expect(safeHref('https://example.com')).toBe('https://example.com');
    expect(safeHref('http://example.com/path')).toBe('http://example.com/path');
  });

  it('allows mailto and tel', () => {
    expect(safeHref('mailto:a@b.com')).toBe('mailto:a@b.com');
    expect(safeHref('tel:+15555550100')).toBe('tel:+15555550100');
  });

  it('allows relative paths starting with / or #', () => {
    expect(safeHref('/about')).toBe('/about');
    expect(safeHref('#section')).toBe('#section');
  });

  it('rejects javascript: URLs', () => {
    expect(safeHref('javascript:alert(1)')).toBeNull();
    expect(safeHref('  JavaScript:alert(1)')).toBeNull();
    expect(safeHref('\tjavascript:exec()')).toBeNull();
  });

  it('rejects data: URLs', () => {
    expect(safeHref('data:text/html,<script>alert(1)</script>')).toBeNull();
  });

  it('rejects vbscript: and other unknown schemes', () => {
    expect(safeHref('vbscript:msgbox(1)')).toBeNull();
    expect(safeHref('file:///etc/passwd')).toBeNull();
  });
});

describe('MessageBubble link rendering', () => {
  it('renders [a](javascript:alert(1)) as plain text, not an anchor', () => {
    const html = renderMessage('[a](javascript:alert(1))');
    expect(html).not.toMatch(/href=["']?javascript:/i);
    expect(html).not.toMatch(/<a\b[^>]*javascript:/i);
    expect(html).toContain('a');
  });

  it('renders [a](https://example.com) as a clickable anchor', () => {
    const html = renderMessage('[a](https://example.com)');
    expect(html).toMatch(/<a\s[^>]*href="https:\/\/example\.com"/);
    expect(html).toMatch(/rel="noopener noreferrer"/);
    expect(html).toMatch(/target="_blank"/);
  });

  it('renders [a](data:text/html,<script>) as plain text, not an anchor', () => {
    const html = renderMessage('[a](data:text/html,<script>)');
    expect(html).not.toMatch(/href=["']?data:/i);
    expect(html).not.toMatch(/<a\b[^>]*data:/i);
    expect(html).toContain('a');
  });
});

describe('MessageBubble heading rendering', () => {
  it('renders every ATX heading level as its semantic heading element', () => {
    const html = renderMessage(
      '# Heading 1\n## Heading 2\n### Heading 3\n#### Heading 4\n##### Heading 5\n###### Heading 6',
    );

    for (let level = 1; level <= 6; level += 1) {
      expect(html).toContain(`<h${level}`);
      expect(html).toContain(`Heading ${level}</h${level}>`);
    }
  });

  it('preserves inline markdown inside a semantic heading', () => {
    const html = renderMessage('## **Production** architecture');
    expect(html).toMatch(/<h2[^>]*><strong>Production<\/strong> architecture<\/h2>/);
  });
});

describe('MessageBubble canonical agent activity', () => {
  it('renders the shared inline collapsed timeline and suppresses duplicate legacy tool rows', () => {
    const html = renderToStaticMarkup(
      <MessageBubble
        message={{
          id: 'assistant-activity',
          role: 'assistant',
          content: 'Finished.',
          toolCalls: [
            { id: 'legacy-tool', name: 'Legacy duplicate', args: {}, status: 'completed' },
          ],
          metadata: {
            agentActivity: {
              schemaVersion: 1,
              sessionId: 'session-1',
              turnId: 'turn-1',
              status: 'completed',
              startedAtMs: 1_000,
              updatedAtMs: 2_000,
              completedAtMs: 2_000,
              lastSequence: 2,
              usage: {},
              entries: [
                {
                  id: 'tool:canonical-tool',
                  kind: 'tool',
                  toolCallId: 'canonical-tool',
                  name: 'web_search',
                  category: 'web-search',
                  summary: 'Searched official sources',
                  status: 'completed',
                  startedAtMs: 1_100,
                  completedAtMs: 1_900,
                },
              ],
            },
          },
        }}
      />,
    );

    expect(html).toContain('Agent activity');
    expect(html).toContain('Done in 1s');
    expect(html).not.toContain('Legacy duplicate');
  });
});
