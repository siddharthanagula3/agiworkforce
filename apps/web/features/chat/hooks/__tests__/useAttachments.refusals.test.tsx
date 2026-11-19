import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ChatAttachmentLimits } from '@agiworkforce/cloud-contracts';
import {
  CHAT_ATTACHMENT_NEEDS_PROJECT_MESSAGE,
  CHAT_IMAGE_ATTACHMENT_TOO_LARGE_MESSAGE,
  CHAT_LARGE_FILE_POLICY,
  MAX_CHAT_ATTACHMENT_BYTES,
  MAX_CHAT_ATTACHMENT_MESSAGE_BYTES,
  MAX_CHAT_IMAGE_ATTACHMENT_BYTES,
} from '@/lib/chat-attachment-policy';
import { useBillingStore } from '@/shared/stores/web-auth-store';
import { chatDraftRefusalNotes } from '@features/chat/lib/attachment-metadata';
import { useAttachments } from '../use-attachments';

const MESSAGE_TOTAL = `${(MAX_CHAT_ATTACHMENT_MESSAGE_BYTES / (1024 * 1024)).toFixed(1)} MB`;

function file(name: string, type: string, bytes = 4): File {
  return new File([new Uint8Array(bytes)], name, { type });
}

describe('a file the composer refuses', () => {
  it('rejects an empty file before upload while admitting a valid file in the same selection', () => {
    const onError = vi.fn();
    const { result } = renderHook(() => useAttachments({ onError }));

    act(() => {
      result.current.addFiles([
        file('empty.txt', 'text/plain', 0),
        file('notes.txt', 'text/plain'),
      ]);
    });

    expect(result.current.attachments.map((item) => item.name)).toEqual(['notes.txt']);
    expect(result.current.refused).toEqual([{ filename: 'empty.txt', reason: 'empty' }]);
    expect(result.current.previews.map((item) => item.file.name)).toEqual(['notes.txt']);
    expect(onError).toHaveBeenCalledWith(
      'Attached 1 of 2 files. Not attached: "empty.txt" (empty).',
    );
    expect(chatDraftRefusalNotes(result.current.refused)).toEqual([
      '[attachment unavailable: empty.txt is empty. Add content to the file and attach it again.]',
    ]);
  });

  it('is reported by name and reason, not only as a toast', () => {
    const { result } = renderHook(() => useAttachments());

    act(() => {
      result.current.addFiles([file('installer.dmg', 'application/x-apple-diskimage')]);
    });

    expect(result.current.attachments).toHaveLength(0);
    expect(result.current.refused).toEqual([{ filename: 'installer.dmg', reason: 'unsupported' }]);
  });

  it('separates a file that is too large from one of the wrong type', () => {
    const { result } = renderHook(() => useAttachments());

    act(() => {
      result.current.addFiles([
        file('huge.png', 'image/png', MAX_CHAT_ATTACHMENT_BYTES + 1),
        file('notes.txt', 'text/plain'),
      ]);
    });

    expect(result.current.refused).toEqual([{ filename: 'huge.png', reason: 'too_large' }]);
    expect(result.current.attachments.map((item) => item.name)).toEqual(['notes.txt']);
  });

  it('refuses an image over the image ceiling when it is attached, not when it is sent', () => {
    const onError = vi.fn();
    const { result } = renderHook(() => useAttachments({ onError }));

    act(() => {
      result.current.addFiles([
        file('photo.png', 'image/png', MAX_CHAT_IMAGE_ATTACHMENT_BYTES + 1),
      ]);
    });

    expect(result.current.attachments).toHaveLength(0);
    expect(result.current.refused).toEqual([{ filename: 'photo.png', reason: 'too_large' }]);
    expect(onError).toHaveBeenCalledWith(
      `"photo.png" is too large. ${CHAT_IMAGE_ATTACHMENT_TOO_LARGE_MESSAGE}`,
    );
  });

  it('holds only images to the image ceiling', () => {
    const { result } = renderHook(() => useAttachments());

    act(() => {
      result.current.addFiles([
        file('scan.pdf', 'application/pdf', MAX_CHAT_IMAGE_ATTACHMENT_BYTES + 1),
      ]);
    });

    expect(result.current.attachments.map((item) => item.name)).toEqual(['scan.pdf']);
  });

  it('sends a file over the chat limit but within the plan to a project, in plain words', () => {
    const onError = vi.fn();
    const { result } = renderHook(() =>
      useAttachments({
        onError,
        planFileLimitBytes: 250 * 1024 * 1024,
        planLabel: 'Pro',
      }),
    );

    act(() => {
      result.current.addFiles([
        file('report.pdf', 'application/pdf', MAX_CHAT_ATTACHMENT_BYTES + 1),
      ]);
    });

    expect(onError).toHaveBeenCalledWith(
      `"report.pdf" was not attached. ${CHAT_ATTACHMENT_NEEDS_PROJECT_MESSAGE}`,
    );
    expect(result.current.refused).toEqual([{ filename: 'report.pdf', reason: 'too_large' }]);
  });

  it('names the plan limit for a file larger than the plan allows', () => {
    const onError = vi.fn();
    const { result } = renderHook(() =>
      useAttachments({ onError, planFileLimitBytes: 25 * 1024 * 1024, planLabel: 'Free' }),
    );

    act(() => {
      result.current.addFiles([file('video.png', 'image/png', 26 * 1024 * 1024)]);
    });

    expect(onError.mock.calls[0]?.[0]).toContain(
      'Free accounts can upload files up to 25.0 MB each.',
    );
  });

  it('takes 20 files on a paid plan', () => {
    const { result } = renderHook(() => useAttachments({ maxFiles: 20 }));

    act(() => {
      result.current.addFiles(
        Array.from({ length: 20 }, (_, index) => file(`note-${index}.txt`, 'text/plain')),
      );
    });

    expect(result.current.attachments).toHaveLength(20);
  });

  it('becomes a line the outgoing turn can carry, so the model is not left guessing', () => {
    const { result } = renderHook(() => useAttachments());

    act(() => {
      result.current.addFiles([file('archive.zip', 'application/zip')]);
    });

    expect(chatDraftRefusalNotes(result.current.refused)).toEqual([
      '[attachment unavailable: archive.zip is not a file type this chat can read.]',
    ]);
  });

  it('is forgotten with the rest of the draft, so it rides one turn only', () => {
    const { result } = renderHook(() => useAttachments());

    act(() => {
      result.current.addFiles([file('installer.dmg', 'application/x-apple-diskimage')]);
    });
    act(() => {
      result.current.clearAll();
    });

    expect(result.current.refused).toEqual([]);
  });
});

describe('the attachment total for one message', () => {
  const overHalf = Math.floor(MAX_CHAT_ATTACHMENT_MESSAGE_BYTES / 2) + 1;

  it('refuses the file that would take the message over its total, by name and limit', () => {
    const onError = vi.fn();
    const { result } = renderHook(() => useAttachments({ onError }));

    act(() => {
      result.current.addFiles([
        file('first.pdf', 'application/pdf', overHalf),
        file('second.pdf', 'application/pdf', overHalf),
      ]);
    });

    expect(result.current.attachments.map((item) => item.name)).toEqual(['first.pdf']);
    expect(result.current.refused).toEqual([
      { filename: 'second.pdf', reason: 'over_message_budget' },
    ]);
    expect(onError).toHaveBeenCalledWith(
      `Attached 1 of 2 files. Not attached: "second.pdf" (over the ${MESSAGE_TOTAL} total for one message).`,
    );
    expect(chatDraftRefusalNotes(result.current.refused)).toEqual([
      '[attachment unavailable: second.pdf was left out because this message already carries as much file data as it can.]',
    ]);
  });

  it('counts files already on the draft, so the send never meets a total the tray allowed', () => {
    const onError = vi.fn();
    const { result } = renderHook(() => useAttachments({ onError }));

    act(() => result.current.addFiles([file('first.pdf', 'application/pdf', overHalf)]));
    act(() => result.current.addFiles([file('second.pdf', 'application/pdf', overHalf)]));

    expect(result.current.attachments.map((item) => item.name)).toEqual(['first.pdf']);
    expect(onError).toHaveBeenLastCalledWith(
      `"second.pdf" was not attached. Files on one message must total ${MESSAGE_TOTAL} or less.`,
    );
  });

  it('gives the room back when a file is removed or the draft is cleared', () => {
    const { result } = renderHook(() => useAttachments());
    const second = file('second.pdf', 'application/pdf', overHalf);

    act(() => result.current.addFiles([file('first.pdf', 'application/pdf', overHalf)]));
    act(() => result.current.removeFile(0));
    act(() => result.current.addFiles([second]));
    expect(result.current.attachments.map((item) => item.name)).toEqual(['second.pdf']);

    act(() => result.current.clearAll());
    act(() => result.current.addFiles([file('third.pdf', 'application/pdf', overHalf)]));
    expect(result.current.attachments.map((item) => item.name)).toEqual(['third.pdf']);
  });

  it('tells the caller which incoming files the draft took, so a full draft takes none', async () => {
    const { result } = renderHook(() => useAttachments({ maxFiles: 1 }));
    const first = file('first.txt', 'text/plain');
    const second = file('second.txt', 'text/plain');
    const third = file('third.txt', 'text/plain');
    let taken: File[] = [];
    let refusedWhenFull: File[] = [file('unset.txt', 'text/plain')];

    await act(async () => {
      taken = await result.current.admitFiles([first, second]);
    });
    expect(taken).toEqual([first]);

    await act(async () => {
      refusedWhenFull = await result.current.admitFiles([third]);
    });
    expect(refusedWhenFull).toEqual([]);
    expect(result.current.attachments.map((item) => item.name)).toEqual(['first.txt']);
  });
});

const MIB = 1024 * 1024;
const PLAN_FILE_LIMIT = MAX_CHAT_ATTACHMENT_BYTES;

const OFFER: ChatAttachmentLimits = {
  maxFileBytes: CHAT_LARGE_FILE_POLICY.largeFiles.maxBytes,
  maxImageBytes: MAX_CHAT_IMAGE_ATTACHMENT_BYTES,
  maxMessageBytes: CHAT_LARGE_FILE_POLICY.largeFiles.maxMessageBytes,
  maxFilesPerMessage: CHAT_LARGE_FILE_POLICY.largeFiles.maxCount,
  largeFilesAvailable: true,
  storageRemainingBytes: null,
  inlineMessageBytes: MAX_CHAT_ATTACHMENT_MESSAGE_BYTES,
};

/** A file that reports a size without the test holding that many bytes. */
function sized(name: string, type: string, bytes: number): File {
  const held = new File([new Uint8Array(4)], name, { type });
  Object.defineProperty(held, 'size', { value: bytes });
  return held;
}

function composerUnder(limits: ChatAttachmentLimits, onError = vi.fn()) {
  useBillingStore.setState({ attachmentLimits: limits });
  return renderHook(() =>
    useAttachments({
      onError,
      maxFiles: limits.maxFilesPerMessage,
      maxFileSize: limits.maxFileBytes,
      maxImageSize: limits.maxImageBytes,
      maxTotalBytes: limits.maxMessageBytes,
      planFileLimitBytes: PLAN_FILE_LIMIT,
      planLabel: 'Pro',
    }),
  );
}

describe('a draft under a handshake that offers large files', () => {
  afterEach(() => {
    useBillingStore.setState({ attachmentLimits: null });
  });

  it('refuses the third 10 MiB image with the message size copy of today', async () => {
    const onError = vi.fn();
    const { result } = composerUnder(OFFER, onError);

    act(() => result.current.addFiles([sized('a.png', 'image/png', 10 * MIB)]));
    act(() => result.current.addFiles([sized('b.png', 'image/png', 10 * MIB)]));
    act(() => result.current.addFiles([sized('c.png', 'image/png', 10 * MIB)]));

    expect(onError).toHaveBeenLastCalledWith(
      `"c.png" was not attached. Files on one message must total ${MESSAGE_TOTAL} or less.`,
    );
    expect(result.current.refused).toContainEqual({
      filename: 'c.png',
      reason: 'over_message_budget',
    });
    await waitFor(() => expect(result.current.preparing).toBe(false));
  });

  it('holds the small files of one message to the inline budget while a large file rides along', () => {
    const onError = vi.fn();
    const { result } = composerUnder(OFFER, onError);

    act(() => {
      result.current.addFiles([
        sized('book.pdf', 'application/pdf', 300 * MIB),
        sized('first.pdf', 'application/pdf', 20 * MIB),
        sized('second.pdf', 'application/pdf', 20 * MIB),
      ]);
    });

    expect(result.current.attachments.map((item) => item.name)).toEqual(['book.pdf', 'first.pdf']);
    expect(onError).toHaveBeenCalledWith(
      `Attached 2 of 3 files. Not attached: "second.pdf" (over the ${MESSAGE_TOTAL} total for one message).`,
    );
  });

  it('says how much storage is left when that is what refuses the file', () => {
    const onError = vi.fn();
    const remaining = 312 * MIB;
    const { result } = composerUnder(
      {
        ...OFFER,
        maxFileBytes: remaining,
        maxMessageBytes: remaining,
        storageRemainingBytes: remaining,
      },
      onError,
    );

    act(() => result.current.addFiles([sized('archive.pdf', 'application/pdf', 400 * MIB)]));

    expect(onError).toHaveBeenCalledWith(
      '"archive.pdf" was not attached. You have 312 MB of storage left. Delete files in your Library to make room.',
    );
    expect(result.current.refused).toEqual([{ filename: 'archive.pdf', reason: 'too_large' }]);
  });

  it('names the storage left when two large files together pass it', () => {
    const onError = vi.fn();
    const remaining = 312 * MIB;
    const { result } = composerUnder(
      {
        ...OFFER,
        maxFileBytes: remaining,
        maxMessageBytes: remaining,
        storageRemainingBytes: remaining,
      },
      onError,
    );

    act(() => result.current.addFiles([sized('one.pdf', 'application/pdf', 200 * MIB)]));
    act(() => result.current.addFiles([sized('two.pdf', 'application/pdf', 200 * MIB)]));

    expect(result.current.attachments.map((item) => item.name)).toEqual(['one.pdf']);
    expect(onError).toHaveBeenLastCalledWith(
      '"two.pdf" was not attached. You have 312 MB of storage left. Delete files in your Library to make room.',
    );
  });

  it('names the plan limit, not the storage left, when the plan is the lower of the two', () => {
    const onError = vi.fn();
    const storageLeft = OFFER.maxFileBytes + 50 * MIB;
    const { result } = composerUnder({ ...OFFER, storageRemainingBytes: storageLeft }, onError);

    act(() =>
      result.current.addFiles([
        sized('film.pdf', 'application/pdf', OFFER.maxFileBytes + 100 * MIB),
      ]),
    );

    expect(onError).toHaveBeenCalledWith(
      `"film.pdf" is too large (${((OFFER.maxFileBytes + 100 * MIB) / MIB).toFixed(1)} MB). Pro accounts can upload files up to ${(OFFER.maxFileBytes / MIB).toFixed(1)} MB each.`,
    );
  });

  it('names the message total, not the storage left, when the plan is the lower of the two', () => {
    const onError = vi.fn();
    const storageLeft = OFFER.maxMessageBytes + MIB;
    const { result } = composerUnder({ ...OFFER, storageRemainingBytes: storageLeft }, onError);
    const fifth = Math.floor(OFFER.maxMessageBytes / 5) + MIB;
    const names = ['one.pdf', 'two.pdf', 'three.pdf', 'four.pdf', 'five.pdf'];

    for (const name of names) {
      act(() => result.current.addFiles([sized(name, 'application/pdf', fifth)]));
    }

    expect(result.current.attachments.map((item) => item.name)).toEqual(names.slice(0, 4));
    expect(onError).toHaveBeenLastCalledWith(
      `"five.pdf" was not attached. Files on one message must total ${(OFFER.maxMessageBytes / MIB).toFixed(1)} MB or less.`,
    );
  });

  it('refuses a large file over the cap for its kind when it is attached', () => {
    const onError = vi.fn();
    const { result } = composerUnder(OFFER, onError);
    const cap = CHAT_LARGE_FILE_POLICY.kinds.spreadsheet.maxBytes;

    act(() =>
      result.current.addFiles([
        sized(
          'ledger.xlsx',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          cap + 1,
        ),
      ]),
    );

    expect(result.current.attachments).toHaveLength(0);
    expect(onError).toHaveBeenCalledWith(
      `"ledger.xlsx" is too large (${((cap + 1) / MIB).toFixed(1)} MB). Files of this type can be up to ${(cap / MIB).toFixed(1)} MB.`,
    );
    expect(result.current.refused).toEqual([{ filename: 'ledger.xlsx', reason: 'too_large' }]);
  });

  it('names the offered limit, not the inline one, for a file larger than chat takes', () => {
    const onError = vi.fn();
    const { result } = composerUnder(OFFER, onError);

    act(() => result.current.addFiles([sized('film.pdf', 'application/pdf', 600 * MIB)]));

    expect(onError).toHaveBeenCalledWith(
      `"film.pdf" is too large (600.0 MB). Pro accounts can upload files up to ${(OFFER.maxFileBytes / MIB).toFixed(1)} MB each.`,
    );
  });

  it('keeps the limits of today when the handshake does not offer large files', () => {
    const onError = vi.fn();
    const { result } = composerUnder({ ...OFFER, largeFilesAvailable: false }, onError);

    act(() => {
      result.current.addFiles([
        sized('first.pdf', 'application/pdf', 20 * MIB),
        sized('second.pdf', 'application/pdf', 20 * MIB),
      ]);
    });

    expect(result.current.attachments.map((item) => item.name)).toEqual([
      'first.pdf',
      'second.pdf',
    ]);
  });
});
