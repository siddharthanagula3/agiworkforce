/* eslint-disable @typescript-eslint/no-require-imports */
import React from 'react';
import { Alert } from 'react-native';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

jest.mock('@/src/ui/theme', () => {
  const actual = jest.requireActual('@/src/ui/theme/tokens');
  return { ...actual, useThemeColors: () => actual.lightColors };
});

jest.mock('@/components/ui/Text', () => {
  const RN = require('react-native');
  const Text = (props: Record<string, unknown>) => <RN.Text {...props} />;
  Text.displayName = 'Text';
  return { Text };
});

jest.mock('react-native-safe-area-context', () => {
  const RN = require('react-native');
  return {
    SafeAreaView: ({ children, ...props }: { children: React.ReactNode }) => (
      <RN.View {...props}>{children}</RN.View>
    ),
  };
});

jest.mock('expo-haptics', () => ({
  NotificationFeedbackType: { Success: 'success', Error: 'error' },
  notificationAsync: jest.fn(),
}));

jest.mock('lucide-react-native', () => {
  const RN = require('react-native');
  const Icon = (props: Record<string, unknown>) => <RN.View {...props} />;
  return new Proxy({}, { get: () => Icon });
});

const mockExportToMarkdown = jest.fn();
const mockExportToPDF = jest.fn();
const mockExportHtmlToPDF = jest.fn();
const mockExportToDocx = jest.fn();
const mockExportToText = jest.fn();
const mockExportSourceFile = jest.fn();
const mockShareFile = jest.fn();
jest.mock('@/services/fileCreation', () => ({
  exportToMarkdown: (...args: unknown[]) => mockExportToMarkdown(...args),
  exportToPDF: (...args: unknown[]) => mockExportToPDF(...args),
  exportHtmlToPDF: (...args: unknown[]) => mockExportHtmlToPDF(...args),
  exportToDocx: (...args: unknown[]) => mockExportToDocx(...args),
  exportToText: (...args: unknown[]) => mockExportToText(...args),
  exportSourceFile: (...args: unknown[]) => mockExportSourceFile(...args),
  shareFile: (...args: unknown[]) => mockShareFile(...args),
}));

import { ArtifactExportSheet } from '../ArtifactExportSheet';
import { sitsInColumn } from '../../../../../test-utils/sheetColumn';

const REPORT = '# Findings\n\nSales grew in **every** region.';

function optionLabels(getAllByRole: ReturnType<typeof render>['getAllByRole']): string[] {
  return getAllByRole('button')
    .map((button) => button.props.accessibilityLabel as string | undefined)
    .filter((label): label is string => Boolean(label?.startsWith('Download as ')));
}

beforeEach(() => {
  jest.clearAllMocks();
  mockShareFile.mockResolvedValue(undefined);
});

describe('ArtifactExportSheet', () => {
  it('offers a research report as Markdown, PDF, Word and plain text, with what each file is', () => {
    const { getAllByRole, getByText } = render(
      <ArtifactExportSheet
        artifact={{ type: 'research', title: 'Market report' }}
        content={REPORT}
        visible
        onClose={jest.fn()}
      />,
    );

    expect(getByText('Download as')).toBeTruthy();
    expect(optionLabels(getAllByRole)).toEqual([
      'Download as Markdown',
      'Download as PDF',
      'Download as Word',
      'Download as Plain text',
    ]);
    expect(getByText('A .md file that keeps the formatting')).toBeTruthy();
    expect(getByText('A styled document')).toBeTruthy();
    expect(getByText('A .docx document you can edit')).toBeTruthy();
    expect(getByText('A .txt file')).toBeTruthy();
  });

  it('downloads a slide deck as a landscape PDF with one slide per page', async () => {
    const deck =
      '<!-- deck -->\n# Launch\n\nWhy now.\n\n---\n\n## Plan\n\nShip in May.\n\n---\n\n## Ask\n\nApprove it.';
    const uri = 'file:///docs/exports/a/Launch.pdf';
    mockExportHtmlToPDF.mockResolvedValue({ uri });
    const { getAllByRole, getByLabelText, getByText } = render(
      <ArtifactExportSheet
        artifact={{ type: 'document', language: 'markdown', title: 'Launch' }}
        content={deck}
        visible
        onClose={jest.fn()}
      />,
    );

    expect(optionLabels(getAllByRole)).toEqual([
      'Download as PDF',
      'Download as Markdown',
      'Download as Plain text',
    ]);
    expect(getByText('The slides, one per page')).toBeTruthy();

    fireEvent.press(getByLabelText('Download as PDF'));

    await waitFor(() => expect(mockShareFile).toHaveBeenCalledWith(uri));
    const [html, title, page] = mockExportHtmlToPDF.mock.calls[0] as [
      string,
      string,
      { width: number; height: number },
    ];
    expect(title).toBe('Launch');
    expect(page).toEqual({ width: 792, height: 446 });
    expect(html.match(/<section class="slide"/g)).toHaveLength(3);
    expect(html).toContain('Approve it.');
    expect(html).not.toContain('&lt;!-- deck');
    expect(mockExportToPDF).not.toHaveBeenCalled();
  });

  it('keeps a document that is not a deck on the styled PDF', () => {
    const { getAllByRole } = render(
      <ArtifactExportSheet
        artifact={{ type: 'document', language: 'markdown', title: 'Plan' }}
        content={'# Plan\n\n---\n\nShip on Friday.'}
        visible
        onClose={jest.fn()}
      />,
    );

    expect(optionLabels(getAllByRole)).toEqual([
      'Download as Markdown',
      'Download as PDF',
      'Download as Word',
      'Download as Plain text',
    ]);
  });

  it('offers code as its source file only', () => {
    const { getAllByRole, getByText } = render(
      <ArtifactExportSheet
        artifact={{ type: 'code', language: 'python', title: 'Parser' }}
        content="print('hi')"
        visible
        onClose={jest.fn()}
      />,
    );

    expect(optionLabels(getAllByRole)).toEqual(['Download as PY file']);
    expect(getByText('The source exactly as written, as a .py file')).toBeTruthy();
  });

  it.each([
    ['Markdown', mockExportToMarkdown, 'file:///docs/exports/a/Market report.md'],
    ['PDF', mockExportToPDF, 'file:///docs/exports/a/Market report.pdf'],
    ['Word', mockExportToDocx, 'file:///docs/exports/a/Market report.docx'],
    ['Plain text', mockExportToText, 'file:///docs/exports/a/Market report.txt'],
  ])(
    'writes the report as %s with its exact text and title, shares that file and closes',
    async (label, exporter, uri) => {
      exporter.mockResolvedValue({ uri });
      const onClose = jest.fn();
      const { getByLabelText } = render(
        <ArtifactExportSheet
          artifact={{ type: 'research', title: 'Market report' }}
          content={REPORT}
          visible
          onClose={onClose}
        />,
      );

      fireEvent.press(getByLabelText(`Download as ${label}`));

      await waitFor(() => expect(mockShareFile).toHaveBeenCalledWith(uri));
      expect(exporter).toHaveBeenCalledWith(REPORT, 'Market report');
      expect(onClose).toHaveBeenCalledTimes(1);
    },
  );

  it('names the format that failed and stays open so the person can pick again', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    mockExportToDocx.mockRejectedValue(new Error('disk full'));
    const onClose = jest.fn();
    const { getByLabelText } = render(
      <ArtifactExportSheet
        artifact={{ type: 'research', title: 'Market report' }}
        content={REPORT}
        visible
        onClose={onClose}
      />,
    );

    fireEvent.press(getByLabelText('Download as Word'));

    await waitFor(() =>
      expect(alert).toHaveBeenCalledWith(
        'Download failed',
        'Could not save this as Word. Try again.',
      ),
    );
    expect(mockShareFile).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(getByLabelText('Download as Word').props.accessibilityState).toMatchObject({
      disabled: false,
    });
    alert.mockRestore();
  });

  it('closes from the close button without exporting', () => {
    const onClose = jest.fn();
    const { getByLabelText } = render(
      <ArtifactExportSheet
        artifact={{ type: 'research', title: 'Market report' }}
        content={REPORT}
        visible
        onClose={onClose}
      />,
    );

    fireEvent.press(getByLabelText('Close download options'));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(mockExportToMarkdown).not.toHaveBeenCalled();
  });

  it('stops the sheet at the reading column on a wide window', () => {
    const { getByText } = render(
      <ArtifactExportSheet
        artifact={{ type: 'research', title: 'Market report' }}
        content={REPORT}
        visible
        onClose={jest.fn()}
      />,
    );

    expect(sitsInColumn(getByText('Download as'), 'reading')).toBe(true);
  });
});
