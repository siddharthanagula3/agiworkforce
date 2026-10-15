import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { BrowserPairingState } from '@agiworkforce/local-runtime-contract';
import { hostBridgeStub } from '@/test/host-bridge-stub';

type RuntimeClientModule = typeof import('../lib/runtime-client');

const readBrowserPairing = vi.fn();

vi.mock('../lib/runtime-client', async (importOriginal) => ({
  ...(await importOriginal<RuntimeClientModule>()),
  readBrowserPairing,
  installBrowserHost: vi.fn(),
  unpairBrowser: vi.fn(),
}));

const { BrowserPairingSection } = await import('../components/BrowserPairingSection');

const NOT_LISTENING: BrowserPairingState = {
  bridgePort: 47_811,
  bridgeListening: false,
  paired: false,
  extensionId: null,
  fingerprint: null,
  pairedAtMs: null,
  connected: false,
  hostInstalled: false,
  installedManifestPaths: [],
  pendingRequest: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  window.agiHost = hostBridgeStub();
});

describe('BrowserPairingSection', () => {
  it('says why the pairing bridge is not listening when the shell knows', async () => {
    readBrowserPairing.mockResolvedValue({
      ...NOT_LISTENING,
      unavailableReason:
        'Another app on this computer is already using the browser bridge on port 47811. Quit it, then reopen this app to pair a browser here.',
    });

    render(<BrowserPairingSection />);

    expect(
      await screen.findByText(/Another app on this computer is already using the browser bridge/),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Quit and reopen AGI Cloud/)).not.toBeInTheDocument();
  });

  it('falls back to the general line when the shell gave no reason', async () => {
    readBrowserPairing.mockResolvedValue(NOT_LISTENING);

    render(<BrowserPairingSection />);

    expect(
      await screen.findByText(/The local pairing bridge is not listening/),
    ).toBeInTheDocument();
  });

  // The code is what a person reads off the app and types into the extension.
  // A page that showed it could read it, and confirm a pairing by itself.
  it('says a pairing is waiting and where its code is, without showing a code', async () => {
    readBrowserPairing.mockResolvedValue({
      ...NOT_LISTENING,
      bridgeListening: true,
      pendingRequest: {
        requestId: 'request-1',
        extensionId: 'a'.repeat(32),
        expiresAtMs: Date.now() + 60_000,
        code: '123456',
      },
    });

    render(<BrowserPairingSection />);

    expect(
      await screen.findByText(/The code is in a dialog AGI Cloud opened on this Mac/),
    ).toBeInTheDocument();
    expect(screen.queryByText('123456')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Pairing code')).not.toBeInTheDocument();
  });
});
