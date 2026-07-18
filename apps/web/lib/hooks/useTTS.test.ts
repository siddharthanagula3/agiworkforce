import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useTTS } from './useTTS';

class FakeUtterance {
  readonly text: string;
  rate = 1;
  pitch = 1;
  volume = 1;
  onstart: (() => void) | null = null;
  onend: (() => void) | null = null;
  onerror: (() => void) | null = null;

  constructor(text: string) {
    this.text = text;
  }
}

const synthesis = {
  cancel: vi.fn(),
  speak: vi.fn(),
};

beforeEach(() => {
  synthesis.cancel.mockClear();
  synthesis.speak.mockClear();
  vi.stubGlobal('SpeechSynthesisUtterance', FakeUtterance);
  Object.defineProperty(window, 'speechSynthesis', {
    configurable: true,
    value: synthesis,
  });
});

describe('useTTS', () => {
  it('reads clean prose instead of Markdown syntax or raw code', () => {
    const { result } = renderHook(() => useTTS());

    act(() =>
      result.current.speak(
        '## Result\n**Done** [here](https://example.com)\n```ts\nsecret();\n```',
      ),
    );

    const utterance = synthesis.speak.mock.calls[0]?.[0] as FakeUtterance;
    expect(utterance.text).toBe('Result\nDone here\ncode block omitted.');
  });

  it('tracks start and completion from the active utterance', () => {
    const { result } = renderHook(() => useTTS());

    act(() => result.current.speak('Hello'));
    const utterance = synthesis.speak.mock.calls[0]?.[0] as FakeUtterance;
    act(() => utterance.onstart?.());
    expect(result.current.isSpeaking).toBe(true);

    act(() => utterance.onend?.());
    expect(result.current.isSpeaking).toBe(false);
  });

  it('switches directly to another response and ignores stale completion events', () => {
    const { result } = renderHook(() => useTTS());

    act(() => result.current.speak('First'));
    const first = synthesis.speak.mock.calls[0]?.[0] as FakeUtterance;
    act(() => first.onstart?.());

    act(() => result.current.speak('Second'));
    const second = synthesis.speak.mock.calls[1]?.[0] as FakeUtterance;
    expect(second.text).toBe('Second');
    act(() => second.onstart?.());
    act(() => first.onend?.());

    expect(result.current.isSpeaking).toBe(true);
  });
});
