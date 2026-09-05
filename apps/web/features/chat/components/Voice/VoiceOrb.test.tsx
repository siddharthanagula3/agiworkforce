import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { VoiceOrb } from './VoiceOrb';
import { ORB_STATE, VOICE_SESSION_STATUS } from '@features/chat/lib/voice-session-machine';

function fakeGradient(): CanvasGradient {
  return { addColorStop: vi.fn() } as unknown as CanvasGradient;
}

function stubCanvasContext() {
  const context = {
    clearRect: vi.fn(),
    beginPath: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    fillRect: vi.fn(),
    clip: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    setTransform: vi.fn(),
    createRadialGradient: vi.fn(fakeGradient),
    fillStyle: '',
  };
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
    context as unknown as CanvasRenderingContext2D,
  );
  return context;
}

function renderOrb(overrides: Partial<Parameters<typeof VoiceOrb>[0]> = {}) {
  const props = {
    status: VOICE_SESSION_STATUS.listening,
    focus: false,
    growIn: true,
    reducedMotion: false,
    onClick: vi.fn(),
    ...overrides,
  };
  render(<VoiceOrb {...props} />);
  return props;
}

describe('VoiceOrb', () => {
  beforeEach(() => {
    stubCanvasContext();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('names the state under the orb', () => {
    renderOrb();
    expect(screen.getByTestId('voice-orb-state')).toHaveTextContent('Listening');
  });

  it('says Thinking while the turn is in flight and Speaking while it plays back', () => {
    const { unmount } = render(
      <VoiceOrb
        status={VOICE_SESSION_STATUS.streaming}
        focus={false}
        growIn={false}
        reducedMotion
        onClick={vi.fn()}
      />,
    );
    expect(screen.getByTestId('voice-orb-state')).toHaveTextContent('Thinking');
    unmount();

    render(
      <VoiceOrb
        status={VOICE_SESSION_STATUS.speaking}
        focus={false}
        growIn={false}
        reducedMotion
        onClick={vi.fn()}
      />,
    );
    expect(screen.getByTestId('voice-orb-state')).toHaveTextContent('Speaking');
  });

  it('carries the muted orb state and its word', () => {
    renderOrb({ status: VOICE_SESSION_STATUS.muted });

    expect(screen.getByTestId('voice-orb')).toHaveAttribute('data-orb-state', ORB_STATE.muted);
    expect(screen.getByTestId('voice-orb-state')).toHaveTextContent('Muted');
  });

  it('says nothing while the session is still starting', () => {
    renderOrb({ status: VOICE_SESSION_STATUS.entering });

    expect(screen.getByTestId('voice-orb')).toHaveAttribute('data-orb-state', ORB_STATE.idle);
    expect(screen.queryByTestId('voice-orb-state')).not.toBeInTheDocument();
  });

  it('toggles focus on click and reports it as a pressed state', async () => {
    const user = userEvent.setup();
    const props = renderOrb({ focus: true });

    const orb = screen.getByTestId('voice-orb');
    expect(orb).toHaveAttribute('aria-pressed', 'true');
    expect(orb).toHaveAccessibleName('Show the transcript again');

    await user.click(orb);
    expect(props.onClick).toHaveBeenCalledTimes(1);
  });

  it('runs no animation frame loop under reduced motion, and paints once', () => {
    const requestFrame = vi.spyOn(window, 'requestAnimationFrame');
    const context = stubCanvasContext();
    renderOrb({ reducedMotion: true });

    expect(requestFrame).not.toHaveBeenCalled();
    expect(context.clearRect).toHaveBeenCalled();
  });

  it('drives the breathing loop when motion is allowed', () => {
    const requestFrame = vi.spyOn(window, 'requestAnimationFrame').mockReturnValue(1);
    renderOrb({ reducedMotion: false });

    expect(requestFrame).toHaveBeenCalled();
  });
});
