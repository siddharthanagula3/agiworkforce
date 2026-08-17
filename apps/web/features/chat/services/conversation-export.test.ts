import { describe, expect, it } from 'vitest';

import { ChatExportService } from './conversation-export';
import type { ChatMessage, ChatSession } from '../types';

const HOSTILE_TITLE = '</title><img src=x onerror=alert(1)>';

function session(title: string): ChatSession {
  return {
    id: 'session-1',
    title,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-02T00:00:00.000Z'),
    messageCount: 1,
    tags: [],
    participants: [],
  };
}

function messages(): ChatMessage[] {
  return [
    {
      id: 'message-1',
      role: 'user',
      content: 'hello',
      createdAt: new Date('2026-01-01T12:00:00.000Z'),
    },
    {
      id: 'message-2',
      role: 'assistant',
      content: 'hi',
      createdAt: new Date('2026-01-01T12:00:05.000Z'),
    },
  ];
}

describe('ChatExportService.exportAsHTML', () => {
  it('escapes a hostile session title in both the head and the body', () => {
    const html = new ChatExportService().exportAsHTML(session(HOSTILE_TITLE), messages());

    expect(html).not.toContain('<img src=x');
    expect(html).not.toContain('</title><');
    expect(html.match(/<title>/g)).toHaveLength(1);
    expect(html.match(/<h1>/g)).toHaveLength(1);
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
  });

  it('escapes hostile message content', () => {
    const hostile = messages();
    hostile[0]!.content = '<script>alert(1)</script>';

    const html = new ChatExportService().exportAsHTML(session('Safe title'), hostile);

    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
  });
});

describe('includeTimestamps reaches every format that offers it', () => {
  const service = new ChatExportService();
  const stamp = new Date('2026-01-01T12:00:00.000Z').toLocaleString();

  it('omits per-message timestamps from markdown when disabled', () => {
    const withStamps = service.exportAsMarkdown(session('t'), messages());
    const without = service.exportAsMarkdown(session('t'), messages(), {
      includeTimestamps: false,
    });

    expect(withStamps).toContain(stamp);
    expect(without).not.toContain(stamp);
    expect(without).toContain('hello');
  });

  it('omits per-message timestamps from html when disabled', () => {
    const withStamps = service.exportAsHTML(session('t'), messages());
    const without = service.exportAsHTML(session('t'), messages(), { includeTimestamps: false });

    expect(withStamps).toContain('class="timestamp"');
    expect(without).not.toContain('class="timestamp"');
    expect(without).toContain('hello');
  });

  it('omits per-message timestamps from text when disabled', () => {
    const withStamps = service.exportAsText(session('t'), messages());
    const without = service.exportAsText(session('t'), messages(), { includeTimestamps: false });

    expect(withStamps).toContain(stamp);
    expect(without).not.toContain(stamp);
    expect(without).toContain('[User]');
  });

  it('keeps timestamps when the option is omitted', () => {
    expect(service.exportAsMarkdown(session('t'), messages())).toContain(stamp);
  });
});
