const mockIsParseable = jest.fn();
jest.mock('@/services/docParser', () => ({
  isParseableDocument: (...args: unknown[]) => mockIsParseable(...args),
}));

import { formatAttachmentSize } from '@/src/features/chat/utils/attachmentSize';
import {
  isAcceptableAttachment,
  validateAttachments,
  type ValidatableAttachment,
} from '@/src/features/chat/utils/attachmentValidation';

function file(overrides: Partial<ValidatableAttachment> = {}): ValidatableAttachment {
  return { fileName: 'notes.txt', mimeType: 'text/plain', uri: 'file:///notes.txt', ...overrides };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockIsParseable.mockReturnValue(true);
});

describe('an empty file is refused when it is picked', () => {
  it.each(['local', 'cloud'] as const)('in %s mode', (destination) => {
    expect(isAcceptableAttachment(file({ fileSize: 0 }), destination)).toBe(
      '“notes.txt” is empty.',
    );
  });

  it('keeps a file of unknown size and pasted text', () => {
    expect(isAcceptableAttachment(file(), 'cloud')).toBe(true);
    expect(isAcceptableAttachment(file({ fileSize: 0, pastedText: 'hello' }), 'cloud')).toBe(true);
  });

  it('leaves the other files in the same pick', () => {
    const { accepted, rejected } = validateAttachments(
      [file({ fileName: 'empty.txt', fileSize: 0 }), file({ fileName: 'full.txt', fileSize: 12 })],
      'cloud',
    );
    expect(accepted.map((item) => item.fileName)).toEqual(['full.txt']);
    expect(rejected).toEqual([{ fileName: 'empty.txt', reason: '“empty.txt” is empty.' }]);
  });
});

describe('the shared deny list applies in both modes', () => {
  const svg = file({ fileName: 'logo.svg', mimeType: 'image/svg+xml', uri: 'file:///logo.svg' });

  it('refuses an SVG with the same message in Local and Cloud', () => {
    const local = isAcceptableAttachment(svg, 'local');
    const cloud = isAcceptableAttachment(svg, 'cloud');

    expect(local).toBe(
      '“logo.svg” isn’t an accepted file type. Attach a JPEG, PNG, GIF, or WebP image instead.',
    );
    expect(cloud).toBe(local);
  });

  it('refuses a compressed SVG whatever type the picker reports', () => {
    const svgz = file({ fileName: 'logo.SVGZ', mimeType: 'application/octet-stream' });
    expect(isAcceptableAttachment(svgz, 'local')).not.toBe(true);
    expect(isAcceptableAttachment(svgz, 'cloud')).not.toBe(true);
  });

  it('still accepts a PNG in Local', () => {
    expect(
      isAcceptableAttachment(
        file({ fileName: 'a.png', mimeType: 'image/png', fileSize: 9 }),
        'local',
      ),
    ).toBe(true);
  });
});

describe('formatAttachmentSize', () => {
  it.each([
    [0, '0 B'],
    [129, '129 B'],
    [512, '512 B'],
    [4096, '4 KB'],
    [1024 * 1024, '1 MB'],
    [25 * 1024 * 1024, '25 MB'],
    [Math.round(1.5 * 1024 * 1024), '1.5 MB'],
    [1024 * 1024 - 1, '1 MB'],
    [1024 * 1024 * 1024 - 1000, '1 GB'],
    [1024 * 1024 * 1024, '1 GB'],
    [Math.round(1.86 * 1024 * 1024 * 1024), '1.9 GB'],
  ])('%d bytes reads %s', (bytes, label) => {
    expect(formatAttachmentSize(bytes)).toBe(label);
  });
});
