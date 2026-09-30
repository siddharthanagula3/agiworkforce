import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import {
  MAX_CHAT_ATTACHMENT_BYTES,
  MAX_CHAT_ATTACHMENT_MESSAGE_BYTES,
} from '@/lib/chat-attachment-policy';
import { chatDraftRefusalNotes } from '@features/chat/lib/attachment-metadata';
import { useAttachments } from '../use-attachments';

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
      'Attached 1 of 2 files. Not attached: "second.pdf" (over the 12.0 MB total for one message).',
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
      '"second.pdf" was not attached. Files on one message must total 12.0 MB or less.',
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
});
