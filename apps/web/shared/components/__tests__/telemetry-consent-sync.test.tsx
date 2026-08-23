import { render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  fetchPreferenceNamespace: vi.fn(),
  hasTelemetryConsent: vi.fn(),
  setTelemetryConsentCache: vi.fn(),
  useAuth: vi.fn(),
}));

vi.mock('@clerk/nextjs', () => ({ useAuth: mocks.useAuth }));

vi.mock('@/app/settings/_lib/preferences-client', () => ({
  fetchPreferenceNamespace: mocks.fetchPreferenceNamespace,
}));
vi.mock('@/lib/sentry-shared', () => ({
  hasTelemetryConsent: mocks.hasTelemetryConsent,
  setTelemetryConsentCache: mocks.setTelemetryConsentCache,
}));

import { TelemetryConsentSync } from '../TelemetryConsentSync';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.hasTelemetryConsent.mockReturnValue(true);
  mocks.fetchPreferenceNamespace.mockResolvedValue({});
  mocks.useAuth.mockReturnValue({ isLoaded: true, isSignedIn: true });
});

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
