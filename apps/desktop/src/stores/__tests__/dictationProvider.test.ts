import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/tauri-mock', () => ({
  listen: vi.fn().mockResolvedValue(() => {}),
  isTauri: false,
  invoke: vi.fn(),
}));

import { normalizeDictationProvider } from '../settings/voice';

describe('normalizeDictationProvider', () => {
  it('keeps every explicit mode unchanged', () => {
    expect(normalizeDictationProvider('local_whisper')).toBe('local_whisper');
    expect(normalizeDictationProvider('openai_whisper')).toBe('openai_whisper');
    expect(normalizeDictationProvider('managed_cloud')).toBe('managed_cloud');
  });

  it('moves a legacy third-party choice to the on-device engine, never to AGI Cloud', () => {
    expect(normalizeDictationProvider('deepgram')).toBe('local_whisper');
  });

  it('fails safe to the offline default for unknown values', () => {
    for (const value of ['', 'azure', 'Deepgram', 42, null, undefined, {}]) {
      expect(normalizeDictationProvider(value)).toBe('local_whisper');
    }
  });
});
