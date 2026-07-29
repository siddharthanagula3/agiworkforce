import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const nativeMock = vi.hoisted(() => ({
  invoke: vi.fn(),
}));

vi.mock('../../../lib/tauri-mock', () => ({
  invoke: nativeMock.invoke,
  isTauri: true,
  isTauriContext: () => true,
}));

vi.mock('../../../lib/egressGuard', () => ({
  guardedFetch: (input: RequestInfo | URL, init?: RequestInit) => fetch(input, init),
}));

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    info: vi.fn(),
    success: vi.fn(),
  },
}));

import { useAppModeStore } from '../../../stores/appModeStore';
import { useUnifiedAuthStore } from '../../../stores/auth';
import { useComputerUseStore } from '../../../stores/computerUseStore';
import { useChatStore as useSharedChatStore } from '@agiworkforce/unified-chat';
import { useCloudVoiceController } from '../useCloudVoiceController';

class MockMediaRecorder {
  static isTypeSupported() {
    return true;
  }

  mimeType = 'audio/webm';
  state: RecordingState = 'inactive';
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  onstop: (() => void) | null = null;

  constructor(public stream: MediaStream) {}

  start() {
    this.state = 'recording';
    this.ondataavailable?.({
      data: new Blob(['audio-bytes'], { type: 'audio/webm' }),
    });
  }

  stop() {
    this.state = 'inactive';
    this.onstop?.();
  }
}

describe('useCloudVoiceController', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    useAppModeStore.setState({ mode: 'cloud' });
    useUnifiedAuthStore.setState({
      user: { id: 'cloud-user', email: 'cloud@agi.local', name: 'Cloud User' },
      isAuthenticated: true,
      plan: 'pro',
      planDisplayName: 'Pro',
      accessToken: 'captured-token',
      refreshToken: 'refresh-token',
    });
    useComputerUseStore.setState({
      computerUseEnabled: false,
      consentAccepted: false,
      error: null,
      isExecutingOpa: false,
      lastOpaResult: null,
    });
    useSharedChatStore.setState({
      activeConversationId: null,
      draftContent: '',
      draftsByConversation: {},
    });

    Object.defineProperty(window, 'MediaRecorder', {
      value: MockMediaRecorder,
      configurable: true,
    });
    Object.defineProperty(navigator, 'mediaDevices', {
      value: {
        getUserMedia: vi.fn().mockResolvedValue({
          getTracks: () => [{ stop: vi.fn() }],
        }),
      },
      configurable: true,
    });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ text: 'open notes and make a launch checklist' }),
      }),
    );
    nativeMock.invoke.mockImplementation(async (command: string) => {
      if (command === 'voice_check_local_whisper') return false;
      if (command === 'llm_send_message') {
        return {
          content: '{"mode":"action","text":"Open Notes and create a launch checklist."}',
        };
      }
      if (command === 'computer_use_execute_opa_task') return { success: true };
      return undefined;
    });
  });

  it('previews a classified action and dispatches it only after approval', async () => {
    const { result } = renderHook(() => useCloudVoiceController(true));

    await waitFor(() => expect(result.current.controller.state).toBe('idle'));
    await act(async () => {
      await result.current.controller.onToggle();
    });
    expect(result.current.controller.state).toBe('listening');

    await act(async () => {
      await result.current.controller.onToggle();
    });
    await waitFor(() =>
      expect(result.current.pendingAction).toBe('Open Notes and create a launch checklist.'),
    );
    expect(
      nativeMock.invoke.mock.calls.some(([command]) => command === 'computer_use_execute_opa_task'),
    ).toBe(false);

    await act(async () => {
      await result.current.approveAction();
    });

    expect(nativeMock.invoke).toHaveBeenCalledWith(
      'computer_use_execute_opa_task',
      expect.objectContaining({
        description: 'Open Notes and create a launch checklist.',
        executionMode: 'cloud_managed',
      }),
    );
    expect(result.current.pendingAction).toBeNull();
  });

  it('does not configure or expose managed capture while Desktop is Local', async () => {
    useAppModeStore.setState({ mode: 'local' });

    const { result } = renderHook(() => useCloudVoiceController(false));
    await waitFor(() => expect(result.current.controller.state).toBe('idle'));

    expect(nativeMock.invoke.mock.calls.some(([command]) => command === 'voice_configure')).toBe(
      false,
    );
  });

  it('inserts polished dictation into the existing composer draft', async () => {
    useSharedChatStore.getState().setDraftContent('Existing draft');
    nativeMock.invoke.mockImplementation(async (command: string) => {
      if (command === 'voice_check_local_whisper') return false;
      if (command === 'llm_send_message') {
        return {
          content: '{"mode":"dictation","text":"Add the polished launch note."}',
        };
      }
      return undefined;
    });
    const { result } = renderHook(() => useCloudVoiceController(true));
    await waitFor(() => expect(result.current.controller.state).toBe('idle'));

    await act(async () => {
      await result.current.controller.onToggle();
    });
    await act(async () => {
      await result.current.controller.onToggle();
    });

    await waitFor(() =>
      expect(useSharedChatStore.getState().draftContent).toBe(
        'Existing draft Add the polished launch note.',
      ),
    );
  });
});
