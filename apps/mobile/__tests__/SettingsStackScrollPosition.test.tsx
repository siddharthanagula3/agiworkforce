/* eslint-disable @typescript-eslint/no-require-imports */
import React, { useEffect } from 'react';
import { Text } from 'react-native';
import { renderRouter, screen, testRouter } from 'expo-router/testing-library';
import { Drawer } from 'expo-router/drawer';

jest.unmock('expo-router');

jest.mock('@/src/ui/theme', () => ({
  useTheme: () => ({ colors: { background: '#000', surfaceBase: '#fff' }, isDark: false }),
}));

const settingsMounts = jest.fn();
const settingsUnmounts = jest.fn();

function AppDrawer() {
  return <Drawer backBehavior="history" screenOptions={{ headerShown: false }} />;
}

function SettingsHome() {
  useEffect(() => {
    settingsMounts();
    return () => settingsUnmounts();
  }, []);
  return <Text>Settings home</Text>;
}

function page(label: string) {
  return function Page() {
    return <Text>{label}</Text>;
  };
}

function renderApp() {
  const SettingsLayout = require('../app/(app)/settings/_layout').default;
  return renderRouter(
    {
      '(app)/_layout': AppDrawer,
      '(app)/index': page('Chat'),
      '(app)/about': page('About'),
      '(app)/settings/_layout': SettingsLayout,
      '(app)/settings/index': SettingsHome,
      '(app)/settings/cloud-billing': page('Subscription'),
    },
    { initialUrl: '/' },
  );
}

describe('Settings keeps its place when a person comes back to it', () => {
  beforeEach(() => {
    settingsMounts.mockClear();
    settingsUnmounts.mockClear();
  });

  it('keeps the same Settings page mounted after a row opens a screen outside the settings stack', () => {
    renderApp();
    testRouter.navigate('/settings');
    expect(settingsMounts).toHaveBeenCalledTimes(1);

    testRouter.push('/about');
    expect(screen.getByText('About')).toBeTruthy();
    testRouter.back('/settings');

    expect(screen.getByText('Settings home')).toBeTruthy();
    expect(settingsMounts).toHaveBeenCalledTimes(1);
    expect(settingsUnmounts).not.toHaveBeenCalled();
  });

  it('keeps the same Settings page mounted on every return after a settings page was opened', () => {
    renderApp();
    testRouter.navigate('/settings');
    testRouter.push('/settings/cloud-billing');
    testRouter.back('/settings');
    for (let visit = 0; visit < 3; visit += 1) {
      testRouter.push('/about');
      testRouter.back('/settings');
    }

    expect(settingsMounts).toHaveBeenCalledTimes(1);
    expect(settingsUnmounts).not.toHaveBeenCalled();
  });

  it('keeps the same Settings page mounted after a settings page pops', () => {
    renderApp();
    testRouter.navigate('/settings');
    testRouter.push('/settings/cloud-billing');
    expect(screen.getByText('Subscription')).toBeTruthy();
    testRouter.back('/settings');

    expect(screen.getByText('Settings home')).toBeTruthy();
    expect(settingsMounts).toHaveBeenCalledTimes(1);
    expect(settingsUnmounts).not.toHaveBeenCalled();
  });

  it('keeps the same Settings page mounted when a settings page opens a screen outside the stack', () => {
    renderApp();
    testRouter.navigate('/settings');
    testRouter.push('/settings/cloud-billing');
    testRouter.push('/about');
    testRouter.back('/settings');

    expect(screen.getByText('Settings home')).toBeTruthy();
    expect(settingsMounts).toHaveBeenCalledTimes(1);
    expect(settingsUnmounts).not.toHaveBeenCalled();
  });

  it('opens a fresh Settings page at the top after Settings was closed', () => {
    renderApp();
    testRouter.navigate('/settings');
    testRouter.back();
    expect(screen.getByText('Chat')).toBeTruthy();
    testRouter.navigate('/settings');

    expect(screen.getByText('Settings home')).toBeTruthy();
    expect(settingsMounts).toHaveBeenCalledTimes(2);
    expect(settingsUnmounts).toHaveBeenCalledTimes(1);
  });

  it('opens a fresh Settings page at the top after Settings was closed from a page it had opened', () => {
    renderApp();
    testRouter.navigate('/settings');
    testRouter.push('/settings/cloud-billing');
    testRouter.back('/settings');
    testRouter.back();
    expect(screen.getByText('Chat')).toBeTruthy();
    testRouter.navigate('/settings');

    expect(screen.getByText('Settings home')).toBeTruthy();
    expect(settingsMounts).toHaveBeenCalledTimes(2);
    expect(settingsUnmounts).toHaveBeenCalledTimes(1);
  });

  it('opens Settings at its own page again after a visit that left a settings page open', () => {
    renderApp();
    testRouter.navigate('/settings');
    testRouter.push('/settings/cloud-billing');
    expect(screen.getByText('Subscription')).toBeTruthy();
    testRouter.navigate('/');
    testRouter.navigate('/settings');

    expect(screen.getByText('Settings home')).toBeTruthy();
    expect(screen.queryByText('Subscription')).toBeNull();
  });
});
