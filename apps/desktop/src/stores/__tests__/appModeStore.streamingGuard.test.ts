import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../lib/runtimeEnvironment', () => ({
  isTauri: true,
  isTestEnvironment: true,
  isDesktopUiDevLocal: false,
  supportsLocalAppMode: true,
  isCloudWeb: false,
}));

const { toastError, toastInfo } = vi.hoisted(() => ({
  toastError: vi.fn(),
  toastInfo: vi.fn(),
}));
vi.mock('sonner', () => ({
  toast: { error: toastError, info: toastInfo, success: vi.fn(), warning: vi.fn() },
}));

vi.mock('../../lib/tauri-mock', () => ({
  invoke: vi.fn(),
  isTauri: false,
  isTauriContext: vi.fn(() => false),
}));

vi.mock('../../utils/localStorage', () => ({
  safeGetJSON: vi.fn().mockReturnValue({ dbIdToUuid: {}, uuidToDbId: {} }),
  safeSetJSON: vi.fn().mockReturnValue(true),
  storageFallback: {
    length: 0,
    clear: vi.fn(),
    getItem: vi.fn().mockReturnValue(null),
    key: vi.fn().mockReturnValue(null),
    removeItem: vi.fn(),
    setItem: vi.fn(),
  },
}));

import { useAppModeStore } from '../appModeStore';
import { isChatStoreStreaming, registerChatStoreStateReader } from '../chat/chatStoreRef';
import { useChatExecutionStore } from '../chat/chatExecutionStore';
import '../chat/chatStore';

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const STREAMING_REFUSAL = 'Finish the current response before switching modes';

describe('DES-C16: mode switching is refused while any chat is streaming', () => {
  beforeEach(() => {
    toastError.mockClear();
    toastInfo.mockClear();
    useAppModeStore.setState({
      mode: 'local',
      hasOnboarded: true,
      hasSelectedMode: true,
      isOnline: true,
    });
    useChatExecutionStore.setState({ isStreaming: false });
  });

  it('reads the store that actually owns isStreaming (the execution store)', () => {
    expect(isChatStoreStreaming()).toBe(false);

    useChatExecutionStore.setState({ isStreaming: true });
    expect(isChatStoreStreaming()).toBe(true);

    useChatExecutionStore.setState({ isStreaming: false });
    expect(isChatStoreStreaming()).toBe(false);
  });

  it('refuses Local -> Cloud while a desktop stream is running', () => {
    useChatExecutionStore.setState({ isStreaming: true });

    useAppModeStore.getState().setMode('cloud');

    expect(useAppModeStore.getState().mode).toBe('local');
    expect(toastError).toHaveBeenCalledWith(STREAMING_REFUSAL);
  });

  it('refuses Cloud -> Local while the SHARED unified-chat store is streaming', () => {
    const sharedStore = { isStreaming: false };
    const dispose = registerChatStoreStateReader({ getState: () => sharedStore });

    try {
      useAppModeStore.setState({ mode: 'cloud' });
      sharedStore.isStreaming = true;

      useAppModeStore.getState().setMode('local');

      expect(useAppModeStore.getState().mode).toBe('cloud');
      expect(toastError).toHaveBeenCalledWith(STREAMING_REFUSAL);
    } finally {
      dispose();
    }
  });

  it('allows the switch once every registered reader reports idle', () => {
    const sharedStore = { isStreaming: true };
    const dispose = registerChatStoreStateReader({ getState: () => sharedStore });

    try {
      useAppModeStore.getState().setMode('cloud');
      expect(useAppModeStore.getState().mode).toBe('local');

      sharedStore.isStreaming = false;
      useAppModeStore.getState().setMode('cloud');

      expect(useAppModeStore.getState().mode).toBe('cloud');
    } finally {
      dispose();
    }
  });

  it('unregisters a disposed reader instead of pinning the guard on', () => {
    const sharedStore = { isStreaming: true };
    const dispose = registerChatStoreStateReader({ getState: () => sharedStore });
    expect(isChatStoreStreaming()).toBe(true);

    dispose();
    expect(isChatStoreStreaming()).toBe(false);
  });

  it('wires both readers in production code, not just in this test', () => {
    const chatStoreSource = readFileSync(path.join(SRC, 'stores/chat/chatStore.ts'), 'utf8');
    expect(chatStoreSource).toContain('registerChatStoreStateReader(useChatExecutionStore)');
    expect(
      /registerChatStoreStateReader\(\s*useChatMessageStore/.test(chatStoreSource),
      'the message store never carries isStreaming and must not be the guard reader',
    ).toBe(false);

    const appSource = readFileSync(path.join(SRC, 'App.tsx'), 'utf8');
    expect(appSource).toContain('registerChatStoreStateReader(useSharedChatStore)');
  });
});
