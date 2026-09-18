import { describe, expect, it } from 'vitest';
import {
  NEW_CHAT_PATH,
  buildNewChatHref,
  parseNewChatEntry,
  parseNewChatSource,
  quoteForNewChatDraft,
  stripNewChatParams,
} from './new-chat-entry';

const MESSAGE_ID = 'e6b2f0c4-9d1a-4f77-9a0b-5c2d8e3f1a44';

describe('new chat deep link', () => {
  it('builds a bare new-chat path when nothing is carried', () => {
    expect(buildNewChatHref()).toBe(NEW_CHAT_PATH);
  });

  it('round trips a source and a draft', () => {
    const href = buildNewChatHref({
      source: { kind: 'message', id: MESSAGE_ID },
      draft: '> the quarterly number',
    });

    const entry = parseNewChatEntry(new URLSearchParams(href.split('?')[1]));

    expect(entry).toEqual({
      draft: '> the quarterly number',
      workMode: 'chat',
      source: { kind: 'message', id: MESSAGE_ID },
    });
  });

  it('carries the work mode only when it is not the default', () => {
    expect(buildNewChatHref({ draft: 'hi', workMode: 'chat' })).not.toContain('mode=');
    expect(buildNewChatHref({ draft: 'hi', workMode: 'agiwork' })).toContain('mode=agiwork');
  });

  it('reads agiwork back out of the link', () => {
    const entry = parseNewChatEntry(new URLSearchParams('q=plan%20it&mode=agiwork'));
    expect(entry?.workMode).toBe('agiwork');
  });

  it('returns nothing when the url carries neither a draft nor a source', () => {
    expect(parseNewChatEntry(new URLSearchParams('highlightMessage=abc'))).toBeNull();
    expect(parseNewChatEntry(null)).toBeNull();
  });

  it('refuses a source whose kind is not one this app resolves', () => {
    expect(parseNewChatSource('inbox:42')).toBeNull();
    expect(parseNewChatSource('message:')).toBeNull();
    expect(parseNewChatSource(':42')).toBeNull();
    expect(parseNewChatSource('message')).toBeNull();
  });

  it('keeps an id that itself contains a separator', () => {
    expect(parseNewChatSource('document:project/notes:v2')).toEqual({
      kind: 'document',
      id: 'project/notes:v2',
    });
  });

  it('caps a draft so the link survives a proxy', () => {
    const href = buildNewChatHref({ draft: 'x'.repeat(5000) });
    const entry = parseNewChatEntry(new URLSearchParams(href.split('?')[1]));
    expect(entry?.draft.length).toBe(2000);
  });

  it('strips only its own parameters when the entry has been applied', () => {
    expect(
      stripNewChatParams(new URLSearchParams('q=hi&from=message:1&mode=agiwork&tab=files')),
    ).toBe(`${NEW_CHAT_PATH}?tab=files`);
    expect(stripNewChatParams(new URLSearchParams('q=hi'))).toBe(NEW_CHAT_PATH);
  });
});

describe('quoteForNewChatDraft', () => {
  it('quotes the snippet and leaves the user a blank line to write in', () => {
    expect(quoteForNewChatDraft('  the   quarterly  number ')).toBe('> the quarterly number\n\n');
  });

  it('carries nothing when the source had no snippet', () => {
    expect(quoteForNewChatDraft('   ')).toBe('');
  });

  it('never emits a second blockquote line, which would break the quote', () => {
    expect(quoteForNewChatDraft('first line\nsecond line')).toBe('> first line second line\n\n');
  });
});
