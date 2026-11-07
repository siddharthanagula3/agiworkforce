import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveModelFamilySlot } from '@agiworkforce/types';

vi.mock('@shared/lib/logger', () => ({
  logger: { auth: vi.fn(), debug: vi.fn(), error: vi.fn() },
}));

const {
  stopStreaming,
  cancelActiveOperations,
  cancelListening,
  chatReset,
  chatWorkspaceReset,
  modelReset,
  modelClear,
  voiceReset,
  voiceClear,
  resetModelFavourites,
  resetConnectors,
  resetConnectorCapabilities,
} = vi.hoisted(() => ({
  stopStreaming: vi.fn(),
  cancelActiveOperations: vi.fn(),
  cancelListening: vi.fn(),
  chatReset: vi.fn(),
  chatWorkspaceReset: vi.fn(),
  modelReset: vi.fn(),
  modelClear: vi.fn(),
  voiceReset: vi.fn(),
  voiceClear: vi.fn(),
  resetModelFavourites: vi.fn(),
  resetConnectors: vi.fn(),
  resetConnectorCapabilities: vi.fn(),
}));

function storeModule(state: Record<string, unknown>) {
  return { useTestStore: { getState: () => state } };
}

vi.mock('../layout-store', () => ({}));
vi.mock('../web-chat-store', () =>
  storeModule({
    stopStreaming,
    cancelActiveOperations,
    resetOnWorkspaceSwitch: chatWorkspaceReset,
    reset: chatReset,
  }),
);
vi.mock('../web-settings-store', () => ({}));
vi.mock('../model-store', () => ({
  useModelStore: {
    getState: () => ({ reset: modelReset }),
    persist: { getOptions: () => ({ name: 'agi-model-store' }), clearStorage: modelClear },
  },
}));
vi.mock('../thinking-store', () => ({}));
vi.mock('@/features/chat/stores/artifacts-store', () => ({}));
vi.mock('@/features/chat/stores/voice-input-store', () => storeModule({ cancelListening }));
vi.mock('@/features/chat/stores/voice-session-store', () => ({
  useVoiceSessionStore: {
    getState: () => ({ resetOnLogout: voiceReset }),
    persist: { getOptions: () => ({ name: 'agi-web-voice-session' }), clearStorage: voiceClear },
  },
}));
vi.mock('@/features/chat/stores/style-store', () => ({}));
vi.mock('@/features/connectors/stores/tool-permissions-store', () => ({}));
vi.mock('@/features/chat/lib/use-model-favourites', () => ({
  invalidateModelFavouritesCache: resetModelFavourites,
}));
vi.mock('@/features/connectors/hooks/use-connectors', () => ({
  invalidateConnectorsCache: resetConnectors,
}));
vi.mock('@/features/connectors/hooks/use-connector-capabilities', () => ({
  invalidateConnectorCapabilityCatalog: resetConnectorCapabilities,
}));
vi.mock('@agiworkforce/unified-chat', () => ({}));

import { applyCacheScope } from '../authentication-store';
import { useMediaStore } from '../media-store';

const SCOPE_KEY = 'agi.cache-scope';
const mediaOwner = {
  userId: 'media-user', sessionId: 'media-session',
  isCurrent: () => true, getToken: async () => 'media-token',
};
const MODEL_PREFERENCES = JSON.stringify([resolveModelFamilySlot('openai/gpt-fast')]);

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  sessionStorage.clear();
  useMediaStore.getState().reset();
});

describe('applyCacheScope', () => {
  it.each(['account', 'workspace'] as const)('resets actual media jobs on a %s scope change', async (kind) => {
    await applyCacheScope({ accountId: 'user_1', workspaceId: null });
    useMediaStore.getState().addJob({
      id: 'previous-scope-job', type: 'video', prompt: 'previous scope prompt',
      status: 'generating', createdAt: '2026-11-04T00:00:00.000Z',
    }, mediaOwner);
    await applyCacheScope(kind === 'account'
      ? { accountId: 'user_2', workspaceId: null }
      : { accountId: 'user_1', workspaceId: 'org_a' });
    expect(useMediaStore.getState().jobs).toEqual([]);
  });

  it('preserves current media work on first and unchanged scope observation', async () => {
    const job = {
      id: 'current-job', type: 'image' as const, prompt: 'current prompt',
      status: 'generating' as const, createdAt: '2026-11-04T00:00:00.000Z',
    };
    useMediaStore.getState().addJob(job, mediaOwner);
    expect(await applyCacheScope({ accountId: 'user_1', workspaceId: null })).toBe(false);
    expect(useMediaStore.getState().jobs).toEqual([{ ...job, owner: mediaOwner }]);
    expect(await applyCacheScope({ accountId: 'user_1', workspaceId: null })).toBe(false);
    expect(useMediaStore.getState().jobs).toEqual([{ ...job, owner: mediaOwner }]);
  });

  it('does not purge or record scope after the captured owner retires during cancellation', async () => {
    await applyCacheScope({ accountId: 'user_1', workspaceId: null });
    let current = true;
    stopStreaming.mockImplementationOnce(() => { current = false; });
    localStorage.setItem('agi-composer-draft:v2:tab-a:conversation-a', 'kept');
    expect(await applyCacheScope({ accountId: 'user_1', workspaceId: 'org_a' }, () => current)).toBe(false);
    expect(chatWorkspaceReset).not.toHaveBeenCalled();
    expect(localStorage.getItem(SCOPE_KEY)).toBe('user_1/personal');
    expect(localStorage.getItem('agi-composer-draft:v2:tab-a:conversation-a')).toBe('kept');
  });

  it('does not enter account-wide logout cleanup from a captured workspace switch', async () => {
    await applyCacheScope({ accountId: 'user_2', workspaceId: null });
    await expect(applyCacheScope({ accountId: 'user_1', workspaceId: 'org_a' }, () => true))
      .rejects.toThrow('Account cache scope is still resolving');
    expect(chatReset).not.toHaveBeenCalled();
    expect(localStorage.getItem(SCOPE_KEY)).toBe('user_2/personal');
  });

  it('does not invoke later cancellation methods or clear replacement state after a cancellation changes ownership', async () => {
    await applyCacheScope({ accountId: 'old-account', workspaceId: 'old-workspace' });
    let current = true;
    const replacementJob = {
      id: 'replacement-job', type: 'image' as const, prompt: 'replacement workspace prompt',
      status: 'generating' as const, createdAt: '2026-11-06T00:00:00.000Z',
    };
    stopStreaming.mockImplementationOnce(() => {
      current = false;
      localStorage.setItem(SCOPE_KEY, 'replacement-account/replacement-workspace');
      localStorage.setItem('agi-composer-draft:v2:replacement', 'replacement draft');
      useMediaStore.getState().addJob(replacementJob, mediaOwner);
    });

    expect(await applyCacheScope({ accountId: 'old-account', workspaceId: 'next-workspace' }, () => current)).toBe(false);
    expect(stopStreaming).toHaveBeenCalledOnce();
    expect(cancelActiveOperations).not.toHaveBeenCalled();
    expect(chatWorkspaceReset).not.toHaveBeenCalled();
    expect(chatReset).not.toHaveBeenCalled();
    expect(localStorage.getItem(SCOPE_KEY)).toBe('replacement-account/replacement-workspace');
    expect(localStorage.getItem('agi-composer-draft:v2:replacement')).toBe('replacement draft');
    expect(useMediaStore.getState().jobs).toEqual([{ ...replacementJob, owner: mediaOwner }]);
  });
  it('adopts the first scope it sees without dropping the signed-in account state', async () => {
    localStorage.setItem('agi.chat-drafts', 'draft');

    expect(await applyCacheScope({ accountId: 'user_1' })).toBe(false);

    expect(localStorage.getItem(SCOPE_KEY)).toBe('user_1/personal');
    expect(localStorage.getItem('agi.chat-drafts')).toBe('draft');
    expect(chatReset).not.toHaveBeenCalled();
  });

  it('drops the previous account caches on a fast switch that never signed out', async () => {
    await applyCacheScope({ accountId: 'user_1' });
    localStorage.setItem('agi.chat-drafts', 'first account draft');

    expect(await applyCacheScope({ accountId: 'user_2' })).toBe(true);

    expect(localStorage.getItem('agi.chat-drafts')).toBeNull();
    expect(localStorage.getItem(SCOPE_KEY)).toBe('user_2/personal');
    expect(chatReset).toHaveBeenCalled();
    expect(modelReset).toHaveBeenCalled();
    expect(modelClear).toHaveBeenCalled();
    expect(voiceReset).toHaveBeenCalled();
    expect(voiceClear).toHaveBeenCalled();
    expect(resetModelFavourites).toHaveBeenCalled();
    expect(resetConnectors).toHaveBeenCalled();
    expect(resetConnectorCapabilities).toHaveBeenCalled();
  });

  // Fails before TC-01: the account switch runs the sign-out sweep, which took
  // the notice keys too. The stored value names the account that dismissed it,
  // so the next account is still shown the notice once.
  it('keeps the notices dismissed on this browser through an account switch', async () => {
    await applyCacheScope({ accountId: 'user_1' });
    localStorage.setItem('agi.notice.free-plan-training', 'user_1');

    expect(await applyCacheScope({ accountId: 'user_2' })).toBe(true);

    expect(localStorage.getItem('agi.notice.free-plan-training')).toBe('user_1');
  });

  it('drops workspace content without clearing account model preferences', async () => {
    await applyCacheScope({ accountId: 'user_1', workspaceId: null });
    localStorage.setItem('agi-composer-draft:v1:conversation-a', 'personal draft');
    localStorage.setItem('agi-composer-draft:v2:tab-a:conversation-a', 'current draft');
    sessionStorage.setItem(
      'agi-composer-draft:document-owner',
      '{"current":"tab-a","previous":[]}',
    );
    localStorage.setItem('agi-model-picker-favourites', MODEL_PREFERENCES);
    localStorage.setItem('agi.sidebar.unreadConversationIds', '["conversation-a"]');
    localStorage.setItem('agi:steps-card:conversation-a:member-a', '{"expanded":true}');
    localStorage.setItem('agi.workspace-policy.user_1', '{"policy":{"organizationId":null}}');
    sessionStorage.setItem(
      'agi:mcp-context-pending',
      '{"resources":[{"connectorId":"personal","uri":"private://resource"}]}',
    );

    expect(await applyCacheScope({ accountId: 'user_1', workspaceId: 'org_a' })).toBe(true);

    expect(localStorage.getItem(SCOPE_KEY)).toBe('user_1/org_a');
    expect(localStorage.getItem('agi-composer-draft:v1:conversation-a')).toBeNull();
    expect(localStorage.getItem('agi-composer-draft:v2:tab-a:conversation-a')).toBeNull();
    expect(sessionStorage.getItem('agi-composer-draft:document-owner')).toBeNull();
    expect(localStorage.getItem('agi.sidebar.unreadConversationIds')).toBeNull();
    expect(localStorage.getItem('agi:steps-card:conversation-a:member-a')).toBeNull();
    expect(localStorage.getItem('agi.workspace-policy.user_1')).toBeNull();
    expect(sessionStorage.getItem('agi:mcp-context-pending')).toBeNull();
    expect(localStorage.getItem('agi-model-picker-favourites')).toBe(MODEL_PREFERENCES);
    expect(chatWorkspaceReset).toHaveBeenCalled();
    expect(chatReset).not.toHaveBeenCalled();
    expect(modelReset).not.toHaveBeenCalled();
    expect(modelClear).not.toHaveBeenCalled();
    expect(voiceReset).not.toHaveBeenCalled();
    expect(voiceClear).not.toHaveBeenCalled();
    expect(resetModelFavourites).not.toHaveBeenCalled();
    expect(resetConnectors).toHaveBeenCalled();
    expect(resetConnectorCapabilities).toHaveBeenCalled();
  });

  it('cancels the streams and microphones the previous workspace started', async () => {
    await applyCacheScope({ accountId: 'user_1', workspaceId: null });

    await applyCacheScope({ accountId: 'user_1', workspaceId: 'org_a' });

    expect(stopStreaming).toHaveBeenCalled();
    expect(cancelListening).toHaveBeenCalled();
  });

  it('keeps the recorded workspace when the caller only knows the account', async () => {
    await applyCacheScope({ accountId: 'user_1', workspaceId: 'org_a' });

    expect(await applyCacheScope({ accountId: 'user_1' })).toBe(false);
    expect(localStorage.getItem(SCOPE_KEY)).toBe('user_1/org_a');
  });

  it('does nothing when neither the account nor the workspace moved', async () => {
    await applyCacheScope({ accountId: 'user_1', workspaceId: 'org_a' });
    localStorage.setItem('agi.chat-drafts', 'still mine');

    expect(await applyCacheScope({ accountId: 'user_1', workspaceId: 'org_a' })).toBe(false);
    expect(localStorage.getItem('agi.chat-drafts')).toBe('still mine');
    expect(stopStreaming).not.toHaveBeenCalled();
  });
});
