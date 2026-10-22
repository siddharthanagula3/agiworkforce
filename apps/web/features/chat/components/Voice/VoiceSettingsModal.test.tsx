import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { VoiceSettingsModal } from './VoiceSettingsModal';
import { VOICE_LANGUAGE_AUTO } from '@features/chat/stores/voice-session-store';

function fakeGradient(): CanvasGradient {
  return { addColorStop: vi.fn() } as unknown as CanvasGradient;
}

function stubCanvasContext() {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
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
  } as unknown as CanvasRenderingContext2D);
}

function renderModal() {
  render(
    <VoiceSettingsModal
      open
      reducedMotion
      voices={[{ voiceURI: 'voice-a', name: 'Aria', lang: 'en-US' }]}
      voiceUri="voice-a"
      intelligence="balanced"
      language={VOICE_LANGUAGE_AUTO}
      onOpenChange={vi.fn()}
      onVoiceChange={vi.fn()}
      onIntelligenceChange={vi.fn()}
      onLanguageChange={vi.fn()}
    />,
  );
}

// The orb at the top of this modal is a picture of the voice, not a way to
// start one. Mounting the interactive orb here gave it a tab stop that
// announced a toggle and did nothing when activated, and a polite live region
// that read out an orb state nobody had changed.
describe('the voice settings orb is decoration, not a control', () => {
  beforeEach(() => {
    stubCanvasContext();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('offers no orb button to focus or activate', () => {
    renderModal();

    expect(screen.queryByTestId('voice-orb')).not.toBeInTheDocument();
    for (const control of screen.getAllByRole('button')) {
      expect(control).not.toHaveAttribute('aria-pressed');
    }
  });

  it('announces no orb state, because none of it is changing', () => {
    renderModal();

    expect(screen.queryByTestId('voice-orb-state')).not.toBeInTheDocument();
  });

  it('still paints the orb', () => {
    renderModal();

    expect(document.querySelector('canvas')).not.toBeNull();
  });
});

describe('the voice page dots', () => {
  beforeEach(() => {
    stubCanvasContext();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('are buttons that select their voice and mark the active one', async () => {
    const onVoiceChange = vi.fn();
    render(
      <VoiceSettingsModal
        open
        reducedMotion
        voices={[
          { voiceURI: 'voice-a', name: 'Aria', lang: 'en-US' },
          { voiceURI: 'voice-b', name: 'Bram', lang: 'en-GB' },
        ]}
        voiceUri="voice-a"
        intelligence="balanced"
        language={VOICE_LANGUAGE_AUTO}
        onOpenChange={vi.fn()}
        onVoiceChange={onVoiceChange}
        onIntelligenceChange={vi.fn()}
        onLanguageChange={vi.fn()}
      />,
    );

    const dots = screen.getByTestId('voice-carousel-dots');
    expect(dots).not.toHaveAttribute('aria-hidden');
    expect(within(dots).getByRole('button', { name: 'Aria' })).toHaveAttribute(
      'aria-current',
      'true',
    );
    expect(within(dots).getByRole('button', { name: 'Bram' })).not.toHaveAttribute('aria-current');

    await userEvent.click(within(dots).getByRole('button', { name: 'Bram' }));
    expect(onVoiceChange).toHaveBeenCalledWith('voice-b');
  });
});
