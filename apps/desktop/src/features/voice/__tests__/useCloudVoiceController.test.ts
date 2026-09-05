import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const nativeMock = vi.hoisted(() => ({
  invoke: vi.fn(),
}));

const cloudAuthMock = vi.hoisted(() => ({
  session: null as {
    access_token: string;
    refresh_token: string;
    user: { id: string; email: string };
  } | null,
  getSession: vi.fn(),
  getValidSession: vi.fn(),
  invalidateSession: vi.fn(),
}));

vi.mock('../../../lib/tauri-mock', () => ({
  invoke: nativeMock.invoke,
  isTauri: true,
  isTauriContext: () => true,
}));

vi.mock('../../../lib/egressGuard', () => ({
  guardedFetch: (input: RequestInfo | URL, init?: RequestInit) => fetch(input, init),
}));

vi.mock('../../../services/cloudAccountAuth', () => ({
  cloudAccountAuth: {
    getSession: cloudAuthMock.getSession,
    getValidSession: cloudAuthMock.getValidSession,
    invalidateSession: cloudAuthMock.invalidateSession,
  },
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
import { useVoiceInputStore } from '../../../stores/settingsStore';
import { AUTO_DETECT_LANGUAGE } from '../../../lib/voiceLanguage';
import { useCloudVoiceController } from '../useCloudVoiceController';

const successfulOpaResult = {
  success: true,
  reason: { type: 'task_complete' as const },
};

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
    cloudAuthMock.session = {
      access_token: 'captured-token',
      refresh_token: 'refresh-token',
      user: { id: 'cloud-user', email: 'cloud@agi.local' },
    };
    cloudAuthMock.getSession.mockImplementation(() => cloudAuthMock.session);
    cloudAuthMock.getValidSession.mockImplementation(async () => cloudAuthMock.session);
    cloudAuthMock.invalidateSession.mockResolvedValue(undefined);
    useAppModeStore.setState({ mode: 'cloud' });
    useUnifiedAuthStore.setState({
      user: { id: 'cloud-user', email: 'cloud@agi.local', name: 'Cloud User' },
      isAuthenticated: true,
      plan: 'pro',
      planDisplayName: 'Pro',
      accessToken: 'captured-token',
      refreshToken: 'refresh-token',
      cloudSessionEpoch: 1,
      isLocalDeviceAccount: false,
      sessionValidated: true,
    });
    useComputerUseStore.setState({
      computerUseEnabled: true,
      consentAccepted: true,
      error: null,
      isExecutingOpa: false,
      activeOpaExecutionId: null,
      cancellingOpaExecutionId: null,
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
      if (command === 'computer_use_execute_opa_task') return successfulOpaResult;
      return undefined;
    });
  });

  async function transcriptionLanguage(): Promise<string | null> {
    const { result } = renderHook(() => useCloudVoiceController(true));
    await waitFor(() => expect(result.current.controller.state).toBe('idle'));
    await act(async () => result.current.controller.onToggle());
    await act(async () => result.current.controller.onToggle());
    const call = vi
      .mocked(fetch)
      .mock.calls.find(([url]) => String(url).includes('/api/voice/transcribe'));
    const body = call?.[1]?.body as FormData;
    const language = body.get('language');
    return typeof language === 'string' ? language : null;
  }

  it('sends the chosen dictation language, not a fixed one', async () => {
    act(() => useVoiceInputStore.setState({ voiceLanguage: 'ja' }));
    await expect(transcriptionLanguage()).resolves.toBe('ja');
  });

  it('sends the primary subtag when the setting carries a region', async () => {
    act(() => useVoiceInputStore.setState({ voiceLanguage: 'pt-BR' }));
    await expect(transcriptionLanguage()).resolves.toBe('pt');
  });

  it('omits the language so the provider detects it when none is chosen', async () => {
    act(() => useVoiceInputStore.setState({ voiceLanguage: AUTO_DETECT_LANGUAGE }));
    await expect(transcriptionLanguage()).resolves.toBeNull();
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

  it('never grants standing computer-use consent from voice mode alone', async () => {
    useComputerUseStore.setState({ computerUseEnabled: false, consentAccepted: false });
    const { result } = renderHook(() => useCloudVoiceController(true));

    await waitFor(() => expect(result.current.controller.state).toBe('idle'));
    await act(async () => result.current.controller.onToggle());
    await act(async () => result.current.controller.onToggle());
    await waitFor(() =>
      expect(result.current.pendingAction).toBe('Open Notes and create a launch checklist.'),
    );
    expect(result.current.requiresComputerUseConsent).toBe(true);

    await act(async () => {
      await result.current.approveAction();
    });

    expect(result.current.consentPromptOpen).toBe(true);
    expect(useComputerUseStore.getState().consentAccepted).toBe(false);
    expect(useComputerUseStore.getState().computerUseEnabled).toBe(false);
    expect(
      nativeMock.invoke.mock.calls.some(([command]) => command === 'computer_use_execute_opa_task'),
    ).toBe(false);

    act(() => result.current.dismissComputerUseConsent());

    expect(result.current.consentPromptOpen).toBe(false);
    expect(useComputerUseStore.getState().consentAccepted).toBe(false);
    expect(useComputerUseStore.getState().computerUseEnabled).toBe(false);
    expect(
      nativeMock.invoke.mock.calls.some(([command]) => command === 'computer_use_execute_opa_task'),
    ).toBe(false);
  });

  it('runs a voice action only after the user accepts the computer-use consent dialog', async () => {
    useComputerUseStore.setState({ computerUseEnabled: false, consentAccepted: false });
    const { result } = renderHook(() => useCloudVoiceController(true));

    await waitFor(() => expect(result.current.controller.state).toBe('idle'));
    await act(async () => result.current.controller.onToggle());
    await act(async () => result.current.controller.onToggle());
    await waitFor(() =>
      expect(result.current.pendingAction).toBe('Open Notes and create a launch checklist.'),
    );

    await act(async () => {
      await result.current.approveAction();
    });
    expect(result.current.consentPromptOpen).toBe(true);

    await act(async () => {
      await result.current.acceptComputerUseConsent();
    });

    expect(result.current.consentPromptOpen).toBe(false);
    expect(useComputerUseStore.getState().consentAccepted).toBe(true);
    expect(useComputerUseStore.getState().computerUseEnabled).toBe(true);
    expect(nativeMock.invoke).toHaveBeenCalledWith(
      'computer_use_execute_opa_task',
      expect.objectContaining({
        description: 'Open Notes and create a launch checklist.',
        executionMode: 'cloud_managed',
      }),
    );
    expect(result.current.pendingAction).toBeNull();
  });

  it('does not start recording when the captured account changes during boundary subscription', async () => {
    const { result } = renderHook(() => useCloudVoiceController(true));
    await waitFor(() => expect(result.current.controller.state).toBe('idle'));
    const getUserMedia = vi.mocked(navigator.mediaDevices.getUserMedia);
    const originalSubscribe = useUnifiedAuthStore.subscribe;
    const subscribeSpy = vi.spyOn(useUnifiedAuthStore, 'subscribe').mockImplementation(((
      listener: Parameters<typeof originalSubscribe>[0],
    ) => {
      const unsubscribe = originalSubscribe(listener);
      useUnifiedAuthStore.setState({
        user: { id: 'account-b', email: 'b@agi.local', name: 'Account B' },
        accessToken: 'account-b-token',
        refreshToken: 'account-b-refresh',
        cloudSessionEpoch: 2,
      });
      return unsubscribe;
    }) as typeof originalSubscribe);

    try {
      await act(async () => result.current.controller.onToggle());
    } finally {
      subscribeSpy.mockRestore();
    }

    expect(getUserMedia).not.toHaveBeenCalled();
    expect(result.current.controller.state).toBe('idle');
    expect(result.current.error).toBeNull();
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

  it('aborts a deferred transcription and suppresses its result across account A to B', async () => {
    let resolveUpload!: (response: Response) => void;
    const upload = new Promise<Response>((resolve) => {
      resolveUpload = resolve;
    });
    vi.mocked(fetch).mockImplementation((_input) => {
      if (String(_input).includes('/api/voice/transcribe')) return upload;
      return Promise.resolve(new Response(null, { status: 200 }));
    });
    const { result } = renderHook(() => useCloudVoiceController(true));
    await waitFor(() => expect(result.current.controller.state).toBe('idle'));

    await act(async () => result.current.controller.onToggle());
    let stopPromise!: Promise<void>;
    act(() => {
      stopPromise = Promise.resolve(result.current.controller.onToggle());
    });
    await waitFor(() =>
      expect(
        vi.mocked(fetch).mock.calls.some(([url]) => String(url).includes('/api/voice/transcribe')),
      ).toBe(true),
    );
    const transcriptionCall = vi
      .mocked(fetch)
      .mock.calls.find(([url]) => String(url).includes('/api/voice/transcribe'));
    const signal = transcriptionCall?.[1]?.signal as AbortSignal;

    act(() => {
      cloudAuthMock.session = {
        access_token: 'account-b-token',
        refresh_token: 'account-b-refresh',
        user: { id: 'account-b', email: 'b@agi.local' },
      };
      useUnifiedAuthStore.setState({
        user: { id: 'account-b', email: 'b@agi.local', name: 'Account B' },
        accessToken: 'account-b-token',
        refreshToken: 'account-b-refresh',
        cloudSessionEpoch: 2,
      });
    });

    expect(signal.aborted).toBe(true);
    expect(result.current.controller.state).toBe('idle');
    resolveUpload(Response.json({ text: 'stale account A instruction' }));
    await act(async () => stopPromise);
    expect(result.current.pendingAction).toBeNull();
    expect(result.current.error).toBeNull();
    expect(useSharedChatStore.getState().draftContent).toBe('');
    expect(nativeMock.invoke.mock.calls.some(([command]) => command === 'llm_send_message')).toBe(
      false,
    );
  });

  it('aborts a deferred transcription and suppresses its result when switching to Local', async () => {
    let resolveUpload!: (response: Response) => void;
    const upload = new Promise<Response>((resolve) => {
      resolveUpload = resolve;
    });
    vi.mocked(fetch).mockImplementation((_input) => {
      if (String(_input).includes('/api/voice/transcribe')) return upload;
      return Promise.resolve(new Response(null, { status: 200 }));
    });
    const { result } = renderHook(() => useCloudVoiceController(true));
    await waitFor(() => expect(result.current.controller.state).toBe('idle'));

    await act(async () => result.current.controller.onToggle());
    let stopPromise!: Promise<void>;
    act(() => {
      stopPromise = Promise.resolve(result.current.controller.onToggle());
    });
    await waitFor(() =>
      expect(
        vi.mocked(fetch).mock.calls.some(([url]) => String(url).includes('/api/voice/transcribe')),
      ).toBe(true),
    );
    const transcriptionCall = vi
      .mocked(fetch)
      .mock.calls.find(([url]) => String(url).includes('/api/voice/transcribe'));
    const signal = transcriptionCall?.[1]?.signal as AbortSignal;

    act(() => useAppModeStore.setState({ mode: 'local' }));

    expect(signal.aborted).toBe(true);
    expect(result.current.controller.state).toBe('idle');
    resolveUpload(Response.json({ text: 'stale cloud instruction' }));
    await act(async () => stopPromise);
    expect(result.current.pendingAction).toBeNull();
    expect(result.current.error).toBeNull();
    expect(useSharedChatStore.getState().draftContent).toBe('');
    expect(nativeMock.invoke.mock.calls.some(([command]) => command === 'llm_send_message')).toBe(
      false,
    );
  });

  it('cancels an approved native action across account A to B and suppresses its late result', async () => {
    let resolveExecution!: (result: typeof successfulOpaResult) => void;
    const deferredExecution = new Promise<typeof successfulOpaResult>((resolve) => {
      resolveExecution = resolve;
    });
    nativeMock.invoke.mockImplementation(async (command: string) => {
      if (command === 'voice_check_local_whisper') return false;
      if (command === 'llm_send_message') {
        return { content: '{"mode":"action","text":"Open Notes."}' };
      }
      if (command === 'computer_use_execute_opa_task') return deferredExecution;
      if (command === 'computer_use_cancel_opa_task') return true;
      return undefined;
    });
    const { result } = renderHook(() => useCloudVoiceController(true));
    await waitFor(() => expect(result.current.controller.state).toBe('idle'));
    await act(async () => result.current.controller.onToggle());
    await act(async () => result.current.controller.onToggle());
    await waitFor(() => expect(result.current.pendingAction).toBe('Open Notes.'));

    let approval!: Promise<void>;
    act(() => {
      approval = result.current.approveAction();
    });
    await waitFor(() => expect(result.current.controller.state).toBe('executing'));
    const executionCall = nativeMock.invoke.mock.calls.find(
      ([command]) => command === 'computer_use_execute_opa_task',
    );
    const executionId = executionCall?.[1]?.executionId as string;

    act(() => {
      cloudAuthMock.session = {
        access_token: 'account-b-token',
        refresh_token: 'account-b-refresh',
        user: { id: 'account-b', email: 'b@agi.local' },
      };
      useUnifiedAuthStore.setState({
        user: { id: 'account-b', email: 'b@agi.local', name: 'Account B' },
        accessToken: 'account-b-token',
        refreshToken: 'account-b-refresh',
        cloudSessionEpoch: 2,
      });
    });

    await waitFor(() =>
      expect(nativeMock.invoke).toHaveBeenCalledWith('computer_use_cancel_opa_task', {
        executionId,
      }),
    );
    expect(result.current.controller.state).toBe('idle');
    expect(result.current.pendingAction).toBeNull();

    resolveExecution(successfulOpaResult);
    await act(async () => approval);
    expect(result.current.controller.state).toBe('idle');
    expect(result.current.pendingAction).toBeNull();
    expect(useComputerUseStore.getState().lastOpaResult).toBeNull();
  });

  it('retains an account-safe Stop recovery after an account boundary cancellation is not acknowledged', async () => {
    const deferredExecution = new Promise<typeof successfulOpaResult>(() => {});
    let stopAttempts = 0;
    nativeMock.invoke.mockImplementation(async (command: string) => {
      if (command === 'voice_check_local_whisper') return false;
      if (command === 'llm_send_message') {
        return { content: '{"mode":"action","text":"Open private account A data."}' };
      }
      if (command === 'computer_use_execute_opa_task') return deferredExecution;
      if (command === 'computer_use_cancel_opa_task') {
        stopAttempts += 1;
        return stopAttempts > 1;
      }
      return undefined;
    });
    const { result } = renderHook(() => useCloudVoiceController(true));
    await waitFor(() => expect(result.current.controller.state).toBe('idle'));
    await act(async () => result.current.controller.onToggle());
    await act(async () => result.current.controller.onToggle());
    await waitFor(() => expect(result.current.pendingAction).toContain('account A'));
    act(() => {
      void result.current.approveAction();
    });
    await waitFor(() => expect(result.current.controller.state).toBe('executing'));

    act(() => {
      cloudAuthMock.session = {
        access_token: 'account-b-token',
        refresh_token: 'account-b-refresh',
        user: { id: 'account-b', email: 'b@agi.local' },
      };
      useUnifiedAuthStore.setState({
        user: { id: 'account-b', email: 'b@agi.local', name: 'Account B' },
        accessToken: 'account-b-token',
        refreshToken: 'account-b-refresh',
        cloudSessionEpoch: 2,
      });
    });

    await waitFor(() =>
      expect(useComputerUseStore.getState().error).toContain('did not acknowledge'),
    );
    expect(result.current.pendingAction).toBeNull();
    expect(result.current.isDesktopActionActive).toBe(true);
    expect(result.current.error).not.toContain('private account A data');

    const mediaCalls = vi.mocked(navigator.mediaDevices.getUserMedia).mock.calls.length;
    await act(async () => result.current.controller.onToggle());
    expect(result.current.controller.state).toBe('error');
    expect(vi.mocked(navigator.mediaDevices.getUserMedia)).toHaveBeenCalledTimes(mediaCalls);

    await act(async () => result.current.cancelAction());
    expect(stopAttempts).toBe(2);
    expect(result.current.isDesktopActionActive).toBe(false);
    expect(result.current.controller.state).toBe('idle');
  });

  it('cancels an approved native action when Cloud mode is disabled', async () => {
    const deferredExecution = new Promise<{ success: boolean }>(() => {});
    nativeMock.invoke.mockImplementation(async (command: string) => {
      if (command === 'voice_check_local_whisper') return false;
      if (command === 'llm_send_message') {
        return { content: '{"mode":"action","text":"Open Calendar."}' };
      }
      if (command === 'computer_use_execute_opa_task') return deferredExecution;
      if (command === 'computer_use_cancel_opa_task') return true;
      return undefined;
    });
    const { result, rerender } = renderHook(({ enabled }) => useCloudVoiceController(enabled), {
      initialProps: { enabled: true },
    });
    await waitFor(() => expect(result.current.controller.state).toBe('idle'));
    await act(async () => result.current.controller.onToggle());
    await act(async () => result.current.controller.onToggle());
    await waitFor(() => expect(result.current.pendingAction).toBe('Open Calendar.'));
    act(() => {
      void result.current.approveAction();
    });
    await waitFor(() => expect(result.current.controller.state).toBe('executing'));
    const executionCall = nativeMock.invoke.mock.calls.find(
      ([command]) => command === 'computer_use_execute_opa_task',
    );

    rerender({ enabled: false });

    await waitFor(() =>
      expect(nativeMock.invoke).toHaveBeenCalledWith('computer_use_cancel_opa_task', {
        executionId: executionCall?.[1]?.executionId,
      }),
    );
    expect(result.current.controller.state).toBe('idle');
    expect(result.current.pendingAction).toBeNull();
  });

  it('cancels the exact approved native action on unmount', async () => {
    const deferredExecution = new Promise<{ success: boolean }>(() => {});
    nativeMock.invoke.mockImplementation(async (command: string) => {
      if (command === 'voice_check_local_whisper') return false;
      if (command === 'llm_send_message') {
        return { content: '{"mode":"action","text":"Open Reminders."}' };
      }
      if (command === 'computer_use_execute_opa_task') return deferredExecution;
      if (command === 'computer_use_cancel_opa_task') return true;
      return undefined;
    });
    const { result, unmount } = renderHook(() => useCloudVoiceController(true));
    await waitFor(() => expect(result.current.controller.state).toBe('idle'));
    await act(async () => result.current.controller.onToggle());
    await act(async () => result.current.controller.onToggle());
    await waitFor(() => expect(result.current.pendingAction).toBe('Open Reminders.'));
    act(() => {
      void result.current.approveAction();
    });
    await waitFor(() => expect(result.current.controller.state).toBe('executing'));
    const executionCall = nativeMock.invoke.mock.calls.find(
      ([command]) => command === 'computer_use_execute_opa_task',
    );

    unmount();

    await waitFor(() =>
      expect(nativeMock.invoke).toHaveBeenCalledWith('computer_use_cancel_opa_task', {
        executionId: executionCall?.[1]?.executionId,
      }),
    );
  });

  it('recovers an unacknowledged unmount Stop from a newly mounted controller', async () => {
    const deferredExecution = new Promise<typeof successfulOpaResult>(() => {});
    let stopAttempts = 0;
    nativeMock.invoke.mockImplementation(async (command: string) => {
      if (command === 'voice_check_local_whisper') return false;
      if (command === 'llm_send_message') {
        return { content: '{"mode":"action","text":"Open Reminders."}' };
      }
      if (command === 'computer_use_execute_opa_task') return deferredExecution;
      if (command === 'computer_use_cancel_opa_task') {
        stopAttempts += 1;
        return stopAttempts > 1;
      }
      return undefined;
    });
    const first = renderHook(() => useCloudVoiceController(true));
    await waitFor(() => expect(first.result.current.controller.state).toBe('idle'));
    await act(async () => first.result.current.controller.onToggle());
    await act(async () => first.result.current.controller.onToggle());
    await waitFor(() => expect(first.result.current.pendingAction).toBe('Open Reminders.'));
    act(() => {
      void first.result.current.approveAction();
    });
    await waitFor(() => expect(first.result.current.controller.state).toBe('executing'));

    first.unmount();
    await waitFor(() =>
      expect(useComputerUseStore.getState().cancellingOpaExecutionId).not.toBeNull(),
    );
    expect(stopAttempts).toBe(1);

    const replacement = renderHook(() => useCloudVoiceController(true));
    await waitFor(() => expect(replacement.result.current.isDesktopActionActive).toBe(true));
    expect(replacement.result.current.pendingAction).toBeNull();
    await act(async () => replacement.result.current.cancelAction());
    expect(stopAttempts).toBe(2);
    expect(replacement.result.current.isDesktopActionActive).toBe(false);
    replacement.unmount();
  });

  it('lets the user stop an approved native action while it is executing', async () => {
    const deferredExecution = new Promise<typeof successfulOpaResult>(() => {});
    let acknowledgeStop!: (stopped: boolean) => void;
    const stopAcknowledgement = new Promise<boolean>((resolve) => {
      acknowledgeStop = resolve;
    });
    nativeMock.invoke.mockImplementation(async (command: string) => {
      if (command === 'voice_check_local_whisper') return false;
      if (command === 'llm_send_message') {
        return { content: '{"mode":"action","text":"Open Settings."}' };
      }
      if (command === 'computer_use_execute_opa_task') return deferredExecution;
      if (command === 'computer_use_cancel_opa_task') return stopAcknowledgement;
      return undefined;
    });
    const { result } = renderHook(() => useCloudVoiceController(true));
    await waitFor(() => expect(result.current.controller.state).toBe('idle'));
    await act(async () => result.current.controller.onToggle());
    await act(async () => result.current.controller.onToggle());
    await waitFor(() => expect(result.current.pendingAction).toBe('Open Settings.'));
    act(() => {
      void result.current.approveAction();
    });
    await waitFor(() => expect(result.current.controller.state).toBe('executing'));
    const executionCall = nativeMock.invoke.mock.calls.find(
      ([command]) => command === 'computer_use_execute_opa_task',
    );

    let stopping!: Promise<void>;
    act(() => {
      stopping = result.current.cancelAction();
    });

    await waitFor(() =>
      expect(nativeMock.invoke).toHaveBeenCalledWith('computer_use_cancel_opa_task', {
        executionId: executionCall?.[1]?.executionId,
      }),
    );
    expect(result.current.controller.state).toBe('stopping');
    expect(result.current.isStopping).toBe(true);
    expect(result.current.pendingAction).toBe('Open Settings.');

    acknowledgeStop(true);
    await act(async () => stopping);
    expect(result.current.controller.state).toBe('idle');
    expect(result.current.pendingAction).toBeNull();
  });

  it('retains the exact execution owner so an unacknowledged Stop can be retried', async () => {
    const deferredExecution = new Promise<typeof successfulOpaResult>(() => {});
    let stopAttempts = 0;
    nativeMock.invoke.mockImplementation(async (command: string) => {
      if (command === 'voice_check_local_whisper') return false;
      if (command === 'llm_send_message') {
        return { content: '{"mode":"action","text":"Open Settings."}' };
      }
      if (command === 'computer_use_execute_opa_task') return deferredExecution;
      if (command === 'computer_use_cancel_opa_task') {
        stopAttempts += 1;
        return stopAttempts > 1;
      }
      return undefined;
    });
    const { result } = renderHook(() => useCloudVoiceController(true));
    await waitFor(() => expect(result.current.controller.state).toBe('idle'));
    await act(async () => result.current.controller.onToggle());
    await act(async () => result.current.controller.onToggle());
    await waitFor(() => expect(result.current.pendingAction).toBe('Open Settings.'));
    act(() => {
      void result.current.approveAction();
    });
    await waitFor(() => expect(result.current.controller.state).toBe('executing'));

    await act(async () => result.current.cancelAction());
    expect(result.current.controller.state).toBe('error');
    expect(result.current.error).toContain('did not acknowledge cancellation');
    expect(result.current.pendingAction).toBe('Open Settings.');
    expect(result.current.isDesktopActionActive).toBe(true);

    await act(async () => result.current.cancelAction());
    expect(stopAttempts).toBe(2);
    expect(result.current.controller.state).toBe('idle');
    expect(result.current.pendingAction).toBeNull();
    expect(result.current.isDesktopActionActive).toBe(false);
  });

  it('renders the tagged native safety reason as a useful message', async () => {
    nativeMock.invoke.mockImplementation(async (command: string) => {
      if (command === 'voice_check_local_whisper') return false;
      if (command === 'llm_send_message') {
        return { content: '{"mode":"action","text":"Open the password pane."}' };
      }
      if (command === 'computer_use_execute_opa_task') {
        return {
          success: false,
          reason: { type: 'safety_blocked', reason: 'Password entry requires approval.' },
        };
      }
      return undefined;
    });
    const { result } = renderHook(() => useCloudVoiceController(true));
    await waitFor(() => expect(result.current.controller.state).toBe('idle'));
    await act(async () => result.current.controller.onToggle());
    await act(async () => result.current.controller.onToggle());
    await waitFor(() => expect(result.current.pendingAction).toBe('Open the password pane.'));

    await act(async () => result.current.approveAction());

    expect(result.current.controller.state).toBe('error');
    expect(result.current.error).toContain(
      'blocked by a safety check: Password entry requires approval.',
    );
    expect(result.current.error).not.toContain('[object Object]');
  });
});
