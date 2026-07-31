/**
 * Regression: the Quick Access screen (route /(app)/widget-setup) previously
 * advertised integrations with no native target in the repo — long-press Quick
 * Actions, an iOS 18 Control Center tile, and an Android home-screen widget.
 * None of those exist (no expo-quick-actions, no widget extension, no
 * ControlWidget), so the instructions dead-ended for every user — a fake-
 * availability product-rule violation.
 *
 * The screen now describes only what ships:
 *   iOS      — Siri App Shortcuts, native text/link Share Extension, and
 *              universal links.
 *   Android  — share-sheet target + selected-text (ACTION_PROCESS_TEXT)
 *              action (both rewritten by MainActivity.kt onto the
 *              agiworkforce://intent/share deep link) and verified app links.
 */

/* eslint-disable @typescript-eslint/no-require-imports */
import React from 'react';
import { Platform } from 'react-native';
import { render } from '@testing-library/react-native';

jest.mock('expo-router', () => ({
  useRouter: () => ({ canGoBack: () => false, back: jest.fn(), replace: jest.fn() }),
}));

jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return {
    SafeAreaView: ({ children }: { children: React.ReactNode }) => <View>{children}</View>,
  };
});

jest.mock('lucide-react-native', () => {
  const { Text } = require('react-native');
  const icon = () => <Text>icon</Text>;
  return {
    ArrowLeft: icon,
    Smartphone: icon,
    Mic: icon,
    Camera: icon,
    MessageSquare: icon,
    Zap: icon,
    Share2: icon,
    Link2: icon,
    HelpCircle: icon,
    FileText: icon,
    Languages: icon,
    ScanLine: icon,
    Bell: icon,
    TextCursorInput: icon,
  };
});

import WidgetSetupScreen from '../src/features/widget-setup';

const originalOS = Platform.OS;

function setPlatform(os: 'ios' | 'android') {
  Object.defineProperty(Platform, 'OS', { get: () => os, configurable: true });
}

afterEach(() => {
  Object.defineProperty(Platform, 'OS', { get: () => originalOS, configurable: true });
});

describe('Quick Access screen — describes only real integrations', () => {
  it('iOS: lists the real Siri App Shortcuts and native share-extension review flow', () => {
    setPlatform('ios');
    const { getAllByText, getByText, queryByText } = render(<WidgetSetupScreen />);

    // Real Siri phrases (mirror native/ios/AGIAppIntents/AppShortcuts.swift).
    expect(getByText('"Hey Siri, start chat with AGI Workforce"')).toBeTruthy();
    expect(getByText('"Hey Siri, set reminder via AGI Workforce"')).toBeTruthy();

    // All 8 shipped App Intents are listed.
    for (const label of [
      'Start Chat',
      'Ask AGI',
      'Summarize',
      'Analyze Image',
      'Transcribe',
      'Translate',
      'Scan',
      'Set Reminder',
    ]) {
      expect(getByText(label)).toBeTruthy();
    }

    expect(getByText('Share Sheet')).toBeTruthy();
    expect(getAllByText(/choose Share to AGI/i).length).toBeGreaterThan(0);
    expect(getByText(/Save for AGI Review/)).toBeTruthy();
    expect(getByText(/then open AGI Workforce/)).toBeTruthy();
    expect(queryByText(/not yet available on iOS/)).toBeNull();

    // Retired fake-availability copy must not come back.
    expect(queryByText(/Control Center/)).toBeNull();
    expect(queryByText(/Long-press/)).toBeNull();
    expect(queryByText(/widget/i)).toBeNull();
  });

  it('Android: describes the share sheet and selected-text flows, no widget or Assistant setup claims', () => {
    setPlatform('android');
    const { getByText, queryByText } = render(<WidgetSetupScreen />);

    expect(getByText('Share From Any App')).toBeTruthy();
    expect(getByText('Act On Selected Text')).toBeTruthy();
    expect(getByText('Links Open In The App')).toBeTruthy();

    // Retired fake-availability copy must not come back.
    expect(queryByText(/widget/i)).toBeNull();
    expect(queryByText(/Google Assistant/)).toBeNull();
    expect(queryByText(/Control Center/)).toBeNull();
    // Siri does not exist on Android.
    expect(queryByText(/Hey Siri/)).toBeNull();
  });
});
