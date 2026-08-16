
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

    expect(getByText('"Hey Siri, start chat with AGI Workforce"')).toBeTruthy();
    expect(getByText('"Hey Siri, set reminder via AGI Workforce"')).toBeTruthy();

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
    expect(getByText('Review and create a real Apple Reminder')).toBeTruthy();
    expect(getAllByText(/choose Share to AGI/i).length).toBeGreaterThan(0);
    expect(getByText(/Save for AGI Review/)).toBeTruthy();
    expect(getByText(/then open AGI Workforce/)).toBeTruthy();
    expect(queryByText(/not yet available on iOS/)).toBeNull();

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

    expect(queryByText(/widget/i)).toBeNull();
    expect(queryByText(/Google Assistant/)).toBeNull();
    expect(queryByText(/Control Center/)).toBeNull();
    expect(queryByText(/Hey Siri/)).toBeNull();
  });
});
