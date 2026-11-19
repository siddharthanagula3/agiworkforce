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

import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Dimensions, StyleSheet } from 'react-native';
import { renderMathMarkup } from '@agiworkforce/unified-chat/math-markup';
import { chatTypography, getColors } from '../src/ui/theme/tokens';
import { MathBlock } from '../src/features/chat/components/MathBlock';
import { speakMathMarkup } from '../src/features/chat/utils/mathSpeech';

function lastProps() {
  return mockWebViewProps[mockWebViewProps.length - 1]!;
}

function lastDocument(): string {
  return (lastProps().source as { html: string }).html;
}

function reportSize(size: { height: number; width: number; descent?: number }) {
  const onMessage = lastProps().onMessage as (event: { nativeEvent: { data: string } }) => void;
  act(() => {
    onMessage({ nativeEvent: { data: JSON.stringify({ type: 'size', ...size }) } });
  });
}

function spoken(latex: string, display = false): string {
  const markup = renderMathMarkup(latex, display);
  if (!markup.ok) throw new Error(markup.reason);
  return speakMathMarkup(markup.markup);
}

beforeEach(() => {
  mockWebViewProps.length = 0;
  mockTheme.isDark = false;
  mockTheme.colors = getColors('light', 'light', false);
});

describe('wide equations scroll instead of clipping', () => {
  it('lets a display equation wider than its block scroll sideways at its natural width', () => {
    render(<MathBlock latex="a + b + c + d + e + f + g + h + i + j + k + l + m + n" display />);
    fireEvent(screen.getByLabelText(/^Math equation:/), 'layout', {
      nativeEvent: { layout: { width: 300, height: 60, x: 0, y: 0 } },
    });
    expect(screen.queryByTestId('math-scroll')).toBeNull();

    reportSize({ height: 40, width: 900 });

    const scroll = screen.getByTestId('math-scroll');
    expect(StyleSheet.flatten(scroll.props.contentContainerStyle)).toMatchObject({
      width: 900,
      height: 60,
    });
    expect(lastDocument()).toContain('width: max-content');
  });

  it('keeps a display equation that fits as a plain block', () => {
    render(<MathBlock latex="x = 1" display />);
    fireEvent(screen.getByLabelText(/^Math equation:/), 'layout', {
      nativeEvent: { layout: { width: 300, height: 60, x: 0, y: 0 } },
    });
    reportSize({ height: 40, width: 300 });

    expect(screen.queryByTestId('math-scroll')).toBeNull();
  });

  it('caps a long inline formula at the line width and lets it scroll inside', () => {
    const { width } = Dimensions.get('window');
    render(<MathBlock latex="a_1 + a_2 + a_3 + a_4 + a_5 + a_6 + a_7 + a_8" display={false} />);
    reportSize({ height: 30, width: width * 2, descent: 3 });

    const frame = screen.getByLabelText(/^Inline math:/);
    const shown = StyleSheet.flatten(frame.props.style).width as number;
    expect(shown).toBeLessThan(width);
    expect(
      StyleSheet.flatten(screen.getByTestId('math-scroll').props.contentContainerStyle),
    ).toMatchObject({
      width: width * 2,
    });
  });
});

describe('formulas that scroll back into view', () => {
  it('keep their measured size instead of measuring again from a placeholder', () => {
    const first = render(<MathBlock latex="y^3 + 1" display={false} />);
    reportSize({ height: 28, width: 96, descent: 3 });
    first.unmount();

    render(<MathBlock latex="y^3 + 1" display={false} />);

    expect(StyleSheet.flatten(screen.getByLabelText(/^Inline math:/).props.style)).toMatchObject({
      height: 28,
      width: 96,
    });
  });
});

describe('math reads like the words around it', () => {
  it('sizes math to the chat body text and the text size setting', () => {
    const { fontScale } = Dimensions.get('window');
    render(<MathBlock latex="x^2" display={false} />);

    expect(lastDocument()).toContain(`font-size: ${chatTypography.body.fontSize * fontScale}px;`);
  });

  it('paints math in the colour of the text around it, such as a quote', () => {
    render(<MathBlock latex="x^2" display={false} color={mockTheme.colors.textSecondary} />);

    expect(lastDocument()).toContain(`color: ${mockTheme.colors.textSecondary};`);
  });

  it('gives VoiceOver spoken mathematics instead of LaTeX', () => {
    render(<MathBlock latex="a^2 + b^2 = c^2" display={false} />);

    expect(
      screen.getByLabelText('Inline math: a squared plus b squared equals c squared'),
    ).toBeTruthy();
  });

  it.each([
    ['\\frac{1}{2}', '1 over 2'],
    ['\\sqrt{x}', 'the square root of x'],
    ['\\sum_{i=1}^{n} i', 'the sum from i equals 1 to n of i'],
    ['x^{n+1}', 'x to the power of n plus 1'],
    ['\\hat{x} \\le 3', 'x hat is less than or equal to 3'],
    ['\\sqrt[3]{8}', 'the cube root of 8'],
  ])('speaks %s', (latex, words) => {
    expect(spoken(latex)).toBe(words);
  });
});
