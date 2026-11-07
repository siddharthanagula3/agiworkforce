import React from 'react';
import { render, screen, userEvent } from '@testing-library/react-native';
import {
  colors,
  lightColors,
  highContrastColors,
  highContrastLightColors,
  type ColorScheme,
} from '@/src/ui/theme/tokens';
import { SendButton } from '@/src/features/chat/components/SendButton';

let mockThemeColors: ColorScheme = colors;

jest.mock('@/src/ui/theme', () => ({
  ...jest.requireActual('@/src/ui/theme'),
  useThemeColors: () => mockThemeColors,
}));

const THEMES = [
  ['dark', colors],
  ['light', lightColors],
  ['high contrast dark', highContrastColors],
  ['high contrast light', highContrastLightColors],
] as const;

describe.each(THEMES)('%s composer send control', (_name, palette) => {
  beforeEach(() => {
    mockThemeColors = palette;
  });

  it.each([
    ['idle', 'Send message'],
    ['streaming', 'Stop generating'],
    ['queued', 'Queued'],
  ] as const)('keeps %s neutral, reachable, and named', async (state, label) => {
    const onPress = jest.fn();
    const user = userEvent.setup();
    render(<SendButton state={state} onPress={onPress} />);
    const control = screen.getByRole('button', { name: label });

    expect(control).toHaveStyle({
      width: 44,
      height: 44,
      backgroundColor: palette.textPrimary,
      flexShrink: 0,
    });
    await user.press(control);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('disables an unavailable send while leaving Stop reachable', async () => {
    const onPress = jest.fn();
    const user = userEvent.setup();
    const view = render(<SendButton state="idle" disabled onPress={onPress} />);
    const send = screen.getByRole('button', { name: 'Send message' });
    expect(send).toBeDisabled();
    expect(send).toHaveStyle({ backgroundColor: palette.neutralSurface });
    await user.press(send);
    expect(onPress).not.toHaveBeenCalled();

    view.rerender(<SendButton state="streaming" disabled onPress={onPress} />);
    const stop = screen.getByRole('button', { name: 'Stop generating' });
    expect(stop).toBeEnabled();
    expect(stop).toHaveStyle({ backgroundColor: palette.textPrimary });
    await user.press(stop);
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
