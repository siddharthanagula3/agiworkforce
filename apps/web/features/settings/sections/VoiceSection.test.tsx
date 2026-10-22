import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { useVoiceSessionStore } from '@features/chat/stores/voice-session-store';
import { LIVE_VOICES } from '@features/chat/lib/live-voices';
import { VoiceSection } from './VoiceSection';

describe('VoiceSection', () => {
  beforeEach(() => {
    useVoiceSessionStore.getState().setVoice(LIVE_VOICES[0]!.voiceURI);
    useVoiceSessionStore.getState().setLanguage('');
  });

  it('picks the call voice from the carousel and its dots, in the shared store', async () => {
    render(<VoiceSection />);

    await userEvent.click(screen.getByRole('button', { name: 'Next voice' }));
    expect(useVoiceSessionStore.getState().voice).toBe(LIVE_VOICES[1]!.voiceURI);

    const dots = screen.getByTestId('voice-carousel-dots');
    const target = LIVE_VOICES[3]!;
    await userEvent.click(within(dots).getByRole('button', { name: target.name }));
    expect(useVoiceSessionStore.getState().voice).toBe(target.voiceURI);
    expect(within(dots).getByRole('button', { name: target.name })).toHaveAttribute(
      'aria-current',
      'true',
    );
  });

  it('sets the voice conversation language, with auto-detect first', async () => {
    render(<VoiceSection />);

    await userEvent.click(screen.getByTestId('voice-settings-language'));
    await userEvent.click(screen.getByRole('menuitem', { name: /French/i }));

    expect(useVoiceSessionStore.getState().language).toBe('fr');
  });

  it('renders the voice picker, a dictation toggle and a dictation language select', () => {
    render(<VoiceSection />);

    expect(screen.getByRole('switch', { name: 'Dictation' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    expect(screen.getByRole('combobox', { name: 'Dictation language' })).toBeInTheDocument();
    expect(screen.queryByText(/not available/i)).toBeNull();
    expect(screen.queryByText(/Bring Your Own Key/i)).toBeNull();
    expect(screen.queryByText(/loading/i)).toBeNull();
    expect(document.querySelector('[style*="border-radius: var(--radius-lg)"]')).toBeNull();
  });

  it('draws dictation as the shared switch, whose off state keeps a visible edge', () => {
    render(<VoiceSection />);

    const toggle = screen.getByRole('switch', { name: 'Dictation' });
    expect(toggle).toHaveAttribute('data-state', 'checked');
    expect(toggle.className).toContain(
      'data-[state=unchecked]:border-[color:var(--switch-off-edge)]',
    );
  });

  it('flips the dictation switch and persists the choice', async () => {
    render(<VoiceSection />);

    const toggle = screen.getByRole('switch', { name: 'Dictation' });
    await userEvent.click(toggle);

    expect(toggle).toHaveAttribute('aria-checked', 'false');
  });
});
