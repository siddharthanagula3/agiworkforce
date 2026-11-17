import { copyAsync, deleteAsync, makeDirectoryAsync } from 'expo-file-system/legacy';
import { excludeFromBackup } from '@/src/platform/backupExclusion';
import {
  LOCAL_CHAT_ATTACHMENTS_DIR,
  keepLocalChatAttachments,
  releaseDeletedConversationAttachments,
  releaseLocalChatAttachments,
  removeAllLocalChatAttachments,
  resolveLocalChatAttachmentUrl,
} from '@/services/localChatAttachments';
import type { ChatMessage, MessageAttachment } from '@/types/chat';

let mockUuid = 0;
jest.mock('expo-crypto', () => ({ randomUUID: () => `copy-${++mockUuid}` }));

jest.mock('expo-file-system/legacy', () => ({
  __esModule: true,
  documentDirectory: 'file:///documents/',
  cacheDirectory: 'file:///cache/',
  copyAsync: jest.fn(),
  deleteAsync: jest.fn(),
  makeDirectoryAsync: jest.fn(),
}));

jest.mock('@/src/platform/backupExclusion', () => ({
  excludeFromBackup: jest.fn(),
}));

const mockCopy = copyAsync as jest.Mock;
const mockDelete = deleteAsync as jest.Mock;
const mockMakeDirectory = makeDirectoryAsync as jest.Mock;
const mockExclude = excludeFromBackup as jest.Mock;

const PDF: MessageAttachment = {
  url: 'file:///cache/DocumentPicker/4F2A/Lease agreement.pdf',
  mimeType: 'application/pdf',
  fileName: 'Lease agreement.pdf',
  fileSize: 48_000,
};

const PHOTO: MessageAttachment = {
  url: 'file:///cache/ImagePicker/9C1B.jpeg',
  mimeType: 'image/jpeg',
  fileName: 'IMG_0042.jpeg',
  assetId: 'photos-asset-1',
};

beforeEach(() => {
  jest.clearAllMocks();
  mockUuid = 0;
  mockCopy.mockResolvedValue(undefined);
  mockDelete.mockResolvedValue(undefined);
  mockMakeDirectory.mockResolvedValue(undefined);
  mockExclude.mockResolvedValue(undefined);
});

describe('keeping the files of a Local chat message', () => {
  it('copies each picked file out of the cache into the chat folder and points the message at the copy', async () => {
    const kept = await keepLocalChatAttachments('conv_1', [PDF, PHOTO]);

    expect(LOCAL_CHAT_ATTACHMENTS_DIR).toBe('file:///documents/chat-attachments/');
    expect(kept).toEqual([
      {
        ...PDF,
        url: 'file:///documents/chat-attachments/conv_1/copy-1/Lease%20agreement.pdf',
      },
      { ...PHOTO, url: 'file:///documents/chat-attachments/conv_1/copy-2/IMG_0042.jpeg' },
    ]);
    expect(mockCopy).toHaveBeenCalledWith({ from: PDF.url, to: kept[0]!.url });
    expect(mockCopy).toHaveBeenCalledWith({ from: PHOTO.url, to: kept[1]!.url });
  });

  it('keeps the copy of a file with a long multibyte name within the file system limit and keeps its extension', async () => {
    const long: MessageAttachment = {
      ...PDF,
      fileName: `${'\u9577'.repeat(100)}.pdf`,
    };

    const [kept] = await keepLocalChatAttachments('conv_1', [long]);

    const diskName = decodeURIComponent(kept!.url.slice(kept!.url.lastIndexOf('/') + 1));
    expect(diskName.endsWith('.pdf')).toBe(true);
    expect(Buffer.byteLength(diskName, 'utf8')).toBeLessThanOrEqual(255);
    expect(mockCopy).toHaveBeenCalledWith({ from: long.url, to: kept!.url });
    expect(kept!.fileName).toBe(long.fileName);
  });

  it('keeps a copy of a file whose name holds half an emoji', async () => {
    const [kept] = await keepLocalChatAttachments('conv_1', [{ ...PDF, fileName: 'a\uD83D.pdf' }]);

    expect(kept!.url).toBe('file:///documents/chat-attachments/conv_1/copy-1/a_.pdf');
  });

  it('keeps the copies out of iCloud and computer backups', async () => {
    await keepLocalChatAttachments('conv_1', [PDF]);

    expect(mockExclude).toHaveBeenCalledWith(['file:///documents/chat-attachments/conv_1/']);
  });

  it('still sends with the copy when the backup flag cannot be set', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    mockExclude.mockRejectedValue(new Error('native module not linked'));

    const kept = await keepLocalChatAttachments('conv_1', [PDF]);

    expect(kept[0]!.url).toBe(
      'file:///documents/chat-attachments/conv_1/copy-1/Lease%20agreement.pdf',
    );
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('sends with the cache file and leaves no half copy when the disk is full', async () => {
    mockCopy.mockRejectedValueOnce(new Error('ENOSPC: no space left on device'));

    const kept = await keepLocalChatAttachments('conv_1', [PDF, PHOTO]);

    expect(kept[0]).toBe(PDF);
    expect(kept[1]!.url).toBe('file:///documents/chat-attachments/conv_1/copy-2/IMG_0042.jpeg');
    expect(mockDelete).toHaveBeenCalledWith('file:///documents/chat-attachments/conv_1/copy-1/', {
      idempotent: true,
    });
  });

  it('copies nothing and flags nothing when every file is already kept or is not a local file', async () => {
    const alreadyKept = {
      ...PDF,
      url: 'file:///documents/chat-attachments/conv_1/copy-9/Lease%20agreement.pdf',
    };
    const remote = { ...PHOTO, url: 'https://agiworkforce.com/api/files/f-1' };

    const kept = await keepLocalChatAttachments('conv_1', [alreadyKept, remote]);

    expect(kept).toEqual([alreadyKept, remote]);
    expect(mockCopy).not.toHaveBeenCalled();
    expect(mockExclude).not.toHaveBeenCalled();
  });

  it('keeps a conversation id from reaching outside the chat folder', async () => {
    const kept = await keepLocalChatAttachments('../../Library', [PDF]);

    expect(kept[0]!.url).toBe(
      'file:///documents/chat-attachments/______Library/copy-1/Lease%20agreement.pdf',
    );
  });
});

describe('removing kept files', () => {
  const kept = 'file:///documents/chat-attachments/conv_1/copy-1/Lease%20agreement.pdf';
  const shared = 'file:///documents/chat-attachments/conv_1/copy-2/IMG_0042.jpeg';

  it('removes the copies no remaining message points at', async () => {
    await releaseLocalChatAttachments([kept, shared], new Set([shared]));

    expect(mockDelete).toHaveBeenCalledTimes(1);
    expect(mockDelete).toHaveBeenCalledWith('file:///documents/chat-attachments/conv_1/copy-1/', {
      idempotent: true,
    });
  });

  it('never removes a file outside the kept copies', async () => {
    await releaseLocalChatAttachments(
      [PDF.url, 'file:///documents/chat-attachments/conv_1/stray.pdf'],
      new Set(),
    );

    expect(mockDelete).not.toHaveBeenCalled();
  });

  it('never removes anything for a path that climbs out of the kept copies', async () => {
    await releaseLocalChatAttachments(
      [
        'file:///documents/chat-attachments/a/../../models.pte',
        'file:///documents/chat-attachments/conv_1/../x',
        'file:///documents/chat-attachments/conv_1/copy-1/..',
        'file:///documents/chat-attachments/./copy-1/x.pdf',
      ],
      new Set(),
    );

    expect(mockDelete).not.toHaveBeenCalled();
  });

  it('removes a copy saved before an app update moved the documents folder', async () => {
    const beforeUpdate =
      'file:///var/old-container/documents/chat-attachments/conv_1/copy-1/Lease%20agreement.pdf';

    await releaseLocalChatAttachments([beforeUpdate], new Set());

    expect(mockDelete).toHaveBeenCalledWith('file:///documents/chat-attachments/conv_1/copy-1/', {
      idempotent: true,
    });
  });

  it('keeps a copy that a message saved before an app update still points at', async () => {
    const beforeUpdate =
      'file:///var/old-container/documents/chat-attachments/conv_1/copy-1/Lease%20agreement.pdf';

    await releaseLocalChatAttachments([kept], new Set([beforeUpdate]));

    expect(mockDelete).not.toHaveBeenCalled();
  });

  it('removes the copies of a deleted chat but not the ones a fork of it still shows', async () => {
    const message = (id: string, conversationId: string, urls: string[]): ChatMessage => ({
      id,
      conversationId,
      role: 'user',
      content: 'Read this',
      createdAt: '2026-11-16T10:00:00.000Z',
      attachments: urls.map((url) => ({ ...PDF, url })),
    });

    await releaseDeletedConversationAttachments([message('m1', 'conv_1', [kept, shared])], {
      conv_fork: [message('m1_fork', 'conv_fork', [shared])],
      conv_other: [message('m2', 'conv_other', [])],
    });

    expect(mockDelete).toHaveBeenCalledTimes(1);
    expect(mockDelete).toHaveBeenCalledWith('file:///documents/chat-attachments/conv_1/copy-1/', {
      idempotent: true,
    });
  });

  it('touches nothing when the deleted chat had no files', async () => {
    await releaseDeletedConversationAttachments(
      [{ id: 'm1', conversationId: 'conv_1', role: 'user', content: 'Hi', createdAt: 'x' }],
      {},
    );

    expect(mockDelete).not.toHaveBeenCalled();
  });

  it('removes every kept file in the erase wipe', async () => {
    await removeAllLocalChatAttachments();

    expect(mockDelete).toHaveBeenCalledWith('file:///documents/chat-attachments/', {
      idempotent: true,
    });
  });
});

describe('finding a kept file', () => {
  it('finds a copy saved before an app update in the current documents folder', () => {
    expect(
      resolveLocalChatAttachmentUrl(
        'file:///var/old-container/documents/chat-attachments/conv_1/copy-1/Lease%20agreement.pdf',
      ),
    ).toBe('file:///documents/chat-attachments/conv_1/copy-1/Lease%20agreement.pdf');
  });

  it('leaves picker files, remote files and stray paths as they are', () => {
    for (const url of [
      PDF.url,
      'https://agiworkforce.com/api/files/f-1',
      'file:///var/old-container/documents/chat-attachments/a/../../models.pte',
      'file:///var/old-container/Library/Caches/chat-attachments/conv_1/copy-1/x.pdf',
    ]) {
      expect(resolveLocalChatAttachmentUrl(url)).toBe(url);
    }
  });
});
