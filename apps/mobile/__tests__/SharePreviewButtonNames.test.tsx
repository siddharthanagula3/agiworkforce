import React from 'react';
import { render } from '@testing-library/react-native';

let mockParams: Record<string, string> = {};

jest.mock('expo-router', () => ({
  ...jest.requireActual('@/__mocks__/expo-router.mock').expoRouterMock(),
  useRouter: () => ({
    push: jest.fn(),
    back: jest.fn(),
    replace: jest.fn(),
    canGoBack: () => true,
  }),
  useLocalSearchParams: () => mockParams,
}));

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock('lucide-react-native', () => {
  const icon = jest.fn().mockReturnValue(null);
  return new Proxy({}, { get: () => icon });
});

import SharePreviewScreen from '@/src/features/share-preview';

describe('the share review buttons', () => {
  beforeEach(() => {
    mockParams = { text: 'Shared words to review' };
  });

  it('names the send button by the words it shows', () => {
    const screen = render(<SharePreviewScreen />);

    const button = screen.getByRole('button', { name: 'Send to Chat' });

    expect(screen.getByText('Send to Chat')).toBeTruthy();
    expect(button.props.accessibilityLabel ?? 'Send to Chat').toMatch(/^Send to Chat/);
  });

  it('exposes the Dismiss button to screen readers as a button', () => {
    const screen = render(<SharePreviewScreen />);

    expect(screen.getByRole('button', { name: 'Dismiss' })).toBeTruthy();
  });

  it('gives every labelled button an accessible name that starts with its visible words', () => {
    mockParams = { text: 'Read https://example.com/page now' };
    const screen = render(<SharePreviewScreen />);

    const buttons = screen.getAllByRole('button');
    const mismatched = buttons.flatMap((button) => {
      const label = button.props.accessibilityLabel as string | undefined;
      if (!label) return [];
      const visible = screen
        .getAllByText(/./)
        .filter((text) => button.findAll((node) => node === text).length > 0)
        .map((text) => String(text.props.children));
      return visible.length > 0 && !visible.some((words) => label.startsWith(words)) ? [label] : [];
    });

    expect(buttons.length).toBeGreaterThan(2);
    expect(mismatched).toEqual([]);
  });
});
