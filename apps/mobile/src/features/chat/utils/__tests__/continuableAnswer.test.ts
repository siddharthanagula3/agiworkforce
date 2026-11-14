import { getProviderOfferings } from '@agiworkforce/types';
import { requireFreeMobileCloudModel, requireLocalModel } from '@/test-utils/modelFixtures';
import type { ChatMessage, ConversationSummary } from '@/types/chat';
import { continuableCloudModel } from '../continuableAnswer';

const CLOUD_MODEL = requireFreeMobileCloudModel().id;
const CUT_OFF = 'The migration needs three steps. First export the schema, then run the';

const cloudConversation: Pick<ConversationSummary, 'executionMode' | 'model' | 'provider'> = {
  executionMode: 'cloud',
  model: CLOUD_MODEL,
};

function answer(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: 'answer-1',
    conversationId: 'conversation-1',
    role: 'assistant',
    content: CUT_OFF,
    createdAt: '2026-10-27T08:00:00.000Z',
    model: CLOUD_MODEL,
    metadata: { finishReason: 'length' },
    ...overrides,
  };
}

describe('continuableCloudModel', () => {
  it('continues a cloud answer the length limit cut off with the model that wrote it', () => {
    expect(continuableCloudModel(cloudConversation, answer())).toBe(CLOUD_MODEL);
  });

  it('falls back to the conversation model when the answer records none', () => {
    expect(continuableCloudModel(cloudConversation, answer({ model: undefined }))).toBe(
      CLOUD_MODEL,
    );
  });

  it('offers nothing for an answer that finished', () => {
    expect(
      continuableCloudModel(
        cloudConversation,
        answer({ content: 'All three steps are done.', metadata: { finishReason: 'stop' } }),
      ),
    ).toBeNull();
  });

  it.each(['stopped', 'tool_calls', 'content_filter', 'refusal', 'error'])(
    'never overrules a %s ending with the cut-off reading of the text',
    (finishReason) => {
      expect(
        continuableCloudModel(cloudConversation, answer({ metadata: { finishReason } })),
      ).toBeNull();
    },
  );

  it('leaves failed, paused and media answers to their own recovery', () => {
    const cases: Partial<ChatMessage>[] = [
      { metadata: { finishReason: 'length', streamError: { message: 'Provider overloaded' } } },
      { status: 'error' },
      { type: 'image' },
      { isStreaming: true },
      { metadata: { finishReason: 'length', research: { status: 'running' } } },
      {
        toolCalls: [
          {
            toolCallId: 'call-1',
            name: 'send_email',
            status: 'awaiting-approval',
            requiresApproval: true,
          },
        ] as ChatMessage['toolCalls'],
      },
    ];
    for (const overrides of cases) {
      expect(continuableCloudModel(cloudConversation, answer(overrides))).toBeNull();
    }
  });

  it('does not continue a Local Mode answer through the cloud', () => {
    const localModel = requireLocalModel().id;
    expect(
      continuableCloudModel(
        { executionMode: 'local', model: localModel },
        answer({ model: localModel }),
      ),
    ).toBeNull();
  });

  it('does not continue a provider-funded Free answer, whose route cannot append', () => {
    const freeModel = Object.entries(getProviderOfferings()).find(
      ([, offering]) => offering.category === 'chat',
    )?.[0];
    if (!freeModel) throw new Error('Expected a provider-funded Free chat offering.');
    expect(continuableCloudModel(cloudConversation, answer({ model: freeModel }))).toBeNull();
  });
});
