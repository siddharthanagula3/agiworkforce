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
    expect(guard).toContain('parkUnsentDraft(conversationId, content)');
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
});

describe('handing unsent text back to the user', () => {
  it('parks what was typed under the conversation it was written for', async () => {
    const { useChatStore, parkUnsentDraft } = await import('@shared/stores/web-chat-store');
    useChatStore.setState({ draftsByConversation: {}, draftContent: '' });

    parkUnsentDraft('conv-1', 'half-written question');

    expect(useChatStore.getState().getDraftContent('conv-1')).toBe('half-written question');
  });

  it('does not overwrite something the user has typed since', async () => {
    const { useChatStore, parkUnsentDraft } = await import('@shared/stores/web-chat-store');
    useChatStore.setState({ draftsByConversation: {}, draftContent: '' });
    useChatStore.getState().setDraftContent('newer thought', 'conv-1');

    parkUnsentDraft('conv-1', 'half-written question');

    expect(useChatStore.getState().getDraftContent('conv-1')).toBe('newer thought');
  });

  it('does not park an empty draft', async () => {
    const { useChatStore, parkUnsentDraft } = await import('@shared/stores/web-chat-store');
    useChatStore.setState({ draftsByConversation: {}, draftContent: '' });

    parkUnsentDraft('conv-1', '   ');

    expect(useChatStore.getState().getDraftContent('conv-1')).toBe('');
  });

  it('parks a new chat under the pending key, which has no id yet', async () => {
    const { useChatStore, parkUnsentDraft, PENDING_CONVERSATION_KEY } =
      await import('@shared/stores/web-chat-store');
    useChatStore.setState({ draftsByConversation: {}, draftContent: '' });

    parkUnsentDraft(null, 'first message that never saved');

    expect(useChatStore.getState().draftsByConversation[PENDING_CONVERSATION_KEY]).toBe(
      'first message that never saved',
    );
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
