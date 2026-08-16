export interface OptionsAccountState {
  signedIn: boolean;
  unavailable: boolean;
  loading: boolean;
}

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
