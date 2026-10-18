import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ComputerUseStatus } from '@agiworkforce/local-runtime-contract';
import { VOICE_SESSION_EVENT } from '@agiworkforce/unified-chat';
import { useChatStore, type Message } from '@shared/stores/web-chat-store';
import { useStreamingArtifactStore } from '@features/chat/stores/streaming-artifact-store';
import { useVoiceSessionStore } from '@features/chat/stores/voice-session-store';
import { useActiveUploadStore } from './active-uploads';
import { useWorkspaceSwitchInterruptions } from './workspace-switch-interruptions';
type HostModule = typeof import('@/features/desktop-host/lib/host');
type RuntimeClientModule = typeof import('@/features/desktop-host/lib/runtime-client');

const computerUse = vi.hoisted(() => ({
  host: null as unknown,
  status: null as ComputerUseStatus | null,
  listeners: new Set<(status: ComputerUseStatus) => void>(),
}));

vi.mock('@/features/desktop-host/lib/host', async (importOriginal) => ({
  ...(await importOriginal<HostModule>()),
  useElectronHost: () => computerUse.host,
}));

vi.mock('@/features/desktop-host/lib/runtime-client', async (importOriginal) => ({
  ...(await importOriginal<RuntimeClientModule>()),
  readComputerUse: async () => {
    if (!computerUse.status) throw new Error('no status');
    return computerUse.status;
  },
  onComputerUseChanged: (listener: (status: ComputerUseStatus) => void) => {
    computerUse.listeners.add(listener);
    return () => computerUse.listeners.delete(listener);
  },
}));

function computerUseStatus(phase: ComputerUseStatus['phase']): ComputerUseStatus {
  return {
    enabled: true,
    available: true,
    unavailableReason: null,
    grant: 'granted',
    phase,
    pausedBy: null,
    stopShortcut: 'Escape',
    system: { accessibility: 'granted', screenRecording: 'granted' },
  };
}

function assistantWithTool(status: 'awaiting_approval' | 'completed'): Message {
  return {
    id: `message-${status}`,
    role: 'assistant',
    content: '',
    createdAt: new Date(0).toISOString(),
    metadata: { tools: [{ id: 'tool-1', name: 'run_build', status }] },
  };
}

function kinds() {
  return renderHook(() => useWorkspaceSwitchInterruptions()).result.current.map(
    (interruption) => interruption.kind,
  );
}

beforeEach(() => {
  computerUse.host = null;
  computerUse.status = null;
  computerUse.listeners.clear();
});

afterEach(() => {
  useChatStore.setState({
    draftsByConversation: {},
    draftContent: '',
    isStreaming: false,
    messagesByConversation: {},
  });
  useStreamingArtifactStore.setState({ streaming: null });
  useActiveUploadStore.setState({ uploads: [] });
  useVoiceSessionStore.getState().dispatch({ type: VOICE_SESSION_EVENT.exit });
});

describe('useWorkspaceSwitchInterruptions', () => {
  it('reports nothing on an idle account', () => {
    expect(kinds()).toEqual([]);
  });

  it('reads an unsent draft out of the conversation the user typed it in', () => {
    useChatStore.setState({ draftsByConversation: { 'conv-1': 'half a question' } });

    expect(kinds()).toContain('draft');
  });

  it('ignores whitespace left in a composer', () => {
    useChatStore.setState({ draftsByConversation: { 'conv-1': '   \n ' } });

    expect(kinds()).toEqual([]);
  });

  it('reads a reply still being streamed', () => {
    useChatStore.setState({ isStreaming: true });

    expect(kinds()).toContain('reply');
  });

  it('reads an upload started by a panel elsewhere in the app', () => {
    useActiveUploadStore.setState({ uploads: [{ id: 'upload-1', label: 'notes.pdf' }] });

    expect(kinds()).toContain('upload');
  });

  it('reads a tool waiting on the user, and not one already answered', () => {
    useChatStore.setState({
      messagesByConversation: { 'conv-1': [assistantWithTool('completed')] },
    });
    expect(kinds()).toEqual([]);

    useChatStore.setState({
      messagesByConversation: { 'conv-1': [assistantWithTool('awaiting_approval')] },
    });
    expect(kinds()).toContain('approval');
  });

  it('reads the desktop app driving the computer, and not an idle one', async () => {
    computerUse.host = { shell: 'electron' };
    computerUse.status = computerUseStatus('idle');
    const { result } = renderHook(() => useWorkspaceSwitchInterruptions());
    await waitFor(() => expect(computerUse.listeners.size).toBe(1));
    expect(result.current.map((interruption) => interruption.kind)).not.toContain(
      'computer-control',
    );

    act(() => {
      for (const listener of computerUse.listeners) listener(computerUseStatus('active'));
    });
    expect(result.current.map((interruption) => interruption.kind)).toContain('computer-control');
  });

  it('reads an artifact that is still being written', () => {
    useStreamingArtifactStore.setState({
      streaming: {
        artifactId: 'artifact-1',
        messageId: 'message-1',
        type: 'code',
        language: 'ts',
        title: 'draft.ts',
        content: 'export {}',
      },
    });

    expect(kinds()).toContain('artifact');
  });

  it('reads a live voice session', () => {
    useVoiceSessionStore.getState().dispatch({ type: VOICE_SESSION_EVENT.enter });

    expect(kinds()).toContain('voice');
  });
});
