/* eslint-disable @typescript-eslint/no-require-imports */
import React from 'react';
import { Platform, ScrollView, StyleSheet } from 'react-native';
import { render } from '@testing-library/react-native';
import type { ReactTestInstance } from 'react-test-renderer';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';

jest.mock('@/src/ui/theme', () => {
  const actual = jest.requireActual('@/src/ui/theme/tokens');
  return { ...actual, useThemeColors: () => actual.lightColors };
});

jest.mock('@/components/ui/Text', () => {
  const RN = require('react-native');
  const Text = (props: Record<string, unknown>) => <RN.Text {...props} />;
  Text.displayName = 'Text';
  return { Text };
});

jest.mock(
  'lucide-react-native',
  () => new Proxy({}, { get: () => jest.fn().mockReturnValue(null) }),
);

jest.mock('@/services/contentReport', () => ({
  saveContentReport: jest.fn(),
  openSupportEmail: jest.fn().mockResolvedValue(true),
  sendStoredContentReport: jest.fn(),
  resumeQueuedContentReports: jest.fn(),
}));

import { ReportSheet } from '@/src/features/chat/components/ReportFlagButton';

const METRICS: Metrics = {
  frame: { x: 0, y: 0, width: 412, height: 915 },
  insets: { top: 24, left: 0, right: 0, bottom: 48 },
};

const TARGET = {
  messageId: 'msg-1',
  conversationId: 'conv-1',
  contentExcerpt: 'Some assistant response text',
};

const originalOS = Platform.OS;

function setPlatform(os: 'ios' | 'android'): void {
  Object.defineProperty(Platform, 'OS', { get: () => os, configurable: true });
}

function ancestorPadding(node: ReactTestInstance, side: 'Top' | 'Bottom'): number {
  let total = 0;
  for (let current: ReactTestInstance | null = node.parent; current; current = current.parent) {
    if (typeof current.type !== 'string') continue;
    const style = (StyleSheet.flatten(current.props.style) ?? {}) as Record<string, unknown>;
    total += Number(style[`padding${side}`] ?? style.paddingVertical ?? style.padding ?? 0);
  }
  return total;
}

function renderSheet() {
  return render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <ReportSheet visible onClose={jest.fn()} target={TARGET} />
    </SafeAreaProvider>,
  );
}

afterEach(() => {
  Object.defineProperty(Platform, 'OS', { get: () => originalOS, configurable: true });
});

function headerPadding(): number {
  const screen = renderSheet();
  const close = screen.getByLabelText('Close');
  let header = close.parent;
  while (header && typeof header.type !== 'string') header = header.parent;
  const style = (StyleSheet.flatten(header?.props.style) ?? {}) as Record<string, unknown>;
  screen.unmount();
  return Number(style.paddingTop ?? 0);
}

describe('ReportSheet window insets', () => {
  it('keeps Close below the status bar on Android, where the sheet fills the window', () => {
    setPlatform('android');
    const ownPadding = headerPadding();
    const screen = renderSheet();

    expect(ancestorPadding(screen.getByLabelText('Close'), 'Top')).toBe(
      METRICS.insets.top + ownPadding,
    );
    expect(ancestorPadding(screen.UNSAFE_getByType(ScrollView), 'Bottom')).toBe(
      METRICS.insets.bottom,
    );
  });

  it('leaves the iOS page sheet as UIKit lays it out', () => {
    setPlatform('ios');
    const ownPadding = headerPadding();
    const screen = renderSheet();

    expect(ancestorPadding(screen.getByLabelText('Close'), 'Top')).toBe(ownPadding);
    expect(ancestorPadding(screen.UNSAFE_getByType(ScrollView), 'Bottom')).toBe(0);
  });
});
