import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';

import {
  VOICE_SESSION_STATUS,
  INITIAL_VOICE_SESSION_STATE,
  type VoiceSessionStatus,
} from '@agiworkforce/unified-chat';
import type { LiveTranscriptTurn } from '@features/chat/lib/live-voice-session';

const controller = vi.hoisted(() => ({
  current: {} as Record<string, unknown>,
  options: null as { onTranscript: (id: string, turn: LiveTranscriptTurn) => void } | null,
}));

vi.mock('@features/chat/hooks/use-voice-session', () => ({
  liveVoiceOutputRef: { current: null },
  useVoiceSession: (options: { onTranscript: (id: string, turn: LiveTranscriptTurn) => void }) => {
    controller.options = options;
    return controller.current;
  },
}));
vi.mock('../VoiceOrb', () => ({
  VoiceOrbPreview: () => null,
  VoiceOrb: () => <div data-testid="voice-orb" />,
}));
vi.mock('../VoiceChatDock', () => ({ VoiceChatDock: () => null }));
vi.mock('../VoiceSettingsModal', () => ({ VoiceSettingsModal: () => null }));

import { VoiceModeSurface, VOICE_SURFACE_VARIANT } from '../VoiceModeSurface';
import { VOICE_ANNOUNCEMENT } from '../voice-announcements';

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

const onTranscript = vi.fn();

function renderSurface() {
  return render(
    <VoiceModeSurface
      variant={VOICE_SURFACE_VARIANT.chat}
      turnActive={false}
      conversationId="conversation-1"
      onSend={() => true}
      onEnsureConversation={async () => 'conversation-1'}
      onTranscript={onTranscript}
      onNewChat={() => undefined}
      onOpenLibrary={() => undefined}
      onOpenConnectors={() => undefined}
      onIntelligenceChange={() => undefined}
    />,
  );
}

function emit(turn: LiveTranscriptTurn): void {
  act(() => {
    controller.options?.onTranscript('conversation-1', turn);
  });
}

beforeEach(() => {
  controller.current = session();
  controller.options = null;
  onTranscript.mockClear();
});

afterEach(() => {
  cleanup();
});

describe('voice live-region announcements', () => {
  const CASES: ReadonlyArray<[VoiceSessionStatus, string]> = [
    [VOICE_SESSION_STATUS.entering, VOICE_ANNOUNCEMENT.connecting],
    [VOICE_SESSION_STATUS.listening, VOICE_ANNOUNCEMENT.listening],
    [VOICE_SESSION_STATUS.transcribing, VOICE_ANNOUNCEMENT.transcribing],
    [VOICE_SESSION_STATUS.sending, VOICE_ANNOUNCEMENT.sending],
    [VOICE_SESSION_STATUS.streaming, VOICE_ANNOUNCEMENT.thinking],
    [VOICE_SESSION_STATUS.speaking, VOICE_ANNOUNCEMENT.speaking],
  ];

  it('is a polite region that screen readers reach but the eye does not', () => {
    renderSurface();
    const region = screen.getByTestId('voice-live-status');
    expect(region.getAttribute('aria-live')).toBe('polite');
    expect(region.getAttribute('role')).toBe('status');
    expect(region.className).toContain('sr-only');
  });

  it.each(CASES)('announces %s', (status, expected) => {
    controller.current = session({ state: { ...INITIAL_VOICE_SESSION_STATE, status } });
    renderSurface();
    expect(screen.getByTestId('voice-live-status').textContent).toBe(expected);
  });

  it('updates as the state machine moves', () => {
    const { rerender } = renderSurface();
    expect(screen.getByTestId('voice-live-status').textContent).toBe('');

    for (const [status, expected] of CASES) {
      controller.current = session({ state: { ...INITIAL_VOICE_SESSION_STATE, status } });
      rerender(
        <VoiceModeSurface
          variant={VOICE_SURFACE_VARIANT.chat}
          turnActive={false}
          conversationId="conversation-1"
          onSend={() => true}
          onEnsureConversation={async () => 'conversation-1'}
          onTranscript={onTranscript}
          onNewChat={() => undefined}
          onOpenLibrary={() => undefined}
          onOpenConnectors={() => undefined}
          onIntelligenceChange={() => undefined}
        />,
      );
      expect(screen.getByTestId('voice-live-status').textContent).toBe(expected);
    }
  });

  it('announces a muted microphone over the listening state', () => {
    controller.current = session({
      state: {
        ...INITIAL_VOICE_SESSION_STATE,
        status: VOICE_SESSION_STATUS.muted,
        muted: true,
      },
    });
    renderSurface();
    expect(screen.getByTestId('voice-live-status').textContent).toBe(VOICE_ANNOUNCEMENT.muted);
  });

  it('announces a busy backend while the session is otherwise listening', () => {
    controller.current = session({
      backendBusy: true,
      state: { ...INITIAL_VOICE_SESSION_STATE, status: VOICE_SESSION_STATUS.listening },
    });
    renderSurface();
    expect(screen.getByTestId('voice-live-status').textContent).toBe(VOICE_ANNOUNCEMENT.thinking);
  });

  it('leaves an error to its own alert rather than saying it twice', () => {
    controller.current = session({
      state: {
        ...INITIAL_VOICE_SESSION_STATE,
        status: VOICE_SESSION_STATUS.error,
        error: 'Microphone is unavailable',
      },
    });
    renderSurface();
    expect(screen.getByTestId('voice-live-status').textContent).toBe('');
    expect(screen.getByTestId('voice-error').textContent).toContain('Microphone is unavailable');
  });
});

describe('voice captions', () => {
  it('is off until the user turns it on, and the toggle says which it is', () => {
    renderSurface();
    expect(screen.queryByTestId('voice-captions')).toBeNull();

    const toggle = screen.getByTestId('voice-captions-toggle');
    expect(toggle.getAttribute('aria-pressed')).toBe('false');
    expect(toggle.getAttribute('aria-label')).toBe('Show captions');

    fireEvent.click(toggle);
    expect(screen.getByTestId('voice-captions')).toBeTruthy();
    expect(screen.getByTestId('voice-captions-toggle').getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByTestId('voice-captions-toggle').getAttribute('aria-label')).toBe(
      'Hide captions',
    );
  });

  it('renders each speaker and replaces a partial turn in place', () => {
    renderSurface();
    fireEvent.click(screen.getByTestId('voice-captions-toggle'));

    emit({ turnId: 'turn-1', role: 'user', text: 'what is', final: false });
    emit({ turnId: 'turn-1', role: 'user', text: 'what is the weather', final: true });
    emit({ turnId: 'turn-2', role: 'assistant', text: 'Clear and cold.', final: true });

    const lines = screen.getAllByTestId('voice-caption-line');
    expect(lines).toHaveLength(2);
    expect(lines[0]?.textContent).toContain('what is the weather');
    expect(lines[0]?.getAttribute('data-role')).toBe('user');
    expect(lines[1]?.textContent).toContain('Clear and cold.');
    expect(lines[1]?.getAttribute('data-role')).toBe('assistant');
  });

  it('keeps the transcript flowing to the host and does not announce itself twice', () => {
    renderSurface();
    fireEvent.click(screen.getByTestId('voice-captions-toggle'));
    emit({ turnId: 'turn-1', role: 'assistant', text: 'Clear and cold.', final: true });

    expect(onTranscript).toHaveBeenCalledWith('conversation-1', {
      turnId: 'turn-1',
      role: 'assistant',
      text: 'Clear and cold.',
      final: true,
    });
    expect(screen.getByTestId('voice-captions').getAttribute('aria-live')).toBe('off');
  });
});
