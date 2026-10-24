/* eslint-disable @typescript-eslint/no-require-imports */
import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';

jest.mock('lucide-react-native', () => {
  const { View } = require('react-native');
  const Icon = (props: Record<string, unknown>) => <View {...props} />;
  return new Proxy({}, { get: (_target, name) => (name === '__esModule' ? true : Icon) });
});

jest.mock('../src/ui/theme', () => {
  const actual = jest.requireActual('../src/ui/theme/tokens');
  return { useThemeColors: () => actual.lightColors };
});

jest.mock('@/lib/mmkv', () => ({
  whenMmkvReady: jest.fn((callback) => callback()),
  rehydrateWhenMmkvReady: jest.fn(),
  mmkvStorage: {
    getItem: jest.fn().mockReturnValue(null),
    setItem: jest.fn(),
    removeItem: jest.fn(),
  },
  storage: {
    getString: jest.fn().mockReturnValue(undefined),
    set: jest.fn(),
    delete: jest.fn(),
  },
}));

jest.mock('@/lib/safeOpenURL', () => ({
  openUntrustedUrlInAppBrowser: jest.fn().mockResolvedValue(true),
}));

import { openUntrustedUrlInAppBrowser } from '@/lib/safeOpenURL';
import { helpArticleUrl } from '@/src/features/support/HelpArticleLink';
import {
  LibraryFeaturePromoSheet,
  LIBRARY_PROMO_BODY,
  LIBRARY_PROMO_TITLE,
  useLibraryPromoStore,
} from '../src/features/library/LibraryFeaturePromoSheet';

describe('Library feature promo sheet', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useLibraryPromoStore.setState({ hydrated: true, seen: false });
  });

  it('shows once on the first open with its copy and controls', () => {
    const screen = render(<LibraryFeaturePromoSheet />);

    expect(screen.getByText(LIBRARY_PROMO_TITLE)).toBeTruthy();
    expect(screen.getByText(LIBRARY_PROMO_BODY)).toBeTruthy();
    expect(screen.getByLabelText('Learn more')).toBeTruthy();
    expect(screen.getByTestId('library-promo-close')).toBeTruthy();
  });

  it('waits for the saved flag before showing so a returning user never sees a flash', () => {
    useLibraryPromoStore.setState({ hydrated: false, seen: false });
    const screen = render(<LibraryFeaturePromoSheet />);

    expect(screen.queryByText(LIBRARY_PROMO_TITLE)).toBeNull();

    act(() => {
      useLibraryPromoStore.setState({ hydrated: true, seen: true });
    });
    expect(screen.queryByText(LIBRARY_PROMO_TITLE)).toBeNull();
  });

  it('dismisses with the close button and stays dismissed', () => {
    const screen = render(<LibraryFeaturePromoSheet />);

    fireEvent.press(screen.getByTestId('library-promo-close'));

    expect(screen.queryByText(LIBRARY_PROMO_TITLE)).toBeNull();
    expect(useLibraryPromoStore.getState().seen).toBe(true);
    screen.unmount();
    expect(render(<LibraryFeaturePromoSheet />).queryByText(LIBRARY_PROMO_TITLE)).toBeNull();
  });

  it('dismisses when the dimmed area is tapped', () => {
    const screen = render(<LibraryFeaturePromoSheet />);

    fireEvent.press(screen.getByTestId('library-promo-scrim', { hidden: true }));

    expect(screen.queryByText(LIBRARY_PROMO_TITLE)).toBeNull();
  });

  it('opens the Library help article from Learn more and dismisses the sheet', () => {
    const screen = render(<LibraryFeaturePromoSheet />);

    fireEvent.press(screen.getByLabelText('Learn more'));

    expect(openUntrustedUrlInAppBrowser).toHaveBeenCalledWith(helpArticleUrl('library'));
    expect(helpArticleUrl('library')).toMatch(/\/help\/library\?from=mobile$/);
    expect(screen.queryByText(LIBRARY_PROMO_TITLE)).toBeNull();
  });

  it('points at an article the web help centre publishes', () => {
    const { existsSync } = require('fs');
    const { join } = require('path');
    expect(existsSync(join(__dirname, '../../web/content/support/library.md'))).toBe(true);
  });
});
