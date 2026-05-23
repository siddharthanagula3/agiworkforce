import type { LocalToByokHandoffPreview } from '@agiworkforce/utils/privacy-handoff';

jest.mock('../services/api', () => ({
  api: {
    get: jest.fn(),
    post: jest.fn().mockRejectedValue(new Error('offline')),
    put: jest.fn(),
    delete: jest.fn(),
  },
}));

jest.mock('../services/supabase', () => ({
  supabase: {
    auth: {
      getSession: jest.fn().mockResolvedValue({ data: { session: null } }),
    },
  },
}));

jest.mock('../services/streaming', () => ({
  streamChat: jest.fn(),
}));

jest.mock('../lib/mmkv', () => ({
  whenMmkvReady: jest.fn((cb) => cb()),
  rehydrateWhenMmkvReady: jest.fn((store) => {
    if (store && store.persist && typeof store.persist.rehydrate === 'function') {
      store.persist.rehydrate();
    }
  }),
  mmkvStorage: {
    getItem: jest.fn().mockReturnValue(null),
    setItem: jest.fn(),
    removeItem: jest.fn(),
  },
}));

import { useChatStore } from '../stores/chatStore';
import { api } from '../services/api';

const HASH = 'abc1234567890defabc1234567890defabc1234567890defabc1234567890def';

function buildPreview(overrides?: {
  blocked?: boolean;
  targetProviderMode?: LocalToByokHandoffPreview['draft']['targetProviderMode'];
}): LocalToByokHandoffPreview {
  const blocked = overrides?.blocked ?? false;
  const redactionReport = {
    scannerVersion: 'test-scanner',
    findings: [],
    redactedByteCount: 37,
    blocked,
    generatedAt: '2026-05-21T10:00:00.000Z',
  };

  return {
    draft: {
      id: `handoff-${HASH.slice(0, 16)}`,
      sourceSessionId: 'local-session-1',
      sourceSurface: 'mobile',
      targetSurface: 'mobile',
      targetPrivacyMode: 'byok',
      targetProviderMode: overrides?.targetProviderMode ?? 'DirectByok',
      selectedContext: [
        {
          id: 'msg-secret',
          kind: 'message',
          label: 'user message 1',
          byteCount: 64,
          checksumSha256: HASH,
        },
      ],
      redactionReport,
      previewHashSha256: HASH,
      consentRequired: true,
      expiresAt: '2026-05-21T10:30:00.000Z',
      createdAt: '2026-05-21T10:00:00.000Z',
    },
    redactedPayload: JSON.stringify(
      {
        selectedContext: [
          {
            id: 'msg-secret',
            label: 'user message 1',
            content: 'OPENAI_API_KEY=[REDACTED_API_KEY]',
          },
        ],
      },
      null,
      2,
    ),
    redactedContext: [
      {
        id: 'msg-secret',
        kind: 'message',
        label: 'user message 1',
        byteCount: 64,
        checksumSha256: HASH,
        redactedContent: 'OPENAI_API_KEY=[REDACTED_API_KEY]',
      },
    ],
    redactionReport,
  };
}

function resetStore() {
  useChatStore.setState({
    conversations: [
      {
        id: 'local-conv',
        title: 'Local thread',
        updatedAt: '2026-05-21T09:59:00.000Z',
        createdAt: '2026-05-21T09:00:00.000Z',
        messageCount: 2,
        pinned: false,
      },
    ],
    currentConversationId: 'local-conv',
    messages: {
      'local-conv': [
        {
          id: 'msg-secret',
          conversationId: 'local-conv',
          role: 'user',
          content: 'The raw secret is OPENAI_API_KEY=sk-live-raw-secret-1234567890',
          createdAt: '2026-05-21T09:58:00.000Z',
          model: 'llama-local',
        },
        {
          id: 'msg-answer',
          conversationId: 'local-conv',
          role: 'assistant',
          content: 'Local-only answer',
          createdAt: '2026-05-21T09:59:00.000Z',
          model: 'llama-local',
        },
      ],
    },
  });
}

describe('mobile Local to BYOK handoff forks', () => {
  beforeEach(() => {
    resetStore();
    jest.clearAllMocks();
  });

  it('creates a BYOK fork with only the accepted redacted preview payload', async () => {
    const forkId = await useChatStore.getState().forkConversation('local-conv', {
      title: 'BYOK fork',
      model: 'gpt-5.1',
      handoffPreview: buildPreview(),
      handoffAcceptedAt: '2026-05-21T10:01:00.000Z',
    });

    const forkMessages = useChatStore.getState().messages[forkId] ?? [];
    expect(forkMessages).toHaveLength(1);
    expect(forkMessages[0]?.role).toBe('system');
    expect(forkMessages[0]?.content).toContain('OPENAI_API_KEY=[REDACTED_API_KEY]');
    expect(forkMessages[0]?.content).not.toContain('sk-live-raw-secret');
    expect(forkMessages[0]?.content).not.toContain('Local-only answer');
    expect(forkMessages[0]?.metadata).toMatchObject({
      kind: 'local_to_byok_handoff',
      previewHashSha256: HASH,
      sourceMessagePolicy: 'redacted_preview_only',
    });
    expect(useChatStore.getState().messages['local-conv']).toHaveLength(2);
  });

  it('does not touch remote chat APIs while mobile v1 is local-only', async () => {
    const state = useChatStore.getState();

    await state.loadConversations();
    const localId = await state.createConversation('Local only');
    await state.loadMessages(localId);
    await state.renameConversation(localId, 'Renamed local');
    await state.pinConversation(localId);
    await state.deleteConversation(localId);

    expect(api.get).not.toHaveBeenCalled();
    expect(api.post).not.toHaveBeenCalled();
    expect(api.put).not.toHaveBeenCalled();
    expect(api.delete).not.toHaveBeenCalled();
  });

  it('rejects blocked previews before creating a fork', async () => {
    await expect(
      useChatStore.getState().forkConversation('local-conv', {
        title: 'Blocked fork',
        model: 'gpt-5.1',
        handoffPreview: buildPreview({ blocked: true }),
      }),
    ).rejects.toThrow('Blocked Local to BYOK handoff preview');

    expect(useChatStore.getState().conversations).toHaveLength(1);
    expect(useChatStore.getState().messages['local-conv']).toHaveLength(2);
  });
});
