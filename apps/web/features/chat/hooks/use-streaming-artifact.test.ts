import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import {
  computeDerivedArtifactId,
  extractTrailingUnclosedBlock,
  type TrailingUnclosedBlock,
} from '@agiworkforce/services';
import { useStreamingArtifactSync } from './use-streaming-artifact';
import { useStreamingArtifactStore } from '../stores/streaming-artifact-store';
import { useArtifactsStore } from '../stores/artifacts-store';

const MESSAGE_ID = 'msg-1';
const CONVERSATION_ID = 'conv-1';

function blockFor(markdown: string): TrailingUnclosedBlock | null {
  return extractTrailingUnclosedBlock(markdown);
}

describe('useStreamingArtifactSync', () => {
  beforeEach(() => {
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

    // User closes the panel mid-stream — the same block must not force it open again.
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
});
