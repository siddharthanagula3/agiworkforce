/* eslint-disable @typescript-eslint/no-require-imports */

const mockWebViewProps: Array<Record<string, unknown>> = [];

jest.mock('react-native-webview', () => {
  const { View } = require('react-native');
  return {
    WebView: (props: Record<string, unknown>) => {
      mockWebViewProps.push(props);
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

import { act, render } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { getColors } from '../src/ui/theme/tokens';
import {
  MathBlock,
  buildMathDocument,
  readMathSize,
} from '../src/features/chat/components/MathBlock';

function lastDocument(): string {
  const props = mockWebViewProps[mockWebViewProps.length - 1];
  return (props?.source as { html: string }).html;
}

beforeEach(() => {
  mockWebViewProps.length = 0;
  mockTheme.isDark = false;
  mockTheme.colors = getColors('light', 'light', false);
});

describe('MathBlock without a network', () => {
  it('draws the equation from MathML built on the device and loads nothing', () => {
    render(<MathBlock latex="x = \frac{-b \pm \sqrt{b^2 - 4ac}}{2a}" display />);

    const html = lastDocument();
    expect(html).toContain('<math');
    expect(html).toContain('<mfrac>');
    expect(html).toContain("default-src 'none'");
    expect(html).not.toMatch(/<link|<img|\b(?:src|href)=|url\(/i);
  });

  it('paints the equation in the Local or Cloud theme the app is showing, not the system one', () => {
    mockTheme.isDark = true;
    mockTheme.colors = getColors('dark', 'light', false);

    render(<MathBlock latex="a^2 + b^2 = c^2" display={false} />);

    expect(lastDocument()).toContain(`color: ${mockTheme.colors.textPrimary};`);
  });

  it('shows the source instead of a broken frame when the LaTeX cannot be parsed', () => {
    const screen = render(<MathBlock latex="\frac{1}{" display />);

    expect(screen.queryByTestId('math-webview')).toBeNull();
    expect(screen.getByText('\\frac{1}{')).toBeTruthy();
  });

  it('sizes inline math to the measured equation and sets its baseline on the text baseline', () => {
    const screen = render(
      <MathBlock latex="\sum_{i=1}^{n} i = \frac{n(n+1)}{2}" display={false} />,
    );
    const onMessage = mockWebViewProps[mockWebViewProps.length - 1]?.onMessage as (event: {
      nativeEvent: { data: string };
    }) => void;

    act(() => {
      onMessage({
        nativeEvent: { data: JSON.stringify({ type: 'size', height: 30, width: 152, descent: 7 }) },
      });
    });

    const frame = screen.getByLabelText('Inline math: \\sum_{i=1}^{n} i = \\frac{n(n+1)}{2}');
    expect(StyleSheet.flatten(frame.props.style)).toMatchObject({
      height: 30,
      width: 152,
      transform: [{ translateY: 4 }],
    });
  });
});

describe('readMathSize', () => {
  it('keeps display math full width and reads only well-formed size messages', () => {
    expect(
      readMathSize(JSON.stringify({ type: 'size', height: 40, width: 300, descent: 9 }), true),
    ).toEqual({ height: 60, width: null, baselineOffset: 0 });
    expect(readMathSize(JSON.stringify({ type: 'size', height: 0, width: 10 }), false)).toBeNull();
    expect(readMathSize('not json', false)).toBeNull();
  });

  it('builds a document whose only script reports the size and, inline, the baseline', () => {
    const colors = getColors('light', 'light', false);
    const inline = buildMathDocument('<math></math>', false, colors);
    const display = buildMathDocument('<math display="block"></math>', true, colors);

    expect(inline.match(/<script/g)).toHaveLength(1);
    expect(inline).toContain("type: 'size'");
    expect(inline).toContain('<math></math><span id="math-baseline"></span>');
    expect(display).not.toContain('<span id="math-baseline">');
  });
});
