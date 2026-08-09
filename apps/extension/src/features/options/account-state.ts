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
/**
 * How long `getToken()` may take before the row degrades to "unavailable".
 *
 * A rejection is not the only way Clerk fails. When its host blackholes —
 * captive portal, corporate proxy, DNS sinkhole, or the non-routable
 * `clerk-ci.invalid` this repo builds CI fixtures against — ClerkJS RETRIES
 * rather than rejecting, so the promise simply never settles.
 */
const ACCOUNT_LOOKUP_TIMEOUT_MS = 8000;

export function beginOptionsAccountRefresh(
  getToken: () => Promise<string | null>,
  render: (state: OptionsAccountState) => void,
  onUnavailable: () => void = () => undefined,
  timeoutMs: number = ACCOUNT_LOOKUP_TIMEOUT_MS,
): Promise<void> {
  render({ signedIn: false, unavailable: false, loading: true });

  let settled = false;
  const degrade = (): void => {
    if (settled) return;
    settled = true;
    onUnavailable();
    render({ signedIn: false, unavailable: true, loading: false });
  };

  let timer: ReturnType<typeof setTimeout> | undefined;
  // A promise that never settles used to leave the row on "Checking your
  // account…" FOREVER, with no Sign in button — the exact blank-account state
  // the contract above forbids, reached through the one path it did not
  // consider. Only rejection was handled; a hang was not.
  const timeout = new Promise<void>((resolve) => {
    timer = setTimeout(() => {
      degrade();
      resolve();
    }, timeoutMs);
  });

  const lookup = getToken().then(
    (token) => {
      if (settled) return;
      settled = true;
      render({ signedIn: Boolean(token), unavailable: false, loading: false });
    },
    () => degrade(),
  );

  return Promise.race([lookup, timeout]).finally(() => {
    if (timer !== undefined) clearTimeout(timer);
  });
}
