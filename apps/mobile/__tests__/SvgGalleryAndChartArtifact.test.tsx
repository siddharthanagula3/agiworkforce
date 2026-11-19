/* eslint-disable @typescript-eslint/no-require-imports */

type WebViewProps = { source: { html: string }; javaScriptEnabled?: boolean };
const mockWebViews: WebViewProps[] = [];

jest.mock('react-native-webview', () => {
  const { View } = require('react-native');
  return {
    __esModule: true,
    WebView: (props: WebViewProps) => {
      mockWebViews.push(props);
      return require('react').createElement(View, { testID: 'svg-webview' });
    },
  };
});

import { fireEvent, render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { extractSvgSlides } from '@agiworkforce/unified-chat/svg-gallery';
import { ChartArtifactView } from '../src/features/chat/components/ChartArtifactView';
import { SvgGallery } from '../src/features/chat/components/SvgGallery';
import { lightColors } from '../src/ui/theme/tokens';

const square = (fill: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10" fill="${fill}"/></svg>`;

function lastHtml(): string {
  return mockWebViews[mockWebViews.length - 1]!.source.html;
}

beforeEach(() => {
  mockWebViews.length = 0;
});

describe('inline SVG pictures', () => {
  it('draws an svg fence as a picture, script-free and with no network', () => {
    const { slides } = extractSvgSlides(['```svg', square('#2f6fed'), '```'].join('\n'));
    render(<SvgGallery slides={slides} />);

    const html = lastHtml();
    expect(html).toContain('fill="#2f6fed"');
    expect(html).toContain("default-src 'none'");
    expect(html).not.toContain('<script');
    expect(mockWebViews[mockWebViews.length - 1]!.javaScriptEnabled).toBe(false);
    expect(screen.queryByTestId('svg-gallery-counter')).toBeNull();
  });

  it('steps through three pictures with Prev, Next and a counter', () => {
    const markdown = ['#111111', '#222222', '#333333']
      .map((fill) => ['```svg', square(fill), '```'].join('\n'))
      .join('\n\n');
    render(<SvgGallery slides={extractSvgSlides(markdown).slides} />);

    expect(screen.getByTestId('svg-gallery-counter').props.children).toBe('1 / 3');
    expect(screen.getByLabelText('Previous picture').props.accessibilityState).toMatchObject({
      disabled: true,
    });
    expect(lastHtml()).toContain('#111111');

    fireEvent.press(screen.getByLabelText('Next picture'));
    expect(screen.getByTestId('svg-gallery-counter').props.children).toBe('2 / 3');
    expect(lastHtml()).toContain('#222222');

    fireEvent.press(screen.getByLabelText('Next picture'));
    expect(screen.getByLabelText('Next picture').props.accessibilityState).toMatchObject({
      disabled: true,
    });
  });

  it('takes pictures from xml fences and from bare fences that start with <svg', () => {
    const markdown = ['```xml', square('#aaaaaa'), '```', '', '```', square('#bbbbbb'), '```'].join(
      '\n',
    );
    expect(extractSvgSlides(markdown).slides).toHaveLength(2);
  });
});

describe('chart artifact header and failure fallback', () => {
  it('says why a chart cannot be plotted and shows the raw content in monospace', () => {
    render(<ChartArtifactView content='{"type": "bar", "data": [' colors={lightColors} />);

    expect(screen.getByText('This chart is not valid JSON, so it cannot be plotted.')).toBeTruthy();
    const raw = screen.getByText('{"type": "bar", "data": [');
    expect(StyleSheet.flatten(raw.props.style)).toMatchObject({ fontFamily: 'Menlo' });
    expect(screen.queryByTestId('report-chart')).toBeNull();
  });

  it('shows the kind and how many points and series the chart holds', () => {
    render(
      <ChartArtifactView
        content={JSON.stringify({
          type: 'line',
          data: [
            { name: 'Jan', north: 1, south: 2 },
            { name: 'Feb', north: 3, south: 4 },
            { name: 'Mar', north: 5, south: 6 },
          ],
        })}
        colors={lightColors}
      />,
    );

    expect(screen.getByText('Line')).toBeTruthy();
    expect(screen.getByText('3 points · 2 series')).toBeTruthy();
    expect(screen.getByTestId('report-chart')).toBeTruthy();
  });
});
