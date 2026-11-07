import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  prepareChatAttachment,
  type PreparedChatAttachment,
} from '@features/chat/lib/attachment-metadata';
import { useAttachments } from '../use-attachments';

vi.mock('@features/chat/lib/attachment-metadata', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@features/chat/lib/attachment-metadata')>()),
  prepareChatAttachment: vi.fn(),
}));

function preparation() {
  let resolve!: (result: PreparedChatAttachment) => void;
  const promise = new Promise<PreparedChatAttachment>((finish) => {
    resolve = finish;
  });
  return { promise, resolve };
}

function picture(name: string): File {
  return new File(['picture'], name, { type: 'image/jpeg' });
}

describe('attachment draft reset', () => {
  beforeEach(() => {
    vi.mocked(prepareChatAttachment).mockReset();
    let nextUrl = 0;
    vi.stubGlobal('URL', class extends URL {
      static createObjectURL = vi.fn(() => `blob:attachment-reset-${++nextUrl}`);
      static revokeObjectURL = vi.fn();
    });
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('admits replacement documents without waiting for an abandoned picture', async () => {
    const old = preparation();
    vi.mocked(prepareChatAttachment).mockReturnValueOnce(old.promise);
    const { result } = renderHook(() => useAttachments());
    await act(async () => result.current.addFiles([picture('old.jpg')]));
    const document = new File(['notes'], 'new.txt', { type: 'text/plain' });

    act(() => result.current.clearAll());
    expect(result.current.preparing).toBe(false);
    act(() => result.current.addFiles([document]));
    expect(result.current.attachments).toEqual([document]);

    await act(async () => old.resolve({ status: 'ready', file: picture('old.jpg') }));
    expect(result.current.attachments).toEqual([document]);
    expect(result.current.preparing).toBe(false);
  });

  it('does not let an old finalizer release replacement preparation or publish its refusal', async () => {
    const old = preparation();
    const replacement = preparation();
    vi.mocked(prepareChatAttachment)
      .mockReturnValueOnce(old.promise)
      .mockReturnValueOnce(replacement.promise);
    const onError = vi.fn();
    const { result } = renderHook(() => useAttachments({ onError }));
    await act(async () => result.current.addFiles([picture('old.jpg')]));
    act(() => result.current.clearAll());
    const next = picture('next.jpg');
    await act(async () => result.current.addFiles([next]));
    expect(prepareChatAttachment).toHaveBeenLastCalledWith(next);

    await act(async () => old.resolve({ status: 'refused', reason: 'picture_metadata' }));
    expect(result.current.preparing).toBe(true);
    expect(result.current.refused).toEqual([]);
    expect(onError).not.toHaveBeenCalled();

    await act(async () => replacement.resolve({ status: 'ready', file: next }));
    expect(result.current.preparing).toBe(false);
    expect(result.current.attachments).toEqual([next]);
  });

  it('skips queued preparations belonging to the cleared draft', async () => {
    const old = preparation();
    const first = picture('first.jpg');
    vi.mocked(prepareChatAttachment).mockReturnValueOnce(old.promise);
    const { result } = renderHook(() => useAttachments());
    await act(async () => result.current.addFiles([first]));
    act(() => result.current.addFiles([picture('queued.jpg')]));
    act(() => result.current.clearAll());

    await act(async () => old.resolve({ status: 'ready', file: first }));
    expect(prepareChatAttachment).toHaveBeenCalledTimes(1);
    expect(result.current.attachments).toEqual([]);
    expect(result.current.preparing).toBe(false);
  });
});
