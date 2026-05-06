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
