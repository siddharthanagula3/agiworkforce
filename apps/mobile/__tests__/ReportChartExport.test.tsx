const mockToDataURL = jest.fn();
jest.mock('react-native-svg', () => {
  const actual = jest.requireActual('react-native-svg');
  class MockSvg extends actual.default {
    toDataURL = (callback: (base64: string) => void, options?: object) => {
      mockToDataURL(this.props.viewBox, options);
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
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';
import { Text as SvgText } from 'react-native-svg';
import { ReportChart } from '@/src/features/chat/components/ReportChart';
import { parseMermaidChart } from '@/src/features/chat/utils/mermaidChart';
import { colors as darkColors, lightColors } from '@/src/ui/theme';

function chartFrom(source: string) {
  const chart = parseMermaidChart(source);
  if (!chart) throw new Error('fixture did not parse');
  return chart;
}

const HIDDEN = { includeHiddenElements: true };

function exportedLabels(): string[] {
  return within(screen.getByTestId('report-chart-export', HIDDEN))
    .UNSAFE_getAllByType(SvgText)
    .map((node) => String(node.props.children));
}

const PIE = chartFrom('pie title Budget\n"Rent" : 75\n"Food" : 25');
const XY = chartFrom(
  [
    'xychart-beta',
    'title "Revenue"',
    'x-axis [Q1, Q2, Q3]',
    'y-axis "USD (thousands)" 0 --> 100',
    'bar "North" [10, 20, 30]',
    'line "South" [15, 25, 35]',
  ].join('\n'),
);

beforeEach(() => {
  jest.clearAllMocks();
  mockExportPngImage.mockResolvedValue('file:///chart.png');
  mockShareFile.mockResolvedValue(undefined);
});

describe('saving a chart as an image', () => {
  it('exports the title and every slice label with its percentage for a pie chart', async () => {
    render(<ReportChart chart={PIE} colors={lightColors} />);

    expect(exportedLabels()).toEqual(['Budget', 'Rent 75%', 'Food 25%']);

    fireEvent.press(screen.getByLabelText('Save Budget as an image'));
    await waitFor(() => expect(mockShareFile).toHaveBeenCalledWith('file:///chart.png'));
    expect(mockExportPngImage).toHaveBeenCalledWith('BASE64', 'Budget');
  });

  it('captures the labelled export canvas, not the bare plot', () => {
    render(<ReportChart chart={PIE} colors={lightColors} />);
    fireEvent.press(screen.getByLabelText('Save Budget as an image'));

    const [viewBox, size] = mockToDataURL.mock.calls[0] as [
      string,
      { width: number; height: number },
    ];
    const [, , width, height] = viewBox.split(' ').map(Number);
    expect(height).toBeGreaterThan(200);
    expect(size).toEqual({ width: width! * 3, height: height! * 3 });
  });

  it('exports the series legend and the unit label for a multi-series chart in both themes', () => {
    for (const colors of [lightColors, darkColors]) {
      const view = render(<ReportChart chart={XY} colors={colors} />);

      const labels = exportedLabels();
      expect(labels).toEqual(
        expect.arrayContaining(['Revenue', 'USD (thousands)', 'North', 'South']),
      );
      view.unmount();
    }
  });

  it('keeps the export canvas out of the accessibility tree and off the screen controls', () => {
    render(<ReportChart chart={PIE} colors={lightColors} />);
    const wrapper = screen.getByTestId('report-chart-export', HIDDEN);

    expect(wrapper.props.accessibilityElementsHidden).toBe(true);
    expect(wrapper.props.importantForAccessibility).toBe('no-hide-descendants');
    expect(screen.getByText('Rent 75%')).toBeTruthy();
  });
});
