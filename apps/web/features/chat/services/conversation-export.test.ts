import { describe, expect, it } from 'vitest';

import { ChatExportService, EXPIRING_LINK_PLACEHOLDER } from './conversation-export';
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

const SIGNED_ATTACHMENT_URL =
  'https://bucket.objects.example.test/private-media/clip.mp4?X-Amz-Algorithm=AWS4-HMAC-SHA256' +
  '&X-Amz-Date=20260901T000000Z&X-Amz-Expires=300&X-Amz-Signature=deadbeef';

function messageWithSignedAttachment(): ChatMessage[] {
  return [
    {
      id: 'message-1',
      role: 'user',
      content: 'here it is',
      createdAt: new Date('2026-01-01T12:00:00.000Z'),
      metadata: {
        attachments: [
          { id: 'a-1', type: 'video', name: 'clip.mp4', size: 2048, url: SIGNED_ATTACHMENT_URL },
          {
            id: 'a-2',
            type: 'document',
            name: 'note.pdf',
            size: 12,
            url: '/api/files/3f1d6c52-9a4e-4f2b-9c1a-2d5e7b8a0c11',
          },
        ],
        sourceUrl: SIGNED_ATTACHMENT_URL,
      },
    } as ChatMessage,
  ];
}

describe('a downloaded export outlives the session that made it', () => {
  const service = new ChatExportService();

  it('strips every link that expires on its own instead of shipping a live one', () => {
    const exported = new ChatExportService().exportAsJSON(
      session('t'),
      messageWithSignedAttachment(),
    );

    expect(exported).not.toContain('X-Amz-Signature');
    expect(exported).not.toContain('X-Amz-Expires');
    expect(exported).toContain(EXPIRING_LINK_PLACEHOLDER);
  });

  it('keeps the authenticated link, which is authorised per request', () => {
    const exported = service.exportAsJSON(session('t'), messageWithSignedAttachment());
    const parsed = JSON.parse(exported) as {
      messages: Array<{ attachments: Array<{ name: string; url: string }> }>;
    };

    expect(parsed.messages[0]?.attachments[1]?.url).toBe(
      '/api/files/3f1d6c52-9a4e-4f2b-9c1a-2d5e7b8a0c11',
    );
    expect(parsed.messages[0]?.attachments[0]?.url).toBe(EXPIRING_LINK_PLACEHOLDER);
    expect(parsed.messages[0]?.attachments[0]?.name).toBe('clip.mp4');
  });

  it('never puts an attachment link into the readable formats at all', () => {
    const msgs = messageWithSignedAttachment();

    for (const content of [
      service.exportAsMarkdown(session('t'), msgs),
      service.exportAsHTML(session('t'), msgs),
      service.exportAsText(session('t'), msgs),
    ]) {
      expect(content).not.toContain('X-Amz-Signature');
      expect(content).toContain('clip.mp4');
    }
  });

  it('revokes the object url it handed the browser, so the blob does not outlive the click', () => {
    const created: string[] = [];
    const revoked: string[] = [];
    const objectUrl = 'blob:https://agiworkforce.com/export';
    const originalCreate = URL.createObjectURL;
    const originalRevoke = URL.revokeObjectURL;
    const originalClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = () => undefined;
    URL.createObjectURL = () => {
      created.push(objectUrl);
      return objectUrl;
    };
    URL.revokeObjectURL = (value: string) => {
      revoked.push(value);
    };

    try {
      service.downloadFile('body', 'chat.json', 'application/json');
    } finally {
      URL.createObjectURL = originalCreate;
      URL.revokeObjectURL = originalRevoke;
      HTMLAnchorElement.prototype.click = originalClick;
    }

    expect(created).toEqual([objectUrl]);
    expect(revoked).toEqual([objectUrl]);
  });
});
