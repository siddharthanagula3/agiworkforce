import React from 'react';
import { render } from '@testing-library/react-native';
import { colors, lightColors } from '@/src/ui/theme';
import {
  VoiceStateGlow,
  voiceGlowColor,
  voiceGlowTone,
  type VoiceGlowPhase,
} from '@/src/features/voice/components/VoiceStateGlow';

const HIDDEN_OK = { includeHiddenElements: true } as const;

const mockWithRepeat = jest.fn((value: unknown) => value);
let mockReducedMotion = false;

jest.mock('react-native-reanimated', () => {
  const Reanimated = jest.requireActual('react-native-reanimated/mock');
  return {
    ...Reanimated,
    useReducedMotion: () => mockReducedMotion,
    useSharedValue: (initial: unknown) => ({ value: initial }),
    useAnimatedStyle: (fn: () => object) => fn(),
    withTiming: (toValue: unknown) => toValue,
    withSequence: (...values: unknown[]) => values[values.length - 1],
    withRepeat: (...args: [unknown]) => mockWithRepeat(...args),
  };
});

describe('VoiceStateGlow', () => {
  beforeEach(() => {
    mockWithRepeat.mockClear();
    mockReducedMotion = false;
  });

  it.each<[VoiceGlowPhase, string | null]>([
    ['listening', 'listening'],
    ['speaking', 'speaking'],
    ['thinking', 'thinking'],
    ['idle', null],
  ])('shows the %s state as %s', (phase, tone) => {
    const { queryByTestId } = render(<VoiceStateGlow phase={phase} height={240} />);
    for (const other of ['listening', 'speaking', 'thinking']) {
      if (other === tone)
        expect(queryByTestId(`voice-state-glow-${other}`, HIDDEN_OK)).toBeTruthy();
      else expect(queryByTestId(`voice-state-glow-${other}`, HIDDEN_OK)).toBeNull();
    }
  });

  it('draws listening and speaking in clearly different theme colours', () => {
    for (const scheme of [colors, lightColors]) {
      const listening = voiceGlowColor('listening', scheme);
      const speaking = voiceGlowColor('speaking', scheme);
      expect(listening).toBe(scheme.agentActive);
      expect(speaking).toBe(scheme.brandAmber);
      expect(listening).not.toBe(speaking);
      expect(voiceGlowColor('thinking', scheme)).toBe(scheme.agentThinking);
    }
  });

  it('maps idle to no glow and every active phase to its own tone', () => {
    expect(voiceGlowTone('idle')).toBeNull();
    expect(voiceGlowTone('listening')).toBe('listening');
    expect(voiceGlowTone('speaking')).toBe('speaking');
    expect(voiceGlowTone('thinking')).toBe('thinking');
  });

  it('sits along the bottom edge, behind the controls, and never takes a touch', () => {
    const { getByTestId } = render(<VoiceStateGlow phase="listening" height={240} />);
    const root = getByTestId('voice-state-glow', HIDDEN_OK);
    expect(root.props.pointerEvents).toBe('none');
    expect(root.props.style).toMatchObject({
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      height: 240,
    });
    expect(root.props.accessibilityElementsHidden).toBe(true);
  });

  it('breathes slowly while listening or speaking', () => {
    render(<VoiceStateGlow phase="listening" height={240} />);
    expect(mockWithRepeat).toHaveBeenCalled();
  });

  it('holds still but still shows the state when reduced motion is on', () => {
    mockReducedMotion = true;
    const { queryByTestId } = render(<VoiceStateGlow phase="speaking" height={240} />);
    expect(queryByTestId('voice-state-glow-speaking', HIDDEN_OK)).toBeTruthy();
    expect(mockWithRepeat).not.toHaveBeenCalled();
  });

  it('does not pulse while thinking', () => {
    render(<VoiceStateGlow phase="thinking" height={240} />);
    expect(mockWithRepeat).not.toHaveBeenCalled();
  });
});
