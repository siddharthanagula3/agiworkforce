import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

import { VOICE_SESSION_STATUS, INITIAL_VOICE_SESSION_STATE } from '@agiworkforce/unified-chat';
import { LIVE_SESSION_MESSAGE } from '@features/chat/lib/live-voice-session';

const controller = vi.hoisted(() => ({ current: {} as Record<string, unknown> }));

vi.mock('@features/chat/hooks/use-voice-session', () => ({
  useVoiceSession: () => controller.current,
}));
vi.mock('./VoiceOrb', () => ({ VoiceOrb: () => <div data-testid="voice-orb" /> }));
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

function renderSurface() {
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
    />,
  );
}

beforeEach(() => {
  controller.current = session();
});

afterEach(() => {
  cleanup();
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
