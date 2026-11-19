import React from 'react';
import { StyleSheet } from 'react-native';
import { render, fireEvent } from '@testing-library/react-native';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';
import { Mic, MicOff, Plus, X } from 'lucide-react-native';
import {
  VoiceInlineBar,
  type VoiceInlinePhase,
} from '@/src/features/voice/components/VoiceInlineBar';
import { colors, lightColors, type ColorScheme } from '@/src/ui/theme/tokens';
import { useChatAppModeStore } from '@/src/features/chat/store/appModeStore';
import { useLocalSettingsStore } from '@/stores/settings/localSettingsStore';
import { useSettingsStore } from '@/stores/settingsStore';

const HIDDEN_OK = { includeHiddenElements: true } as const;

const METRICS: Metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

function renderBar(props: Partial<React.ComponentProps<typeof VoiceInlineBar>> = {}) {
  return render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <VoiceInlineBar
        visible
        phase={'listening' as VoiceInlinePhase}
        onToggleMic={jest.fn()}
        onExit={jest.fn()}
        {...props}
      />
    </SafeAreaProvider>,
  );
}

function backgroundOf(node: { props: { style: unknown } }): string | undefined {
  const style = node.props.style;
  const flat = (Array.isArray(style) ? style : [style]).filter(Boolean) as Array<
    Record<string, unknown>
  >;
  for (const layer of flat) {
    if (typeof layer?.backgroundColor === 'string') return layer.backgroundColor;
  }
  return undefined;
}

function styleOf(node: { props: { style: unknown } }) {
  return StyleSheet.flatten(node.props.style as Parameters<typeof StyleSheet.flatten>[0]) ?? {};
}

describe('VoiceInlineBar', () => {
  beforeEach(() => {
    useSettingsStore.setState({ hapticsEnabled: false });
    useChatAppModeStore.setState({ appMode: 'local' });
    useLocalSettingsStore.setState({ themeMode: 'dark', accentColor: 'neutral' });
  });

  describe.each<['light' | 'dark', ColorScheme]>([
    ['light', lightColors],
    ['dark', colors],
  ])('in %s appearance', (themeMode, palette) => {
    beforeEach(() => {
      useLocalSettingsStore.setState({ themeMode });
    });

    it('draws the notice and the composer pill from the current palette', () => {
      const { getByTestId, getByText, getByLabelText, UNSAFE_getByType } = renderBar({
        notice: 'Voice is paused',
        onAttach: jest.fn(),
        onOpenKeyboard: jest.fn(),
      });

      expect(styleOf(getByTestId('voice-inline-notice')).color).toBe(palette.textMuted);
      expect(styleOf(getByText('Ask AGI')).color).toBe(palette.textMuted);
      expect(UNSAFE_getByType(Plus).props.color).toBe(palette.textSecondary);
      expect(styleOf(getByLabelText('Type a message instead')).backgroundColor).toBe(
        palette.inputSurface,
      );
    });

    it('draws the live microphone from the current palette', () => {
      const idle = renderBar({ phase: 'idle' });
      expect(styleOf(idle.getByLabelText('Start listening')).backgroundColor).toBe(
        palette.inputSurface,
      );
      expect(idle.UNSAFE_getByType(Mic).props.color).toBe(palette.textSecondary);

      const listening = renderBar({ phase: 'listening' });
      expect(listening.UNSAFE_getByType(Mic).props.color).toBe(palette.agentActive);
    });

    it('draws the muted microphone from the current palette', () => {
      const { getByLabelText, UNSAFE_getByType } = renderBar({ muted: true });
      const mute = styleOf(getByLabelText('Unmute microphone'));

      expect(mute.backgroundColor).toBe(palette.agentError);
      expect(mute.borderColor).toBe(palette.dangerBorder);
      expect(UNSAFE_getByType(MicOff).props.color).toBe(palette.accentText);
    });

    it('draws the exit control from the current palette', () => {
      const { getByLabelText, UNSAFE_getByType } = renderBar();

      expect(styleOf(getByLabelText('Exit voice mode')).backgroundColor).toBe(palette.textPrimary);
      expect(UNSAFE_getByType(X).props.color).toBe(palette.surfaceBase);
    });
  });

  it('renders nothing when not visible', () => {
    const { queryByLabelText } = renderBar({ visible: false });
    expect(queryByLabelText('Exit voice mode')).toBeNull();
  });

  it('offers mic and exit as separate, distinctly labelled controls', () => {
    const { getByLabelText } = renderBar();
    getByLabelText('Mute microphone');
    getByLabelText('Exit voice mode');
  });

  it('offers to start listening when the mic is idle and not muted', () => {
    const onToggleMic = jest.fn();
    const { getByLabelText, queryByLabelText } = renderBar({ phase: 'idle', onToggleMic });

    expect(queryByLabelText('Mute microphone')).toBeNull();
    fireEvent.press(getByLabelText('Start listening'));

    expect(onToggleMic).toHaveBeenCalledTimes(1);
  });

  it('exits without toggling the mic', () => {
    const onExit = jest.fn();
    const onToggleMic = jest.fn();
    const { getByLabelText } = renderBar({ onExit, onToggleMic });

    fireEvent.press(getByLabelText('Exit voice mode'));

    expect(onExit).toHaveBeenCalledTimes(1);
    expect(onToggleMic).not.toHaveBeenCalled();
  });

  it('toggles the mic without exiting', () => {
    const onExit = jest.fn();
    const onToggleMic = jest.fn();
    const { getByLabelText } = renderBar({ onExit, onToggleMic });

    fireEvent.press(getByLabelText('Mute microphone'));

    expect(onToggleMic).toHaveBeenCalledTimes(1);
    expect(onExit).not.toHaveBeenCalled();
  });

  describe('mute is legible on screen, not just in the handler', () => {
    it('announces the action the current state affords', () => {
      expect(renderBar({ muted: false }).getByLabelText('Mute microphone')).toBeTruthy();
      expect(renderBar({ muted: true }).getByLabelText('Unmute microphone')).toBeTruthy();
    });

    it('marks the control selected only while muted', () => {
      const live = renderBar({ muted: false }).getByLabelText('Mute microphone');
      const off = renderBar({ muted: true }).getByLabelText('Unmute microphone');

      expect(live.props.accessibilityState.selected).toBe(false);
      expect(off.props.accessibilityState.selected).toBe(true);
    });

    it('swaps to a slashed glyph on danger red when muted', () => {
      const live = renderBar({ muted: false });
      const off = renderBar({ muted: true });

      expect(live.UNSAFE_queryAllByType(MicOff)).toHaveLength(0);
      expect(off.UNSAFE_queryAllByType(MicOff)).toHaveLength(1);

      expect(backgroundOf(live.getByLabelText('Mute microphone'))).toBe(colors.inputSurface);
      expect(backgroundOf(off.getByLabelText('Unmute microphone'))).toBe(colors.agentError);
    });

    it('keeps the listening tint independent of mute', () => {
      const listening = renderBar({ phase: 'listening', muted: false });
      expect(backgroundOf(listening.getByLabelText('Mute microphone'))).toBe(colors.inputSurface);

      const mutedWhileSpeaking = renderBar({ phase: 'speaking', muted: true });
      expect(backgroundOf(mutedWhileSpeaking.getByLabelText('Unmute microphone'))).toBe(
        colors.agentError,
      );
    });
  });

  describe('the composer pill only claims what it can do', () => {
    it('is a button only when a handler is supplied', () => {
      const wired = renderBar({ onOpenKeyboard: jest.fn() });
      expect(wired.getByLabelText('Type a message instead').props.accessibilityRole).toBe('button');

      const bare = renderBar();
      expect(bare.queryByLabelText('Type a message instead')).toBeNull();
    });

    it('invokes the keyboard handler without muting or exiting', () => {
      const onOpenKeyboard = jest.fn();
      const onExit = jest.fn();
      const onToggleMic = jest.fn();
      const { getByLabelText } = renderBar({ onOpenKeyboard, onExit, onToggleMic });

      fireEvent.press(getByLabelText('Type a message instead'));

      expect(onOpenKeyboard).toHaveBeenCalledTimes(1);
      expect(onExit).not.toHaveBeenCalled();
      expect(onToggleMic).not.toHaveBeenCalled();
    });
  });

  it('keeps the attachment affordance the text composer has', () => {
    const onAttach = jest.fn();
    const { getByLabelText } = renderBar({ onAttach });
    fireEvent.press(getByLabelText('Add attachment'));
    expect(onAttach).toHaveBeenCalledTimes(1);
  });

  it('omits attachment entirely when the host provides no handler', () => {
    const { queryByLabelText } = renderBar();
    expect(queryByLabelText('Add attachment')).toBeNull();
  });

  describe('adding a photo or file without leaving voice', () => {
    const photo = {
      id: 'photo-1',
      uri: 'file:///photo-1.jpg',
      mimeType: 'image/jpeg',
      fileName: 'photo-1.jpg',
    };
    const notes = {
      id: 'doc-1',
      uri: 'file:///notes.pdf',
      mimeType: 'application/pdf',
      fileName: 'notes.pdf',
    };

    it('keeps the bar up when the plus is pressed', () => {
      const onExit = jest.fn();
      const onAttach = jest.fn();
      const { getByLabelText, getByTestId } = renderBar({ onAttach, onExit });

      fireEvent.press(getByLabelText('Add attachment'));

      expect(onAttach).toHaveBeenCalledTimes(1);
      expect(onExit).not.toHaveBeenCalled();
      expect(getByTestId('voice-inline-bar')).toBeTruthy();
    });

    it('shows what is waiting to go out with the next thing the user says', () => {
      const { getByTestId, getByLabelText } = renderBar({
        attachments: [photo, notes],
        onRemoveAttachment: jest.fn(),
      });

      expect(getByTestId('voice-inline-attachments')).toBeTruthy();
      getByLabelText('Remove photo-1.jpg');
      getByLabelText('Remove notes.pdf');
    });

    it('lets the user take one back out', () => {
      const onRemoveAttachment = jest.fn();
      const { getByLabelText } = renderBar({ attachments: [photo], onRemoveAttachment });

      fireEvent.press(getByLabelText('Remove photo-1.jpg'));

      expect(onRemoveAttachment).toHaveBeenCalledWith('photo-1');
    });

    it('shows no strip when nothing is attached', () => {
      const { queryByTestId } = renderBar({ attachments: [], onRemoveAttachment: jest.fn() });
      expect(queryByTestId('voice-inline-attachments')).toBeNull();
    });
  });

  describe('the glow shows whether the assistant is listening or speaking', () => {
    it('glows in the listening colour while listening', () => {
      const { queryByTestId } = renderBar({ phase: 'listening' });
      expect(queryByTestId('voice-state-glow-listening', HIDDEN_OK)).toBeTruthy();
      expect(queryByTestId('voice-state-glow-speaking', HIDDEN_OK)).toBeNull();
    });

    it('glows in a different colour while speaking', () => {
      const { queryByTestId } = renderBar({ phase: 'speaking' });
      expect(queryByTestId('voice-state-glow-speaking', HIDDEN_OK)).toBeTruthy();
      expect(queryByTestId('voice-state-glow-listening', HIDDEN_OK)).toBeNull();
    });

    it('does not glow when idle or muted', () => {
      const idle = renderBar({ phase: 'idle' });
      expect(idle.queryByTestId('voice-state-glow-listening', HIDDEN_OK)).toBeNull();
      expect(idle.queryByTestId('voice-state-glow-speaking', HIDDEN_OK)).toBeNull();

      const muted = renderBar({ phase: 'listening', muted: true });
      expect(muted.queryByTestId('voice-state-glow-listening', HIDDEN_OK)).toBeNull();
    });

    it('is gone with the bar', () => {
      const { queryByTestId } = renderBar({ phase: 'listening', visible: false });
      expect(queryByTestId('voice-state-glow', HIDDEN_OK)).toBeNull();
    });
  });
});
