import { createStore } from 'zustand/vanilla';
import { managedCloudMessagePath } from '@agiworkforce/cloud-contracts';
import { api } from '@/services/api';
import { ApiHttpError } from '@/services/apiErrors';
import {
  __resetCloudAccountSessionForTests,
  activateCloudAccount,
} from '@/src/features/auth/services/cloudAccountSession';
import {
  resolveAssistantFenceEdit,
  saveAssistantFenceEdit,
} from '@/src/features/chat/services/assistantFenceEdit';
import type { ConversationMessageState } from '@/stores/chat/conversationRepository';
import type { ChatMessage, ConversationSummary } from '@/types/chat';

const mockStore = createStore<ConversationMessageState>(() => ({
  conversations: [],
  messages: {},
}));

jest.mock('@/stores/chat/conversationRepository', () => ({
  getConversationMessageStore: () => mockStore,
}));

jest.mock('@/services/api', () => ({
  api: { patch: jest.fn() },
}));

const CONVERSATION = 'conversation-1';
const MESSAGE = 'message-1';
const ANSWER = [
  'Here is the draft.',
  '',
  '```document',
  '  Indented opening.',
  '',
  '```',
  '',
  '```email',
  'To: reader@example.com',
  'Subject: Review',
  '',
  'Hello.',
  '```',
].join('\n');

function seed(
  conversation: Partial<ConversationSummary>,
  message: Partial<ChatMessage> = {},
): void {
  mockStore.setState({
    conversations: [
      {
        id: CONVERSATION,
        title: 'Drafts',
        updatedAt: '2026-11-14T00:00:00.000Z',
        ...conversation,
      } as ConversationSummary,
    ],
    messages: {
      [CONVERSATION]: [
        {
          id: MESSAGE,
          conversationId: CONVERSATION,
          role: 'assistant',
          content: ANSWER,
          createdAt: '2026-11-14T00:00:00.000Z',
          ...message,
        } as ChatMessage,
      ],
    },
  });
}

function storedContent(): string | undefined {
  return mockStore.getState().messages[CONVERSATION]?.[0]?.content;
}

const DOCUMENT_EDIT = {
  language: 'document',
  identity: 'Indented opening.',
  content: 'A new opening.',
};

afterEach(() => {
  jest.mocked(api.patch).mockReset();
  __resetCloudAccountSessionForTests();
});

describe('resolving a displayed draft to the block an edit must name', () => {
  it('names the block by its position among editable blocks and its exact source', () => {
    expect(resolveAssistantFenceEdit(ANSWER, DOCUMENT_EDIT)).toEqual({
      index: 0,
      language: 'document',
      source: '  Indented opening.\n',
      content: 'A new opening.',
    });
    expect(
      resolveAssistantFenceEdit(ANSWER, {
        language: 'email',
        identity: 'To: reader@example.com\nSubject: Review\n\nHello.',
        content: 'To: reader@example.com\nSubject: Later\n\nHello.',
      }),
    ).toMatchObject({
      index: 1,
      language: 'email',
      source: 'To: reader@example.com\nSubject: Review\n\nHello.',
    });
  });

  it('refuses a block that is gone or that appears twice', () => {
    expect(resolveAssistantFenceEdit(ANSWER, { ...DOCUMENT_EDIT, identity: 'Other.' })).toBeNull();
    const twice = '```writing\nSame.\n```\n\n```writing\nSame.\n```';
    expect(
      resolveAssistantFenceEdit(twice, { language: 'writing', identity: 'Same.', content: 'New.' }),
    ).toBe('ambiguous');
  });
});

describe('saving a draft edit', () => {
  it('updates a Local message on the device without any network call', async () => {
    seed({ executionMode: 'local' });
    await saveAssistantFenceEdit(CONVERSATION, MESSAGE, DOCUMENT_EDIT);
    expect(api.patch).not.toHaveBeenCalled();
    expect(storedContent()).toBe(ANSWER.replace('  Indented opening.\n', 'A new opening.'));
  });

  it('saves a Cloud edit through the message endpoint and shows what the server stored', async () => {
    activateCloudAccount('owner-1');
    seed({ executionMode: 'cloud' });
    jest
      .mocked(api.patch)
      .mockResolvedValue({ ok: true, content: 'Stored by the server.', editRevision: 'rev-1' });
    await saveAssistantFenceEdit(CONVERSATION, MESSAGE, DOCUMENT_EDIT);
    expect(api.patch).toHaveBeenCalledWith(managedCloudMessagePath(CONVERSATION, MESSAGE), {
      fenceEdit: {
        index: 0,
        language: 'document',
        source: '  Indented opening.\n',
        content: 'A new opening.',
      },
    });
    expect(storedContent()).toBe('Stored by the server.');
  });

  it('keeps a temporary chat edit on the device, as web does', async () => {
    activateCloudAccount('owner-1');
    seed({ executionMode: 'cloud', temporary: true });
    await saveAssistantFenceEdit(CONVERSATION, MESSAGE, DOCUMENT_EDIT);
    expect(api.patch).not.toHaveBeenCalled();
    expect(storedContent()).toContain('A new opening.');
  });

  it('leaves the message alone when the server reports a conflict', async () => {
    activateCloudAccount('owner-1');
    seed({ executionMode: 'cloud' });
    jest.mocked(api.patch).mockRejectedValue(new ApiHttpError('Conflict', 409));
    await expect(saveAssistantFenceEdit(CONVERSATION, MESSAGE, DOCUMENT_EDIT)).rejects.toThrow(
      'This block changed. Reopen the chat before saving your edit.',
    );
    expect(storedContent()).toBe(ANSWER);
  });

  it('refuses an unconfirmed server answer and a Cloud save without an account', async () => {
    seed({ executionMode: 'cloud' });
    await expect(saveAssistantFenceEdit(CONVERSATION, MESSAGE, DOCUMENT_EDIT)).rejects.toThrow(
      'Sign in again to save this edit.',
    );
    activateCloudAccount('owner-1');
    jest.mocked(api.patch).mockResolvedValue({ ok: true });
    await expect(saveAssistantFenceEdit(CONVERSATION, MESSAGE, DOCUMENT_EDIT)).rejects.toThrow(
      'The server did not confirm the saved edit. Reopen the chat and try again.',
    );
    expect(storedContent()).toBe(ANSWER);
  });

  it('refuses while the answer is still streaming or once the block has changed', async () => {
    seed({ executionMode: 'local' }, { isStreaming: true });
    await expect(saveAssistantFenceEdit(CONVERSATION, MESSAGE, DOCUMENT_EDIT)).rejects.toThrow(
      'Wait for this response to finish before editing.',
    );
    seed({ executionMode: 'local' }, { content: 'Nothing editable here.' });
    await expect(saveAssistantFenceEdit(CONVERSATION, MESSAGE, DOCUMENT_EDIT)).rejects.toThrow(
      'This block changed. Reopen the chat before saving your edit.',
    );
  });
});
