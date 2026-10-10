import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import { VISUAL_SOURCE_MESSAGE } from '@agiworkforce/types';

import {
  VOICE_SESSION_EVENT,
  VOICE_SESSION_STATUS,
  INITIAL_VOICE_SESSION_STATE,
} from '@agiworkforce/unified-chat';
import { LIVE_SESSION_MESSAGE } from '@features/chat/lib/live-voice-session';
import { useVoiceSessionStore } from '@features/chat/stores/voice-session-store';
type ScanModule0 = typeof import('@/lib/visual/use-visual-session');

const controller = vi.hoisted(() => ({ current: {} as Record<string, unknown> }));
const visual = vi.hoisted(() => ({
  current: null as ReturnType<
    typeof import('@/lib/visual/use-visual-session').useVisualSession
  > | null,
}));

vi.mock('@features/chat/hooks/use-voice-session', () => ({
  liveVoiceOutputRef: { current: null },
  useVoiceSession: () => controller.current,
}));
vi.mock('@/lib/visual/use-visual-session', async (importOriginal) => {
  const actual = await importOriginal<ScanModule0>();
  return {
    ...actual,
    useVisualSession: (options: Parameters<typeof actual.useVisualSession>[0]) =>
      visual.current ?? actual.useVisualSession(options),
  };
});
vi.mock('./VoiceOrb', () => ({
  VoiceOrbPreview: () => null,
  VoiceOrb: () => <div data-testid="voice-orb" />,
}));
vi.mock('./VoiceComposer', () => ({ VoiceComposer: () => <div data-testid="voice-composer" /> }));
vi.mock('./VoiceChatDock', () => ({ VoiceChatDock: () => null }));
vi.mock('./VoiceSettingsModal', () => ({ VoiceSettingsModal: () => null }));

import { VoiceModeSurface, VOICE_SURFACE_VARIANT } from './VoiceModeSurface';

function session(overrides: Record<string, unknown> = {}) {
  return {
    state: INITIAL_VOICE_SESSION_STATE,
    active: true,
    reducedMotion: false,
    deviceName: 'Built-in Microphone',
    backendBusy: false,
    toolApprovals: [],
    toolActivity: [],
    toolOutcomes: [],
    audioLevel: { current: 0 },
    pause: vi.fn(),
    resume: vi.fn(),
    paused: false,
    rejoinOffer: null,
    answerRejoin: vi.fn(),
    decideToolApproval: vi.fn(),
    reconnecting: false,
    reconnectAttempt: 0,
    reconnectMaxAttempts: 3,
    mutedHint: 'Muted, tap the mic to talk',
    enter: vi.fn(),
    exit: vi.fn(),
    toggleMute: vi.fn(),
    cancelPending: vi.fn(),
    submitTyped: vi.fn(),
    retry: vi.fn(),
    ...overrides,
  };
}

function renderSurface(overrides: Partial<Record<string, unknown>> = {}) {
  return render(
    <VoiceModeSurface
      variant={VOICE_SURFACE_VARIANT.chat}
      turnActive={false}
      conversationId={null}
      onSend={() => true}
      onEnsureConversation={async () => null}
      onTranscript={() => undefined}
      onNewChat={() => undefined}
      onOpenLibrary={() => undefined}
      onOpenConnectors={() => undefined}
      onIntelligenceChange={() => undefined}
      {...overrides}
    />,
  );
}

function sharingCamera(overrides: { stop: () => void }) {
  return {
    status: {
      source: 'camera' as const,
      state: 'active' as const,
      sampledFrames: 3,
      droppedFrames: 0,
      startedAtMs: 0,
      lastFrameAtMs: 0,
      error: null,
    },
    capturing: true,
    frames: [],
    latestFrame: null,
    mediaStream: null,
    start: vi.fn(async () => undefined),
    pause: vi.fn(),
    resume: vi.fn(),
    ...overrides,
  };
}

beforeEach(() => {
  controller.current = session();
  visual.current = null;
});

afterEach(() => {
  cleanup();
});

describe('VoiceModeSurface utterance in flight', () => {
  it('shows what is about to be sent and lets the speaker take it back', async () => {
    const cancelPending = vi.fn();
    controller.current = session({
      state: {
        ...INITIAL_VOICE_SESSION_STATE,
        status: VOICE_SESSION_STATUS.listening,
        pendingUtterance: 'Book the flight for Tuesday',
      },
      cancelPending,
    });

    renderSurface();

    expect(screen.getByTestId('voice-sending-chip').textContent).toContain(
      'Book the flight for Tuesday',
    );
    await act(async () => {
      screen.getByRole('button', { name: /do not send that/i }).click();
    });
    expect(cancelPending).toHaveBeenCalledTimes(1);
  });

  it('shows no cancel control when nothing is waiting to be sent', () => {
    controller.current = session({
      state: { ...INITIAL_VOICE_SESSION_STATE, status: VOICE_SESSION_STATUS.listening },
    });

    renderSurface();

    expect(screen.queryByTestId('voice-sending-chip')).toBeNull();
    expect(screen.queryByRole('button', { name: /do not send that/i })).toBeNull();
  });
});

describe('VoiceModeSurface reconnect state', () => {
  it('announces the reconnect attempt instead of the error and its manual retry', () => {
    controller.current = session({
      reconnecting: true,
      reconnectAttempt: 2,
      state: {
        ...INITIAL_VOICE_SESSION_STATE,
        status: VOICE_SESSION_STATUS.error,
        error: LIVE_SESSION_MESSAGE.connectionDropped,
      },
    });
    renderSurface();

    const notice = screen.getByTestId('voice-reconnecting');
    expect(notice.getAttribute('role')).toBe('status');
    expect(notice.textContent).toContain('2 of 3');
    expect(screen.queryByTestId('voice-error')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
  });

  it('falls back to the error and a manual retry once reconnection is spent', () => {
    controller.current = session({
      state: {
        ...INITIAL_VOICE_SESSION_STATE,
        status: VOICE_SESSION_STATUS.error,
        error: LIVE_SESSION_MESSAGE.reconnectFailed,
      },
    });
    renderSurface();

    expect(screen.queryByTestId('voice-reconnecting')).toBeNull();
    expect(screen.getByTestId('voice-error').textContent).toContain(
      LIVE_SESSION_MESSAGE.reconnectFailed,
    );
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
  });
});

describe('VoiceModeSurface orb layout', () => {
  afterEach(() => {
    useVoiceSessionStore.setState({ focusMode: false });
  });

  it('keeps the focused orb in its own slot above the error row and composer', () => {
    useVoiceSessionStore.setState({ focusMode: true });
    controller.current = session({
      state: {
        ...INITIAL_VOICE_SESSION_STATE,
        status: VOICE_SESSION_STATUS.error,
        error: LIVE_SESSION_MESSAGE.reconnectFailed,
      },
    });
    renderSurface({ variant: VOICE_SURFACE_VARIANT.empty });

    const slot = screen.getByTestId('voice-orb-slot');
    expect(slot.className).not.toMatch(/\bfixed\b/);
    expect(slot.className).not.toMatch(/\binset-0\b/);
    expect(slot.contains(screen.getByTestId('voice-orb'))).toBe(true);
    const order = (node: Node) =>
      slot.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_FOLLOWING;
    expect(order(screen.getByTestId('voice-error'))).toBeTruthy();
    expect(order(screen.getByTestId('voice-composer'))).toBeTruthy();
  });
});

describe('VoiceModeSurface call notices', () => {
  afterEach(() => {
    useVoiceSessionStore.setState({ playbackBlocked: false, providerNotice: null });
  });

  it('offers a tap to hear the assistant when the browser blocked its audio', async () => {
    const resumePlayback = vi.fn();
    useVoiceSessionStore.setState({ playbackBlocked: true });
    controller.current = session({
      state: { ...INITIAL_VOICE_SESSION_STATE, status: VOICE_SESSION_STATUS.listening },
      resumePlayback,
    });
    renderSurface();

    await act(async () => {
      screen.getByRole('button', { name: 'Tap to hear the assistant' }).click();
    });
    expect(resumePlayback).toHaveBeenCalledTimes(1);
  });

  it('shows a provider error as a plain notice while the call keeps running', () => {
    useVoiceSessionStore.setState({ providerNotice: LIVE_SESSION_MESSAGE.providerError });
    controller.current = session({
      state: { ...INITIAL_VOICE_SESSION_STATE, status: VOICE_SESSION_STATUS.listening },
    });
    renderSurface();

    expect(screen.getByTestId('voice-provider-notice').textContent).toBe(
      LIVE_SESSION_MESSAGE.providerError,
    );
    expect(screen.queryByTestId('voice-error')).toBeNull();
  });
});

describe('VoiceModeSurface usage limit', () => {
  afterEach(() => {
    useVoiceSessionStore.setState({ usageLimited: false });
  });

  it('presents a usage limit as a limit with a way back to text, not as a broken voice mode', async () => {
    const exit = vi.fn();
    const message = "Voice needs usage your plan doesn't include.";
    useVoiceSessionStore.setState({ usageLimited: true });
    controller.current = session({
      state: { ...INITIAL_VOICE_SESSION_STATE, status: VOICE_SESSION_STATUS.error, error: message },
      exit,
    });
    renderSurface();

    expect(screen.getByTestId('voice-usage-limit').textContent).toContain(message);
    expect(screen.queryByTestId('voice-error')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
    await act(async () => {
      screen.getByRole('button', { name: 'Continue in text' }).click();
    });
    expect(exit).toHaveBeenCalledTimes(1);
  });

  it('forgets the usage limit once the session leaves the error state', () => {
    useVoiceSessionStore.setState({
      usageLimited: true,
      session: { ...INITIAL_VOICE_SESSION_STATE, status: VOICE_SESSION_STATUS.error, error: 'x' },
    });
    useVoiceSessionStore.getState().dispatch({ type: VOICE_SESSION_EVENT.exit });
    expect(useVoiceSessionStore.getState().usageLimited).toBe(false);
  });
});

describe('VoiceModeSurface live camera', () => {
  it('offers no camera control when no frame sink is wired', () => {
    renderSurface();

    expect(screen.queryByTestId('voice-camera-toggle')).toBeNull();
  });

  it('offers the control, unpressed and without a preview, until the camera is shared', () => {
    renderSurface({ onVisualFrame: () => undefined });

    const toggle = screen.getByTestId('voice-camera-toggle');
    expect(toggle.getAttribute('aria-pressed')).toBe('false');
    expect(screen.queryByTestId('voice-camera-preview')).toBeNull();
  });

  it('reports the refusal from the visual session rather than failing silently', async () => {
    renderSurface({ onVisualFrame: () => undefined });

    await act(async () => {
      screen.getByTestId('voice-camera-toggle').click();
    });

    expect(screen.getByRole('alert').textContent).toBe(VISUAL_SOURCE_MESSAGE.unavailable);
    expect(screen.queryByTestId('voice-camera-preview')).toBeNull();
  });

  it('says the camera is live, shows what it is sending, and stops on the same control', async () => {
    const stop = vi.fn();
    visual.current = sharingCamera({ stop });

    renderSurface({ onVisualFrame: () => undefined });

    const toggle = screen.getByTestId('voice-camera-toggle');
    expect(toggle.getAttribute('aria-pressed')).toBe('true');
    expect(toggle.textContent).toContain('Stop sharing your camera');
    expect(screen.getByText('Your camera is being shared with this call.')).toBeTruthy();
    expect(screen.getByTestId('voice-camera-preview')).toBeTruthy();

    await act(async () => {
      toggle.click();
    });

    expect(stop).toHaveBeenCalledTimes(1);
    expect(visual.current?.start).not.toHaveBeenCalled();
  });
});
