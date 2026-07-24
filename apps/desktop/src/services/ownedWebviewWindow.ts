type Unlisten = () => void;

interface OwnedWebviewWindow {
  once<T>(event: string, handler: (event: { payload: T }) => void): Promise<Unlisten>;
  close(): Promise<void>;
}

const DEFAULT_WINDOW_CREATION_TIMEOUT_MS = 15_000;

export const OWNED_CLOUD_WINDOW_LABELS = {
  signIn: 'cloud-sign-in',
  account: 'cloud-account',
  billing: 'cloud-billing',
  connectorInstall: 'cloud-connector-install',
} as const;

/**
 * Close every child window that can display or mutate authenticated Cloud
 * account state. Logout calls this before credential revocation so a Stripe,
 * connector, or account window cannot remain open across account boundaries.
 */
export async function closeOwnedCloudWebviewWindows(): Promise<void> {
  const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow');
  await Promise.allSettled(
    Object.values(OWNED_CLOUD_WINDOW_LABELS).map(async (label) => {
      const ownedWindow = await WebviewWindow.getByLabel(label);
      if (ownedWindow) await ownedWindow.close();
    }),
  );
}

/**
 * Wait for a Tauri-owned webview window to become usable.
 *
 * Tauri normally emits either `tauri://created` or `tauri://error`, but a
 * platform webview failure can otherwise strand the caller in a permanent
 * loading state. All account, billing, connector, and sign-in windows share
 * this bounded mechanic so their feature services only own product policy.
 */
export async function waitForOwnedWebviewWindow(
  ownedWindow: OwnedWebviewWindow,
  failureLabel: string,
  timeoutMs = DEFAULT_WINDOW_CREATION_TIMEOUT_MS,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    let settled = false;
    let unlisteners: Unlisten[] = [];

    const cleanup = () => {
      globalThis.clearTimeout(timeoutId);
      for (const unlisten of unlisteners) unlisten();
      unlisteners = [];
    };

    const settle = (next: () => void) => {
      if (settled) return;
      settled = true;
      cleanup();
      next();
    };

    const timeoutId = globalThis.setTimeout(() => {
      settle(() => {
        void ownedWindow.close().catch(() => undefined);
        reject(new Error(`${failureLabel}: the native window did not become ready in time.`));
      });
    }, timeoutMs);

    const registrations = [
      ownedWindow.once<unknown>('tauri://created', () => settle(resolve)),
      ownedWindow.once<unknown>('tauri://error', (event) =>
        settle(() => {
          void ownedWindow.close().catch(() => undefined);
          reject(
            new Error(
              `${failureLabel}: ${
                typeof event.payload === 'string' ? event.payload : 'unknown native window error'
              }`,
            ),
          );
        }),
      ),
    ];

    void Promise.allSettled(registrations)
      .then((results) => {
        const registeredUnlisteners = results.flatMap((result) =>
          result.status === 'fulfilled' ? [result.value] : [],
        );
        if (settled) {
          for (const unlisten of registeredUnlisteners) unlisten();
          return;
        }
        const failedRegistration = results.find(
          (result): result is PromiseRejectedResult => result.status === 'rejected',
        );
        if (failedRegistration) {
          unlisteners = registeredUnlisteners;
          settle(() => {
            void ownedWindow.close().catch(() => undefined);
            reject(
              new Error(
                `${failureLabel}: ${
                  failedRegistration.reason instanceof Error
                    ? failedRegistration.reason.message
                    : 'could not register native window events'
                }`,
              ),
            );
          });
          return;
        }
        unlisteners = registeredUnlisteners;
      })
      .catch(() => undefined);
  });
}
