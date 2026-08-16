/* eslint-disable @typescript-eslint/no-require-imports */
import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';

jest.mock('@/src/ui/theme', () => ({
  useThemeColors: () => ({
    surfaceElevated: '#111827',
    border: '#243040',
    charcoal700: '#d9d9d9',
    teal: '#14b8a6',
    textPrimary: '#111827',
    textMuted: '#94a3b8',
    textSecondary: '#cbd5e1',
    accentSurface: '#0f766e22',
    transparent: 'transparent',
  }),
}));

jest.mock('lucide-react-native', () => {
  const { View } = require('react-native');
  const Icon = ({ testID, ...props }: Record<string, unknown>) => (
    <View testID={testID} {...props} />
  );
  return {
    Cloud: (props: Record<string, unknown>) => <Icon testID="icon-cloud" {...props} />,
    Cpu: (props: Record<string, unknown>) => <Icon testID="icon-cpu" {...props} />,
    Lock: (props: Record<string, unknown>) => <Icon testID="icon-lock" {...props} />,
  };
});

import { ModeToggle } from '../src/features/chat/components/ModeToggle';

describe('ModeToggle', () => {
  it('defaults to local mode and prompts sign-in for the locked cloud side', () => {
    const { getByTestId, getByText } = render(<ModeToggle />);

    expect(getByTestId('chat.mode-toggle')).toBeTruthy();
    expect(getByText('Local')).toBeTruthy();
    expect(getByText('Cloud')).toBeTruthy();
    expect(getByTestId('chat.mode-toggle.cloud').props.accessibilityLabel).toBe(
      'AGI Cloud, sign in required',
    );
    expect(getByTestId('chat.mode-toggle.local').props.accessibilityState.selected).toBe(true);
  });

  it('opens the cloud access prompt when the locked cloud side is tapped', () => {
    const onTapCloud = jest.fn();
    const { getByTestId } = render(<ModeToggle onTapCloud={onTapCloud} />);

    fireEvent.press(getByTestId('chat.mode-toggle.cloud'));

    expect(onTapCloud).toHaveBeenCalledTimes(1);
  });

  it('does not frame locked cloud access with a waitlist rank (public alpha = sign in)', () => {
    const { getByTestId } = render(<ModeToggle cloudJoined waitlistRank={42} />);

    expect(getByTestId('chat.mode-toggle.cloud').props.accessibilityLabel).toBe(
      'AGI Cloud, sign in required',
    );
    expect(getByTestId('chat.mode-toggle.local').props.accessibilityState.selected).toBe(true);
  });

  it('shows unlocked cloud as the active mode', () => {
    const { getByText, getByTestId } = render(<ModeToggle mode="cloud" cloudUnlocked />);

    expect(getByText('Cloud')).toBeTruthy();
    expect(getByTestId('chat.mode-toggle.local').props.accessibilityState.selected).toBe(false);
    expect(getByTestId('chat.mode-toggle.cloud').props.accessibilityState.selected).toBe(true);
    expect(getByTestId('chat.mode-toggle.cloud').props.accessibilityLabel).toBe('AGI Cloud');
  });

  it('uses the same selected pill treatment for Local and Cloud', () => {
    const { getByTestId, rerender } = render(<ModeToggle mode="local" />);

    const localSelectedBackground =
      getByTestId('chat.mode-toggle.local').props.style.backgroundColor;
    const localSelectedBorder = getByTestId('chat.mode-toggle.local').props.style.borderColor;

    rerender(<ModeToggle mode="cloud" cloudUnlocked />);

    expect(getByTestId('chat.mode-toggle.cloud').props.style.backgroundColor).toBe(
      localSelectedBackground,
    );
    expect(getByTestId('chat.mode-toggle.cloud').props.style.borderColor).toBe(localSelectedBorder);
  });
});
