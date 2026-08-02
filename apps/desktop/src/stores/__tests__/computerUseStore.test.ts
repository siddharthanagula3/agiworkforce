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
const successfulOpaResult = {
  success: true,
  reason: { type: 'task_complete' as const },
};

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
      mockInvoke.mockResolvedValueOnce(successfulOpaResult);

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
      mockInvoke.mockResolvedValueOnce(successfulOpaResult);

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
      mockInvoke.mockResolvedValueOnce(successfulOpaResult);

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
      mockInvoke.mockResolvedValueOnce(successfulOpaResult);

      await useComputerUseStore.getState().executeOpaTask('Open the settings pane');

      expect(mockInvoke).toHaveBeenCalledWith(
        'computer_use_execute_opa_task',
        expect.objectContaining({ provider: null, executionMode: 'local_only' }),
      );
    });

    it('sends executionMode cloud_managed with the provider preserved in cloud mode', async () => {
      useAppModeStore.setState({ mode: 'cloud' });
      window.localStorage.setItem(STORAGE_KEYS.COMPUTER_USE_PROVIDER, 'anthropic');
      mockInvoke.mockResolvedValueOnce(successfulOpaResult);

      await useComputerUseStore.getState().executeOpaTask('Open the settings pane');

      expect(mockInvoke).toHaveBeenCalledWith(
        'computer_use_execute_opa_task',
        expect.objectContaining({ provider: 'anthropic', executionMode: 'cloud_managed' }),
      );
      expect(toast.info).not.toHaveBeenCalled();
    });

    it('sends executionMode cloud_managed when no provider is configured in cloud mode', async () => {
      useAppModeStore.setState({ mode: 'cloud' });
      mockInvoke.mockResolvedValueOnce(successfulOpaResult);

      await useComputerUseStore.getState().executeOpaTask('Open the settings pane');

      expect(mockInvoke).toHaveBeenCalledWith(
        'computer_use_execute_opa_task',
        expect.objectContaining({ provider: null, executionMode: 'cloud_managed' }),
      );
    });
  });

  describe('executeOpaTask ownership and cancellation', () => {
    it('cancels the exact native execution and ignores its late result', async () => {
      const executionId = '11111111-1111-4111-8111-111111111111';
      let resolveExecution!: (result: typeof successfulOpaResult) => void;
      const deferredExecution = new Promise<typeof successfulOpaResult>((resolve) => {
        resolveExecution = resolve;
      });
      mockInvoke.mockImplementation((command) => {
        if (command === 'computer_use_execute_opa_task') return deferredExecution;
        if (command === 'computer_use_cancel_opa_task') return Promise.resolve(true);
        return Promise.resolve(undefined);
      });

      const execution = useComputerUseStore
        .getState()
        .executeOpaTask('Open Notes', { executionId });
      expect(useComputerUseStore.getState().activeOpaExecutionId).toBe(executionId);

      await expect(useComputerUseStore.getState().cancelOpaTask(executionId)).resolves.toBe(true);
      expect(mockInvoke).toHaveBeenCalledWith('computer_use_cancel_opa_task', { executionId });
      expect(useComputerUseStore.getState().activeOpaExecutionId).toBeNull();
      expect(useComputerUseStore.getState().isExecutingOpa).toBe(false);

      resolveExecution(successfulOpaResult);
      await expect(execution).resolves.toBeNull();
      expect(useComputerUseStore.getState().lastOpaResult).toBeNull();
    });

    it('does not let a stale owner cancel a newer native execution', async () => {
      const currentExecutionId = '22222222-2222-4222-8222-222222222222';
      mockInvoke.mockImplementation((command) => {
        if (command === 'computer_use_execute_opa_task') return new Promise(() => {});
        return Promise.resolve(true);
      });

      void useComputerUseStore
        .getState()
        .executeOpaTask('Open Calendar', { executionId: currentExecutionId });

      await expect(
        useComputerUseStore.getState().cancelOpaTask('33333333-3333-4333-8333-333333333333'),
      ).resolves.toBe(false);
      expect(mockInvoke).not.toHaveBeenCalledWith(
        'computer_use_cancel_opa_task',
        expect.anything(),
      );
      expect(useComputerUseStore.getState().activeOpaExecutionId).toBe(currentExecutionId);

      await useComputerUseStore.getState().cancelOpaTask(currentExecutionId);
    });

    it('does not start a replacement until native cancellation is acknowledged', async () => {
      const firstExecutionId = '66666666-6666-4666-8666-666666666666';
      const replacementExecutionId = '77777777-7777-4777-8777-777777777777';
      let resolveCancellation!: (cancelled: boolean) => void;
      const cancellation = new Promise<boolean>((resolve) => {
        resolveCancellation = resolve;
      });
      let executionCount = 0;
      mockInvoke.mockImplementation((command) => {
        if (command === 'computer_use_execute_opa_task') {
          executionCount += 1;
          return executionCount === 1
            ? new Promise(() => {})
            : Promise.resolve(successfulOpaResult);
        }
        if (command === 'computer_use_cancel_opa_task') return cancellation;
        return Promise.resolve(undefined);
      });
      void useComputerUseStore
        .getState()
        .executeOpaTask('Open Notes', { executionId: firstExecutionId });

      const stopping = useComputerUseStore.getState().cancelOpaTask(firstExecutionId);
      const replacement = useComputerUseStore
        .getState()
        .executeOpaTask('Open Calendar', { executionId: replacementExecutionId });
      await Promise.resolve();
      expect(executionCount).toBe(1);

      resolveCancellation(true);
      await expect(stopping).resolves.toBe(true);
      await expect(replacement).resolves.toEqual(successfulOpaResult);
      expect(executionCount).toBe(2);
    });

    it('stops the active native execution when desktop control is disabled', async () => {
      const executionId = '44444444-4444-4444-8444-444444444444';
      mockInvoke.mockImplementation((command) => {
        if (command === 'computer_use_execute_opa_task') return new Promise(() => {});
        if (command === 'computer_use_cancel_opa_task') return Promise.resolve(true);
        return Promise.resolve(undefined);
      });
      useComputerUseStore.getState().setComputerUseEnabled(true);
      void useComputerUseStore.getState().executeOpaTask('Open Reminders', { executionId });

      useComputerUseStore.getState().setComputerUseEnabled(false);

      expect(useComputerUseStore.getState().activeOpaExecutionId).toBeNull();
      expect(mockInvoke).toHaveBeenCalledWith('computer_use_cancel_opa_task', { executionId });
    });

    it('fails closed after a native cancellation error until the same owner is stopped', async () => {
      const executionId = '55555555-5555-4555-8555-555555555555';
      mockInvoke.mockImplementation((command) => {
        if (command === 'computer_use_execute_opa_task') return new Promise(() => {});
        if (command === 'computer_use_cancel_opa_task') {
          return Promise.reject(new Error('native cancellation unavailable'));
        }
        return Promise.resolve(undefined);
      });
      void useComputerUseStore.getState().executeOpaTask('Open Mail', { executionId });

      await expect(useComputerUseStore.getState().cancelOpaTask(executionId)).resolves.toBe(false);
      expect(useComputerUseStore.getState().cancellingOpaExecutionId).toBe(executionId);

      await expect(
        useComputerUseStore.getState().executeOpaTask('Open a new app'),
      ).resolves.toBeNull();
      expect(useComputerUseStore.getState().error).toContain('not been confirmed stopped');
      expect(
        mockInvoke.mock.calls.filter(([command]) => command === 'computer_use_execute_opa_task'),
      ).toHaveLength(1);

      mockInvoke.mockResolvedValueOnce(true);
      await expect(useComputerUseStore.getState().cancelOpaTask(executionId)).resolves.toBe(true);
      expect(useComputerUseStore.getState().cancellingOpaExecutionId).toBeNull();
    });

    it('fails closed when native cancellation does not acknowledge the owner', async () => {
      const executionId = '88888888-8888-4888-8888-888888888888';
      mockInvoke.mockImplementation((command) => {
        if (command === 'computer_use_execute_opa_task') return new Promise(() => {});
        if (command === 'computer_use_cancel_opa_task') return Promise.resolve(false);
        return Promise.resolve(undefined);
      });
      void useComputerUseStore.getState().executeOpaTask('Open Mail', { executionId });

      await expect(useComputerUseStore.getState().cancelOpaTask(executionId)).resolves.toBe(false);
      expect(useComputerUseStore.getState().cancellingOpaExecutionId).toBe(executionId);
      expect(useComputerUseStore.getState().error).toContain('did not acknowledge cancellation');
      await expect(
        useComputerUseStore.getState().executeOpaTask('Start a replacement'),
      ).resolves.toBeNull();
      expect(
        mockInvoke.mock.calls.filter(([command]) => command === 'computer_use_execute_opa_task'),
      ).toHaveLength(1);

      mockInvoke.mockResolvedValueOnce(true);
      await expect(useComputerUseStore.getState().cancelOpaTask(executionId)).resolves.toBe(true);
    });

    it('deduplicates exact and ambient Stop while one native acknowledgement is pending', async () => {
      const executionId = '99999999-9999-4999-8999-999999999999';
      let acknowledgeStop!: (stopped: boolean) => void;
      const stopAcknowledgement = new Promise<boolean>((resolve) => {
        acknowledgeStop = resolve;
      });
      mockInvoke.mockImplementation((command) => {
        if (command === 'computer_use_execute_opa_task') return new Promise(() => {});
        if (command === 'computer_use_cancel_opa_task') return stopAcknowledgement;
        return Promise.resolve(undefined);
      });
      void useComputerUseStore.getState().executeOpaTask('Open Notes', { executionId });

      const exactStop = useComputerUseStore.getState().cancelOpaTask(executionId);
      const ambientStop = useComputerUseStore.getState().cancelOpaTask();
      expect(
        mockInvoke.mock.calls.filter(([command]) => command === 'computer_use_cancel_opa_task'),
      ).toHaveLength(1);

      acknowledgeStop(true);
      await expect(Promise.all([exactStop, ambientStop])).resolves.toEqual([true, true]);
    });

    it('rejects a malformed truthy native Stop acknowledgement and retains the owner', async () => {
      const executionId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
      mockInvoke.mockImplementation((command) => {
        if (command === 'computer_use_execute_opa_task') return new Promise(() => {});
        if (command === 'computer_use_cancel_opa_task') return Promise.resolve('false');
        return Promise.resolve(undefined);
      });
      void useComputerUseStore.getState().executeOpaTask('Open Notes', { executionId });

      await expect(useComputerUseStore.getState().cancelOpaTask(executionId)).resolves.toBe(false);
      expect(useComputerUseStore.getState().cancellingOpaExecutionId).toBe(executionId);
      expect(useComputerUseStore.getState().error).toContain('did not acknowledge cancellation');

      mockInvoke.mockResolvedValueOnce(true);
      await expect(useComputerUseStore.getState().cancelOpaTask(executionId)).resolves.toBe(true);
    });

    it('rejects a malformed native completion reason instead of leaking it into UI state', async () => {
      mockInvoke.mockResolvedValueOnce({ success: false, reason: 'timeout' });

      await expect(useComputerUseStore.getState().executeOpaTask('Open Notes')).resolves.toBeNull();
      expect(useComputerUseStore.getState().lastOpaResult).toBeNull();
      expect(useComputerUseStore.getState().error).toContain('invalid completion reason');
    });

    it.each([
      { success: true, reason: { type: 'timeout' } },
      { success: false, reason: { type: 'task_complete' } },
    ])('rejects an inconsistent native success/reason pair %#', async (nativeResult) => {
      mockInvoke.mockResolvedValueOnce(nativeResult);

      await expect(useComputerUseStore.getState().executeOpaTask('Open Notes')).resolves.toBeNull();
      expect(useComputerUseStore.getState().lastOpaResult).toBeNull();
      expect(useComputerUseStore.getState().error).toContain('inconsistent task result');
    });
  });
});
