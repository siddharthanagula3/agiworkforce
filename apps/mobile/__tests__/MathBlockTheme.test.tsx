/* eslint-disable @typescript-eslint/no-require-imports */

const mockWebView = jest.fn((_props: { source: { html: string } }) => null);
jest.mock('react-native-webview', () => ({
  WebView: (props: { source: { html: string } }) => mockWebView(props),
}));

let mockTheme: {
  colors: Record<string, string>;
  isDark: boolean;
  isHighContrast: boolean;
};
jest.mock('@/src/ui/theme', () => {
  const tokens = jest.requireActual('@/src/ui/theme/tokens');
  return {
    ...tokens,
    useTheme: () => mockTheme,
    useThemeColors: () => mockTheme.colors,
  };
});

jest.mock('@/components/ui/Text', () => {
  const RN = require('react-native');
  const Text = (props: Record<string, unknown>) => require('react').createElement(RN.Text, props);
  Text.displayName = 'Text';
  return { Text };
});

import React from 'react';
import { act, create } from 'react-test-renderer';
import {
  colors,
  highContrastColors,
  highContrastLightColors,
  lightColors,
} from '../src/ui/theme/tokens';
import { MathBlock } from '../src/features/chat/components/MathBlock';

function renderedHtml(display: boolean): string {
  mockWebView.mockClear();
  act(() => {
    create(React.createElement(MathBlock, { latex: 'x^2', display }));
  });
  return mockWebView.mock.calls[0]?.[0].source.html ?? '';
}

describe('MathBlock follows the appearance the app resolved', () => {
  it.each([
    ['dark', true, colors],
    ['light', false, lightColors],
  ] as const)('draws %s equations from the resolved theme', (_label, isDark, themeColors) => {
    mockTheme = { colors: themeColors, isDark, isHighContrast: false };

    const display = renderedHtml(true);
    const inline = renderedHtml(false);

    for (const html of [display, inline]) {
      expect(html).toContain('background: transparent');
      expect(html).toContain(`color: ${themeColors.textPrimary}`);
    }
  });

  it('uses the high contrast colours when the system asks for them', () => {
    mockTheme = { colors: highContrastColors, isDark: true, isHighContrast: true };
    const dark = renderedHtml(true);
    expect(dark).toContain('background: transparent');
    expect(dark).toContain(`color: ${highContrastColors.textPrimary}`);

    mockTheme = { colors: highContrastLightColors, isDark: false, isHighContrast: true };
    const light = renderedHtml(false);
    expect(light).toContain('background: transparent');
    expect(light).toContain(`color: ${highContrastLightColors.textPrimary}`);
  });
});
