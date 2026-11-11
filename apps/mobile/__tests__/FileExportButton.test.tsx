/* eslint-disable @typescript-eslint/no-require-imports */
import React from 'react';
import { Alert } from 'react-native';
import { render, fireEvent, waitFor } from '@testing-library/react-native';

jest.mock('@/src/ui/theme', () => {
  const actual = jest.requireActual('@/src/ui/theme/tokens');
  return {
    ...actual,
    useThemeColors: () => actual.lightColors,
  };
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
  ImpactFeedbackStyle: { Light: 'light' },
  NotificationFeedbackType: { Success: 'success', Error: 'error' },
  impactAsync: jest.fn(),
  notificationAsync: jest.fn(),
}));

jest.mock('lucide-react-native', () => {
  const RN = require('react-native');
  const Icon = (props: Record<string, unknown>) => <RN.View {...props} />;
  return new Proxy({}, { get: () => Icon });
});

const mockExportToPDF = jest.fn();
const mockExportToText = jest.fn();
const mockShareFile = jest.fn();
jest.mock('@/services/fileCreation', () => ({
  exportToPDF: (...args: unknown[]) => mockExportToPDF(...args),
  exportToText: (...args: unknown[]) => mockExportToText(...args),
  shareFile: (...args: unknown[]) => mockShareFile(...args),
}));

jest.mock('@/lib/clipboard', () => ({
  copyToClipboard: jest.fn(),
}));

import { FileExportButton } from '@/src/features/chat/components/FileExportButton';

describe('FileExportButton', () => {
  it('renders the export sheet content when visible (not clipped by a list-item ancestor)', () => {
    const { getByText, getByLabelText } = render(
      <FileExportButton content="Hello world" visible onClose={jest.fn()} />,
    );

    expect(getByText('Export Message')).toBeTruthy();
    expect(getByLabelText('Export as PDF')).toBeTruthy();
    expect(getByLabelText('Export as Text')).toBeTruthy();
    expect(getByLabelText('Copy to Clipboard')).toBeTruthy();
    expect(getByLabelText('Share...')).toBeTruthy();
  });

  it('renders nothing meaningful when not visible', () => {
    const { queryByText } = render(
      <FileExportButton content="Hello world" visible={false} onClose={jest.fn()} />,
    );

    expect(queryByText('Export Message')).toBeNull();
  });

  it('calls onClose when the backdrop is dismissed', () => {
    const onClose = jest.fn();
    const { getByLabelText } = render(
      <FileExportButton content="Hello world" visible onClose={onClose} />,
    );

    fireEvent.press(getByLabelText('Dismiss export menu'));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('invokes exportToPDF when "Export as PDF" is pressed', () => {
    mockExportToPDF.mockResolvedValue({ uri: 'file://export.pdf' });
    const { getByLabelText } = render(
      <FileExportButton content="Hello world" visible onClose={jest.fn()} />,
    );

    fireEvent.press(getByLabelText('Export as PDF'));

    expect(mockExportToPDF).toHaveBeenCalledWith('Hello world', 'Hello world');
  });

  it('hands the exported PDF to the share sheet instead of reporting Done for a hidden file', async () => {
    mockShareFile.mockReset();
    mockExportToPDF.mockResolvedValue({ uri: 'file://export.pdf' });
    mockShareFile.mockResolvedValue(undefined);
    const { getByLabelText, findByText } = render(
      <FileExportButton content="Hello world" visible onClose={jest.fn()} />,
    );

    fireEvent.press(getByLabelText('Export as PDF'));

    await findByText('Done!');
    expect(mockShareFile).toHaveBeenCalledWith('file://export.pdf');
  });

  it('hands the exported text file to the share sheet', async () => {
    mockShareFile.mockReset();
    mockExportToText.mockResolvedValue({ uri: 'file://export.txt' });
    mockShareFile.mockResolvedValue(undefined);
    const { getByLabelText, findByText } = render(
      <FileExportButton content="Hello world" visible onClose={jest.fn()} />,
    );

    fireEvent.press(getByLabelText('Export as Text'));

    await findByText('Done!');
    expect(mockShareFile).toHaveBeenCalledWith('file://export.txt');
  });

  it('tells the user when the file could not be delivered and never shows Done', async () => {
    mockShareFile.mockReset();
    mockExportToText.mockResolvedValue({ uri: 'file://export.txt' });
    mockShareFile.mockRejectedValue(new Error('Sharing is not available on this device'));
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const { getByLabelText, queryByText } = render(
      <FileExportButton content="Hello world" visible onClose={jest.fn()} />,
    );

    fireEvent.press(getByLabelText('Export as Text'));

    await waitFor(() => expect(alertSpy).toHaveBeenCalledWith('Export Failed', expect.any(String)));
    expect(queryByText('Done!')).toBeNull();
    alertSpy.mockRestore();
  });
});
