import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import {
  MAX_CHAT_ATTACHMENT_BYTES,
  unavailableChatAttachmentNotes,
} from '@/lib/chat-attachment-policy';
import { useAttachments } from '../use-attachments';

function file(name: string, type: string, bytes = 4): File {
  return new File([new Uint8Array(bytes)], name, { type });
}

describe('a file the composer refuses', () => {
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

    expect(unavailableChatAttachmentNotes(result.current.refused)).toEqual([
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
