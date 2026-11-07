import { act, cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  fetchPreferenceNamespace: vi.fn(),
  hasTelemetryConsent: vi.fn(),
  setTelemetryConsentCache: vi.fn(),
  initializeSentryAfterConsent: vi.fn(),
  useAuth: vi.fn(),
  sdk: {
    loaded: true,
    user: { id: 'a' },
    session: { id: 'session-a', user: { id: 'a' }, getToken: async () => 'token-a' },
  },
}));

vi.mock('@clerk/nextjs', () => ({ useAuth: mocks.useAuth, useClerk: () => mocks.sdk }));

vi.mock('@/features/settings/services/privacy-preferences-client', async (original) => ({
  ...(await original<typeof import('@/features/settings/services/privacy-preferences-client')>()),
  readPrivacyPreferences: async () => ({
    stored: await mocks.fetchPreferenceNamespace(),
    version: 'v1',
  }),
}));
vi.mock('@/lib/sentry-shared', async (original) => ({
  ...(await original<typeof import('@/lib/sentry-shared')>()),
  hasTelemetryConsent: mocks.hasTelemetryConsent,
  setTelemetryConsentCache: mocks.setTelemetryConsentCache,
}));
vi.mock('@/lib/client/initialize-sentry-after-consent', () => ({
  initializeSentryAfterConsent: mocks.initializeSentryAfterConsent,
}));

import { observePreferenceOwner } from '@/app/settings/_lib/preferences-client';

import { TelemetryConsentSync } from '../TelemetryConsentSync';

beforeEach(() => {
  vi.clearAllMocks();
  observePreferenceOwner(null);
  mocks.sdk.loaded = true;
  mocks.sdk.user = { id: 'a' };
  mocks.sdk.session = { id: 'session-a', user: { id: 'a' }, getToken: async () => 'token-a' };
  mocks.hasTelemetryConsent.mockReturnValue(true);
  mocks.fetchPreferenceNamespace.mockResolvedValue({});
  mocks.useAuth.mockReturnValue({
    isLoaded: true,
    isSignedIn: true,
    userId: 'a',
    sessionId: 'session-a',
  });
});

afterEach(() => cleanup());

// A signed-out visitor has no account-side consent to mirror. Fetching anyway
// hit an authenticated endpoint that could only answer 401, on every public
// marketing page, and printed it to every anonymous visitor's console.
describe('signed-out visitors', () => {
  it('does not call the account endpoint when signed out', async () => {
    mocks.useAuth.mockReturnValue({ isLoaded: true, isSignedIn: false });

    render(<TelemetryConsentSync />);

    await Promise.resolve();
    expect(mocks.fetchPreferenceNamespace).not.toHaveBeenCalled();
    expect(mocks.setTelemetryConsentCache).not.toHaveBeenCalled();
  });

  it('waits for Clerk to load before deciding', async () => {
    mocks.useAuth.mockReturnValue({ isLoaded: false, isSignedIn: undefined });

    render(<TelemetryConsentSync />);

    await Promise.resolve();
    expect(mocks.fetchPreferenceNamespace).not.toHaveBeenCalled();
  });
});

// Consent lives in the synced namespace and in a localStorage mirror that
// Sentry reads. Only the Settings screen ever wrote the mirror, so turning
// telemetry off on one device did not reach a second until Settings was opened
// there.
describe('telemetry consent reaches a device that never opened Settings', () => {
  it('turns the mirror off when the account says off', async () => {
    mocks.fetchPreferenceNamespace.mockResolvedValue({ shareTelemetry: false });

    render(<TelemetryConsentSync />);

    await waitFor(() => expect(mocks.setTelemetryConsentCache).toHaveBeenCalledWith(false));
  });

  it('starts telemetry on the current page when a new device confirms opt-in', async () => {
    mocks.hasTelemetryConsent.mockReturnValue(false);
    mocks.fetchPreferenceNamespace.mockResolvedValue({ shareTelemetry: true });

    render(<TelemetryConsentSync />);

    await waitFor(() => expect(mocks.setTelemetryConsentCache).toHaveBeenCalledWith(true));
    await waitFor(() => expect(mocks.initializeSentryAfterConsent).toHaveBeenCalledTimes(1));
  });

  it('does not initialize telemetry twice when this device already has consent', async () => {
    mocks.fetchPreferenceNamespace.mockResolvedValue({ shareTelemetry: true });

    render(<TelemetryConsentSync />);

    await waitFor(() => expect(mocks.fetchPreferenceNamespace).toHaveBeenCalled());
    expect(mocks.initializeSentryAfterConsent).not.toHaveBeenCalled();
  });

  it('does not write when the mirror already agrees', async () => {
    mocks.hasTelemetryConsent.mockReturnValue(false);
    mocks.fetchPreferenceNamespace.mockResolvedValue({ shareTelemetry: false });

    render(<TelemetryConsentSync />);

    await waitFor(() => expect(mocks.fetchPreferenceNamespace).toHaveBeenCalled());
    expect(mocks.setTelemetryConsentCache).not.toHaveBeenCalled();
  });

  it('leaves the mirror alone when the account has no stored answer', async () => {
    mocks.fetchPreferenceNamespace.mockResolvedValue({});

    render(<TelemetryConsentSync />);

    await waitFor(() => expect(mocks.fetchPreferenceNamespace).toHaveBeenCalled());
    expect(mocks.setTelemetryConsentCache).not.toHaveBeenCalled();
  });

  it('ignores a non-boolean rather than coercing it', async () => {
    mocks.fetchPreferenceNamespace.mockResolvedValue({ shareTelemetry: 'yes' });

    render(<TelemetryConsentSync />);

    await waitFor(() => expect(mocks.fetchPreferenceNamespace).toHaveBeenCalled());
    expect(mocks.setTelemetryConsentCache).not.toHaveBeenCalled();
  });

  it('leaves this device untouched when the account cannot be read', async () => {
    // Signed out or offline. The mirror holds this device's last known answer;
    // guessing would be worse than being stale.
    mocks.fetchPreferenceNamespace.mockRejectedValue(new Error('offline'));

    render(<TelemetryConsentSync />);

    await waitFor(() => expect(mocks.fetchPreferenceNamespace).toHaveBeenCalled());
    expect(mocks.setTelemetryConsentCache).not.toHaveBeenCalled();
  });

  it('renders nothing', () => {
    const { container } = render(<TelemetryConsentSync />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('exact account and view ownership', () => {
  it('does not apply an old account response after replacement', async () => {
    let resolve!: (value: { shareTelemetry: boolean }) => void;
    mocks.fetchPreferenceNamespace.mockReturnValueOnce(
      new Promise((done) => {
        resolve = done;
      }),
    );
    const mounted = render(<TelemetryConsentSync />);
    mocks.sdk.user = { id: 'b' };
    mocks.sdk.session = { id: 'session-b', user: { id: 'b' }, getToken: async () => 'token-b' };
    mocks.useAuth.mockReturnValue({
      isLoaded: true,
      isSignedIn: true,
      userId: 'b',
      sessionId: 'session-b',
    });
    mocks.fetchPreferenceNamespace.mockResolvedValueOnce({});
    mounted.rerender(<TelemetryConsentSync />);
    await act(async () => resolve({ shareTelemetry: true }));
    expect(mocks.setTelemetryConsentCache).not.toHaveBeenCalled();
    expect(mocks.initializeSentryAfterConsent).not.toHaveBeenCalled();
    expect(mocks.fetchPreferenceNamespace).toHaveBeenCalledTimes(2);
  });

  it('does not initialize after the view retires between the mirror write and lazy import completion', async () => {
    mocks.hasTelemetryConsent.mockReturnValue(false);
    mocks.fetchPreferenceNamespace.mockResolvedValue({ shareTelemetry: true });
    let unmount: () => void = () => undefined;
    mocks.setTelemetryConsentCache.mockImplementationOnce(() => unmount());
    const mounted = render(<TelemetryConsentSync />);
    unmount = mounted.unmount;
    await waitFor(() => expect(mocks.setTelemetryConsentCache).toHaveBeenCalledWith(true));
    await act(async () => {
      await import('@/lib/client/initialize-sentry-after-consent');
    });
    expect(mocks.initializeSentryAfterConsent).not.toHaveBeenCalled();
  });

  it('does not apply an unmounted response', async () => {
    let resolve!: (value: { shareTelemetry: boolean }) => void;
    mocks.fetchPreferenceNamespace.mockReturnValueOnce(
      new Promise((done) => {
        resolve = done;
      }),
    );
    const mounted = render(<TelemetryConsentSync />);
    mounted.unmount();
    await act(async () => resolve({ shareTelemetry: false }));
    expect(mocks.setTelemetryConsentCache).not.toHaveBeenCalled();
  });
});
