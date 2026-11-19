/* eslint-disable @typescript-eslint/no-require-imports */

const mockWebViewProps: Array<Record<string, unknown>> = [];
let mockMounts = 0;

jest.mock('react-native-webview', () => {
  const { View } = require('react-native');
  const { useEffect } = require('react');
  return {
    WebView: (props: Record<string, unknown>) => {
      mockWebViewProps.push(props);
      useEffect(() => {
        mockMounts += 1;
      }, []);
      return require('react').createElement(View, { testID: 'math-webview' });
    },
  };
});

const mockTheme = { isDark: false, colors: {} as Record<string, string> };

jest.mock('@/src/ui/theme', () => {
  const tokens = jest.requireActual('@/src/ui/theme/tokens');
  return {
    ...tokens,
    useTheme: () => mockTheme,
    useThemeColors: () => mockTheme.colors,
  };
});

import { act, render, screen } from '@testing-library/react-native';
import { getColors } from '../src/ui/theme/tokens';
import { MathBlock } from '../src/features/chat/components/MathBlock';

function reclaim() {
  const props = mockWebViewProps[mockWebViewProps.length - 1]!;
  act(() => (props.onContentProcessDidTerminate as () => void)());
}

beforeEach(() => {
  mockWebViewProps.length = 0;
  mockMounts = 0;
  mockTheme.colors = getColors('light', 'light', false);
});

describe('a formula whose web content process was reclaimed', () => {
  it('draws the formula again', () => {
    render(<MathBlock latex="x^2 + y^2 = z^2" display />);
    expect(mockMounts).toBe(1);

    reclaim();

    expect(mockMounts).toBe(2);
  });

  it('shows the formula as written when the system keeps reclaiming it', () => {
    render(<MathBlock latex="x^2 + y^2 = z^2" display />);

    for (let reclaimed = 0; reclaimed < 4; reclaimed += 1) reclaim();

    expect(screen.queryByTestId('math-webview')).toBeNull();
    expect(screen.getByText('x^2 + y^2 = z^2')).toBeTruthy();
  });
});
