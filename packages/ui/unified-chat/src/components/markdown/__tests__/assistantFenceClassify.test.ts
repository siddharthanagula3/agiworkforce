import { describe, expect, it } from 'vitest';
import { classifyAssistantFence } from '../assistantFence';

describe('classifyAssistantFence email', () => {
  const complete = [
    'To: jane@example.com',
    'Cc: sam@example.com',
    'Subject: Review',
    '',
    'Hi Jane,',
  ].join('\n');

  it('reports which header rows the fence declared', () => {
    const fence = classifyAssistantFence('email', complete);
    expect(fence.kind).toBe('email');
    if (fence.kind !== 'email') return;
    expect(fence.headerFields).toEqual(['to', 'cc', 'subject']);
    expect(fence.cc).toBe('sam@example.com');
    expect(fence.bcc).toBe('');
  });

  it('does not show a header name that is still arriving as the first word of the body', () => {
    const partial = 'To: jane@example.com\nSub';
    const settled = classifyAssistantFence('email', partial);
    expect(settled.kind === 'email' && settled.body).toBe('Sub');
    const streaming = classifyAssistantFence('email', partial, { streaming: true });
    expect(streaming.kind).toBe('email');
    if (streaming.kind !== 'email') return;
    expect(streaming.to).toBe('jane@example.com');
    expect(streaming.body).toBe('');
    expect(streaming.headerFields).toEqual(['to']);
  });

  it('keeps a streaming draft an email before the body starts', () => {
    const headersOnly = 'To: jane@example.com\nSubject: Review';
    expect(classifyAssistantFence('email', headersOnly).kind).toBe('fallback');
    expect(classifyAssistantFence('email', headersOnly, { streaming: true }).kind).toBe('email');
  });

  it('treats a finished fence the same with or without the option', () => {
    expect(classifyAssistantFence('email', complete, { streaming: false })).toEqual(
      classifyAssistantFence('email', complete),
    );
  });
});

describe('classifyAssistantFence gallery', () => {
  it('keeps the detail line a gallery item declared', () => {
    const fence = classifyAssistantFence(
      'gallery',
      'Kitchen | https://example.com/kitchen.png | Before the remodel\nHall | https://example.com/hall.png',
    );
    expect(fence.kind).toBe('gallery');
    if (fence.kind !== 'gallery') return;
    expect(fence.items).toEqual([
      {
        caption: 'Kitchen',
        src: 'https://example.com/kitchen.png',
        color: '',
        detail: 'Before the remodel',
      },
      { caption: 'Hall', src: 'https://example.com/hall.png', color: '' },
    ]);
  });
});
