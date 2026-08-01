/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * PAR-M28 — pre-pair desktop setup checklist, download path, risk disclosure.
 *
 * Before this, the first Dispatch screen was a "Scan QR Code" primary with the
 * prerequisites rendered *below* it under a "HOW IT WORKS" divider, no download
 * hand-off for a user without Desktop installed, and no statement anywhere that
 * pairing lets a remote computer act on this phone's behalf. A
 * remote-execution grant was one unannotated button press.
 *
 * These tests pin: the checklist gates first entry, the steps precede the CTA,
 * the risk copy renders before any pairing action is reachable, the safety link
 * points at a route that actually exists under apps/web/app, and the
 * email hand-off carries the real download URL.
 */
import fs from 'fs';
import path from 'path';

import React from 'react';
import { Linking } from 'react-native';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

const mockOpenExternalUrl = jest.fn().mockResolvedValue(true);

jest.mock('@/lib/safeOpenURL', () => ({
  openExternalUrl: (...args: unknown[]) => mockOpenExternalUrl(...args),
  isAllowedExternalUrl: jest.requireActual('../lib/safeOpenURL').isAllowedExternalUrl,
}));

// jest-expo already stubs the TurboModule, so spying beats re-mocking
// react-native (which trips the TurboModule invariant) — same approach as
// __tests__/coverage-wave2-content-report.test.ts.
const canOpenURLSpy = jest.spyOn(Linking, 'canOpenURL');
const openURLSpy = jest.spyOn(Linking, 'openURL');

jest.mock('react-native-reanimated', () => {
  const { View } = require('react-native');
  const transition = { duration: () => transition, springify: () => transition };
  return {
    __esModule: true,
    default: { View },
    FadeIn: transition,
    FadeOut: transition,
    SlideInDown: transition,
    SlideOutDown: transition,
  };
});

jest.mock('lucide-react-native', () => {
  const { View } = require('react-native');
  return new Proxy({}, { get: () => (props: Record<string, unknown>) => <View {...props} /> });
});

jest.mock('@/components/ui/text', () => {
  const { Text } = require('react-native');
  return { Text };
});

jest.mock('@/components/ui/button', () => {
  const { Pressable, Text } = require('react-native');
  return {
    Button: ({ title, onPress }: { title: string; onPress: () => void }) => (
      <Pressable accessibilityRole="button" accessibilityLabel={title} onPress={onPress}>
        <Text>{title}</Text>
      </Pressable>
    ),
  };
});

jest.mock('@/lib/mmkv', () => ({
  mmkvStorage: { getItem: jest.fn(), setItem: jest.fn(), removeItem: jest.fn() },
  rehydrateWhenMmkvReady: jest.fn(),
}));

const mockUser: { primaryEmailAddress: { emailAddress: string } | null } | null = {
  primaryEmailAddress: { emailAddress: 'founder@agiworkforce.com' },
};
jest.mock('@clerk/expo', () => ({
  useUser: () => ({ user: mockUser, isLoaded: true, isSignedIn: true }),
}));

jest.mock('@/src/ui/theme', () => {
  const tokens = jest.requireActual('@/src/ui/theme/tokens');
  return {
    ...tokens,
    colors: tokens.colors,
    useThemeColors: () => tokens.colors,
    useTheme: () => ({
      colors: tokens.colors,
      isDark: true,
      isHighContrast: false,
      statusBarStyle: 'light',
    }),
  };
});

import {
  DesktopSetupChecklistView,
  DESKTOP_DOWNLOAD_URL,
  buildDesktopLinkMailto,
  useDispatchSetupStore,
} from '../src/features/companion/components/DesktopSetupChecklistView';
import {
  DISPATCH_SAFETY_URL,
  PairingRiskDisclosure,
} from '../src/features/companion/components/PairingRiskDisclosure';
import { DisconnectedView } from '../src/features/companion/components/ConnectionStateViews';
import { isAllowedExternalUrl } from '../lib/safeOpenURL';

const WEB_APP_ROOT = path.resolve(__dirname, '../../web/app');

/** Text nodes in render order, so "above the CTA" is a real assertion. */
function textsInOrder(node: unknown, acc: string[] = []): string[] {
  if (typeof node === 'string') {
    acc.push(node);
    return acc;
  }
  if (Array.isArray(node)) {
    node.forEach((child) => textsInOrder(child, acc));
    return acc;
  }
  if (node && typeof node === 'object') {
    textsInOrder((node as { children?: unknown }).children, acc);
  }
  return acc;
}

function indexOfMatch(texts: string[], pattern: RegExp): number {
  return texts.findIndex((text) => pattern.test(text));
}

beforeEach(() => {
  jest.clearAllMocks();
  mockOpenExternalUrl.mockResolvedValue(true);
  canOpenURLSpy.mockResolvedValue(true);
  openURLSpy.mockResolvedValue(undefined as never);
  useDispatchSetupStore.setState({ hasSeenDispatchSetup: false });
});

describe('PAR-M28 — DesktopSetupChecklistView', () => {
  it('renders the three prerequisites ABOVE the pairing CTA', () => {
    const screen = render(<DesktopSetupChecklistView />);
    const texts = textsInOrder(screen.toJSON());

    const firstStep = indexOfMatch(texts, /Install AGI Workforce on your computer/);
    const lastStep = indexOfMatch(texts, /Turn on Dispatch in Settings/);
    const cta = indexOfMatch(texts, /continue to pairing/);

    expect(firstStep).toBeGreaterThanOrEqual(0);
    expect(lastStep).toBeGreaterThan(firstStep);
    expect(cta).toBeGreaterThan(lastStep);
  });

  it('echoes the signed-in account in the second step', () => {
    const screen = render(<DesktopSetupChecklistView />);
    expect(screen.getByText('Sign in on that computer as founder@agiworkforce.com')).toBeTruthy();
  });

  it('renders the risk paragraph directly beneath the pair button', () => {
    const screen = render(<DesktopSetupChecklistView />);
    const texts = textsInOrder(screen.toJSON());

    const cta = indexOfMatch(texts, /continue to pairing/);
    const risk = indexOfMatch(texts, /Only pair devices you trust/);
    const safetyLink = indexOfMatch(texts, /Learn how to use this safely/);

    expect(risk).toBeGreaterThan(cta);
    expect(safetyLink).toBeGreaterThan(risk);
    expect(screen.getByText(/use your desktop to run the tasks you send/)).toBeTruthy();
  });

  it('marks the gate seen when the user continues, so it shows once', () => {
    const onContinue = jest.fn();
    const screen = render(<DesktopSetupChecklistView onContinue={onContinue} />);

    expect(useDispatchSetupStore.getState().hasSeenDispatchSetup).toBe(false);
    fireEvent.press(screen.getByLabelText('Done — continue to pairing'));

    expect(useDispatchSetupStore.getState().hasSeenDispatchSetup).toBe(true);
    expect(onContinue).toHaveBeenCalledTimes(1);
  });

  it('opens a mailto carrying the real desktop download URL, pre-addressed to the account', async () => {
    const screen = render(<DesktopSetupChecklistView />);

    fireEvent.press(screen.getByLabelText('Email me the desktop app link'));

    await waitFor(() => expect(openURLSpy).toHaveBeenCalledTimes(1));
    const url = openURLSpy.mock.calls[0][0];
    expect(url.startsWith('mailto:founder@agiworkforce.com?')).toBe(true);
    expect(decodeURIComponent(url)).toContain(DESKTOP_DOWNLOAD_URL);
  });

  it('builds an unaddressed mailto when no account email is known', () => {
    const url = buildDesktopLinkMailto(null);
    expect(url.startsWith('mailto:?')).toBe(true);
    expect(decodeURIComponent(url)).toContain(DESKTOP_DOWNLOAD_URL);
  });
});

describe('PAR-M28 — PairingRiskDisclosure', () => {
  it('routes the safety link through the openExternalUrl allowlist', async () => {
    const screen = render(<PairingRiskDisclosure />);

    fireEvent.press(screen.getByText('Learn how to use this safely'));

    await waitFor(() => expect(mockOpenExternalUrl).toHaveBeenCalledWith(DISPATCH_SAFETY_URL));
    // Never raw Linking — that would bypass the allowlist chokepoint.
    expect(openURLSpy).not.toHaveBeenCalled();
  });

  it('targets a URL the allowlist actually accepts', () => {
    expect(isAllowedExternalUrl(DISPATCH_SAFETY_URL)).toBe(true);
    expect(isAllowedExternalUrl(DESKTOP_DOWNLOAD_URL)).toBe(true);
  });

  it('targets pages that exist under apps/web/app (no repeat of the dead /licenses row)', () => {
    for (const url of [DISPATCH_SAFETY_URL, DESKTOP_DOWNLOAD_URL]) {
      const route = new URL(url).pathname.replace(/^\//, '');
      const page = path.join(WEB_APP_ROOT, route, 'page.tsx');
      expect({ url, exists: fs.existsSync(page) }).toEqual({ url, exists: true });
    }
  });
});

describe('PAR-M28 — DisconnectedView (returning users)', () => {
  it('also states the risk before the scanner is reachable', () => {
    const screen = render(<DisconnectedView onScanPress={jest.fn()} />);

    expect(screen.getByText(/Only pair devices you trust/)).toBeTruthy();
    expect(screen.getByText('Learn how to use this safely')).toBeTruthy();
  });

  it('puts the prerequisites above the Scan QR Code button, not below it', () => {
    const screen = render(<DisconnectedView onScanPress={jest.fn()} />);
    const texts = textsInOrder(screen.toJSON());

    const lastStep = indexOfMatch(texts, /Generate and scan the short-lived code/);
    const cta = indexOfMatch(texts, /^Scan QR Code$/);

    expect(lastStep).toBeGreaterThanOrEqual(0);
    expect(cta).toBeGreaterThan(lastStep);
    // The "scan first, read later" divider is gone.
    expect(indexOfMatch(texts, /HOW IT WORKS/)).toBe(-1);
  });
});
