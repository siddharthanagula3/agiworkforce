jest.mock('react-native-svg', () => {
  const actual = jest.requireActual('react-native-svg');
  class MockSvg extends actual.default {
    toDataURL = (callback: (base64: string) => void) => {
      callback('BASE64');
    };
  }
  return { ...actual, __esModule: true, default: MockSvg };
});

const mockExportPngImage = jest.fn();
const mockShareFile = jest.fn();
jest.mock('@/services/fileCreation', () => ({
  exportPngImage: (...args: unknown[]) => mockExportPngImage(...args),
  shareFile: (...args: unknown[]) => mockShareFile(...args),
}));

import React from 'react';
import { Dimensions, Text as RNText } from 'react-native';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';
import { Rect, Text as SvgText } from 'react-native-svg';
import {
  chartSpecFromFence,
  classifyAssistantFence,
} from '@agiworkforce/unified-chat/assistant-fence';
import { ReportChart } from '@/src/features/chat/components/ReportChart';
import {
  chartFromAssistantFence,
  chartSpecToChart,
  readChartArtifact,
} from '@/src/features/chat/utils/chartArtifact';
import { describeChart, parseMermaidChart } from '@/src/features/chat/utils/mermaidChart';
import { lightColors } from '@/src/ui/theme';
import { typeScale } from '@/src/ui/theme/tokens';

function fenceChart(language: string, source: string) {
  const fence = classifyAssistantFence(language, source);
  if (fence.kind !== 'chart') throw new Error(`expected a chart, got ${fence.kind}`);
  return chartFromAssistantFence(fence);
}

function artifactChart(definition: unknown) {
  const reading = readChartArtifact(JSON.stringify(definition));
  if (!reading.ok) throw new Error(reading.reason);
  return reading.chart;
}

function figure() {
  return within(screen.getByTestId('report-chart-figure'));
}

function dataCells(): string[] {
  return within(screen.getByTestId('report-chart-data'))
    .UNSAFE_getAllByType(RNText)
    .map((node) => String(node.props.children));
}

function barMarks() {
  return new Map(
    screen
      .UNSAFE_getAllByType(Rect)
      .filter((node) => String(node.props.testID ?? '').startsWith('chart-bar-'))
      .map((node) => [
        String(node.props.testID),
        node.props as { fill: string; fillOpacity: number },
      ]),
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockExportPngImage.mockResolvedValue('file:///chart.png');
  mockShareFile.mockResolvedValue(undefined);
});

describe('chart fences keep their type and every series', () => {
  it('draws a line chart fence as a line', () => {
    const chart = fenceChart('chart', 'type: line\nx: Month\nJan | 10\nFeb | 20');
    expect(chart).toMatchObject({ kind: 'xy', series: [{ type: 'line', values: [10, 20] }] });
  });

  it('draws pie and donut chart fences as pies, the donut with a hole', () => {
    expect(fenceChart('chart', 'type: pie\nA | 3\nB | 1')).toMatchObject({
      kind: 'pie',
      slices: [
        { label: 'A', value: 3 },
        { label: 'B', value: 1 },
      ],
    });
    const donut = fenceChart('chart', 'type: donut\nA | 3\nB | 1');
    expect(donut).toMatchObject({ kind: 'pie', donut: true });

    render(<ReportChart chart={donut} colors={lightColors} />);
    const shares = figure()
      .UNSAFE_getAllByType(SvgText)
      .map((node) => String(node.props.children));
    expect(shares).toEqual(['75%', '25%']);
  });

  it('plots both series of a revenue and cost definition with a legend entry each', () => {
    const chart = fenceChart(
      'chart',
      JSON.stringify({
        type: 'bar',
        xKey: 'month',
        series: [
          { dataKey: 'revenue', name: 'Revenue' },
          { dataKey: 'cost', name: 'Cost' },
        ],
        data: [
          { month: 'Jan', revenue: 10, cost: 4 },
          { month: 'Feb', revenue: 12, cost: 5 },
        ],
      }),
    );
    render(<ReportChart chart={chart} colors={lightColors} />);

    expect(figure().getByText('Revenue')).toBeTruthy();
    expect(figure().getByText('Cost')).toBeTruthy();
    expect(screen.getByTestId('chart-bar-1-1')).toBeTruthy();
  });

  it('turns a JSON fence that names a chart type into a bar chart', () => {
    const spec = chartSpecFromFence(
      'json',
      '{"type":"bar","data":[{"name":"Jan","value":3},{"name":"Feb","value":5}]}',
    );
    if (!spec) throw new Error('expected a chart definition');
    expect(chartSpecToChart(spec)).toMatchObject({
      kind: 'xy',
      categories: ['Jan', 'Feb'],
      series: [{ type: 'bar', values: [3, 5] }],
    });
  });
});

describe('chart values match the data', () => {
  const EXACT = artifactChart({
    type: 'bar',
    title: 'Sales',
    data: [
      { name: 'North', value: 123456 },
      { name: 'South', value: 1234.5 },
    ],
  });

  it('shows exact values in Show data, the tap readout and the VoiceOver label', () => {
    render(<ReportChart chart={EXACT} colors={lightColors} />);

    expect(screen.getByTestId('report-chart-figure').props.accessibilityLabel).toContain(
      'North 123,456',
    );
    fireEvent.press(screen.getByText('Show data'));
    expect(dataCells()).toEqual(expect.arrayContaining(['123,456', '1,234.5']));

    const scrub = screen.getByTestId('report-chart-scrub');
    fireEvent(scrub, 'responderGrant', { nativeEvent: { locationX: 310 } });
    expect(screen.getByText('South: value 1,234.5')).toBeTruthy();
  });

  it('selects by dragging across a dense chart', () => {
    const rows = Array.from({ length: 40 }, (_, index) => ({ name: `D${index}`, value: index }));
    render(
      <ReportChart chart={artifactChart({ type: 'line', data: rows })} colors={lightColors} />,
    );
    const scrub = screen.getByTestId('report-chart-scrub');

    fireEvent(scrub, 'responderGrant', { nativeEvent: { locationX: 0 } });
    expect(screen.getByText('D0: value 0')).toBeTruthy();
    fireEvent(scrub, 'responderMove', { nativeEvent: { locationX: 320 } });
    expect(screen.getByText('D39: value 39')).toBeTruthy();
  });

  it('leaves a missing point as a gap, not a zero', () => {
    const chart = artifactChart({
      type: 'bar',
      xKey: 'month',
      data: [
        { month: 'Jan', revenue: 10, cost: 4 },
        { month: 'Feb', revenue: 12 },
      ],
    });
    render(<ReportChart chart={chart} colors={lightColors} />);

    expect(screen.getByTestId('chart-bar-1-0')).toBeTruthy();
    expect(screen.queryByTestId('chart-bar-1-1')).toBeNull();
    expect(describeChart(chart)).toContain('Feb no value');
    fireEvent.press(screen.getByText('Show data'));
    expect(dataCells()).toEqual(['month', 'revenue', 'cost', 'Jan', '10', '4', 'Feb', '12', '']);
  });

  it('says how many points it plots when the definition holds more than it keeps', () => {
    const rows = Array.from({ length: 600 }, (_, index) => ({ name: `P${index}`, value: index }));
    const chart = artifactChart({ type: 'line', data: rows });
    render(<ReportChart chart={chart} colors={lightColors} />);

    expect(chart.kind === 'xy' && chart.categories).toHaveLength(500);
    expect(screen.getByTestId('report-chart-truncation').props.children).toBe(
      'Plotting the first 500 of 600 points.',
    );
  });

  it('shows a message instead of NaN for a pie whose values are all zero', () => {
    const chart = artifactChart({
      type: 'pie',
      data: [
        { name: 'A', value: 0 },
        { name: 'B', value: 0 },
      ],
    });
    render(<ReportChart chart={chart} colors={lightColors} />);

    expect(
      screen.getByText('Nothing to plot. Every value in this chart is zero or less.'),
    ).toBeTruthy();
    expect(describeChart(chart)).not.toContain('NaN');
    expect(screen.queryByText(/NaN/)).toBeNull();
  });

  it('draws the x-axis title under the axis and heads the data table with it', () => {
    const chart = parseMermaidChart(
      ['xychart-beta', 'x-axis "Month" [Jan, Feb]', 'bar [1, 2]'].join('\n'),
    );
    if (!chart) throw new Error('fixture did not parse');
    render(<ReportChart chart={chart} colors={lightColors} />);

    expect(figure().getByText('Month')).toBeTruthy();
    fireEvent.press(screen.getByText('Show data'));
    expect(dataCells()[0]).toBe('');

    const artifact = artifactChart({
      type: 'bar',
      xAxis: { dataKey: 'month', label: 'Month' },
      data: [{ month: 'Jan', value: 1 }],
    });
    expect(artifact).toMatchObject({ xLabel: 'Month', categoryHeader: 'Month' });
  });

  it('honours the legend setting of the definition', () => {
    const single = artifactChart({ type: 'bar', legend: true, data: [{ name: 'A', value: 1 }] });
    const view = render(<ReportChart chart={single} colors={lightColors} />);
    expect(figure().getByText('value')).toBeTruthy();
    view.unmount();

    const hidden = artifactChart({
      type: 'bar',
      legend: false,
      data: [{ name: 'A', north: 1, south: 2 }],
    });
    render(<ReportChart chart={hidden} colors={lightColors} />);
    expect(figure().queryByText('north')).toBeNull();
  });

  it('gives each of eight series its own paint and uses a colour the definition names', () => {
    const keys = Array.from({ length: 8 }, (_, index) => `s${index}`);
    const row = Object.fromEntries([['name', 'A'], ...keys.map((key, index) => [key, index + 1])]);
    const chart = artifactChart({
      type: 'bar',
      series: keys.map((key, index) => (index === 0 ? { dataKey: key, color: '#dc2626' } : key)),
      data: [row],
    });
    render(<ReportChart chart={chart} colors={lightColors} />);

    const marks = barMarks();
    const paints = keys.map((_, index) => {
      const bar = marks.get(`chart-bar-${index}-0`);
      return `${bar?.fill}|${bar?.fillOpacity}`;
    });
    expect(new Set(paints).size).toBe(8);
    expect(marks.get('chart-bar-0-0')?.fill).toBe('#dc2626');
  });

  it("shows each slice's value beside its label for pie showData", () => {
    const chart = parseMermaidChart('pie showData title Pets\n"Dogs" : 386\n"Cats" : 85');
    if (!chart) throw new Error('fixture did not parse');
    render(<ReportChart chart={chart} colors={lightColors} />);

    expect(figure().getByText('Dogs 386 (81.95%)')).toBeTruthy();
  });

  it('draws a donut chart artifact as a ring with a share on each segment', () => {
    const chart = artifactChart({
      type: 'donut',
      data: [
        { name: 'A', value: 1 },
        { name: 'B', value: 1 },
      ],
    });
    expect(chart).toMatchObject({ kind: 'pie', donut: true });
    render(<ReportChart chart={chart} colors={lightColors} />);
    expect(
      figure()
        .UNSAFE_getAllByType(SvgText)
        .map((node) => String(node.props.children)),
    ).toEqual(['50%', '50%']);
  });
});

describe('chart legibility on phones', () => {
  it('draws axis text at least at caption size, scaled by the text size setting', () => {
    const chart = artifactChart({ type: 'bar', data: [{ name: 'A', value: 1 }] });
    render(<ReportChart chart={chart} colors={lightColors} />);
    const { fontScale } = Dimensions.get('window');

    const sizes = figure()
      .UNSAFE_getAllByType(SvgText)
      .map((node) => node.props.fontSize as number);
    expect(sizes.length).toBeGreaterThan(0);
    for (const size of sizes) expect(size).toBe(typeScale.caption * fontScale);
    expect(figure().UNSAFE_getAllByType(Rect).length).toBeGreaterThan(0);
  });

  it.each([
    ['an untitled chart', undefined],
    ['a chart titled in Japanese', '売上の推移'],
  ])('saves %s under a recognisable name', async (_label, title) => {
    const chart = artifactChart({ type: 'bar', title, data: [{ name: 'A', value: 1 }] });
    render(<ReportChart chart={chart} colors={lightColors} />);

    fireEvent.press(screen.getByText('Save image'));
    await waitFor(() => expect(mockShareFile).toHaveBeenCalledWith('file:///chart.png'));
    expect(mockExportPngImage).toHaveBeenCalledWith('BASE64', 'chart');
  });
});
