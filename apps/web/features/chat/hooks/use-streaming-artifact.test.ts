import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createElement, StrictMode, type ReactNode } from 'react';
import { renderHook } from '@testing-library/react';
import {
  computeDerivedArtifactId,
  extractTrailingUnclosedBlock,
  type TrailingUnclosedBlock,
} from '@agiworkforce/artifacts';
import { useStreamingArtifactSync } from './use-streaming-artifact';
import { useStreamingArtifactStore } from '../stores/streaming-artifact-store';
import { useArtifactsStore } from '../stores/artifacts-store';

const toastMock = vi.hoisted(() => ({ message: vi.fn() }));
vi.mock('sonner', () => ({ toast: toastMock }));

const MESSAGE_ID = 'msg-1';
const CONVERSATION_ID = 'conv-1';

function blockFor(markdown: string): TrailingUnclosedBlock | null {
  return extractTrailingUnclosedBlock(markdown);
}

describe('useStreamingArtifactSync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useArtifactsStore.getState().reset();
    useArtifactsStore.getState().setPanelOpen(false);
    useStreamingArtifactStore.getState().clearStreamingArtifact();
  });

  it('publishes the partial block, auto-opens the panel, and selects the deterministic id', () => {
    const block = blockFor('Sure!\n\n```html\n<!DOCTYPE html>\n<html>');
    renderHook(() =>
      useStreamingArtifactSync({
        messageId: MESSAGE_ID,
        conversationId: CONVERSATION_ID,
        isStreaming: true,
        block,
      }),
    );

    const expectedId = computeDerivedArtifactId(CONVERSATION_ID, MESSAGE_ID, 0);
    const streaming = useStreamingArtifactStore.getState().streaming;
    expect(streaming?.artifactId).toBe(expectedId);
    expect(streaming?.content).toBe('<!DOCTYPE html>\n<html>');
    expect(streaming?.language).toBe('html');
    expect(useArtifactsStore.getState().panelOpen).toBe(true);
    expect(useArtifactsStore.getState().selectedArtifactId).toBe(expectedId);
  });

  it('updates the streamed content on subsequent chunks without re-opening a user-closed panel', () => {
    const { rerender } = renderHook(
      ({ block }: { block: TrailingUnclosedBlock | null }) =>
        useStreamingArtifactSync({
          messageId: MESSAGE_ID,
          conversationId: CONVERSATION_ID,
          isStreaming: true,
          block,
        }),
      { initialProps: { block: blockFor('```html\n<!DOCTYPE') } },
    );

    useArtifactsStore.getState().setPanelOpen(false);

    rerender({ block: blockFor('```html\n<!DOCTYPE html>\n<body>') });
    expect(useStreamingArtifactStore.getState().streaming?.content).toBe('<!DOCTYPE html>\n<body>');
    expect(useArtifactsStore.getState().panelOpen).toBe(false);
  });

  it('clears the ephemeral entry when the fence closes (block becomes null)', () => {
    const { rerender } = renderHook(
      ({ block }: { block: TrailingUnclosedBlock | null }) =>
        useStreamingArtifactSync({
          messageId: MESSAGE_ID,
          conversationId: CONVERSATION_ID,
          isStreaming: true,
          block,
        }),
      { initialProps: { block: blockFor('```html\n<div>hi</div>') } },
    );
    expect(useStreamingArtifactStore.getState().streaming).not.toBeNull();

    rerender({ block: null });
    expect(useStreamingArtifactStore.getState().streaming).toBeNull();
  });

  it('clears the ephemeral entry when streaming ends', () => {
    const block = blockFor('```html\n<div>partial');
    const { rerender } = renderHook(
      ({ isStreaming }: { isStreaming: boolean }) =>
        useStreamingArtifactSync({
          messageId: MESSAGE_ID,
          conversationId: CONVERSATION_ID,
          isStreaming,
          block,
        }),
      { initialProps: { isStreaming: true } },
    );
    expect(useStreamingArtifactStore.getState().streaming).not.toBeNull();

    rerender({ isStreaming: false });
    expect(useStreamingArtifactStore.getState().streaming).toBeNull();
  });

  // A stopped turn leaves its fence OPEN, so the caller still derives a block
  // for it; a finished turn closes the fence and has none. That difference is
  // the whole signal, and an earlier version of this test destroyed it by
  // nulling the block on the transition.
  it('keeps what arrived when the stream is stopped mid-artifact', () => {
    const openFence = blockFor('```html\n<div>partial');
    const { rerender } = renderHook(
      ({ isStreaming }: { isStreaming: boolean }) =>
        useStreamingArtifactSync({
          messageId: MESSAGE_ID,
          conversationId: CONVERSATION_ID,
          isStreaming,
          block: openFence,
        }),
      { initialProps: { isStreaming: true } },
    );

    rerender({ isStreaming: false });

    const expectedId = computeDerivedArtifactId(CONVERSATION_ID, MESSAGE_ID, 0);
    const kept = useArtifactsStore.getState().getMessageArtifacts(MESSAGE_ID);
    expect(kept).toHaveLength(1);
    expect(kept[0]?.id).toBe(expectedId);
    expect(kept[0]?.content).toBe('<div>partial');
    expect(kept[0]?.interrupted).toBe(true);
    expect(useStreamingArtifactStore.getState().streaming).toBeNull();
  });

  it('leaves the completed artifact to the message parser when the fence closes', () => {
    const { rerender } = renderHook(
      ({ isStreaming, block }: { isStreaming: boolean; block: TrailingUnclosedBlock | null }) =>
        useStreamingArtifactSync({
          messageId: MESSAGE_ID,
          conversationId: CONVERSATION_ID,
          isStreaming,
          block,
        }),
      { initialProps: { isStreaming: true, block: blockFor('```html\n<div>hi</div>') } },
    );

    rerender({ isStreaming: true, block: null });
    rerender({ isStreaming: false, block: null });

    expect(useArtifactsStore.getState().getMessageArtifacts(MESSAGE_ID)).toHaveLength(0);
  });

  it('keeps nothing when the last chunk both closes the fence and ends the turn', () => {
    const { rerender } = renderHook(
      ({ isStreaming, block }: { isStreaming: boolean; block: TrailingUnclosedBlock | null }) =>
        useStreamingArtifactSync({
          messageId: MESSAGE_ID,
          conversationId: CONVERSATION_ID,
          isStreaming,
          block,
        }),
      { initialProps: { isStreaming: true, block: blockFor('```html\n<div>hi') } },
    );

    rerender({ isStreaming: false, block: null });

    expect(useArtifactsStore.getState().getMessageArtifacts(MESSAGE_ID)).toHaveLength(0);
  });

  // A first turn streams under a client-only conversation id and settles under
  // the real one. Keying the kept fragment on the id derived while streaming
  // filed it under a conversation that no longer exists, which a browser run
  // showed.
  it('keeps the fragment under the conversation the turn settled in, not the placeholder', () => {
    const openFence = blockFor('```html\n<div>partial');
    const { rerender } = renderHook(
      ({ conversationId, isStreaming }: { conversationId: string; isStreaming: boolean }) =>
        useStreamingArtifactSync({
          messageId: MESSAGE_ID,
          conversationId,
          isStreaming,
          block: openFence,
        }),
      { initialProps: { conversationId: 'client-only-conversation', isStreaming: true } },
    );

    rerender({ conversationId: CONVERSATION_ID, isStreaming: false });

    const kept = useArtifactsStore.getState().getMessageArtifacts(MESSAGE_ID);
    expect(kept).toHaveLength(1);
    expect(kept[0]?.id).toBe(computeDerivedArtifactId(CONVERSATION_ID, MESSAGE_ID, 0));
  });

  it('clears its own entry on unmount', () => {
    const { unmount } = renderHook(() =>
      useStreamingArtifactSync({
        messageId: MESSAGE_ID,
        conversationId: CONVERSATION_ID,
        isStreaming: true,
        block: blockFor('```html\n<div>'),
      }),
    );
    expect(useStreamingArtifactStore.getState().streaming).not.toBeNull();
    unmount();
    expect(useStreamingArtifactStore.getState().streaming).toBeNull();
  });

  it('keeps the first partial and notifies once for a differing resumed stop in StrictMode', () => {
    const initial = { isStreaming: true, block: blockFor('```html\n<div>first') };
    const { rerender } = renderHook(
      (props: typeof initial) => useStreamingArtifactSync({
        ...props, messageId: MESSAGE_ID, conversationId: CONVERSATION_ID,
      }),
      {
        initialProps: initial,
        wrapper: ({ children }: { children: ReactNode }) => createElement(StrictMode, null, children),
      },
    );
    rerender({ ...initial, isStreaming: false });
    expect(toastMock.message).not.toHaveBeenCalled();
    const later = { isStreaming: true, block: blockFor('```html\n<div>later') };
    rerender(later);
    const before = useArtifactsStore.getState();
    const versions = before.getArtifactVersions(before.artifacts[0]!.id);
    rerender({ ...later, isStreaming: false });
    rerender({ isStreaming: false, block: blockFor('```html\n<div>later') });
    expect(useArtifactsStore.getState()).toEqual(before);
    expect(useArtifactsStore.getState().getArtifactVersions(before.artifacts[0]!.id)).toBe(versions);
    expect(useArtifactsStore.getState().artifacts[0]?.content).toBe('<div>first');
    expect(toastMock.message).toHaveBeenCalledExactlyOnceWith('New partial output was not saved over the existing artifact.');
    expect(useStreamingArtifactStore.getState().streaming).toBeNull();
  });

  it('quietly preserves renamed identical content on repeated stops', () => {
    const block = blockFor('```html\n<div>same');
    const { rerender } = renderHook(
      ({ isStreaming }: { isStreaming: boolean }) => useStreamingArtifactSync({
        messageId: MESSAGE_ID, conversationId: CONVERSATION_ID, isStreaming, block,
      }),
      { initialProps: { isStreaming: true } },
    );
    rerender({ isStreaming: false });
    const id = computeDerivedArtifactId(CONVERSATION_ID, MESSAGE_ID, 0);
    useArtifactsStore.getState().renameArtifact(id, 'My renamed draft');
    rerender({ isStreaming: true });
    rerender({ isStreaming: false });
    expect(useArtifactsStore.getState().artifacts[0]?.title).toBe('My renamed draft');
    expect(useArtifactsStore.getState().getArtifactVersions(id)).toHaveLength(1);
    expect(toastMock.message).not.toHaveBeenCalled();
  });

  it('uses the neutral hidden-work notice and clears before delivering it', () => {
    const id = computeDerivedArtifactId(CONVERSATION_ID, MESSAGE_ID, 0);
    const store = useArtifactsStore.getState();
    store.upsertArtifact({ id, messageId: MESSAGE_ID, type: 'html', language: 'html', title: 'Saved', content: '<div>same' });
    store.renameArtifact(id, 'Renamed');
    store.removeArtifact(id);
    const { rerender, unmount } = renderHook(
      ({ isStreaming }: { isStreaming: boolean }) => useStreamingArtifactSync({
        messageId: MESSAGE_ID, conversationId: CONVERSATION_ID, isStreaming,
        block: blockFor('```html\n<div>same'),
      }),
      { initialProps: { isStreaming: true } },
    );
    toastMock.message.mockImplementationOnce(() => {
      expect(useStreamingArtifactStore.getState().streaming).toBeNull();
    });
    rerender({ isStreaming: false });
    rerender({ isStreaming: false });
    unmount();
    expect(toastMock.message).toHaveBeenCalledExactlyOnceWith('New partial output was not saved.');
    expect(useArtifactsStore.getState().artifacts).toEqual([]);
  });

  it('preserves settled-id work without reopening a dismissed panel', () => {
    const id = computeDerivedArtifactId(CONVERSATION_ID, MESSAGE_ID, 0);
    useArtifactsStore.getState().upsertArtifact({ id, messageId: MESSAGE_ID, type: 'html', language: 'html', title: 'Saved', content: 'My work' });
    const { rerender } = renderHook(
      ({ conversationId, isStreaming }: { conversationId: string; isStreaming: boolean }) => useStreamingArtifactSync({
        messageId: MESSAGE_ID, conversationId, isStreaming, block: blockFor('```html\n<div>later'),
      }),
      { initialProps: { conversationId: 'temporary', isStreaming: true } },
    );
    useArtifactsStore.getState().setPanelOpen(false);
    rerender({ conversationId: CONVERSATION_ID, isStreaming: true });
    rerender({ conversationId: CONVERSATION_ID, isStreaming: false });
    expect(useArtifactsStore.getState().panelOpen).toBe(false);
    expect(useArtifactsStore.getState().selectedArtifactId).toBe(id);
    expect(useArtifactsStore.getState().artifacts).toEqual([expect.objectContaining({ id, content: 'My work' })]);
    expect(toastMock.message).toHaveBeenCalledTimes(1);
  });

  it('does not retain an old snapshot under a different message', () => {
    const { rerender } = renderHook(
      ({ messageId, isStreaming }: { messageId: string; isStreaming: boolean }) => useStreamingArtifactSync({
        messageId, conversationId: CONVERSATION_ID, isStreaming, block: blockFor('```html\n<div>partial'),
      }),
      { initialProps: { messageId: MESSAGE_ID, isStreaming: true } },
    );
    rerender({ messageId: 'other-message', isStreaming: false });
    expect(useArtifactsStore.getState().artifacts).toEqual([]);
    expect(useStreamingArtifactStore.getState().streaming).toBeNull();
    expect(toastMock.message).not.toHaveBeenCalled();
  });

  it('does not clear a different message stream during stale cleanup', () => {
    const first = renderHook(() => useStreamingArtifactSync({
      messageId: MESSAGE_ID, conversationId: CONVERSATION_ID, isStreaming: true, block: blockFor('```html\n<div>first'),
    }));
    const second = renderHook(() => useStreamingArtifactSync({
      messageId: 'other-message', conversationId: CONVERSATION_ID, isStreaming: true, block: blockFor('```html\n<div>second'),
    }));
    first.unmount();
    expect(useStreamingArtifactStore.getState().streaming?.messageId).toBe('other-message');
    expect(useArtifactsStore.getState().artifacts).toEqual([]);
    expect(toastMock.message).not.toHaveBeenCalled();
    second.unmount();
  });
});
