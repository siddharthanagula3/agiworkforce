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

  /**
   * The case that shipped broken. Rejection was handled; a lookup that NEVER
   * SETTLES was not, so the row stayed on "Checking your account…" with no Sign
   * in button — the blank-account state this module exists to prevent.
   *
   * It is not hypothetical: ClerkJS retries against a blackholed host instead of
   * rejecting, which is what `clerk-ci.invalid` produces in CI. The Chrome
   * extension smoke suite caught it as
   * `signed-out options account: unexpected controls
   *  {"signInVisible":false,"logOutVisible":false}` — and that suite had been
   * skipped for 18 days, so nothing reported it.
   */
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
    // loading + resolved, and nothing from the timeout arm.
    expect(render).toHaveBeenCalledTimes(2);
  });
});
