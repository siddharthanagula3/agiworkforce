/**
 * SIX-22 — the chat document pickers must never advertise a file type the
 * parser and the attach-time validator always reject.
 *
 * Both chat screens used to hardcode their own MIME arrays that included
 * `application/msword` and the OOXML wordprocessingml type. `detectDocType`
 * has never recognised either, so `isParseableDocument` returned false and
 * `isAcceptableAttachment` answered "isn't a supported file type" for every
 * Word document the picker had just offered — a guaranteed dead end presented
 * as a supported option.
 *
 * These tests lock the invariant on the real (unmocked) parser: every MIME
 * type the pickers advertise is accepted by the validator, and neither screen
 * re-introduces a private list.
 */
jest.mock('expo-file-system/legacy', () => ({
  readAsStringAsync: jest.fn(),
  getInfoAsync: jest.fn().mockResolvedValue({ exists: true, size: 0 }),
  EncodingType: { UTF8: 'utf8', Base64: 'base64' },
}));

import { readFileSync } from 'fs';
import { join } from 'path';
import { PICKABLE_DOCUMENT_MIME_TYPES, isParseableDocument } from '../services/docParser';
import { isAcceptableAttachment } from '../src/features/chat/utils/attachmentValidation';

const WORD_MIME_TYPES = [
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];

const CHAT_SCREENS = [
  join(__dirname, '..', 'app', '(app)', '(tabs)', 'chat.tsx'),
  join(__dirname, '..', 'app', '(app)', 'chat', '[id].tsx'),
];

describe('document picker MIME allowlist', () => {
  it('advertises at least one type', () => {
    expect(PICKABLE_DOCUMENT_MIME_TYPES.length).toBeGreaterThan(0);
  });

  it.each([...PICKABLE_DOCUMENT_MIME_TYPES])(
    'the parser can extract text from every advertised type: %s',
    (mimeType) => {
      // Extensionless uri: the MIME type alone has to be enough, because
      // DocumentPicker hands back whatever name the provider supplied.
      expect(isParseableDocument('file:///picked', mimeType)).toBe(true);
    },
  );

  it.each([...PICKABLE_DOCUMENT_MIME_TYPES])(
    'the attach-time validator accepts every advertised type: %s',
    (mimeType) => {
      expect(
        isAcceptableAttachment({
          fileName: 'picked',
          mimeType,
          uri: 'file:///picked',
          fileSize: 1024,
        }),
      ).toBe(true);
    },
  );

  it.each(WORD_MIME_TYPES)('does not advertise Word documents: %s', (mimeType) => {
    expect(PICKABLE_DOCUMENT_MIME_TYPES).not.toContain(mimeType);
    expect(isParseableDocument('file:///report.docx', mimeType)).toBe(false);
    expect(
      isAcceptableAttachment({
        fileName: 'report.docx',
        mimeType,
        uri: 'file:///report.docx',
        fileSize: 1024,
      }),
    ).not.toBe(true);
  });
});

describe('chat screens derive their picker filter from the shared allowlist', () => {
  it.each(CHAT_SCREENS)('%s uses PICKABLE_DOCUMENT_MIME_TYPES and no Word type', (screenPath) => {
    const source = readFileSync(screenPath, 'utf8');
    expect(source).toContain('PICKABLE_DOCUMENT_MIME_TYPES');
    expect(source).toContain('type: [...PICKABLE_DOCUMENT_MIME_TYPES]');
    for (const mimeType of WORD_MIME_TYPES) {
      expect(source).not.toContain(mimeType);
    }
  });
});
