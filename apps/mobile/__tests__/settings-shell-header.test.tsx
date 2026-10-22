import React from 'react';
import { ScrollView, Text as RNText } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';

const mockBack = jest.fn();
const mockNavigate = jest.fn();
const mockCanGoBack = jest.fn<boolean, []>();

jest.mock('expo-router', () => ({
  ...jest.requireActual('@/__mocks__/expo-router.mock').expoRouterMock(),
  useRouter: () => ({
    back: mockBack,
    navigate: mockNavigate,
    canGoBack: mockCanGoBack,
  }),
}));

jest.mock('expo-status-bar', () => ({ StatusBar: () => null }));

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock('lucide-react-native', () => {
  const icon = jest.fn().mockReturnValue(null);
  return new Proxy({}, { get: (_target, name) => (name === '__esModule' ? true : icon) });
});

import { SettingsScreenShell } from '../src/features/settings/common';
import { ScreenHeader } from '../src/shared/components/cloud-screen';

function titleStyle(title: string) {
  const header = screen.getByText(title);
  return Array.isArray(header.props.style)
    ? Object.assign({}, ...header.props.style.flat(Infinity).filter(Boolean))
    : header.props.style;
}

describe('settings screen header', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCanGoBack.mockReturnValue(true);
  });

  it('centres the title in semibold on the settings shell', () => {
    render(
      <SettingsScreenShell title="Privacy">
        <RNText>body</RNText>
      </SettingsScreenShell>,
    );

    expect(titleStyle('Privacy')).toMatchObject({ textAlign: 'center', fontWeight: '600' });
    expect(screen.getByRole('header')).toBeTruthy();
  });

  it('goes back through the real history', () => {
    render(
      <SettingsScreenShell title="Privacy">
        <RNText>body</RNText>
      </SettingsScreenShell>,
    );

    fireEvent.press(screen.getByLabelText('Go back'));

    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  it('keeps the scroll indicator on every settings page', () => {
    const { UNSAFE_getByType } = render(
      <SettingsScreenShell title="Privacy">
        <RNText>body</RNText>
      </SettingsScreenShell>,
    );

    expect(UNSAFE_getByType(ScrollView).props.showsVerticalScrollIndicator).not.toBe(false);
  });

  it('centres the title of the cloud screens the same way and keeps the trailing action', () => {
    const onBack = jest.fn();
    render(<ScreenHeader title="Plugins" onBack={onBack} trailing={<RNText>Sources</RNText>} />);

    expect(titleStyle('Plugins')).toMatchObject({ textAlign: 'center', fontWeight: '600' });
    expect(screen.getByText('Sources')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Go back'));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('widens both header slots to the trailing action so the title stays centred', () => {
    const { toJSON } = render(
      <ScreenHeader title="Plugins" onBack={jest.fn()} trailing={<RNText>Sources</RNText>} />,
    );
    const row = (toJSON() as { children: Array<{ props: { onLayout?: unknown; style: object } }> })
      .children;
    const [left, , right] = row;
    expect(left?.props.style).toMatchObject({ minWidth: 44 });
    expect(right?.props.style).toMatchObject({ minWidth: 44 });
  });
});
