import { beforeEach, describe, expect, it, vi } from 'vitest';

const { invoke, toastInfo } = vi.hoisted(() => ({ invoke: vi.fn(), toastInfo: vi.fn() }));

vi.mock('@/lib/tauri-mock', async (importOriginal) => ({
  ...(await importOriginal<TauriMockModule>()),
  invoke,
}));
vi.mock('sonner', () => ({
  toast: { info: toastInfo, error: vi.fn(), success: vi.fn(), warning: vi.fn() },
}));

import { getRoutingSlotModel } from '@agiworkforce/types';
import { useAppModeStore } from '../appModeStore';
import { useModelStore } from '../modelStore';
import { DICTATION_CLEANUP_SKIPPED_NOTE, useVoiceInputStore } from '../settings/voice';

type TauriMockModule = typeof import('@/lib/tauri-mock');

const RAW = 'um so like send the report to the team';

function cleanupRequests() {
  return invoke.mock.calls
    .filter(([command]) => command === 'llm_send_message')
    .map(([, args]) => (args as { request: Record<string, unknown> }).request);
}

describe('dictation AI cleanup stays inside the app trust boundary', () => {
  beforeEach(() => {
    invoke.mockReset();
    toastInfo.mockReset();
    useVoiceInputStore.setState({ postProcessingMode: 'ai' });
    useAppModeStore.setState({ mode: 'local' });
  });

  it('skips cleanup in Local mode when the selected model is hosted, and says so', async () => {
    for (const selectedProvider of ['anthropic', 'openai', 'managed_cloud', null] as const) {
      invoke.mockReset();
      toastInfo.mockReset();
      useModelStore.setState({ selectedModel: 'fixture-hosted-model', selectedProvider });

      const result = await useVoiceInputStore.getState().processTranscript(RAW);

      expect(cleanupRequests(), `provider ${selectedProvider}`).toEqual([]);
      expect(result.text).toBe(RAW);
      expect(toastInfo).toHaveBeenCalledWith(DICTATION_CLEANUP_SKIPPED_NOTE, expect.anything());
    }
  });

  it('sends a Local request to the selected local runtime only', async () => {
    useModelStore.setState({ selectedModel: 'fixture-local-model', selectedProvider: 'ollama' });
    invoke.mockResolvedValue({ content: 'Send the report to the team.' });

    const result = await useVoiceInputStore.getState().processTranscript(RAW);

    expect(result.text).toBe('Send the report to the team.');
    expect(cleanupRequests()).toEqual([
      expect.objectContaining({
        provider: 'ollama',
        model: 'fixture-local-model',
        trust_mode: 'local',
        prefer_cloud_credits: false,
      }),
    ]);
    expect(toastInfo).not.toHaveBeenCalled();
  });

  it('keeps the raw transcript with a note when the native side has no Local candidate', async () => {
    useModelStore.setState({ selectedModel: 'fixture-local-model', selectedProvider: 'ollama' });
    invoke.mockRejectedValue('[ERR_NO_CANDIDATES] No local model provider is reachable.');

    const result = await useVoiceInputStore.getState().processTranscript(RAW);

    expect(result.text).toBe(RAW);
    expect(toastInfo).toHaveBeenCalledWith(DICTATION_CLEANUP_SKIPPED_NOTE, expect.anything());
  });

  it('sends a Cloud request to Managed Cloud with the managed trust mode', async () => {
    useAppModeStore.setState({ mode: 'cloud' });
    useModelStore.setState({ selectedModel: 'fixture-local-model', selectedProvider: 'ollama' });
    invoke.mockResolvedValue({ content: 'Send the report to the team.' });

    await useVoiceInputStore.getState().processTranscript(RAW);

    expect(cleanupRequests()).toEqual([
      expect.objectContaining({
        provider: 'managed_cloud',
        model: getRoutingSlotModel('voice_rewrite'),
        trust_mode: 'managed',
        prefer_cloud_credits: true,
      }),
    ]);
  });

  it('never calls a model when post-processing is not AI', async () => {
    useVoiceInputStore.setState({ postProcessingMode: 'none' });
    useModelStore.setState({ selectedModel: 'fixture-local-model', selectedProvider: 'ollama' });

    const result = await useVoiceInputStore.getState().processTranscript(RAW);

    expect(result.text).toBe(RAW);
    expect(cleanupRequests()).toEqual([]);
  });
});
