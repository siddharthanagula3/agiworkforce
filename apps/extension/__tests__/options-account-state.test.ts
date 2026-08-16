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

  it('degrades to unavailable when the account lookup never settles', async () => {
    const render = vi.fn();
    const onUnavailable = vi.fn();

    await beginOptionsAccountRefresh(
      () => new Promise<string | null>(() => {}), // never resolves, never rejects
      render,
      onUnavailable,
      10,
    );

    expect(onUnavailable).toHaveBeenCalledOnce();
    expect(render).toHaveBeenLastCalledWith({
      signedIn: false,
      unavailable: true,
      loading: false,
    });
  });

  it('a slow-but-successful lookup still wins, and does not double-render', async () => {
    const render = vi.fn();
    const onUnavailable = vi.fn();

    await beginOptionsAccountRefresh(
      () => new Promise<string | null>((resolve) => setTimeout(() => resolve('token'), 5)),
      render,
      onUnavailable,
      200,
    );

    expect(onUnavailable).not.toHaveBeenCalled();
    expect(render).toHaveBeenLastCalledWith({
      signedIn: true,
      unavailable: false,
      loading: false,
    });
    expect(render).toHaveBeenCalledTimes(2);
  });
});
