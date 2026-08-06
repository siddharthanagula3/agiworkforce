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
    // loading:true on the first synchronous render. Previously this asserted
    // signedIn:false, and the options page acted on it — showing an actionable
    // "Sign in" row to users who were already signed in until the token
    // round-trip returned.
    expect(render).toHaveBeenLastCalledWith({
      signedIn: false,
      unavailable: false,
      loading: true,
    });

    resolveToken('account-token');
    await refresh;
    expect(render).toHaveBeenLastCalledWith({
      signedIn: true,
      unavailable: false,
      loading: false,
    });
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
    expect(render).toHaveBeenLastCalledWith({
      signedIn: false,
      unavailable: true,
      loading: false,
    });
  });
});
