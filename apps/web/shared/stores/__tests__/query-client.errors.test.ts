import { afterEach, describe, expect, it, vi } from 'vitest';
import { toast } from 'sonner';
import { queryClient } from '../query-client';

vi.mock('sonner', async (importOriginal) => ({
  ...(await importOriginal<typeof import('sonner')>()),
  toast: { error: vi.fn() },
}));

afterEach(() => {
  queryClient.clear();
  vi.clearAllMocks();
});

describe('shared mutation error notifications', () => {
  it.each([
    [
      new Error('HTTP 400: Free plan includes one project folder.'),
      'Free plan includes one project folder.',
    ],
    [new Error('SELECT token FROM private_credentials'), 'Something went wrong. Try again.'],
    [
      new Error('HTTP 503: upstream exploded 0xdeadbeef'),
      'Something went wrong on our side. Try again shortly.',
    ],
    [new Error('Choose a different workspace name.'), 'Choose a different workspace name.'],
    [Object.assign(new Error('missing row'), { code: 'PGRST116' }), 'Resource not found'],
  ])('shows a readable message for %s', async (error, expected) => {
    const mutation = queryClient.getMutationCache().build(queryClient, {
      mutationFn: async () => {
        throw error;
      },
      retry: false,
    });
    await expect(mutation.execute(undefined)).rejects.toBe(error);
    expect(toast.error).toHaveBeenCalledExactlyOnceWith(expected);
  });

  it('leaves feedback to a mutation that owns its error handler', async () => {
    const onError = vi.fn();
    const mutation = queryClient.getMutationCache().build(queryClient, {
      mutationFn: async () => {
        throw new Error('HTTP 400: rejected');
      },
      retry: false,
      onError,
    });
    await expect(mutation.execute(undefined)).rejects.toThrow();
    expect(onError).toHaveBeenCalledOnce();
    expect(toast.error).not.toHaveBeenCalled();
  });
});
