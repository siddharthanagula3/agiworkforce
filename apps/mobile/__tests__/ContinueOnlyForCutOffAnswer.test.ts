import { requireFreeMobileCloudModel } from '@/test-utils/modelFixtures';
import { hydrateStoredCloudMessage } from '@/stores/chat/hydrateCloudMessage';
import { continuableCloudModel } from '@/src/features/chat/utils/continuableAnswer';
import type { ChatMessage, ConversationSummary } from '@/types/chat';

const CLOUD_MODEL = requireFreeMobileCloudModel().id;
const COMPLETE = 'The capital of France is Paris. BANANA';
const CUT_OFF = 'The migration needs three steps. First export the schema, then run the';

const conversation: Pick<ConversationSummary, 'executionMode' | 'model' | 'provider'> = {
  executionMode: 'cloud',
  model: CLOUD_MODEL,
};

function assistant(id: string, content: string, metadata?: Record<string, unknown>): ChatMessage {
  return {
    id,
    conversationId: 'conversation-continue',
    role: 'assistant',
    content,
    createdAt: '2026-11-15T09:00:00.000Z',
    model: CLOUD_MODEL,
    ...(metadata ? { metadata } : {}),
  };
}

function storedCopy(message: ChatMessage): ChatMessage {
  return {
    ...message,
    metadata: { serverPersisted: true, truncated: false, requestId: `request-${message.id}` },
  };
}

describe('Continue generating after the server copy of an answer arrives', () => {
  it('stays hidden under a complete answer that follows a cut-off one', () => {
    const cutOff = assistant('a1', CUT_OFF, { finishReason: 'length' });
    const complete = assistant('a2', COMPLETE, { finishReason: 'stop' });
    expect(continuableCloudModel(conversation, cutOff)).toBe(CLOUD_MODEL);
    expect(continuableCloudModel(conversation, complete)).toBeNull();

    const reloaded = hydrateStoredCloudMessage(storedCopy(complete), complete);

    expect(reloaded.metadata?.finishReason).toBe('stop');
    expect(reloaded.metadata?.['serverPersisted']).toBe(true);
    expect(continuableCloudModel(conversation, reloaded)).toBeNull();
  });

  it('keeps offering it for the cut-off answer when its server copy arrives', () => {
    const cutOff = assistant('a1', CUT_OFF, { finishReason: 'length' });

    const reloaded = hydrateStoredCloudMessage(storedCopy(cutOff), cutOff);

    expect(continuableCloudModel(conversation, reloaded)).toBe(CLOUD_MODEL);
  });

  it('takes the stored ending when the stored text is not the text shown', () => {
    const shown = assistant('a2', COMPLETE, { finishReason: 'stop' });
    const continuedElsewhere = {
      ...storedCopy(shown),
      content: `${COMPLETE}\n\nMore text`,
      metadata: { serverPersisted: true, finishReason: 'length' },
    };

    expect(hydrateStoredCloudMessage(continuedElsewhere, shown).metadata?.finishReason).toBe(
      'length',
    );
    expect(
      hydrateStoredCloudMessage({ ...storedCopy(shown), content: 'Other' }, shown).metadata
        ?.finishReason,
    ).toBeUndefined();
  });

  it('keeps the shown ending when the server stored no reason', () => {
    const complete = assistant('a2', COMPLETE, { finishReason: 'stop' });
    const stored = {
      ...storedCopy(complete),
      metadata: { serverPersisted: true, finishReason: null },
    };

    const reloaded = hydrateStoredCloudMessage(stored, complete);

    expect(reloaded.metadata?.finishReason).toBe('stop');
    expect(continuableCloudModel(conversation, reloaded)).toBeNull();
  });

  it('reads a server copy with no reason from the text when no local copy exists', () => {
    const stored = {
      ...storedCopy(assistant('a1', CUT_OFF)),
      metadata: { serverPersisted: true, finishReason: null },
    };

    const reloaded = hydrateStoredCloudMessage(stored);

    expect(reloaded.metadata).not.toHaveProperty('finishReason');
    expect(continuableCloudModel(conversation, reloaded)).toBe(CLOUD_MODEL);
  });

  it('follows the stored reason on another phone', () => {
    const storedStop = {
      ...storedCopy(assistant('a1', CUT_OFF)),
      metadata: { serverPersisted: true, finishReason: 'stop' },
    };
    const storedLength = {
      ...storedCopy(assistant('a2', COMPLETE)),
      metadata: { serverPersisted: true, finishReason: 'length' },
    };

    expect(continuableCloudModel(conversation, hydrateStoredCloudMessage(storedStop))).toBeNull();
    expect(continuableCloudModel(conversation, hydrateStoredCloudMessage(storedLength))).toBe(
      CLOUD_MODEL,
    );
  });
});
