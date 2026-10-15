import { beforeEach, describe, expect, it, vi } from 'vitest';

const invoke = vi.hoisted(() => vi.fn());

vi.mock('../lib/tauri-mock', async (importOriginal) => ({
  ...(await importOriginal<TauriMockModule>()),
  invoke,
}));

import useErrorStore from '../stores/ui';

type TauriMockModule = typeof import('../lib/tauri-mock');

describe('errorStore reportError', () => {
  beforeEach(() => {
    invoke.mockReset();
    invoke.mockResolvedValue(undefined);
    useErrorStore.setState({ errors: [], toasts: [] });
  });

  it('sends the report under the field names the native error log reads', async () => {
    useErrorStore.getState().addError({
      type: 'NETWORK_ERROR',
      severity: 'critical',
      message: 'Failed to connect',
      stack: 'at send (chat.ts:10)',
      context: { conversationId: 'c-1' },
    });
    const reported = useErrorStore.getState().errors[0]!;
    invoke.mockClear();

    await useErrorStore.getState().reportError(reported.id);

    expect(invoke).toHaveBeenCalledWith('error_report', {
      errorData: {
        error_type: 'NETWORK_ERROR',
        message: 'Failed to connect',
        stack_trace: 'at send (chat.ts:10)',
        context: { conversationId: 'c-1' },
        timestamp: reported.timestamp,
      },
    });
  });
});
