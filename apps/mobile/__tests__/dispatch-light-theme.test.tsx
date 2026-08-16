/* eslint-disable @typescript-eslint/no-require-imports */
import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { lightColors } from '../src/ui/theme/tokens';

jest.mock('expo-camera', () => {
  const { View } = require('react-native');
  return {
    CameraView: (props: Record<string, unknown>) => <View testID="camera-view" {...props} />,
    useCameraPermissions: () => [{ granted: true }, jest.fn()],
  };
});

jest.mock('react-native-reanimated', () => {
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: { View },
    useAnimatedStyle: () => ({}),
    useSharedValue: (value: unknown) => ({ value }),
    withRepeat: (value: unknown) => value,
    withTiming: (value: unknown) => value,
    Easing: { inOut: (value: unknown) => value, ease: 'ease' },
  };
});

jest.mock('lucide-react-native', () => {
  const { View } = require('react-native');
  return new Proxy({}, { get: () => (props: Record<string, unknown>) => <View {...props} /> });
});

jest.mock('@/components/ui/card', () => {
  const { View } = require('react-native');
  return { Card: ({ children }: { children: React.ReactNode }) => <View>{children}</View> };
});

jest.mock('@/src/ui/theme', () => {
  const tokens = jest.requireActual('@/src/ui/theme/tokens');
  return {
    ...tokens,
    colors: tokens.lightColors,
    useThemeColors: () => tokens.lightColors,
    useTheme: () => ({ colors: tokens.lightColors, isDark: false, statusBarStyle: 'dark' }),
  };
});

jest.mock('@/stores/settingsStore', () => ({
  useSettingsStore: (selector: (state: { hapticsEnabled: boolean }) => unknown) =>
    selector({ hapticsEnabled: false }),
}));

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'Light' },
}));

jest.mock('@/services/companion', () => ({
  isValidPairingCode: (raw: string) => /^[A-Za-z0-9]{12}$/.test(raw.trim().replace(/[ -]/g, '')),
  sendDispatchTask: jest.fn(() => 'req-1'),
  cancelDispatchTask: jest.fn(),
}));

jest.mock('@/stores/dispatchTaskStore', () => ({
  useDispatchTaskStore: (selector: (state: { tasks: unknown[] }) => unknown) =>
    selector({ tasks: [] }),
}));

import { QRScanner } from '../src/features/companion/components/QRScanner';
import { DispatchTaskComposer } from '../src/features/companion/components/DispatchTaskComposer';

type RenderedNode = {
  props?: Record<string, unknown>;
  children?: unknown;
};

function collectNodes(node: unknown, acc: RenderedNode[] = []): RenderedNode[] {
  if (!node || typeof node !== 'object') return acc;
  if (Array.isArray(node)) {
    node.forEach((child) => collectNodes(child, acc));
    return acc;
  }
  const typed = node as RenderedNode;
  acc.push(typed);
  collectNodes(typed.children, acc);
  return acc;
}

function backgroundColors(node: unknown): string[] {
  return collectNodes(node)
    .map((entry) => {
      const style = entry.props?.style as { backgroundColor?: string } | undefined;
      return style?.backgroundColor;
    })
    .filter((value): value is string => typeof value === 'string');
}

describe('Dispatch surfaces in light theme', () => {
  it('paints the manual pairing screen on the app surface, not literal black', () => {
    const screen = render(<QRScanner onScan={jest.fn()} onClose={jest.fn()} />);
    fireEvent.press(screen.getByLabelText('Enter code manually'));

    const backgrounds = backgroundColors(screen.toJSON());
    expect(backgrounds).toContain(lightColors.surfaceBase);
    expect(backgrounds).not.toContain('#000000');
    expect(backgrounds).not.toContain('black');
  });

  it('keeps the manual-entry copy readable against that surface', () => {
    const screen = render(<QRScanner onScan={jest.fn()} onClose={jest.fn()} />);
    fireEvent.press(screen.getByLabelText('Enter code manually'));

    const instructions = screen.getByText(/Settings → Connections/);
    expect(instructions.props.style).toMatchObject({ color: lightColors.textSecondary });
    expect(instructions.props.style).not.toMatchObject({
      color: lightColors.cameraOverlayTextMuted,
    });
  });

  it('themes the Dispatch composer placeholder instead of hardcoding white', () => {
    const screen = render(<DispatchTaskComposer />);

    const input = screen.getByPlaceholderText('What should Desktop work on?');
    expect(input.props.placeholderTextColor).toBe(lightColors.textMuted);
  });
});
