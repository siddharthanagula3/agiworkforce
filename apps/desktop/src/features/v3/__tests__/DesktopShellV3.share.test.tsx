import { cleanup, render } from '@testing-library/react';
import { enableMapSet } from 'immer';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useAppModeStore } from '../../../stores/appModeStore';
import { useProjectStore } from '../../../stores/projectStore';
import { useChatStore as useLegacyDesktopChatStore } from '../../../stores/chat';
import { DesktopShellV3 } from '../DesktopShellV3';

enableMapSet();

const sharedChatMock = vi.hoisted(() => ({
  conversations: [] as Array<Record<string, unknown>>,
  messagesByConversation: {} as Record<string, Array<Record<string, unknown>>>,
  chatInterfaceProps: [] as Array<Record<string, unknown>>,
  setDraftContent: vi.fn(),
  appendDraftContent: vi.fn(),
}));

const shareMock = vi.hoisted(() => ({
  createDesktopCloudShare: vi.fn(),
}));

const toastMock = vi.hoisted(() => ({
  info: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
}));

vi.mock('sonner', () => ({
  toast: toastMock,
  Toaster: () => null,
}));

vi.mock('../../../services/desktopCloudShares', () => ({
  createDesktopCloudShare: shareMock.createDesktopCloudShare,
}));

vi.mock('../../../lib/tauri-mock', () => ({
  isTauri: true,
  isCloudWeb: false,
  isDesktopUiDevLocal: false,
  isElectronHost: false,
  supportsLocalAppMode: true,
  isTauriContext: () => true,
  listen: vi.fn().mockResolvedValue(() => {}),
  invoke: vi.fn().mockResolvedValue(undefined),
  emit: vi.fn().mockResolvedValue(undefined),
  once: vi.fn().mockResolvedValue(() => {}),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('../../updates', () => ({
  UpdatePill: () => null,
}));

vi.mock('@agiworkforce/unified-chat', async () => {
  const React = await vi.importActual<typeof import('react')>('react');
  const readState = () => ({
    conversations: sharedChatMock.conversations,
    messagesByConversation: sharedChatMock.messagesByConversation,
    setDraftContent: sharedChatMock.setDraftContent,
    appendDraftContent: sharedChatMock.appendDraftContent,
  });
  const useChatStore = (selector: (state: ReturnType<typeof readState>) => unknown) =>
    selector(readState());
  useChatStore.getState = readState;
  const useChatModelStore = (
    selector: (state: {
      models: Array<Record<string, unknown>>;
      selectedModelId: string;
      getSelectedModel: () => undefined;
    }) => unknown,
  ) => selector({ models: [], selectedModelId: '', getSelectedModel: () => undefined });
  return {
    CapabilityProvider: (props: { children?: ReactNode }) =>
      React.createElement(React.Fragment, null, props.children),
    ChatInterface: (props: Record<string, unknown>) => {
      sharedChatMock.chatInterfaceProps.push(props);
      return React.createElement('div', { 'data-testid': 'chat-interface' });
    },
    EmptyState: () => React.createElement('div', { 'data-testid': 'empty-state' }),
    QuickChips: () => React.createElement('div', { 'data-testid': 'quick-chips' }),
    useReducedMotion: () => false,
    composerVoiceStateFromTranscription: (
      workflow: string,
      flags: { isRecording: boolean; isTranscribing: boolean; isSupported: boolean },
    ) => {
      if (flags.isRecording) return 'listening';
      if (flags.isTranscribing) return 'transcribing';
      if (!flags.isSupported) return 'unsupported';
      return workflow;
    },
    useChatStore,
    useChatModelStore,
    selectBudget: () => ({ enabled: false }),
    selectBudgetPercentage: () => 0,
    useBudgetStore: (selector: (state: unknown) => unknown) =>
      selector({ budget: { enabled: false }, percentage: 0 }),
  };
});

function renderCloudShell() {
  useAppModeStore.setState({ mode: 'cloud' });
  render(<DesktopShellV3 runtime={null} hostBridge={null} />);
  const props = sharedChatMock.chatInterfaceProps.at(-1);
  const actions = props?.['conversationActions'] as
    | { onShare?: (conversationId: string) => Promise<void> }
    | undefined;
  const onShare = actions?.onShare;
  if (!onShare) throw new Error('Managed Cloud must expose a share action on the conversation.');
  return onShare;
}

describe('DesktopShellV3 Managed Cloud share payload', () => {
  beforeEach(() => {
    sharedChatMock.chatInterfaceProps.length = 0;
    sharedChatMock.conversations = [];
    sharedChatMock.messagesByConversation = {};
    shareMock.createDesktopCloudShare.mockReset();
    shareMock.createDesktopCloudShare.mockResolvedValue({
      shareUrl: 'https://agiworkforce.com/share/tok_e2e',
      token: 'tok_e2e',
      expiresAt: '2026-09-01T00:00:00.000Z',
      messageCount: 2,
    });
    toastMock.info.mockReset();
    toastMock.success.mockReset();
    toastMock.error.mockReset();
    useProjectStore.setState({ projects: [], activeProjectId: null, loadProjects: async () => {} });
    useLegacyDesktopChatStore.setState({ conversations: [], messagesByConversation: {} });
  });

  afterEach(() => {
    cleanup();
    useAppModeStore.setState({ mode: 'local' });
  });

  it('shares the transcript the shared store holds even though the legacy store is empty', async () => {
    sharedChatMock.conversations = [{ id: 'conv-cloud-1', title: 'Quarterly review' }];
    sharedChatMock.messagesByConversation = {
      'conv-cloud-1': [
        {
          id: 'm1',
          role: 'user',
          content: 'Summarise the quarterly review.',
          createdAt: '2026-07-30T09:00:00.000Z',
        },
        {
          id: 'm2',
          role: 'assistant',
          content: 'Revenue grew 12% quarter over quarter.',
          createdAt: '2026-07-30T09:00:04.000Z',
          model: 'registry-model-a',
          provider: 'anthropic',
        },
      ],
    };

    const onShare = renderCloudShell();
    await onShare('conv-cloud-1');

    expect(toastMock.info).not.toHaveBeenCalled();
    expect(shareMock.createDesktopCloudShare).toHaveBeenCalledTimes(1);
    expect(shareMock.createDesktopCloudShare).toHaveBeenCalledWith({
      title: 'Quarterly review',
      modelId: 'registry-model-a',
      provider: 'anthropic',
      messages: [
        {
          role: 'user',
          content: 'Summarise the quarterly review.',
          created_at: '2026-07-30T09:00:00.000Z',
        },
        {
          role: 'assistant',
          content: 'Revenue grew 12% quarter over quarter.',
          created_at: '2026-07-30T09:00:04.000Z',
        },
      ],
    });
    expect(toastMock.success).toHaveBeenCalledWith(
      'Share link created',
      expect.objectContaining({ description: 'https://agiworkforce.com/share/tok_e2e' }),
    );
  });

  it('reads model and provider out of the metadata bag when the row has no typed fields', async () => {
    sharedChatMock.conversations = [{ id: 'conv-cloud-2', title: '' }];
    sharedChatMock.messagesByConversation = {
      'conv-cloud-2': [
        {
          id: 'm1',
          role: 'user',
          content: 'Hello',
          timestamp: '2026-07-30T10:00:00.000Z',
        },
        {
          id: 'm2',
          role: 'assistant',
          content: 'Hi there.',
          timestamp: '2026-07-30T10:00:02.000Z',
          metadata: { model: 'registry-model-b', provider: 'openai' },
        },
      ],
    };

    const onShare = renderCloudShell();
    await onShare('conv-cloud-2');

    expect(shareMock.createDesktopCloudShare).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Shared Session',
        modelId: 'registry-model-b',
        provider: 'openai',
      }),
    );
  });

  it('prefers the conversation model pin over the last message model', async () => {
    sharedChatMock.conversations = [
      { id: 'conv-cloud-3', title: 'Pinned', model: 'registry-model-pinned' },
    ];
    sharedChatMock.messagesByConversation = {
      'conv-cloud-3': [
        {
          id: 'm1',
          role: 'user',
          content: 'Ping',
          createdAt: '2026-07-30T11:00:00.000Z',
        },
        {
          id: 'm2',
          role: 'assistant',
          content: 'Pong',
          createdAt: '2026-07-30T11:00:01.000Z',
          model: 'registry-model-c',
          provider: 'google',
        },
      ],
    };

    const onShare = renderCloudShell();
    await onShare('conv-cloud-3');

    expect(shareMock.createDesktopCloudShare).toHaveBeenCalledWith(
      expect.objectContaining({ modelId: 'registry-model-pinned', provider: 'google' }),
    );
  });

  it('drops the empty streaming placeholder instead of publishing a blank bubble', async () => {
    sharedChatMock.conversations = [{ id: 'conv-cloud-4', title: 'Mid stream' }];
    sharedChatMock.messagesByConversation = {
      'conv-cloud-4': [
        {
          id: 'm1',
          role: 'user',
          content: 'Start',
          createdAt: '2026-07-30T12:00:00.000Z',
        },
        {
          id: 'm2',
          role: 'assistant',
          content: '   ',
          createdAt: '2026-07-30T12:00:01.000Z',
          isStreaming: true,
        },
      ],
    };

    const onShare = renderCloudShell();
    await onShare('conv-cloud-4');

    expect(shareMock.createDesktopCloudShare).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: [{ role: 'user', content: 'Start', created_at: '2026-07-30T12:00:00.000Z' }],
      }),
    );
  });

  it('still refuses to publish a conversation with no visible transcript', async () => {
    sharedChatMock.conversations = [{ id: 'conv-cloud-5', title: 'Empty' }];
    sharedChatMock.messagesByConversation = { 'conv-cloud-5': [] };

    const onShare = renderCloudShell();
    await onShare('conv-cloud-5');

    expect(shareMock.createDesktopCloudShare).not.toHaveBeenCalled();
    expect(toastMock.info).toHaveBeenCalledWith('Add a message before sharing this conversation.');
  });

  it('surfaces a share failure instead of reporting a link that was never minted', async () => {
    sharedChatMock.conversations = [{ id: 'conv-cloud-6', title: 'Fails' }];
    sharedChatMock.messagesByConversation = {
      'conv-cloud-6': [
        { id: 'm1', role: 'user', content: 'Hi', createdAt: '2026-07-30T13:00:00.000Z' },
      ],
    };
    shareMock.createDesktopCloudShare.mockRejectedValue(new Error('Share quota exceeded.'));

    const onShare = renderCloudShell();
    await onShare('conv-cloud-6');

    expect(toastMock.success).not.toHaveBeenCalled();
    expect(toastMock.error).toHaveBeenCalledWith('Could not share conversation', {
      description: 'Share quota exceeded.',
    });
  });

  it('does not expose share outside the Managed Cloud boundary', () => {
    useAppModeStore.setState({ mode: 'local' });
    render(<DesktopShellV3 runtime={null} hostBridge={null} />);
    const props = sharedChatMock.chatInterfaceProps.at(-1);
    const actions = props?.['conversationActions'] as { onShare?: unknown } | undefined;
    expect(actions?.onShare).toBeUndefined();
  });
});
