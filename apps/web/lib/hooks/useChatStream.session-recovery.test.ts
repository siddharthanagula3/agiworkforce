import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const source = readFileSync(join(process.cwd(), 'lib/hooks/useChatStream.ts'), 'utf8');

// CAP-040. The composer clears on send, so a turn interrupted by an expired
// session left the user's text only as a failed turn in the transcript: sign
// back in and retype it. Parking it as the conversation draft is what makes
// the turn recoverable.
describe('a turn interrupted by an expired session is recoverable', () => {
  it('parks the typed content as the conversation draft on 401', () => {
    const guard = source.slice(source.indexOf('isSessionExpiredError(error)'));
    expect(guard).toContain('setDraftContent(content, conversationId)');
  });

  it('treats only 401 as recoverable, not 403 or 429', () => {
    const fn = source.slice(
      source.indexOf('function isSessionExpiredError'),
      source.indexOf('function readChatApiErrorPayload'),
    );
    expect(fn).toContain('error.status === 401');
    expect(fn).not.toContain('403');
    expect(fn).not.toContain('429');
  });

  it('does not overwrite something the user has typed since', () => {
    const guard = source.slice(source.indexOf('isSessionExpiredError(error)'));
    expect(guard).toMatch(/if \(!store\.draftsByConversation\?\.\[conversationId\]\)/);
  });

  it('does not park an empty draft', () => {
    expect(source).toContain('isSessionExpiredError(error) && content.trim()');
  });

});

// The fix reads store.draftsByConversation[conversationId] and calls
// setDraftContent(content, conversationId). If that contract shifts, the guard
// above still passes a source grep while silently parking nothing.
describe('the store contract the recovery depends on', () => {
  it('round-trips a draft under the conversation id and surfaces it as draftContent', async () => {
    const { useChatStore } = await import('@shared/stores/web-chat-store');

    useChatStore.getState().setDraftContent('half-written question', 'conv-1');

    expect(useChatStore.getState().draftsByConversation['conv-1']).toBe('half-written question');

    useChatStore.getState().clearDraftContent('conv-1');
    expect(useChatStore.getState().draftsByConversation['conv-1']).toBeFalsy();
  });
});
