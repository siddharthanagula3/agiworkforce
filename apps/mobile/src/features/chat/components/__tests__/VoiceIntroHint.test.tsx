import React from 'react';
import { act, render } from '@testing-library/react-native';
import {
  VOICE_INTRO_HINT_VISIBLE_MS,
  VoiceIntroHint,
  dismissVoiceIntroHint,
} from '../VoiceIntroHint';
import { useSettingsStore } from '@/stores/settingsStore';

jest.mock('@/src/ui/theme', () => ({
  radii: { full: 999 },
  useThemeColors: () => ({
    border: '#333',
    surfaceElevated: '#1a1a1a',
    textPrimary: '#fff',
  }),
}));

beforeEach(() => {
  useSettingsStore.setState({ voiceHintSeen: false, voiceOnboardingSeen: false });
});

describe('VoiceIntroHint', () => {
  it('shows to a user who has never started voice', () => {
    const screen = render(<VoiceIntroHint />);
    expect(screen.getByText('Try voice')).toBeTruthy();
  });

  it('goes away by itself after a short while and stays gone', () => {
    jest.useFakeTimers();
    try {
      const screen = render(<VoiceIntroHint />);
      act(() => {
        jest.advanceTimersByTime(VOICE_INTRO_HINT_VISIBLE_MS - 1);
      });
      expect(screen.getByText('Try voice')).toBeTruthy();
      act(() => {
        jest.advanceTimersByTime(1);
      });
      expect(screen.queryByText('Try voice')).toBeNull();
      expect(useSettingsStore.getState().voiceHintSeen).toBe(true);
      screen.unmount();
      expect(render(<VoiceIntroHint />).queryByText('Try voice')).toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });

  it('never takes a touch, so the voice button under it stays reachable', () => {
    const screen = render(<VoiceIntroHint />);
    const hint = screen.getByTestId('chat.composer.voice-hint');
    expect(hint.props.pointerEvents).toBe('none');
    expect(screen.queryByRole('button')).toBeNull();
    expect(
      screen.getByLabelText('Tip: tap the voice button to talk instead of typing'),
    ).toBeTruthy();
  });

  it('is dismissed by pressing the voice button', () => {
    const screen = render(<VoiceIntroHint />);
    act(() => {
      dismissVoiceIntroHint();
    });
    expect(screen.queryByText('Try voice')).toBeNull();
  });

  it('never shows after voice was used', () => {
    useSettingsStore.setState({ voiceOnboardingSeen: true });
    expect(render(<VoiceIntroHint />).queryByText('Try voice')).toBeNull();
  });
});
