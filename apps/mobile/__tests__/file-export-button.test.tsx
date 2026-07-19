/**
 * Regression: FileExportButton previously used @gorhom/bottom-sheet's plain
 * (non-modal) BottomSheet. That component positions itself relative to its
 * nearest ancestor, not the screen — and FileExportButton is mounted inside
 * MessageBubble, a row inside the virtualized message list. The sheet was
 * clipped to that row's small bounds and never visible; tapping "Export
 * Message..." silently no-opped with zero user-visible feedback.
 *
 * Fixed by switching to React Native's native Modal (same proven pattern as
 * MessageEditModal.tsx), which renders via a native window layer immune to
 * list-item clipping. This test locks in that the export sheet actually
 * becomes queryable/visible when `visible` is true.
 */

/* eslint-disable @typescript-eslint/no-require-imports */
import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';

jest.mock('@/src/ui/theme', () => {
  const actual = jest.requireActual('@/src/ui/theme/tokens');
  return {
    ...actual,
    useThemeColors: () => actual.lightColors,
  };
});

jest.mock('@/components/ui/text', () => {
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
  // Any icon name resolves to the stub — robust to new icons added to MessageBubble.
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
});
