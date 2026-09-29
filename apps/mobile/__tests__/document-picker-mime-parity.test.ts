jest.mock('expo-file-system/legacy', () => ({
  readAsStringAsync: jest.fn(),
  getInfoAsync: jest.fn().mockResolvedValue({ exists: true, size: 0 }),
  EncodingType: { UTF8: 'utf8', Base64: 'base64' },
}));

import { readFileSync } from 'fs';
import { join } from 'path';
import {
  PICKABLE_DOCUMENT_MIME_TYPES,
  isParseableDocument,
  pickableDocumentMimeTypes,
} from '../services/docParser';
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

  it('does not advertise legacy Word documents: application/msword', () => {
    expect(pickableDocumentMimeTypes('cloud')).not.toContain('application/msword');
    expect(pickableDocumentMimeTypes('local')).not.toContain('application/msword');
  });

  it('offers .docx only to Cloud chats, which the server reads', () => {
    const docx = WORD_MIME_TYPES[1]!;
    const attachment = {
      fileName: 'report.docx',
      mimeType: docx,
      uri: 'file:///report.docx',
      fileSize: 1024,
    };
    expect(PICKABLE_DOCUMENT_MIME_TYPES).not.toContain(docx);
    expect(pickableDocumentMimeTypes('local')).not.toContain(docx);
    expect(pickableDocumentMimeTypes('cloud')).toContain(docx);
    expect(isParseableDocument('file:///report.docx', docx)).toBe(false);
    expect(isAcceptableAttachment(attachment, 'cloud')).toBe(true);
    expect(isAcceptableAttachment(attachment, 'local')).not.toBe(true);
  });
});

describe('chat screens derive their picker filter from the shared allowlist', () => {
  it.each(CHAT_SCREENS)('%s uses pickableDocumentMimeTypes and no Word type', (screenPath) => {
    const source = readFileSync(screenPath, 'utf8');
    expect(source).toContain('type: pickableDocumentMimeTypes(');
    for (const mimeType of WORD_MIME_TYPES) {
      expect(source).not.toContain(mimeType);
    }
  });
});
