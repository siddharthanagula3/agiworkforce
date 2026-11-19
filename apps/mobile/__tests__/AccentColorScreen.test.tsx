import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';

jest.mock('../lib/mmkv', () => ({
  whenMmkvReady: jest.fn((cb: () => void) => cb()),
  rehydrateWhenMmkvReady: jest.fn(),
  mmkvStorage: {
    getItem: jest.fn().mockReturnValue(null),
    setItem: jest.fn(),
    removeItem: jest.fn(),
  },
}));

jest.mock('../src/ui/theme/useSystemHighContrast', () => ({
  useSystemHighContrast: () => false,
}));

jest.mock('lucide-react-native', () => {
  const icon = jest.fn().mockReturnValue(null);
  return new Proxy({}, { get: (_target, name) => (name === '__esModule' ? true : icon) });
});

jest.mock('../src/features/settings/Common', () => {
  const RN = jest.requireActual('react-native');
  return {
    SettingsScreenShell: ({ title, children }: { title: string; children: React.ReactNode }) => (
      <RN.View>
        <RN.Text accessibilityRole="header">{title}</RN.Text>
        {children}
      </RN.View>
    ),
    SettingsGroup: ({ children }: { children: React.ReactNode }) => <RN.View>{children}</RN.View>,
    SettingsInfo: () => null,
  };
});

import AccentColorScreen from '../src/features/settings/accent-color';
import { useChatAppModeStore } from '../src/features/chat/store/appModeStore';
import { getAccentSwatch } from '../src/ui/theme/tokens';
import { useCloudSettingsStore } from '../stores/settings/cloudSettingsStore';
import { useLocalSettingsStore } from '../stores/settings/localSettingsStore';

const LABELS = [
  'Neutral',
  'Blue',
  'Cyan',
  'Green',
  'Lime',
  'Yellow',
  'Orange',
  'Rose',
  'Magenta',
  'Violet',
];

describe('Accent Color screen', () => {
  beforeEach(() => {
    useChatAppModeStore.setState({ appMode: 'local' });
    useLocalSettingsStore.setState({ themeMode: 'light', accentColor: 'neutral' });
    useCloudSettingsStore.setState({ themeMode: 'light', accentColor: 'neutral' });
  });

  it('lists the ten colours in order', () => {
    const { getAllByRole } = render(<AccentColorScreen />);
    const rows = getAllByRole('button').map((row) => row.props.accessibilityLabel);
    expect(rows).toEqual(LABELS.map((label) => `Set accent color to ${label}`));
  });

  it('draws a 22 point dot in each colour next to the label', () => {
    const { getByLabelText } = render(<AccentColorScreen />);
    const dot = getByLabelText('Set accent color to Yellow').findAll(
      (node) => node.props.style?.width === 22,
    )[0];
    expect(dot?.props.style).toMatchObject({
      width: 22,
      height: 22,
      backgroundColor: getAccentSwatch('yellow', false),
    });
  });

  it.each(LABELS.slice(1))('applies %s at once in Local mode', (label) => {
    const { getByLabelText } = render(<AccentColorScreen />);
    fireEvent.press(getByLabelText(`Set accent color to ${label}`));
    expect(useLocalSettingsStore.getState().accentColor).toBe(label.toLowerCase());
    expect(useCloudSettingsStore.getState().accentColor).toBe('neutral');
  });

  it('saves to the Cloud store in Cloud mode', () => {
    useChatAppModeStore.setState({ appMode: 'cloud' });
    const { getByLabelText } = render(<AccentColorScreen />);
    fireEvent.press(getByLabelText('Set accent color to Magenta'));
    expect(useCloudSettingsStore.getState().accentColor).toBe('magenta');
    expect(useLocalSettingsStore.getState().accentColor).toBe('neutral');
  });

  it('marks only the saved colour as selected', () => {
    useLocalSettingsStore.setState({ accentColor: 'lime' });
    const { getByLabelText } = render(<AccentColorScreen />);
    for (const label of LABELS) {
      const row = getByLabelText(`Set accent color to ${label}`);
      expect(row.props.accessibilityState?.selected).toBe(label === 'Lime');
    }
  });

  it('shows Neutral as selected for a colour this version does not know', () => {
    useLocalSettingsStore.setState({ accentColor: 'chartreuse' as never });
    const { getByLabelText } = render(<AccentColorScreen />);
    expect(getByLabelText('Set accent color to Neutral').props.accessibilityState.selected).toBe(
      true,
    );
  });
});
