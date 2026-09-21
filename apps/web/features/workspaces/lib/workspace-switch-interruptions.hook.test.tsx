import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { VOICE_SESSION_EVENT } from '@agiworkforce/unified-chat';
import { useChatStore } from '@shared/stores/web-chat-store';
import { useToolStore } from '@shared/stores/tool-store';
import { useStreamingArtifactStore } from '@features/chat/stores/streaming-artifact-store';
import { useVoiceSessionStore } from '@features/chat/stores/voice-session-store';
import { useActiveUploadStore } from './active-uploads';
import { useWorkspaceSwitchInterruptions } from './workspace-switch-interruptions';

function kinds() {
  return renderHook(() => useWorkspaceSwitchInterruptions()).result.current.map(
    (interruption) => interruption.kind,
  );
}

afterEach(() => {
  useChatStore.setState({ draftsByConversation: {}, draftContent: '', isStreaming: false });
  useToolStore.setState({ pendingApprovals: [], actionLog: [] });
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
    useToolStore.setState({
      pendingApprovals: [
        {
          id: 'approval-1',
          type: 'terminal_command',
          description: 'Run the build',
          riskLevel: 'low',
          details: {},
          status: 'approved',
          createdAt: new Date(0),
        },
      ],
    });
    expect(kinds()).toEqual([]);

    useToolStore.setState({
      pendingApprovals: [
        {
          id: 'approval-2',
          type: 'terminal_command',
          description: 'Run the build',
          riskLevel: 'low',
          details: {},
          status: 'pending',
          createdAt: new Date(0),
        },
      ],
    });
    expect(kinds()).toContain('approval');
  });

  it('reads a browser action that is still running, and not one that finished', () => {
    const entry = {
      id: 'action-1',
      type: 'browser' as const,
      title: 'Open the dashboard',
      createdAt: new Date(0),
      updatedAt: new Date(0),
    };
    useToolStore.setState({ actionLog: [{ ...entry, status: 'success' }] });
    expect(kinds()).toEqual([]);

    useToolStore.setState({ actionLog: [{ ...entry, status: 'running' }] });
    expect(kinds()).toContain('computer-control');
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
