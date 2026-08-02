import { describe, expect, it, vi } from 'vitest';
import { beginOptionsAccountRefresh } from '../src/features/options/account-state';

describe('options account state', () => {
  it('renders browser-local settings before a remote account lookup settles', async () => {
    let resolveToken!: (token: string | null) => void;
    const token = new Promise<string | null>((resolve) => {
      resolveToken = resolve;
    });
    const render = vi.fn();

    const refresh = beginOptionsAccountRefresh(() => token, render);

    expect(render).toHaveBeenCalledOnce();
    expect(render).toHaveBeenLastCalledWith({ signedIn: false, unavailable: false });

    resolveToken('account-token');
    await refresh;
    expect(render).toHaveBeenLastCalledWith({ signedIn: true, unavailable: false });
  });

  it('keeps the page signed out and visible when the account service is unavailable', async () => {
    const render = vi.fn();
    const onUnavailable = vi.fn();

    await beginOptionsAccountRefresh(
      () => Promise.reject(new Error('network unavailable')),
      render,
      onUnavailable,
    );

    expect(onUnavailable).toHaveBeenCalledOnce();
    expect(render).toHaveBeenLastCalledWith({ signedIn: false, unavailable: true });
  });
});
