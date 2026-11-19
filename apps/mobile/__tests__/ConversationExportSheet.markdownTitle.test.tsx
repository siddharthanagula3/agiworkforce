/* eslint-disable @typescript-eslint/no-require-imports */
import React from 'react';
import { Alert } from 'react-native';
import { render, fireEvent, waitFor } from '@testing-library/react-native';

jest.mock('@/src/ui/theme', () => {
  const actual = jest.requireActual('@/src/ui/theme/tokens');
  return {
    ...actual,
    useTheme: () => ({ colors: actual.lightColors }),
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

jest.mock('lucide-react-native', () => {
  const RN = require('react-native');
  const Icon = (props: Record<string, unknown>) => <RN.View {...props} />;
  return {
    FileText: Icon,
    File: Icon,
    Hash: Icon,
    Copy: Icon,
    CheckCircle2: Icon,
    Printer: Icon,
    X: Icon,
    TriangleAlert: Icon,
  };
});

const mockWriteAsStringAsync = jest.fn();
const mockShareAsync = jest.fn();
jest.mock('expo-crypto', () => ({ randomUUID: () => 'export-1' }));
jest.mock('expo-file-system/legacy', () => ({
  documentDirectory: 'file:///docs/',
  getInfoAsync: jest.fn(async () => ({ exists: false })),
  deleteAsync: jest.fn(),
  moveAsync: jest.fn(),
  writeAsStringAsync: (...args: unknown[]) => mockWriteAsStringAsync(...args),
  makeDirectoryAsync: jest.fn(),
  EncodingType: { UTF8: 'utf8', Base64: 'base64' },
}));
jest.mock('expo-sharing', () => ({
  isAvailableAsync: jest.fn(async () => true),
  shareAsync: (...args: unknown[]) => mockShareAsync(...args),
}));
jest.mock('expo-print', () => ({ printToFileAsync: jest.fn(), printAsync: jest.fn() }));

jest.mock('@/lib/clipboard', () => ({
  copyToClipboard: jest.fn().mockResolvedValue(true),
}));

import { ConversationExportSheet } from '@/src/features/chat/components/ConversationExportSheet';
import type { ChatMessage } from '@/types/chat';

const TITLE = 'Trip planning';

const messages = [
  {
    id: 'm1',
    role: 'user',
    content: 'Plan from these',
    createdAt: '2026-11-14T09:00:00.000Z',
    attachments: [{ url: 'file:///a', mimeType: 'application/pdf', fileName: 'itinerary.pdf' }],
  },
  {
    id: 'm2',
    role: 'assistant',
    content: 'Here is a plan.',
    createdAt: '2026-11-14T09:00:05.000Z',
  },
] as unknown as ChatMessage[];

function occurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

describe('ConversationExportSheet Markdown export', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('writes one title heading and one Exported line, and lists the attachments', async () => {
    const { getByLabelText } = render(
      <ConversationExportSheet visible onClose={jest.fn()} messages={messages} title={TITLE} />,
    );

    fireEvent.press(getByLabelText('Export as Markdown'));

    await waitFor(() => expect(mockShareAsync).toHaveBeenCalled());
    const markdown = String(mockWriteAsStringAsync.mock.calls[0]?.[1]);
    expect(occurrences(markdown, `# ${TITLE}`)).toBe(1);
    expect(occurrences(markdown, 'Exported:')).toBe(1);
    expect(markdown).toContain('Attachments: itinerary.pdf');
    expect(markdown).toContain('Here is a plan.');
  });
});
