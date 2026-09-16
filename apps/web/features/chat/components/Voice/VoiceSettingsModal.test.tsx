import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

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
