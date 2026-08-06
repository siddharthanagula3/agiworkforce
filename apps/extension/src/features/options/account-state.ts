export interface OptionsAccountState {
  signedIn: boolean;
  unavailable: boolean;
  /**
   * True until `getToken()` settles. Without it the first synchronous render
   * asserted `signedIn: false`, so every already-signed-in user was shown a
   * "Sign in" row with a live button that then swapped to "Log out" — an
   * actionable control stating the opposite of the truth for the length of a
   * network round-trip.
   */
  loading: boolean;
}

/**
 * Render local options immediately, then refresh the remote account state.
 *
 * Clerk may be offline, rate limited, or temporarily misconfigured. None of
 * those conditions may hide browser-local permissions, allowlists, shortcuts,
 * or autofill settings behind a blank page.
 */
export function beginOptionsAccountRefresh(
  getToken: () => Promise<string | null>,
  render: (state: OptionsAccountState) => void,
  onUnavailable: () => void = () => undefined,
): Promise<void> {
  render({ signedIn: false, unavailable: false, loading: true });
  return getToken().then(
    (token) => render({ signedIn: Boolean(token), unavailable: false, loading: false }),
    () => {
      onUnavailable();
      render({ signedIn: false, unavailable: true, loading: false });
    },
  );
}
