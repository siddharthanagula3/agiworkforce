import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useVoiceInput } from '../useVoiceInput';

type Result = { results: Array<Array<{ transcript: string }>> };
let instances: Recognition[];

class Recognition {
  onresult: ((event: Result) => void) | null = null;
  onerror: ((event: { error: string }) => void) | null = null;
  onend: (() => void) | null = null;
  start = vi.fn();
  stop = vi.fn();
  abort = vi.fn();
  constructor() {
    instances.push(this);
  }
}

beforeEach(() => {
  instances = [];
  vi.stubGlobal('SpeechRecognition', Recognition);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('browser voice input lifetime', () => {
  it.each([false, true])(
    'reports a no-text end unless the user stopped (stopped=%s)',
    (stopped) => {
      const onTranscript = vi.fn();
      const { result } = renderHook(() => useVoiceInput({ onTranscript }));
      act(() => result.current.start());
      if (stopped) act(() => result.current.stop());
      act(() => instances[0]!.onend!());
      expect(result.current.state).toBe(stopped ? 'idle' : 'error');
      expect(onTranscript).not.toHaveBeenCalled();
    },
  );

  it('aborts on unmount and rejects a captured late transcript', () => {
    const onTranscript = vi.fn();
    const { result, unmount } = renderHook(() => useVoiceInput({ onTranscript }));
    act(() => result.current.start());
    const session = instances[0]!;
    const late = session.onresult!;
    unmount();
    late({ results: [[{ transcript: 'retired speech' }]] });
    expect(session.abort).toHaveBeenCalledOnce();
    expect(onTranscript).not.toHaveBeenCalled();
  });

  it('retires speech when the conversation scope changes', () => {
    const onTranscript = vi.fn();
    const { result, rerender } = renderHook(
      ({ scopeKey }) => useVoiceInput({ onTranscript, scopeKey }),
      { initialProps: { scopeKey: 'first-chat' } },
    );
    act(() => result.current.start());
    const session = instances[0]!;
    const late = session.onresult!;
    rerender({ scopeKey: 'next-chat' });
    act(() => late({ results: [[{ transcript: 'retired speech' }]] }));
    expect(session.abort).toHaveBeenCalledOnce();
    expect(onTranscript).not.toHaveBeenCalled();
    expect(result.current.state).toBe('idle');
  });

  it('keeps current speech alive across ordinary same-scope renders', () => {
    const onTranscript = vi.fn();
    const { result, rerender } = renderHook(
      ({ scopeKey }) => useVoiceInput({ onTranscript: (text) => onTranscript(text), scopeKey }),
      { initialProps: { scopeKey: 'same-chat' } },
    );
    act(() => result.current.start());
    rerender({ scopeKey: 'same-chat' });
    const session = instances[0]!;
    expect(session.abort).not.toHaveBeenCalled();
    act(() => session.onresult!({ results: [[{ transcript: 'current speech' }]] }));
    expect(onTranscript).toHaveBeenCalledWith('current speech');
  });
});
