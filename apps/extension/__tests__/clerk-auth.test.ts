import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const createClerkClient = vi.hoisted(() => vi.fn());

vi.mock('@clerk/chrome-extension/client', () => ({ createClerkClient }));

const ORIGINAL_ENV = { ...process.env };

async function importClerkAuth() {
  return import('../src/features/cloud-bridge/clerkAuth');
}

describe('Clerk Chrome Extension auth', () => {
  beforeEach(() => {
    vi.resetModules();
    createClerkClient.mockReset();
    process.env = { ...ORIGINAL_ENV };
    delete process.env['CLERK_PUBLISHABLE_KEY'];
    delete process.env['CLERK_SYNC_HOST'];
    vi.stubGlobal('chrome', {
      runtime: {
        getURL: vi.fn((path: string) => `chrome-extension://stable-extension/${path}`),
      },
    });
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    vi.unstubAllGlobals();
  });

  it('does not load the SDK when the publishable key is absent', async () => {
    const auth = await importClerkAuth();

    await expect(auth.getFreshClerkToken()).resolves.toBeNull();
    expect(auth.isClerkExtensionAuthConfigured()).toBe(false);
    expect(createClerkClient).not.toHaveBeenCalled();
  });

  it('fails closed when a key is baked in without the required Sync Host', async () => {
    process.env['CLERK_PUBLISHABLE_KEY'] = 'pk_test_repo_contract';
    const auth = await importClerkAuth();

    expect(auth.isClerkExtensionAuthConfigured()).toBe(false);
    await expect(auth.openClerkSignIn()).rejects.toThrow(/CLERK_SYNC_HOST is required/i);
    expect(createClerkClient).not.toHaveBeenCalled();
  });

  it('loads a foreground client with the validated Sync Host and extension redirects', async () => {
    process.env['CLERK_PUBLISHABLE_KEY'] = 'pk_test_repo_contract';
    process.env['CLERK_SYNC_HOST'] = 'https://clerk.agiworkforce.com';
    const getToken = vi.fn().mockResolvedValue('fresh-token');
    const load = vi.fn().mockResolvedValue(undefined);
    createClerkClient.mockReturnValue({
      load,
      session: { getToken },
      addListener: vi.fn(),
      openSignIn: vi.fn(),
      signOut: vi.fn(),
    });

    const auth = await importClerkAuth();

    await expect(auth.getFreshClerkToken()).resolves.toBe('fresh-token');
    expect(createClerkClient).toHaveBeenCalledWith({
      publishableKey: 'pk_test_repo_contract',
      syncHost: 'https://clerk.agiworkforce.com',
    });
    expect(load).toHaveBeenCalledWith(
      expect.objectContaining({
        afterSignOutUrl: 'chrome-extension://stable-extension/src/side_panel.html',
        allowedRedirectProtocols: ['chrome-extension:'],
      }),
    );
  });

  it('rejects a Sync Host that is not an origin-only HTTPS URL', async () => {
    process.env['CLERK_PUBLISHABLE_KEY'] = 'pk_live_repo_contract';
    process.env['CLERK_SYNC_HOST'] = 'https://clerk.agiworkforce.com/untrusted/path';

    const auth = await importClerkAuth();

    expect(auth.isClerkExtensionAuthConfigured()).toBe(false);
    await expect(auth.openClerkSignIn()).rejects.toThrow(/origin only/i);
    expect(createClerkClient).not.toHaveBeenCalled();
  });

  it('hides auth methods that Clerk does not support inside extension side panels', async () => {
    process.env['CLERK_PUBLISHABLE_KEY'] = 'pk_test_repo_contract';
    process.env['CLERK_SYNC_HOST'] = 'https://clerk.agiworkforce.com';
    const openSignIn = vi.fn();
    createClerkClient.mockReturnValue({
      load: vi.fn().mockResolvedValue(undefined),
      session: null,
      addListener: vi.fn(),
      openSignIn,
      signOut: vi.fn(),
    });

    const auth = await importClerkAuth();
    await auth.openClerkSignIn();

    expect(openSignIn).toHaveBeenCalledWith({
      appearance: {
        elements: {
          dividerRow: { display: 'none' },
          socialButtonsRoot: { display: 'none' },
        },
      },
    });
  });

  it('uses the background service-worker client so tokens remain fresh', async () => {
    process.env['CLERK_PUBLISHABLE_KEY'] = 'pk_test_repo_contract';
    process.env['CLERK_SYNC_HOST'] = 'http://localhost';
    vi.stubGlobal('document', undefined);
    const getToken = vi.fn().mockResolvedValue('background-token');
    createClerkClient.mockResolvedValue({ session: { getToken } });

    const auth = await importClerkAuth();

    await expect(auth.getFreshClerkToken()).resolves.toBe('background-token');
    expect(createClerkClient).toHaveBeenCalledWith({
      publishableKey: 'pk_test_repo_contract',
      syncHost: 'http://localhost',
      background: true,
    });
  });
});
