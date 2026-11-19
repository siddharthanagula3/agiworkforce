const mockWriteAsStringAsync = jest.fn();
const mockPrintToFileAsync = jest.fn();
const mockPrintAsync = jest.fn();
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
jest.mock('expo-sharing', () => ({ isAvailableAsync: jest.fn(), shareAsync: jest.fn() }));
jest.mock('expo-print', () => ({
  printToFileAsync: (...args: unknown[]) => mockPrintToFileAsync(...args),
  printAsync: (...args: unknown[]) => mockPrintAsync(...args),
}));

import {
  exportConversationToMarkdown,
  exportConversationToPDF,
  exportConversationToText,
  printConversation,
} from '@/services/fileCreation';
import type { ChatMessage } from '@/types/chat';

const TITLE = 'Trip planning';

const MESSAGES = [
  {
    id: 'u1',
    conversationId: 'c1',
    role: 'user',
    content: 'Plan from these',
    createdAt: '2026-11-14T09:00:00.000Z',
    attachments: [
      { url: 'file:///a', mimeType: 'application/pdf', fileName: 'itinerary.pdf' },
      { url: 'file:///b', mimeType: 'image/jpeg', fileName: 'map.jpg' },
    ],
  },
  {
    id: 'a1',
    conversationId: 'c1',
    role: 'assistant',
    content: 'Here is a plan.',
    createdAt: '2026-11-14T09:00:05.000Z',
  },
] as unknown as ChatMessage[];

function occurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

function writtenText(): string {
  return String(mockWriteAsStringAsync.mock.calls[0]?.[1]);
}

describe('conversation exports', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPrintToFileAsync.mockResolvedValue({ uri: 'file:///tmp/print.pdf' });
    mockPrintAsync.mockResolvedValue(undefined);
  });

  it('writes a text export with one title and one Exported header', async () => {
    await exportConversationToText(MESSAGES, TITLE);

    const text = writtenText();
    expect(occurrences(text, TITLE)).toBe(1);
    expect(occurrences(text, 'Exported:')).toBe(1);
    expect(text.startsWith(`${TITLE}\nExported: `)).toBe(true);
  });

  it('lists the file names attached to each message in a text export', async () => {
    await exportConversationToText(MESSAGES, TITLE);

    const text = writtenText();
    expect(text).toContain('Plan from these\nAttachments: itinerary.pdf, map.jpg\n');
    expect(occurrences(text, 'Attachments:')).toBe(1);
  });

  it('keeps a message that carries only an attachment', async () => {
    await exportConversationToText(
      [{ ...MESSAGES[0], content: '' } as ChatMessage, MESSAGES[1] as ChatMessage],
      TITLE,
    );

    expect(writtenText()).toContain('Attachments: itinerary.pdf, map.jpg');
  });

  it('writes a Markdown export with one title heading', async () => {
    await exportConversationToMarkdown(MESSAGES, TITLE);

    const markdown = writtenText();
    expect(occurrences(markdown, `# ${TITLE}`)).toBe(1);
    expect(occurrences(markdown, 'Exported:')).toBe(1);
    expect(markdown).toContain('Attachments: itinerary.pdf, map.jpg');
  });

  it('prints and saves a PDF with the title once, in its header', async () => {
    await exportConversationToPDF(MESSAGES, TITLE);
    await printConversation(MESSAGES, TITLE);

    const saved = (mockPrintToFileAsync.mock.calls[0]?.[0] as { html: string }).html;
    const printed = (mockPrintAsync.mock.calls[0]?.[0] as { html: string }).html;
    for (const html of [saved, printed]) {
      expect(occurrences(html, TITLE)).toBe(1);
      expect(html).toContain('itinerary.pdf, map.jpg');
    }
  });
});
