import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../lib/tauri-mock', async () => {
  const actual =
    await vi.importActual<typeof import('../../lib/tauri-mock')>('../../lib/tauri-mock');

  return {
    ...actual,
    isTauri: true,
    listen: vi.fn(
      async (_event: string, handler: (event: { payload: unknown; id: number }) => void) => {
        (globalThis as Record<string, unknown>)['__deepgramHandler'] = handler;
        return vi.fn(() => {
          delete (globalThis as Record<string, unknown>)['__deepgramHandler'];
        });
      },
    ),
  };
});

vi.mock('../../api/voice', async () => {
  const actual = await vi.importActual<typeof import('../../api/voice')>('../../api/voice');
  return {
    ...actual,
    voiceStartDeepgramStream: vi.fn(async () => undefined),
    voiceStopDeepgramStream: vi.fn(async () => null),
  };
});

import { voiceStartDeepgramStream, voiceStopDeepgramStream } from '../../api/voice';
import { listen } from '../../lib/tauri-mock';
import { useVoiceModeStore } from '../../stores/voiceModeStore';

describe('voiceModeStore Deepgram wiring', () => {
  beforeEach(() => {
    useVoiceModeStore.getState().reset();
    useVoiceModeStore.setState({ _deepgramUnlisten: null });
    vi.clearAllMocks();
    delete (globalThis as Record<string, unknown>)['__deepgramHandler'];
  });

  it('registers transcript listener and updates the live transcript', async () => {
    await useVoiceModeStore.getState().startDeepgramStream();

    expect(listen).toHaveBeenCalledWith('deepgram:transcript', expect.any(Function));
    expect(voiceStartDeepgramStream).toHaveBeenCalled();
    expect(useVoiceModeStore.getState().deepgramStreaming).toBe(true);

    const handler = (globalThis as Record<string, unknown>)['__deepgramHandler'] as
      | ((event: { payload: { text: string }; id: number }) => void)
      | undefined;

    handler?.({ payload: { text: 'hello world' }, id: 1 });

    expect(useVoiceModeStore.getState().userTranscript).toBe('hello world');
  });

  it('cleans up the listener when Deepgram streaming stops', async () => {
    await useVoiceModeStore.getState().startDeepgramStream();
    await useVoiceModeStore.getState().stopDeepgramStream();

    expect(voiceStopDeepgramStream).toHaveBeenCalled();
    expect(useVoiceModeStore.getState().deepgramStreaming).toBe(false);
    expect(useVoiceModeStore.getState()._deepgramUnlisten).toBeNull();
  });
});
