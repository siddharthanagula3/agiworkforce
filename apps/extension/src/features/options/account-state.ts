export interface OptionsAccountState {
  signedIn: boolean;
  unavailable: boolean;
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
  render({ signedIn: false, unavailable: false });
  return getToken().then(
    (token) => render({ signedIn: Boolean(token), unavailable: false }),
    () => {
      onUnavailable();
      render({ signedIn: false, unavailable: true });
    },
  );
}
