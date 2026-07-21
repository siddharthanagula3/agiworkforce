import { describe, it, expect, beforeEach, vi } from 'vitest';
import { toast } from 'sonner';

import { useComputerUseStore } from '../computerUseStore';
import { useAppModeStore } from '../appModeStore';
import { invoke } from '../../lib/tauri-mock';
import { STORAGE_KEYS } from '../../constants/storageKeys';

vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), {
    info: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
  }),
}));

const mockInvoke = vi.mocked(invoke);

describe('computerUseStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.removeItem(STORAGE_KEYS.COMPUTER_USE_MODEL);
    window.localStorage.removeItem(STORAGE_KEYS.COMPUTER_USE_PROVIDER);
    useComputerUseStore.getState().reset();
    // TRUST BOUNDARY (desktop-trust-boundary-01): pin the workspace mode so
    // the executionMode each OPA submission sends is deterministic, not an
    // accident of the non-Tauri test environment's default.
    useAppModeStore.setState({ mode: 'local' });
  });

  describe('executeOpaTask trust boundary', () => {
    it('strips an explicit cloud provider in local mode and stays local_only', async () => {
      mockInvoke.mockResolvedValueOnce({ success: true });

      await useComputerUseStore
        .getState()
        .executeOpaTask('Open the settings pane', { provider: 'anthropic' });

      expect(mockInvoke).toHaveBeenCalledWith(
        'computer_use_execute_opa_task',
        expect.objectContaining({
          description: 'Open the settings pane',
          provider: null,
          model: null,
          executionMode: 'local_only',
        }),
      );
      expect(toast.info).toHaveBeenCalledWith(
        'Cloud vision model requires a BYOK continuation — using local models in Local mode',
      );
    });

    it('strips a persisted settings-picker cloud provider in local mode', async () => {
      window.localStorage.setItem(STORAGE_KEYS.COMPUTER_USE_PROVIDER, 'openai');
      window.localStorage.setItem(STORAGE_KEYS.COMPUTER_USE_MODEL, 'some-cloud-vision-model');
      mockInvoke.mockResolvedValueOnce({ success: true });

      await useComputerUseStore.getState().executeOpaTask('Open the settings pane');

      expect(mockInvoke).toHaveBeenCalledWith(
        'computer_use_execute_opa_task',
        expect.objectContaining({ provider: null, model: null, executionMode: 'local_only' }),
      );
      expect(toast.info).toHaveBeenCalledWith(
        'Cloud vision model requires a BYOK continuation — using local models in Local mode',
      );
    });

    it('preserves a local provider in local mode without toasting', async () => {
      mockInvoke.mockResolvedValueOnce({ success: true });

      await useComputerUseStore
        .getState()
        .executeOpaTask('Open the settings pane', { provider: 'ollama' });

      expect(mockInvoke).toHaveBeenCalledWith(
        'computer_use_execute_opa_task',
        expect.objectContaining({ provider: 'ollama', executionMode: 'local_only' }),
      );
      expect(toast.info).not.toHaveBeenCalled();
    });

    it('sends executionMode local_only when no provider is configured in local mode', async () => {
      mockInvoke.mockResolvedValueOnce({ success: true });

      await useComputerUseStore.getState().executeOpaTask('Open the settings pane');

      expect(mockInvoke).toHaveBeenCalledWith(
        'computer_use_execute_opa_task',
        expect.objectContaining({ provider: null, executionMode: 'local_only' }),
      );
    });

    it('sends executionMode cloud_managed with the provider preserved in cloud mode', async () => {
      useAppModeStore.setState({ mode: 'cloud' });
      window.localStorage.setItem(STORAGE_KEYS.COMPUTER_USE_PROVIDER, 'anthropic');
      mockInvoke.mockResolvedValueOnce({ success: true });

      await useComputerUseStore.getState().executeOpaTask('Open the settings pane');

      expect(mockInvoke).toHaveBeenCalledWith(
        'computer_use_execute_opa_task',
        expect.objectContaining({ provider: 'anthropic', executionMode: 'cloud_managed' }),
      );
      expect(toast.info).not.toHaveBeenCalled();
    });

    it('sends executionMode cloud_managed when no provider is configured in cloud mode', async () => {
      useAppModeStore.setState({ mode: 'cloud' });
      mockInvoke.mockResolvedValueOnce({ success: true });

      await useComputerUseStore.getState().executeOpaTask('Open the settings pane');

      expect(mockInvoke).toHaveBeenCalledWith(
        'computer_use_execute_opa_task',
        expect.objectContaining({ provider: null, executionMode: 'cloud_managed' }),
      );
    });
  });
});
