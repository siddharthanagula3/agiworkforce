import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@shared/lib/logger', () => ({
  logger: { auth: vi.fn(), debug: vi.fn(), error: vi.fn() },
}));

const { stopStreaming, cancelListening, chatReset } = vi.hoisted(() => ({
  stopStreaming: vi.fn(),
  cancelListening: vi.fn(),
  chatReset: vi.fn(),
}));

function storeModule(state: Record<string, unknown>) {
  return { useTestStore: { getState: () => state } };
}

vi.mock('../mission-control-store', () => ({}));
vi.mock('../notification-store', () => ({}));
vi.mock('../artifact-store', () => ({}));
vi.mock('../layout-store', () => ({}));
vi.mock('../user-profile-store', () => ({}));
vi.mock('../web-chat-store', () => storeModule({ stopStreaming, reset: chatReset }));
vi.mock('../web-settings-store', () => ({}));
vi.mock('../media-store', () => ({}));
vi.mock('../model-store', () => ({}));
vi.mock('../thinking-store', () => ({}));
vi.mock('../tool-store', () => ({}));
vi.mock('../agent-metrics-store', () => ({}));
vi.mock('../company-hub-store', () => ({}));
vi.mock('@/features/chat/stores/artifacts-store', () => ({}));
vi.mock('@/features/chat/stores/voice-input-store', () => storeModule({ cancelListening }));
vi.mock('@/features/chat/stores/style-store', () => ({}));
vi.mock('@/features/connectors/stores/tool-permissions-store', () => ({}));
vi.mock('@agiworkforce/unified-chat', () => ({}));

import { applyCacheScope } from '../authentication-store';

const SCOPE_KEY = 'agi.cache-scope';

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

describe('applyCacheScope', () => {
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
  });

  it('treats a workspace switch on one account as a scope change', async () => {
    await applyCacheScope({ accountId: 'user_1', workspaceId: null });
    localStorage.setItem('agi.chat-drafts', 'personal draft');

    expect(await applyCacheScope({ accountId: 'user_1', workspaceId: 'org_a' })).toBe(true);

    expect(localStorage.getItem(SCOPE_KEY)).toBe('user_1/org_a');
    expect(localStorage.getItem('agi.chat-drafts')).toBeNull();
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
