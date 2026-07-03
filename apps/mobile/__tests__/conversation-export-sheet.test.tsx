/**
 * Regression: ConversationExportSheet previously used @gorhom/bottom-sheet's
 * plain (non-modal) BottomSheet. With no BottomSheetModalProvider in this
 * app, a plain BottomSheet renders inline rather than through a native modal
 * window layer — the four export options ("Export as PDF/Text/Markdown",
 * "Copy All Messages") were visible on screen but completely absent from the
 * accessibility tree (confirmed live via XcodeBuildMCP: neither a snapshot
 * nor a label-based wait could find them, despite the screenshot showing
 * them rendered). A VoiceOver user could not use this sheet at all.
 *
 * Fixed by switching to React Native's native Modal, the same proven pattern
 * already used by FileExportButton.tsx. This test locks in that every export
 * option is actually queryable/visible when `visible` is true.
 */

/* eslint-disable @typescript-eslint/no-require-imports */
import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';

jest.mock('@/src/ui/theme', () => {
  const actual = jest.requireActual('@/src/ui/theme/tokens');
  return {
    ...actual,
    useTheme: () => ({ colors: actual.lightColors }),
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

jest.mock('lucide-react-native', () => {
  const RN = require('react-native');
  const Icon = (props: Record<string, unknown>) => <RN.View {...props} />;
  return { FileText: Icon, File: Icon, Hash: Icon, Copy: Icon, CheckCircle2: Icon, X: Icon };
});

const mockExportConversationToPDF = jest.fn();
const mockExportConversationToText = jest.fn();
const mockExportToMarkdown = jest.fn();
const mockFormatConversationAsMarkdown = jest.fn(() => 'markdown content');
const mockShareFile = jest.fn();
jest.mock('@/services/fileCreation', () => ({
  exportConversationToPDF: (...args: unknown[]) => mockExportConversationToPDF(...args),
  exportConversationToText: (...args: unknown[]) => mockExportConversationToText(...args),
  exportToMarkdown: (...args: unknown[]) => mockExportToMarkdown(...args),
  formatConversationAsMarkdown: (...args: unknown[]) => mockFormatConversationAsMarkdown(...args),
  shareFile: (...args: unknown[]) => mockShareFile(...args),
}));

jest.mock('@/lib/clipboard', () => ({
  copyToClipboard: jest.fn().mockResolvedValue(true),
}));

import { ConversationExportSheet } from '@/src/features/chat/components/ConversationExportSheet';
import type { ChatMessage } from '@/types/chat';

const messages: ChatMessage[] = [
  {
    id: 'm1',
    role: 'user',
    content: 'Hello',
    createdAt: new Date().toISOString(),
  } as ChatMessage,
  {
    id: 'm2',
    role: 'assistant',
    content: 'Hi there',
    createdAt: new Date().toISOString(),
  } as ChatMessage,
];

describe('ConversationExportSheet', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders every export option when visible (not swallowed by a non-modal bottom sheet)', () => {
    const { getByText, getByLabelText } = render(
      <ConversationExportSheet
        visible
        onClose={jest.fn()}
        messages={messages}
        title="Renamed Test Chat"
      />,
    );

    expect(getByText('Export Conversation')).toBeTruthy();
    expect(getByLabelText('Export as PDF')).toBeTruthy();
    expect(getByLabelText('Export as Text')).toBeTruthy();
    expect(getByLabelText('Export as Markdown')).toBeTruthy();
    expect(getByLabelText('Copy All Messages')).toBeTruthy();
  });

  it('renders nothing meaningful when not visible', () => {
    const { queryByText } = render(
      <ConversationExportSheet
        visible={false}
        onClose={jest.fn()}
        messages={messages}
        title="Renamed Test Chat"
      />,
    );

    expect(queryByText('Export Conversation')).toBeNull();
  });

  it('calls onClose when the backdrop is dismissed', () => {
    const onClose = jest.fn();
    const { getByLabelText } = render(
      <ConversationExportSheet
        visible
        onClose={onClose}
        messages={messages}
        title="Renamed Test Chat"
      />,
    );

    fireEvent.press(getByLabelText('Dismiss export menu'));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('invokes exportConversationToText when "Export as Text" is pressed', async () => {
    mockExportConversationToText.mockResolvedValue({ uri: 'file://export.txt' });
    const { getByLabelText } = render(
      <ConversationExportSheet
        visible
        onClose={jest.fn()}
        messages={messages}
        title="Renamed Test Chat"
      />,
    );

    fireEvent.press(getByLabelText('Export as Text'));

    await waitFor(() => {
      expect(mockExportConversationToText).toHaveBeenCalledWith(messages, 'Renamed Test Chat');
    });
  });
});
