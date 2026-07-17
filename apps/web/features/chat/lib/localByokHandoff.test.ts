import { describe, expect, it } from 'vitest';
import {
  buildAcceptedHandoffSystemMessage,
  buildHandoffContextCandidates,
  getConversationProviderMode,
  getProviderModeForModel,
  shouldForkLocalToByok,
  type WebLocalToByokPreview,
} from './localByokHandoff';
import type { Conversation, Message } from '@shared/stores/web-chat-store';

const conversation: Conversation = {
  id: 'conv-local',
  title: 'Local thread',
  createdAt: '2026-05-21T00:00:00.000Z',
  updatedAt: '2026-05-21T00:00:00.000Z',
  model: 'ollama/llama3',
};

const messages: Message[] = [
  {
    id: 'msg-1',
    role: 'user',
    content: 'Local context',
    createdAt: '2026-05-21T00:00:01.000Z',
    model: 'ollama/llama3',
  },
];

describe('localByokHandoff', () => {
  it('classifies local and direct BYOK provider modes from model ids', () => {
    expect(getProviderModeForModel('ollama/llama3')).toBe('Local');
    expect(getProviderModeForModel('open_router/deepseek-r1')).toBe('DirectByok');
  });

  it('detects only Local to Direct BYOK as a required fork', () => {
    expect(
      shouldForkLocalToByok({
        conversation,
        messages,
        targetModelId: 'open_router/deepseek-r1',
      }),
    ).toBe(true);
    expect(
      shouldForkLocalToByok({
        conversation,
        messages,
        targetModelId: 'auto-balanced',
      }),
    ).toBe(false);
  });

  it('falls back to message metadata when conversation model is absent', () => {
    expect(
      getConversationProviderMode(null, [
        {
          ...messages[0]!,
          model: undefined,
          metadata: { providerMode: 'Local' },
        },
      ]),
    ).toBe('Local');
  });

  it('builds recent message context with required outgoing prompt', () => {
    const candidates = buildHandoffContextCandidates({
      conversationId: conversation.id,
      messages,
      outgoingContent: 'Continue with BYOK',
    });

    expect(candidates.map((candidate) => candidate.id)).toEqual([
      'message-msg-1',
      'outgoing-user-message',
    ]);
    expect(candidates.at(-1)?.required).toBe(true);
  });

  it('creates an accepted handoff system message with the redacted payload', () => {
    const systemMessage = buildAcceptedHandoffSystemMessage({
      redactedPayload: '{"selectedContext":[]}',
    } as WebLocalToByokPreview);

    expect(systemMessage).toContain('handoff accepted');
    expect(systemMessage).toContain('"selectedContext"');
  });
});
