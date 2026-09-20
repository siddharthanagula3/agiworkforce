import type { Page } from '@playwright/test';

// This fixture exercises our auth UI against a signed-out provider boundary.
// It cannot create a session or authorize an application API request.
export async function mockAuthProvider(
  page: Page,
  { loadDelayMs = 100 }: { loadDelayMs?: number } = {},
): Promise<void> {
  await page.route('**/clerk.browser.js*', (route) =>
    route.fulfill({ contentType: 'application/javascript', body: '' }),
  );
  await page.route('**/ui.browser.js*', (route) =>
    route.fulfill({ contentType: 'application/javascript', body: '' }),
  );
  await page.addInitScript((loadDelayMs) => {
    const signIn = {
      status: 'needs_first_factor',
      supportedFirstFactors: [{ strategy: 'password' }],
      async create({ identifier }: { identifier: string }) {
        if (identifier === 'password-user@example.invalid') return { error: null };
        return {
          error: {
            code: 'form_identifier_not_found',
            meta: { paramName: 'identifier' },
          },
        };
      },
    };
    const signUp = {
      async create() {
        return {
          error: {
            code: 'form_identifier_exists',
            meta: { paramName: 'email_address' },
          },
        };
      },
    };
    const signInSnapshot = { signIn, errors: {}, fetchStatus: 'idle' };
    const signUpSnapshot = { signUp, errors: {}, fetchStatus: 'idle' };
    const resources = { client: { sessions: [] }, session: null, user: null, organization: null };
    const listeners = new Set<(status: string) => void>();
    Object.defineProperty(window, '__internal_ClerkUICtor', { value: class {} });
    Object.defineProperty(window, 'Clerk', {
      configurable: true,
      value: {
        loaded: false,
        status: 'loading',
        async load() {
          await new Promise((resolve) => setTimeout(resolve, loadDelayMs));
          this.loaded = true;
          this.status = 'ready';
          for (const listener of listeners) listener('ready');
        },
        on(event: string, listener: (status: string) => void, options?: { notify?: boolean }) {
          if (event === 'status') {
            listeners.add(listener);
            if (options?.notify) queueMicrotask(() => listener(this.status));
          }
        },
        off(_event: string, listener: (status: string) => void) {
          listeners.delete(listener);
        },
        ...resources,
        __internal_lastEmittedResources: resources,
        addListener(listener: (value: typeof resources) => void) {
          listener(resources);
          return () => {};
        },
        __internal_state: {
          signInSignal: () => signInSnapshot,
          signUpSignal: () => signUpSnapshot,
          __internal_effect: () => () => {},
        },
      },
    });
  }, loadDelayMs);
}
