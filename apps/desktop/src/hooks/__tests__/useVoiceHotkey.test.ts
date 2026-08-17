import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

const { listenMock } = vi.hoisted(() => ({ listenMock: vi.fn() }));

vi.mock('../../lib/tauri-mock', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/tauri-mock')>();
  return { ...actual, listen: listenMock };
});

import { useVoiceHotkey } from '../useVoiceHotkey';
import { useVoiceInputStore, useVoiceModeStore } from '../../stores/settingsStore';

type Handler = (event: { payload: unknown }) => void;

const listeners = new Map<string, Handler>();
let startListening: Mock<() => Promise<void>>;

async function mountHook() {
  const rendered = renderHook(() => useVoiceHotkey());
  await waitFor(() => {
    expect(listeners.has('wake:event')).toBe(true);
    expect(listeners.has('dictation:event')).toBe(true);
  });
  return rendered;
}

function emit(event: string, payload: unknown) {
  act(() => {
    listeners.get(event)?.({ payload });
  });
}

describe('useVoiceHotkey backend event subscriptions', () => {
  beforeEach(() => {
    listeners.clear();
    listenMock.mockReset();
    listenMock.mockImplementation(async (event: string, handler: Handler) => {
      listeners.set(event, handler);
      return () => listeners.delete(event);
    });
    startListening = vi.fn<() => Promise<void>>(async () => {});
    useVoiceInputStore.setState({ startListening, voiceMode: 'idle', voiceError: null });
    useVoiceModeStore.setState({ wakeWordActive: true });
  });

  afterEach(() => {
    cleanup();
  });

  it('starts dictation when the backend reports a matched wake phrase', async () => {
    await mountHook();

    emit('wake:event', { version: 1, kind: 'detected', phrase: 'Hey AGI', confidence: 1 });

    expect(startListening).toHaveBeenCalledTimes(1);
  });

  it('ignores a wake phrase while a dictation session is already running', async () => {
    await mountHook();
    useVoiceInputStore.setState({ voiceMode: 'listening' });

    emit('wake:event', { version: 1, kind: 'detected', phrase: 'Hey AGI', confidence: 1 });

    expect(startListening).not.toHaveBeenCalled();
  });

  it('clears the listening badge and surfaces the reason when wake detection is refused', async () => {
    await mountHook();

    emit('wake:event', {
      version: 1,
      kind: 'refused',
      detail: 'Wake-phrase detection is not available in this build',
      confidence: 0,
    });

    expect(useVoiceModeStore.getState().wakeWordActive).toBe(false);
    expect(useVoiceInputStore.getState().voiceError).toBe(
      'Wake-phrase detection is not available in this build',
    );
    expect(startListening).not.toHaveBeenCalled();
  });

  it('clears the listening badge when the detector stops on its own', async () => {
    await mountHook();

    emit('wake:event', { version: 1, kind: 'stopped', confidence: 0 });

    expect(useVoiceModeStore.getState().wakeWordActive).toBe(false);
    expect(useVoiceInputStore.getState().voiceError).toBeNull();
  });

  it('surfaces a refused global dictation session instead of failing silently', async () => {
    await mountHook();

    emit('dictation:event', {
      version: 1,
      kind: 'refused',
      source: 'global',
      detail: 'system dictation unavailable in this build',
    });

    expect(useVoiceInputStore.getState().voiceError).toBe(
      'system dictation unavailable in this build',
    );
  });

  it('ignores dictation lifecycle events that are not refusals', async () => {
    await mountHook();

    emit('dictation:event', { version: 1, kind: 'session-started', source: 'in_app' });

    expect(useVoiceInputStore.getState().voiceError).toBeNull();
  });

  it('unsubscribes both channels on unmount', async () => {
    const { unmount } = await mountHook();

    unmount();

    expect(listeners.size).toBe(0);
  });
});
