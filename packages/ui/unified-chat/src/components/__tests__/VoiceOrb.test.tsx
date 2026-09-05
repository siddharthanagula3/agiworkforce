import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { VoiceOrb } from '../VoiceOrb';
import { ORB_STATE, ORB_STATE_LABEL } from '../../voice/voice-session-machine';

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
    orbState: ORB_STATE.listening,
    label: ORB_STATE_LABEL[ORB_STATE.listening],
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

  it('names the state under the orb, driven directly by the orb state a host maps its own states onto', () => {
    renderOrb();
    expect(screen.getByTestId('voice-orb-state').textContent).toBe('Listening');
  });

  it('renders every orb state a host can hand it, desktop workflow states included', () => {
    for (const [orbState, label] of Object.entries(ORB_STATE_LABEL)) {
      const { unmount } = render(
        <VoiceOrb
          orbState={orbState as (typeof ORB_STATE)[keyof typeof ORB_STATE]}
          label={label}
          focus={false}
          growIn={false}
          reducedMotion
          onClick={vi.fn()}
        />,
      );
      expect(screen.getByTestId('voice-orb').getAttribute('data-orb-state')).toBe(orbState);
      unmount();
    }
  });

  it('says nothing when handed an empty label', () => {
    renderOrb({ label: '' });
    expect(screen.queryByTestId('voice-orb-state')).toBeNull();
  });

  it('hides the label entirely when a compact host asks for none', () => {
    renderOrb({ showLabel: false });
    expect(screen.queryByTestId('voice-orb-state')).toBeNull();
  });

  it('shrinks the canvas to a compact size for an inline host', () => {
    renderOrb({ canvasSize: 32, sphereSize: 16, showLabel: false });
    const canvas = document.querySelector('canvas');
    expect(canvas?.getAttribute('width')).toBe('32');
    expect(canvas?.getAttribute('height')).toBe('32');
  });

  it('toggles focus on click and reports it as a pressed state', async () => {
    const user = userEvent.setup();
    const props = renderOrb({ focus: true });

    const orb = screen.getByTestId('voice-orb');
    expect(orb.getAttribute('aria-pressed')).toBe('true');
    expect(orb.getAttribute('aria-label')).toBe('Show the transcript again');

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
